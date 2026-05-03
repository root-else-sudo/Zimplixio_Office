import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You write LinkedIn posts for Zimplixio. Zimplixio helps small and medium businesses run better using technology — AI tools, e-commerce systems, data forecasting, and smarter workflows.

The audience is owners and managers at companies with 5 to 200 employees. Busy, practical people who care about saving time, cutting costs, and growing. They are not technical.

Structure:
- HOOK (1-2 lines, before "see more"): Use one of these formulas — Confession, Pattern interrupt, Provocation, List tease, Story promise, Bold statement, or Question. Never open with "I'm excited to share" or "Did you know."
- BODY (3-5 short paragraphs): 1-2 sentences per paragraph, one idea per line, blank line between each. Alternate between narrative and bullet formats (✓ or → markers).
- CTA (1 line): Soft and specific. No URL in the post body — links go in the first comment. Format: "If you want [outcome], book a free call — link in the first comment 👇"

Rules:
- 120-150 words total
- 1-2 emojis max, used as visual anchors not decoration
- No hashtags, no URLs in the post body
- Plain language, 8th grade reading level, write like you talk
- Opportunity-framed — no fear, no warnings, no doom
- Forbidden words: leverage, ecosystem, paradigm, synergy, enterprise-grade, cutting-edge, navigate, landscape, seamless, robust, empower, revolutionize, transform, game-changer, unlock, harness, elevate

Outcome patterns to draw from (match to the post topic):
- Spreadsheet → system: business gets a custom app backed by a real database. Nothing changed about the business — everything changed about how it operated.
- Desktop → SaaS: working app rebuilt as a SaaS product. Same logic — different business model and growth ceiling.
- Failed project rescue: previous contractor walked away. We came in, finished the job, got the business moving again.
- ERP integration: ERPs are islands. We connect them so the business can see what's actually happening.
- Agentic automation: a human was the bridge between systems. An agent does it instead. Rules set once, process runs itself.
- Custom reporting: business stops making gut decisions and starts working from live data they trust.

Special angle — when topic is AI/automation: Zimplixio built its own content agent that monitors SMB trends and proposes posts daily. Every post is proof the system works. "We built ourselves an agent... this is what we build for clients."`

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { selectedOptions, freeText } = body as { selectedOptions: string[]; freeText: string }

  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const feedbackParts: string[] = []
  if (selectedOptions?.length) {
    feedbackParts.push(`Feedback on what to change:\n${selectedOptions.map((o) => `- ${o}`).join('\n')}`)
  }
  if (freeText?.trim()) {
    feedbackParts.push(`Additional direction from the reviewer:\n${freeText.trim()}`)
  }

  const feedback = feedbackParts.join('\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Rewrite the following LinkedIn post based on the reviewer's feedback. Keep the same source topic but apply the direction given.

Original post:
"""
${post.content}
"""

${feedback}

Return only the rewritten post. No explanation, no title, no quotes around it.`,
      },
    ],
  })

  const newContent = (message.content[0] as { type: string; text: string }).text.trim()

  return NextResponse.json({ content: newContent })
}
