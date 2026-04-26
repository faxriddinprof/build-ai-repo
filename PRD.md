# PRD: Real-Time AI Sales Assistant — Bank Call Center Copilot

**Version:** 1.0 | **Date:** 2026-04-25 | **Status:** Draft  
**Audience:** Hackathon judges, development team

---

## 1. Executive Summary

Bank call center agents in Uzbekistan make 80+ calls per day. When a customer raises an objection, agents spend 20–30 seconds searching scripts manually — the customer loses interest, conversion drops. This product is an on-premise AI copilot that listens to agent-customer calls in real time, transcribes Uzbek/Russian speech in < 500 ms, detects objections, and surfaces ready-to-use Uzbek-language suggestions within **1.5 seconds** — all without a single bit of data leaving the bank's server.

**Primary KPI:** Suggestion card displayed on agent screen ≤ 1.5 s after objection keyword detected.

---

## 2. Goals & Non-Goals

### Goals (Hackathon MVP)

| # | Goal | Pass Criterion |
|---|------|----------------|
| G1 | Stable end-to-end demo | Scenario completes in ≤ 3 min with no crash |
| G2 | AI suggestion latency | Card appears ≤ 1.5 s after objection keyword |
| G3 | Auto-compliance checking | ≥ 2 required phrases auto-tick during demo call |
| G4 | Knowledge base indexing | PDF → RAG-searchable in ≤ 30 s after admin upload |
| G5 | Post-call summary | Generated and displayed ≤ 5 s after call end |
| G6 | Customer intake extraction | Name / passport / region auto-extracted and shown for confirmation within first 15 s of call |

### Non-Goals

- VoIP / telephony integration (browser mic only)
- Real CRM / ABS integration (mock data)
- Fine-tuned models (Qwen3-8B as-is)
- Multi-tenancy / multi-bank deployments
- OCR for scanned PDFs (text-layer PDFs only)
- Production HA, SLAs, disaster recovery

---

## 3. Personas & Roles

| Role | JWT Claim | Core Access |
|------|-----------|-------------|
| `agent` | `role:agent` | Agent Dashboard: live transcript, intake confirmation, suggestions, compliance, post-call summary |
| `supervisor` | `role:supervisor` | Supervisor Dashboard: all live calls read-only, sentiment monitoring |
| `admin` | `role:admin` | Admin Panel: PDF management, user management |

Single bank instance. No self-registration. Admin creates all accounts.

---

## 4. User Stories

### Agent
- **US-A1** — Start a call; see a live labeled transcript (Agent / Mijoz) updated in real time.
- **US-A2** — Within 15 s of call start, see an Intake Confirmation Card with auto-extracted customer name, passport number, and region; confirm or correct before proceeding. Values saved to call record.
- **US-A3** — When customer raises an objection, see a suggestion card within 1.5 s with ≤ 3 Uzbek-language bullets; copy any bullet with one click.
- **US-A4** — See a live sentiment badge (🟢 / 🟡 / 🔴) updating throughout the call.
- **US-A5** — See compliance checklist auto-tick as required phrases are spoken; unchecked items flash ❌ before call ends.
- **US-A6** — After ending the call, see a post-call summary with outcome, top objections, compliance status, and next action.

### Supervisor
- **US-S1** — See all active calls in a grid: agent name, duration, sentiment badge.
- **US-S2** — Click any call to view its live transcript and compliance checklist (read-only).

### Admin
- **US-D1** — Upload a PDF (drag-and-drop), tag it (product / script / compliance / faq), monitor indexing status (indexing → ready / error).
- **US-D2** — Delete a document; all its vector chunks are removed.
- **US-D3** — Create agent and supervisor accounts with assigned roles.

### Demo Mode
- **US-DM1** — Select a pre-loaded scenario (WAV + script) and play it through the same pipeline as a live call — no microphone required.

---

## 5. Functional Requirements

