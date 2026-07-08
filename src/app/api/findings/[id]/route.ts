import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { parseJson } from '@/lib/validate'
import { toApiError, apiError } from '@/lib/errors'
import { FindingSchema } from '@/lib/findings'

export const GET = withAuth<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params
  try {
    const finding = await prisma.finding.findUnique({ where: { id } })
    if (!finding) return apiError('NOT_FOUND', 'Finding not found')
    return NextResponse.json(finding)
  } catch (err) {
    return toApiError(err, 'findings.get')
  }
})

export const PATCH = withAuth<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params
  const parsed = await parseJson(req, FindingSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const existing = await prisma.finding.findUnique({ where: { id } })
    if (!existing) return apiError('NOT_FOUND', 'Finding not found')

    const finding = await prisma.finding.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json(finding)
  } catch (err) {
    return toApiError(err, 'findings.patch')
  }
})
