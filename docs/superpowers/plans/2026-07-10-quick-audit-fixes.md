# Quick Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 of the "Important" findings from `docs/superpowers/specs/2026-07-09-crm-v2-implementation-audit.md` — the ones with one obvious correct fix and no design decisions attached (the other 3 Important findings — the Guidance Summary backfill, recovery codes, and the audit log — are handled separately: the first as a one-off data action, the other two as their own future design conversations).

**Architecture:** No architectural changes — five independent, surgical bug fixes across disjoint files, grouped into two tasks by area (UI vs. backend/security) so each task is still a meaningful review unit rather than five one-line diffs each needing their own gate.

**Tech Stack:** Next.js, TypeScript, existing `src/lib/logger.ts` (pino), `src/lib/ratelimit.ts` (Postgres-backed fixed-window limiter), existing CSS custom properties in `src/app/globals.css`.

## Global Constraints

- `tsc --noEmit` must be clean (CLAUDE.md rule 1) — run `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`.
- No indigo anywhere (design doc rule) — replace with existing tokens/classes already defined in `src/app/globals.css` (`--green-50`, `--green-600`, `.btn-primary`), never invent new ones.
- No automated test runner in this repo — verification is `tsc --noEmit` plus targeted checks, matching every prior increment.
- **Do NOT run `git commit`.** The user handles all commits themselves — leave every change uncommitted in the working tree.
- Do not touch the Guidance Summary backfill, recovery codes, or audit log — those are explicitly out of scope for this plan.

## File Structure

- Modify `src/app/(auth)/login/page.tsx` — fix the undefined `btn-primary-brand` class.
- Modify `src/components/Sidebar.tsx` — fix the active-nav exact-match bug.
- Modify `src/app/(auth)/setup-mfa/page.tsx`, `src/app/(auth)/verify-mfa/page.tsx` — remove indigo, replace with existing green/brand tokens.
- Modify `src/lib/errors.ts` — route the unhandled-error log line through `logger` (pino, with redaction) instead of raw `console.error`.
- Modify `src/lib/auth.ts` — add login rate limiting to the credentials `authorize()` callback.

---

### Task 1: UI fixes — login button, Sidebar active-nav, indigo removal

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(auth)/setup-mfa/page.tsx`
- Modify: `src/app/(auth)/verify-mfa/page.tsx`

- [ ] **Step 1: Fix the login page's undefined button class**

In `src/app/(auth)/login/page.tsx`, the Sign In button currently uses a class that is never defined anywhere in the codebase, so it renders with no background/text color. Change:

```tsx
            <button
              type="submit"
              disabled={loading}
              className="btn-primary-brand w-full font-semibold py-2.5 rounded-lg text-sm"
            >
```

to:

```tsx
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
```

(`.btn-primary` in `src/app/globals.css` already sets background, color, font-weight, padding, and border-radius — the old classes were duplicating/fighting with a class that didn't exist. `justify-center` keeps the label centered since `.btn-primary` is `display: inline-flex` but doesn't set `justify-content`.)

- [ ] **Step 2: Fix the Sidebar's active-nav exact-match bug**

In `src/components/Sidebar.tsx`, the department nav links only highlight on their exact overview URL, never on sub-pages (e.g. `/departments/product-research/findings`). Change:

```tsx
            const active = pathname === href
```

to:

```tsx
            const active = pathname.startsWith(href)
```

This is the identical pattern already used (and already reviewed/approved) in `src/components/departments/ProductResearchTabs.tsx` for its non-overview tabs — no department slug is a prefix of another, so this is safe across all six departments.

- [ ] **Step 3: Remove indigo from `setup-mfa/page.tsx`**

In `src/app/(auth)/setup-mfa/page.tsx`, make these four replacements:

Line ~64, icon wrapper background — change:
```tsx
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
```
to:
```tsx
          <div className="w-12 h-12 bg-[var(--green-50)] rounded-xl flex items-center justify-center mb-4">
```

Line ~65, icon color — change:
```tsx
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
```
to:
```tsx
            <ShieldCheck className="w-6 h-6 text-[var(--green-600)]" />
```

Line ~79 ("Get started" button) — change:
```tsx
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
```
to:
```tsx
            className="btn-primary w-full justify-center"
```

Line ~102, the 6-digit code input's focus ring — change:
```tsx
              className="w-full text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
```
to:
```tsx
              className="w-full text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
```

Line ~108 ("Verify" button) — change:
```tsx
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
```
to:
```tsx
              className="btn-primary w-full justify-center"
```

- [ ] **Step 4: Remove indigo from `verify-mfa/page.tsx`**

In `src/app/(auth)/verify-mfa/page.tsx`, make these four replacements:

Line ~45, icon wrapper background — change:
```tsx
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
```
to:
```tsx
            <div className="w-10 h-10 bg-[var(--green-50)] rounded-xl flex items-center justify-center">
```

Line ~46, icon color — change:
```tsx
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
```
to:
```tsx
              <ShieldCheck className="w-5 h-5 text-[var(--green-600)]" />