| ID | Requirement |
|----|-------------|
| **FR-Audio** | Browser mic via MediaRecorder API, 100 ms chunks, streamed over WebSocket to backend. Demo Mode plays bundled WAV files through the same WebSocket pipeline. Both must ship. |
| **FR-STT** | `faster-whisper large-v3` transcribes chunks. Supports `uz` (Uzbek) and `ru` (Russian). Per-chunk latency ≤ 500 ms. Simple energy-based speaker turn detection (Agent / Customer). |
| **FR-Guardrail** | `GuardrailService.is_bank_related(text)` keyword check before any LLM call. Non-bank text → DROP silently (no LLM call, suggestion panel stays empty). All LLM system prompts hardcode Uzbek-only output. |
| **FR-RAG** | Ingest: PDF → PyMuPDF → 500-token chunks (50-token overlap) → `nomic-embed-text` (768-dim) → pgvector. Query: embed last 2–3 transcript sentences → top-5 cosine similarity → inject as LLM context. |
| **FR-Suggestions** | `llm_service` calls Qwen3-8B via the `litellm` Python SDK (direct to Ollama, no proxy). Max 100 output tokens, streamed (first token ≤ 150 ms). Triggered on objection keyword or question keyword in transcript. |
| **FR-Sentiment** | `sentiment_service`: keyword scan (positive / neutral / negative word lists) + optional LLM confirmation. Output: 3-state label → WebSocket push to agent. |
| **FR-Compliance** | `compliance_service`: predefined `REQUIRED_PHRASES` (e.g. interest rate disclosure, data consent). Fuzzy-match on transcript → WebSocket push when detected. Unchecked items shown as ❌ after call. |
| **FR-Intake** | `extraction_service`: sliding 60 s window at call start sent to Qwen3-8B for structured extraction of `customer_name`, `customer_passport_number`, `customer_region` as JSON. Agent sees Intake Confirmation Card; confirms or edits. `PATCH /api/calls/:id/intake` saves values. Confidence < 0.8 → fields left blank for manual entry. |
| **FR-Summary** | On `POST /api/calls/:id/end`: full transcript sent to Qwen3-8B. Output: `{outcome, objections[], compliance_status, next_action}` JSON. Saved to `calls.summary`. Displayed in PostCallSummary modal. |
| **FR-Admin** | `POST /api/admin/documents` accepts multipart PDF. Ingest runs async. Status pushed via polling or WebSocket. Delete cascades to `document_chunks`. |
| **FR-Supervisor** | `WS /ws/supervisor` pushes: `call_started`, `transcript_chunk`, `sentiment_update`, `call_ended`. Dashboard aggregates all active sessions in real time. |
| **FR-Auth** | JWT Bearer. Access token TTL: 8 h. Refresh token: 30 d. Role enforced at FastAPI dependency level. Wrong role → 403. |

---

## 6. Non-Functional Requirements

### Latency Budget (call-time, end-to-end)

| Stage | Target |
|-------|--------|
| Audio chunk capture | 100 ms |
| STT (faster-whisper) | ≤ 500 ms |
| Guardrail + RAG retrieval | ≤ 150 ms |
| LLM first token (streaming) | ≤ 150 ms |
| WebSocket + UI render | ≤ 100 ms |
| **Total** | **≤ 1.5 s** |

### Infrastructure

| Constraint | Value |
|-----------|-------|
| Deployment | Docker Compose, single host, on-prem |
| GPU | RTX 5070 Ti 16 GB VRAM; combined usage ≤ 7 GB |
| `faster-whisper large-v3` | ~2 GB VRAM |
| `Qwen3-8B Q4_K_M` | ~5 GB VRAM |
| Data residency | 100% on-prem; zero external API calls |
| Browser | Chrome / Edge (MediaRecorder API required) |
| Model warm-up | Both models pre-warmed at container start |

---

## 7. Architecture Overview

