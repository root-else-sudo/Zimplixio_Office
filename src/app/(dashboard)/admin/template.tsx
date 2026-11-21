import { requirePlatformAdmin } from '@/lib/guards'

export const dynamic = 'force-dynamic'

// Templates re-run on soft navigation, so a demoted admin loses access immediately.
export default async function AdminTemplate({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin()
  return <>{children}</>
}
