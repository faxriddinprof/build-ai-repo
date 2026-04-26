# Backend Spec: AI Sales Assistant

**Version:** 1.0 | **Date:** 2026-04-25 | **Status:** Implementation-ready  
**Companion to:** `../PRD.md` and `../idea.md`  
**Audience:** Backend engineers building the FastAPI service

This document is the engineering spec for the backend. We build the backend in full before starting the frontend. Frontend talks to it via REST + WebSocket.

---

## 1. Overview

### 1.1 Responsibilities

The backend owns:

1. **Real-time speech-to-text** — receives audio chunks over WebSocket, transcribes via faster-whisper.
2. **Guardrail filtering** — drops non-bank text before any LLM call.
3. **RAG retrieval** — embeds queries with `nomic-embed-text`, searches pgvector for top-k document chunks.
4. **LLM orchestration** — calls Qwen3-8B via the `litellm` Python SDK (direct to Ollama, no proxy) for: suggestions, customer-info extraction, post-call summary.
5. **Sentiment & compliance scoring** — keyword + LLM-assisted real-time analysis.
6. **PDF ingestion** — extracts text, chunks it, embeds it, stores in pgvector.
7. **Persistence** — calls, transcripts, suggestion logs, documents, users.
8. **Auth** — JWT login, refresh, role enforcement (admin / supervisor / agent).
9. **Supervisor stream** — fan-out of live call events.

### 1.2 Tech stack

| Layer | Tech | Version |
|-------|------|---------|
| Language | Python | 3.11 |
| Web framework | FastAPI | ≥ 0.110 |
| ASGI server | Uvicorn (with `--workers 1` because of GPU contention) | latest |
| ORM | SQLAlchemy 2.x (async) + Alembic for migrations | 2.x |
| DB driver | `asyncpg` | latest |
| Vector store | `pgvector` PostgreSQL extension + `pgvector` Python | 0.7+ |
| STT | `faster-whisper` `large-v3` | latest |
| LLM SDK | `litellm` (Python SDK, in-process — no proxy container) | 1.48.x |
| LLM runtime | Ollama (Qwen3-8B Q4_K_M, nomic-embed-text) | latest |
| PDF parsing | PyMuPDF (`fitz`) | latest |
| Auth | `python-jose[cryptography]`, `passlib[bcrypt]` | latest |
| Validation | Pydantic v2 | 2.x |
| Logging | `structlog` | latest |
| Tests | `pytest`, `pytest-asyncio`, `httpx` | latest |

### 1.3 Hard rules

- **All LLM responses must be in Uzbek** — enforced by the system prompt; assertion + single retry post-output.
- **Non-bank text never reaches the LLM** — guardrail drops silently.
- **No external API calls** — the `litellm` SDK posts only to the local Ollama HTTP API.
- **Customer passport never appears in supervisor WebSocket payloads** — server-side scrub.

---

## 2. Project Structure

