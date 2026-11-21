import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { createCompany } from '@/lib/admin/companies'
import { adminErrorResponse } from '@/lib/admin/route-helpers'

export const dynamic = 'force-dynamic'

const Body = z.object({ name: z.string() })

export const POST = withAuth(async (req, _ctx, session) => {
  const parsed = await parseJson(req, Body)
  if (parsed instanceof NextResponse) return parsed
  try {
    const company = await createCompany(session.active.userId, parsed.data.name)
    return NextResponse.json({ company })
  } catch (err) {
    return adminErrorResponse(err, 'admin.companies.create')
  }
}, { platformAdmin: true })
