# IDEA: Real-Time AI Sales Assistant for Bank Call Center Agents

## One-Line Pitch
An on-premise, real-time AI copilot that listens to bank agent-customer phone calls and instantly displays smart suggestions, objection handlers, and compliance alerts — directly on the agent's screen.

---

## Problem

Bank call center agents selling products (loans, cards, deposits, insurance) face three core problems:

1. **Slow response to objections** — agent pauses, searches scripts manually, loses the moment
2. **Script non-compliance** — agents forget mandatory disclosures (interest rate, consent), creating regulatory risk
3. **Inconsistent quality** — top agents convert 3x more than average; the gap is knowledge and timing, not effort

No existing solution works on-premise in Uzbekistan with Uzbek/Russian language support.

---

## Solution

A real-time AI overlay (whisper assistant) that:
- **Listens** to the call via microphone (browser-based capture)
- **Transcribes** speech in real-time (Uzbek + Russian) using faster-whisper
- **Detects** objections, sentiment, and sales stage using keyword + LLM analysis
- **Displays** instant suggestions on the agent's screen: ready-to-use phrases, product details, objection responses
- **Tracks** script compliance with a live checklist
- **Summarizes** the call automatically after it ends

Everything runs **100% on-premise** — no data leaves the bank's servers.

---

## Target Users

**Primary:** Bank call center agents (outbound sales, cross-sell, retention)
**Secondary:** Call center supervisors (monitoring dashboard)
**Buyer:** Bank IT / Digital transformation department

---

## User Roles

| Role | Access |
|---|---|
| `admin` | Admin Panel: upload/delete/manage PDF documents, user management |
| `supervisor` | Supervisor dashboard: monitor live calls, agent analytics |
| `agent` | Agent dashboard: live call view, transcript, suggestions |

Role is assigned at user creation. JWT-based auth. Single bank instance (no multi-tenancy).

---

## Core User Flow

```
Agent starts call
      ↓
Browser mic captures audio → WebSocket stream → FastAPI backend
      ↓
faster-whisper transcribes audio chunks in real-time (<500ms)
      ↓
GuardrailService: is this bank-related? ──NO──→ DROP. LLM never called.
      ↓ YES
Transcript analyzed: intent, objection keywords, sentiment
      ↓
RAG retrieves relevant chunks from pgvector (bank PDFs)
      ↓
Qwen3-8B generates short suggestion in Uzbek only (≤100 tokens)
      ↓
Agent UI displays suggestion card + sentiment indicator + compliance checklist
      ↓
Call ends → auto-summary generated → saved to DB
```

---

## Key Features (MVP / Hackathon Scope)

### 1. Live Transcript Panel
- Real-time speech-to-text displayed as conversation
- Speaker label: Agent vs Customer (simple turn detection)
- Language: Uzbek and Russian

### 2. AI Suggestion Panel
- Triggered when objection or question detected
- Max 3 bullet suggestions, short and copy-paste ready
- Categories: objection response, product info, cross-sell prompt
- One-click "Copy" button

### 3. Sentiment Indicator
- Real-time color badge: 🟢 Positive / 🟡 Neutral / 🔴 Negative
- Based on keyword detection + LLM tone analysis

### 4. Script Compliance Checklist
- Predefined required phrases (e.g. "interest rate disclosure", "data consent")
- Auto-checks when phrase detected in transcript
- Visual: ✅ done / ⬜ pending / ❌ missed

### 5. Post-Call Summary
- Auto-generated after call ends
- Contains: call outcome, key objections raised, compliance status, next action
- Saved to database, exportable

### 6. Demo Mode
- Preloaded audio scenarios for hackathon presentation
- Simulates real call without needing live phone integration

---

## Technical Architecture

### Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) |
| STT | faster-whisper (large-v3, GPU) |
| LLM | Qwen3-8B via Ollama (called through `litellm` Python SDK; no proxy) |
| Vector DB | PostgreSQL + pgvector (embeddings) |
| Embeddings | nomic-embed-text via Ollama (local) |
| PDF Parsing | PyMuPDF (fitz) |
| Database | PostgreSQL |
| Real-time | WebSocket |
| Containerization | Docker Compose |

### Hardware (Available)
- GPU: RTX 5070 Ti (16GB VRAM)
- faster-whisper large-v3: ~2GB VRAM
- Qwen3-8B Q4_K_M: ~5GB VRAM
- Total usage: ~7GB — fits comfortably

### Latency Budget

```
Audio chunk capture:    100ms
STT (faster-whisper):   300ms
LLM suggestion:         500-700ms (streaming, first token ~150ms)
WebSocket + UI render:  100ms
────────────────────────────────
Total target:           ≤ 1.5s
```

### Services

```
docker-compose.yml
├── ollama          → Qwen3-8B + nomic-embed-text model server
├── api             → FastAPI backend (STT, LLM via litellm SDK, WebSocket, REST, ingest)
├── frontend        → React app (Vite) — agent + admin views
└── postgres        → pgvector: chunks + embeddings + call logs
```

---

## Project Structure (for Claude Code to generate)

```
/
├── backend/
│   ├── main.py                   # FastAPI app entry
│   ├── routers/
│   │   ├── audio.py              # WebSocket: audio → STT
│   │   ├── suggestions.py        # WebSocket: transcript → LLM
│   │   ├── calls.py              # REST: call CRUD, summaries
│   │   ├── demo.py               # REST: demo scenario loader
│   │   └── admin.py              # REST: PDF upload, doc management (admin only)
│   ├── services/
│   │   ├── stt_service.py        # faster-whisper wrapper
│   │   ├── llm_service.py        # litellm SDK async calls (direct to Ollama)
│   │   ├── guardrail_service.py  # Topic filter + language enforcement (pre-LLM)
│   │   ├── sentiment.py          # Keyword + LLM sentiment
│   │   ├── compliance.py         # Script phrase detection
│   │   ├── rag_service.py        # pgvector similarity search → context
│   │   ├── ingest_service.py     # PDF → chunks → embeddings → pgvector
│   │   └── summary_service.py    # Post-call summary generation
│   ├── models/
│   │   ├── call.py               # SQLAlchemy Call model
│   │   ├── suggestion.py         # Suggestion log model
│   │   ├── document.py           # Document + DocumentChunk models
│   │   └── user.py               # User model (admin / agent / supervisor roles)
│   ├── uploads/                  # Uploaded PDF files (volume mounted)
│   ├── demo/
│   │   └── scenarios.json        # Demo audio + expected outputs
│   ├── config.py                 # Settings (env vars)
│   ├── database.py               # DB connection + pgvector setup
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── AgentDashboard.tsx     # Main agent view
│   │   │   ├── SupervisorView.tsx     # Multi-call monitor
│   │   │   ├── AdminPanel.tsx         # PDF upload + document management
│   │   │   └── DemoMode.tsx           # Hackathon demo player
│   │   ├── components/
│   │   │   ├── TranscriptPanel.tsx    # Live transcript scroll
│   │   │   ├── SuggestionCard.tsx     # AI suggestion with copy
│   │   │   ├── SentimentBadge.tsx     # Color indicator
│   │   │   ├── ComplianceChecklist.tsx # Script checkboxes
│   │   │   ├── CallTimer.tsx          # Duration display
│   │   │   ├── PostCallSummary.tsx    # Summary modal
│   │   │   └── admin/
│   │   │       ├── DocumentUploader.tsx   # Drag & drop PDF upload
│   │   │       ├── DocumentList.tsx       # Uploaded docs table + status
│   │   │       └── IngestionStatus.tsx    # Real-time indexing progress
│   │   ├── hooks/
│   │   │   ├── useAudioStream.ts      # Mic capture + WebSocket
│   │   │   ├── useTranscript.ts       # Transcript state
│   │   │   └── useSuggestions.ts      # Suggestion stream
│   │   ├── store/
│   │   │   └── callStore.ts           # Zustand global state
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Knowledge Base — PDF Ingestion via Admin Panel

There is **no static JSON knowledge base**. All bank product data, scripts, and compliance documents are uploaded as PDF files by an admin user. The system automatically ingests, chunks, embeds, and indexes them into pgvector.

### Ingestion Pipeline

```
Admin uploads PDF (via Admin Panel UI)
        ↓
