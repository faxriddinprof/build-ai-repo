# Pipeline & Data Flow — BuildWithAI Backend

Full data flow for every pipeline in the system. Read alongside `quickstart.md` for setup.

---

## 1. Real-Time Audio Pipeline (per call)

The hot path. Runs on every `audio_chunk` WebSocket message.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Phone Client                                         │
│  WS /ws/audio?token=<jwt>                                       │
│  {type:"audio_chunk", call_id, pcm_b64, sample_rate}           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ base64 decode → raw PCM bytes
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  ChunkBuffer  (utils/audio.py)                                  │
│  Accumulates PCM frames until buffer ≥ 1 second of audio        │
│  then flushes full buffer downstream                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ PCM frames (≥ 1 s)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  SpeakerTracker  (utils/audio.py)                               │
│  RMS energy threshold = 0.01                                    │
│  800 ms silence window → speaker turn change                    │
│  Alternates: agent ↔ customer label                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │ (frames, speaker_label)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STT Service  (services/stt_service.py)                         │
│  Model: faster-whisper large-v3                                 │
│  Device: CUDA, compute_type: float16  (~2 GB VRAM)             │
│  asyncio.to_thread → non-blocking event loop                    │
│  Returns: TranscribeResult {text, language, confidence}         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ text (Uzbek / Russian / mixed)
                            ▼
              ┌─────────────────────────┐
              │  text empty?            │
              │  confidence < 0.0?      │──YES──► drop silently
              └────────────┬────────────┘
                           │ NO
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  In-memory transcript store                                     │
│  _transcripts[call_id].append({speaker, text, ts})             │
└──┬────────────────────────────────────────────────────────────┬─┘
   │                                                            │
   │ WS outbound → {type:"transcript", speaker, text, ts}      │
   │ event_bus.publish("supervisor", transcript_chunk)          │
   │                                                            │
   ▼                                                            ▼
┌──────────────────────────┐          ┌───────────────────────────┐
│  ComplianceService       │          │  SentimentService         │
│  check_chunk(id, text)   │          │  analyze(id, text)        │
│                          │          │                           │
│  Stage 1: exact substr   │          │  Stage 1: keyword score   │
│  Stage 2: rapidfuzz      │          │  POSITIVE_WORDS - NEG →   │
│    fuzzy, threshold=0.85 │          │  positive / neutral /     │
│  Per-call ticked set     │          │  negative                 │
│  → no double-tick        │          │                           │
│                          │          │  Stage 2 (borderline):    │
│  On new tick:            │          │  LLM tone call (Qwen3)    │
│  WS: compliance_tick     │          │  Rate-limited: 1/5s/call  │
│  DB: compliance_status   │          │                           │
└──────────────────────────┘          │  Emits only on change     │
                                      │  WS: sentiment event      │
                                      └───────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Extraction Trigger                                             │
