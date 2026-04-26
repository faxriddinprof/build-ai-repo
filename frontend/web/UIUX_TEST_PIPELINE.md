# SQB AI Copilot — UI/UX Manual Test Pipeline

## Credentials

| Role | Email | Password | URL |
|---|---|---|---|
| Admin | `admin@bank.uz` | `changeme` | `http://localhost:5173/agent` |
| Agent | `agent@bank.uz` | `changeme` | `http://localhost:5173/agent` |
| Supervisor | `supervisor@bank.uz` | `supervisor123` | `http://localhost:5173/supervisor` |

## Seeded Demo Clients

| Name | URL |
|---|---|
| Davron Mamatov | `http://localhost:5173/customer/e567ab95-de0a-4a37-a6aa-7fba9a1a5bd6/call` |
| Farrux Toshpulatov | `http://localhost:5173/customer/ecb33ceb-822c-46a7-91b7-6b3e75ff0b9f/call` |
| Jamshid Toshpulatov | `http://localhost:5173/customer/14e42366-7d70-480f-8227-5130342b7458/call` |
| Jasur Asqarov | `http://localhost:5173/customer/d487fbe0-7543-48f6-a81b-b7b215116ea2/call` |
| Madina Khamidov | `http://localhost:5173/customer/d1001723-dc35-4e0b-81ec-5e26d1a1ad0d/call` |

---

## Prerequisites

```bash
docker compose up        # backend on http://localhost:8000
pnpm --prefix frontend/web dev   # frontend on http://localhost:5173
```

---

## 1. Auth

**URL:** `http://localhost:5173/login`

| # | Action | Expected result |
|---|---|---|
| 1.1 | Open `/login` without being logged in | Login page renders |
| 1.2 | Submit wrong password | Error message shown, no redirect |
| 1.3 | Login as `admin@bank.uz` / `changeme` | Redirected to `/agent` |
| 1.4 | Open `http://localhost:5173/` | Auto-redirects to `/agent` |
| 1.5 | Click logout | Redirected to `/login` |
| 1.6 | Login as `supervisor@bank.uz` / `supervisor123` | Redirected to `/supervisor` |
| 1.7 | Login as `agent@bank.uz` / `changeme` | Redirected to `/agent` |
| 1.8 | Try opening `/supervisor` as agent | Redirected to `/login` |

---

## 2. Agent Dashboard — Demo Mode

**Login:** `admin@bank.uz` / `changeme` → `http://localhost:5173/agent`

| # | Action | Expected result |
|---|---|---|
| 2.1 | Dashboard loads | Left transcript panel, right suggestion panel, queue rail visible |
| 2.2 | Toggle **Demo** ON (top bar) | Demo badge turns blue |
| 2.3 | IncomingCallModal appears | Shows masked phone, region, wait time |
| 2.4 | Click **Qabul qilish** | Modal closes, call timer starts, transcript begins |
| 2.5 | Watch transcript (~10 s) | Speaker bubbles appear (Operator / Mijoz) |
| 2.6 | Watch suggestion panel (~15 s) | AI suggestion card appears with bullets |
| 2.7 | Wait ~20 s | Intake card floats in with customer name/passport/region |
| 2.8 | Click **Tasdiqlash** on intake | Card disappears, customer name updates in top bar |
| 2.9 | Watch compliance bar (bottom) | Chips tick green as script progresses |
| 2.10 | Click **Yakunlash** (red, bottom-right) | Post-call summary modal appears |
| 2.11 | Click **Yangi qo'ng'iroq** | Returns to idle, IncomingCallModal reappears |
| 2.12 | Toggle Demo OFF | Badge changes |

---

## 3. Skip Call Flow

**Login:** `admin@bank.uz` / `changeme` → `http://localhost:5173/agent`

| # | Action | Expected result |
|---|---|---|
| 3.1 | Open customer URL in another tab → tap **Bog'lanish** | Queue entry created |
| 3.2 | Agent tab — IncomingCallModal appears | Shows customer info |
| 3.3 | Click **O'tkazib yuborish** | Skip form expands (reason dropdown + note) |
| 3.4 | Select reason, click **Tasdiqlash** | Modal closes, queue clears |
| 3.5 | Click **Bekor qilish** | Returns to accept/skip buttons without skipping |

---

## 4. Real Call — Agent + Customer

Open **two browser tabs simultaneously.**

**Tab A (Customer):** `http://localhost:5173/customer/e567ab95-de0a-4a37-a6aa-7fba9a1a5bd6/call`

