import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { serverEnv } from '@/lib/env'
import { inviteUser } from '@/lib/admin/users'
import { inviteUrl } from '@/lib/admin/invite-tokens'
import { adminErrorResponse } from '@/lib/admin/route-helpers'

export const dynamic = 'force-dynamic'

const Body = z.object({ name: z.string(), email: z.string(), companyId: z.string().min(1) })

export const POST = withAuth(async (req, _ctx, session) => {
  const parsed = await parseJson(req, Body)
  if (parsed instanceof NextResponse) return parsed
  try {
    const { user, token } = await inviteUser(session.active.userId, parsed.data)
    // The raw invite URL exists only in this response; it is never logged or stored.
    return NextResponse.json({
      user,
      inviteUrl: inviteUrl(token, serverEnv.NEXTAUTH_URL),
      expiresAt: user.pendingInvite?.expiresAt ?? null,
    })
  } catch (err) {
    return adminErrorResponse(err, 'admin.users.invite')
  }
}, { platformAdmin: true })
