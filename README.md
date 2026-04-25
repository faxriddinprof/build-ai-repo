# AI Sales Copilot

Real-time sales assistant for bank call center agents in Uzbekistan. Listens to live calls, transcribes Uzbek/Russian speech, detects objections, and surfaces product suggestions in **≤1.5 seconds** — fully on-premise, no external API calls.

## What it does

During a live call, the system:

1. **Transcribes** speech in real time (faster-whisper, Uzbek/Russian)
2. **Detects** when the customer raises an objection or asks about a product
3. **Retrieves** relevant context from bank PDFs (hybrid dense + sparse search)
4. **Generates** a concise Uzbek-language suggestion for the agent (Qwen3-8B)
5. **Streams** the suggestion to the agent's browser within 1.5 s of the customer speaking

Supervisors get a live read-only feed. Admins upload PDFs and manage users.

## Architecture

```
Browser (Agent)
  │  WS /ws/audio?token=<jwt>
  ▼
audio_ws.py
  ├── ChunkBuffer (≥1 s PCM)
  ├── stt_service       → faster-whisper large-v3 (CUDA float16)
  ├── guardrail_service → BANK_TOPICS keyword filter (drop non-bank queries)
  ├── compliance_service → rapidfuzz phrase match
  ├── sentiment_service  → keyword + LLM tone detection
  ├── extraction_service → LLM JSON intake extraction (auto at 60 s)
  ├── rag_service        → BGE-M3 dense + BM25s sparse → RRF → top-5 chunks
  └── llm_service        → Qwen3-8B Q4_K_M (streaming, Uzbek enforced)
        └── event_bus → WS /ws/supervisor?token=<jwt>

Admin
  POST /api/admin/documents
    └── ingest_service → PyMuPDF → chunks → BGE-M3 embed → pgvector + BM25 rebuild
```

## Stack

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI 0.111, Python 3.11, uvicorn |
| Database | PostgreSQL 16 + pgvector (cosine, ivfflat) |
| ORM | SQLAlchemy 2.x async + Alembic |
| STT | faster-whisper large-v3 (CUDA float16, ~2 GB VRAM) |
| LLM | Qwen3-8B Q4_K_M via Ollama → LiteLLM proxy (~5 GB VRAM) |
| Dense retrieval | BGE-M3 1024-dim embeddings via Ollama |
| Sparse retrieval | BM25s (in-process, persisted to disk) |
| Fusion | Reciprocal Rank Fusion (k=60) |
| Auth | HS256 JWT, bcrypt passwords |
| Compliance | rapidfuzz fuzzy match (0.85 threshold) |
| Logging | structlog JSON + PII scrubber |
| Frontend | React + TypeScript + Tailwind *(not started)* |

## Requirements

- Docker + Docker Compose
- NVIDIA GPU ≥8 GB VRAM (RTX 5070 Ti 16 GB recommended)
- **Windows**: Docker Desktop with WSL2 + NVIDIA driver ≥531.14
- **Linux**: NVIDIA Container Toolkit

## Quick Start

```bash
# 1. Configure
cp .env.example .env
# Edit .env — set JWT_SECRET at minimum

# 2. Start infra + pull models (~6 GB, once)
make infra
make models-pull

# 3. Migrate DB + create admin user
make setup

# 4. Start full stack
docker compose up

# 5. Verify
make health
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}
```

See [`backend/docs/quickstart.md`](backend/docs/quickstart.md) for the full guide including WebSocket testing and PDF ingestion.

## Models

Models are stored in `static/media/models/` (bind-mounted into the Ollama container):

| Model | Purpose | Size |
|-------|---------|------|
| `qwen3:8b-q4_K_M` | LLM suggestions | ~5 GB |
| `bge-m3` | Dense embeddings (1024-dim) | ~1.2 GB |

## Roles

| Role | Access |
|------|--------|
| `admin` | User CRUD, document upload/delete, all endpoints |
| `supervisor` | Read-only call history + live supervisor WebSocket feed |
| `agent` | Own calls, audio WebSocket |

## Security

- `customer_passport` never appears in supervisor WebSocket payloads or logs (server-side scrub)
- All LLM responses enforced Uzbek-only (system prompt + `_looks_uzbek()` post-check + single retry)
- Every transcript chunk passes `guardrail_service.is_bank_related()` before LLM call
- `MAX_PDF_SIZE_MB=50` guard against PDF DoS

## Latency Budget

| Stage | Target |
|-------|--------|
| Audio chunk | 100 ms |
| STT (faster-whisper) | ≤500 ms |
| Guardrail + RAG | ≤150 ms |
| LLM first token | ≤150 ms |
| WebSocket delivery | ≤100 ms |
| **Total p95** | **≤1.5 s** |

## Development

```bash
make test          # run all 68 tests
make test-v        # verbose
make test-file F=tests/test_rag.py

make health        # GET /healthz
make login         # POST /api/auth/login → print token
make ollama-models # list pulled models
make lint          # mypy type check
```

## Project Status

- Backend complete (68/68 tests passing)
- Frontend not started
- Requires WAV files in `backend/demo/audio/` for demo scenarios
