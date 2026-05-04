import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { notifyDraftStale } from '@/lib/notifications'

const STALE_THRESHOLD_HOURS = 24

// Cron handler. Scans for DRAFT posts older than the threshold that haven't
// already been notified-on this cycle. We use a simple `updatedAt` heuristic:
// once a draft is touched (edited, regenerated, approved, rejected), it stops
// being "stale" until the next 24h gap.
export async function handleStaleDraftsCheck(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000)

  const stale = await prisma.post.findMany({
    where: { status: 'DRAFT', updatedAt: { lt: cutoff } },
    select: { id: true, updatedAt: true },
    take: 50, // safety cap so a backlog doesn't spam everyone at once
  })

  if (stale.length === 0) {
    logger.info('no stale drafts')
    return
  }

  logger.info({ count: stale.length }, 'notifying on stale drafts')

  for (const post of stale) {
    const ageHours = Math.round(
      (Date.now() - post.updatedAt.getTime()) / (60 * 60 * 1000)
    )
    try {
      await notifyDraftStale(post.id, ageHours)
    } catch (err) {
      logger.error({ err, postId: post.id }, 'stale-draft notification failed')
    }
  }
}
