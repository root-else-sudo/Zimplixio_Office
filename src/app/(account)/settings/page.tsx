import { requireSignedIn } from '@/lib/guards'
import { prisma } from '@/lib/prisma'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  // The (account) layout and template guard this route; this read is for display.
  const active = await requireSignedIn()

  const user = await prisma.user.findUnique({
    where: { id: active.userId },
    select: { mfaEnabled: true },
  })

  return <SettingsClient mfaEnabled={user?.mfaEnabled ?? false} />
}
