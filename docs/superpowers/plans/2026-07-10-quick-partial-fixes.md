# Quick Partial-Section Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 mechanical items from the "Partial" section of `docs/superpowers/specs/2026-07-09-crm-v2-implementation-audit.md` that have one obvious correct fix — the other 6 (Goals/Tasks CRUD, review-queue redesign, toast system, wider Gather sources, top bar, button variants) are real design decisions and are deferred to their own future conversations.

**Architecture:** Two independent, disjoint fixes. Task 1 is a pure CSS/token swap (no component changes). Task 2 extracts the existing Knowledge/KPI rendering out of `DepartmentAnatomy` into a small shared component, so the five reserved departments' seeded content (currently fetched from the DB but discarded before render) can be shown read-only without duplicating JSX or duplicating the department name/purpose header.

**Tech Stack:** Next.js Server Components, Tailwind + CSS custom properties (`src/app/globals.css`), Prisma.

## Global Constraints

- `tsc --noEmit` must be clean (CLAUDE.md rule 1) — run `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`.
- No automated test runner in this repo — verification is `tsc --noEmit` plus a live check in a browser or via curl, matching every prior increment.
- **Do NOT run `git commit`.** The user handles all commits themselves — leave every change uncommitted in the working tree.
- Do not touch Goals/Tasks CRUD, the review-queue redesign, the toast system, Gather's source breadth, the app-shell top bar, or button variants — all explicitly out of scope for this plan.

## File Structure

- Modify `src/app/globals.css` — add a `prefers-reduced-motion` override.
- Modify `src/app/(dashboard)/departments/product-research/company-profile/CompanyProfileClient.tsx`, `.../guidance-summary/GuidanceSummaryClient.tsx` — swap the "Saved." confirmation color from brand green to the semantic `--success` token.
- Create `src/components/departments/KnowledgeAndKpi.tsx` — the Knowledge/KPI sections, extracted so both `DepartmentAnatomy` and the reserved-department page can render them.
- Modify `src/components/departments/DepartmentAnatomy.tsx` — use the new shared component instead of its inline Knowledge/KPI JSX (no visual change for built departments).
- Modify `src/components/departments/ReservedState.tsx` — change from a full-page centered placeholder to a top-anchored card, since it now sits above other content instead of being the entire page.
- Modify `src/app/(dashboard)/departments/[key]/page.tsx` — render `ReservedState` + `KnowledgeAndKpi` together for reserved departments, instead of only `ReservedState`.

---

### Task 1: CSS-only fixes — semantic success token, reduced motion

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/(dashboard)/departments/product-research/company-profile/CompanyProfileClient.tsx`
- Modify: `src/app/(dashboard)/departments/product-research/guidance-summary/GuidanceSummaryClient.tsx`

- [ ] **Step 1: Use the semantic `--success` token for "Saved." confirmations**

The design doc reserves `--success` for transient system feedback, distinct from brand green — but both save confirmations currently use brand green instead. In `src/app/(dashboard)/departments/product-research/company-profile/CompanyProfileClient.tsx`, change:

```tsx
        <p className="text-sm" style={{ color: 'var(--green-600)' }}>Saved.</p>
```

to:

```tsx
        <p className="text-sm" style={{ color: 'var(--success)' }}>Saved.</p>
```

Make the identical change in `src/app/(dashboard)/departments/product-research/guidance-summary/GuidanceSummaryClient.tsx` (same line, same before/after text).

- [ ] **Step 2: Add a `prefers-reduced-motion` override**

At the end of `src/app/globals.css`, add:

```css

