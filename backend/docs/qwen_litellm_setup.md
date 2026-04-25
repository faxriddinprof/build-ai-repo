# Qwen3 + LiteLLM Setup Guide

How to pull the Qwen3 model into Ollama and expose it to the app via LiteLLM.

---

## Overview

```
FastAPI app
    │  acompletion(model="ollama/qwen3:8b-q4_K_M",
    │              api_base="http://litellm:4000")
    ▼
LiteLLM proxy  :4000
    │  routes by model_name from litellm_config.yaml
    ▼
Ollama  :11434
    │  serves model locally
    ▼
qwen3:8b-q4_K_M  (~5 GB VRAM, Q4_K_M quantized)
```

LiteLLM acts as a unified OpenAI-compatible gateway. The app never talks directly to Ollama.

---

## 1. Prerequisites

| Requirement | Minimum |
|-------------|---------|
| GPU | NVIDIA with ≥6 GB VRAM (RTX 3060 or better) |
| VRAM budget | Qwen3 8B Q4_K_M ≈ 5 GB + whisper large-v3 ≈ 2 GB = 7 GB total |
| CUDA | 11.8+ (check: `nvidia-smi`) |
| Docker | 24+ with nvidia-container-toolkit |
| Ollama | CLI or Docker image |
| Disk | ≈6 GB free for model weights |

Install nvidia-container-toolkit if not present:
```bash
# Ubuntu / Debian
distribution=$(. /etc/os-release && echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

---

## 2. Pull the Qwen3 Model

### Option A — Ollama CLI (host machine)

```bash
ollama pull qwen3:8b-q4_K_M
ollama pull nomic-embed-text        # also needed for RAG embeddings
```

Verify:
```bash
ollama list
# NAME                     ID              SIZE    MODIFIED
# qwen3:8b-q4_K_M         ...             4.9 GB  ...
# nomic-embed-text         ...             274 MB  ...
```

### Option B — via Docker Compose (automatic)

The `ollama` service in `docker-compose.yml` mounts a volume so pulled models persist across container restarts. Pull inside the running container:

```bash
docker compose up ollama -d
docker compose exec ollama ollama pull qwen3:8b-q4_K_M
docker compose exec ollama ollama pull nomic-embed-text
```

Check the Ollama API is alive:
```bash
curl http://localhost:11434/api/tags
# → {"models":[{"name":"qwen3:8b-q4_K_M", ...}]}
```

---

## 3. LiteLLM Configuration

File: `litellm_config.yaml` (repo root, mounted into the litellm container)

```yaml
model_list:
  - model_name: ollama/qwen3:8b-q4_K_M
    litellm_params:
      model: ollama/qwen3:8b-q4_K_M
      api_base: http://ollama:11434   # container DNS name

  - model_name: ollama/nomic-embed-text
    litellm_params:
      model: ollama/nomic-embed-text
      api_base: http://ollama:11434

general_settings:
  master_key: "sk-litellm-local"    # used as LITELLM_API_KEY in .env
  request_timeout: 120              # seconds; Qwen3 first-token can be slow cold
```

`model_name` is the identifier callers use. `litellm_params.model` is what LiteLLM sends to Ollama. They must match exactly — including the `ollama/` prefix.

Start LiteLLM:
```bash
docker compose up litellm -d
```

Verify:
```bash
curl http://localhost:4000/health
# → {"status":"healthy"}

curl http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-litellm-local"
# → lists ollama/qwen3:8b-q4_K_M and ollama/nomic-embed-text
```

---

## 4. App Configuration

In `.env` (copy from `.env.example` and fill in):

```env
# LiteLLM proxy — app talks to this, not directly to Ollama
LITELLM_BASE_URL=http://litellm:4000   # inside Docker Compose network
# LITELLM_BASE_URL=http://localhost:4000  # if running app outside Docker

LLM_MODEL=ollama/qwen3:8b-q4_K_M
EMBEDDING_MODEL=ollama/nomic-embed-text
EMBEDDING_DIM=768

LLM_MAX_TOKENS_SUGGESTION=100
LLM_MAX_TOKENS_EXTRACTION=200
LLM_MAX_TOKENS_SUMMARY=400
LLM_TIMEOUT_SECONDS=5
```

`LLM_MODEL` must match the `model_name` in `litellm_config.yaml` exactly.

---

## 5. How the App Calls LiteLLM

All LLM calls go through `app/services/llm_service.py` using the `litellm` Python library (not raw HTTP):

```python
from litellm import acompletion

resp = await acompletion(
    model=settings.LLM_MODEL,          # "ollama/qwen3:8b-q4_K_M"
    messages=[...],
    max_tokens=settings.LLM_MAX_TOKENS_SUGGESTION,
    temperature=0.3,
    stream=True,
    api_base=settings.LITELLM_BASE_URL, # "http://litellm:4000"
    timeout=float(settings.LLM_TIMEOUT_SECONDS),
)
```

Embeddings go through `app/services/rag_service.py`:

```python
from litellm import aembedding

