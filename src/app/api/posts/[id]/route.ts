import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publishToLinkedIn } from '@/lib/linkedin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { status, content } = body

  const post = await prisma.post.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(content !== undefined && { content }),
    },
  })

  // Auto-publish to LinkedIn when a post is approved
  if (status === 'APPROVED') {
    publishToLinkedIn(post.content).catch(console.error)
  }

  return NextResponse.json(post)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.post.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
