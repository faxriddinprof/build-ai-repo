# Pipeline & Data Flow — BuildWithAI Backend

Full data flow for every pipeline in the system. Read alongside `quickstart.md` for setup.

---

## 1. Real-Time Audio Pipeline (per call)

Two transports share the same AI logic via `services/call_pipeline.py`.

```
WebRTC path                            REST fallback
──────────────────────────────────     ─────────────────────────────────
WS /ws/signaling (SDP/ICE only)        POST /api/transcribe-chunk
aiortc RTCPeerConnection               multipart: audio + call_id + final?
  on track: AudioFrame recv loop       pydub decode → 16kHz mono int16
  av.AudioResampler → 16kHz int16      ChunkBuffer (≥1s) flush
  ChunkBuffer (≥1s) flush              events returned in JSON body
  events sent via DataChannel
                │                              │
                └──────────────┬───────────────┘
                               ▼
              services/call_pipeline.process_audio_chunk()
                               │
          ┌────────────────────┼────────────────────────┐
          ▼                    ▼                        ▼
  stt_service           compliance_service        sentiment_service
  faster-whisper        check_chunk()             analyze()
  asyncio.to_thread     rapidfuzz 0.85            keyword+LLM
  → {text, conf}        → compliance_tick         → sentiment event
                        → DB compliance_status    (change-only)
          │
          ▼  text non-empty?
          │  yes → Call.transcript append (DB, per chunk)
          │        event_bus.publish("supervisor", transcript)
          │
          ▼  elapsed ≥ 60s or trigger_intake_extraction?
          │  yes → extraction_service.extract() → intake_proposal
          │
          ▼
  guardrail_service.is_bank_related()
  False → DROP (no LLM call)
  True  → continue
          │
          ▼
  rag_service.build_context()   ← hybrid retrieval (see §3)
          │
          ▼
  llm_service.get_suggestion()  streaming
  Qwen3-8B Q4 → _looks_uzbek() check → retry once if not Uzbek
          │
          ▼
  suggestion event → transport (DataChannel or HTTP body)
  DB: SuggestionLog INSERT (one row per emission)
```

---

## 2. Guardrail Filter

```
Input: "Kredit foizi qancha?"
Tokens: ["kredit", "foizi", "qancha"]
"kredit" ∈ BANK_TOPICS  ✓  →  is_bank_related = True

Input: "Bugun havo yaxshi"
Tokens: ["bugun", "havo", "yaxshi"]
No intersection  →  is_bank_related = False  →  DROP, no LLM call

BANK_TOPICS (sample):
  UZ: kredit, karta, foiz, to'lov, depozit, hisob, valyuta
  RU: кредит, карта, процент, платёж, депозит, счёт, валюта
  EN: loan, credit, card, interest, payment, deposit, account
```

---

## 3. Hybrid RAG Retrieval

```
Query text
    │
    ├── bge-m3 embed (LiteLLM) → vector[1024]
    │     └── pgvector cosine search → top-RAG_DENSE_TOP_K hits
    │
    └── BM25s tokenize → disk index → top-RAG_SPARSE_TOP_K hits
              │
              ▼
    Reciprocal Rank Fusion: score = Σ 1/(k + rank),  k=60
              │
              ▼
    Top-RAG_FINAL_TOP_K chunks → context string (≤6000 chars)
```

BM25 index auto-rebuilds after every PDF ingest or delete. Loaded from
`uploads/bm25_index/` at startup, or rebuilt from DB if missing.

---

## 4. LLM Suggestion & Language Assertion

```
messages → acompletion(stream=True) → token stream
                   │
         Collect all tokens → full_text
         _looks_uzbek(full_text)?
           Check 1: word overlap with UZ_WORDS ≥ 1
           Check 2: Uzbek-specific chars [oʻgʻ'] present
           Check 3: Cyrillic ratio ≥ 30%
           Any True → Uzbek ✓ → yield tokens
           All False → retry once → still not Uzbek → drop + log.warning
```

---

## 5. Compliance Check

```
Per audio chunk:
  Stage 1: exact substring match in text.lower()
  Stage 2: rapidfuzz.fuzz.partial_ratio(window, pattern) ≥ 85.0

First match per call_id per phrase → emit compliance_tick + DB update
Already ticked → skip (per-call _ticked_phrases set)
```

---

## 6. Sentiment Analysis

```
Per chunk:
  Stage 1: keyword score = Σ pos_hits - Σ neg_hits
    > 1  → "positive"
    < -1 → "negative"
    else → borderline → Stage 2

  Stage 2: LLM tone call (rate-limited: 1/5s/call_id)
    → {tone, confidence}

  Change detection: emit only when sentiment changes from previous
```

