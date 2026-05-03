import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const email = process.env.SEED_EMAIL ?? 'admin@zimplixio.com'
  const password = process.env.SEED_PASSWORD ?? 'changeme123'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`User ${email} already exists, skipping.`)
    return
  }

  const hash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Admin',
      passwordHash: hash,
      role: 'ADMIN',
    },
  })

  console.log(`Created admin user: ${user.email}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
