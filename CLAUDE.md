# Zimplixio Office — Operating Instructions

## What This Is
A Next.js dashboard that serves as the control center for Zimplixio's marketing operations. It:
- Triggers and monitors the email → LinkedIn posts pipeline
- Displays, reviews, and approves/rejects generated post drafts
- Shows pipeline run history and agent status with a live flow visualization
- Surfaces AI-generated business opportunities (Tavily + Claude)
- Delivers notifications via WhatsApp (Twilio) and browser push

## How It Connects to Zimplixio_Marketing
The dashboard calls Python scripts that live in the `Zimplixio_Marketing` project. The connection is configured via the `MARKETING_DIR` environment variable (defaults to `/Users/josephugaldeberrocal/Documents/Zimplixio_Marketing`). The `/api/pipeline` route spawns those scripts as child processes and reads `tmp/posts_draft.json` to ingest results into PostgreSQL. The `/api/opportunities` POST route similarly calls `opportunities_find.py`.

## Tech Stack
- **Framework**: Next.js App Router (server + client components)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth v5 (credentials + TOTP MFA)
- **Styles**: Tailwind CSS + custom Soft UI design system in `src/app/globals.css`
- **Charts**: Recharts
- **Notifications**: Twilio WhatsApp + Web Push (VAPID)

## Architecture Pattern
Server components fetch data from Prisma and pass it as serialized props to `*Client.tsx` client components. Never call Prisma directly from client components. API routes handle all mutations and pipeline triggers. The pattern is:

```
page.tsx (server)  →  props  →  PageClient.tsx (client)
                                      ↕ fetch
                              /api/[route]/route.ts
                                      ↕
                                    Prisma
```

## Key Development Notes

### Running on Apple Silicon (M-series Mac)
The project uses an x86_64 Node binary via nvm. If `node` is not found in PATH in Claude Code's shell context, prefix commands:
```bash
PATH="/Users/josephugaldeberrocal/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit
```
Normal terminal usage with nvm loaded works fine.

### TypeScript checks
```bash
PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" arch -x86_64 npx tsc --noEmit 2>&1 | grep -v "validator.ts"
```
The `validator.ts` warning is a stale `.next/types` artifact — safe to ignore, clears on next full build.

### Database commands
```bash
npx prisma migrate dev --name <description>   # apply schema changes
npx prisma generate                           # regenerate client after schema edit
npx prisma studio                             # visual DB browser
```

## Rules
1. **Always run TypeScript check after changes** — `tsc --noEmit` before declaring done
2. **Server components fetch data; client components own UI state** — never blur this boundary
3. **Prisma schema is the single source of truth** — run `prisma migrate dev` after any model change
4. **Never hardcode MARKETING_DIR** — always use the env var
5. **No posts go live without explicit user action** — the dashboard shows drafts; the user approves

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | Auth callback base URL (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | NextAuth signing secret |
| `MARKETING_DIR` | Absolute path to Zimplixio_Marketing project root |
| `ANTHROPIC_API_KEY` | Claude API — used by marketing Python scripts |
| `TAVILY_API_KEY` | Tavily search — used by marketing Python scripts |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | Must be `whatsapp:+14155238886` (Twilio sandbox number) |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service for TOTP MFA |
| `WHATSAPP_NOTIFY_TO` | Recipient WhatsApp number (must have opted into sandbox) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push public key |
| `VAPID_PRIVATE_KEY` | Web push private key |
| `VAPID_EMAIL` | Web push contact email |
