import { requirePlatformAdmin } from '@/lib/guards'
import { listCompanies } from '@/lib/admin/companies'
import CompaniesClient from './CompaniesClient'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  await requirePlatformAdmin()
  const companies = await listCompanies()
  return <CompaniesClient companies={companies.map(c => ({ ...c, createdAt: c.createdAt.toISOString() }))} />
}
