import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
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
}
