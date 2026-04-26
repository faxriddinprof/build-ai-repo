# LLM + Embedding Setup (Qwen3 + bge-m3 via Ollama)

How the API talks to its local language and embedding models.

> **TL;DR:** API uses the `litellm` Python **SDK** to POST directly to `http://ollama:11434/api/{generate,embed}`. There is **no LiteLLM proxy container**. Three services total: `postgres`, `ollama`, `api`.

---

## Data path

```
┌──────────────┐       ┌──────────────────────────┐  ┌──────────────────┐
│   FastAPI    │  SDK  │ litellm.acompletion()    │  │   Ollama HTTP    │
│   (api)      │──────▶│  api_base=$LLM_BASE_URL  │─▶│  /api/generate   │
│              │       │  model=ollama/qwen3:...  │  │  /api/embed      │
└──────────────┘       └──────────────────────────┘  └────────┬─────────┘
                                                              │
                                                     qwen3:8b-q4_K_M (~5 GB)
                                                     bge-m3 (~1.2 GB)
```

The SDK sees `model="ollama/..."`, picks the Ollama provider, and POSTs to Ollama-native endpoints (`/api/generate` for chat, `/api/embed` for embeddings).

> Earlier versions of this project ran a separate LiteLLM **proxy** container at `:4000` between the SDK and Ollama. It was removed because the SDK speaks Ollama-native paths but the proxy only exposes OpenAI-compat (`/v1/...`), causing 404s on every call. Direct SDK → Ollama is simpler and one fewer hop.

---

## Required `.env` settings

```env
LLM_BASE_URL=http://ollama:11434           # SDK api_base
LLM_API_KEY=sk-bank-internal-key           # ignored by Ollama; harmless
LLM_MODEL=ollama/qwen3:8b-q4_K_M           # SDK model id (ollama/ prefix routes correctly)
EMBEDDING_MODEL=ollama/bge-m3
EMBEDDING_DIM=1024                         # bge-m3 dim — must match the model

LLM_MAX_TOKENS_SUGGESTION=100              # raise if you remove /no_think
LLM_MAX_TOKENS_EXTRACTION=200
LLM_MAX_TOKENS_SUMMARY=400
LLM_TIMEOUT_SECONDS=5                      # raise temporarily on cold-start
```

---

## Pulling models

Models live inside the Ollama container's volume (bind-mounted from `static/media/models/`):

```bash
docker compose exec ollama ollama pull qwen3:8b-q4_K_M
docker compose exec ollama ollama pull bge-m3

# Verify
curl http://localhost:11434/api/tags
# → {"models":[{"name":"qwen3:8b-q4_K_M",...},{"name":"bge-m3:latest",...}]}
```

| Model | Size | VRAM (loaded) |
|-------|------|---------------|
| qwen3:8b-q4_K_M | 4.9 GB | ~5 GB |
| bge-m3:latest | 1.2 GB | ~0.5 GB |

---

## Qwen3 thinking mode (`/no_think`)

Qwen3-8B emits internal `<think>...</think>` tokens by default before the actual answer. With `LLM_MAX_TOKENS_SUGGESTION=100`, those tokens consume the entire budget and the user sees an **empty reply**.

The fix is built into the prompts (`backend/app/prompts/system_uz.py`, `extraction_uz.py`, `summary_uz.py`) — each ends with `/no_think`, which tells Qwen3 to skip reasoning and answer directly.

If you write a custom prompt, add `/no_think` somewhere in the system or user message, or raise `LLM_MAX_TOKENS_*` to ~500–1000 to leave room for thinking tokens.

---

## Smoke tests

### A. Ollama directly (fastest)

```bash
curl -s http://localhost:11434/api/generate -d '{
  "model":"qwen3:8b-q4_K_M",
  "prompt":"Salom! Bir jumla bilan o'\''zingni tanishtir.",
  "stream":false
}'
```

Expected: `{"response":"Salom! Men ...", "total_duration": ...}`.

GPU: ~1–3 s. CPU: ~10–15 s.

### B. Through the app's SDK code path

```bash
docker compose exec -T api python -c "
import asyncio
from app.config import settings
from app.services.llm_service import chat
print('LLM_BASE_URL =', settings.LLM_BASE_URL)
print(asyncio.run(chat(
    messages=[{'role':'user','content':'Depozit foizlari qanday?'}],
    max_tokens=200, timeout=120.0,
)))
"
```

This proves `llm_service.chat()` end-to-end: env vars read, SDK routes correctly, Ollama responds, text returned to caller.

### C. Embedding (bge-m3 → 1024-dim)

```bash
docker compose exec -T api python -c "
import asyncio
from app.services.rag_service import embed
v = asyncio.run(embed('kredit foizi'))
print('dim:', len(v), 'first 5:', v[:5])
"
# → dim: 1024 first 5: [0.0123, -0.0456, ...]
```

If `dim` is anything other than 1024, your `EMBEDDING_DIM` and the actual model disagree — pgvector will refuse the inserts.

