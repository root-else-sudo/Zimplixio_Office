import { prisma } from '@/lib/prisma'
import CompanyProfileClient from './CompanyProfileClient'

export default async function CompanyProfilePage() {
  const department = await prisma.department.findUnique({
    where: { key: 'PRODUCT_RESEARCH' },
    include: { companyProfile: true },
  })

  return <CompanyProfileClient initialContent={department?.companyProfile?.content ?? ''} />
}
