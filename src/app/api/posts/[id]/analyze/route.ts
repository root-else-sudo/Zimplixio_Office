export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { rateLimit } from '@/lib/ratelimit'
import { apiError, toApiError } from '@/lib/errors'
import { callClaude, MODELS } from '@/lib/ai-client'
import { ANALYZE_SYSTEM } from '@/lib/ai/prompts'
import { ANALYZE_TOOL, AnalyzeOptionsSchema } from '@/lib/ai/schemas'
import { logger } from '@/lib/logger'

const ANALYZE_LIMIT = 30
const ANALYZE_WINDOW_MS = 60 * 60 * 1000

export const POST = withAuth<{ id: string }>(async (_req, { params }, session) => {
  const limit = await rateLimit({
    scope: 'posts.analyze',
    actor: session.user.id,
    limit: ANALYZE_LIMIT,
    windowMs: ANALYZE_WINDOW_MS,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many analyze requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(limit.retryAfterMs / 1000).toString() },
      }
    )
  }

  const { id } = await params
  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) return apiError('NOT_FOUND', 'Post not found')

  try {
    const result = await callClaude({
      route: 'posts.analyze',
      userId: session.user.id,
      model: MODELS.FAST,
      maxTokens: 400,
      system: ANALYZE_SYSTEM,
      cacheSystem: true,
      messages: [
        {
          role: 'user',
          content: `Review this LinkedIn post draft and propose 4 revision directions:\n\n"""\n${post.content}\n"""`,
        },
      ],
      tools: [ANALYZE_TOOL],
      forceTool: ANALYZE_TOOL.name,
    })

    const parsed = AnalyzeOptionsSchema.safeParse(result.toolInput)
    if (!parsed.success) {
      logger.warn(
        { route: 'posts.analyze', issues: parsed.error.issues },
        'analyze tool output failed schema'
      )
      return apiError('INTERNAL_ERROR', 'Could not generate revision options')
    }

    return NextResponse.json({ options: parsed.data.options })
  } catch (err) {
    return toApiError(err, 'posts.analyze')
  }
})
