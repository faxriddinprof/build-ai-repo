# Architecture — AI Sales Copilot

Full system design: deployment, application layers, data flows, and security model.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  On-Premise Server  (RTX 5070 Ti 16 GB VRAM)                       │
│                                                                     │
│   ┌──────────┐         ┌──────────┐         ┌─────────────┐        │
│   │ postgres │         │  ollama  │         │  FastAPI    │        │
│   │ :5432    │         │ :11434   │         │  api :8000  │        │
│   │ pgvector │         │ qwen3-8b │         │             │        │
│   │ pg16     │         │ bge-m3   │         │ uvicorn     │        │
│   │          │         │          │         │ workers=1   │        │
│   └──────────┘         └──────────┘         └─────────────┘        │
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
│   GPU passthrough: nvidia count=1 (only when docker-compose.gpu.yml is used)
│   Volume: ./static/media/models → /root/.ollama  (bind mount, models persist)
│   Healthcheck: ollama list
│   Exposes: 11434
│   Models loaded at runtime (pull once):
│     qwen3:8b-q4_K_M    ~5 GB VRAM
│     bge-m3             ~0.5 GB VRAM
│
└── api  (build: ./backend/Dockerfile)
    GPU passthrough: nvidia count=1  ← for faster-whisper (when GPU compose is used)
    ENV: DATABASE_URL, LLM_BASE_URL from .env
    Volumes:
      ./backend/uploads → /app/uploads
      whisper_models     → /app/models   (named volume; survives rebuilds)
    depends_on: postgres (healthy), ollama (healthy)
    Healthcheck: GET /healthz
    Exposes: 8000
    Restart: unless-stopped
```

**Startup order enforced by healthchecks:** postgres → ollama → api

> **No LiteLLM proxy.** The API uses the `litellm` Python SDK to talk to Ollama directly at `http://ollama:11434/api/{generate,embed}`. Earlier versions ran a proxy container at `:4000`; it was removed because the SDK speaks Ollama-native paths but the proxy only exposes OpenAI-compat (`/v1/...`).

---

## 3. Application Layer — FastAPI Structure

```
backend/app/
│
├── main.py           FastAPI instance + lifespan + CORS + /healthz
│   │
│   ├── Lifespan startup hook (blocking, sequential):
│   │   0. alembic upgrade head            ← auto-migrate on startup
│   │   1. compliance_service.load_phrases()
│   │   2. stt_service.load_model()        ← CUDA load, ~2 GB VRAM
│   │   3. stt_service.warmup()            ← dummy 1s silence
│   │   4. llm_service.warmup()            ← dummy 1-token chat
│   │   5. rag_service.embed("salom")      ← retry ×5, assert dim==1024
│   │   → _models_loaded = True
│   │
│   └── Routers mounted:
│       /api/auth              auth.py
│       /api/admin/users       admin_users.py
│       /api/admin/documents   admin_documents.py
│       /api/calls             calls.py
│       /api/demo              demo.py
│       /api/transcribe-chunk  transcribe.py     ← REST fallback
│       /ws/signaling          signaling_ws.py   ← WebRTC SDP/ICE
│       /ws/supervisor         supervisor_ws.py
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

POST   /api/transcribe-chunk   [agent|admin]  REST fallback audio upload

GET    /healthz                [public]   → {status, db_ok, ollama_ok, models_loaded}

WebSocket  (?token=<jwt> — browser cannot set auth headers)
──────────────────────────────────────────────────────────────────
WS /ws/signaling     [agent|admin]        WebRTC SDP/ICE exchange
WS /ws/supervisor    [supervisor|admin]   read-only event fan-out
```

---

## 6. Real-Time Audio Pipeline (Hot Path)

Two transports — same shared logic in `services/call_pipeline.py`.

```
  WebRTC path                           REST fallback
  ───────────                           ─────────────
  WS /ws/signaling (SDP/ICE)            POST /api/transcribe-chunk
  → aiortc RTCPeerConnection            multipart: audio + call_id
  → Opus AudioFrame recv loop           pydub decode → 16kHz int16
  → ChunkBuffer (≥1s PCM)               ChunkBuffer (≥1s PCM)
  → DataChannel "transcripts"           → JSON response body
        │                                      │
        └──────────────┬────────────────────────┘
                       ▼
        services/call_pipeline.py
        process_audio_chunk(call_id, pcm_bytes)
                       │
          ┌────────────┼──────────────────────────────┐
          ▼            ▼                              ▼
  stt_service    compliance_service        sentiment_service
  faster-whisper check_chunk()            analyze() keyword+LLM
  → text         rapidfuzz 0.85           → sentiment event
                 → compliance_tick        event_bus: supervisor
                 → DB update
          │
          ▼ transcript → DB (Call.transcript append, per chunk)
          ▼ event_bus.publish("supervisor", transcript)
          │
          ▼
  auto-extraction at 60s → extraction_service.extract()
          │
          ▼
  guardrail_service.is_bank_related()
  False → DROP    True → continue
          │
          ▼
  rag_service.build_context()
  dense (bge-m3 + pgvector) + sparse (BM25s) → RRF → top-5
          │
          ▼
  llm_service.get_suggestion()  streaming
  Qwen3-8B Q4 → _looks_uzbek() → retry once
          │
          ▼
  suggestion event → transport caller
  DB: SuggestionLog INSERT (one row per emission)
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
call_pipeline.py globals:
  _call_state:  dict[call_id, {
    transcripts:      list[{speaker, text, ts}]
    start_time:       float          ← monotonic
    extraction_done:  bool
    speaker_tracker:  SpeakerTracker
    lang_hint:        str
  }]

webrtc_service.py globals:
  _active_pcs:  dict[call_id, RTCPeerConnection]
  _active_dcs:  dict[call_id, DataChannel]

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
call_pipeline.py  (shared AI logic — called by both transports)
  ├── stt_service          ← faster-whisper (GPU)
  ├── compliance_service   ← rapidfuzz + phrases.json
  ├── sentiment_service    ← keyword heuristic + llm_service
  ├── extraction_service   ← llm_service
  ├── summary_service      ← llm_service
  ├── guardrail_service    ← pure Python keyword set
  ├── rag_service          ← litellm SDK aembedding + asyncpg + BM25s
  ├── llm_service          ← litellm SDK acompletion
  └── event_bus            ← asyncio queues → supervisor_ws

signaling_ws.py  (WebRTC transport)
  └── webrtc_service       ← aiortc RTCPeerConnection + call_pipeline

transcribe.py  (REST fallback transport)
  └── call_pipeline        ← direct function calls

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
  ollama   :11434          ← all litellm-SDK acompletion + aembedding calls (qwen3 + bge-m3)
```
