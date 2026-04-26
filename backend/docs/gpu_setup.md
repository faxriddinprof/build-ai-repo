# GPU Setup Guide

Running the full stack on a Windows RTX 5070 Ti server with NVIDIA GPU passthrough into Docker.

For the simpler CPU-only walkthrough, see [`quickstart.md`](quickstart.md). This guide is the GPU overlay — most steps are the same, only the compose command and a few `.env` values differ.

## Requirements

| Component | Minimum |
|-----------|---------|
| GPU | NVIDIA RTX (RTX 5070 Ti = 16 GB VRAM — sufficient) |
| Driver | ≥ 531.14 (installs CUDA-on-WSL2 automatically) |
| Docker Desktop | ≥ 4.25 with WSL2 backend |
| WSL2 | enabled (`wsl --set-default-version 2`) |
| VRAM budget | ~1.5 GB Whisper + ~5 GB Qwen3 + ~0.5 GB BGE-M3 = **≤ 7 GB** |

---

## Step 1 — Verify GPU is visible in Docker

```powershell
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

If this prints the GPU table, you're good. If it fails:
- Docker Desktop → Settings → Resources → WSL Integration → enable for your distro
- Restart Docker Desktop and try again

---

## Step 2 — Clone and configure

```powershell
git clone https://github.com/faxriddinprof/build-with-ai-hackathon.git
cd build-with-ai-hackathon

Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env` for GPU mode:

```env
# STT — Uzbek model (set after Step 5 conversion)
WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
WHISPER_BATCH_SIZE_REALTIME=1
WHISPER_BATCH_SIZE_BATCH=16

# Required
JWT_SECRET=<run: openssl rand -hex 32>

# Optional — change before going live
ADMIN_PASSWORD=<your strong password>
```

Everything else (`LLM_BASE_URL`, `LLM_MODEL`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`, etc.) keeps the defaults from `.env.example`.

You also need to swap the CPU torch wheel in `backend/requirements.txt` for a CUDA wheel:

```diff
-# CPU build of torch — for GPU server, swap to https://download.pytorch.org/whl/cu121 and drop the +cpu suffix.
---extra-index-url https://download.pytorch.org/whl/cpu
--torch==2.11.0+cpu
+--extra-index-url https://download.pytorch.org/whl/cu121
+torch==2.11.0
 transformers==5.6.2
```

(Only matters if you re-run `convert_stt_model.py`. The conversion itself runs on CPU even on a GPU host — it just runs a bit faster with CUDA available.)

---

## Step 3 — Bring up the stack with GPU

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

`docker-compose.gpu.yml` adds `--gpus all` reservations to both `ollama` and `api`. The `postgres` service doesn't need GPU.

Watch logs:
```powershell
docker compose logs -f api
```

---

## Step 4 — Pull Ollama models (~6 GB, once)

```powershell
docker compose exec ollama ollama pull qwen3:8b-q4_K_M
docker compose exec ollama ollama pull bge-m3

# Verify
curl.exe http://localhost:11434/api/tags
```

> **PowerShell note:** use `curl.exe`, not `curl` — the latter is an alias for `Invoke-WebRequest` with a different syntax.

Models are stored in `static\media\models\` (bind-mounted from the host) and survive rebuilds.

---

## Step 5 — Convert the Uzbek STT model (~770 MB output, runs once)

```powershell
docker compose exec api python scripts/convert_stt_model.py
```

The script uses `ct2-transformers-converter` (already in `requirements.txt`) and writes the int8-quantized CTranslate2 model to `/app/models/uzbek_stt_v1_ct2/` on the `whisper_models` named volume.

Conversion takes 5–15 min depending on download speed. First-run output:

```
Converting Kotib/uzbek_stt_v1 → /app/models/uzbek_stt_v1_ct2 ...
Conversion complete: /app/models/uzbek_stt_v1_ct2
Set in .env: WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
```

Recreate the api container so the new env var loads:

```powershell
docker compose up -d api
docker compose logs -f api
# wait for startup.done
```

---

## Step 6 — Verify GPU is being used

```powershell
nvidia-smi
```

Expected processes:

| Process | VRAM |
|---------|------|
| Ollama (qwen3 + bge-m3) | ~5.5 GB |
| API (faster-whisper uzbek_stt_v1) | ~1.5 GB |
| **Total** | ~7 GB / 16 GB |

```powershell
curl.exe http://localhost:8000/healthz
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}
```

---

## Step 7 — Migrations + seed admin

The api container runs `alembic upgrade head` automatically at startup. To create the admin user:

```powershell
docker compose exec api python scripts/seed_admin.py
```

---

## Step 8 — Manual test flow

Follow [`manual_test_flow.md`](manual_test_flow.md) from Step 3 (auth) onwards. Steps 7 (`/api/transcribe-chunk`) and 8 (`/api/demo/play/{id}`) are the most realistic — they exercise the full STT → guardrail → RAG → LLM chain on GPU.

Quick smoke test of the GPU pipeline:

```powershell
$body = '{"model":"qwen3:8b-q4_K_M","prompt":"Salom! O'\''zbek tilida bitta jumla bilan o'\''zingni tanishtir.","stream":false}'
curl.exe -X POST http://localhost:11434/api/generate `
  -H "Content-Type: application/json" -d $body