**Tab B (Agent):** `http://localhost:5173/agent` — login as `admin@bank.uz` / `changeme`, Demo **OFF**

| # | Tab | Action | Expected result |
|---|---|---|---|
| 4.1 | A | Page loads | "Salom, Davron M.!" greeting, **Bog'lanish** button |
| 4.2 | A | Tap **Bog'lanish** | Status → "Operator qidirilmoqda…", wait timer starts |
| 4.3 | B | IncomingCallModal appears | Shows Davron's masked phone and region |
| 4.4 | B | Click **Qabul qilish** | Call timer starts on both tabs |
| 4.5 | A | Customer tab | Shows active call state |
| 4.6 | B | Speak into microphone | Transcript bubbles appear |
| 4.7 | B | Click **Yakunlash** | Post-call summary appears |
| 4.8 | A | Customer tab | Shows "Qo'ng'iroq yakunlandi" |

---

## 5. Queue Rail

**Login:** `admin@bank.uz` / `changeme` → `http://localhost:5173/agent`

| # | Action | Expected result |
|---|---|---|
| 5.1 | Open 2 customer tabs, both tap Bog'lanish | Queue rail shows 2 waiting entries |
| 5.2 | Click `›` collapse button | Queue rail hides |
| 5.3 | Click the re-open button | Queue rail reappears |

---

## 6. Supervisor Dashboard

**Login:** `supervisor@bank.uz` / `supervisor123` → `http://localhost:5173/supervisor`

| # | Action | Expected result |
|---|---|---|
| 6.1 | Page loads | "Nazorat paneli" header, active calls grid |
| 6.2 | Start a real call (step 4 above) | Call card appears in grid with name, duration, sentiment |
| 6.3 | Watch duration on card | Increments every second |
| 6.4 | Click a call card | Transcript drawer slides in from right |
| 6.5 | Check drawer header | Privacy notice: "Mijoz pasporti ma'lumotlari maxfiylashtirilgan" |
| 6.6 | Watch transcript in drawer | Bubbles appear as agent speaks |
| 6.7 | Press **Escape** or click backdrop | Drawer closes |
| 6.8 | Switch to **Tarix** tab | History table loads |
| 6.9 | Click outcome filter chips | Table filters correctly |
| 6.10 | Click sun/moon icon | Theme toggles light/dark |

---

## 7. Theme Toggle

Works on both `/agent` and `/supervisor`.

| # | Action | Expected result |
|---|---|---|
| 7.1 | Click moon icon | Dark theme applied instantly |
| 7.2 | Refresh page | Dark theme persists (saved to localStorage) |
| 7.3 | Click sun icon | Light theme restored |

---

## 8. WebRTC Fallback

| # | Action | Expected result |
|---|---|---|
| 8.1 | Start a real call (step 4) | WebRTC connects |
| 8.2 | DevTools → Network tab → block UDP | ICE connection fails |
| 8.3 | Wait ~5 s | Automatically falls back to REST fallback |
| 8.4 | Speak into mic | Transcript continues via REST chunks |

---

## 9. API Endpoint Smoke Tests

Open `ws_test.html` in browser: `file:///Users/<you>/Desktop/StartUp/BuildWithAi/ws_test.html`

| # | Tab | Action | Expected result |
|---|---|---|---|
| 9.1 | Auth | `GET /healthz` | `{"status":"ok"}` |
| 9.2 | Auth | Login `admin@bank.uz` / `changeme` → `GET /me` | `{"role":"admin"}` |
| 9.3 | Customer | Paste `e567ab95-de0a-4a37-a6aa-7fba9a1a5bd6` → GET | Returns display_name + customer_token |
| 9.4 | Queue | Refresh queue | Pending entries listed |
| 9.5 | Live Agent | Start WebRTC → send `start_call` | DC state = open, events stream |
| 9.6 | Supervisor | Connect WS | Events appear in log panel |
| 9.7 | Supervisor | `GET /active` | Returns active calls JSON |
| 9.8 | Supervisor | `GET /history` | Returns history array |
| 9.9 | Demo | List scenarios | 4 scenarios (0–3) listed |
| 9.10 | Demo | Play scenario `0` | `{"status":"playing"}` response |
| 9.11 | Admin Docs | Upload a PDF | Status = `ready` after ~2 s |

---

## Reporting Errors

When something fails, send:
1. **Browser console** errors (F12 → Console)
2. **Network tab** — failed request URL + response body
3. **Event log** from `ws_test.html` if using that tool