/* ── Reduced motion — accessibility carry-over from V1 ── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This is the standard, widely-used pattern for this override — it doesn't remove any animation/transition, it collapses their duration to effectively instant for users who've set the OS-level "reduce motion" preference, so `.soft-card-hover`'s lift-on-hover, button hover states, etc. all still function but don't animate.

- [ ] **Step 3: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean). (This step is CSS/JSX-only so a clean compile mainly confirms nothing else broke — there's no type surface here.)

- [ ] **Step 4: Do NOT commit**

Leave all changes in the working tree. The user commits everything themselves.

---

### Task 2: Show reserved departments' seeded Knowledge/KPI content

**Files:**
- Create: `src/components/departments/KnowledgeAndKpi.tsx`
- Modify: `src/components/departments/DepartmentAnatomy.tsx`
- Modify: `src/components/departments/ReservedState.tsx`
- Modify: `src/app/(dashboard)/departments/[key]/page.tsx`

**Interfaces:**
- Produces: `KnowledgeAndKpi({ knowledge: Knowledge[], kpis: Kpi[] })` — a component rendering exactly the two `<section>` blocks (Knowledge, KPIs) that currently live inline in `DepartmentAnatomy`. Both `DepartmentAnatomy` and `[key]/page.tsx` consume it.
- Consumes: `department.knowledge` and `department.kpis` — already fetched by `[key]/page.tsx`'s existing Prisma query (`include: { knowledge: {...}, kpis: {...} }`) for every department regardless of status; today that data is silently discarded for `RESERVED` departments. No query changes needed — this task only changes what gets rendered with data that's already being fetched.

- [ ] **Step 1: Extract the Knowledge/KPI sections into a shared component**

Create `src/components/departments/KnowledgeAndKpi.tsx`:

```tsx
import type { Knowledge, Kpi } from '@prisma/client'

export default function KnowledgeAndKpi({ knowledge, kpis }: { knowledge: Knowledge[]; kpis: Kpi[] }) {
  return (
    <>
      <section>
        <p className="eyebrow">Knowledge</p>
        <div className="soft-card px-6 py-6 space-y-3">
          {knowledge.map((entry) => (
            <p key={entry.id} className="text-sm leading-relaxed" style={{ color: 'var(--gray-900)' }}>
              {entry.content}
            </p>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">KPIs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.id} className="stat-chip">
              <p className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>{kpi.name}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 2: Use the shared component in `DepartmentAnatomy`**

In `src/components/departments/DepartmentAnatomy.tsx`, add the import:

```tsx
import KnowledgeAndKpi from './KnowledgeAndKpi'
```

Then replace the inline Knowledge and KPI `<section>` blocks (the last two sections in the file — everything from `<section>\n        <p className="eyebrow">Knowledge</p>` through the closing `</section>` of the KPIs block) with:

```tsx
      <KnowledgeAndKpi knowledge={department.knowledge} kpis={department.kpis} />
```

This is a pure refactor — the rendered output for already-BUILT departments (currently only Product/Research) must be visually identical to before. Do not change the Goals/Tasks sections or the header above them.

- [ ] **Step 3: Change `ReservedState` from a full-page placeholder to a top-anchored card**

`ReservedState` is currently designed to be the *entire* page content (full-height, vertically centered). It's about to be composed with other content below it, so it needs to become a normal card that sits at the top of a content column instead. In `src/components/departments/ReservedState.tsx`, change:

```tsx
export default function ReservedState({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="soft-card px-10 py-12 text-center max-w-md">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mb-4"
          style={{ background: 'var(--copper-500)' }}
        />
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          {name}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>
          Reserved — not yet built.
        </p>
      </div>
    </div>
  )
}
```

to:

```tsx
export default function ReservedState({ name }: { name: string }) {
  return (
    <div className="soft-card px-8 py-8 text-center">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full mb-4"
        style={{ background: 'var(--copper-500)' }}
      />
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
        {name}
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>
        Reserved — not yet built.
      </p>
    </div>
  )
}
```

(Same card content — copper dot, name, "Reserved — not yet built." — just no longer forcing full-viewport-height centering, since it's no longer the only thing on the page.)

- [ ] **Step 4: Render `ReservedState` + `KnowledgeAndKpi` together for reserved departments**

In `src/app/(dashboard)/departments/[key]/page.tsx`, add the import:

```tsx
import KnowledgeAndKpi from '@/components/departments/KnowledgeAndKpi'
```

Then change:

```tsx
  if (department.status === 'RESERVED') {
    return <ReservedState name={department.name} />
  }

  return <DepartmentAnatomy department={department} />
```

to:

```tsx
  if (department.status === 'RESERVED') {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        <ReservedState name={department.name} />
        <KnowledgeAndKpi knowledge={department.knowledge} kpis={department.kpis} />
      </div>
    )
  }

  return <DepartmentAnatomy department={department} />
```

- [ ] **Step 5: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean).

- [ ] **Step 6: Live-verify both the reserved-page change and the no-regression on the built department**

With the local dev server running (`PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run dev`), log in and fetch both a reserved department page and the one built department page, and confirm the seeded Knowledge/KPI text now appears on the reserved one and the built one is unchanged:

```bash
CSRF=$(curl -s -c /tmp/kb_cookies.txt http://localhost:3000/api/auth/csrf | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -b /tmp/kb_cookies.txt -c /tmp/kb_cookies.txt -o /dev/null -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "email=admin@zimplixio.com" -d "password=changeme123" -d "csrfToken=$CSRF" -d "json=true"

echo "--- reserved department (engineering) ---"
curl -s -b /tmp/kb_cookies.txt http://localhost:3000/departments/engineering -o /tmp/eng.html
grep -o "Reserved" /tmp/eng.html | head -1
grep -c "eyebrow\">Knowledge" /tmp/eng.html
grep -c "eyebrow\">KPIs" /tmp/eng.html

echo "--- built department (product-research) still renders Goals/Tasks/Knowledge/KPIs ---"
curl -s -b /tmp/kb_cookies.txt http://localhost:3000/departments/product-research -o /tmp/pr.html
grep -c "eyebrow\">Goals" /tmp/pr.html
grep -c "eyebrow\">Knowledge" /tmp/pr.html

rm -f /tmp/kb_cookies.txt /tmp/eng.html /tmp/pr.html
```

Expected: the "engineering" page shows `Reserved` plus one occurrence each of the Knowledge/KPIs eyebrow labels (confirming the seeded content now renders); the product-research page still shows one occurrence each of Goals and Knowledge eyebrow labels (confirming no regression on the built department). If the local admin password isn't `changeme123` anymore (it may have been changed in a prior session), use whatever the actual local dev password is.

- [ ] **Step 7: Do NOT commit**

Leave all changes in the working tree. The user commits everything themselves.