```
backend/
├── alembic/                       # DB migrations
│   ├── env.py
│   └── versions/
├── alembic.ini
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI entry, startup hooks (warm models)
│   ├── config.py                  # Pydantic Settings (env vars)
│   ├── database.py                # async engine + session factory + pgvector setup
│   ├── deps.py                    # FastAPI deps: get_db, get_current_user, require_role
│   ├── logging_config.py          # structlog setup
│   ├── models/                    # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── user.py
│   │   ├── call.py
│   │   ├── suggestion.py
│   │   └── document.py
│   ├── schemas/                   # Pydantic request/response models
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── call.py
│   │   ├── document.py
│   │   ├── ws.py                  # WebSocket message envelopes
│   │   └── user.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── audio_ws.py            # WS /ws/audio
│   │   ├── supervisor_ws.py       # WS /ws/supervisor
│   │   ├── calls.py
│   │   ├── admin_documents.py
│   │   ├── admin_users.py
│   │   └── demo.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── stt_service.py
│   │   ├── guardrail_service.py
│   │   ├── llm_service.py
│   │   ├── rag_service.py
│   │   ├── sentiment_service.py
│   │   ├── compliance_service.py
│   │   ├── extraction_service.py  # name / passport / region
│   │   ├── summary_service.py
│   │   ├── ingest_service.py      # PDF → chunks → embeddings → pgvector
│   │   ├── auth_service.py        # password hash, JWT issue/verify
│   │   ├── event_bus.py           # in-process pub/sub for supervisor fan-out
│   │   └── demo_service.py        # WAV scenario playback
│   ├── prompts/
│   │   ├── system_uz.py
│   │   ├── extraction_uz.py
│   │   └── summary_uz.py
│   └── utils/
│       ├── __init__.py
│       ├── audio.py               # PCM resample, chunk buffering
│       └── text.py                # token counting, fuzzy phrase match
├── demo/
│   ├── scenarios.json             # Demo scenario metadata
│   └── audio/                     # Bundled WAV files (not committed if large)
├── uploads/                       # Mounted volume — user PDFs (gitignored)
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_guardrail.py
│   ├── test_rag.py
│   ├── test_extraction.py
│   ├── test_compliance.py
│   └── test_calls.py
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## 3. Configuration (`app/config.py`)

All settings via environment variables, loaded with Pydantic `BaseSettings`.

```python
class Settings(BaseSettings):
    # Server
    APP_NAME: str = "ai-sales-assistant"
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@postgres:5432/sales
    DB_POOL_SIZE: int = 10

    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL_HOURS: int = 8
    REFRESH_TOKEN_TTL_DAYS: int = 30

    # LLM / Ollama (litellm SDK posts directly to Ollama; no proxy)
    LLM_BASE_URL: str = "http://ollama:11434"
    LLM_API_KEY: str = "sk-bank-internal-key"  # ignored by Ollama; kept for SDK compatibility
    LLM_MODEL: str = "ollama/qwen3:8b-q4_K_M"
    EMBEDDING_MODEL: str = "ollama/nomic-embed-text"
    LLM_MAX_TOKENS_SUGGESTION: int = 100
    LLM_MAX_TOKENS_EXTRACTION: int = 200
    LLM_MAX_TOKENS_SUMMARY: int = 400
    LLM_TIMEOUT_SECONDS: int = 5

    # STT
    WHISPER_MODEL: str = "large-v3"
    WHISPER_DEVICE: str = "cuda"
    WHISPER_COMPUTE_TYPE: str = "float16"
    WHISPER_BATCH_SIZE: int = 16

    # Uploads
    UPLOAD_DIR: str = "/app/uploads"
    MAX_PDF_SIZE_MB: int = 50

    # RAG
    CHUNK_SIZE_TOKENS: int = 500
    CHUNK_OVERLAP_TOKENS: int = 50
    RAG_TOP_K: int = 5
    EMBEDDING_DIM: int = 768

    # Extraction
    EXTRACTION_WINDOW_SECONDS: int = 60
    EXTRACTION_CONFIDENCE_THRESHOLD: float = 0.8

    # Compliance
    COMPLIANCE_PHRASES_PATH: str = "/app/app/data/compliance_phrases.json"

    class Config:
        env_file = ".env"
```

**`.env.example`** — the file checked into git as a template, never the real `.env`.

---

## 4. Database

### 4.1 Setup (`app/database.py`)

- Async SQLAlchemy engine with `asyncpg`.
- Session factory: `async_sessionmaker(engine, expire_on_commit=False)`.
- On startup: ensure `CREATE EXTENSION IF NOT EXISTS vector;` runs (ideally via the first Alembic migration).

### 4.2 Models (`app/models/`)

```python
# app/models/user.py
class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID]            = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str]          = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str]
    role: Mapped[str]           # "admin" | "supervisor" | "agent"
    is_active: Mapped[bool]     = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

```python
# app/models/call.py
class Call(Base):
    __tablename__ = "calls"
    id: Mapped[UUID]                  = mapped_column(primary_key=True, default=uuid4)
    agent_id: Mapped[UUID]            = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime]
    ended_at: Mapped[Optional[datetime]]
    customer_name: Mapped[Optional[str]]
    customer_passport: Mapped[Optional[str]]
    customer_region: Mapped[Optional[str]]
    intake_confirmed_at: Mapped[Optional[datetime]]
    transcript: Mapped[Optional[dict]]    = mapped_column(JSONB)  # [{speaker, text, ts}]
    summary: Mapped[Optional[dict]]       = mapped_column(JSONB)
    compliance_status: Mapped[Optional[dict]] = mapped_column(JSONB)
```

