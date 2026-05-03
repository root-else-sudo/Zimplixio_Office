import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { serverEnv } from './env'
import { logger } from './logger'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: serverEnv.DATABASE_URL })
  const client = new PrismaClient({
    adapter,
    log: [{ level: 'error', emit: 'event' }, { level: 'warn', emit: 'event' }],
  })

  client.$on('error', (e) => logger.error({ prisma: e }, 'prisma error'))
  client.$on('warn', (e) => logger.warn({ prisma: e }, 'prisma warn'))

  return client
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (serverEnv.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
