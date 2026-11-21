import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { assertTestDatabaseUrl } from '../setup/guard'

export const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: assertTestDatabaseUrl(process.env.DATABASE_URL_TEST) }),
})

export const INTERNAL_COMPANY_ID = 'internal-zimplixio'

/** Wipes users, companies, invites and audit log, then restores the single internal company. */
export async function resetData(): Promise<void> {
  await testDb.$executeRawUnsafe('TRUNCATE TABLE "User", "Company", "UserInvite", "AuditLog", "RateLimit" CASCADE')
  await testDb.company.create({
    data: { id: INTERNAL_COMPANY_ID, name: 'Zimplixio', kind: 'INTERNAL' },
  })
}