```python
# app/models/suggestion.py
class SuggestionLog(Base):
    __tablename__ = "suggestions_log"
    id: Mapped[UUID]            = mapped_column(primary_key=True, default=uuid4)
    call_id: Mapped[UUID]       = mapped_column(ForeignKey("calls.id"))
    trigger: Mapped[str]
    suggestion: Mapped[str]
    latency_ms: Mapped[Optional[int]]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

```python
# app/models/document.py
class Document(Base):
    __tablename__ = "documents"
    id: Mapped[UUID]            = mapped_column(primary_key=True, default=uuid4)
    filename: Mapped[str]
    tag: Mapped[Optional[str]]      # product | script | compliance | faq
    page_count: Mapped[Optional[int]]
    chunk_count: Mapped[Optional[int]]
    status: Mapped[str]             # indexing | ready | error
    error_message: Mapped[Optional[str]]
    uploaded_by: Mapped[UUID]       = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime]   = mapped_column(default=datetime.utcnow)
    chunks: Mapped[list["DocumentChunk"]] = relationship(cascade="all, delete-orphan")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[UUID]            = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID]   = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    content: Mapped[str]
    embedding: Mapped[list[float]] = mapped_column(Vector(768))
    page_number: Mapped[int]
    chunk_index: Mapped[int]
```

### 4.3 Migration policy

- One initial migration that creates all tables + the pgvector index.
- Subsequent schema changes go through Alembic — no manual SQL.

---

## 5. Authentication & Authorization

### 5.1 Service (`services/auth_service.py`)

- `hash_password(plain) -> str` using `bcrypt` via `passlib.CryptContext`.
- `verify_password(plain, hashed) -> bool`.
- `create_access_token(sub, role, ttl) -> str` — `python-jose` HS256.
- `create_refresh_token(sub) -> str`.
- `decode_token(token) -> dict` — raises `JWTError` on bad token.

### 5.2 Dependencies (`app/deps.py`)

```python
async def get_db() -> AsyncIterator[AsyncSession]: ...

def get_current_user(token: str = Depends(oauth2)) -> User: ...

