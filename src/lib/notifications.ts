import webpush from 'web-push'
import { prisma } from './prisma'
import { sendWhatsApp } from './twilio'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function notifyDraftsReady(count: number) {
  const message = `Hey Joe, Pipeline complete — ${count} post${count !== 1 ? 's' : ''} saved for review.`

  // WhatsApp
  try {
    await sendWhatsApp(message)
  } catch (e) {
    console.error('WhatsApp notification failed:', e)
  }

  // Browser push — notify all subscribers
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
