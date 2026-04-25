# Architecture — AI Sales Copilot

Full system design: deployment, application layers, data flows, and security model.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  On-Premise Server  (RTX 5070 Ti 16 GB VRAM)                       │
│                                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────────┐  │
│   │ postgres │    │  ollama  │    │ litellm  │    │  FastAPI    │  │
│   │ :5432    │    │ :11434   │    │ :4000    │    │  api :8000  │  │
│   │ pgvector │    │ qwen3-8b │    │ proxy    │    │             │  │
│   │ pg16     │    │ nomic-   │    │          │    │ uvicorn     │  │
│   │          │    │ embed    │    │          │    │ workers=1   │  │
│   └──────────┘    └──────────┘    └──────────┘    └─────────────┘  │
│   Docker Compose — internal network "buildwithai_default"           │
└─────────────────────────────────────────────────────────────────────┘
           ▲                                        ▲
           │ SQL / asyncpg                          │ HTTP / WS
           │                            ┌───────────────────────┐
           │                            │  Browser Clients       │
           │                            │  Agent   :browser      │
           └────────────────────────────│  Supervisor :browser   │
                                        │  Admin   :browser      │
                                        └───────────────────────┘
```

**All inference runs locally.** No external API calls. Single-tenant (one bank instance).

---

## 2. Infrastructure — Docker Services

```
docker-compose.yml
│
├── postgres  (pgvector/pgvector:pg16)
│   Volume: postgres_data
│   Healthcheck: pg_isready -U sales -d sales
│   Exposes: 5432
│
├── ollama  (ollama/ollama)
│   GPU passthrough: nvidia count=1
│   Volume: ollama_data (model weights persist)
│   Healthcheck: GET /api/tags
│   Exposes: 11434
│   Models loaded at runtime (pull once):
│     qwen3:8b-q4_K_M    ~5 GB VRAM
│     nomic-embed-text   ~0.3 GB VRAM
│
├── litellm  (ghcr.io/berriai/litellm:main-latest)
│   Config: ./litellm_config.yaml (read-only mount)
│   depends_on: ollama (healthy)
│   Healthcheck: GET /health
│   Exposes: 4000
│   Role: OpenAI-compatible HTTP proxy → Ollama
│
└── api  (build: ./backend/Dockerfile)
    GPU passthrough: nvidia count=1  ← for faster-whisper
    ENV: DATABASE_URL, LITELLM_BASE_URL from .env
    Volume: ./backend/uploads → /app/uploads
    depends_on: postgres (healthy), litellm (healthy)
    Healthcheck: GET /healthz
    Exposes: 8000
    Restart: unless-stopped
