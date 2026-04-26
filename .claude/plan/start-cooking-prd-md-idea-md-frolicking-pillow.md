# Plan: Backend Design Parity for SQB AI Sales Copilot

## Context

`frontend/DESIGN_PROMPT.md` + `frontend/ai-assesent/` define 6 screens (Login, Customer Call, IncomingCall queue, Agent Dashboard, Supervisor live + history, Post-Call Summary). Backend's live-AI loop already matches the Agent Dashboard core (transcript / sentiment / compliance / suggestion / intake / summary events), but several FE-required data shapes and auxiliary subsystems are missing. This plan closes every gap so the frontend can be implemented against the real backend without mock data.

## Gaps to close

1. **Inbound call queue** model + `IncomingCall` accept/skip-with-reason API.
2. **Customer-side public call endpoint** (no JWT) + short-lived customer token for WebRTC.
3. **Supervisor history table** — `Call` lacks `outcome`, `compliance_score`, `top_objection`, `ended_at`-based listing.
4. **Post-call summary schema** — design wants `natija` / `etirozlar` / `etirozlarBartaraf` / `keyingiQadam` / `complianceHolati{passed,total}` / `sentimentJourney`. Current schema returns only `outcome` enum + `objections` + `next_action` + string `compliance_status`.
5. **`customer_phone` field** on `Call` (FE shows masked `+998 90 ••• 23 45`).
6. **Early intake trigger** — current auto-trigger is 60 s; FE shows the intake card at ~20 s.
7. **Suggestion `trigger` field** — currently `text[:60]` (raw line snippet); FE quotes it as if it's the keyword (e.g. "«qimmat»").
8. **Sentiment journey** persistence (FE summary shows the journey arc).
9. **Top objection** persistence (FE supervisor card pill + history column).
10. **Supervisor snapshot + drawer transcript** — FE seeds dashboard from a snapshot before WS catches up; drawer needs a live (passport-scrubbed) transcript fetch.

## Phase 1 — Files created (DONE)

| Path | Status |
|------|--------|
| `backend/app/models/call_queue.py` | ✅ |
| `backend/app/routers/queue.py` | ✅ |
| `backend/app/routers/customer.py` | ✅ |
| `backend/app/routers/supervisor_api.py` | ✅ |
| `backend/app/services/queue_service.py` | ✅ |
| `backend/app/data/objections.py` | ✅ |
| `backend/alembic/versions/0004_design_parity.py` | ✅ |
| `backend/app/utils/text.py` | ✅ |

## Phase 1 — Files modified (DONE)

| Path | Change |
|------|--------|
| `backend/app/models/call.py` | customer_phone, outcome, compliance_score, top_objection, sentiment_journey |
| `backend/app/schemas/call.py` | CallCreate+customer_phone, CallHistoryItem, updated CallResponse |
| `backend/app/prompts/summary_uz.py` | New natija/etirozlar/complianceHolati shape |
| `backend/app/services/summary_service.py` | Parse new keys, merge journey+objection |
| `backend/app/services/call_pipeline.py` | Journey tracking, real trigger label, 20 s intake gate, finalize persistence |
| `backend/app/services/auth_service.py` | create_customer_token(queue_id) |
| `backend/app/config.py` | INTAKE_AUTO_TRIGGER_AT_SECONDS=20, CUSTOMER_TOKEN_TTL_MINUTES=10 |
| `backend/app/main.py` | Include queue, customer, supervisor_api routers |
| `backend/app/models/__init__.py` | Export CallQueueEntry, SkipLog |

## Customer-side WebRTC strategy

1. `POST /api/customer/call/initiate` → server creates `CallQueueEntry` + issues short-lived `customer_token` (JWT, `sub=queue:<id>`, `role=customer`, 10-min TTL).
2. Operator calls `POST /api/queue/{id}/accept` → backend marks entry `accepted`.
3. Customer polls `GET /api/customer/call/{token}/status` until `accepted=true`, then upgrades to WebRTC.

No SIP/PBX. Browser-to-browser WebRTC with optional TURN.

