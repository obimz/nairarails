# NairaRails — Frontend Design System

> Ground truth for the UI/UX rewrite. If you get lost mid-implementation, read this first.
> Every decision here has a reason. Don't deviate without updating this file.

---

## What We're Building

Two distinct surfaces that share one design language:

1. **Landing page** (`/`) — public marketing page. Goal: make a judge or developer understand what NairaRails does in 10 seconds and click "Get API Access."
2. **Dashboard** (`/dashboard/*`) — authenticated operator tool. Goal: let a merchant monitor payment status, spot exceptions, and take action without confusion.

These are not the same product. The landing page sells. The dashboard works.

---

## Design Token Decisions

### Color palette (from ui-ux-pro-max: fintech SaaS, dark mode OLED)

| Role | Token | Hex |
|---|---|---|
| Background (deepest) | `bg-[#020617]` | Near-black, OLED-efficient |
| Surface (cards, panels) | `bg-[#0F172A]` | Slate-900 |
| Surface raised | `bg-[#1E293B]` | Slate-800 |
| Border | `border-[#1E293B]` / `border-white/10` | Subtle, not invisible |
| Text primary | `text-[#F8FAFC]` | Slate-50 |
| Text muted | `text-[#94A3B8]` | Slate-400 |
| Brand / CTA / positive | `text-[#22C55E]` / `bg-[#22C55E]` | Green-500 |
| Brand glow | `shadow-[0_0_24px_#22C55E40]` | Soft green halo |
| Danger | `#EF4444` | Red-500 |
| Warning | `#F59E0B` | Amber-500 |
| Purple (overpayment) | `#A855F7` | Purple-500 |

**Rule:** No light backgrounds anywhere in the app. The landing page and dashboard are both dark. The onboarding form (`/signup`) is the only page that can use a dark-on-slightly-lighter-dark treatment — not white.

### Typography

- **Font:** Plus Jakarta Sans (Google Fonts)
- **Weights used:** 300 (fine print), 400 (body), 500 (labels), 600 (subheadings), 700 (headings)
- **Import in index.css:** `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700&display=swap');`
- **Mono (order refs, amounts, code):** `font-mono` (system mono stack is fine — no new import needed)

### Icons
- **Library:** Lucide React (`lucide-react`) — consistent, tree-shakeable, typed
- **Size standard:** `w-4 h-4` inline, `w-5 h-5` in buttons, `w-6 h-6` standalone
- **Rule:** Zero emojis as UI icons. The only emoji allowed is in empty-state copy if it reads naturally as text.

---

## Landing Page (`/`)

### Goal
Judges land here first. They need to understand the product, feel the quality, and click "Get API Access" — in that order.

### Structure (5 sections, single scroll)

```
1. Hero          — 3D network animation + headline + CTA
2. Problem       — The ₦35.56B stat + before/after
3. How it works  — 3-step flow with code snippet
4. Integration   — POST /api/v1/orders code block, tabbed (Node / cURL)
5. CTA footer    — Signup form repeated, minimal
```

### Hero section — the 3D scene

**Inspiration:** Razorpay Sprint 26 — fully animated, visually premium, no CPU choke.

**Why the current scene is slow (the actual problems):**
- `Html` from `@react-three/drei` renders a real DOM node per bank label, reconciled every frame — this is the CPU killer
- Background is light, killing the dark aesthetic
- Rotation speed is too fast and mechanical
- No bloom — flat geometry looks cheap

