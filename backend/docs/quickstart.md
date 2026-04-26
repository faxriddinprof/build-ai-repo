# Quick Start

AI Sales Copilot — on-premise backend for bank call center agents in Uzbekistan.
Runs entirely locally. No external API calls.

This guide gets you from a fresh clone to a fully working `/healthz` in **CPU mode**. For GPU acceleration on a Windows RTX 5070 Ti, see [`gpu_setup.md`](gpu_setup.md).

## Prerequisites

- Docker + Docker Compose (Docker Desktop on Windows is fine)
- ~12 GB free disk for models
- 16 GB RAM minimum
- Internet access for the first model pull (~7 GB total)

## 1. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` — only one field is strictly required:

```env
JWT_SECRET=<run: openssl rand -hex 32>
```

Defaults that are already correct for Docker:

```env
LLM_BASE_URL=http://ollama:11434                # SDK calls Ollama directly
LLM_MODEL=ollama/qwen3:8b-q4_K_M
EMBEDDING_MODEL=ollama/bge-m3
EMBEDDING_DIM=1024
WHISPER_MODEL=tiny                              # Step 4 will switch this
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
ADMIN_EMAIL=admin@bank.uz
ADMIN_PASSWORD=changeme
```

## 2. Bring up the stack

```bash
docker compose up -d --build
```

This starts three services:

| Service | Port | Notes |
|---------|------|-------|
| `postgres` | 5432 | pgvector/pgvector:pg16 |
| `ollama` | 11434 | LLM + embedding inference |
| `api` | 8000 | FastAPI app |

> **About LiteLLM:** the API uses the `litellm` Python SDK in code (`from litellm import acompletion`) but talks to Ollama **directly** at `http://ollama:11434/api/{generate,embed}`. There is **no LiteLLM proxy container** in this project — the SDK is enough.

Check status:

```bash
docker compose ps
# all four should be "running" / "healthy"
```

## 3. Pull Ollama models (~6 GB, once)

The Ollama container starts empty — it needs the LLM and embedding model pulled into its volume.

```bash
docker compose exec ollama ollama pull qwen3:8b-q4_K_M
docker compose exec ollama ollama pull bge-m3
```

These are stored in `static/media/models/` (bind-mounted from the host) and survive rebuilds.

Verify:

```bash
curl http://localhost:11434/api/tags
# → {"models":[{"name":"qwen3:8b-q4_K_M",...},{"name":"bge-m3",...}]}
```

## 4. Convert the Uzbek STT model (~970 MB, once)

faster-whisper requires the `Kotib/uzbek_stt_v1` HuggingFace checkpoint to be re-packaged in CTranslate2 format. The conversion script is baked into the API image and uses `ct2-transformers-converter` (from the `transformers` + `torch` packages already in `requirements.txt`).

```bash
docker compose exec api python scripts/convert_stt_model.py
```

Output is written to `/app/models/uzbek_stt_v1_ct2/` on the `whisper_models` named volume — it persists across container rebuilds. Conversion takes 5–15 min on CPU (downloads ~970 MB from HF, then quantizes to int8 ~770 MB).

Then point `WHISPER_MODEL` at the converted directory:

```env
# backend/.env
WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
```

Recreate the API container so the new env var is picked up:

```bash
docker compose up -d api
```

> If you want to skip Uzbek STT for now and use the generic `tiny` model (English-biased, ~75 MB), leave `WHISPER_MODEL=tiny` and skip this step. faster-whisper will download `tiny` from HF on first use.

## 5. Run migrations + seed admin

The API auto-runs `alembic upgrade head` at startup, so migrations are usually already applied. To seed the admin user:

```bash
docker compose exec api python scripts/seed_admin.py
```

Default credentials (override in `backend/.env`):

```
ADMIN_EMAIL=admin@bank.uz
ADMIN_PASSWORD=changeme
```

## 6. Verify

```bash
curl http://localhost:8000/healthz
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}'
# → {"access_token":"...","refresh_token":"...","role":"admin"}
```

API docs live at `http://localhost:8000/docs` (Swagger UI).

