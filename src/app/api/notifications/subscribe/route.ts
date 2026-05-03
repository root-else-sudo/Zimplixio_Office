import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { toApiError } from '@/lib/errors'

const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(2_048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
})

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const parsed = await parseJson(req, SubscriptionSchema)
  if (parsed instanceof NextResponse) return parsed
  const sub = parsed.data

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId: session.user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      update: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toApiError(err, 'notifications.subscribe')
  }
})