│  Condition A: elapsed ≥ EXTRACTION_WINDOW_SECONDS (60 s)        │
│  Condition B: inbound {type:"trigger_intake_extraction"}        │
│  → runs extraction_service.extract() — see §3                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ customer text (latest turn)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GuardrailService  (services/guardrail_service.py)              │
│  Tokenize text (preserves apostrophes: "to'lov" = 1 token)     │
│  Intersect tokens with BANK_TOPICS set                          │
│  Topics: loan / card / interest / payment / deposit /          │
│          account / currency (Uzbek + Russian + English)         │
│                                                                 │
│  is_bank_related() == False ────────────────────► DROP silently │
│  is_bank_related() == True  ──► continue to RAG + LLM          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ bank-related text confirmed
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  RAG Service  (services/rag_service.py)                         │
│  build_context(transcript_tail, top_k=5)                        │
│                                                                 │
│  1. embed(text) → LiteLLM aembedding                           │
│     Model: nomic-embed-text, 768-dim vector                     │
│                                                                 │
│  2. pgvector cosine search:                                     │
│     SELECT content FROM document_chunks                         │
│     ORDER BY embedding <=> query_vec                            │
│     LIMIT 5                                                     │
│                                                                 │
│  3. Format top-k → context string                              │
│     Cap at 1 500 tokens (~6 000 chars)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ rag_context string
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM Service  (services/llm_service.py)                         │
│  Model: qwen3:8b-q4_K_M via LiteLLM streaming                  │
│  (~5 GB VRAM)                                                   │
│                                                                 │
│  System prompt: system_uz.py (Uzbek-only instruction)           │
│  User prompt:   SUGGESTION_TEMPLATE.format(                     │
│                   customer_text=..., rag_context=...)           │
│                                                                 │
│  Stream tokens → _looks_uzbek() check on full response          │
│  Not Uzbek? → retry once                                        │
│  Still not Uzbek? → drop + structlog warning                    │
│                                                                 │
│  WS outbound (streamed):                                        │
│  {type:"suggestion", text:[bullets], trigger}                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Guardrail Filter Detail

```
Input text: "Kredit foizi qancha?"  (Uzbek: "What is the loan interest rate?")

Tokenizer (preserves apostrophes):
  ["Kredit", "foizi", "qancha"]

BANK_TOPICS intersection check:
  "kredit" ∈ BANK_TOPICS  ✓  →  is_bank_related = True

─────────────────────────────────────────────────────

Input text: "Bugun havo yaxshi"  (Uzbek: "The weather is nice today")

Tokens: ["Bugun", "havo", "yaxshi"]
  No intersection with BANK_TOPICS  →  is_bank_related = False
  Result: DROP, no LLM call, no suggestion

─────────────────────────────────────────────────────

BANK_TOPICS categories (sample):
  UZ: kredit, karta, foiz, to'lov, depozit, hisob, valyuta
  RU: кредит, карта, процент, платёж, депозит, счёт, валюта
  EN: loan, credit, card, interest, payment, deposit, account
```

---

## 3. RAG Retrieval Detail

```
Query: "Kredit foizi qancha?"
           │
           ▼
  ┌─────────────────────┐
  │  nomic-embed-text   │  LiteLLM aembedding endpoint
  │  → vector[768]      │  http://litellm:4000/v1/embeddings
  └──────────┬──────────┘
             │ [0.12, -0.34, 0.89, ..., 0.01]  (768 floats)
             ▼
  ┌────────────────────────────────────────────────────┐
  │  PostgreSQL + pgvector                             │
  │                                                    │
  │  SELECT dc.content,                                │
  │         dc.page_number,                            │
  │         d.filename,                                │
  │         1-(dc.embedding<=>:vec) AS similarity      │
  │  FROM document_chunks dc                           │
  │  JOIN documents d ON d.id = dc.document_id         │
  │  WHERE (:tag IS NULL OR d.tag = :tag)              │
  │  ORDER BY dc.embedding <=> CAST(:vec AS vector)    │
  │  LIMIT 5                                           │
  │                                                    │
  │  Index: ivfflat ON document_chunks(embedding)      │
  │         WITH (lists=100) USING vector_cosine_ops   │
  └──────────────────────────┬─────────────────────────┘
                             │ top-5 rows (content, similarity)
                             ▼
  ┌────────────────────────────────────────────────────┐
  │  Context formatting                                │
  │  For each chunk:                                   │
  │    "### [filename] (page N)\n{content}\n"          │
  │  Join all → context_str                            │
  │  len(context_str) > 6000? → truncate at 6000 chars │
  │  (≈ 1500 tokens)                                   │
  └────────────────────────────────────────────────────┘
```

---

## 4. LLM Suggestion & Language Assertion