# On GPU you should see total_duration ≈ 1-3 s for ~30 tokens.
# On CPU it's ~10-15 s.
```

---

## Step 9 — Run automated tests

```powershell
docker compose exec api pytest -q
# expect: 68+ passed
```

Tests use a separate `sales_test` database — they don't touch your live data.

---

## Troubleshooting

**`startup.stt_load_failed: model … does not exist`**
- Conversion not run yet → `docker compose exec api python scripts/convert_stt_model.py`
- Wrong path in `.env` → must be `WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2`
- `whisper_models` volume not mounted → check `docker compose config | grep whisper_models`

**`startup.llm_warmup_failed: ConnectionError`**
- Ollama not healthy yet → wait ~30 s; check `docker compose ps`
- Models not pulled → `docker compose exec ollama ollama list`

**Empty LLM reply / `llm.language_enforcement_failed`**
- Qwen3 reasoning tokens ate the whole `max_tokens` budget. The system prompt now ends with `/no_think` to disable thinking mode — make sure you didn't override it.

**`startup.embed_warmup_failed (attempt N/5)`**
- Normal on first boot — Ollama needs ~30 s to load bge-m3. Auto-retries 5× with backoff.

**VRAM OOM**
- Check `nvidia-smi` — close GeForce Experience / browser GPU acceleration if VRAM is high.
- Drop Whisper to int8: `WHISPER_COMPUTE_TYPE=int8` (saves ~700 MB).
- Don't downgrade Qwen3 below Q4_K_M — Uzbek quality drops.

**`docker: could not select device driver "nvidia"`**
- Docker Desktop WSL2 integration disabled. Settings → Resources → WSL Integration → enable + restart.

**`ollama_ok: false`**
- `curl.exe http://localhost:11434/api/tags` — empty response means models not pulled.
- `docker compose logs ollama` — check for `cuda init failed`.

**Line-ending issues in `.env`**
- Use VS Code or `git config core.autocrlf input`. Notepad's CRLF can break parsers.

---

## .env reference (GPU values)

```env
JWT_SECRET=<openssl rand -hex 32>

LLM_BASE_URL=http://ollama:11434
LLM_MODEL=ollama/qwen3:8b-q4_K_M
EMBEDDING_MODEL=ollama/bge-m3
EMBEDDING_DIM=1024

WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
WHISPER_BATCH_SIZE_REALTIME=1
WHISPER_BATCH_SIZE_BATCH=16

ADMIN_EMAIL=admin@bank.uz
ADMIN_PASSWORD=<strong password>
```

All other settings default correctly from `.env.example`.

---

## Architecture note — no LiteLLM proxy

The API uses the `litellm` Python **SDK** to talk to Ollama directly:

```
api  ──litellm SDK──>  http://ollama:11434/api/{generate,embed}
```

There is no separate LiteLLM proxy container — `docker-compose.yml` defines exactly three services (`postgres`, `ollama`, `api`). The SDK speaks Ollama-native HTTP, which is all this project needs. If you ever want a centralized LLM gateway (multi-team API keys, fallback routing, cost tracking), you'd add a `litellm` proxy and switch `LLM_MODEL` to the OpenAI-compat naming — but that's a separate, explicit step.
