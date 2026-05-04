import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { rateLimit } from '@/lib/ratelimit'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'
import { callClaude, MODELS } from '@/lib/ai-client'
import { REGENERATE_SYSTEM } from '@/lib/ai/prompts'
import { REGENERATE_TOOL, RewrittenPostSchema } from '@/lib/ai/schemas'
import { logger } from '@/lib/logger'

const REGENERATE_LIMIT = 20
const REGENERATE_WINDOW_MS = 60 * 60 * 1000

const RegenerateSchema = z.object({
  selectedOptions: z.array(z.string().max(200)).max(20).optional().default([]),
  freeText: z.string().max(2_000).optional().default(''),
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { params }, session) => {
  const limit = await rateLimit({
    scope: 'posts.regenerate',
    actor: session.user.id,
    limit: REGENERATE_LIMIT,
    windowMs: REGENERATE_WINDOW_MS,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many regenerate requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(limit.retryAfterMs / 1000).toString() },
      }
    )
  }

  const parsed = await parseJson(req, RegenerateSchema)
  if (parsed instanceof NextResponse) return parsed
  const { selectedOptions, freeText } = parsed.data

  const { id } = await params
  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) return apiError('NOT_FOUND', 'Post not found')

  const feedbackParts: string[] = []
  if (selectedOptions.length) {
    feedbackParts.push(
      `Feedback on what to change:\n${selectedOptions.map((o) => `- ${o}`).join('\n')}`
    )
  }
  if (freeText.trim()) {
    feedbackParts.push(`Additional direction from the reviewer:\n${freeText.trim()}`)
  }
  const feedback = feedbackParts.join('\n\n')

  try {
    const result = await callClaude({
      route: 'posts.regenerate',
      userId: session.user.id,
      model: MODELS.PRIMARY,
      maxTokens: 600,
      system: REGENERATE_SYSTEM,
      cacheSystem: true,
      messages: [
        {
          role: 'user',
          content: `Rewrite the following LinkedIn post based on the reviewer's feedback. Keep the same source topic but apply the direction given.\n\nOriginal post:\n"""\n${post.content}\n"""\n\n${feedback}\n\nReturn the rewritten post via the submit_rewritten_post tool.`,
        },
      ],
      tools: [REGENERATE_TOOL],
      forceTool: REGENERATE_TOOL.name,
    })

    const validated = RewrittenPostSchema.safeParse(result.toolInput)
    if (!validated.success) {
      logger.warn(
        { route: 'posts.regenerate', issues: validated.error.issues },
        'regenerate tool output failed schema'
      )
      return apiError('INTERNAL_ERROR', 'Could not generate rewritten post')
    }

    // Audit: every regeneration is captured as a candidate version, even if
    // the reviewer later discards it. The PATCH that adopts a candidate writes
    // its own EDITED row.
    const candidate = await prisma.$transaction(async (tx) => {
      const latest = await tx.postVersion.findFirst({
        where: { postId: post.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const nextVersion = (latest?.version ?? 0) + 1
      return tx.postVersion.create({
        data: {
          postId: post.id,
          version: nextVersion,
          content: validated.data.content,
          source: 'REGENERATED',
          createdBy: session.user.id,
          feedback: { selectedOptions, freeText: freeText.trim() || null },
        },
      })
    })

    return NextResponse.json({
      content: validated.data.content,
      versionId: candidate.id,
      version: candidate.version,
    })
  } catch (err) {
    return toApiError(err, 'posts.regenerate')
  }
})
