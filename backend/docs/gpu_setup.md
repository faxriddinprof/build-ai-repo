# GPU Setup Guide

Running the backend on the Windows RTX 5070 Ti server with full GPU acceleration.

## Requirements

| Component | Minimum |
|-----------|---------|
| GPU | NVIDIA RTX (5070 Ti has 16 GB VRAM — sufficient) |
| Driver | ≥ 531.14 |
| Docker Desktop | ≥ 4.25 with WSL2 backend |
| NVIDIA Container Toolkit | installed in WSL2 |
| VRAM budget | ~1.5 GB (Whisper) + ~5 GB (Qwen3-8B Q4) = **≤ 7 GB** |

---

## Step 1 — Verify GPU is visible in Docker

```bash
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

Expected: GPU name, driver version, CUDA version printed. If this fails, fix the NVIDIA Container Toolkit before continuing.

---

## Step 2 — Clone and configure

```bash
git clone https://github.com/faxriddinprof/build-with-ai-hackathon.git
cd build-with-ai-hackathon

make env          # copies backend/.env.example → backend/.env
```

Edit `backend/.env` — change these values for GPU mode:

```env
# STT — GPU Uzbek model (after conversion in Step 5)
WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
WHISPER_BATCH_SIZE_REALTIME=1
WHISPER_BATCH_SIZE_BATCH=16

# Security — generate a real secret
JWT_SECRET=<run: openssl rand -hex 32>
ADMIN_PASSWORD=<your strong password>
```

Everything else can stay as the default from `.env.example`.

---

## Step 3 — Pull Ollama models (once, ~6 GB)

Start only the infrastructure first so Ollama has time to start:

```bash
make infra
```

Wait ~20 s, then pull models:

```bash
make models-pull
```

This downloads `qwen3:8b-q4_K_M` and `bge-m3` into `static/media/models/` (volume-mounted, survives rebuilds).

Verify:
```bash
make ollama-models
# both models should appear in the list
```

---

## Step 4 — Start the full GPU stack

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Or use the Makefile shortcut:
```bash
make up-gpu
```

Both Ollama and the API container get `--gpus all` from `docker-compose.gpu.yml`.

Watch startup logs:
```bash
make logs
```

Wait for `startup.done`. First boot is slower — Whisper and LLM warm up via dummy inference.

---

## Step 5 — Convert the Uzbek STT model (first time only)

The production Uzbek STT model must be converted to CTranslate2 format before faster-whisper can load it. Do this **after** the stack is running:

```bash
make convert-stt
```

This runs `scripts/convert_stt_model.py` inside the API container. It downloads `Kotib/uzbek_stt_v1` from HuggingFace and writes the converted model to `/app/models/uzbek_stt_v1_ct2` (inside the container volume).

The conversion takes 5–15 minutes depending on download speed. Watch progress:
```bash
make logs
```

After conversion, restart the API so it loads the new model:
```bash
docker compose restart api
make logs   # wait for startup.done again
```

---

## Step 6 — Verify GPU is being used

```bash
# Check VRAM usage (run on the host, not inside Docker)
nvidia-smi

# Expected after warmup:
# Ollama process:  ~5 GB (Qwen3-8B Q4_K_M) + ~0.3 GB (BGE-M3)
# API process:     ~1.5 GB (uzbek_stt_v1_ct2)
# Total:           ~7 GB / 16 GB used
```

```bash
# Health check from another terminal
make health
# { "status": "ok", "db_ok": true, "ollama_ok": true, "models_loaded": true }
```

---

## Step 7 — Run the manual test flow

Follow `backend/docs/manual_test_flow.md` from Step 3 onwards (stack is already up).

Quick smoke test:
```bash
make login    # should return access_token

TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Demo scenario — exercises full GPU pipeline
curl -s http://localhost:8000/api/demo/play/1 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Step 8 — Run automated tests

```bash
make test
# expect: 68+ passed, 0 failed
```

Tests run against a separate `sales_test` database — they don't touch your live data.

---

## Troubleshooting

**`startup.stt_load_failed`** in logs
- Model not converted yet → run `make convert-stt`
- Wrong path in `.env` → check `WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2`

**`startup.llm_warmup_failed`**
- Ollama not healthy yet → wait and check `make ollama-models`
- Models not pulled → run `make models-pull`

**`startup.embed_warmup_failed` (retrying)**
- Normal on first boot if LiteLLM starts before Ollama is ready — it retries 5 times with backoff. Wait for `startup.embed_warmup_done`.

**VRAM OOM**
- Check `nvidia-smi` — if over 14 GB, reduce `WHISPER_COMPUTE_TYPE=int8` in `.env` to halve Whisper VRAM.
- Qwen3-8B Q4_K_M is already the smallest quantisation that keeps Uzbek quality — do not downgrade further.

**`ollama_ok: false` in healthz**
- `curl http://localhost:11434/api/tags` — if empty, models not pulled.
- `docker compose logs ollama` — check for GPU init errors.

**Docker Desktop does not see the GPU**
- Enable WSL2 backend in Docker Desktop → Settings → Resources → WSL Integration.
- Install NVIDIA Container Toolkit for WSL2: https://docs.nvidia.com/cuda/wsl-user-guide/

---

## .env reference (GPU values only)

```env
WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
JWT_SECRET=<openssl rand -hex 32>
ADMIN_EMAIL=admin@bank.uz
ADMIN_PASSWORD=<strong password>
```

All other settings default correctly from `.env.example`.
