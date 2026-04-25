# Frontend Design Prompt — SQB Bank AI Sales Copilot

## Project Context
Design a **Figma-style component & screen mockup set** (not code — pure visual design deliverables: frames, components, color tokens, typography scale) for a **real-time AI sales copilot** built for **SQB Bank (sqb.uz)**, a major Uzbek bank. The product listens to live agent–customer phone calls, transcribes Uzbek/Russian speech, and surfaces AI-generated Uzbek-language objection-handling suggestions to the agent within 1.5 seconds.

This is an **on-premise hackathon MVP**. Demo flow: a customer clicks a big call button → connects to a bank agent → agent sees live transcript + AI suggestions + compliance checklist + sentiment badge → call ends with auto-generated summary.

## Design System Requirements

### Visual Direction
- **Style:** Modern fintech — clean, confident, slightly futuristic. Reference SQB Bank's existing site (https://sqb.uz/uz/individuals/) for trust and corporate weight, but elevate it with the **AI-overlay aesthetic of Cluely (cluely.com)** — translucent surfaces, soft glow on AI-generated content, real-time streaming indicators, subtle motion cues (pulsing dots when AI is "thinking", typing-stream animation on suggestion cards).
- **Brand:** SQB Bank — use the SQB logo prominently in nav/login. Primary palette anchored on **SQB blue** (deep, trustworthy banking blue, slightly more saturated than the website's blue to feel modern). Use blue-dominant tokens with white space breathing room.
- **Themes:** Deliver **both Light and Dark** themes as parallel design variants for every screen and component. Dark theme is not just inverted — it should feel like an "AI cockpit" (deep navy/near-black surfaces, glowing blue accents, soft luminance on AI cards). Light theme is "clean banking dashboard" (white surfaces, blue accents, soft gray dividers).
- **Typography:** Modern geometric sans (Inter, Geist, or similar). Monospace (JetBrains Mono / Geist Mono) for live transcript text only — to convey real-time-stream feel.
- **Iconography:** Lucide or Phosphor — thin stroke, consistent weight.
- **All UI copy in Uzbek (Latin script).** No English labels except technical placeholders. Use natural banking Uzbek (e.g. "Mijoz", "Operator", "Qo'ng'iroq", "Tavsiya", "Yakuniy hisobot").

### Design Tokens to Define
- Color: primary (SQB blue), primary-hover, accent-glow (AI moments), success (sentiment 🟢), warning (🟡), danger (🔴), surface-1/2/3, border, text-primary/secondary/muted — for both themes.
- Spacing scale (4 / 8 / 12 / 16 / 24 / 32 / 48).
- Radius scale (sm / md / lg / xl / full).
- Elevation: card, floating, modal — with optional blue-tinted glow variant for AI-active state.
- Motion tokens: stream-pulse (1.2s ease-in-out), suggestion-arrive (300ms spring).

## Screens to Design (each in Light + Dark)

### 1. Login Screen (`/login`)
- Centered card on a subtle blue gradient backdrop.
- Large SQB logo at top, tagline in Uzbek ("Sun'iy intellekt yordamida yangi avlod sotuv yordamchisi").
- Email + password fields, role-agnostic single login.
- "Kirish" CTA button. Subtle "on-prem secure" trust badge.

### 2. Customer Call Page (`/call`) — MVP demo entry
- **Hero centerpiece:** a massive circular call button (200–240 px), pulsing soft blue glow, microphone or phone icon inside. Conveys "tap to talk to bank agent."
- Above button: warm Uzbek greeting ("SQB bankka xush kelibsiz. Operator bilan bog'lanish uchun bosing.")
- Below button: small live status text ("Operator kutilmoqda…" → "Operator ulandi" with green dot).
- Minimal chrome — like a focused product moment. SQB logo top-left only.
- During call state: button transforms into a live waveform/voice-activity visualizer, with a red "Qo'ng'iroqni yakunlash" button below.

### 3. Agent Dashboard (`/agent`) — the core product surface
Layout: 3-zone — top bar, main 2-column body, bottom compliance bar.
- **Top bar:** SQB logo • CallTimer (large mono, e.g. `02:14`) • Sentiment badge (animated pill: 🟢 "Ijobiy" / 🟡 "Neytral" / 🔴 "Salbiy") • Demo Mode toggle • agent avatar.
- **Left panel (~55% width):** Live Transcript. Scrolling chat-style with two speakers — `Operator` (right-aligned, blue) and `Mijoz` (left-aligned, neutral). New chunks fade-in. Monospace text. Auto-scroll with "pause on scroll up" hint.
- **Right panel (~45% width):** AI Suggestion Cards stack. Each card: small "AI Tavsiya" label with pulsing dot, trigger phrase quote ("«qimmat»"), 1–3 Uzbek bullet suggestions, per-bullet Copy icon button. Newest card animates in from the top with soft blue glow that fades over 2s. Empty state: "AI tinglamoqda…" with subtle equalizer animation.
- **Floating Intake Confirmation Card** (appears ~10–15s into call, hovers above transcript): auto-extracted `Ism`, `Pasport`, `Hudud` with Confirm / Edit. Glass surface, blue-glow border to mark it as AI-generated.
- **Bottom bar:** Compliance Checklist as horizontal chips — each chip has icon (✅ / ⬜ / ❌) + Uzbek phrase label. Ticked chips animate green; missed chips at end-of-call flash red.
- **Post-Call Summary modal:** appears on End Call. Sections: `Natija`, `Asosiy e'tirozlar`, `Compliance holati`, `Keyingi qadam`. Clean typographic hierarchy, copy-to-clipboard per section.

### 4. Supervisor Dashboard (`/supervisor`)
- Header: "Faol qo'ng'iroqlar" + count badge.
- Grid of live call cards (3–4 columns): agent avatar + name, call duration timer, sentiment badge, top-objection tag pill, mini live waveform.
- Click a card → side drawer slides in from right with read-only live transcript and compliance state. **No passport field visible** (privacy by design — make this absence visually deliberate, e.g. a locked-icon placeholder labeled "Maxfiy ma'lumot").

## Components Library (define as reusable Figma components)
- Button (primary / secondary / ghost / danger, with sizes sm/md/lg)
- Input field (with label, error, helper text states)
- Card (default, AI-glow variant, glass variant)
- Badge / Chip (sentiment, compliance, role)
- SuggestionCard (the signature AI component — design at least 3 variants: empty/listening, streaming-in, settled)
- TranscriptBubble (Operator vs Mijoz)
- ComplianceChip (✅ / ⬜ / ❌ states)
- IntakeConfirmCard (floating glass card)
- Modal / Drawer
- Avatar, Logo lockup
- Live indicator dot (pulsing) — used wherever real-time data flows
- CallButton (the hero element from the customer page) at multiple sizes

## Deliverables
1. **Design token sheet** (color/typography/spacing/radius/motion) — Light + Dark variants side by side.
2. **Component sheet** — every component above, all states, both themes.
3. **Screen frames** — 4 screens × 2 themes = 8 high-fidelity mockups.
4. **One "AI moment" hero shot** — the Agent Dashboard mid-call with a suggestion arriving, intake card floating, sentiment shifting — meant for hackathon pitch deck.
5. **Empty / loading / error states** for: login, agent (no active call), supervisor (no active calls), customer (operator unavailable).

## Non-Goals
- No code output. No Tailwind classes. No React. Pure visual design language and Figma-ready component thinking.
- No marketing site / landing page.
- No mobile-specific design (desktop-first; tablet-acceptable responsive hints only).

## Tone
Confident, calm, AI-native. The design should make a bank agent feel **augmented, not surveilled** — and make a hackathon judge feel "this is shippable."