```

**Startup order enforced by healthchecks:** postgres → ollama → litellm → api

---

## 3. Application Layer — FastAPI Structure

```
backend/app/
│
├── main.py           FastAPI instance + lifespan + CORS + /healthz
│   │
│   ├── Lifespan startup hook (blocking, sequential):
│   │   1. compliance_service.load_phrases()
│   │   2. stt_service.load_model()        ← CUDA load, ~2 GB VRAM
│   │   3. stt_service.warmup()            ← dummy 1s silence
│   │   4. llm_service.warmup()            ← dummy 1-token chat
│   │   5. rag_service.embed("salom")      ← assert dim==768
│   │   → _models_loaded = True
│   │
│   └── Routers mounted:
│       /api/auth         auth.py
│       /api/admin/users  admin_users.py
│       /api/admin/documents  admin_documents.py
│       /api/calls        calls.py
│       /api/demo         demo.py
│       /ws/audio         audio_ws.py
│       /ws/supervisor    supervisor_ws.py
│
├── config.py         Pydantic Settings (reads .env)
├── database.py       async SQLAlchemy engine + session factory
├── deps.py           get_db · get_current_user · require_role
└── logging_config.py structlog JSON + _scrub_pii processor
```

---

## 4. Database Schema

```
┌──────────────────────────────────────────────────────────────────┐
│  users                                                           │
│  ─────                                                           │
│  id            String PK (uuid4)                                 │
│  email         String UNIQUE NOT NULL                            │
│  password_hash String NOT NULL   ← bcrypt via passlib           │
│  role          String NOT NULL   ← "admin"|"supervisor"|"agent" │
│  is_active     Boolean DEFAULT true                              │
│  created_at    DateTime                                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │ agent_id FK
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  calls                                                           │
│  ─────                                                           │
│  id                  String PK (uuid4)                           │
│  agent_id            String FK → users.id                        │
│  started_at          DateTime                                    │
│  ended_at            DateTime nullable                           │
│  customer_name       String nullable                             │
│  customer_passport   String nullable  ← NEVER in logs/sup WS    │
│  customer_region     String nullable                             │
│  intake_confirmed_at DateTime nullable                           │
│  transcript          JSONB nullable   ← full turn-by-turn list  │
│  summary             JSONB nullable   ← post-call outcome JSON  │
│  compliance_status   JSONB nullable   ← {phrase_id: ok|missed}  │
└──────────────────────────────────────────────────────────────────┘
                             │ call_id FK
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  suggestions_log                                                 │
│  ───────────────                                                 │
│  id          String PK   call_id FK → calls.id                  │
│  trigger     Text         customer phrase that fired suggestion  │
│  suggestion  Text         full LLM output                       │
│  latency_ms  Integer      end-to-end ms from audio_chunk recv   │
│  created_at  DateTime                                            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  documents                                                       │
│  ─────────                                                       │
│  id          String PK         filename  String                  │
│  tag         String nullable   ← product|script|compliance|faq  │
│  page_count  Integer nullable  chunk_count Integer nullable      │
│  status      String            ← "indexing"|"ready"|"error"     │
│  error_message String nullable uploaded_by FK → users.id        │
│  uploaded_at DateTime                                            │
└────────────────────────────┬─────────────────────────────────────┘
                             │ CASCADE DELETE
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  document_chunks                                                 │
│  ───────────────                                                 │
│  id          String PK                                           │
│  document_id String FK → documents.id  ON DELETE CASCADE         │
│  content     Text NOT NULL                                       │
│  embedding   Vector(768) NOT NULL  ← pgvector column            │
│  page_number Integer    chunk_index Integer                      │
│                                                                  │
│  INDEX: ivfflat(embedding vector_cosine_ops, lists=100)         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. API Surface

```
REST  (Bearer token required on all except /healthz)
──────────────────────────────────────────────────────────────────
POST   /api/auth/login                    → {access_token, refresh_token, role}
POST   /api/auth/refresh                  → {access_token}
GET    /api/auth/me                       → UserResponse

POST   /api/admin/users        [admin]    → UserResponse
GET    /api/admin/users        [admin]    → list[UserResponse]
PATCH  /api/admin/users/:id    [admin]    → UserResponse

POST   /api/admin/documents    [admin]    → 202 {document_id, status}
GET    /api/admin/documents    [admin]    → list[DocumentResponse]
GET    /api/admin/documents/:id [admin]   → DocumentResponse
DELETE /api/admin/documents/:id [admin]   → 204
POST   /api/admin/documents/:id/reindex [admin] → 202

POST   /api/calls              [agent]    → CallResponse
GET    /api/calls              [agent|supervisor] → list
GET    /api/calls/:id          [agent|supervisor] → CallResponse
POST   /api/calls/:id/end      [agent]    → CallResponse
PATCH  /api/calls/:id/intake   [agent]    → CallResponse

GET    /api/demo/scenarios     [any auth] → list[ScenarioResponse]
POST   /api/demo/play          [any auth] → 202 {call_id, status}

GET    /healthz                [public]   → {status, db_ok, ollama_ok, models_loaded}

WebSocket  (?token=<jwt> — browser cannot set auth headers)
──────────────────────────────────────────────────────────────────
WS /ws/audio         [agent]      full-duplex audio stream
WS /ws/supervisor    [supervisor|admin]  read-only event fan-out
```

---

## 6. Real-Time Audio Pipeline (Hot Path)

