import { prisma } from '@/lib/prisma'
import GuidanceSummaryClient from './GuidanceSummaryClient'

export default async function GuidanceSummaryPage() {
  const department = await prisma.department.findUnique({
    where: { key: 'PRODUCT_RESEARCH' },
    include: { guidanceSummary: true },
  })

  return <GuidanceSummaryClient initialContent={department?.guidanceSummary?.content ?? ''} />
}
