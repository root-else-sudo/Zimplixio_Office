# MFA API Gate + Account Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security-audit finding that MFA's authorization boundary doesn't reach the API layer, and give the owner a discoverable, self-service way to enable/disable two-factor authentication (Twilio Verify TOTP) — currently there is no UI entry point to either.

**Architecture:** Extend `withAuth()` (`src/lib/rbac.ts`) with a default-on MFA-verified check, explicitly exempted only for the two routes that are themselves part of the MFA bootstrap flow (`mfa/setup`, `mfa/verify`). Add a `disable` counterpart route that removes the Twilio factor and resets the user's MFA flags — this route is *not* exempted, so disabling MFA itself requires an already-MFA-verified session. Add a minimal `/settings` page (server-fetch + client component, matching every other page in this app) that surfaces current status and links to the existing `/setup-mfa` enrollment flow or triggers the new disable route. Add a Sidebar link so the page is reachable at all.

**Tech Stack:** Next.js App Router, NextAuth v5 (JWT sessions), Prisma, Twilio Verify v2 (TOTP factors), Zod, existing `withAuth`/`apiError`/`parseJson` helpers.

## Global Constraints

- `tsc --noEmit` must be clean at the end (CLAUDE.md rule 1) — run `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"` from the repo root.
- Any page/route touching `auth()`/Prisma needs `export const dynamic = 'force-dynamic'` (CLAUDE.md rule 7).
- No indigo anywhere (design doc rule) — reuse the existing `btn-primary` / `btn-destructive` / `btn-outline` / `soft-card` / `eyebrow` classes from `src/app/globals.css`, don't invent new ones.
- Server components fetch via Prisma and pass serialized props to `*Client.tsx`; client components never import Prisma directly (architecture pattern already used by every other page in `src/app/(dashboard)/departments/product-research/*`).
- This repo has no automated test runner configured (`package.json` has no `test` script, no vitest/jest anywhere) — every prior increment verified itself with `tsc --noEmit` plus targeted live HTTP/DB checks. This plan follows that same pattern instead of introducing a test framework mid-feature (that would be scope creep beyond what this fix needs).
- Local `.env` already has real `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` — Task 5's verification makes real (free) Twilio Verify API calls against the local dev database only, never against Railway/production.

## File Structure

