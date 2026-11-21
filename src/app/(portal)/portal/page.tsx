import { getPortalCompany } from '@/lib/portal'

export const dynamic = 'force-dynamic'

export default async function PortalPage() {
  const company = await getPortalCompany()

  return (
    <div className="portal-page">
      <p className="eyebrow">Client portal</p>
      <h1 className="portal-title">{company.name}</h1>
      <div className="soft-card portal-empty">
        <p>Your projects with Zimplixio will appear here.</p>
      </div>
    </div>
  )
}
