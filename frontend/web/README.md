# SQB AI Sales Copilot — Frontend

Real-time AI assistant for bank call center agents. Transcribes Uzbek/Russian speech, detects objections, and surfaces Uzbek-language suggestions in under 1.5 seconds.

## Quick start

```bash
cd frontend/web
pnpm install
pnpm dev          # starts on http://localhost:5173
```

The dev server proxies `/api`, `/ws`, and `/customer` to `http://localhost:8000`.  
Backend must be running: `docker compose up` from the repo root.

To seed demo clients (required for the customer page):
```bash
docker compose exec api python scripts/seed_clients.py
```

---

## Roles and pages

### Agent / Admin → `/agent`

The main AI cockpit. Requires `agent` or `admin` role.

**What you see:**
- **Left panel** — live transcript of the call, auto-scrolling, speaker bubbles
- **Right panel** — AI suggestions that appear after detected objections
- **Queue rail** (right sidebar) — waiting customers, sortable by wait time; collapse with the `›` button
- **Compliance bar** (bottom) — checklist items tick green as the script is followed
- **Intake card** (floating) — auto-filled customer name / passport / region; confirm or dismiss

**Call flow:**
1. An `IncomingCallModal` pops up when a customer is waiting. Click **Qabul qilish** to accept.
2. The session starts — WebRTC audio connects automatically.
3. Transcript and AI suggestions stream in real time.
4. When the intake card appears (~20 s), review the extracted data and click **Tasdiqlash**.
5. Click **Yakunlash** (red, bottom-right) to end the call. A post-call summary appears.
6. Click **Yangi qo'ng'iroq** to reset and accept the next call.

**Demo mode** (toggle in the top bar):
- **ON** — plays the scripted Bekzod Karimov demo call; no backend audio required. Useful for demos without live infrastructure.
- **OFF** — connects to the real backend; requires microphone permission.

**Skip a call:** In the IncomingCallModal click **O'tkazib yuborish**, choose a reason from the dropdown, and optionally add a note.

**Theme toggle:** Sun/moon icon in the top bar switches between light and dark mode (persisted to localStorage).

---

### Supervisor → `/supervisor`

Live monitoring of all active agent calls. Requires `supervisor` or `admin` role.

**What you see:**
- **Faol qo'ng'iroqlar tab** — grid of active call cards, each showing customer name, agent, live duration timer, sentiment badge, and top objection chip. Click any card to open the transcript drawer.
- **Tarix tab** — paginated call history table with outcome filter chips (all / completed / failed / transferred), showing duration, sentiment, compliance score, and date.
- **Transcript drawer** (slides in from right) — full speaker-labelled transcript for the selected call, with a privacy notice confirming passport data is scrubbed. Press Escape or click the backdrop to close.

Active calls refresh every 5 seconds; the supervisor WebSocket (`/ws/supervisor`) triggers immediate invalidation on any event.

---

### Admin → `/agent`

Admins share the agent dashboard route. Admin-specific user/document management is out of scope for V1.

Default credentials (from `backend/.env`):
```
email:    admin@bank.uz
password: changeme
```

---

### Customer (public) → `/customer/:clientId/call`

No login required. This is the page a customer opens via a shared link.

**Flow:**
1. Page loads and fetches the customer's display name and queue token.
2. Customer sees a hero call button and their name (e.g. "Salom, Davron M.!").
3. Tap **Bog'lanish** — status changes to "Operator qidirilmoqda…" and a wait timer starts.
4. When an agent accepts, WebRTC connects automatically and the call begins.
5. Tap **Qo'ng'iroqni yakunlash** to hang up.

**URL format:** `http://localhost:5173/customer/<client_id>/call`  
The `client_id` is a UUID printed by `scripts/seed_clients.py`.

---

## Environment

All config is via Vite proxy — no `.env` file needed for local dev.  
In production, set `VITE_API_BASE` to point at the backend host.

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `''` (proxy) | Backend base URL; empty = use Vite proxy |

---

## Scripts

```bash
pnpm dev          # dev server with HMR
pnpm build        # production build → dist/
pnpm preview      # preview the production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm fmt          # prettier --write
```