FastAPI receives file → saves to /uploads/
        ↓
PyMuPDF extracts raw text (page by page)
        ↓
Text splitter chunks into ~500 token segments (with overlap)
        ↓
nomic-embed-text (via Ollama, local) generates embeddings
        ↓
Chunks + embeddings stored in PostgreSQL (pgvector extension)
        ↓
Document status: "indexed" — available for RAG queries
```

### Admin Panel Features

- **Upload PDF** — drag & drop or file picker, multiple files supported
- **Document list** — name, upload date, page count, chunk count, status (indexing / ready / error)
- **Delete document** — removes all associated chunks from vector store
- **Re-index** — re-process a document if needed
- **Document tags** — label by type: `product`, `script`, `compliance`, `faq`
- **Preview** — view extracted text to verify parsing quality

### RAG Query at Call Time

```
Transcript chunk (last 2-3 sentences)
        ↓
nomic-embed-text → query embedding
        ↓
pgvector cosine similarity search (top 5 chunks)
        ↓
Chunks injected into Qwen3-8B prompt as context
        ↓
LLM generates suggestion grounded in actual bank documents
```

### DB Schema (documents)

```sql
-- Uploaded documents metadata
CREATE TABLE documents (
    id          UUID PRIMARY KEY,
    filename    VARCHAR NOT NULL,
    tag         VARCHAR,           -- product, script, compliance, faq
    page_count  INT,
    chunk_count INT,
    status      VARCHAR,           -- indexing, ready, error
    uploaded_by UUID,              -- admin user id
    uploaded_at TIMESTAMP
);

-- Vector chunks (pgvector)
CREATE TABLE document_chunks (
    id          UUID PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content     TEXT,
    embedding   vector(768),       -- nomic-embed-text dimension
    page_number INT,
    chunk_index INT
);

CREATE INDEX ON document_chunks
    USING ivfflat (embedding vector_cosine_ops);
```

---

## Demo Scenarios (for Hackathon)

### Scenario 1: Objection — "Too Expensive"
- Customer says "foiz stavkangiz qimmat" (your interest rate is expensive)
- System detects objection, sentiment → Negative
- AI suggests: comparison with market rate + monthly payment breakdown

### Scenario 2: Cross-sell Opportunity
- Customer approved for loan, positive sentiment
- AI suggests: "Offer cashback card — customer profile matches"

### Scenario 3: Compliance Miss
- Agent forgets to mention interest rate in APR form
- Compliance checklist shows ❌ — alerts agent before call ends

---

## UI Design Principles

- **Dark theme** — agent stares at screen all day, easy on eyes
- **Two-panel layout** — transcript left, suggestions right
- **Suggestions appear as cards** — not text walls, scannable in 2 seconds
- **Green/yellow/red** sentiment is peripheral vision-friendly
- **Copy button** on every suggestion — zero friction to use
- **No modals during call** — everything inline, non-blocking

---

## Guardrail Layer (Pre-LLM Filter)

Every transcript chunk passes through a guardrail **before** any LLM call is made.

### Two Hard Rules

| Rule | Behavior |
|---|---|
| Non-bank topic detected | Request dropped. LLM never called. UI shows nothing. |
| Response language | Always Uzbek only — hardcoded in system prompt, no exceptions |

### How Topic Filter Works

```
Transcript chunk arrives
        ↓
