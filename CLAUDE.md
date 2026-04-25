# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Real-time AI sales copilot for bank call center agents in Uzbekistan. Listens to calls, transcribes Uzbek/Russian speech via faster-whisper, detects objections, and surfaces Uzbek-language suggestions in ≤1.5 s — fully on-premise (RTX 5070 Ti, no external API calls).

Three roles: `agent`, `supervisor`, `admin`. Single bank instance, JWT auth.

**Current status:** Backend complete. 68/68 tests passing. Frontend not started.

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
| STT | faster-whisper (`Kotib/uzbek_stt_v1` on GPU, `tiny` for dev) |
| LLM | Qwen3-8B Q4_K_M via Ollama → LiteLLM proxy |
| Dense embeddings | BGE-M3 (1024-dim) via Ollama |
| Sparse retrieval | BM25s (in-process, disk-persisted in `uploads/bm25_index/`) |
| Retrieval fusion | Reciprocal Rank Fusion (k=60) |
| PDF | PyMuPDF (fitz) |
| Auth | python-jose HS256, passlib bcrypt==3.2.2 |
| Fuzzy match | rapidfuzz (compliance) |
| Logging | structlog JSON; PII scrubber active |
| Frontend | React + TypeScript + Tailwind (not started) |

## Development Commands

```bash
# Start infrastructure (postgres + ollama + litellm)
make infra

# Pull Ollama models into static/media/models/ (once, ~6 GB)
make models-pull

# Pre-download whisper tiny model into api container
make models-whisper

# Full first-time setup: infra → wait → migrate → seed
make setup

# Full stack (CPU mode, no GPU required for dev)
docker compose up

# Full stack with NVIDIA GPU (Windows RTX server)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up

# Convert Kotib/uzbek_stt_v1 → CTranslate2 (run on GPU server after setup)
make convert-stt

# Migrations
make migrate

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
├── config.py            # ALL config here — Pydantic Settings from .env
├── database.py          # async engine + session factory
├── deps.py              # get_db, get_current_user, require_role(*roles)
├── logging_config.py    # structlog JSON; _scrub_pii strips customer_passport
├── models/              # user, call, document (+ DocumentChunk), suggestion
├── schemas/             # auth, user, call, document, ws message envelopes
├── routers/
│   ├── auth.py          # /api/auth/login|refresh|me
│   ├── admin_users.py   # /api/admin/users CRUD
│   ├── admin_documents.py  # /api/admin/documents CRUD + reindex; triggers BM25 rebuild on delete
│   ├── calls.py         # /api/calls CRUD + intake PATCH + end POST (agent-only)
│   ├── demo.py          # /api/demo/scenarios|play
│   ├── audio_ws.py      # WS /ws/audio (agent stream)
│   └── supervisor_ws.py # WS /ws/supervisor (fan-out, passport scrubbed)
├── services/
│   ├── auth_service.py  # hash_password, verify_password, JWT issue/decode
│   ├── stt_service.py   # faster-whisper singleton, transcribe_chunk (beam_size from WHISPER_BATCH_SIZE_REALTIME)
│   ├── guardrail_service.py  # is_bank_related (BANK_TOPICS keyword set)
│   ├── llm_service.py   # chat(), get_suggestion() streaming, _looks_uzbek
│   ├── rag_service.py   # embed(), _dense_search(), _rrf(), search(), build_context()
│   ├── bm25_service.py  # BM25s sparse retrieval; load_or_init(), rebuild_from_db(), search()
│   ├── ingest_service.py  # ingest_pdf() → chunk → embed → pgvector; triggers BM25 rebuild
│   ├── extraction_service.py  # extract() → confidence-gated intake JSON
│   ├── summary_service.py     # summarize() → post-call JSON
│   ├── compliance_service.py  # check_chunk() rapidfuzz, threshold from COMPLIANCE_FUZZY_THRESHOLD
│   ├── sentiment_service.py   # analyze() keyword+LLM; thresholds from settings
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
    └── compliance_phrases.json  # compliance phrases (UZ + RU + EN)
scripts/
├── seed_admin.py        # create/update admin user (reads ADMIN_EMAIL/ADMIN_PASSWORD from settings)
├── download_models.py   # download Ollama + whisper models
└── convert_stt_model.py # convert Kotib/uzbek_stt_v1 → CTranslate2 for faster-whisper
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
  ├── BGE-M3 embed → pgvector cosine → top-RAG_DENSE_TOP_K dense hits
  └── BM25s tokenize → disk index → top-RAG_SPARSE_TOP_K sparse hits
        ↓
  Reciprocal Rank Fusion (k=RRF_K): score = Σ 1/(k + rank)
        ↓
  Top-RAG_FINAL_TOP_K chunks → build_context() → LLM prompt
```