### D. End-to-end through the full pipeline

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Demo scenario 1 — exercises STT + guardrail + RAG + LLM
curl -s http://localhost:8000/api/demo/play/1 \
  -H "Authorization: Bearer $TOKEN"
```

(Requires WAV files in `backend/demo/audio/` — see `backend/demo/scenarios.json` for filenames.)

---

## Switching the LLM

```bash
# Pull a new variant
docker compose exec ollama ollama pull qwen3:14b-q4_K_M
```

Update `backend/.env`:

```env
LLM_MODEL=ollama/qwen3:14b-q4_K_M
```

Recreate the api container:

```bash
docker compose up -d api
```

VRAM budget on RTX 5070 Ti (16 GB):

| Model | Quant | VRAM | Fits with bge-m3 + uzbek_stt? |
|-------|-------|------|-------------------------------|
| qwen3:8b-q4_K_M | 4-bit | ~5 GB | Yes (7 GB total) |
| qwen3:8b-q8_0 | 8-bit | ~9 GB | Tight (11 GB total) |
| qwen3:14b-q4_K_M | 4-bit | ~9 GB | Tight (11 GB total) |
| qwen3:32b-q4_K_M | 4-bit | ~20 GB | No — exceeds 16 GB |

---

## Switching the embedding model

bge-m3 (1024-dim) is the project default. To switch (e.g. to nomic-embed-text-v2-moe at 768-dim):

```bash
docker compose exec ollama ollama pull nomic-embed-text-v2-moe
```

Update `.env`:

```env
EMBEDDING_MODEL=ollama/nomic-embed-text-v2-moe
EMBEDDING_DIM=768
```

Then create + apply an Alembic migration that ALTERs the `document_chunks.embedding` column from `vector(1024)` to `vector(768)`. There's no in-place re-embed — you'll need to delete and re-upload all documents.

---

## Optional: add a LiteLLM proxy back

If your team mandates a centralized LLM gateway (rate-limiting, cost tracking, model fallback to OpenAI/Anthropic):

1. Add the proxy back to `docker-compose.yml`:
   ```yaml
   litellm:
     image: ghcr.io/berriai/litellm:main-latest
     command: ["--config", "/app/litellm_config.yaml", "--port", "4000"]
     volumes:
       - ./litellm_config.yaml:/app/litellm_config.yaml:ro
     ports: ["4000:4000"]
     depends_on:
       ollama:
         condition: service_healthy
   ```
2. Create `litellm_config.yaml` mapping models to Ollama backends and setting `general_settings.master_key`.
3. Switch `llm_service.py` and `rag_service.py` to use `model="openai/qwen3:..."` (OpenAI-compat naming) — this routes the SDK to `/v1/chat/completions` and `/v1/embeddings`, which the LiteLLM proxy DOES expose.
4. Set `LLM_BASE_URL=http://litellm:4000` and `LLM_API_KEY=<litellm master_key>`.

Not required for the default setup — direct Ollama is simpler and faster.

---

## Uzbek language enforcement

Qwen3 defaults to English/Russian for ambiguous prompts. Enforced at two layers:

**Layer 1 — System prompt** (`app/prompts/system_uz.py`):
```
... ALWAYS write your response in UZBEK LANGUAGE ONLY. ...
/no_think
```

**Layer 2 — `_looks_uzbek()` post-check** (`app/services/llm_service.py`):
- Word-set overlap with known Uzbek bank vocabulary
- Uzbek-specific markers: `ʻ ʼ o' g' sh ch ng`
- Cyrillic ratio (>5 chars + no Uzbek markers → reject as Russian)
- Non-Uzbek → one retry with explicit reminder → drop on second failure (logged as `llm.language_enforcement_failed`)

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `litellm.APIConnectionError: ConnectionError` | `LLM_BASE_URL` unreachable | `docker compose exec api curl http://ollama:11434/api/tags` — should return models list |
| `litellm.APIConnectionError: Not Found` | SDK hitting a proxy that doesn't speak Ollama-native | Ensure `LLM_BASE_URL=http://ollama:11434` (Ollama, not a proxy) |
| Empty LLM reply | `<think>` tokens consumed `max_tokens` | Add `/no_think` to system prompt OR raise `LLM_MAX_TOKENS_*` |
| `model 'qwen3:8b-q4_K_M' not found` | Model not pulled inside Ollama container | `docker compose exec ollama ollama pull qwen3:8b-q4_K_M` |
| Embedding dim mismatch (`Expected 1024, got 768`) | `.env` and model disagree | Re-pull bge-m3 or fix `EMBEDDING_DIM` to 768 |
| Slow first request | Cold-start (model loads into VRAM) | Warmup runs at app startup; if first user request is still slow, raise `LLM_TIMEOUT_SECONDS` to 30 temporarily |
| `init: embeddings required but some input tokens were not marked as outputs -> overriding` in Ollama logs | Benign warning specific to bge-m3 | Ignore — embeddings still return correctly |