```
Input: customer_text + rag_context
           │
           ▼
  ┌──────────────────────────────────────────────────┐
  │  messages = [                                    │
  │    {"role":"system", content: SYSTEM_UZ},        │
  │    {"role":"user",   content: SUGGESTION_TMPL}   │
  │  ]                                               │
  │  acompletion(model=..., messages=..., stream=True)│
  └──────────────────────┬───────────────────────────┘
                         │ token stream
                         ▼
  ┌──────────────────────────────────────────────────┐
  │  Collect all tokens → full_text                  │
  │  _looks_uzbek(full_text)?                        │
  │                                                  │
  │  Check 1: word-set overlap with UZ_WORDS ≥ 1?   │
  │  Check 2: Uzbek-specific chars: [oʻgʻ'] present? │
  │  Check 3: Cyrillic ratio ≥ 30%?                  │
  │  Any check True → Uzbek ✓                        │
  └──────────┬───────────────────────────────────────┘
             │
     ┌───────┴──────────┐
     │ Uzbek ✓          │ NOT Uzbek
     ▼                  ▼
  yield tokens    retry once
                       │
                  ┌────┴──────────────────────────┐
                  │ still not Uzbek?              │
                  │ log.warning("non_uzbek_drop") │
                  │ yield nothing                 │
                  └───────────────────────────────┘

WS outbound (per token as it arrives):
{type:"suggestion", text:"...", trigger:"objection"}
```

---

## 5. Compliance Check Detail

```
Config: app/data/compliance_phrases.json
  [
    {"id":"interest_rate_disclosure",  "pattern":"yillik foiz stavkasi"},
    {"id":"data_consent",              "pattern":"ma'lumotlaringiz"},
    {"id":"loan_term_disclosure",      "pattern":"kredit muddati"}
  ]

Per audio chunk arriving:

  text = "Kredit muddati 12 oydan 36 oygacha"
           │
           ▼
  For each phrase in loaded list:
  ┌─────────────────────────────────────────────────┐
  │  Stage 1: phrase.pattern in text? (exact substr) │
  │  "kredit muddati" in text.lower() → True ✓      │
  └─────────────────────────────────────────────────┘
           │ exact match found
           ▼
  ┌─────────────────────────────────────────────────┐
  │  Already ticked? _ticked_phrases[call_id]       │
  │  "loan_term_disclosure" already in set? → skip  │
  │  Not in set → add to set + emit                 │
  └─────────────────────────────────────────────────┘
           │ new tick
           ▼
  WS outbound: {type:"compliance_tick", phrase_id:"loan_term_disclosure"}
  DB: calls.compliance_status["loan_term_disclosure"] = "ok"

─────────────────────────────────────────────────────

  Fuzzy path (Stage 2, when exact miss):
  text = "kredit muddati"  vs  pattern = "kredit mudati" (typo)
  rapidfuzz.fuzz.partial_ratio(window, pattern) ≥ 85.0 → match
  → same tick + emit logic as exact match
```

---

## 6. Sentiment Analysis Flow

```
Per audio chunk (customer turns preferred):

  ┌───────────────────────────────────────────┐
  │  Stage 1: Keyword score                   │
  │  POSITIVE_WORDS = {yaxshi, ajoyib, ...}   │
  │  NEGATIVE_WORDS = {qimmat, yomon, ...}    │
  │  score = Σ pos_hits - Σ neg_hits           │
  │  score >  1 → "positive"                  │
  │  score < -1 → "negative"                  │
  │  else       → "neutral" (borderline)      │
  └──────────────────┬────────────────────────┘
                     │ borderline?
                     ▼
  ┌───────────────────────────────────────────┐
  │  Stage 2: LLM tone call                   │
  │  Rate-limit: 1 call per 5 s per call_id   │
  │  Qwen3-8B → {"tone": "positive|neutral|   │
  │               negative", "confidence":0.9}│
  └──────────────────┬────────────────────────┘
                     │ resolved sentiment
                     ▼
  ┌───────────────────────────────────────────┐
  │  Change detection                         │
  │  _last_sentiment[call_id] == new?         │
  │  Same → return None (no WS event)         │
  │  Changed → update + return new sentiment  │
  └───────────────────────────────────────────┘
                     │ changed
                     ▼
  WS outbound: {type:"sentiment", sentiment:"negative", confidence:0.9}
```