```

Line ~64, the 6-digit code input's focus ring — change:
```tsx
              className="w-full text-center text-2xl tracking-[0.5em] px-3.5 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
```
to:
```tsx
              className="w-full text-center text-2xl tracking-[0.5em] px-3.5 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]"
```

Line ~75 (submit button) — change:
```tsx
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
```
to:
```tsx
              className="btn-primary w-full justify-center"
```

- [ ] **Step 5: Grep to confirm no indigo remains**

Run: `grep -rn "indigo" src/`
Expected: no output (no matches anywhere in `src/`).

- [ ] **Step 6: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean).

- [ ] **Step 7: Do NOT commit**

Leave all changes in the working tree. The user commits everything themselves.

---

### Task 2: Backend fixes — error-log redaction bypass, login rate limiting

**Files:**
- Modify: `src/lib/errors.ts`
- Modify: `src/lib/auth.ts`

**Interfaces:**
- Consumes: `logger` from `src/lib/logger.ts` (pino instance, already configured with a `redact` list covering `*.password`, `*.passwordHash`, `*.apiKey`, `*.secret`, `*.mfaSecret`, etc. — see that file for the full list). Consumes: `rateLimit(opts)` from `src/lib/ratelimit.ts` (existing signature: `{ scope, actor, limit, windowMs }` → `{ allowed, remaining, retryAfterMs }`), already used identically by `src/app/api/mfa/verify/route.ts`.

- [ ] **Step 1: Route the unhandled-error log line through the redacting logger**

In `src/lib/errors.ts`, this line currently bypasses pino's secret redaction entirely (raw `console.error` on every unhandled route error — if a thrown SDK error object carries request/auth details, they'd hit stdout unredacted):

```ts
  console.error(`[api] ${context ?? 'unhandled'}:`, err)
```

Add the import at the top of the file:
```ts
import { logger } from './logger'
```

Then change the line to:
```ts
  logger.error({ err, context }, 'unhandled API error')
```

- [ ] **Step 2: Add login rate limiting to the credentials `authorize()` callback**

In `src/lib/auth.ts`, add the import:
```ts
import { rateLimit } from './ratelimit'
```

Then change the `authorize` function from:
```ts
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user) return null
```

to:
```ts
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const limit = await rateLimit({
          scope: 'auth.login',
          actor: credentials.email as string,
          limit: 5,
          windowMs: 15 * 60 * 1000,
        })
        if (!limit.allowed) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user) return null
```

(Rest of the function is unchanged. Returning `null` when rate-limited — same as a wrong password — is deliberate: NextAuth surfaces both as the same generic "Invalid email or password" to the client, so a rate-limited attempt never reveals to an attacker that they've been detected/throttled versus simply guessing wrong. This matches the existing `5 attempts / 15 min` window already used by `mfa/verify` for consistency.)

- [ ] **Step 3: Confirm it compiles**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit 2>&1 | grep -v "validator.ts"`
Expected: no output (clean).

- [ ] **Step 4: Live-verify the rate limit fires**

With the local dev server running (`PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run dev`), run 6 consecutive bad-password login attempts against a real local account and confirm the 6th is blocked before ever reaching the password check (i.e., it fails identically to a wrong password, but you can confirm via the `RateLimit` table that a `auth.login:<email>` row now exists with `count >= 5`):

```bash
for i in 1 2 3 4 5 6; do
  CSRF=$(curl -s -c /tmp/rl_cookies.txt http://localhost:3000/api/auth/csrf | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
  curl -s -b /tmp/rl_cookies.txt -c /tmp/rl_cookies.txt -o /dev/null -w "attempt $i: %{http_code} -> %{redirect_url}\n" -X POST http://localhost:3000/api/auth/callback/credentials \
    -d "email=admin@zimplixio.com" -d "password=wrong-password-$i" -d "csrfToken=$CSRF" -d "json=true"
done
rm -f /tmp/rl_cookies.txt
```

Expected: all 6 attempts return the same `302 -> .../login?error=CredentialsSignin` (rate-limiting is intentionally indistinguishable from a wrong password at the HTTP layer). Then confirm the DB row directly:

```bash
psql "$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')" -c "SELECT key, count, \"windowStart\" FROM \"RateLimit\" WHERE key = 'auth.login:admin@zimplixio.com';"
```

Expected: one row, `count = 5` (the limiter caps `count` at incrementing up to `limit`, so a 6th+ attempt within the window doesn't increment further — confirm `count` is `5`, not `6`, since `rateLimit()`'s own logic returns `allowed: false` without an additional increment once the row's count already reached `limit`).

Afterward, clean up the test row so it doesn't leave the real admin account rate-limited for the next 15 minutes:
```bash
psql "$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')" -c "DELETE FROM \"RateLimit\" WHERE key = 'auth.login:admin@zimplixio.com';"
```

- [ ] **Step 5: Do NOT commit**

Leave all changes in the working tree. The user commits everything themselves.
