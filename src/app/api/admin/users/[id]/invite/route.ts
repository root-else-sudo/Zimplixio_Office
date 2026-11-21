import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/rbac'
import { serverEnv } from '@/lib/env'
import { reissueInvite } from '@/lib/admin/users'
import { inviteUrl } from '@/lib/admin/invite-tokens'
import { adminErrorResponse } from '@/lib/admin/route-helpers'

export const dynamic = 'force-dynamic'

export const POST = withAuth<{ id: string }>(async (_req, ctx, session) => {
  const { id } = await ctx.params
  try {
    const { token, expiresAt } = await reissueInvite(session.active.userId, id)
    // The raw invite URL exists only in this response; it is never logged or stored.
    return NextResponse.json({ inviteUrl: inviteUrl(token, serverEnv.NEXTAUTH_URL), expiresAt })
  } catch (err) {
    return adminErrorResponse(err, 'admin.users.reinvite')
  }
}, { platformAdmin: true })
