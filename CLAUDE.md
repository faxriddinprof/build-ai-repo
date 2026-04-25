# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Real-time AI sales copilot for bank call center agents in Uzbekistan. Listens to calls, transcribes Uzbek/Russian speech via faster-whisper, detects objections, and surfaces Uzbek-language suggestions in ≤1.5 s — fully on-premise (RTX 5070 Ti, no external API calls).

Three roles: `agent`, `supervisor`, `admin`. Single bank instance, JWT auth.

**Current status:** Backend Phases 0–4 complete + Hybrid RAG upgrade done. 68/68 tests passing. Frontend not started.

## Architecture

```
Browser/Agent
  │  WS /ws/audio?token=<jwt>
  ▼
audio_ws.py
  ├── ChunkBuffer (≥1 s PCM) → stt_service (faster-whisper)
  ├── compliance_service (rapidfuzz keyword match)
  ├── sentiment_service (keyword score + LLM tone)
  ├── extraction_service (LLM → JSON intake, auto at 60 s)
  ├── guardrail_service (BANK_TOPICS keyword filter)
  ├── rag_service (BGE-M3 dense + BM25s sparse → RRF → top-5)
  └── llm_service (Qwen3-8B via LiteLLM, streaming)
        └── event_bus → WS /ws/supervisor?token=<jwt>

Admin
  POST /api/admin/documents
    └── ingest_service (PyMuPDF → chunks → embed → pgvector + BM25 rebuild)
```

**Key invariants:**
- Every transcript chunk hits `guardrail_service.is_bank_related()` before any LLM call. Non-bank → silent drop.
- All LLM responses must be Uzbek — enforced by system prompt + `_looks_uzbek()` post-check + single retry.
- `customer_passport` never appears in supervisor WS payloads (`_scrub()`) or logs (`_scrub_pii()`).

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI (Python 3.11), uvicorn `--workers 1` |
| ORM | SQLAlchemy 2.x async + Alembic |
| DB driver | asyncpg |
| Vector store | PostgreSQL 16 + pgvector (ivfflat, cosine) |
| STT | faster-whisper large-v3 (CUDA float16) |
| LLM | Qwen3-8B Q4_K_M via Ollama → LiteLLM proxy |
| Dense embeddings | BGE-M3 (1024-dim) via Ollama |
| Sparse retrieval | BM25s (in-process, disk-persisted in `uploads/bm25_index/`) |
| Retrieval fusion | Reciprocal Rank Fusion (k=60) |
| PDF | PyMuPDF (fitz) |
| Auth | python-jose HS256, passlib bcrypt==3.2.2 |
| Fuzzy match | rapidfuzz (compliance, 0.85 threshold) |
| Logging | structlog JSON; PII scrubber active |
| Frontend | React + TypeScript + Tailwind (not started) |

## Development Commands

```bash
# Start infrastructure (postgres + ollama + litellm)
make infra

# Pull Ollama models into static/media/models/ (once, ~6 GB)
make models-pull

# Full first-time setup: infra → wait → migrate → seed
make setup

# Full stack
docker compose up

# Migrations
make migrate
# or: docker compose exec api alembic upgrade head

# Tests (postgres must be running on :5432)
make test           # 68 passed
make test-v         # verbose
make test-file F=tests/test_rag.py

# Health / quick checks
make health         # GET /healthz
make login          # POST /api/auth/login → prints token JSON
make ollama-models  # list pulled models
```

## Backend Structure (`backend/`)

