# AI Sales Copilot

Real-time sales assistant for bank call center agents in Uzbekistan. Listens to live calls, transcribes Uzbek/Russian speech, detects objections, and surfaces product suggestions in **≤1.5 seconds** — fully on-premise, no external API calls.

## What it does

During a live call, the system:

1. **Transcribes** speech in real time (faster-whisper + `Kotib/uzbek_stt_v1` for Uzbek)
2. **Detects** when the customer raises an objection or asks about a product
3. **Retrieves** relevant context from bank PDFs/TXTs (hybrid dense + sparse search)
4. **Generates** a concise Uzbek-language suggestion for the agent (Qwen3-8B)
5. **Streams** the suggestion to the agent's browser within 1.5 s

Supervisors get a live read-only feed. Admins upload PDFs/TXTs and manage users.

## Architecture

```
Browser (Agent)
  ├── WS /ws/signaling?token=<jwt>     (WebRTC SDP/ICE)
  └── POST /api/transcribe-chunk       (REST fallback)
        │
        ▼
  services/call_pipeline.py
    ├── stt_service       → faster-whisper (Uzbek STT, CTranslate2)
    ├── guardrail_service → BANK_TOPICS keyword filter
    ├── compliance_service → rapidfuzz phrase match
    ├── sentiment_service → keyword + LLM tone
    ├── extraction_service → LLM JSON intake (auto at 60 s)
    ├── rag_service       → BGE-M3 dense + BM25s sparse → RRF → top-5
    └── llm_service       → Qwen3-8B Q4_K_M (streaming, Uzbek enforced)
        └── event_bus → WS /ws/supervisor

Admin
  POST /api/admin/documents
    └── ingest_service → PyMuPDF → chunks → BGE-M3 embed → pgvector + BM25 rebuild
```

**LLM data path:** `api → litellm SDK → http://ollama:11434/api/{generate,embed}`. The `litellm` Python SDK is used inside the API to talk to Ollama directly — there is **no proxy** in the data path. The stack is three services: `postgres`, `ollama`, `api`.

## Stack

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI 0.115, Python 3.11, uvicorn (single worker) |
| Database | PostgreSQL 16 + pgvector (cosine, ivfflat) |
| ORM | SQLAlchemy 2.x async + Alembic |
| STT | faster-whisper + `Kotib/uzbek_stt_v1` (CTranslate2 int8) |
| LLM | Qwen3-8B Q4_K_M via Ollama (`/no_think` mode) |
| Dense retrieval | BGE-M3 1024-dim via Ollama |
| Sparse retrieval | BM25s (in-process, persisted to disk) |
| Fusion | Reciprocal Rank Fusion (k=60) |
| Auth | HS256 JWT, bcrypt passwords |
| Logging | structlog JSON + PII scrubber |
| Frontend | React + TypeScript + Tailwind *(in progress)* |

## Requirements

- Docker + Docker Compose
- **CPU mode**: any 64-bit machine, ≥16 GB RAM (slower, fine for development)
- **GPU mode**: NVIDIA GPU ≥8 GB VRAM (RTX 5070 Ti 16 GB recommended)
  - Windows: Docker Desktop ≥4.25 with WSL2 + NVIDIA driver ≥531.14
  - Linux: NVIDIA Container Toolkit

## Quick Start

```bash
# 1. Configure
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT_SECRET at minimum (openssl rand -hex 32)

# 2. Bring up the stack (CPU mode)
docker compose up -d --build
# (or: docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build for GPU)

# 3. Pull Ollama models inside the container (~6 GB, once)
docker compose exec ollama ollama pull qwen3:8b-q4_K_M
docker compose exec ollama ollama pull bge-m3

# 4. Convert Uzbek STT model (~970 MB, ~10 min on CPU, runs once)
docker compose exec api python scripts/convert_stt_model.py
# Then in backend/.env set: WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
docker compose up -d api   # recreate to pick up the env change

# 5. Verify
curl http://localhost:8000/healthz
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}
```

See [`backend/docs/quickstart.md`](backend/docs/quickstart.md) for the full walkthrough including PDF ingestion, GPU switch, and end-to-end testing.

## Models

Stored in named Docker volumes (survive rebuilds):

| Model | Volume | Size | Purpose |
|-------|--------|------|---------|
| `qwen3:8b-q4_K_M` | bind mount → `static/media/models` | ~5 GB | LLM suggestions |
| `bge-m3` | bind mount → `static/media/models` | ~1.2 GB | Dense embeddings (1024-dim) |
| `Kotib/uzbek_stt_v1` (CT2) | volume `whisper_models` | ~770 MB | Uzbek speech-to-text |

## Roles

| Role | Access |
|------|--------|
| `admin` | User CRUD, document upload/delete, all endpoints |
| `supervisor` | Read-only call history + live supervisor WebSocket feed |
| `agent` | Own calls, audio WebSocket / REST transcribe |

## Security

- `customer_passport` never appears in supervisor WS payloads or logs (server-side scrub)
- All LLM responses enforced Uzbek-only (system prompt + `_looks_uzbek()` post-check + single retry)
- Every transcript chunk passes `guardrail_service.is_bank_related()` before LLM call
- `MAX_PDF_SIZE_MB=50` guard against PDF DoS
- Per-IP rate limiting on `/api/auth/*` (slowapi)

## Latency Budget (GPU)

| Stage | Target |
|-------|--------|
| Audio chunk | 100 ms |
| STT (faster-whisper, GPU) | ≤500 ms |
| Guardrail + RAG | ≤150 ms |
| LLM first token | ≤150 ms |
| WebSocket delivery | ≤100 ms |
| **Total p95** | **≤1.5 s** |

CPU mode is **5–30× slower** end-to-end and is intended for development only.

## Development

```bash
# Tests (postgres must be running on :5432)
make test          # 68+ passing
make test-v
make test-file F=tests/test_rag.py

# Quick checks
curl http://localhost:8000/healthz
curl http://localhost:11434/api/tags     # Ollama models
docker compose logs -f api               # API logs
docker compose ps                        # service health
```

## Project Status

- Backend complete (68/68 tests passing)
- Frontend in progress
- Demo WAV files needed in `backend/demo/audio/`
