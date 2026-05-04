// One-time backfill: write a PostVersion v1 (ORIGINAL) for every existing
// Post. Idempotent — skips posts that already have any PostVersion rows.
//
// Run once after Phase 5's migration lands:
//   npm run backfill:post-versions
import './load-env'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

async function main() {
  const posts = await prisma.post.findMany({
    select: { id: true, content: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  logger.info({ count: posts.length }, 'scanning posts')

  let created = 0
  let skipped = 0

  for (const post of posts) {
    const existing = await prisma.postVersion.count({ where: { postId: post.id } })
    if (existing > 0) {
      skipped++
      continue
    }
    await prisma.postVersion.create({
      data: {
        postId: post.id,
        version: 1,
        content: post.content,
        source: 'ORIGINAL',
        createdAt: post.createdAt,
      },
    })
    created++
  }

  logger.info({ created, skipped }, 'backfill complete')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'backfill failed')
    process.exit(1)
  })