```
Browser (Agent)
  ├── MediaRecorder / Demo WAV → WS /ws/audio → STT → transcript chunks
  └── WS /ws/suggestions ← AI Suggestion events

FastAPI Backend
  ├── STT Service          faster-whisper
  ├── Guardrail Service    keyword filter, drops non-bank
  ├── Extraction Service   Qwen3-8B: name / passport / region
  ├── RAG Service          pgvector cosine search
  ├── LLM Service          Qwen3-8B via litellm SDK → suggestions
  ├── Sentiment Service
  ├── Compliance Service
  └── Summary Service      post-call

Ollama → Qwen3-8B + nomic-embed-text (called directly by the api over HTTP via the litellm Python SDK; no proxy in the data path)
PostgreSQL + pgvector → documents, document_chunks, calls, users, suggestions_log
```

---

## 8. Data Model

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY,
    email         VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    role          VARCHAR NOT NULL,  -- admin | supervisor | agent
    created_at    TIMESTAMP
);

CREATE TABLE calls (
    id                  UUID PRIMARY KEY,
    agent_id            UUID REFERENCES users(id),
    started_at          TIMESTAMP,
    ended_at            TIMESTAMP,
    customer_name       VARCHAR,
    customer_passport   VARCHAR,        -- excluded from supervisor WS events
    customer_region     VARCHAR,
    intake_confirmed_at TIMESTAMP,
    summary             JSONB,
    compliance_status   JSONB
);

CREATE TABLE suggestions_log (
    id         UUID PRIMARY KEY,
    call_id    UUID REFERENCES calls(id),
    trigger    TEXT,
    suggestion TEXT,
    created_at TIMESTAMP
);

CREATE TABLE documents (
    id          UUID PRIMARY KEY,
    filename    VARCHAR NOT NULL,
    tag         VARCHAR,           -- product | script | compliance | faq
    page_count  INT,
    chunk_count INT,
    status      VARCHAR,           -- indexing | ready | error
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP
);

