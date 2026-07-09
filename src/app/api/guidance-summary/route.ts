import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'

const UpdateSchema = z.object({
  content: z.string().max(2000, 'Keep it to a short paragraph or two — this feeds every future run'),
})

// Singleton per department — same shape as api/company-profile/route.ts. A
// manual edit's updatedAt becomes the engine's new "already learned from
// this" watermark (see src/lib/research/engine.ts).
export const PATCH = withAuth(async (req) => {
  const parsed = await parseJson(req, UpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const department = await prisma.department.findUnique({
      where: { key: 'PRODUCT_RESEARCH' },
    })
    if (!department) return apiError('NOT_FOUND', 'Product/Research department not found')

    const summary = await prisma.guidanceSummary.upsert({
      where: { departmentId: department.id },
      update: { content: parsed.data.content },
      create: { departmentId: department.id, content: parsed.data.content },
    })

    return NextResponse.json(summary)
  } catch (err) {
    return toApiError(err, 'guidance-summary.patch')
  }
})
