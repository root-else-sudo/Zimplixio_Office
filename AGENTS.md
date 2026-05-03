<!-- BEGIN:nextjs-agent-rules -->
# Zimplixio Office — Agent Context

This project uses **Next.js App Router** with TypeScript strict mode. Key conventions:

- Server components live in `page.tsx` — they fetch from Prisma and pass serialized props to client components
- Client components are named `*Client.tsx` — they own UI state and call API routes via `fetch`
- API routes live in `src/app/api/` — they handle mutations, pipeline triggers, and external service calls
- Prisma schema is at `prisma/schema.prisma` — run `npx prisma migrate dev` after any model change

See `PROJECT.md` for pages, components, API routes, and database models.
See `CLAUDE.md` for operating instructions and development notes.
See `LOG.md` for known issues and fixes.
<!-- END:nextjs-agent-rules -->
