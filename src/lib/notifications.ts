import webpush from 'web-push'
import { prisma } from './prisma'
import { sendWhatsApp } from './twilio'
import { serverEnv } from './env'
import { clientEnv } from './env-client'
import { logger } from './logger'

webpush.setVapidDetails(
  `mailto:${serverEnv.VAPID_EMAIL}`,
  clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  serverEnv.VAPID_PRIVATE_KEY
)

export async function notifyDraftsReady(count: number) {
  const message = `Hey Joe, Pipeline complete — ${count} post${count !== 1 ? 's' : ''} saved for review.`

  try {
    await sendWhatsApp(message)
  } catch (e) {
    logger.error({ err: e }, 'whatsapp notification failed')
  }

  const subs = await prisma.pushSubscription.findMany()
  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'Zimplixio Office', body: message })
      )
    )
  )
}
