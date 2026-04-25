# Quick Start

AI Sales Assistant — on-premise backend for bank call center agents in Uzbekistan.
Runs entirely locally on a single GPU host. No external API calls.

## Prerequisites

- Docker + Docker Compose (with NVIDIA Container Toolkit)
- NVIDIA GPU with ≥8 GB VRAM (tested on RTX 5070 Ti 16 GB)
- Ollama installed locally (for one-time model pull)

## 1. Pull Ollama models (once)

```bash
ollama pull qwen3:8b-q4_K_M
ollama pull nomic-embed-text
```

These download ~5 GB and ~270 MB respectively. Required before first `docker compose up`.

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — minimum required:

```env
JWT_SECRET=your-strong-random-secret-here
```

Everything else has working defaults for local development.

## 3. Start infrastructure

```bash
docker compose up postgres ollama litellm -d
```

Wait until all three are healthy:

```bash
docker compose ps   # all should show "healthy"
curl http://localhost:4000/health   # → {"status": "healthy"}
```

## 4. Run migrations + seed admin

```bash
docker compose exec api alembic upgrade head
docker compose exec api python scripts/seed_admin.py
```

Default admin credentials (set in `.env`):

```
ADMIN_EMAIL=admin@bank.local
ADMIN_PASSWORD=changeme
```

## 5. Start the API

```bash
docker compose up api
```

Startup takes ~30 s while faster-whisper + Qwen3 warm up. Watch for:

```
startup.done
```

## 6. Verify

```bash
# Health check
curl http://localhost:8000/healthz
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}

# Login
TOKEN=$(curl -sX POST http://localhost:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@bank.local","password":"changeme"}' | jq -r .access_token)

# Identity
curl http://localhost:8000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

## 7. Run tests

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://sales:sales@localhost:5432/sales_test \
JWT_SECRET=test_secret \
pytest -v
# 59 passed
```

## Full stack

```bash
docker compose up
```

Brings up postgres, ollama, litellm, and api together.

## API surface

| Prefix | Purpose |
|--------|---------|
| `POST /api/auth/login` | Get JWT tokens |
| `GET /api/auth/me` | Current user |
| `GET /api/admin/users` | List users (admin) |
| `POST /api/admin/documents` | Upload PDF for RAG (admin) |
| `GET /api/calls` | Call history |
| `GET /api/demo/scenarios` | List demo scenarios |
| `POST /api/demo/play` | Play a demo WAV scenario |
| `WS /ws/audio?token=` | Agent audio stream |
| `WS /ws/supervisor?token=` | Supervisor live feed |
| `GET /healthz` | Readiness probe |

## WebSocket quick smoke test

```bash
# Install wscat
npm install -g wscat

# Get agent token first (create an agent user via admin API)
wscat -c "ws://localhost:8000/ws/audio?token=$AGENT_TOKEN"

# Send:
{"type":"start_call"}
{"type":"audio_chunk","pcm_b64":"<base64-pcm>","sample_rate":16000}
{"type":"end_call"}
```

Expected outbound events: `transcript` → `suggestion` (if bank-related) → `summary_ready`.

## Demo scenarios

Requires WAV files in `backend/demo/audio/`. See `backend/demo/scenarios.json` for filenames.
Once WAVs are placed, trigger via:

```bash
curl -sX POST http://localhost:8000/api/demo/play \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"call_id":"test-call-1","scenario_id":"objection_expensive"}'
```