CREATE TABLE document_chunks (
    id          UUID PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content     TEXT,
    embedding   vector(768),
    page_number INT,
    chunk_index INT
);
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);
```

---

## 9. API Surface

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | public | Returns access + refresh tokens |
| `POST` | `/api/auth/refresh` | public | Returns new access token |
| `WS` | `/ws/audio` | agent | Audio chunks in → transcript + suggestions out |
| `WS` | `/ws/supervisor` | supervisor | All active call events |
| `POST` | `/api/calls` | agent | Create call record |
| `GET` | `/api/calls/:id` | agent, supervisor | Fetch call + transcript + summary |
| `PATCH` | `/api/calls/:id/intake` | agent | Confirm / update intake fields |
| `POST` | `/api/calls/:id/end` | agent | End call, trigger summary generation |
| `POST` | `/api/admin/documents` | admin | Upload PDF, start ingest |
| `GET` | `/api/admin/documents` | admin | List documents + status |
| `DELETE` | `/api/admin/documents/:id` | admin | Delete doc + all chunks |
| `GET` | `/api/demo/scenarios` | agent | List available demo WAV scenarios |
| `POST` | `/api/demo/play` | agent | Start demo scenario playback |

---

## 10. UI Spec

### Agent Dashboard (`/agent`)
- **Left panel:** Live Transcript — scrolling, speaker-labeled (Agent / Mijoz), 14 px monospace
- **Right panel:** AI Suggestion Cards — max 3 bullets per card, Copy button per bullet
- **Top bar:** CallTimer, SentimentBadge (🟢/🟡/🔴), Demo Mode toggle
- **Intake Confirmation Card** (floats above transcript at call start): auto-extracted name / passport / region; Confirm and Edit buttons; dismisses after confirmation
- **Bottom bar:** ComplianceChecklist — horizontal chips (✅ / ⬜ / ❌ per required phrase), flashes on miss
- **On call end:** PostCallSummary modal with outcome, objections, compliance status, next action

### Supervisor Dashboard (`/supervisor`)
- Grid of active call cards: agent name, duration, sentiment badge, top objection tag
- Click → read-only transcript + compliance drawer

### Admin Panel (`/admin`)
- DocumentUploader: drag-and-drop, multi-file
- DocumentList: name, tag, pages, chunks, status (with progress), actions (delete / re-index)
- User management table: create / deactivate accounts

---

## 11. Demo Plan

| # | Scenario | What judges see |
|---|----------|-----------------|
| D1 | **Objection — Too Expensive** | "foiz stavkangiz qimmat" → suggestion card in ≤ 1.5 s; sentiment 🔴 |
| D2 | **Cross-sell Opportunity** | Loan confirmed; AI suggests cashback card; sentiment 🟢 |
| D3 | **Compliance Miss** | APR disclosure skipped; checklist shows ❌; alert badge flashes |
| D4 | **Customer Intake Extraction** | Agent greets customer; Intake Card pops with pre-filled name / passport / region in ≤ 15 s |

---

## 12. Milestones

| Week | Deliverable |
|------|-------------|
| W1 | Docker Compose: postgres+pgvector, ollama, FastAPI skeleton (litellm SDK in-process), React Vite shell, JWT auth end-to-end |
| W2 | Browser mic → WS → STT → live transcript on Agent Dashboard; Guardrail service; basic LLM suggestion loop (no RAG) |
| W3 | PDF ingest + pgvector RAG; Intake extraction service + Confirmation Card; Sentiment + Compliance services; Supervisor WS |
| W4 | Post-call summary; Demo Mode WAV playback; Admin Panel UI; dark-theme polish; full end-to-end demo rehearsal |

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| STT accuracy on Uzbek dialect variation | Use `large-v3` (best multilingual); fall back to Russian if UZ confidence low |
| LLM outputs non-Uzbek text | Assert language post-output; retry once; log if retry fails |
| Passport extraction false positives | Confidence threshold > 0.8 required; agent always confirms before DB write |
| `customer_passport` data exposure | Field excluded from supervisor WebSocket events; agent-only |
| Demo mic / GPU hardware failure | Demo Mode (WAV playback) always available as backup |
| Latency miss on cold GPU | Pre-warm both models with a dummy inference at container start |

---

## 14. Acceptance Tests

| FR | Test | Pass |
|----|------|------|
| FR-Audio | Start call via browser mic | Transcript updates within 3 s; no browser console errors |
| FR-Audio Demo | Demo Mode → Scenario D1 → Play | Same pipeline activates without microphone |
| FR-STT | Speak "kredit foizi qancha?" | Uzbek text appears ≤ 500 ms after speaking |
| FR-Guardrail (block) | Speak "ob-havo qanday?" | Suggestion panel stays empty; no LLM call in backend logs |
| FR-Guardrail (pass) | Speak "kredit muddati?" | LLM fires; suggestion appears |
| FR-RAG | Upload product PDF; start call; ask related question | Suggestion references PDF content |
| FR-Suggestions | Speak "qimmat" objection phrase | Suggestion card with ≤ 3 Uzbek bullets appears ≤ 1.5 s |
| FR-Sentiment | Speak negative phrases | Badge turns 🔴 within next sentiment update |
| FR-Compliance | Say required disclosure phrase | Corresponding checklist item ticks ✅ |
| FR-Intake | Speak name + passport + region in first 60 s | Intake Confirmation Card appears with pre-filled fields |
| FR-Summary | Click End Call | PostCallSummary modal shows outcome + objections + next action |
| FR-Admin | Upload PDF as admin | Status: indexing → ready in ≤ 30 s |
| FR-Supervisor | Open supervisor while agent call is active | Call card visible; sentiment badge updates live |
| FR-Auth | Access `/agent` without token | 401 response |
| FR-Auth | Call `DELETE /api/admin/documents/:id` as agent | 403 response |

---

## 15. Open Questions

1. What specific phrases belong in `REQUIRED_PHRASES` for the compliance checklist? (Needs bank/legal input or agreed placeholder list.)
2. Passport field format: plain string or validated regex (e.g. `^[A-Z]{2}\d{7}$`)? Who masks it in logs and exports?
3. Demo WAV files: team-recorded or TTS-synthesized Uzbek/Russian audio?
4. Exact hackathon date? (Needed to confirm W4 end date.)
5. Should the demo UI include English tooltips or captions for non-Uzbek-speaking judges?
