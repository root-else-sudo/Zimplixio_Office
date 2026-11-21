import { notFound } from 'next/navigation'
import { requirePlatformAdmin } from '@/lib/guards'
import { getCompany } from '@/lib/admin/companies'
import { AdminNotFoundError } from '@/lib/admin/errors'
import CompanyDetailClient from './CompanyDetailClient'

export const dynamic = 'force-dynamic'

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin()
  const { id } = await params
  let company
  try {
    company = await getCompany(id)
  } catch (e) {
    if (e instanceof AdminNotFoundError) notFound()
    throw e
  }
  return <CompanyDetailClient company={{ ...company, createdAt: company.createdAt.toISOString() }} />
}
