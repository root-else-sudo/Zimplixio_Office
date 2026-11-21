import { redirect } from 'next/navigation'
import { requirePlatformAdmin } from '@/lib/guards'

export const dynamic = 'force-dynamic'

export default async function AdminIndexPage() {
  await requirePlatformAdmin()
  redirect('/admin/companies')
}