GuardrailService.check(text)
        ↓
Is it bank-related? ──NO──→ DROP. Return None. LLM not called.
        ↓ YES
Send to RAG → LLM
        ↓
Response forced in Uzbek via system prompt
```

### Bank Topic Classifier

Lightweight keyword + category check — no LLM needed for this step (fast, cheap):

```python
BANK_TOPICS = {
    "kredit", "karta", "omonat", "lizing", "sug'urta",
    "foiz", "stavka", "to'lov", "muddat", "limit",
    "overdraft", "ipoteka", "depozit", "valyuta",
    "hisobvaraq", "o'tkazma", "balans", "qarz",
    "loan", "credit", "deposit", "payment", "card",
    # Russian terms
    "кредит", "карта", "депозит", "платёж", "ставка"
}

def is_bank_related(text: str) -> bool:
    tokens = set(text.lower().split())
    return bool(tokens & BANK_TOPICS)
```

If `is_bank_related()` returns `False` → **full stop**, nothing sent to LLM.

### Uzbek-Only System Prompt (hardcoded)

```python
SYSTEM_PROMPT = """
Sen O'zbekiston bank kol-markazi agentiga yordam beruvchi AI assistantsan.

QOIDALAR (o'zgartirib bo'lmaydi):
1. FAQAT bank mavzularida javob ber: kredit, karta, omonat, to'lov, lizing, sug'urta, foiz stavkasi.
2. Bank bilan bog'liq bo'lmagan savollarga HECH QACHON javob berma.
3. Javoblarni FAQAT O'ZBEK TILIDA yoz. Boshqa tilda yozma.
4. Faqat berilgan kontekst (bank hujjatlari) asosida javob ber.
5. Taxminiy yoki o'ylab topilgan ma'lumot berma.

Agar savol bank mavzusida bo'lmasa: hech narsa qaytarma.
"""
```

### What Gets Blocked (examples)

| User says | Action |
|---|---|
| "Ob-havo qanday?" | ❌ Blocked — not bank |
| "Menga she'r yoz" | ❌ Blocked — not bank |
| "Python nima?" | ❌ Blocked — not bank |
| "Kredit foizi qancha?" | ✅ Passes |
| "Karta limiti qanday oshiriladi?" | ✅ Passes |
| "Omonat muddati necha oy?" | ✅ Passes |

### Agent UI Behavior on Block

- Suggestion panel stays **empty** — no error shown, no message
- Agent sees nothing = they handle it themselves
- No unnecessary distraction during live call

- VoIP / telephony integration (use browser mic for demo)
- Real CRM/ABS integration (mock data)
- Fine-tuned models (use Qwen3-8B as-is)
- Multi-tenant / auth system (JWT auth for 3 roles: admin, agent, supervisor — no multi-bank)
- OCR for scanned PDFs (assume text-layer PDFs from bank)

---

## Success Criteria (Hackathon)

1. Demo runs smoothly end-to-end with preloaded scenario
2. AI suggestion appears within 1.5s of objection keyword
3. Compliance checklist auto-updates during transcript
4. Admin can upload a PDF and it becomes searchable within 30 seconds
5. UI is clean enough that a non-technical judge understands the value in 30 seconds
6. Post-call summary is generated and displayed

---

## Pitch Narrative

> "Bank agenti har kuni 80 ta qo'ng'iroq qiladi. E'tirozga javob qidirish uchun 30 soniya sarflaydi — mijoz soviydi. Biz shu 30 soniyani 1.5 soniyaga tushirdik. Barcha ma'lumotlar bankning o'z serverida — tashqariga chiqqan bit yo'q."

> "A bank agent makes 80 calls a day. Finding a response to an objection takes 30 seconds — the customer loses interest. We reduced those 30 seconds to 1.5. All data stays on the bank's own server — not a single bit leaves."