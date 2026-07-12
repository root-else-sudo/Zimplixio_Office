# Zimplixio CRM v2 — Design System & Visual Direction

| Field | Value |
|---|---|
| **Document Type** | Design Specification (tokens + component rules) |
| **Companion To** | Zimplixio CRM v2 — Planning (2026-07-03) |
| **Version** | 1.0 (draft) |
| **Date Issued** | 2026-07-03 |
| **Owner** | Joe Ugalde |
| **Consumer** | Claude Code (implementation) |
| **Status** | Draft for owner review |

---

## Implementation Status (as of 2026-07-12)

This document is the original design spec — kept as-is below. Status of what it describes:

- **Confirmed built and matching spec:** all color tokens (hex-exact, live), typography, spacing/radii, the sidebar as the org-chart nav with built-vs-reserved distinction, reserved departments' Reserved State screen (now also showing their seeded Knowledge/KPI content read-only, added 2026-07-10 — §5.5), Findings pill colors for validated/rejected (§5.2), and `prefers-reduced-motion` (§6 — added 2026-07-10, was previously unreferenced anywhere in the codebase). The "no indigo anywhere" rule (§1.2) is now fully enforced — the two MFA auth pages that violated it were fixed 2026-07-10. Semantic `success`/`warning`/`error` tokens (§1.2) are now actually used for "Saved." confirmations, not just defined and unused.
- **Still open, not yet built:** the ghost/tertiary button variant (§5.1); a distinct top-bar shell element (§4.3 — each page currently renders its own inline header instead); the review-queue candidate row's status pill and source/evidence count (§5.3 — `Finding.evidence` is a single free-text string today, not a countable list, so this touches the data model, not just styling); a toast/snackbar system (§5.6). All four are real design decisions, deferred to their own future conversations rather than bundled into a quick fix. Full detail in `docs/superpowers/specs/2026-07-09-crm-v2-implementation-audit.md`.

---

## 0. What This Document Is

The visual guardrails for Zimplixio CRM v2 — a companion to the planning doc. It defines **tokens** (color, type, spacing, radii) and **component rules** (the app shell and CRM-specific states) so Claude Code builds the look without assumptions.

It is **not** a pixel-perfect mockup. Token-level precision is the goal; visual fine-tuning (exact hover feels, density) happens later against the running app. Basic → complex, applied to design.

**Relationship to the marketing brand.** Zimplixio's production marketing site uses an indigo/navy identity (see the marketing Brand Style Guide). The CRM is a **separate internal surface** and deliberately diverges from it on one axis: **color.** It keeps the marketing brand's *typography, spacing, and radii* (they are sound and Tailwind-native) but replaces the indigo brand hue with an identity derived from **Zimplixio's own logo** — forest green and copper — on a dark navy shell.

**Guiding intent:** premium, calm, eye-friendly for all-day use, and *not generic*. Indigo is explicitly avoided because it is the default "shipped with Tailwind" color and would make the CRM read templated from the first pixel.

---

## 1. Color

### 1.1 The System, in One Line

**Navy shell → soft off-white canvas → white cards on top, with forest-green as the primary/interactive color and copper as the secondary accent.**

- **Navy** = the app frame (sidebar, top bar). Premium, upscale, focused.
- **Off-white canvas** = the working area. Layered, not flat.
- **White** = cards and panels that sit on the canvas.
- **Forest green** = primary action / interactive (active nav, primary buttons, focus rings, links).
- **Copper** = secondary accent (highlights, small marks, reserved-seat indicators, editorial touches).
- **Gray** = text and borders on the light canvas.

### 1.2 Tokens

Values are starting points; adjust against the running app. **No indigo anywhere in the CRM.**

**Brand — from the Zimplixio logo**

| Token | Hex | Use |
|---|---|---|
| `green-600` (primary) | `#2E7D32` | primary buttons, active nav item, focus rings, links, "validated" |
| `green-700` (primary-hover) | `#276A2B` | hover/pressed state of primary |
| `green-50` (primary-tint) | `#EAF3EA` | subtle green backgrounds (selected rows, validated pills) |
| `copper-500` (accent) | `#C68A4E` | secondary highlights, reserved-seat marks, small accents |
| `copper-100` (accent-tint) | `#F3E7D8` | copper pill/badge backgrounds |
| `charcoal-800` (ink) | `#1F2A33` | logo ink; strongest text on light |

