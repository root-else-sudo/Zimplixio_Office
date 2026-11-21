import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { renameUser, setUserStatus } from '@/lib/admin/users'
import { adminErrorResponse } from '@/lib/admin/route-helpers'

export const dynamic = 'force-dynamic'

// Exactly one of `name` or `status` (strict objects reject both-or-neither).
const Body = z.union([
  z.object({ name: z.string() }).strict(),
  z.object({ status: z.enum(['ACTIVE', 'DEACTIVATED']) }).strict(),
])

export const PATCH = withAuth<{ id: string }>(async (req, ctx, session) => {
  const { id } = await ctx.params
  const parsed = await parseJson(req, Body)
  if (parsed instanceof NextResponse) return parsed
  try {
    const actor = session.active.userId
    const body = parsed.data
    const user = 'name' in body
      ? await renameUser(actor, id, body.name)
      : await setUserStatus(actor, id, body.status)
    return NextResponse.json({ user })
  } catch (err) {
    return adminErrorResponse(err, 'admin.users.patch')
  }
}, { platformAdmin: true })