---

## 7. Customer Intake Extraction

```
Trigger conditions:
  A) elapsed_seconds ≥ EXTRACTION_WINDOW_SECONDS (default 60)
  B) inbound {type:"trigger_intake_extraction"}

Both paths call extraction_service.extract(call_id, transcript):

  transcript text
        │
        ▼
  ┌──────────────────────────────────────────────────────┐
  │  EXTRACTION_PROMPT.format(transcript=transcript)     │
  │  Qwen3-8B (non-streaming, JSON expected)             │
  │  Response stripped of ```json ... ``` code fences    │
  │  json.loads() → {name, passport, region, confidence} │
  └──────────────────────┬───────────────────────────────┘
                         │
              ┌──────────▼────────────────────────┐
              │  Confidence gating                │
              │  conf < 0.5  → all fields = null  │
              │  0.5 ≤ conf < 0.8 → name only     │
              │             passport = null        │
              │             region   = null        │
              │  conf ≥ 0.8  → all fields kept    │
              └──────────┬────────────────────────┘
                         │
              ┌──────────▼────────────────────────┐
              │  Passport validation               │
              │  regex: ^[A-Z]{2}\d{7}$            │
              │  "AA1234567" ✓ kept                │
              │  "aa123"     ✗ → null              │
              └──────────┬────────────────────────┘
                         │ Intake result
                         ▼
  WS outbound: {type:"intake_proposal",
                data:{name, passport, region, confidence}}
  event_bus.publish("supervisor", intake_proposal)
    └── supervisor_ws._scrub() removes "customer_passport" key

Agent reviews card in UI and confirms:
  PATCH /api/calls/:id/intake
  Body: {customer_name, customer_passport, customer_region}
  DB:   calls.{customer_name, customer_passport, customer_region,
               intake_confirmed_at} updated
```

---

## 8. Call End & Summary

```
inbound: {type:"end_call", call_id}
           │
           ▼
  ┌──────────────────────────────────────────────┐
  │  1. Flush ChunkBuffer remainder              │
  │     last PCM frames → STT → final transcript │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │  2. Collect compliance status                │
  │     compliance_service.get_status(call_id)   │
  │     → {"interest_rate_disclosure": "ok",     │
  │         "data_consent": "missed", ...}       │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │  3. Summary generation                       │
  │     summary_service.summarize(               │
  │       call_id, transcript, compliance_status)│
  │     SUMMARY_PROMPT → Qwen3-8B                │
  │     Returns: {outcome, objections,           │
  │               compliance_status, next_action}│
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │  4. DB commit (single transaction)           │
  │     calls.transcript       = full transcript │
  │     calls.ended_at         = now()           │
  │     calls.compliance_status = final dict     │
  │     calls.summary           = summary JSON   │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │  5. Cleanup                                  │
  │     del _transcripts[call_id]                │
  │     compliance_service.clear_call(call_id)   │
  │     sentiment_service.clear_call(call_id)    │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  event_bus.publish("supervisor", call_ended)
  WS outbound: {type:"summary_ready", summary:{...}}
  WebSocket connection closed
```

---

## 9. PDF Ingestion Pipeline

