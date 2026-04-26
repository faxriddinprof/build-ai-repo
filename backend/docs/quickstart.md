# Quick Start (CPU mode)

A step-by-step setup guide for the AI Sales Copilot backend. Follow it top-to-bottom — no skipping, no improvising. By the end, you will have a working API on `http://localhost:8000` with login, RAG ingestion, and the LLM all running locally.

> **CPU only.** This guide uses your laptop's CPU. It works but the LLM is slow (~10–15 s per reply). For a fast setup on a Windows RTX GPU, use [`gpu_setup.md`](gpu_setup.md) instead.

---

## What you are setting up

Three Docker containers running together:

| Container | What it does | Port |
|-----------|--------------|------|
| `postgres` | Database + vector storage (pgvector) | 5432 |
| `ollama` | Runs the LLM (Qwen3-8B) and the embedding model (bge-m3) | 11434 |
| `api` | FastAPI backend — your app | 8000 |

> **No "litellm" container.** The API uses the `litellm` Python SDK (a library) to talk to `ollama` directly. There is no fourth proxy container. Three services total.

---

## Before you start

Make sure you have:

- [ ] **Docker Desktop** installed and running. Open it once before continuing.
- [ ] **~12 GB free disk space** (the AI models are big).
- [ ] **16 GB RAM** minimum.
- [ ] **Internet** for the first model download (~7 GB, one time).
- [ ] **A terminal** — Bash (Linux/Mac/WSL) or PowerShell (Windows). Commands below assume Bash; on PowerShell replace `curl` with `curl.exe`.

Test Docker works:

```bash
docker --version
docker compose version
```

If either command fails, fix Docker first. Don't continue.

---

## Step 1 — Get the code and create your `.env` file

```bash
git clone https://github.com/faxriddinprof/build-with-ai-hackathon.git
cd build-with-ai-hackathon
cp backend/.env.example backend/.env
```

Now open `backend/.env` in any editor. **Only one line is mandatory** — everything else has a working default:

```env
JWT_SECRET=<paste a random 64-character string here>
```

Generate one:

```bash
openssl rand -hex 32
```

Copy the output, paste it after `JWT_SECRET=`. Save the file.

> **Don't change anything else yet.** The defaults (`LLM_BASE_URL=http://ollama:11434`, `WHISPER_MODEL=tiny`, etc.) work out of the box for CPU mode.

---

## Step 2 — Start the three containers

```bash
docker compose up -d --build
```

This builds the `api` image and starts all three services. First build takes ~5 minutes.

Verify everything is running:

```bash
docker compose ps
```

You should see `postgres`, `ollama`, and `api` all with status `running` or `healthy`. If any say `restarting` or `exited`, check the logs:

```bash
docker compose logs api
docker compose logs ollama
```

---

## Step 3 — Download the AI models into Ollama (~6 GB, one time)

The `ollama` container is empty by default. You need to download the LLM and the embedding model into it:

```bash
docker compose exec ollama ollama pull qwen3:8b-q4_K_M
docker compose exec ollama ollama pull bge-m3
```

Each pull takes 2–10 minutes depending on your internet. The files are saved to `static/media/models/` on your host, so they survive container rebuilds.

Verify both models are loaded:

```bash
curl http://localhost:11434/api/tags
```

You should see both `qwen3:8b-q4_K_M` and `bge-m3` in the JSON response. If not, the pull failed — re-run the commands above.

---

## Step 4 — Pick a Speech-to-Text (STT) model

You have two options. **Pick one, do not do both.**

### Option A — Quick start with the small `tiny` model (recommended for first-time setup)

Nothing to do. The default in `backend/.env` is already `WHISPER_MODEL=tiny`. faster-whisper will download it (~75 MB) automatically the first time it runs. Skip to **Step 5**.

> Caveat: `tiny` is English-biased and bad at Uzbek. Fine for verifying the setup, not for a real demo.

### Option B — The Uzbek-tuned model (~970 MB, takes 5–15 min)

If you want actual Uzbek transcription, run this conversion script:

```bash
docker compose exec api python scripts/convert_stt_model.py
```

This downloads `Kotib/uzbek_stt_v1` from HuggingFace and converts it to the format faster-whisper needs. Output goes to `/app/models/uzbek_stt_v1_ct2/` inside a Docker volume (persists across rebuilds).

After it finishes, edit `backend/.env`:

```env
WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
```

Apply the change by recreating the api container:

```bash
docker compose up -d api
```

---

## Step 5 — Create the admin user

The database tables are already created — the api container runs `alembic upgrade head` automatically at startup. You just need to create the first admin login:

```bash
docker compose exec api python scripts/seed_admin.py
```

Default credentials (these come from `backend/.env`):

```
email:    admin@bank.uz
password: changeme
```

> **Change `ADMIN_PASSWORD` in `backend/.env` before showing this to anyone.** Default passwords are not safe.

---

## Step 6 — Verify the API is healthy

```bash
curl http://localhost:8000/healthz
```

Expected reply:

```json
{"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}
```

All four must be `true` / `"ok"`. If any are `false`, see the **Troubleshooting** section at the bottom.

Now log in to get a JWT token:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}'
```

You should get back `{"access_token":"...", "refresh_token":"...", "role":"admin"}`. Save the `access_token` — you will need it for the next steps.

You can also browse the full API at `http://localhost:8000/docs` (Swagger UI).

---

## Step 7 — Test the LLM end-to-end

Two quick tests to confirm Qwen3 actually answers.

**Test A — Talk to Ollama directly** (proves the model is loaded):

```bash
curl -s http://localhost:11434/api/generate -d '{
  "model":"qwen3:8b-q4_K_M",
  "prompt":"Salom!",
  "stream":false
}'
```