---

## 7. Customer Intake Extraction

```
Trigger: elapsed ≥ 60s  OR  DataChannel/REST trigger_intake_extraction
  │
  ▼
extraction_service.extract(call_id, transcript)
  EXTRACTION_PROMPT → Qwen3-8B (non-streaming, JSON)
  json.loads() → {name, passport, region, confidence}
  │
  Confidence gating:
    conf < 0.5   → all fields null
    0.5 ≤ c < 0.8 → name only, passport/region null
    conf ≥ 0.8   → all fields kept
  │
  Passport validation: ^[A-Z]{2}\d{7}$
  │
  intake_proposal event → transport
  event_bus.publish("supervisor", ...) → _scrub() removes customer_passport
```

---

## 8. Call End & Summary

```
Trigger: DataChannel end_call  OR  REST final=true  OR  POST /api/calls/:id/end
  │
  ▼
call_pipeline.finalize_call(call_id)
  1. summary_service.summarize(call_id, transcript, compliance_status)
     SUMMARY_PROMPT → Qwen3-8B
     → {outcome, objections, compliance_status, next_action}
  2. DB commit: calls.summary, calls.ended_at, calls.compliance_status
  3. Cleanup: _call_state.pop(call_id), compliance/sentiment clear_call()
  4. Return summary_ready event
```

---

## 9. PDF Ingestion Pipeline

```
POST /api/admin/documents (multipart: file, tag)
  Guards: size > 50 MB → 400 | extension != .pdf → 400
  DB: INSERT documents {status="indexing"}
  Save: UPLOAD_DIR/{document_id}.pdf
  202 → BackgroundTasks → ingest_service.ingest_pdf()
          │
          ▼
  fitz.open() → extract text per page
  No text? → status="error" (OCR not supported)
          │
  _chunk_text(): ~500 token chunks, 50 token overlap
          │
  Batch embed: rag_service.embed() → bge-m3, 1024-dim
          │
  DB: bulk INSERT document_chunks {content, page_number, embedding}
  DB: UPDATE documents {status="ready", page_count, chunk_count}
  bm25_service.rebuild_from_db()  ← sparse index refresh
```

---

## 10. Supervisor Fan-Out

```
call_pipeline.py publishes to event_bus on:
  start_call msg     → {type:"call_started"}
  each transcript    → {type:"transcript_chunk"}
  intake_proposal    → {type:"intake_proposal"}
  finalize_call      → {type:"call_ended"}

event_bus.publish("supervisor", event_dict)
  → put_nowait into each subscriber Queue

supervisor_ws.py WS /ws/supervisor?token= [supervisor|admin]
  q = event_bus.subscribe("supervisor")
  loop: event = await q.get()
        scrubbed = _scrub(event)   ← removes customer_passport
        await ws.send_text(json.dumps(scrubbed))
  finally: event_bus.unsubscribe("supervisor", q)
```

---

## 11. Auth & JWT Flow

```
POST /api/auth/login {email, password}
  bcrypt verify → create_access_token (HS256, 8h) + refresh (30d)
  → {access_token, refresh_token, role}

REST: Authorization: Bearer <token>
  deps.get_current_user() → jose.jwt.decode → user object
  deps.require_role(*roles) → 403 on mismatch

WebSocket: ?token=<jwt>  (browser cannot set WS headers)
  Same decode path — 4001 close code on auth failure
```

---

## 12. Latency Budget

```
Stage                                Target
───────────────────────────────────  ──────
Audio capture + network              ~150ms
ChunkBuffer accumulate (≥1s)          ~0ms  (add latency only if short)
STT faster-whisper (CUDA float16)    ≤500ms
Guardrail keyword check               <1ms
RAG embed + hybrid search           ≤100ms
LLM Qwen3-8B first token            ≤150ms
Event delivery (DataChannel/HTTP)   ≤100ms
───────────────────────────────────  ──────
Total p95 target                    ≤1500ms
```

---

## 13. Security Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Non-bank text never hits LLM | `guardrail_service.is_bank_related()` before every acompletion |
| All LLM output must be Uzbek | `_looks_uzbek()` + single retry, else drop |
| `customer_passport` never in supervisor WS | `supervisor_ws._scrub()` removes key |
| `customer_passport` never in logs | `logging_config._scrub_pii()` structlog processor |
| JWT required on all endpoints | `deps.get_current_user()` + Bearer / `?token=` |
| Role enforced server-side | `deps.require_role(*roles)` → 403 |
| Compliance no double-tick | `_ticked_phrases[call_id]` set per call |