- Modify `src/lib/rbac.ts` — add the MFA-verified gate + `skipMfaCheck` opt-out to `withAuth()`.
- Modify `src/app/api/mfa/setup/route.ts`, `src/app/api/mfa/verify/route.ts` — opt out of the new gate (they're how a session *becomes* verified in the first place).
- Modify `src/lib/twilio.ts` — add `deleteTotpFactor()`.
- Create `src/app/api/mfa/disable/route.ts` — removes the Twilio factor and resets `mfaEnabled`/`mfaSecret`.
- Create `src/app/(dashboard)/settings/page.tsx` + `src/app/(dashboard)/settings/SettingsClient.tsx` — status display, enable link, disable action with inline confirm.
- Modify `src/components/Sidebar.tsx` — add a "Settings" link so the page is reachable.

---

### Task 1: MFA-verified gate in `withAuth()`

**Files:**
- Modify: `src/lib/rbac.ts`
- Modify: `src/app/api/mfa/setup/route.ts`
- Modify: `src/app/api/mfa/verify/route.ts`

**Interfaces:**
- Produces: `WithAuthOptions.skipMfaCheck?: boolean` — later tasks (and the two modified routes) pass `{ skipMfaCheck: true }` to opt out.
- Consumes: `session.user.mfaEnabled: boolean`, `session.user.mfaVerified: boolean` — already typed on `Session['user']` in `src/types/next-auth.d.ts`, no type changes needed.

- [ ] **Step 1: Add the `skipMfaCheck` option and enforcement logic**

In `src/lib/rbac.ts`, change:

```ts
export interface WithAuthOptions {
  role?: Role
}
```

to:

```ts
export interface WithAuthOptions {
  role?: Role
  skipMfaCheck?: boolean
}
```

Then in `withAuth()`, insert the new check after the existing role check and before calling `handler`:

```ts
export function withAuth<P = Record<string, string>>(
  handler: AuthedHandler<P>,
  opts: WithAuthOptions = {}
): (req: NextRequest, ctx: RouteContext<P>) => Promise<Response> {
  return async (req, ctx) => {
    if (!sameOrigin(req)) return apiError('FORBIDDEN', 'Cross-origin request rejected')

    const session = await auth()
    if (!session?.user?.id) return apiError('UNAUTHORIZED')
    if (opts.role && !hasRole(session.user.role, opts.role)) {
      return apiError('FORBIDDEN')
    }
    if (!opts.skipMfaCheck && session.user.mfaEnabled && !session.user.mfaVerified) {
      return apiError('FORBIDDEN', 'MFA verification required')
    }
    return handler(req, ctx, session as AuthedSession)
  }
}
```

- [ ] **Step 2: Exempt the two MFA-bootstrap routes**

In `src/app/api/mfa/setup/route.ts`, change the closing of the `withAuth(...)` call from:

```ts
export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  // ...existing body...
})
```

to pass the new option:

```ts
export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  // ...existing body, unchanged...
}, { skipMfaCheck: true })
```

Do the exact same in `src/app/api/mfa/verify/route.ts` — add `, { skipMfaCheck: true }` as the second argument to its `withAuth(...)` call, body unchanged.

Every other route that calls `withAuth(...)` (`company-profile`, `guidance-summary`, `findings`, `findings/[id]`, `research/run`, `research/run/[jobId]`) is left untouched — they pick up the new default-on enforcement automatically.

- [ ] **Step 3: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/lib/rbac.ts src/app/api/mfa/setup/route.ts src/app/api/mfa/verify/route.ts
git commit -m "feat: enforce MFA verification at the API layer, not just pages"
```

---

### Task 2: Disable-MFA API route

**Files:**
- Modify: `src/lib/twilio.ts`
- Create: `src/app/api/mfa/disable/route.ts`

**Interfaces:**
- Produces: `deleteTotpFactor(userId: string, factorSid: string): Promise<void>` in `src/lib/twilio.ts`, and `POST /api/mfa/disable` (no request body).
- Consumes: `withAuth` from Task 1 (this route intentionally does **not** pass `skipMfaCheck` — reaching it at all already requires an MFA-verified session whenever `mfaEnabled` is true, which is exactly the property we want: only a fully-authenticated session can turn off its own second factor).

- [ ] **Step 1: Add `deleteTotpFactor` to `src/lib/twilio.ts`**

Add this function after `verifyTotpCode`:

```ts
export async function deleteTotpFactor(userId: string, factorSid: string) {
  await getClient().verify.v2
    .services(serverEnv.TWILIO_VERIFY_SERVICE_SID)
    .entities(userId)
    .factors(factorSid)
    .remove()
}
```

- [ ] **Step 2: Create the disable route**

Create `src/app/api/mfa/disable/route.ts`:

```ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteTotpFactor } from '@/lib/twilio'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'

export const POST = withAuth(async (_req, _ctx, session) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } })

    if (user?.mfaSecret) {
      await deleteTotpFactor(session.user.id, user.mfaSecret)
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { mfaEnabled: false, mfaSecret: null },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toApiError(err, 'mfa.disable')
  }
})
```

- [ ] **Step 3: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/lib/twilio.ts src/app/api/mfa/disable/route.ts
git commit -m "feat: add MFA disable route (removes Twilio factor, resets user flags)"
```

---