Expect a JSON reply with a `"response"` field containing Uzbek text. On CPU this takes ~10–15 s.

**Test B — Through your app's code path** (proves the SDK + config are wired correctly):

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

You should see Uzbek text printed.

> **If the reply is empty:** Qwen3's reasoning tokens (`<think>...</think>`) ate the entire `max_tokens` budget. The system prompts in this repo end with `/no_think` to prevent that — if you wrote your own custom prompt, add `/no_think` to it too.

---

## Step 8 — Upload a PDF for RAG

Save your access token to a shell variable so the next commands are short:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

Upload any PDF (replace `sample.pdf` with a real file):

```bash
curl -s -X POST http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample.pdf" \
  -F "tag=product"
```

Check ingestion status (it should go from `indexing` → `ready`):

```bash
curl http://localhost:8000/api/admin/documents -H "Authorization: Bearer $TOKEN"
```

> **CPU is slow at embeddings.** Each chunk takes 6–15 s on CPU. A 10-page PDF can take 1–2 minutes. On GPU it's 50–200 ms per chunk.

After the document hits `ready`, the BM25 sparse index rebuilds automatically. Future suggestions will combine dense (pgvector) + sparse (BM25) retrieval.

---

## Step 9 — Open the admin panel (browser)

Go to `http://localhost:8000/admin` in your browser. It asks for Basic Auth — use `admin@bank.uz` / `changeme` (or whatever you set in `.env`). From here you can upload more PDFs, see indexing status, and delete documents without touching the terminal.

---

## Step 10 — Send a real audio chunk (REST fallback path)

Audio normally streams over WebRTC, but there's a REST fallback for testing. First create a call (must be done as an `agent`, not `admin`):

Create an agent user via the admin API:

```bash
curl -X POST http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"agent1@bank.uz","password":"agent123","role":"agent"}'
```

Log in as the agent and grab their token (`AGENT_TOKEN`). Then start a call and post an audio chunk:

```bash
CALL_ID=$(curl -s -X POST http://localhost:8000/api/calls \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H 'Content-Type: application/json' -d '{}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -s -X POST http://localhost:8000/api/transcribe-chunk \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -F "audio=@chunk.webm" \
  -F "call_id=$CALL_ID" \
  -F "lang_hint=uz"
```

You should get back a JSON object with an `events` array containing transcripts and (if the audio is bank-related) a suggestion.

---

## Step 11 — Run the test suite

```bash
make test
```

68+ tests should pass. Tests use a separate `sales_test` database and don't touch your seeded data.

---

## Common API endpoints (cheat sheet)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Get JWT tokens |
| `GET  /api/auth/me` | Current user info |
| `POST /api/admin/users` | Create a user (admin role required) |
| `POST /api/admin/documents` | Upload PDF/TXT for RAG |
| `GET  /api/calls` | Call history |
| `POST /api/calls` | Start a call (agent role required) |
| `POST /api/transcribe-chunk` | REST fallback audio upload |
| `WS   /ws/signaling?token=` | WebRTC SDP/ICE exchange |
| `WS   /ws/supervisor?token=` | Live feed for supervisors |
| `GET  /healthz` | Readiness probe |
| `GET  /admin` | Browser admin panel (Basic Auth) |

---

## Troubleshooting

Read the symptom in the left column. Don't skip steps.

| Symptom | Cause | Fix |
|---------|-------|-----|
| `docker compose ps` shows `api` as `restarting` | Bad `.env` (missing `JWT_SECRET`, broken line endings) | Re-check `backend/.env`. On Windows use VS Code, not Notepad. |
| `/healthz` returns `ollama_ok: false` | Models not pulled, or Ollama still warming up | `docker compose exec ollama ollama list` — both `qwen3:8b-q4_K_M` and `bge-m3` must appear. If empty, redo Step 3. |
| `/healthz` returns `models_loaded: false` | First boot still warming models | Wait 30–60 s on CPU and retry. |
| `startup.stt_load_failed` in api logs | `WHISPER_MODEL` path doesn't exist | Either set `WHISPER_MODEL=tiny` (Step 4 Option A) or re-run the conversion script (Option B). |
| `startup.llm_warmup_failed` | Ollama isn't ready yet | Wait 30 s, then `docker compose restart api`. |
| Empty LLM reply when calling `chat()` | Qwen3 reasoning tokens consumed `max_tokens` | The repo's prompts already include `/no_think`. If you wrote a custom prompt, append `/no_think` to it. |
| `429 Too Many Requests` on login | Per-IP rate limit (5 logins per minute) | Wait 60 s. |
| Embeddings take 5+ s per chunk | Normal on CPU (bge-m3 is 568M params) | Switch to GPU mode — see [`gpu_setup.md`](gpu_setup.md). |
| `litellm.APIConnectionError: Not Found` | Something pointed `LLM_BASE_URL` at a non-Ollama URL | Make sure `.env` has `LLM_BASE_URL=http://ollama:11434` (no trailing slash, no `/v1`). |

If something else breaks: `docker compose logs api` is the first place to look. The api logs structured JSON — search for `"event":"startup..."` lines.

---

## Where to go next

- [`manual_test_flow.md`](manual_test_flow.md) — full 10-step end-to-end verification, including login, upload, and live call.
- [`gpu_setup.md`](gpu_setup.md) — switch to GPU for production-grade latency (≤ 1.5 s suggestions).
- [`SIGNALING.md`](SIGNALING.md) — how the frontend connects via WebRTC.
- [`architecture.md`](architecture.md) — internal services, the RAG pipeline, and data flow.
- [`qwen_litellm_setup.md`](qwen_litellm_setup.md) — deep dive on the LLM SDK setup, why there's no proxy, and how to swap models.