**How to be stunning AND fast (Razorpay's actual approach):**
- Pure WebGL geometry — zero DOM nodes inside the Canvas
- Labels baked as `CanvasTexture` on plane meshes — render once, display as texture
- `Bloom` post-processing via `@react-three/postprocessing` — this single effect is what makes fintech 3D look premium. The green glow on nodes and pulses.
- Ambient particle field — hundreds of tiny point-geometry dots slowly drifting, costs almost nothing on the GPU
- `ShaderMaterial` or emissive intensity on pulse spheres — bright enough to bloom
- `dpr={[1, 1.5]}` — correct, never 2+

**What we build:**
- Background: `#020617` (deepest black)
- 6 nodes: Wema, GTB, Access, UBA, Zenith, Nomba — glowing white-green spheres with `emissiveIntensity={2.5}` so Bloom picks them up
- Edges: thin lines, `color="#22C55E"` at `opacity={0.25}`
- Payment pulses: bright green spheres travelling along edges, `emissiveIntensity={4}` — these bloom hard and look like money moving
- Ambient particles: 300 tiny point sprites, slowly drifting — adds depth and "liveness"
- Rotation: `delta * 0.06` Y-axis — slow, hypnotic
- Labels: `CanvasTexture` on `PlaneGeometry` — rendered once at mount, displayed as a texture. Zero per-frame DOM cost.
- `EffectComposer` + `Bloom` from `@react-three/postprocessing`: `intensity={1.2}`, `luminanceThreshold={0.3}`, `luminanceSmoothing={0.9}`

**Fallback (prefers-reduced-motion OR width < 768px):**
- Static dark SVG showing the node network frozen — same visual shape, no animation, no Canvas
- Renders immediately with zero JS cost

**Text overlay (left side, z-index above canvas):**
```
NairaRails                          ← xs uppercase tracking-widest text-green-400
Payment rails built for             ← 4xl/5xl font-bold text-white
order-level certainty.
─────────────────────────────────   ← thin green divider, w-12
Every order. One account.           ← base text-slate-400
Every payment matched automatically.
Every split in the same second.
[Get API Access →]                  ← green CTA button
```

### Problem section

```
Dark card, centered:
"₦35,560,000,000"  ← animated counter, rolls up on scroll-enter (GSAP CountTo)
"Lost to reconciliation failures in Nigeria, 2023–2024"

Two columns:
LEFT  — "Without NairaRails"   red-tinted card
        • One shared account for all orders
        • Manual matching — hours per day
        • Batch settlements — next morning
        • Silent failures absorbed quietly

RIGHT — "With NairaRails"      green-tinted card
        • One account per order
        • Matched in milliseconds
        • Splits execute on payment
        • Every exception surfaced and actionable
```

GSAP ScrollTrigger: both cards fade+slide in from their respective sides when scrolled into view. `once: true` — no repeat.

### How it works section

3 steps, GSAP stagger reveal on scroll:

```
Step 1  [green number "01"]
        Order Created
        "Your checkout calls POST /api/v1/orders. NairaRails returns a NUBAN."
        [small code snippet: the POST call]

Step 2  [green number "02"]
        Buyer Pays
        "Buyer transfers to that account number. Nomba fires a webhook."
        [small code snippet: webhook event shape]

Step 3  [green number "03"]
        Auto-Settled
        "NairaRails classifies the payment and splits the money instantly."
        [small code snippet: the split result]
```

### Integration section

Tab bar: `Node.js` | `cURL`

Full `POST /api/v1/orders` code block with syntax highlight (use `highlight.js` or just styled `<pre>` — keep it minimal, no new heavy dep).

### CTA footer

```
"Ready to wire your marketplace?"
[input: marketplace name]  [input: email]
[Get API Access →]
```
Calls `POST /api/v1/merchants/signup` directly. On success navigates to `/signup` with state pre-filled.

---

## Dashboard (`/dashboard/*`)

### Layout

```
┌─────────────────────────────────────────────────────┐
│  SIDEBAR (fixed, 240px wide)                        │
│  ─────────────────────────────────────────────────  │
│  ₦  NairaRails          [merchant name]             │
│                                                     │
│  Overview                                           │
│  Orders                                             │
│  Exceptions          [badge: count]                 │
│                                                     │
│  ─ bottom ─                                         │
│  Settings                                           │
│  Sign out                                           │
└──────────────────┬──────────────────────────────────┘
                   │
         MAIN CONTENT AREA (fluid)
         p-8, max-w-6xl, bg-[#020617]
```

Current layout is a top nav bar. Switch to a left sidebar — it's the standard for operator dashboards (Linear, Stripe, Vercel all use it). Top nav works for marketing sites, not tools.

On mobile (`< 768px`): sidebar collapses to a bottom tab bar with icons only.

### Stat cards (Overview page)

Dark surface cards with a subtle green top border on hover:

```
bg-[#0F172A]  border border-white/10  rounded-xl  p-5
hover: border-green-500/40  transition-colors duration-200

Value: text-3xl font-bold text-white tabular-nums
Label: text-xs font-medium text-slate-400 uppercase tracking-wider
Sub:   text-xs text-slate-500
```

Positive values (paid, collection rate ≥ 90%): `text-green-400`
Warning values (pending, collection rate 50–89%): `text-amber-400`
Danger values (exceptions, underpayments, collection rate < 50%): `text-red-400`

### Chart (Overview page)

Replace the Recharts BarChart with an Area chart using Recharts `AreaChart`:
- Dark grid lines (`stroke="#1E293B"`)
- Green area fill with 20% opacity gradient
- Tooltip: dark surface (`bg-[#0F172A]`, `border-white/10`)
- No axis lines — just tick labels in `text-slate-500`

### Tables (Orders, Exceptions pages)

```
thead: bg-[#0F172A], th: text-xs uppercase tracking-wider text-slate-500
tbody tr: border-t border-white/5, hover:bg-white/[0.02]
td: text-sm text-slate-300

Order refs: font-mono text-slate-200
Amounts: font-mono text-white tabular-nums
```

Status badges — dark variant:
```
paid:         bg-green-500/15   text-green-400   border border-green-500/30
pending:      bg-amber-500/15   text-amber-400   border border-amber-500/30
underpayment: bg-red-500/15     text-red-400     border border-red-500/30
overpayment:  bg-purple-500/15  text-purple-400  border border-purple-500/30
unmatched:    bg-slate-500/15   text-slate-400   border border-slate-500/30
```

### Buttons

```
Primary (CTA):
  bg-green-500 hover:bg-green-400 text-black font-semibold
  px-4 py-2 rounded-lg text-sm transition-colors duration-150 cursor-pointer

Danger (refund):
  bg-red-500/15 hover:bg-red-500/25 text-red-400
  border border-red-500/30 px-3 py-1.5 rounded-lg text-xs

Ghost:
  bg-white/5 hover:bg-white/10 text-slate-300
  border border-white/10 px-4 py-2 rounded-lg text-sm
```

### Loading states

Skeleton shimmer using `animate-pulse` with `bg-white/5` blocks. Never show a spinning circle alone without context — always skeleton the shape of the content it replaces.

### Empty states

Centered in the content area, icon (Lucide) + message + optional action button. Dark surface card.

---

## Onboarding page (`/signup`)

Dark, centered, single card. Same color system as dashboard — not white.

```
bg-[#020617] full page
Card: bg-[#0F172A] border border-white/10 rounded-2xl p-8 max-w-lg w-full mx-auto
```

After key is issued: amber warning box on dark background (not white), copy button in green.

---

## Performance Rules (non-negotiable)

1. **`frameloop="demand"` on the Three.js Canvas** — stops the 60fps render loop when nothing is changing
2. **No `Html` component from `@react-three/drei` in the 3D scene** — it causes a DOM node per frame. Use a static HTML legend outside the Canvas instead.
3. **`dpr={[1, 1.5]}`** — caps pixel ratio. Never `dpr={2}` on a decorative scene.
4. **Three.js scene is `React.lazy()`** — not in the initial bundle
5. **GSAP animations only on elements in the viewport** — `ScrollTrigger` with `once: true`
6. **No animation in the dashboard** — the dashboard is a tool, not a show. Transitions only: `duration-150` color/border changes on hover. No entrance animations on data rows.
7. **`prefers-reduced-motion` check** — skip the 3D scene AND all GSAP animations if set. The static SVG fallback must be visually equivalent.

---

## Files to Touch

| File | Change |
|---|---|
| `apps/web/src/index.css` | New color system, Plus Jakarta Sans, dark base styles |
| `apps/web/src/main.tsx` | Switch to sidebar layout, add Settings route stub |
| `apps/web/src/components/HeroNetworkScene.tsx` | `frameloop="demand"`, remove Html labels, slow rotation, dark bg |
| `apps/web/src/pages/LandingPage.tsx` | Full rewrite: dark, 5 sections, GSAP scroll, static legend |
| `apps/web/src/pages/OnboardingPage.tsx` | Dark color system, same structure |
| `apps/web/src/pages/OverviewPage.tsx` | Dark stat cards, AreaChart, dark tooltip |
| `apps/web/src/pages/OrdersPage.tsx` | Dark table, dark badges |
| `apps/web/src/pages/ExceptionsPage.tsx` | Dark table, dark badges, dark buttons |
| `apps/web/src/components/StatusBadge.tsx` | Dark badge variants |

**Do NOT touch:** `apiFetch.ts`, `queryClient.ts`, `money.ts`, `hooks/index.ts`, all backend files.

---

## Install needed

```bash
pnpm --filter @nairarails/web add lucide-react @react-three/postprocessing
```

`lucide-react` for icons. `@react-three/postprocessing` for the Bloom effect. Everything else (`gsap`, `@react-three/fiber`, `@react-three/drei`, `recharts`, `three`) is already installed.

---

## Implementation Order

1. `index.css` — font + color tokens first. Everything else depends on these being right.
2. `HeroNetworkScene.tsx` — fix the performance issues (frameloop, remove Html, dark bg)
3. `LandingPage.tsx` — full rewrite using the fixed scene + GSAP sections
4. `main.tsx` — sidebar layout
5. Dashboard pages — `OverviewPage`, `OrdersPage`, `ExceptionsPage`, `StatusBadge`, `OnboardingPage`

---

## What "Done" Looks Like

- Landing page: dark, loads fast, 3D scene runs without CPU spike, GSAP scroll animations fire, CTA navigates to `/signup`
- Dashboard: dark sidebar layout, stat cards with correct color semantics, area chart, dark tables with dark badges
- Zero emojis as icons anywhere
- `prefers-reduced-motion` respected — static fallback renders correctly
- No `console.error` in the browser on any page
- Responsive at 375px (mobile), 768px (tablet), 1440px (desktop)