---

# Phase 2 Addendum: Client Profile + Dual-RAG (Option B)

## Context

Phase 1 closed FE design parity. Now adding normalized 9-table client store + dual-purpose RAG:

- **Job A — Sales recommendation:** customer's banking history → which product to pitch and why.
- **Job B — Communication-script suggestion:** live transcript + client profile + product KB → exact next sentence for agent.

**No guardrail / no topic filter.** AI is advisory-only. Agent owns conversation. Backend never drops chunks. AI surfaces hints; agent decides.

Customer page is **public** at `/customer/<client_id>/call` — no JWT.

## Schema — 9 normalized tables

| Table | PK | FKs | Notes |
|-------|----|----|-------|
| `clients` | `client_id` (uuid) | — | first_name, last_name, middle_name, birth_date, gender, citizenship, pinfl, passport_number, passport_issue_date, passport_issue_place |
| `contacts` | id | `client_id` | phone, email, registration_address, actual_address, is_primary_phone bool |
| `accounts` | `account_id` | `client_id` | account_number, currency, balance numeric(18,2), opened_at, status |
| `cards` | id | `account_id` | card_type (HUMO/UZCARD/VISA), card_number_masked, expiry_date, status |
| `transactions` | id | `account_id` | amount, type (debit/credit), tx_date, description, merchant_category |
| `loans` | `loan_id` | `client_id` | loan_amount, interest_rate, opened_at, due_at, remaining_balance, status (active/closed/overdue) |
| `loan_payments` | id | `loan_id` | amount, paid_at, is_late bool |
| `deposits` | `deposit_id` | `client_id` | type, amount, interest_rate, opened_at, matures_at, status |
| `risk_profiles` | id | `client_id` (unique) | credit_score int, credit_history_summary text, debt_status, risk_category (low/medium/high), updated_at |
| `client_history` | id | `client_id` | join_date, branch_name, products_used (jsonb array), notes |

PII (`passport_number`, `pinfl`, full card number) never leaves server. Card stored masked. LLM prompt receives sanitized profile only.

## Files to create

| Path | Purpose |
|------|---------|
| `backend/app/models/client.py` | `Client` SQLAlchemy model |
| `backend/app/models/banking.py` | `Contact`, `Account`, `Card`, `Transaction`, `Loan`, `LoanPayment`, `Deposit`, `RiskProfile`, `ClientHistory` |
| `backend/alembic/versions/0005_clients.py` | Creates 9 tables + indexes |
| `backend/app/services/client_profile_service.py` | `get_profile(db, client_id)`, `format_for_llm(profile)`, `recommendations(profile)` |
| `backend/app/services/sales_rag_service.py` | `build_context(call_id, query, db)` → client_facts + product chunks |
| `backend/app/routers/customer_page.py` | `GET /customer/{client_id}/call` public endpoint |
| `backend/app/schemas/client.py` | `ClientProfile`, `ProductPitch`, `RecommendationEvent`, `LiveScriptEvent` |
| `backend/scripts/seed_clients.py` | 3 demo clients (Toshkent/Samarqand/Andijon, mixed risk) |
| `backend/app/prompts/sales_uz.py` | `SALES_RECOMMENDATION_PROMPT` + `LIVE_SCRIPT_PROMPT` |

## Files to modify

| Path | Change |
|------|--------|
| `backend/app/models/call.py` | Add `client_id` FK → `clients.client_id` (nullable) |
| `backend/app/models/call_queue.py` | Add `client_id` FK (nullable) |
| `backend/app/routers/customer.py` | `/initiate` accepts optional `client_id`; derive masked_phone from primary contact |
| `backend/app/routers/queue.py` | `/accept` propagates `client_id` queue → Call |
| `backend/app/services/call_pipeline.py` | Load ClientProfile at start_call; remove guardrail drop; build dual-RAG context; emit `recommendation` + `live_script` events |
| `backend/app/services/rag_service.py` | `build_context(query, client_profile=None)` — prepend client_facts when present |
| `backend/app/prompts/system_uz.py` | Add `{client_facts}` slot; inject advisory-only rules |
| `backend/app/schemas/call.py` | `CallCreate` accepts `client_id`; add new event envelopes |
| `backend/app/main.py` | Include `customer_page` router |
| `backend/Makefile` | `seed-clients` target |