```
Admin uploads document:
POST /api/admin/documents
  multipart: file=<pdf>, tag=<optional_string>
           │
           ▼
  ┌──────────────────────────────────────────────┐
  │  Guards                                      │
  │  file.size > MAX_PDF_SIZE_MB (50 MB) → 400  │
  │  extension != .pdf                  → 400    │
  └──────────────────────┬───────────────────────┘
                         │ passes guards
                         ▼
  ┌──────────────────────────────────────────────┐
  │  DB: INSERT documents {                      │
  │    filename, tag, status="indexing",         │
  │    uploaded_by=user.id, created_at           │
  │  }                                           │
  │  File saved: UPLOAD_DIR/{document_id}.pdf    │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼ 202 returned immediately
  BackgroundTasks → ingest_service.ingest_pdf(doc_id, path)

─────────────────────────────────────────────────────

ingest_service.ingest_pdf(document_id, file_path):
           │
           ▼
  ┌──────────────────────────────────────────────┐
  │  fitz.open(file_path)  ← PyMuPDF             │
  │  For each page:                              │
  │    text = page.get_text("text")              │
  │  Concat all pages                            │
  │  No text detected → raise "OCR not supported"│
  │    → DB: status="error", error_message=...   │
  └──────────────────────┬───────────────────────┘
                         │ raw_text
                         ▼
  ┌──────────────────────────────────────────────┐
  │  _chunk_text(raw_text)                       │
  │  Split on sentence boundaries [.!?]\s+       │
  │  ~4 chars per token estimate                 │
  │  Target: 500 tokens per chunk                │
  │  Overlap: 50 tokens (sliding window)         │
  │  → list of chunk strings                     │
  └──────────────────────┬───────────────────────┘
                         │ chunks[]
                         ▼
  ┌──────────────────────────────────────────────┐
  │  Batch embedding (32 chunks per API call)    │
  │  rag_service.embed(chunk_text)               │
  │  → LiteLLM aembedding                       │
  │  → nomic-embed-text, 768-dim float vector    │
  └──────────────────────┬───────────────────────┘
                         │ (chunk, vector) pairs
                         ▼
  ┌──────────────────────────────────────────────┐
  │  DB: bulk INSERT document_chunks {           │
  │    document_id, content, page_number,        │
  │    chunk_index, embedding: vector(768)       │
  │  }                                           │
  │  DB: UPDATE documents SET                    │
  │    status="ready",                           │
  │    page_count=N, chunk_count=M               │
  └──────────────────────────────────────────────┘
```

---

## 10. Supervisor Fan-Out

```
Publisher side (audio_ws.py):

  Event sources                       Topic
  ─────────────────────────────────   ──────────
  call accepted + start_call msg   →  "supervisor"  {type:"call_started"}
  every transcript chunk           →  "supervisor"  {type:"transcript_chunk"}
  intake_proposal emitted          →  "supervisor"  {type:"intake_proposal"}
  end_call processed               →  "supervisor"  {type:"call_ended"}

event_bus.publish("supervisor", event_dict)
           │
           ▼
  ┌──────────────────────────────────────────────────────┐
  │  event_bus.py                                        │
  │  _subscribers["supervisor"] = [Queue_A, Queue_B, ...]│
  │  For each queue: queue.put_nowait(event_dict)        │
  │  (non-blocking, drops if consumer is behind)         │
  └──────────────────────────────────────────────────────┘
           │
           ▼  (per subscriber)
  ┌──────────────────────────────────────────────────────┐
  │  supervisor_ws.py  WS /ws/supervisor?token=          │
  │                                                      │
  │  1. JWT decode — role must be "supervisor"|"admin"   │
  │  2. q = event_bus.subscribe("supervisor")            │
  │  3. loop:                                            │
  │       event = await q.get()                          │
  │       scrubbed = _scrub(event)                       │
  │         removes "customer_passport" top-level key    │
  │       await ws.send_text(json.dumps(scrubbed))       │
  │  4. finally:                                         │
  │       event_bus.unsubscribe("supervisor", q)         │
  └──────────────────────────────────────────────────────┘

Multiple supervisor sessions → multiple Queue instances → full fan-out
Each queue is independent; slow consumer only affects itself.
```

---

## 11. Auth & JWT Flow