```
                   WS /ws/audio?token=<jwt>
                           │
              ┌────────────┼────────────────┐
              │  inbound message types      │
              │  start_call                 │
              │  audio_chunk               │ ← main loop
              │  trigger_intake_extraction  │
              │  end_call                   │
              └────────────┬────────────────┘
                           │ audio_chunk: {pcm_b64, sample_rate}
                           ▼
           base64.b64decode → raw PCM bytes
                           │
                           ▼
              ┌────────────────────────────┐
              │ ChunkBuffer  (≥ 1 s PCM)   │ accumulates, then flushes
              │ SpeakerTracker (RMS 0.01 + │ labels agent / customer
              │   800 ms silence window)   │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ stt_service                │ asyncio.to_thread (non-blocking)
              │ faster-whisper large-v3    │ CUDA float16
              │ → {text, language, conf}   │
              └────────────┬───────────────┘
                           │
             ┌─────────────┼──────────────────────────────┐
             │             │                              │
             ▼             ▼                              ▼
   compliance_service  sentiment_service         transcript store
   check_chunk()       analyze()                 append turn
   rapidfuzz 0.85      keyword + LLM             outbound: transcript
   → compliance_tick   → sentiment event         event_bus: supervisor
   → DB update         (change-only)
             │
             ▼
   extraction trigger?
   elapsed ≥ 60s OR trigger msg
             │
             ▼
   extraction_service.extract()  → intake_proposal WS event
             │
             ▼
   guardrail_service.is_bank_related()
   False → DROP ──────────────────────────────────► (nothing)
   True  → continue
             │
             ▼
   rag_service.build_context()
   embed → pgvector search → top-5 chunks
             │
             ▼
   llm_service.get_suggestion()  streaming
   Qwen3-8B Q4 → _looks_uzbek() → retry once
             │
             ▼
   WS outbound: {type:"suggestion", text:[...]}
   DB: suggestions_log INSERT
```

---

## 7. Role & Access Control

```
Role         Can do
────────────────────────────────────────────────────────────
admin        All REST endpoints incl. user CRUD, document CRUD
             WS /ws/audio  WS /ws/supervisor
supervisor   Read-only: GET /api/calls (all agents)
             WS /ws/supervisor (passport scrubbed)
agent        POST/GET /api/calls (own calls only)
             WS /ws/audio
             PATCH /api/calls/:id/intake
────────────────────────────────────────────────────────────

Enforcement:
  REST  → deps.require_role(*roles) → 403 on mismatch
  WS    → JWT decoded from ?token= → 1008 on fail/role mismatch
  DB    → calls queries filtered by agent_id for agent role
```

---

## 8. Security & PII Model

```
Threat                   Mitigation
──────────────────────── ──────────────────────────────────────────────
Passport in supervisor   supervisor_ws._scrub() removes key before send
Passport in logs         logging_config._scrub_pii() structlog processor
Non-bank LLM calls       guardrail_service.is_bank_related() gate
Non-Uzbek LLM output     _looks_uzbek() + retry + drop
Unauthenticated access   deps.get_current_user() on all endpoints
Role escalation          require_role() server-side; role baked into JWT
Large PDF DoS            MAX_PDF_SIZE_MB=50 guard in admin_documents.py
Scanned-PDF bypass       ingest_service checks text == "" → error status
```

---

## 9. In-Memory State (per running process)

```
audio_ws.py globals:
  _transcripts:  dict[call_id, list[{speaker, text, ts}]]
  _call_start:   dict[call_id, float]   ← monotonic time

compliance_service.py:
  _ticked_phrases: dict[call_id, set[phrase_id]]
  _phrases:        list[{id, pattern}]   ← loaded once at startup

sentiment_service.py:
  _last_sentiment: dict[call_id, str]
  _last_llm_call:  dict[call_id, float]  ← rate-limit timestamp

event_bus.py:
  _subscribers: dict[topic, list[asyncio.Queue]]

All state is process-local (uvicorn workers=1).
State is cleared on end_call or WS disconnect.
Persistence: calls table in PostgreSQL (transcript, summary, compliance_status).
```

---

## 10. Service Dependency Graph

```
audio_ws.py
  ├── stt_service          ← faster-whisper (GPU)
  ├── compliance_service   ← rapidfuzz + phrases.json
  ├── sentiment_service    ← keyword heuristic + llm_service
  ├── extraction_service   ← llm_service
  ├── guardrail_service    ← pure Python keyword set
  ├── rag_service          ← litellm aembedding + asyncpg
  ├── llm_service          ← litellm acompletion
  └── event_bus            ← asyncio queues → supervisor_ws

admin_documents.py
  └── ingest_service
        ├── PyMuPDF (fitz)
        └── rag_service    ← embed + asyncpg bulk insert

supervisor_ws.py
  └── event_bus            ← subscribe("supervisor")

auth.py / deps.py
  └── auth_service         ← python-jose + passlib bcrypt

External runtime deps (must be healthy before api starts):
  postgres :5432           ← asyncpg connections via SQLAlchemy pool
  litellm  :4000           ← all acompletion + aembedding calls
  ollama   :11434          ← serves qwen3 + nomic to litellm
```
