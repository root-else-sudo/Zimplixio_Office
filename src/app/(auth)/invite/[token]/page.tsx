import type { Metadata } from 'next'
import { AuthCard } from '@/components/auth/AuthCard'
import { getInviteState } from '@/lib/admin/accept-invite'
import InviteClient from './InviteClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Accept your invite', robots: { index: false } }

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const state = await getInviteState(token)

  if (!state.ok) {
    return (
      <AuthCard title="This invite link can’t be used">
        <p className="auth-subtitle">
          This invite link is invalid or has expired. Ask your Zimplixio admin for a new one.
        </p>
      </AuthCard>
    )
  }
  return <InviteClient token={token} name={state.name} email={state.email} />
}
