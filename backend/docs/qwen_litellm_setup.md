# Qwen3 + LiteLLM Setup Guide (Windows + RTX 5070 Ti)

How to pull the Qwen3 model into Ollama and expose it to the app via LiteLLM on Windows.

---

## Overview

```
FastAPI app  (Docker container, GPU passthrough)
    │  acompletion(model="ollama/qwen3:8b-q4_K_M",
    │              api_base="http://litellm:4000")
    ▼
LiteLLM proxy  :4000  (Docker container)
    │  routes by model_name → litellm_config.yaml
    ▼
Ollama  :11434  (Docker container, GPU passthrough)
    │  serves model from WSL2 GPU
    ▼
qwen3:8b-q4_K_M  (~5 GB VRAM, Q4_K_M quantized)
nomic-embed-text (~0.3 GB VRAM, 768-dim embeddings)
```

On Windows, Docker Desktop uses WSL2 as the backend. GPU passthrough to containers
works via the NVIDIA CUDA on WSL2 driver — no extra toolkit install needed.

---

## 1. Prerequisites

| Requirement | Version / Notes |
|-------------|-----------------|
| Windows | 10 21H2+ or Windows 11 |
| NVIDIA Driver | **531.14+** (Game Ready or Studio) — installs CUDA WSL2 support automatically |
| VRAM | RTX 5070 Ti = 16 GB — budget: Qwen3 ~5 GB + Whisper ~2 GB = **7 GB used** |
| Docker Desktop | **4.26+** with WSL2 backend enabled |
| WSL2 | Installed and set as default (`wsl --set-default-version 2`) |
| Ollama | Windows native installer **or** Docker container (see §2) |
| Disk | ≈6 GB for model weights (stored in Docker volume `ollama_data`) |
| PowerShell | 7+ recommended (`winget install Microsoft.PowerShell`) |

### Verify GPU is visible to Docker

Open PowerShell and run:

```powershell
# Check driver
nvidia-smi
# Should show RTX 5070 Ti, driver version, CUDA version

# Check Docker can see GPU
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
# Should print the same GPU table inside the container
```

If `docker run --gpus all` fails, open Docker Desktop → Settings → Resources → WSL Integration
and enable it for your WSL2 distro. Restart Docker Desktop.

---

## 2. Pull the Qwen3 Model

### Option A — Ollama Windows App (recommended)

Download and install Ollama from `https://ollama.com/download/windows`

After install, Ollama runs as a background service. Open PowerShell:

```powershell
ollama pull qwen3:8b-q4_K_M
ollama pull nomic-embed-text
```

Verify:
```powershell
ollama list
# NAME                     ID              SIZE    MODIFIED
# qwen3:8b-q4_K_M         ...             4.9 GB  ...
# nomic-embed-text         ...             274 MB  ...
```

When using Option A, the `ollama` service in `docker-compose.yml` is **not needed** —
change `api_base` in `litellm_config.yaml` to point to the host:

```yaml
api_base: http://host.docker.internal:11434
```

### Option B — Ollama inside Docker (no host install)

This uses the ollama container with GPU passthrough (already configured in `docker-compose.yml`):

```powershell
docker compose up ollama -d

# Wait ~30s for container to start, then pull models inside it:
docker compose exec ollama ollama pull qwen3:8b-q4_K_M
docker compose exec ollama ollama pull nomic-embed-text
```

Models persist in the `ollama_data` Docker volume across restarts.

Verify Ollama API:
```powershell
curl.exe http://localhost:11434/api/tags
# → {"models":[{"name":"qwen3:8b-q4_K_M", ...}]}
```

> **Note:** Use `curl.exe` not `curl` in PowerShell — `curl` is an alias for
> `Invoke-WebRequest` which has a different interface.

---

## 3. LiteLLM Configuration

File: `litellm_config.yaml` (repo root, read-only mounted into the litellm container)

```yaml
model_list:
  - model_name: ollama/qwen3:8b-q4_K_M
    litellm_params:
      model: ollama/qwen3:8b-q4_K_M
      api_base: http://ollama:11434          # Option B: ollama in Docker
      # api_base: http://host.docker.internal:11434  # Option A: ollama on host

  - model_name: ollama/nomic-embed-text
    litellm_params:
      model: ollama/nomic-embed-text
      api_base: http://ollama:11434          # same as above

general_settings:
  master_key: "sk-litellm-local"
  request_timeout: 120
```

Start LiteLLM:
```powershell
docker compose up litellm -d
```

Verify:
```powershell
curl.exe http://localhost:4000/health
# → {"status":"healthy"}

curl.exe -H "Authorization: Bearer sk-litellm-local" http://localhost:4000/v1/models
```

---

## 4. App Configuration

Copy `.env.example` to `.env` in the repo root:
```powershell
Copy-Item .env.example .env
```

