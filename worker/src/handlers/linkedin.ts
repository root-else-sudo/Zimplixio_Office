import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { publishToLinkedIn } from '@/lib/linkedin'
import {
  notifyPostPublished,
  notifyPostPublishFailed,
} from '@/lib/notifications'
import type { LinkedInPublishPayload } from '@/lib/pgboss'

interface LinkedInWebhookPayload {
  postId: string
  content: string
}

// pg-boss handles retry scheduling. This handler updates the Webhook row to
// reflect the attempt, calls the publisher, and on success: marks the row
// SUCCEEDED, flips Post.status → PUBLISHED, fires the notification.
//
// On exception: increment attempts, store lastError, then RE-THROW so pg-boss
// retries (subject to retryLimit on the enqueue side). On the final failed
// attempt the row stays PENDING with attempts == retryLimit + 1; the cron
// sweep (or manual replay) finalises it. To keep the simple path obvious we
// also flip to FAILED inline once attempts hit the configured ceiling.
const RETRY_CEILING = 3

export async function handleLinkedInPublish(payload: LinkedInPublishPayload): Promise<void> {
  const { webhookId } = payload
  const log = logger.child({ webhookId, job: 'linkedin.publish' })

  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } })
  if (!webhook) {
    log.warn('webhook row missing — was it deleted?')
    return
  }
  if (webhook.status !== 'PENDING') {
    log.info({ status: webhook.status }, 'webhook already finalised — skipping')
    return
  }

  const data = webhook.payload as unknown as LinkedInWebhookPayload
  const attemptNumber = webhook.attempts + 1
  await prisma.webhook.update({
    where: { id: webhookId },
    data: { attempts: attemptNumber },
  })

  try {
    const result = await publishToLinkedIn(data.content)
    if (!result.ok) {
      // Stub case (env not configured) is treated as a soft failure so the
      // record stays observable but doesn't keep retrying forever.
      throw new Error(result.message)
    }

    await prisma.$transaction(async (tx) => {
      await tx.webhook.update({
        where: { id: webhookId },
        data: {
          status: 'SUCCEEDED',
          deliveredAt: new Date(),
          lastError: null,
        },
      })
      if (data.postId) {
        await tx.post.update({
          where: { id: data.postId },
          data: { status: 'PUBLISHED' },
        })
      }
    })

    log.info({ postId: data.postId }, 'linkedin publish succeeded')
    await notifyPostPublished(data.postId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err, attempt: attemptNumber }, 'linkedin publish failed')

    if (attemptNumber >= RETRY_CEILING) {
      // Final failure: finalise the row and notify so a human can take over.
      await prisma.webhook.update({
        where: { id: webhookId },
        data: { status: 'FAILED', lastError: msg },
      })
      await notifyPostPublishFailed(data.postId, msg)
      // Do NOT rethrow — we don't want pg-boss to keep retrying past our
      // ceiling once we've finalised the row.
      return
    }

    await prisma.webhook.update({
      where: { id: webhookId },
      data: { lastError: msg },
    })
    // Rethrow so pg-boss schedules another attempt with backoff.
    throw err
  }
}