def require_role(*roles: str):
    def _check(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(403, "Forbidden")
        return user
    return _check
```

### 5.3 Endpoints (`routers/auth.py`)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/api/auth/login` | `{email, password}` | `{access_token, refresh_token, role}` |
| `POST` | `/api/auth/refresh` | `{refresh_token}` | `{access_token}` |
| `GET` | `/api/auth/me` | — | `User` |

### 5.4 WebSocket auth

WebSocket endpoints accept the JWT via `?token=...` query param (browser WebSocket API can't send custom headers). The endpoint validates first, then accepts.

---

## 6. Speech-to-Text Service

### 6.1 Module (`services/stt_service.py`)

- Loads `faster-whisper` `large-v3` once at startup; held in module-level `_model` singleton.
- Exposes `async def transcribe_chunk(pcm_bytes, sample_rate, language_hint=None) -> TranscribeResult`.
- `TranscribeResult = {text: str, language: str, confidence: float, segments: [...]}`.
- Internally: convert PCM → `numpy` float32 → `model.transcribe(...)` in a thread pool (`asyncio.to_thread`) since faster-whisper is sync.
- Buffers small chunks until ≥ 1 s of audio is available before transcribing (configurable). This trades a small latency for accuracy.

### 6.2 Speaker turn detection

Simple energy-based split for v1:

- Maintain rolling RMS of audio.
- When RMS drops below a threshold for ≥ 800 ms, mark a turn boundary.
- Alternate `speaker = "agent" | "customer"` starting with "agent" on the first non-silent chunk.
- This is deliberately naive — speaker diarization is out of scope for hackathon.

### 6.3 Output format

Transcribed text is appended to a per-call rolling transcript stored in memory (dict keyed by `call_id`) until the call ends, when it's flushed to `calls.transcript` JSONB.

---

## 7. Guardrail Service

### 7.1 Module (`services/guardrail_service.py`)

```python
BANK_TOPICS: set[str] = {
    "kredit", "karta", "omonat", "lizing", "sug'urta",
    "foiz", "stavka", "to'lov", "muddat", "limit",
    "overdraft", "ipoteka", "depozit", "valyuta",
    "hisobvaraq", "o'tkazma", "balans", "qarz",
    "loan", "credit", "deposit", "payment", "card",
    "кредит", "карта", "депозит", "платёж", "ставка",
}

def is_bank_related(text: str) -> bool:
    tokens = set(_tokenize(text.lower()))
    return bool(tokens & BANK_TOPICS)
```

### 7.2 Tokenizer

Simple unicode-aware split on whitespace and punctuation. **No** stemming. Apostrophes preserved (so `to'lov` stays one token).

### 7.3 Usage

Every transcript chunk runs through `is_bank_related` before any LLM service call. If `False`, the function returns `None` and no suggestion is emitted to the agent. Logged at DEBUG level only — no UI message.

### 7.4 Language guard (post-LLM)

After the LLM responds, run `detect_language(output)`. If not Uzbek (`uz`), retry once with an explicit "RESPOND IN UZBEK ONLY" reminder appended to the user message. If retry still fails: drop the suggestion and log a warning.

---

## 8. LLM Service

### 8.1 Module (`services/llm_service.py`)

Wraps the `litellm` Python SDK (`from litellm import acompletion`). All Ollama traffic goes directly to `LLM_BASE_URL` (`http://ollama:11434/api/{generate,embed}`) — there is no proxy container in the data path.

```python
async def chat(
    *,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.3,
    timeout: float = 5.0,
    stream: bool = False,
) -> str | AsyncIterator[str]: ...
```

### 8.2 Streaming for suggestions

Suggestion endpoint streams tokens from the LLM and flushes them over the agent's `WS /ws/audio` connection as they arrive. UI updates incrementally.

### 8.3 System prompt (`prompts/system_uz.py`)

Hardcoded Uzbek-only prompt as in `idea.md` §Guardrail Layer. Loaded once at module import.

### 8.4 Suggestion prompt template

```
SYSTEM: <system_uz>
USER: Mijoz so'zi: "{customer_text}"
       Bank kontekst: {rag_context}
       Agentga 3 ta qisqa, aniq taklif yoz. Har biri 1-2 jumla.
```

### 8.5 Model warm-up

In `app/main.py`'s startup event:

1. Load faster-whisper into VRAM.
2. Issue a 1-token dummy `chat` call via the litellm SDK to warm Qwen3.
3. Issue a 1-token dummy embed call to warm `nomic-embed-text`.

This eliminates cold-start latency on the first real call.

---

## 9. RAG Service

### 9.1 Module (`services/rag_service.py`)

```python
async def embed(text: str) -> list[float]:
    """Calls Ollama's embeddings endpoint via the litellm SDK (`aembedding`)."""

async def search(query: str, top_k: int = 5, tag_filter: str | None = None) -> list[Chunk]:
    """Embeds query, searches pgvector via cosine similarity, returns top_k chunks."""

async def build_context(transcript_tail: str, top_k: int = 5) -> str:
    """Calls search, formats results into a single prompt-ready string."""
```

### 9.2 SQL for similarity search

```sql
SELECT content, page_number, document_id,
       1 - (embedding <=> :query_embedding) AS similarity
  FROM document_chunks
 WHERE (:tag IS NULL OR document_id IN (
        SELECT id FROM documents WHERE tag = :tag))
 ORDER BY embedding <=> :query_embedding
 LIMIT :top_k;
```

`<=>` is the pgvector cosine distance operator. Lower = closer.

### 9.3 Context formatting

```
[chunk 1 — page 3, products.pdf] {content}
[chunk 2 — page 7, products.pdf] {content}
...
```

Total context capped at 1500 tokens to leave room for system prompt + customer text within Qwen3-8B's window.

---

## 10. Ingestion Service

### 10.1 Module (`services/ingest_service.py`)

Pipeline: **PDF → text → chunks → embeddings → pgvector**.

```python
async def ingest_pdf(document_id: UUID, file_path: Path) -> None:
    1. Set documents.status = "indexing"
    2. Open with fitz, iterate pages, extract text per page
    3. For each page: split into ~500-token chunks with 50-token overlap
    4. Batch-embed chunks (32 at a time) via rag_service.embed
    5. Insert into document_chunks
    6. Update documents.{page_count, chunk_count, status="ready"}
    7. On any exception: status="error", error_message = str(e)
```

### 10.2 Token-based chunking

- Use a simple word-split approximation: ~4 chars/token for Uzbek/Russian average.
- For accuracy: use the `tiktoken` `cl100k_base` tokenizer to count tokens; then split by sentence boundaries up to the chunk size.
- Sentence splitter: regex on `[.!?]\s+` (good enough for v1).

### 10.3 Concurrency

Ingestion runs as a `BackgroundTasks` task spawned by the upload endpoint. Single-flight per document. The endpoint returns `202 Accepted` immediately.

### 10.4 Failure modes

| Failure | Handling |
|---------|----------|
| PDF has no text layer (scanned) | Fail with error: "no text extractable — OCR not supported in MVP" |
| File > MAX_PDF_SIZE_MB | Reject at upload (400) |
| Embedding call fails mid-batch | Mark document `error`; partial chunks rolled back in same transaction |
| Disk full | 500 to client; status `error` |

---

## 11. Sentiment Service

### 11.1 Module (`services/sentiment_service.py`)

Two-stage:

1. **Keyword pass (cheap, fast):**
   - `POSITIVE_WORDS = {"yaxshi", "ajoyib", "ha", "albatta", "rahmat", ...}`
   - `NEGATIVE_WORDS = {"qimmat", "yo'q", "kerak emas", "tushunmadim", "muammo", ...}`
   - Score = positive_hits − negative_hits over last 3 transcript turns.
2. **LLM tone confirmation (only if keyword score is borderline):**
   - 1-shot Qwen3 call: "Mijoz tonusini aniqla: positive / neutral / negative"
   - Cap to 1 call per 5 s per call session to avoid LLM spam.

### 11.2 Output

```python
{"sentiment": "positive" | "neutral" | "negative", "confidence": float}
```

Pushed to `WS /ws/audio` and to `WS /ws/supervisor` whenever the value changes.

---

## 12. Compliance Service

### 12.1 Required phrases config

`app/data/compliance_phrases.json` (small file, deployable, editable by admin in v2):

```json
[
  { "id": "interest_rate_disclosure", "patterns": ["foiz stavka", "yillik foiz", "APR"] },
  { "id": "data_consent",             "patterns": ["shaxsiy ma'lumot", "rozilik"] },
  { "id": "loan_term_disclosure",     "patterns": ["kredit muddati", "necha oy"] }
]
```

### 12.2 Module (`services/compliance_service.py`)

```python
async def check_chunk(call_id: UUID, text: str) -> list[str]:
    """Returns list of phrase IDs newly detected in this chunk.
    Updates per-call in-memory state and persists to calls.compliance_status on each tick.
    """
```

Matching is case-insensitive substring + simple Levenshtein-based fuzzy match (threshold 0.85) using `rapidfuzz` for misspellings.

### 12.3 Final state at call end

Items still unchecked at `POST /api/calls/:id/end` are flagged `❌ missed` in `compliance_status` and surfaced in the post-call summary.

---

## 13. Extraction Service (Customer Intake)

### 13.1 Module (`services/extraction_service.py`)

Triggered once per call: when `EXTRACTION_WINDOW_SECONDS` (default 60 s) of transcript have accumulated, OR when an explicit "trigger now" event fires (e.g. agent presses a button).

### 13.2 Prompt (`prompts/extraction_uz.py`)

```
Sen bank operatorining suhbatidan mijoz ma'lumotlarini ajratuvchi assistantsan.
Quyidagi suhbatdan FAQAT JSON formatda javob qaytar:

{
  "customer_name": "<to'liq ism, agar aniqlanmagan bo'lsa null>",
  "customer_passport": "<passport raqami formatda AA1234567, agar aniqlanmagan null>",
  "customer_region": "<viloyat yoki shahar nomi, agar aniqlanmagan null>",
  "confidence": <0.0-1.0>
}

Boshqa hech narsa yozma. Faqat JSON.

Suhbat:
{transcript}
```

### 13.3 Output handling

```python
async def extract(call_id: UUID, transcript: str) -> Intake:
    raw = await llm_service.chat(...)
    data = json.loads(_strip_code_fence(raw))
    if data["confidence"] < settings.EXTRACTION_CONFIDENCE_THRESHOLD:
        # blank fields out — agent will type them in
        data["customer_name"] = data["customer_name"] if data["confidence"] > 0.5 else None
        # similar for passport / region
    return Intake(**data)
```

### 13.4 Delivery to agent

Pushed via `WS /ws/audio` as:

```json
{ "type": "intake_proposal", "call_id": "...", "data": { "customer_name": "...", "customer_passport": "AA1234567", "customer_region": "Toshkent", "confidence": 0.92 } }
```

The agent's UI shows the Intake Confirmation Card. The agent confirms via `PATCH /api/calls/:id/intake` with the (possibly edited) fields.

### 13.5 Passport validation

Server-side regex: `^[A-Z]{2}\d{7}$`. If the LLM returns a malformed value, set to `null`.

---

## 14. Summary Service

### 14.1 Module (`services/summary_service.py`)

Triggered by `POST /api/calls/:id/end`. Sends the full call transcript + final compliance state to Qwen3-8B with this prompt:

```
Sen bank kol-markaz qo'ng'iroqlarini xulosalovchi assistantsan.
Quyidagi suhbatni o'qing va JSON qaytaring:

{
  "outcome": "approved" | "rejected" | "follow_up" | "no_decision",
  "objections": [<qisqa matn ro'yxati>],
  "compliance_status": "complete" | "partial" | "failed",
  "next_action": "<bir jumla, agentning keyingi qadami>"
}

Suhbat:
{transcript}

Compliance holati:
{compliance_summary}
```

### 14.2 Persistence

The result is stored in `calls.summary` JSONB. `GET /api/calls/:id` returns it as part of the response.

---

## 15. Routers

### 15.1 `/api/auth` (covered in §5.3)

### 15.2 `/api/calls` (`routers/calls.py`)

| Method | Path | Role | Body | Returns |
|--------|------|------|------|---------|
| `POST` | `/api/calls` | agent | — | `{call_id, started_at}` |
| `GET` | `/api/calls/:id` | agent / supervisor | — | `Call` (full) |
| `GET` | `/api/calls` | agent / supervisor | query: `?limit&since` | paginated list |
| `PATCH` | `/api/calls/:id/intake` | agent | `{customer_name, customer_passport, customer_region}` | `Call` |
| `POST` | `/api/calls/:id/end` | agent | — | `{call_id, summary}` |

Authorization: agents only access their own calls; supervisors access all calls.

### 15.3 `/ws/audio` (`routers/audio_ws.py`)

Bi-directional. Message envelopes (Pydantic `WSMessage`):

**Inbound (client → server):**

| `type` | Payload |
|--------|---------|
| `start_call` | `{call_id, language_hint}` |
| `audio_chunk` | `{call_id, pcm_b64, sample_rate}` |
| `trigger_intake_extraction` | `{call_id}` (manual override) |
| `end_call` | `{call_id}` |

**Outbound (server → client):**

| `type` | Payload |
|--------|---------|
| `transcript` | `{call_id, speaker, text, ts}` |
| `suggestion` | `{call_id, text[], trigger}` (streamed in chunks) |
| `sentiment` | `{call_id, sentiment, confidence}` |
| `compliance_tick` | `{call_id, phrase_id}` |
| `intake_proposal` | `{call_id, data: {customer_name, customer_passport, customer_region, confidence}}` |
| `summary_ready` | `{call_id, summary}` |
| `error` | `{call_id, code, message}` |

### 15.4 `/ws/supervisor` (`routers/supervisor_ws.py`)

Server → client only. Subscribes to `EventBus.subscribe("supervisor")`. Forwards events with `customer_passport` always stripped server-side before send.

### 15.5 `/api/admin/documents` (`routers/admin_documents.py`)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `POST` | `/api/admin/documents` | `multipart: file, tag` | Saves to UPLOAD_DIR; spawns background ingest; returns `{document_id, status: "indexing"}` |
| `GET` | `/api/admin/documents` | — | Paginated; includes status |
| `GET` | `/api/admin/documents/:id` | — | Single doc + chunk count |
| `DELETE` | `/api/admin/documents/:id` | — | Cascades to chunks; deletes file from disk |
| `POST` | `/api/admin/documents/:id/reindex` | — | Re-runs ingest pipeline |

All require `role:admin`.

### 15.6 `/api/admin/users` (`routers/admin_users.py`)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `POST` | `/api/admin/users` | `{email, password, role}` | Creates user; admin only |
| `GET` | `/api/admin/users` | — | List |
| `PATCH` | `/api/admin/users/:id` | `{is_active?, role?}` | |

### 15.7 `/api/demo` (`routers/demo.py`)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `GET` | `/api/demo/scenarios` | — | List from `demo/scenarios.json` |
| `POST` | `/api/demo/play` | `{call_id, scenario_id}` | Streams the scenario WAV through the same pipeline as `audio_chunk` events |

---

## 16. WebSocket Implementation Notes

### 16.1 Connection lifecycle

1. Client connects with `?token=<jwt>` — server validates, accepts.
2. Client sends `start_call` with optional `call_id` (else server creates one).
3. Server begins streaming `transcript` / `suggestion` events.
4. Client sends `audio_chunk` events at 100 ms cadence.
5. Client sends `end_call` — server triggers summary, sends `summary_ready`, then closes.

### 16.2 Audio encoding

- Client encodes PCM 16-bit @ 16 kHz mono as base64 in `audio_chunk.pcm_b64`.
- Server decodes, buffers in `utils/audio.py:ChunkBuffer`, dispatches once buffer ≥ 1 s.
- For Demo Mode: server reads WAV, slices into 100 ms chunks, feeds via the same path as live audio.

### 16.3 Error handling

- Per-message `try/except` — never close the WebSocket on a single failed chunk.
- Send `{"type": "error", "code": "...", "message": "..."}` and continue.
- Codes: `STT_FAIL`, `LLM_TIMEOUT`, `GUARDRAIL_DROP` (for diagnostics; no UI shown for guardrail drops).

### 16.4 Backpressure

If the agent's outbound queue exceeds 50 messages, drop oldest `transcript` events first (UI catches up via the next chunk). Suggestions and intake proposals are never dropped.

### 16.5 EventBus

`services/event_bus.py` — in-process pub/sub using `asyncio.Queue` per subscriber. The supervisor router subscribes to `"supervisor"` topic and forwards. Future: Redis Pub/Sub if we ever scale beyond one host.

---

## 17. Demo Mode

### 17.1 `demo/scenarios.json`

```json
[
  { "id": "objection_expensive",  "name": "Objection — Too Expensive", "audio": "objection_expensive.wav",  "language": "uz" },
  { "id": "cross_sell_cashback",  "name": "Cross-sell Opportunity",     "audio": "cross_sell_cashback.wav",  "language": "uz" },
  { "id": "compliance_apr_miss",  "name": "Compliance Miss",            "audio": "compliance_apr_miss.wav",  "language": "uz" },
  { "id": "intake_extraction",    "name": "Customer Intake",            "audio": "intake_extraction.wav",    "language": "uz" }
]
```

### 17.2 Playback (`services/demo_service.py`)

```python
async def play_scenario(call_id: UUID, scenario_id: str, send: Callable):
    1. Load WAV path from scenarios.json
    2. wave.open(path) → read all frames
    3. Slice into 100 ms PCM chunks
    4. for chunk in chunks:
           await send(audio_chunk_envelope(chunk))
           await asyncio.sleep(0.1)
```

This drives the same STT → guardrail → RAG → LLM path as a live call. Judges see identical UI behavior.

---

## 18. Logging & Observability

### 18.1 `structlog` configuration

- JSON logs to stdout (Docker captures).
- Mandatory keys per log line: `ts`, `level`, `event`, `call_id` (if applicable), `request_id`.
- HTTP middleware injects `request_id` into context.

### 18.2 Latency metrics

For every suggestion: log `{event: "suggestion_emitted", call_id, latency_ms}`. The `latency_ms` is end-to-end from `audio_chunk` arrival to first token sent over WebSocket. Goal: ≤ 1500.

### 18.3 PII scrubbing

Logs **never** contain `customer_passport`. Add a `structlog` processor that scrubs the field before serialization.

### 18.4 Health endpoint

`GET /healthz` — returns `{status, db_ok, ollama_ok, models_loaded}`. Used by Docker healthcheck and as a readiness signal.

---

## 19. Error Handling Standards

| Class | HTTP | When |
|-------|------|------|
| `400 Bad Request` | Validation errors, malformed PDF, file too large |
| `401 Unauthorized` | Missing or invalid JWT |
| `403 Forbidden` | Wrong role |
| `404 Not Found` | Unknown call/document/user |
| `409 Conflict` | Duplicate email at user create |
| `422 Unprocessable Entity` | Pydantic validation failures (FastAPI default) |
| `500 Internal Server Error` | Unhandled — logged with stack trace; client gets generic message |

All error responses use `{"error": {"code": "...", "message": "..."}}`.

---

## 20. Docker

### 20.1 `Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

### 20.2 Compose entry (managed at repo root)

```yaml
api:
  build: ./backend
  depends_on: [postgres, ollama]
  environment:
    - DATABASE_URL=postgresql+asyncpg://...
    - LLM_BASE_URL=http://ollama:11434
    - JWT_SECRET=${JWT_SECRET}
  volumes:
    - ./backend/uploads:/app/uploads
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
  ports: ["8000:8000"]
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
    interval: 30s
```

GPU passthrough is needed because faster-whisper runs in-process.

---

## 21. Testing

### 21.1 Unit tests

| Target | Test |
|--------|------|
| `guardrail_service.is_bank_related` | Bank phrases pass; non-bank phrases drop; mixed UZ/RU |
| `extraction_service` | Mocks LLM; verifies low-confidence blanks fields; passport regex enforcement |
| `compliance_service.check_chunk` | Required phrases tick; fuzzy matches; misspellings within threshold |
| `auth_service` | Hash + verify password; JWT issue + decode |
| `ingest_service` | Mock LLM embeddings; verify chunk count + status transitions |

### 21.2 Integration tests

- Spin up `httpx.AsyncClient` against the FastAPI app.
- Use a separate test database (`pytest` fixture: create + migrate + drop).
- Mock LLM and STT services with deterministic stubs (real ones are too heavy for CI).

### 21.3 Manual end-to-end (hackathon dress rehearsal)

Run all four demo scenarios via Demo Mode endpoint and verify each FR-acceptance test from `PRD.md` §14.

---

## 22. Implementation Order (4-week plan)

### Week 1 — Foundation
1. `requirements.txt`, project skeleton, `app/main.py`, `config.py`.
2. `database.py`, models (`User`, `Call`, `Document`, `DocumentChunk`, `SuggestionLog`).
3. Alembic init + first migration including `CREATE EXTENSION vector`.
4. `auth_service` + `routers/auth.py` + JWT deps.
5. `routers/admin_users.py`.
6. `Dockerfile` + healthcheck.
7. **Acceptance:** can log in via `curl`, can hit `/api/auth/me`, healthz returns OK.

### Week 2 — Call loop (no RAG yet)
1. `stt_service` with faster-whisper warm-up.
2. `audio_ws` router: `start_call`, `audio_chunk`, `end_call`; emits `transcript` events.
3. `guardrail_service` + tests.
4. `llm_service` with litellm SDK streaming.
5. Hard-coded suggestion prompt (no RAG context yet) — verify Uzbek-only enforcement.
6. **Acceptance:** browser sends WAV, transcript streams back, suggestion fires on objection keyword, language assertion passes.

### Week 3 — RAG + intake + supervisor
1. `ingest_service` + `routers/admin_documents.py`.
2. `rag_service` + integrate top-k context into suggestion prompt.
3. `extraction_service` + `intake_proposal` event + `PATCH /api/calls/:id/intake`.
4. `sentiment_service`, `compliance_service`.
5. `event_bus` + `routers/supervisor_ws.py`.
6. **Acceptance:** PDF upload → indexed in ≤ 30 s; suggestions reference content; intake card data extracted from transcript; supervisor sees live events; passport scrubbed.

### Week 4 — Summary, demo mode, polish
1. `summary_service` + `POST /api/calls/:id/end`.
2. `demo_service` + `routers/demo.py` + 4 bundled WAV scenarios.
3. Logging metrics for latency budget.
4. Manual run of all four demo scenarios; tune thresholds.
5. End-to-end test of all FR acceptance criteria from `PRD.md` §14.

---

## 23. Risks & Mitigations (backend-specific)

| Risk | Mitigation |
|------|-----------|
| Cold-start latency miss | Warm models at boot via dummy inferences |
| Ollama container crashes | Compose `restart: unless-stopped`; healthcheck retries; litellm SDK reconnects on next call |
| Long PDFs blow context window | Token-count chunks server-side; reject docs > N pages with a clear error |
| Connection pool exhaustion under load | Pool sized for hackathon traffic (10) — document and bump for pilot |
| Embedding model returns wrong dim | Assertion at startup that probe embedding length == `EMBEDDING_DIM` |
| Async leak in faster-whisper sync calls | Always wrap in `asyncio.to_thread`; never call from event loop directly |
| Passport leak via JSON logs | `structlog` PII scrubber + unit test that asserts the field never appears in serialized logs |

---

## 24. Open Backend Questions

1. Should `transcript` events be persisted incrementally (every chunk → DB) or only at call end? Current plan: in-memory, flush at end. Risk: lose transcript on crash mid-call. Acceptable for hackathon.
2. Do we want a Redis cache for embeddings of repeated queries? Skip for hackathon; reconsider at pilot.
3. JWT secret rotation strategy — out of scope for hackathon; document as a Day-2 task.
4. Should `ingest_service` use a real task queue (Celery / arq)? FastAPI BackgroundTasks is fine for hackathon (single-process, no horizontal scale).
5. Compliance phrase list — who provides the canonical phrases for the hackathon demo? Currently TBD; placeholder list in repo.

---

## 25. References

- `../PRD.md` — Product requirements, user stories, acceptance criteria
- `../idea.md` — Original concept, architecture diagrams, latency budget, demo narratives
- faster-whisper docs: https://github.com/SYSTRAN/faster-whisper
- LiteLLM docs: https://docs.litellm.ai/
- pgvector: https://github.com/pgvector/pgvector
- Ollama: https://ollama.com/
