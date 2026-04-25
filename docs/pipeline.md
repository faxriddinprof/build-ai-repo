# Data Flow & Pipeline

## 1. Real-Time Audio Pipeline (per call)

```
Browser / Client
│
│  WS /ws/audio?token=<jwt>
│  inbound: {type:"audio_chunk", pcm_b64, sample_rate}
▼
audio_ws.py
│
├── base64.b64decode(pcm_b64)
│
├── ChunkBuffer (utils/audio.py)
│   Accumulates PCM until ≥ 1 s, then flushes
│
├── SpeakerTracker (utils/audio.py)
│   RMS threshold 0.01 + 800 ms silence → alternates agent / customer
│
├── stt_service.transcribe_chunk()
│   faster-whisper large-v3 (CUDA float16)
│   asyncio.to_thread → non-blocking
│   → TranscribeResult {text, language, confidence}
│
├── [text empty?] → drop silently
│
├── Append to _transcripts[call_id] in-memory
│
├── WS outbound: {type:"transcript", speaker, text, ts}
├── event_bus.publish("supervisor", transcript_chunk)
│
├── compliance_service.check_chunk(call_id, text)
│   Substring match + rapidfuzz fuzzy (threshold 0.85)
│   Per-call state; no double-tick
│   → newly ticked phrase IDs
│   WS outbound: {type:"compliance_tick", phrase_id}
│   DB: calls.compliance_status updated
│
├── sentiment_service.analyze(call_id, text)
│   Keyword score over last 3 turns:
│     positive_hits - negative_hits
│   Borderline → LLM tone call (Qwen3, ≤1 call / 5 s / call)
│   Emits only on change
│   WS outbound: {type:"sentiment", sentiment, confidence}
│
├── [auto extraction trigger]
│   elapsed ≥ EXTRACTION_WINDOW_SECONDS (60 s) → run extraction
│   OR inbound {type:"trigger_intake_extraction"} → run extraction
│
├── GuardrailService.is_bank_related(text)
│   Tokenize → intersect with BANK_TOPICS set (UZ + EN + RU)
│   False → drop silently, no LLM call
│
├── rag_service.build_context(text)
│   embed(text) → nomic-embed-text 768-dim vector
│   pgvector cosine search (document_chunks)
│   Top-5 chunks, capped at 1500 tokens
│   → context string
│
└── llm_service.get_suggestion(customer_text, rag_context)
    System prompt: Uzbek-only (system_uz.py)
    User prompt: SUGGESTION_TEMPLATE {customer_text, rag_context}
    Qwen3-8B via LiteLLM streaming
    Post-output language assertion (_looks_uzbek)
    → retry once if non-Uzbek, else drop + warn
    WS outbound: {type:"suggestion", text:[bullets], trigger}
```

## 2. Call End Flow

```
inbound: {type:"end_call"}
│
├── Flush remaining ChunkBuffer audio → STT
├── compliance_service.get_status(call_id) → final compliance dict
│
├── summary_service.summarize(call_id, transcript, compliance_status)
│   Qwen3-8B with SUMMARY_PROMPT
│   Returns: {outcome, objections, compliance_status, next_action}
│
├── DB commit: calls.{transcript, ended_at, compliance_status, summary}
├── compliance_service.clear_call(call_id)
├── sentiment_service.clear_call(call_id)
│
├── event_bus.publish("supervisor", call_ended)
└── WS outbound: {type:"summary_ready", summary}
    WebSocket closed
```

## 3. Extraction Flow (Customer Intake)

```
Trigger: elapsed ≥ 60 s OR {type:"trigger_intake_extraction"}
│
├── Build transcript_text from _transcripts[call_id]
│
├── extraction_service.extract(call_id, transcript_text)
│   EXTRACTION_PROMPT + transcript → Qwen3-8B
│   JSON parse + code-fence strip
│   Confidence thresholding:
│     < 0.5  → all fields null
│     0.5-0.8 → keep name only, null passport+region
│     ≥ 0.8  → all fields kept
│   Passport regex: ^[A-Z]{2}\d{7}$ → null if invalid
│
├── WS outbound: {type:"intake_proposal", data:{name, passport, region, confidence}}
└── event_bus.publish("supervisor", intake_proposal)
    (passport scrubbed at supervisor_ws.py _scrub layer)

Agent confirms via:
PATCH /api/calls/:id/intake {customer_name, customer_passport, customer_region}
→ DB: calls.{customer_name, customer_passport, customer_region, intake_confirmed_at}
```

