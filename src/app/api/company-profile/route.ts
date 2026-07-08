import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'

const UpdateSchema = z.object({
  content: z.string().min(1, 'Content is required'),
})

// Singleton per department — for now there is only ever one Company Profile
// (Product/Research), so this route doesn't need an id in the path.
export const PATCH = withAuth(async (req) => {
  const parsed = await parseJson(req, UpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const department = await prisma.department.findUnique({
      where: { key: 'PRODUCT_RESEARCH' },
    })
    if (!department) return apiError('NOT_FOUND', 'Product/Research department not found')

    const profile = await prisma.companyProfile.upsert({
      where: { departmentId: department.id },
      update: { content: parsed.data.content },
      create: { departmentId: department.id, content: parsed.data.content },
    })

    return NextResponse.json(profile)
  } catch (err) {
    return toApiError(err, 'company-profile.patch')
  }
})