```
app/
├── main.py              # FastAPI entry + lifespan (model warmup, phrase load, bm25 init)
├── config.py            # Pydantic Settings from .env
├── database.py          # async engine + session factory
├── deps.py              # get_db, get_current_user, require_role(*roles)
├── logging_config.py    # structlog JSON; _scrub_pii strips customer_passport
├── models/              # user, call, document (+ DocumentChunk), suggestion
├── schemas/             # auth, user, call, document, ws message envelopes
├── routers/
│   ├── auth.py          # /api/auth/login|refresh|me
│   ├── admin_users.py   # /api/admin/users CRUD
│   ├── admin_documents.py  # /api/admin/documents CRUD + reindex; triggers BM25 rebuild on delete
│   ├── calls.py         # /api/calls CRUD + intake PATCH + end POST
│   ├── demo.py          # /api/demo/scenarios|play
│   ├── audio_ws.py      # WS /ws/audio (agent stream)
│   └── supervisor_ws.py # WS /ws/supervisor (fan-out, passport scrubbed)
├── services/
│   ├── auth_service.py  # hash_password, verify_password, JWT issue/decode
│   ├── stt_service.py   # faster-whisper singleton, transcribe_chunk
│   ├── guardrail_service.py  # is_bank_related (BANK_TOPICS keyword set)
│   ├── llm_service.py   # chat(), get_suggestion() streaming, _looks_uzbek
│   ├── rag_service.py   # embed(), _dense_search(), _rrf(), search(), build_context()
│   ├── bm25_service.py  # BM25s sparse retrieval; load_or_init(), rebuild_from_db(), search()
│   ├── ingest_service.py  # ingest_pdf() → chunk → embed → pgvector; triggers BM25 rebuild
│   ├── extraction_service.py  # extract() → confidence-gated intake JSON
│   ├── summary_service.py     # summarize() → post-call JSON
│   ├── compliance_service.py  # check_chunk() rapidfuzz, per-call state
│   ├── sentiment_service.py   # analyze() keyword+LLM, change-only events
│   ├── event_bus.py     # asyncio.Queue pub/sub for supervisor fan-out
│   └── demo_service.py  # play_scenario() WAV → 100 ms audio_chunk stream
├── prompts/
│   ├── system_uz.py     # SYSTEM_PROMPT + SUGGESTION_TEMPLATE (rules in EN, output must be UZ)
│   ├── extraction_uz.py # EXTRACTION_PROMPT (JSON intake)
│   └── summary_uz.py    # SUMMARY_PROMPT (post-call outcome)
├── utils/
│   ├── audio.py         # ChunkBuffer (≥1 s), SpeakerTracker, pcm_to_float32
│   └── text.py          # (reserved)
└── data/
    └── compliance_phrases.json  # 3 placeholder phrases (UZ + RU + EN)
demo/
├── scenarios.json        # 4 hackathon demo scenarios
└── audio/                # WAV files (not committed — acquire separately)
uploads/                  # volume-mounted PDFs + BM25 on-disk index (gitignored)
tests/                    # 68 tests, all passing
alembic/versions/         # 0001_pgvector, 0002_init_schema, 0003_bge_m3_1024
```

## Hybrid RAG Pipeline

```
Query
  ├── BGE-M3 embed → pgvector cosine → top-20 dense hits
  └── BM25s tokenize → disk index → top-20 sparse hits
        ↓
  Reciprocal Rank Fusion (k=60): score = Σ 1/(k + rank)
        ↓
  Top-5 chunks → build_context() → LLM prompt
```

BM25 index is rebuilt automatically after every PDF ingest or delete. At startup, `bm25_service.load_or_init()` loads from `uploads/bm25_index/` or rebuilds from DB if missing.

## WebSocket Protocol

JWT via `?token=` query param (browser WS can't set headers).

**`/ws/audio` inbound:** `start_call`, `audio_chunk {pcm_b64, sample_rate}`, `trigger_intake_extraction`, `end_call`

**`/ws/audio` outbound:** `transcript`, `suggestion {text:[bullets], trigger}`, `sentiment`, `compliance_tick {phrase_id}`, `intake_proposal {data}`, `summary_ready {summary}`, `error {code, message}`

**`/ws/supervisor` outbound:** same events minus `customer_passport` (server-side scrub)

Backpressure: `deque(maxlen=50)` — oldest `transcript` events dropped when full. `suggestion` and `intake_proposal` bypass queue (direct send).

## Key Configuration (`.env`)

```env
JWT_SECRET=             # required
DATABASE_URL=           # defaults to postgres container
LITELLM_BASE_URL=       # defaults to litellm container
LLM_MODEL=              # ollama/qwen3:8b-q4_K_M
EMBEDDING_MODEL=        # ollama/bge-m3
EMBEDDING_DIM=1024
RAG_TOP_K=5
RAG_DENSE_CANDIDATES=20
RAG_SPARSE_CANDIDATES=20
RRF_K=60
EXTRACTION_WINDOW_SECONDS=60
EXTRACTION_CONFIDENCE_THRESHOLD=0.8
MAX_PDF_SIZE_MB=50
COMPLIANCE_PHRASES_PATH=/app/app/data/compliance_phrases.json
```

## Model Storage

Ollama models are stored in `static/media/models/` (bind-mounted to `/root/.ollama` inside the ollama container). They persist across container rebuilds. Pull once with `make models-pull`.

## GPU Budget

faster-whisper large-v3: ~2 GB VRAM + Qwen3-8B Q4_K_M: ~5 GB = **≤7 GB** on RTX 5070 Ti 16 GB.

Both warmed in `main.py` lifespan (dummy inference) to eliminate cold-start on first call.

## Latency Target

`audio (100 ms) + STT (≤500 ms) + guardrail+RAG (≤150 ms) + LLM first token (≤150 ms) + WS (≤100 ms)` = **≤1.5 s p95**

## Remaining Work

- Acquire 4 WAV files for `backend/demo/audio/` (team-recorded or TTS)
- Frontend (React/Vite/Tailwind) — backend API is complete
- GitHub Actions CI workflow
- Verify GPU memory budget with `nvidia-smi` during live call
- Canonical compliance phrases from bank/legal team