## Dual-RAG flow

```
Live transcript chunk (all chunks pass through — no topic gate)
        │
        ▼
sales_rag_service.build_context(call_id, query)
   ├── _call_state[call_id]["client_profile"] → format_for_llm() → client_facts_uz (≤300 tokens)
   │                                          → recommendations() → top 1–2 ProductPitch
   └── rag_service.search(query) → top-5 product/policy chunks
        │
        ├─ LLM #1 (debounced 30 s): SALES_RECOMMENDATION_PROMPT
        │   input: client_facts + pitches + recent_transcript
        │   output: { product, rationale_uz, confidence }
        │   emit → event "recommendation"
        │
        └─ LLM #2 (per objection / per 3 turns): LIVE_SCRIPT_PROMPT
            input: client_facts + doc_chunks + last_3_turns + objection_label
            output: { next_sentence_uz } (empty string = no hint)
            emit → event "live_script"
```

Profile loaded once at `start_call`, never re-fetched. Both LLMs told: "Siz faqat maslahat berasiz — operator gapiradi."

## Public customer page

`GET /customer/{client_id}/call`:
- Public, rate-limited (10 req/min/IP).
- Returns `{ display_name, masked_phone, region, ice_servers, customer_token }`.
- Creates fresh `CallQueueEntry` with `client_id`.
- FE: one button → initiate → poll status → WebRTC.

## Implementation order

1. Migration `0005_clients.py` + models `client.py` + `banking.py`
2. `make migrate`
3. Seed script + `make seed-clients`
4. `client_profile_service` + unit tests
5. Wire `client_id` through queue → call → pipeline state
6. `sales_rag_service` + dual-LLM emit in `call_pipeline`
7. Sales + script prompts (`sales_uz.py`, update `system_uz.py`)
8. Public `/customer/{client_id}/call` route
9. `make test` — target ~95 passing

## Critical files

- `backend/alembic/versions/0005_clients.py` (NEW)
- `backend/app/models/client.py`, `backend/app/models/banking.py` (NEW)
- `backend/app/services/client_profile_service.py` (NEW)
- `backend/app/services/sales_rag_service.py` (NEW)
- `backend/app/services/call_pipeline.py` (modified — dual-LLM, no guardrail)
- `backend/app/prompts/sales_uz.py` (NEW)
- `backend/app/routers/customer_page.py` (NEW)
- `backend/scripts/seed_clients.py` (NEW)

## Verification

```bash
make migrate
make seed-clients
psql $DATABASE_URL -c "select client_id, first_name, last_name from clients;"

CID=$(psql -At $DATABASE_URL -c "select client_id from clients limit 1;")
curl -s "http://localhost:8000/customer/$CID/call" | jq
# → { display_name, masked_phone, region, ice_servers, customer_token }

# Live call: expect events recommendation { product, rationale_uz } + live_script { next_sentence_uz }

make test    # ~95 passing
```

## Out of scope (Phase 2)

- Real bank core-banking integration (seed script is source of truth)
- Admin panel client editing (read-only)
- ML-based recommendation re-ranking
- GDPR export/delete endpoints

## Open assumptions

1. `client_id` UUID in URL is low-risk — carries no auth power, server enforces all reads.
2. `format_for_llm` budget ≤300 tokens — fits Qwen3-8B with 5 RAG chunks.
3. Recommendation debounced 30 s; live_script throttled per 3 turns OR on objection match.
4. Card number stored as `**** **** **** 1234` — full PAN never persisted.
5. PII excluded from LLM: passport, pinfl, full card, full address. Allowed: first_name + last initial, age bucket, region, product summary, balance buckets, risk_category.
6. AI strictly advisory — no topic gate. Compliance + sentiment + intake run on every chunk.