### Task 3: Account Settings page

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/app/(dashboard)/settings/SettingsClient.tsx`

**Interfaces:**
- Consumes: `POST /api/mfa/disable` from Task 2; existing `/setup-mfa` page (unchanged) as the enroll destination.
- Produces: `SettingsClient({ initialMfaEnabled: boolean })` — the prop name/shape later tasks (none) or future settings sections would extend.

- [ ] **Step 1: Server component — fetch current MFA status**

Create `src/app/(dashboard)/settings/page.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mfaEnabled: true },
  })

  return <SettingsClient initialMfaEnabled={user?.mfaEnabled ?? false} />
}
```

- [ ] **Step 2: Client component — status display, enable link, disable-with-confirm**

Create `src/app/(dashboard)/settings/SettingsClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function SettingsClient({ initialMfaEnabled }: { initialMfaEnabled: boolean }) {
  const { update } = useSession()
  const [mfaEnabled, setMfaEnabled] = useState(initialMfaEnabled)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDisable() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mfa/disable', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to disable two-factor authentication')
      }
      await update({ mfaEnabled: false, mfaVerified: false })
      setMfaEnabled(false)
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable two-factor authentication')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          Account
        </h1>
      </div>

      <div className="soft-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--gray-900)' }}>
            Two-factor authentication
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--gray-600)' }}>
            Adds a 6-digit code from an authenticator app to every sign-in, so a password alone can&apos;t access your account.
          </p>
        </div>

        <p className="text-sm font-medium" style={{ color: mfaEnabled ? 'var(--green-600)' : 'var(--gray-600)' }}>
          Status: {mfaEnabled ? 'Enabled' : 'Not enabled'}
        </p>

        {error && (
          <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
        )}

        {!mfaEnabled && (
          <Link href="/setup-mfa" className="btn-primary inline-block">
            Enable two-factor authentication
          </Link>
        )}

        {mfaEnabled && !confirming && (
          <button className="btn-destructive" onClick={() => setConfirming(true)}>
            Disable two-factor authentication
          </button>
        )}

        {mfaEnabled && confirming && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--gray-900)' }}>
              This removes two-factor authentication from your account. Continue?
            </p>
            <div className="flex gap-3">
              <button className="btn-destructive" onClick={handleDisable} disabled={loading}>
                {loading ? 'Disabling…' : 'Confirm disable'}
              </button>
              <button className="btn-outline" onClick={() => setConfirming(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/settings"
git commit -m "feat: add Account Settings page with MFA enable/disable"
```

---

### Task 4: Sidebar entry point

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Import the `Settings` icon and add a link**

In `src/components/Sidebar.tsx`, add `Settings` to the existing lucide-react import line:

```ts
import {
  LogOut, FlaskConical, Wrench, Megaphone, TrendingUp, DollarSign, Settings2, Settings,
  type LucideIcon,
} from 'lucide-react'
```

Then, in the bottom section, add a Settings link immediately before the existing "Sign Out" `<button>` (inside the same closing `<div className="px-3 pb-4" ...>` block, after the user-info `<div>` and before the sign-out button):

```tsx
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium transition-colors"
          style={{ color: pathname === '/settings' ? '#fff' : 'rgba(255,255,255,0.4)', background: pathname === '/settings' ? 'var(--navy-700)' : undefined }}
          onMouseEnter={e => { if (pathname !== '/settings') (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)' }}
          onMouseLeave={e => { if (pathname !== '/settings') (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)' }}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
```

- [ ] **Step 2: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Settings link to sidebar"
```

---

### Task 5: End-to-end verification against local dev, then cleanup

**Files:**
- Create (temporary, deleted at the end): `scratch-mfa-verify.ts` at repo root

This task proves the two risky/novel pieces live: (1) the new API-layer gate actually blocks a mutating route when `mfaEnabled=true && mfaVerified=false`, while still letting the two bootstrap routes through, and (2) `deleteTotpFactor` successfully removes a real Twilio factor. It runs entirely against the **local** dev DB and the real (free) Twilio Verify sandbox — never against Railway.

- [ ] **Step 1: Start the local dev server**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run dev` (background/separate terminal)
Expected: listening on `http://localhost:3000`.

- [ ] **Step 2: Write the verification script**

Create `scratch-mfa-verify.ts` at the repo root:

```ts
import 'dotenv/config'
import { prisma } from './src/lib/prisma'
import { deleteTotpFactor } from './src/lib/twilio'

const BASE = 'http://localhost:3000'
const EMAIL = 'admin@zimplixio.com'

async function login(password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const setCookie1 = csrfRes.headers.get('set-cookie') ?? ''
  const cookieJar = setCookie1.split(',').map((c) => c.split(';')[0]).join('; ')

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieJar },
    body: new URLSearchParams({ email: EMAIL, password, csrfToken, json: 'true' }),
  })
  const setCookie2 = loginRes.headers.get('set-cookie') ?? ''
  const sessionCookie = setCookie2.split(',').map((c) => c.split(';')[0]).join('; ')
  if (!sessionCookie.includes('authjs.session-token')) {
    throw new Error(`Login failed, status ${loginRes.status}`)
  }
  return `${cookieJar}; ${sessionCookie}`
}

async function main() {
  const password = process.env.LOCAL_ADMIN_PASSWORD
  if (!password) throw new Error('LOCAL_ADMIN_PASSWORD env var required (your local dev admin password)')

  const before = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })
  console.log('Before: mfaEnabled =', before.mfaEnabled, 'mfaSecret =', before.mfaSecret)

  // Simulate "MFA is enabled" without a real enrollment, to test the gate itself.
  await prisma.user.update({ where: { email: EMAIL }, data: { mfaEnabled: true } })

  const cookie = await login(password)
  console.log('Logged in with a fresh session (mfaVerified is always false on a brand-new JWT).')

  const blockedRes = await fetch(`${BASE}/api/company-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ content: 'should be blocked' }),
  })
  console.log('PATCH /api/company-profile with mfaEnabled=true, mfaVerified=false ->', blockedRes.status, await blockedRes.json())
  if (blockedRes.status !== 403) throw new Error('EXPECTED 403 — gate did not block an unverified session')

  const setupRes = await fetch(`${BASE}/api/mfa/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ action: 'create' }),
  })
  const setupData = await setupRes.json()
  console.log('POST /api/mfa/setup (create) with mfaEnabled=true, mfaVerified=false ->', setupRes.status)
  if (setupRes.status !== 200) throw new Error('EXPECTED 200 — skipMfaCheck exemption did not apply to mfa/setup')

  // Clean up: remove the real Twilio factor we just created, and restore original DB state.
  await deleteTotpFactor(before.id, setupData.factorSid)
  await prisma.user.update({
    where: { email: EMAIL },
    data: { mfaEnabled: before.mfaEnabled, mfaSecret: before.mfaSecret },
  })
  const after = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })
  console.log('After cleanup: mfaEnabled =', after.mfaEnabled, 'mfaSecret =', after.mfaSecret)
  console.log('ALL CHECKS PASSED')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 3: Run it**

Run: `LOCAL_ADMIN_PASSWORD='<your local dev admin password>' PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsx scratch-mfa-verify.ts`
Expected output ends with `ALL CHECKS PASSED`, and the two intermediate status checks show `403` then `200` as asserted in the script (it throws otherwise).

- [ ] **Step 4: Delete the verification script**

Run: `rm -f scratch-mfa-verify.ts`
(Nothing to commit — this file is never staged.)

- [ ] **Step 5: Full clean-build check (CLAUDE.md rule 8)**

Run: `rm -rf node_modules && PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm ci && PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run build`
Expected: build succeeds with no errors.

---

## After this plan lands

This plan builds the *capability* to enable/disable MFA and enforces it at the API layer — it does not itself turn MFA on for the production account. Once deployed to `development`/Railway, the owner needs to do the actual enrollment click-through themselves from `/settings` (scanning the QR with a real authenticator app is inherently something only they can do). After that, it's worth a final live confirmation against production: log in fresh, confirm `/verify-mfa` is required before reaching any page, and confirm a direct API call (e.g. `PATCH /api/company-profile`) is rejected with 403 until the code is verified.
