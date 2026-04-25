# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Real-time AI sales copilot for bank call center agents in Uzbekistan. Listens to calls, transcribes Uzbek/Russian speech via faster-whisper, detects objections, and surfaces Uzbek-language suggestions in ≤1.5 s — fully on-premise (RTX 5070 Ti, no external API calls).

Three roles: `agent`, `supervisor`, `admin`. Single bank instance, JWT auth.

## Architecture

```
Browser → WS /ws/audio → FastAPI → faster-whisper (STT)
                                 → GuardrailService (keyword filter — no LLM if not bank)
                                 → RAG (pgvector cosine) → Qwen3-8B via LiteLLM → suggestion
                                 → SentimentService, ComplianceService (keyword + LLM)
                                 → EventBus → WS /ws/supervisor

Admin → POST /api/admin/documents → IngestService → PyMuPDF → tiktoken chunks → nomic-embed-text → pgvector
```

**Key invariants:**
- Every transcript chunk hits `GuardrailService.is_bank_related()` before any LLM call. Non-bank → silent drop.
- All LLM responses must be Uzbek only — enforced by system prompt + post-output language assertion + single retry.
- `customer_passport` is never included in supervisor WebSocket payloads (server-side scrub) and never serialized in logs.

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI (Python 3.11), uvicorn `--workers 1` (GPU contention) |
| ORM | SQLAlchemy 2.x async + Alembic |
| DB driver | asyncpg |
| Vector store | PostgreSQL + pgvector extension |
| STT | faster-whisper large-v3 (CUDA, float16) |
| LLM | Qwen3-8B Q4_K_M via Ollama, proxied through LiteLLM |
| Embeddings | nomic-embed-text (768-dim) via Ollama |
| PDF | PyMuPDF (fitz) |
| Auth | python-jose (HS256 JWT), passlib[bcrypt] |
| Logging | structlog (JSON to stdout) |
| Frontend | React + TypeScript + Tailwind CSS (Vite) |

## Development Commands

```bash
# Start infrastructure (postgres+pgvector, ollama, litellm)
docker compose up postgres ollama litellm

# Start API (after infra is up)
docker compose up api

# Full stack
docker compose up

# Run migrations
cd backend && alembic upgrade head

# Seed initial admin user
cd backend && python scripts/seed_admin.py

# Pull required Ollama models (run once)
ollama pull qwen3:8b-q4_K_M
ollama pull nomic-embed-text

# Backend tests
cd backend && pytest

# Single test
cd backend && pytest tests/test_auth.py -v

# Health check
curl http://localhost:8000/healthz
```

## Backend Structure (`backend/`)

```
app/
├── main.py              # FastAPI entry; startup hooks warm both models
├── config.py            # Pydantic Settings from env vars (see .env.example)
├── database.py          # async SQLAlchemy engine + session factory
├── deps.py              # get_db, get_current_user, require_role(*roles)
├── logging_config.py    # structlog JSON; PII scrubber strips customer_passport
├── models/              # SQLAlchemy ORM models
├── schemas/             # Pydantic request/response + WS message envelopes
├── routers/             # audio_ws.py, supervisor_ws.py, auth, calls, admin_*
├── services/            # stt, guardrail, llm, rag, sentiment, compliance,
│                        # extraction, summary, ingest, auth, event_bus, demo
├── prompts/             # system_uz.py, extraction_uz.py, summary_uz.py
└── data/
    └── compliance_phrases.json   # required phrase patterns for compliance checks
demo/
├── scenarios.json        # 4 hackathon demo scenarios
└── audio/                # bundled WAV files (gitignored if large)
uploads/                  # volume-mounted user PDFs (gitignored)
tests/
alembic/versions/
```

## WebSocket Protocol (`/ws/audio`)

JWT passed as `?token=` query param (browser WS can't set headers).

**Inbound:** `start_call`, `audio_chunk` (`{pcm_b64, sample_rate}`), `trigger_intake_extraction`, `end_call`

**Outbound:** `transcript`, `suggestion` (streamed tokens), `sentiment`, `compliance_tick`, `intake_proposal`, `summary_ready`, `error`

Backpressure: drop oldest `transcript` events when outbound queue > 50. Never drop `suggestion` or `intake_proposal`.

## Implementation Order

Follow `backend/TODO.md` phase by phase — do not advance to the next phase until its "Phase exit" check passes. Detailed engineering spec is in `backend/SPEC.md`.

Current status: **Phase 0** (bootstrapping infra files).

## Key Configuration

GPU budget: faster-whisper ~2 GB VRAM + Qwen3-8B Q4_K_M ~5 GB = ≤7 GB on RTX 5070 Ti 16 GB.

Both models are pre-warmed at container start (dummy inference in `main.py` startup hook) to eliminate cold-start latency on the first real call.

Latency target: audio capture (100 ms) + STT (≤500 ms) + guardrail+RAG (≤150 ms) + LLM first token (≤150 ms) + WS+render (≤100 ms) = **≤1.5 s total**.