## 4. PDF Ingestion Pipeline (Admin)

```
POST /api/admin/documents (multipart: file, tag?)
│
├── Size guard: > MAX_PDF_SIZE_MB (50 MB) → 400
├── Extension guard: not .pdf → 400
├── DB: documents {status="indexing"} inserted
├── File saved to UPLOAD_DIR/{document_id}.pdf
└── BackgroundTasks → ingest_service.ingest_pdf(document_id, path)

ingest_service.ingest_pdf()
│
├── fitz.open(path) → PyMuPDF
├── Per-page text extraction
│   No text layer → raise "OCR not supported" → status="error"
│
├── _chunk_text(): sentence-boundary split (~500 tokens, 50-token overlap)
│
├── Batch embed (32 chunks at a time)
│   rag_service.embed(chunk_text)
│   → nomic-embed-text 768-dim vector via LiteLLM
│
├── DB: document_chunks bulk insert
└── DB: documents {status="ready", page_count, chunk_count}

Retrieval (during suggestion):
rag_service.search(query, top_k=5, tag_filter=None)
│
├── embed(query) → 768-dim vector
└── SELECT ... FROM document_chunks
    ORDER BY embedding <=> query_vec   (pgvector cosine)
    LIMIT top_k
```

## 5. Supervisor Fan-out

```
audio_ws.py
│
├── event_bus.publish("supervisor", event)
│   Events: call_started, transcript_chunk, intake_proposal, call_ended
│
▼
event_bus.py  (_subscribers["supervisor"] list of asyncio.Queue)
│
└── For each subscriber queue → queue.put_nowait(event)

supervisor_ws.py (WS /ws/supervisor?token=)
│
├── JWT auth: role must be supervisor or admin
├── q = event_bus.subscribe("supervisor")
├── loop: event = await q.get()
│         _scrub(event) → removes customer_passport (top-level key)
│         WS send JSON
└── finally: event_bus.unsubscribe("supervisor", q)
```

## 6. Auth Flow

```
POST /api/auth/login {email, password}
│
├── SELECT users WHERE email=...
├── passlib bcrypt verify_password
├── create_access_token (HS256, 8 h TTL)
│   payload: {sub: user_id, role, type:"access", exp}
├── create_refresh_token (HS256, 30 d TTL)
└── → {access_token, refresh_token, role}

Subsequent requests:
Authorization: Bearer <token>
│
├── deps.get_current_user() → decode_token → SELECT users
└── deps.require_role("admin") → 403 if role mismatch

WS endpoints:
?token=<jwt> query param (browser WS can't send headers)
```

## 7. Latency Budget

```
audio capture (browser)          100 ms
STT (faster-whisper large-v3)    ≤ 500 ms
guardrail + RAG embed+search     ≤ 150 ms
LLM first token (Qwen3-8B Q4)   ≤ 150 ms
WS send + render                 ≤ 100 ms
─────────────────────────────────────────
Total p95 target                 ≤ 1 500 ms
```

Both models pre-warmed in `main.py` startup hook (dummy inference calls) to eliminate
cold-start on the first real call.

## 8. Security Invariants

| Invariant | Enforcement point |
|-----------|-------------------|
| Non-bank text never hits LLM | `guardrail_service.is_bank_related()` before every LLM call |
| All LLM output must be Uzbek | `_looks_uzbek()` post-check + single retry; drop on second failure |
| `customer_passport` never in supervisor WS | `supervisor_ws._scrub()` strips top-level key before send |
| `customer_passport` never in logs | `logging_config._scrub_pii()` structlog processor |
| JWT required everywhere | `deps.get_current_user()` + `oauth2_scheme` |
| Roles enforced server-side | `deps.require_role(*roles)` returns 403 on mismatch |
