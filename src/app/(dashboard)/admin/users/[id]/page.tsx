import { notFound } from 'next/navigation'
import { requirePlatformAdmin } from '@/lib/guards'
import { getUser } from '@/lib/admin/users'
import { AdminNotFoundError } from '@/lib/admin/errors'
import UserDetailClient from './UserDetailClient'

export const dynamic = 'force-dynamic'

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin()
  const { id } = await params
  let user
  try {
    user = await getUser(id)
  } catch (e) {
    if (e instanceof AdminNotFoundError) notFound()
    throw e
  }
  return (
    <UserDetailClient
      isSelf={user.id === admin.userId}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        companyId: user.company.id,
        companyName: user.company.name,
        createdAt: user.createdAt.toISOString(),
        pendingInviteExpiresAt: user.pendingInvite?.expiresAt.toISOString() ?? null,
      }}
    />
  )
}