Minimum settings to edit in `.env`:
```env
JWT_SECRET=your-strong-random-secret-here

# LiteLLM proxy — containers talk over Docker internal network
LITELLM_BASE_URL=http://litellm:4000

LLM_MODEL=ollama/qwen3:8b-q4_K_M
EMBEDDING_MODEL=ollama/nomic-embed-text
EMBEDDING_DIM=768
LLM_TIMEOUT_SECONDS=5
```

---

## 5. Smoke Test (PowerShell)

```powershell
# 1. Start infra
docker compose up postgres ollama litellm -d

# 2. Wait for healthy status (~30s)
docker compose ps

# 3. LiteLLM health
curl.exe http://localhost:4000/health

# 4. Test Qwen3 chat completion
$body = '{"model":"ollama/qwen3:8b-q4_K_M","messages":[{"role":"user","content":"Salom!"}],"max_tokens":30}'
curl.exe -X POST http://localhost:4000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer sk-litellm-local" `
  -d $body

# 5. Test embedding (check vector length = 768)
$emb = '{"model":"ollama/nomic-embed-text","input":["kredit foizi"]}'
curl.exe -X POST http://localhost:4000/v1/embeddings `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer sk-litellm-local" `
  -d $emb

# 6. App health (after starting full stack)
curl.exe http://localhost:8000/healthz
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}
```

---

## 6. Uzbek Language Enforcement

Qwen3 defaults to English or Russian without constraints. The app enforces Uzbek at two layers:

**Layer 1 — System prompt** (`app/prompts/system_uz.py`):
```
Siz O'zbekiston bank muassasasining savdo yordamchisisiz.
FAQAT O'ZBEK TILIDA javob ber. Boshqa tillarda javob berma.
```

**Layer 2 — `_looks_uzbek()` post-check** (`services/llm_service.py`):
- Word-set overlap with known Uzbek bank vocabulary
- Uzbek-specific characters: `ʻ ʼ o' g' sh ch`
- Cyrillic ratio check (high Cyrillic = Russian = reject)
- Non-Uzbek → one retry with explicit reminder → drop on second failure

---

## 7. Switching Qwen Variant

```powershell
# Pull new variant
docker compose exec ollama ollama pull qwen3:14b-q4_K_M
```

Update `litellm_config.yaml`:
```yaml
  - model_name: ollama/qwen3:14b-q4_K_M
    litellm_params:
      model: ollama/qwen3:14b-q4_K_M
      api_base: http://ollama:11434
```

Update `.env`:
```env
LLM_MODEL=ollama/qwen3:14b-q4_K_M
```

```powershell
docker compose restart litellm api
```

VRAM budget on RTX 5070 Ti (16 GB):

| Model | Quant | VRAM | Fits with Whisper? |
|-------|-------|------|--------------------|
| qwen3:8b-q4_K_M | 4-bit | ~5 GB | Yes (7 GB total) |
| qwen3:8b-q8_0 | 8-bit | ~9 GB | Tight (11 GB total) |
| qwen3:14b-q4_K_M | 4-bit | ~9 GB | Tight (11 GB total) |
| qwen3:32b-q4_K_M | 4-bit | ~20 GB | No — exceeds 16 GB |

---

## 8. Troubleshooting (Windows)

**`docker: Error response from daemon: could not select device driver "nvidia"`**
→ Docker Desktop WSL2 integration not enabled. Go to Docker Desktop → Settings →
Resources → WSL Integration → enable for your distro → restart Docker Desktop.

**`curl` shows Invoke-WebRequest syntax error**
→ Use `curl.exe` explicitly in PowerShell to call the real curl binary, not the PS alias.

**LiteLLM 404 for model**
```json
{"error": {"message": "No model found for ollama/qwen3:8b-q4_K_M"}}
```
→ `model_name` in `litellm_config.yaml` must exactly match `LLM_MODEL` in `.env`.

**Ollama model not found inside container**
```json
{"error": "model 'qwen3:8b-q4_K_M' not found"}
```
→ Pull was done on host Ollama but container Ollama has its own storage.
Use Option A (`host.docker.internal`) or re-pull inside the container (Option B).

**First request times out**
→ Cold-start is expected. The app warmup fires a dummy request at boot.
Set `LLM_TIMEOUT_SECONDS=30` in `.env` during first boot, revert to `5` after.

**CUDA OOM during startup**
→ Whisper (2 GB) + Qwen3 (5 GB) = 7 GB. If other apps hold VRAM (e.g. GeForce Experience),
close them. Or reduce whisper: set `WHISPER_COMPUTE_TYPE=int8` in `.env`.

**Line-ending issues with `.env` or YAML files**
→ If edited in Notepad, files may have CRLF endings. Use VS Code or run:
```powershell
(Get-Content .env) | Set-Content .env   # re-saves with LF on modern PS
```
Or configure Git: `git config core.autocrlf input`
