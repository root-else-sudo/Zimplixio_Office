import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/rbac'
import { resetUserMfa } from '@/lib/admin/users'
import { adminErrorResponse } from '@/lib/admin/route-helpers'

export const dynamic = 'force-dynamic'

export const POST = withAuth<{ id: string }>(async (_req, ctx, session) => {
  const { id } = await ctx.params
  try {
    const user = await resetUserMfa(session.active.userId, id)
    return NextResponse.json({ user })
  } catch (err) {
    return adminErrorResponse(err, 'admin.users.resetMfa')
  }
}, { platformAdmin: true })
