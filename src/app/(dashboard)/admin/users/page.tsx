import { requirePlatformAdmin } from '@/lib/guards'
import { listCompanies } from '@/lib/admin/companies'
import { listUsers } from '@/lib/admin/users'
import UsersClient from './UsersClient'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ companyId?: string | string[]; invite?: string | string[] }>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlatformAdmin()
  const sp = await searchParams
  const companies = await listCompanies()
  const requested = first(sp.companyId)
  // Unknown company ids are ignored.
  const companyId = companies.find(c => c.id === requested)?.id ?? null
  const users = await listUsers(companyId ? { companyId } : undefined)
  return (
    <UsersClient
      companies={companies.map(c => ({ id: c.id, name: c.name, status: c.status }))}
      companyId={companyId}
      inviteOpen={first(sp.invite) === '1'}
      users={users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        mfaEnabled: u.mfaEnabled,
        companyName: u.company.name,
        pendingInviteExpiresAt: u.pendingInvite?.expiresAt.toISOString() ?? null,
      }))}
    />
  )
}
