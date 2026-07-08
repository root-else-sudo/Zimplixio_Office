import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { parseJson } from '@/lib/validate'
import { toApiError, apiError } from '@/lib/errors'
import { FindingSchema } from '@/lib/findings'

export const POST = withAuth(async (req) => {
  const parsed = await parseJson(req, FindingSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const department = await prisma.department.findUnique({
      where: { key: 'PRODUCT_RESEARCH' },
    })
    if (!department) return apiError('NOT_FOUND', 'Product/Research department not found')

    const finding = await prisma.finding.create({
      data: { departmentId: department.id, ...parsed.data },
    })

    return NextResponse.json(finding, { status: 201 })
  } catch (err) {
    return toApiError(err, 'findings.post')
  }
})
