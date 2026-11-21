import { cache } from 'react'
import { requireClient } from '@/lib/guards'
import { getOwnCompany, getTenantContext } from '@/lib/tenancy'

/** The signed-in client's company. Cached per request so layout + page share one query. */
export const getPortalCompany = cache(async () => {
  const active = await requireClient()
  return getOwnCompany(getTenantContext(active))
})
