import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import FindingForm from '@/components/departments/FindingForm'

export default async function EditFindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const finding = await prisma.finding.findUnique({ where: { id } })
  if (!finding) notFound()

  return (
    <FindingForm
      findingId={finding.id}
      initialValues={{
        title: finding.title,
        evidence: finding.evidence,
        fitRationale: finding.fitRationale,
        status: finding.status,
        rejectionReason: finding.rejectionReason ?? '',
      }}
    />
  )
}
