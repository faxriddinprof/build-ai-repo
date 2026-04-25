# Quick Start

AI Sales Copilot — on-premise backend for bank call center agents in Uzbekistan.
Runs entirely locally on a single GPU host. No external API calls.

## Prerequisites

- Docker + Docker Compose
- NVIDIA GPU ≥8 GB VRAM (tested on RTX 5070 Ti 16 GB)
- Windows: Docker Desktop with WSL2 backend + NVIDIA driver 531.14+
- Linux: NVIDIA Container Toolkit (`nvidia-container-toolkit`)

## 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — only one field is required:

```env
JWT_SECRET=your-strong-random-secret-here
```

Everything else has working defaults for local Docker.

## 2. Start infrastructure + pull models

```bash
# Start postgres, ollama, litellm
make infra

# Pull models into static/media/models/ (≈6 GB total, runs once)
make models-pull
```

`models-pull` downloads into `static/media/models/`:
- `qwen3:8b-q4_K_M` — LLM inference (~5 GB)
- `bge-m3` — multilingual embeddings, 1024-dim (~1.2 GB)

Pre-download the whisper model into the api container cache:
```bash
make models-whisper   # downloads whisper tiny (~75 MB) for dev/CI
```

Models are stored in `static/media/models/` (bind-mounted into the ollama container). They survive container rebuilds.

Wait until all three services are healthy:

```bash
make ps   # all should show "healthy"
```

## 3. Run migrations + seed admin

```bash
make migrate
make seed
```

Default admin credentials (override in `.env`):

```
ADMIN_EMAIL=admin@bank.local
ADMIN_PASSWORD=changeme
```

Or run everything at once:

```bash
make setup   # infra → wait 15 s → migrate → seed
```

## 4. Start the API

```bash
docker compose up api
```

Startup takes ~30 s while faster-whisper and Qwen3 warm up. BM25 index loads from disk (or rebuilds from DB if missing). Watch for:

```
startup.done
```

## 5. Verify

```bash
make health
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}

make login
# → {"access_token":"...","refresh_token":"...","role":"admin"}
```

## 6. Run tests

Postgres must be running on `:5432`:

```bash
make test
# 68 passed (postgres must be running)

# Pre-download whisper model for tests:
make models-whisper
```

Single file:

```bash
make test-file F=tests/test_rag.py
```

## Full stack

```bash
docker compose up
```

Brings up postgres, ollama, litellm, and api together.

## API surface

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Get JWT tokens |
| `GET  /api/auth/me` | Current user |
| `GET  /api/admin/users` | List users (admin) |
| `POST /api/admin/documents` | Upload PDF for RAG (admin) |
| `GET  /api/calls` | Call history |
| `GET  /api/demo/scenarios` | List demo scenarios |
| `POST /api/demo/play` | Play a demo WAV scenario |
| `WS   /ws/audio?token=` | Agent audio stream |
| `WS   /ws/supervisor?token=` | Supervisor live feed |
| `GET  /healthz` | Readiness probe |

## WebSocket smoke test

```bash
npm install -g wscat

# Get agent token (create agent user via admin API first)
wscat -c "ws://localhost:8000/ws/audio?token=$AGENT_TOKEN"

# Send:
{"type":"start_call"}
{"type":"audio_chunk","pcm_b64":"<base64-pcm>","sample_rate":16000}
{"type":"end_call"}
```

Expected outbound: `transcript` → `suggestion` (if bank-related) → `summary_ready`.

## PDF ingestion (RAG)

```bash
TOKEN=$(make login | python3 -m json.tool | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -sX POST http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample.pdf" -F "tag=product" | python3 -m json.tool

# Poll until status=ready
curl http://localhost:8000/api/admin/documents -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

After ingestion, BM25 index auto-rebuilds. Subsequent suggestions use hybrid retrieval (dense + sparse → RRF).

## Demo scenarios

Requires WAV files in `backend/demo/audio/`. See `backend/demo/scenarios.json` for filenames. Once placed:

```bash
curl -sX POST http://localhost:8000/api/demo/play \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"call_id":"test-call-1","scenario_id":"objection_expensive"}'
```