BM25 index rebuilt automatically after every PDF ingest or delete. At startup, `bm25_service.load_or_init()` loads from `uploads/bm25_index/` or rebuilds from DB if missing.

## STT Model Setup

**Dev (CPU):** `WHISPER_MODEL=tiny` — loads in seconds, low accuracy.

**Production (GPU):** `Kotib/uzbek_stt_v1` — fine-tuned Uzbek model. Requires CTranslate2 conversion:
```bash
make convert-stt
# Then set: WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
```

## Model Storage

Ollama models stored in `static/media/models/` (bind-mounted to `/root/.ollama` in ollama container). Pull once with `make models-pull`. Survives container rebuilds.

## WebSocket Protocol

JWT via `?token=` query param (browser WS can't set headers).

**`/ws/audio` inbound:** `start_call`, `audio_chunk {pcm_b64, sample_rate}`, `trigger_intake_extraction`, `end_call`

**`/ws/audio` outbound:** `transcript`, `suggestion {text:[bullets], trigger}`, `sentiment`, `compliance_tick {phrase_id}`, `intake_proposal {data}`, `summary_ready {summary}`, `error {code, message}`

**`/ws/supervisor` outbound:** same events minus `customer_passport` (server-side scrub)

Backpressure: `deque(maxlen=50)` — oldest `transcript` events dropped when full. `suggestion` and `intake_proposal` bypass queue (direct send).

## Key Configuration (`.env`)

All constants live in `config.py`. Override in `.env`:

```env
JWT_SECRET=             # required — generate: openssl rand -hex 32

# LiteLLM
LITELLM_API_KEY=sk-bank-internal-key   # must match litellm_config.yaml master_key
LITELLM_BASE_URL=http://litellm:4000

# Models
LLM_MODEL=ollama/qwen3:8b-q4_K_M
EMBEDDING_MODEL=ollama/bge-m3
EMBEDDING_DIM=1024
WHISPER_MODEL=tiny                      # dev; production: /app/models/uzbek_stt_v1_ct2
WHISPER_DEVICE=cpu                      # production: cuda
WHISPER_COMPUTE_TYPE=int8               # production: float16
WHISPER_BATCH_SIZE_REALTIME=1
WHISPER_BATCH_SIZE_BATCH=16

# RAG
RAG_FINAL_TOP_K=5
RAG_DENSE_TOP_K=20
RAG_SPARSE_TOP_K=20
BM25_K=10
RRF_K=60

# Rate limiting
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_BURST=10

# Compliance / Sentiment thresholds
COMPLIANCE_FUZZY_THRESHOLD=85.0
SENTIMENT_LLM_COOLDOWN_SECONDS=5.0
SENTIMENT_TURNS_WINDOW=3
SENTIMENT_SCORE_THRESHOLD=2

# Admin seed
ADMIN_EMAIL=admin@bank.uz
ADMIN_PASSWORD=changeme
```

## GPU Budget

faster-whisper `Kotib/uzbek_stt_v1`: ~1.5 GB VRAM + Qwen3-8B Q4_K_M: ~5 GB = **≤7 GB** on RTX 5070 Ti 16 GB.

Both warmed in `main.py` lifespan (dummy inference) to eliminate cold-start on first call. Warmup failures are caught and logged — server starts regardless.

## Latency Target

`audio (100 ms) + STT (≤500 ms) + guardrail+RAG (≤150 ms) + LLM first token (≤150 ms) + WS (≤100 ms)` = **≤1.5 s p95**

## Remaining Work

- Acquire 4 WAV files for `backend/demo/audio/` (team-recorded or TTS)
- Frontend (React/Vite/Tailwind) — backend API is complete
- GitHub Actions CI workflow
- Run `make convert-stt` on Windows GPU server for Uzbek STT
- Verify GPU memory budget with `nvidia-smi` during live call
- Canonical compliance phrases from bank/legal team
- Rate limiting middleware (config vars added, implementation pending)