## 7. Test the LLM (independent of the call pipeline)

**Direct Ollama** (proves the model is loaded):
```bash
curl -s http://localhost:11434/api/generate -d '{"model":"qwen3:8b-q4_K_M","prompt":"Salom!","stream":false}'
```

**Through the app's SDK code path:**
```bash
docker compose exec -T api python -c "
import asyncio
from app.services.llm_service import chat
print(asyncio.run(chat(
    messages=[{'role':'user','content':'Depozit foizlari qanday?'}],
    max_tokens=200, timeout=120.0,
)))
"
```

> The system prompt now ends with `/no_think` to disable Qwen3's reasoning tokens — necessary because the default `LLM_MAX_TOKENS_SUGGESTION=100` is otherwise consumed entirely by `<think>...</think>` and the user sees an empty reply.

## 8. PDF / TXT ingestion (RAG)

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample.pdf" -F "tag=product"

# Poll status (indexing → ready)
curl http://localhost:8000/api/admin/documents -H "Authorization: Bearer $TOKEN"
```

After ingestion, BM25 auto-rebuilds. Subsequent suggestions use hybrid retrieval (dense + sparse → RRF).

> On CPU, each chunk takes 6–15 s to embed (bge-m3 has 568M params and chunks are processed serially). On GPU it's 50–200 ms per chunk.

## 9. Browser admin panel

Open `http://localhost:8000/admin` — Basic Auth with the seeded admin credentials. Upload PDFs/TXTs, monitor indexing, delete documents.

## 10. Real-time audio test (REST fallback)

```bash
CALL_ID=$(curl -s -X POST http://localhost:8000/api/calls \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -s -X POST http://localhost:8000/api/transcribe-chunk \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@chunk.webm" \
  -F "call_id=$CALL_ID" \
  -F "lang_hint=uz"
# → {"call_id":"...","events":[{"type":"transcript",...},{"type":"suggestion",...}]}
```

Calls require an `agent` role. Create one via `POST /api/admin/users` with `{"role":"agent"}`.

## 11. Tests

```bash
make test
# 68+ passing (postgres on :5432 required; tests use a separate sales_test DB)
```

## API surface

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Get JWT tokens |
| `GET  /api/auth/me` | Current user |
| `POST /api/admin/users` | Create user (admin) |
| `POST /api/admin/documents` | Upload PDF/TXT for RAG (admin) |
| `GET  /api/calls` | Call history |
| `POST /api/calls` | Start call (agent) |
| `POST /api/transcribe-chunk` | REST fallback audio upload |
| `WS   /ws/signaling?token=` | WebRTC SDP/ICE exchange |
| `WS   /ws/supervisor?token=` | Supervisor live feed |
| `GET  /healthz` | Readiness probe |
| `GET  /admin` | Admin panel (Basic Auth) |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ollama_ok: false` in `/healthz` | Models not pulled, or Ollama not healthy | `docker compose exec ollama ollama list` — both models must appear |
| `startup.stt_load_failed` | `WHISPER_MODEL` path doesn't exist on the volume | Re-run conversion (Step 4); ensure `whisper_models` volume is mounted |
| `startup.llm_warmup_failed` | Ollama still loading the model | Wait 30 s, restart api |
| `startup.embed_warmup_failed` | Same as above; auto-retries 5× | Wait or restart api |
| Empty LLM reply | Qwen3 thinking tokens consumed all of `max_tokens` | Already mitigated via `/no_think` in system prompt; if you wrote a custom prompt, append `/no_think` |
| 429 on login | Per-IP rate limit (5/min) | Wait 60 s |
| Slow embeddings (>5 s/chunk) | Running on CPU | Switch to GPU mode — see `gpu_setup.md` |

## Next steps

- [`manual_test_flow.md`](manual_test_flow.md) — full end-to-end verification (10 steps)
- [`gpu_setup.md`](gpu_setup.md) — switch to GPU for production-grade latency
- [`SIGNALING.md`](SIGNALING.md) — WebRTC frontend integration
- [`architecture.md`](architecture.md) — internal services + data flow
