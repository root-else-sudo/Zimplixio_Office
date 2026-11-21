# Gotchas — Zimplixio Office

Things that broke, or nearly broke, and what to do instead. Each entry has three parts: **what happened**, **why**, and **the rule**. `CLAUDE.md` carries a one-line version of each rule, because it's read automatically at the start of every Claude Code session. This file has the full story.

Grouped by area:

- [Build & runtime](#build--runtime)
- [Dependencies](#dependencies)
- [Deployment (Railway)](#deployment-railway)
- [AI & search APIs](#ai--search-apis)
- [Auth & sessions](#auth--sessions)
- [Styling (Tailwind v4 / CSS)](#styling-tailwind-v4--css)
- [React](#react)
- [Local development & testing](#local-development--testing)
- [Access control (guards, revocation, tests)](#access-control-guards-revocation-tests)

---

## Build & runtime

### 1. Never construct SDK clients at module level

- **What happened:** `next build` crashed. A module did `new Anthropic()` at import time.
- **Why:** `next build` evaluates modules without production env vars injected, so the constructor ran with no API key.
- **Rule:** wrap every SDK client (Anthropic, Twilio, Tavily, anything with a key) in a lazy getter that runs at request time. See `getAnthropic()` in `src/lib/ai-client.ts` and `getTavily()` in `src/lib/research/tavily.ts`.

### 2. Auth-gated or database-backed pages must force dynamic rendering

- **What happened:** the build crashed on `src/app/(dashboard)/page.tsx` and its layout.
- **Why:** during `next build`, `src/lib/env.ts` deliberately returns an empty env object, so the build needs no real secrets. Any page that Next.js tries to prerender statically, and that touches the database or `auth()`, then fails.
- **Rule:** add `export const dynamic = 'force-dynamic'` to every page, layout or route that calls `auth()` or Prisma.

### 3. `next dev` (Next.js 16.4+) writes an `AGENTS.md` file

- **What happened:** an untracked `AGENTS.md` appeared at the repo root. Nobody wrote it.
- **Why:** newer Next.js versions generate it on `next dev` (see `node_modules/next/dist/server/lib/generate-agent-files.js`). Deleting it just brings it back.
- **Rule:** commit it. It's harmless and keeps the working tree clean.

---

## Dependencies

### 4. Verify every dependency or security fix with a clean install and build

- **What happened:** `npm audit fix --force` once silently downgraded the `prisma` CLI to a major version that didn't match `@prisma/client`. `next dev` and a stale local Prisma client hid the problem completely. Only a clean install and build exposed it.
- **Related case, 2026-11-18:** even a plain `npm audit fix` moved the Prisma CLI to 7.10.1 but left `@prisma/client` and `@prisma/adapter-pg` on 7.8.0.
- **Rule:**
  - After any dependency change, run `rm -rf node_modules && npm ci && npm run build`, not just `tsc` or `next dev`.
  - Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on the **same** version.
  - Never run `npm audit fix --force` reflexively. Read what it proposes first.

### 5. `npm audit fix --force` can "fix" things by going backwards

- **What happened (2026-11-20):** a new advisory in `effect` was flagged. That package is pinned by the Prisma CLI's `@prisma/config` and is only used to read `prisma.config.ts`. The suggested `--force` fix was to install **Prisma 6**, a major downgrade.
- **Rule:**
  - When a fix means downgrading a major version, don't take it.
  - Check whether the vulnerable package is actually reached at runtime.
  - Wait for the upstream patch, or use an `overrides` entry, which also needs the full verification in #4.
  - This specific advisory is knowingly accepted until Prisma ships a 7.x patch.

---

## Deployment (Railway)

### 6. A shared `railway.toml` change must be checked on every service separately

- **What happened:** `[deploy] preDeployCommand = ["npx prisma migrate deploy"]` was added to `railway.toml`.
  - It worked for the web service (Railpack build).
  - It broke the `Worker` (Dockerfile build): its pre-deploy step couldn't see `DATABASE_URL`, even though the variable was set on that service. That's a Railway platform limitation.
  - A per-service dashboard override was then tried. It silently didn't take effect, because config-as-code kept winning.
- **Rule:**
  - Don't assume dashboard settings override `railway.toml`.
  - The fix was to remove the setting from `railway.toml` and set the pre-deploy command on the web service's dashboard only.
  - See `docs/RAILWAY.md`, "Database migration".

### 7. pg-boss `singleton` only blocks a second *active* job

- **What happened:** "Run now" could queue duplicate research runs while one was already running.
- **Why:** pg-boss's singleton policy's unique index is scoped to `state = 'active'`. A second *queued* job is allowed.
- **Rule:** the Run-now route also checks `getQueueSize(..., { before: 'completed' })` before enqueueing. That check is the real "already in progress" guard.

---

## AI & search APIs

### 8. Use Zod v4's native `z.toJSONSchema()` for Anthropic tool schemas

- **What happened:** Anthropic returned a 400 error: `input_schema.type: Field required`.
- **Why:** the third-party `zod-to-json-schema` (v3.x) reads Zod's internal `_def`, which changed shape in Zod v4. It silently returns `{}` instead of failing. Neither `tsc` nor local schema construction caught it.
- **Rule:**
  - Use `src/lib/ai/json-schema.ts`, which wraps `z.toJSONSchema()`.
  - Log a new tool's `input_schema` once (`console.log(TOOL.input_schema)`) before trusting it end to end.

### 9. Leave headroom on every length limit in Claude's structured output

- **What happened:** a tight `.max()` on a schema field failed validation and aborted a pipeline stage.
- **Why:** Claude writes longer, more natural phrasing than the target length in the field's description suggests. The Research Engine's contract is to abort, not retry, so a wrong limit wastes the whole run.
- **Rule:** give limits real slack over the target. For example, target 200 characters and cap at 300.

### 10. Tavily's `search()` and `extract()` use different `timeout` units

- **What happened:** every `extract()` call in the Research Probe failed silently.
- **Why:**
  - `search()` accepts milliseconds without complaint. `extract()` requires seconds (1–120).
  - The same millisecond constant was passed to both.
  - The error was caught by a deliberate "warn and continue" try/catch, so nothing showed up for the user.
- **Rule:**
  - Use separate, correctly named constants (`EXTRACT_TIMEOUT_SECONDS` vs `PER_CALL_TIMEOUT_MS` in `src/lib/research-probe/gather.ts`).
  - Test any new `extract()` call against a real URL.

### 11. Tavily `search()` returns excerpts, and some sources are unreachable

- **What happened:** search results looked "truncated", and review-site content (Google Maps reviews) never came back.
- **Why:**
  - `search()` content is an excerpt with its own `[...]` markers, capped at around 2,000–2,400 characters whatever cap the app sets.
  - `extract()` fetches the live page, but it can't run client-side JavaScript. Pages like Google Maps reviews render nothing useful.
- **Rule:**
  - A short `search()` result isn't a bug. Use `extract()` (see `src/lib/research-probe/deepen.ts`) when full page content matters.
  - Google reviews need a separate, paid integration (Places API). That's parked on purpose.

---

## Auth & sessions

### 12. Never trust the payload of `useSession().update()`

- **What happened (fixed 2026-11-19):** the JWT callback copied `mfaVerified` and `mfaEnabled` straight from the client's session update. A password alone, plus one request claiming `mfaVerified: true` (or `mfaEnabled: false`), got past MFA on both the page guard and the API guard.
- **Why:** any logged-in browser can call the session-update endpoint with any data.
- **Rule:**
  - On `trigger === 'update'`, `src/lib/auth.ts` re-reads `mfaEnabled` from the database.
  - It only sets `mfaVerified: true` when given a server-signed proof (`src/lib/mfa-proof.ts`): an HMAC bound to the user and that login's session id, valid for 2 minutes, issued only after Twilio approves a code.
  - Treat every future session field the same way.

### 13. Routes that skip the MFA gate need their own guard

- **What happened:** `/api/mfa/setup` uses `skipMfaCheck` so that first-time enrollment works. It didn't check whether MFA was *already* on, so a password-only session could enroll a new authenticator over the existing one.
- **Rule:** any `skipMfaCheck` route must ask "is this allowed for a password-only session?" itself. Setup now returns 403 when MFA is enabled and the session isn't verified.

### 14. An expired session cookie is simply deleted

- **What happened:** we wanted `/login` to say "your session ended", but there was no signal for it.
- **Why:** the browser deletes the NextAuth cookie at expiry, so an expired user looks exactly like a first-time visitor.
- **Rule:** a non-sensitive marker cookie (`zx_signed_in`) is set after login and cleared only by a deliberate sign-out (`src/lib/sign-out.ts`). The middleware reads it. Always sign out through `signOutDeliberately()`, never `signOut()` directly.

### 15. Validate every "return to" URL

- **Rule:** the `callbackUrl` carried through login and MFA must pass `safeCallbackUrl()` (`src/lib/auth-redirect.ts`). It allows same-site paths only: no `//host`, no `/\host`, no absolute URLs, and no loops back into the auth screens. Otherwise the login page becomes an open redirect.

---

## Styling (Tailwind v4 / CSS)

### 16. Never override Tailwind's own color scales with brand tokens

- **What happened:** registering the brand green as `--color-green-600` in `@theme` would have silently recolored every existing `text-green-600` in the app.
- **Rule:**
  - Brand greens are exposed as `forest-*`. Copper, navy and the others are `copper-*`, `navy-*`, etc.
  - Raw values live in `:root` in `src/app/globals.css`, and `@theme inline` maps them to classes.

### 17. Unlayered CSS beats Tailwind utilities, regardless of specificity

- **Why:** Tailwind v4 puts utilities in `@layer utilities`, and unlayered rules always win over layered ones. `globals.css` and `src/styles/auth.css` are deliberately unlayered, so they override the global `input:focus` rule cleanly.
- **Rule:** don't put a Tailwind utility and an unlayered class rule on the same element for the same property. The class rule will always win.

### 18. `animation-fill-mode: both` overrides later state styles

- **What happened:** the setup screen's QR code was meant to dim on success. It stayed bright.
- **Why:** the QR code's fade-in animation used `both`, so its final `opacity: 1` kept applying on top of the success rule. A finished animation that holds its end state beats normal declarations.
- **Rule:** for entrance animations on elements that later change state, use `backwards`.

### 19. Styling comes from the shared system, never per-page

- **Rule:**
  - Colors, shadows and timings are tokens in `globals.css`.
  - Repeated UI is a shared component.
  - Visuals and animations live in stylesheets (`src/styles/*.css`), and components only toggle `data-*` state.
  - No inline `style={{}}` and no hex in TSX. The only exception is per-instance random data passed as CSS custom properties, like each firefly's position.
  - Older dashboard pages predate this rule and still need migrating.

---

## React

### 20. Don't call `setState` synchronously inside `useEffect`

- **What happened:** the lint rule `react-hooks/set-state-in-effect` flagged code that read `matchMedia` or "am I on the client?" inside an effect and then set state.
- **Rule:** read browser state with `useSyncExternalStore`. See `useMediaQuery()` and `useIsClient()` in `src/lib/hooks/useMediaQuery.ts`.

### 21. Don't remount an element just to replay an animation

- **What happened:** giving the lamp button a changing `key` to replay its chain-tug animation dropped keyboard focus on every click.
- **Rule:** toggle a `data-*` attribute and clear it in `onAnimationEnd`.

---

## Local development & testing

### 22. The Node binary is native arm64 now

- **What happened:** the old `arch -x86_64` prefix fails with "Bad CPU type in executable".
- **Rule:** run commands normally: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npx tsc --noEmit`.

### 23. `NEXTAUTH_URL` decides where post-login redirects go

- **What happened:** a local test server on port 3124 kept redirecting to `localhost:3000` after login, and the request failed.
- **Rule:** run the dev server on the port that `NEXTAUTH_URL` names (3000 by default).

### 24. The login rate limit trips during repeated test runs

- **What happened:** automated login tests started failing on the 6th attempt.
- **Why:** that's the 5-attempts-per-15-minutes limit working as designed.
- **Rule:** in the **local** database only, clear the test account's rows: `delete from "RateLimit" where key like '%<test-email>%'`.

### 25. Headless Chromium doesn't simulate Caps Lock

- **Rule:** to test the Caps Lock warning, dispatch a `KeyboardEvent` with `modifierCapsLock: true`. A real key press is ignored in headless mode.

### 26. zsh doesn't split a `$variable` into separate words

- **What happened:** `git push origin --delete $branches` passed all 17 branch names as **one** argument and failed.
- **Rule:** pipe through `xargs`, for example `... | xargs git push origin --delete`.

### 27. Load `.env` with Node, not `source`

- **What happened:** `set -a; . ./.env` mangled a password with special characters, and Prisma failed to authenticate.
- **Rule:** use `npx tsx --env-file=.env script.ts`, which reads the file literally.

---

## Access control (guards, revocation, tests)

### 28. Proxy and guards must agree, or sign-in loops forever

- **What happened:** a page guard redirected a signed-out-but-cookied user to `/login`, while the proxy saw the (invalid) cookie and bounced them straight back. Result: an infinite redirect loop.
- **Why:** the proxy and the page/API guards make independent decisions (the proxy reads the token plus a DB check, `isSessionStillActive`; guards read the database through `getActiveSession`). Whenever any layer rejects a session it must send the user to `/api/session/end`, never straight to `/login`, or the layers can bounce the user between each other.
- **Rule:** any guard (or the proxy's session check) that rejects a session sends the user to `/api/session/end` (`SESSION_END_PATH`), never straight to `/login`. That route clears the cookie first, then redirects to `/login?reason=session-ended`, so the proxy and guards agree again. The route is deliberately not wrapped in `withAuth`, and is safe to hit while signed out.

### 29. Layouts and templates don't re-run for in-group soft navigation, so a layout-only guard is not a revocation boundary

- **What happened:** live check (2026-11-20): after `bump-session`, revoked staff navigating department to `/settings` was ended, but department to department, or Product/Research tab to tab, kept rendering pages until a hard load. API calls were still refused.
- **Why:** layouts persist across soft navigations, and templates only re-mount when their child segment changes, so neither re-runs the guard for navigations inside one route group.
- **Rule:** the fix was a DB-backed session check in the Node-runtime proxy (`isSessionStillActive`, `src/lib/proxy-session.ts`), which every page request passes through; invalid session or DB error goes to `/api/session/end`. Keep guards in both layout and template as defense in depth. After any change to guards or the proxy, test revocation with a real click, not `page.goto`.

### 30. The test suite refuses to run against a non-`_test` database

- **What happened:** nothing yet, by design. Tests create and delete users and companies, so running them against the dev database would destroy real rows.
- **Rule:** `test/setup/guard.ts` throws unless `DATABASE_URL_TEST` is set and names a database ending in `_test`. Create the database once and point `DATABASE_URL_TEST` at it; never weaken or bypass the guard.
