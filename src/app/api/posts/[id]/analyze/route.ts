import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { rateLimit } from '@/lib/ratelimit'
import { apiError, toApiError } from '@/lib/errors'
import { anthropic, MODELS } from '@/lib/ai-client'

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
    const message = await anthropic.messages.create({
      model: MODELS.PRIMARY,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are a content strategist for Zimplixio, a B2B SaaS company helping SMB owners with AI automation.

Review this LinkedIn post draft and identify what's most likely off about it. Return exactly 4 short, specific options the reviewer could select to guide a rewrite. Each option should be a clear direction — not a description of the problem.

Post:
"""
${post.content}
"""

Return a JSON array of exactly 4 strings. Each string must be under 12 words. No explanation, just the JSON array.

Examples of good options:
- "Reframe around opportunity, not risk or fear"
- "Use simpler language, this reads too technical"
- "Make the hook stronger before the cutoff"
- "Focus on a single clear insight, not multiple points"
- "The CTA is too generic, make it more specific"
- "Tone is too formal, needs to sound more conversational"`,
        },
      ],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()

    let options: string[]
    try {
      const match = raw.match(/\[[\s\S]*\]/)
      options = JSON.parse(match ? match[0] : raw)
    } catch {
      options = [
        'Reframe around opportunity, not risk or fear',
        'Use simpler language, reads too technical',
        'Make the hook stronger before the cutoff',
        'The CTA is too generic, make it more specific',
      ]
    }

    return NextResponse.json({ options })
  } catch (err) {
    return toApiError(err, 'posts.analyze')
  }
})