resp = await aembedding(
    model=settings.EMBEDDING_MODEL,     # "ollama/nomic-embed-text"
    input=[text],
    api_base=settings.LITELLM_BASE_URL,
)
vector = resp.data[0]["embedding"]      # list[float], len == 768
```

---

## 6. Uzbek Language Enforcement

Qwen3 is multilingual and will default to English or Russian if not constrained. The app enforces Uzbek output at two layers:

**Layer 1 — System prompt** (`app/prompts/system_uz.py`):
```
Siz O'zbekiston bank muassasasining savdo yordamchisisiz.
FAQAT O'ZBEK TILIDA javob ber. Boshqa tillarda javob berma.
```

**Layer 2 — Post-output assertion** (`llm_service._looks_uzbek()`):
- Checks for Uzbek vocabulary intersection
- Checks for Uzbek-specific characters (`ʻ`, `ʼ`, `o'`, `g'`, `sh`, `ch`)
- Checks Cyrillic ratio (Russian = discard)
- Non-Uzbek output → one retry with explicit reminder
- Still non-Uzbek → drop and log warning, emit nothing to client

To tune language detection for your deployment, edit `_UZ_WORDS` set in `llm_service.py`.

---

## 7. Smoke Test

Full round-trip test (infra must be up):

```bash
# 1. Start infra
docker compose up postgres ollama litellm -d

# 2. Wait ~10 s for LiteLLM to load, then:
curl -s http://localhost:4000/health

# 3. Test Qwen3 completion directly via LiteLLM
curl -s http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-litellm-local" \
  -d '{
    "model": "ollama/qwen3:8b-q4_K_M",
    "messages": [{"role":"user","content":"Salom, qanday yordam bera olaman?"}],
    "max_tokens": 50
  }' | python3 -m json.tool

# 4. Test embedding directly via LiteLLM
curl -s http://localhost:4000/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-litellm-local" \
  -d '{
    "model": "ollama/nomic-embed-text",
    "input": ["kredit foizi"]
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data'][0]['embedding']))"
# → 768

# 5. App warm-up verification (app must be running)
curl http://localhost:8000/healthz
# → {"status":"ok","db_ok":true,"ollama_ok":true,"models_loaded":true}
```

---

## 8. Switching to a Different Qwen Variant

To use a different quantization or size, update three places:

**Step 1** — Pull the new model:
```bash
docker compose exec ollama ollama pull qwen3:14b-q4_K_M
```

**Step 2** — Add to `litellm_config.yaml`:
```yaml
  - model_name: ollama/qwen3:14b-q4_K_M
    litellm_params:
      model: ollama/qwen3:14b-q4_K_M
      api_base: http://ollama:11434
```

**Step 3** — Update `.env`:
```env
LLM_MODEL=ollama/qwen3:14b-q4_K_M
```

Restart LiteLLM and the API container:
```bash
docker compose restart litellm api
```

VRAM estimate for common variants:

| Model | Quantization | VRAM |
|-------|-------------|------|
| qwen3:8b-q4_K_M | 4-bit | ~5 GB |
| qwen3:8b-q8_0 | 8-bit | ~9 GB |
| qwen3:14b-q4_K_M | 4-bit | ~9 GB |
| qwen3:32b-q4_K_M | 4-bit | ~20 GB |

RTX 5070 Ti has 16 GB — safe budget with whisper is `qwen3:8b` or `qwen3:14b` q4.

---

## 9. Troubleshooting

**LiteLLM returns 404 for model**
```
{"error": {"message": "No model found for ollama/qwen3:8b-q4_K_M"}}
```
→ `model_name` in config doesn't match what the app sends. Both must be `ollama/qwen3:8b-q4_K_M`.

**Ollama returns model not found**
```
{"error": "model 'qwen3:8b-q4_K_M' not found"}
```
→ Model not pulled yet. Run `ollama pull qwen3:8b-q4_K_M` inside the ollama container.

**Timeout on first request after startup**
→ Expected on cold start. The app's lifespan warmup (`llm_service.warmup()`) sends a dummy request at boot to load weights into GPU. Set `LLM_TIMEOUT_SECONDS=30` during first boot if needed.

**Out of memory (CUDA OOM)**
→ whisper + Qwen3 exceed GPU budget. Options:
  - Use `qwen3:8b-q4_K_M` (not q8 or larger)
  - Set `WHISPER_COMPUTE_TYPE=int8` in `.env` to reduce whisper footprint
  - Use `WHISPER_MODEL=medium` (saves ~1 GB, small accuracy trade-off)

**Response not in Uzbek**
→ Check system prompt is loading (`app/prompts/system_uz.py`). Increase `temperature` from 0.3 to 0.1 for more deterministic output. Extend `_UZ_WORDS` set if domain vocabulary is missing.