```
POST /api/auth/login
Body: {email, password}
           │
           ▼
  ┌──────────────────────────────────────────────┐
  │  SELECT * FROM users WHERE email=?           │
  │  passlib CryptContext bcrypt verify          │
  │  Wrong password → 401                        │
  └──────────────────────┬───────────────────────┘
                         │ user record
                         ▼
  ┌──────────────────────────────────────────────┐
  │  create_access_token:                        │
  │    algorithm: HS256                          │
  │    payload: {sub:user_id, role, type:access} │
  │    TTL: ACCESS_TOKEN_EXPIRE_HOURS (default 8)│
  │                                              │
  │  create_refresh_token:                       │
  │    payload: {sub:user_id, type:refresh}      │
  │    TTL: REFRESH_TOKEN_EXPIRE_DAYS (default30)│
  └──────────────────────┬───────────────────────┘
                         │
  Response: {access_token, refresh_token, role}

─────────────────────────────────────────────────────

Authenticated REST request:
  Authorization: Bearer <access_token>
           │
           ▼
  deps.get_current_user(token, db)
    auth_service.decode_token(token)
      → jose.jwt.decode(SECRET_KEY, algorithms=["HS256"])
      → {sub, role, exp}  OR  raise JWTError → 401
    SELECT users WHERE id=sub  → user object

  deps.require_role("admin")
    user.role not in ("admin",)  → raise 403

─────────────────────────────────────────────────────

WebSocket endpoints (/ws/audio, /ws/supervisor):
  ?token=<access_token> query param
  (browser WebSocket API cannot send headers)
           │
           ▼
  Same decode path as REST — 401 closes WS immediately
```

---

## 12. Latency Budget

```
Stage                                Target    Implementation
────────────────────────────────── ─────────  ──────────────────────────────
Audio capture (browser, 100ms chunks)  100ms  Fixed by chunk size
Network + WS decode                     50ms  LAN/localhost
ChunkBuffer accumulate                   0ms  Adds latency only if < 1s
STT faster-whisper large-v3           ≤500ms  CUDA float16, pre-warmed
Guardrail keyword check                 <1ms  Pure Python set intersection
RAG embed + pgvector search           ≤100ms  GPU embed, ivfflat index
LLM Qwen3-8B first token             ≤150ms  Q4_K_M quantized, pre-warmed
WS send + frontend render             ≤100ms  Token streaming
────────────────────────────────── ─────────  ──────────────────────────────
Total p95 target                    ≤1500ms

Both models (STT + Qwen3) pre-warmed in main.py startup lifespan hook:
  stt_service.warmup()  → dummy 1-second silence WAV
  llm_service.warmup()  → 1-token completion ("salom")
  rag_service.embed()   → "salom" → assert len(vec)==768
```

---

## 13. Security Invariants

```
Invariant                        Enforcement Point                    Test
──────────────────────────────── ──────────────────────────────────── ────────────────────────────────────
Non-bank text never hits LLM     guardrail_service.is_bank_related()  test_guardrail.py
                                 called before every acompletion
All LLM output must be Uzbek     _looks_uzbek() post-check            test_llm_service.py
                                 + single retry, else drop            (verifies retry on English output)
customer_passport never in       supervisor_ws._scrub() removes       test_supervisor_passport_scrub.py
supervisor WS payload            top-level key before ws.send_text
customer_passport never in logs  logging_config._scrub_pii()          test_pii_scrubber.py
                                 structlog processor strips key
JWT required on all endpoints    deps.get_current_user() + Bearer     test_auth.py
                                 scheme; WS uses ?token= param
Role enforced server-side        deps.require_role(*roles)            test_auth.py, test_admin_users.py
                                 raises 403 on mismatch
Scanned PDFs rejected            ingest_service checks text == ""     ingest_service.py (no test yet)
PDF size capped                  admin_documents router size guard     admin_documents.py (no test yet)
Compliance no double-tick        _ticked_phrases per-call set         test_compliance.py
```