**Navy — app shell & dark surfaces** *(carried from the marketing guide's navy scale)*

| Token | Hex | Use |
|---|---|---|
| `navy-800` | `#0F2044` | sidebar / top-bar background |
| `navy-700` | `#162D4A` | raised elements inside the shell (active-nav backing) |
| `navy-600` | `#1E3A5F` | borders/hover inside the shell |
| navy text-muted | `#9FB0C3` | inactive nav labels, secondary text on navy |

**Canvas & surfaces (light, layered)**

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F7F8FA` | main content background (soft off-white — **not pure white**) |
| `surface` | `#FFFFFF` | cards, panels, tables, modals sitting on the canvas |
| `border` | `#E5E8EC` | hairline borders/dividers on light |

**Neutrals — gray text scale (on light)**

| Token | Hex | Use |
|---|---|---|
| `gray-900` | `#111827` | primary text |
| `gray-600` | `#4B5563` | secondary text |
| `gray-400` | `#9CA3AF` | placeholder / disabled |

**Semantic** *(carried from the marketing guide)*

| Token | Hex | Use |
|---|---|---|
| success | `#22C55E` | success toasts/confirmations |
| warning | `#F59E0B` | warnings, attention needed |
| error | `#EF4444` | errors, destructive confirmation |

> Note: "validated" Findings use the **brand green** (`green-600`), not the semantic success green — the brand color carries the primary positive meaning in this app. Semantic success is reserved for transient system feedback (toasts), keeping brand and system signals distinct.

---

## 2. Typography

Kept from the marketing brand guide — sound and unchanged.

- **Headings:** Poppins. H1 800 · H2 700 · H3 600 · H4 600 · H5 500.
- **Body:** DM Sans 400. Body Large 17px/1.7 · Body 15px/1.65 · Body Small 13px/1.55.
- **Eyebrow/label:** uppercase, tracked, small — but on the light canvas use `gray-600` or `green-600`, **never indigo**.

For a data-dense internal tool, default working text is **Body (15px)**; tables and metadata may use **Body Small (13px)**. Reserve large heading weights for page titles, not table content.

---

## 3. Spacing & Radii

Kept from the marketing brand guide (Tailwind base-4).

- **Spacing scale:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 px.
- **Radii:** `sm` 4 · `md` 8 · `lg` 12 · `xl` 16 (cards) · `2xl` 20 · `full` (pills/badges).
- CRM default: cards `xl` (16px); pills/badges `full`; inputs/buttons `md`–`lg`.

---

## 4. The App Shell

### 4.1 Layout

A persistent **left sidebar** (dark navy) + a light content area. The sidebar is the primary navigation and *is* the org chart — it reinforces "this is a company, and these are its departments."

```
+-------------+------------------------------------------+
|             |  top bar (navy or light — see 4.3)        |
|   SIDEBAR   +------------------------------------------+
|   (navy)    |                                          |
|             |   CONTENT CANVAS (soft off-white)         |
|  Zimplixio  |                                          |
|  ---------  |   +----------------------------------+   |
|  Product/R  |   |  card / panel (white surface)    |   |
|  Engineering|   +----------------------------------+   |
|  Marketing  |                                          |
|  Sales      |                                          |
|  Finance    |                                          |
|  Operations |                                          |
+-------------+------------------------------------------+
```

### 4.2 Sidebar — Department Nav

- Background `navy-800`. Logo/wordmark slot at top (placeholder acceptable for now — see §7).
- Six departments listed as nav items, in charter order: Product/Research, Engineering, Marketing, Sales, Finance, Operations.
- **Active item:** `navy-700` backing with a `green-600` left-edge indicator and green/white label. Green is the "you are here" signal.
- **Hover (inactive):** subtle `navy-600` backing; label brightens from `navy text-muted` to white.
- **Built vs. reserved seats:**
  - **Built** (Product/Research): full-strength label, normal interaction.
  - **Reserved** (the other five): **visible and clickable** — not greyed out or disabled. Slightly muted label plus a small **copper** dot/marker indicating "reserved." Clicking navigates to a clean **Reserved State** screen (see §5.5). This makes the whole org chart real and navigable from day one.

### 4.3 Top Bar

- Keep it light (on the canvas) with the page title in Poppins + gray-900, and contextual actions (e.g. "Run now", "New") right-aligned. A light top bar maximizes the premium navy-frame-around-bright-workspace contrast. (A navy top bar is acceptable if a continuous dark frame is preferred — decide when seen.)

---

## 5. CRM Components (what the marketing guide lacks)

The marketing guide covers marketing primitives (hero CTAs, case-study cards). The CRM needs app-shell, data-dense patterns. Tokens and states below; not full designs.

### 5.1 Buttons

- **Primary:** `green-600` bg, white text, radius `lg`; hover `green-700`. Used for the main action per screen (Save, Run now, Approve).
- **Secondary:** white bg, `border`, gray-900 text; hover light gray fill.
- **Ghost/tertiary:** text-only, gray-600; hover gray-900.
- **Destructive:** error red, reserved for reject/delete confirmations.

### 5.2 Status Pills (Findings lifecycle)

Map directly to the two-state Findings model (planning §2.2):

| State | Treatment |
|---|---|
| **candidate** | `copper-100` bg, `copper-500` text — "awaiting review," warm/neutral. |
| **validated** | `green-50` bg, `green-600` text — the positive brand signal. |
| **rejected** | light gray bg, gray-600 text — muted, de-emphasized. |

Pills are `full` radius, Body Small, uppercase-optional.

### 5.3 Data Tables & Review-Queue Rows

- White `surface` on the canvas; hairline `border` row dividers; generous row height for scannability (data-dense but not cramped — use 12–16px vertical padding).
- Row hover: faint `green-50` tint to signal interactivity.
- Review queue rows show: title, status pill, source/evidence count, and inline **Validate / Reject** actions (green primary / muted destructive). Reject requires the written reason (planning §2.3).

### 5.4 Forms & Inputs

- White inputs, `border`, radius `md`; focus ring in `green-600`. Labels gray-900, Body; placeholders gray-400.
- Company Profile editor is a calm, document-like freeform text surface (planning §2.1) — white panel, comfortable line length, Body Large for readability.

### 5.5 Empty & Reserved States

- **Reserved department state** (clicking a reserved seat): a clean, centered panel — department name, a one-line "Reserved — not yet built" message, and a muted copper accent. Communicates "seat reserved, coming later," never a broken/dead end.
- **Empty data state** (e.g. no Findings yet): brief guidance + the primary action (e.g. "Run the Research Engine to surface candidates"), not a blank screen.

### 5.6 Toasts & Feedback

- Transient system feedback uses **semantic** colors (success/warning/error), keeping them distinct from the brand green that carries workflow meaning.

---

## 6. Motion — Restraint for an Internal Tool

This is a tool used all day, not a landing page. **Do not carry over the marketing site's showpiece motion** (14s animated hero gradients, word-reveal, particle effects, AOS scroll animations).

- Keep only **functional** motion: quick state transitions, hover feedback, subtle row/card hover (~150–200ms), toast slide-in.
- No decorative background animation anywhere in the CRM.
- Respect `prefers-reduced-motion` (carried from the marketing guide's accessibility rule).
- Principle: **calm and fast beats spectacle.** Motion should confirm an action, never perform.

---

## 7. Logo Assets — Deferred Polish (not a blocker)

The current Zimplixio wordmark and turbine icon establish the **palette** (forest green, copper, charcoal) and that is all the CRM build needs now, plus a logo slot in the sidebar. The existing raster assets are soft/AI-generated; **crisp vector (SVG) versions** are wanted eventually for sharp rendering at all sizes, but that is a **background polish task done any time before launch** — it does not gate the build. Use a placeholder or the current asset in the sidebar slot for now.

---

## 8. Summary — The Locked Decisions

- **Navy shell, soft off-white canvas, white cards.** Not pure white — layered light for all-day eye comfort.
- **Forest green = primary/interactive. Copper = secondary accent. No indigo, anywhere.**
- **Kept from the marketing guide:** Poppins/DM Sans type, base-4 spacing, radii, semantic colors.
- **Sidebar is the org chart:** six departments, built (Product/Research) vs. reserved seats that are **visible and clickable** into a Reserved State.
- **Findings states** map to pills: candidate (copper), validated (green), rejected (muted).
- **Restraint on motion:** functional only; no marketing-site animation.
- **Logo vector cleanup** is deferred and off the critical path.
