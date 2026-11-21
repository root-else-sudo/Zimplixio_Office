import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons'

export default function Loading() {
  return <AdminTableSkeleton title="Activity log" columns={5} rows={8} showAction={false} />
}
