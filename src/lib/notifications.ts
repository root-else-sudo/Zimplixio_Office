import webpush from 'web-push'
import { prisma } from './prisma'
import { sendSMS } from './twilio'
import { serverEnv } from './env'
import { clientEnv } from './env-client'
import { logger } from './logger'

let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  webpush.setVapidDetails(
    `mailto:${serverEnv.VAPID_EMAIL}`,
    clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    serverEnv.VAPID_PRIVATE_KEY
  )
  vapidReady = true
}

// Shared dispatch — WhatsApp + web push to every registered subscriber. Kept
// fire-and-forget per channel: a Twilio outage shouldn't block push and vice
// versa. Errors are logged but never thrown. A successful WhatsApp send logs
// the Twilio SID + status so dispatches stay visible without needing to
// re-instrument the worker on every "did the message go out?" question.
async function dispatch(title: string, body: string) {
  ensureVapid()
  try {
    const message = await sendSMS(`${title}: ${body}`)
    logger.info(
      { sid: message.sid, twilioStatus: message.status, title },
      'whatsapp dispatched'
    )
  } catch (err) {
    logger.error({ err, title }, 'whatsapp notification failed')
  }

  const subs = await prisma.pushSubscription.findMany()
  if (subs.length === 0) {
    logger.info({ title }, 'no push subscribers registered — skipping push')
  } else {
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body })
        )
      )
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    logger.info({ title, total: subs.length, failed }, 'push dispatched')
  }
}

export async function notifyDraftsReady(count: number) {
  if (count === 0) return
  await dispatch(
    'Zimplixio Office',
    `Pipeline complete — ${count} post${count !== 1 ? 's' : ''} saved for review.`
  )
}

export async function notifyPipelineFailed(runId: string, errorSummary: string) {
  // Truncate the summary so push payloads stay small.
  const trimmed = errorSummary.length > 200 ? `${errorSummary.slice(0, 200)}…` : errorSummary
  await dispatch(
    'Pipeline failed',
    `Run ${runId.slice(0, 8)} failed: ${trimmed}`
  )
}

export async function notifyDraftStale(postId: string, ageHours: number) {
  await dispatch(
    'Draft awaiting review',
    `Post ${postId.slice(0, 8)} has been waiting ${ageHours}h for review.`
  )
}

export async function notifyPostPublished(postId: string) {
  await dispatch(
    'Post published',
    `Post ${postId.slice(0, 8)} is now live on LinkedIn.`
  )
}

export async function notifyPostPublishFailed(postId: string, errorSummary: string) {
  const trimmed = errorSummary.length > 200 ? `${errorSummary.slice(0, 200)}…` : errorSummary
  await dispatch(
    'Post publish failed',
    `Post ${postId.slice(0, 8)} could not be published after retries: ${trimmed}`
  )
}
