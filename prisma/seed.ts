import { PrismaClient, DepartmentKey, DepartmentStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as any)

type DepartmentSeed = {
  key: DepartmentKey
  name: string
  purpose: string
  status: DepartmentStatus
  order: number
  knowledge: string[]
  kpis: string[]
}

// Starter content from CRM v2 Planning §1.3 — a starting point for the owner to refine.
const DEPARTMENTS: DepartmentSeed[] = [
  {
    key: 'PRODUCT_RESEARCH',
    name: 'Product / Research',
    purpose:
      'Discover and validate viable niches and service needs for US SMBs that Zimplixio can credibly serve — and, over time, turn a proven service into a repeatable product.',
    status: 'BUILT',
    order: 1,
    knowledge: [
      'Operating principle: solve a real US-SMB need as a service first; productize once client work reveals the repeatable pattern. There is no product without serving clients first.',
      "Fit lens: every opportunity is judged against Zimplixio's five service lines (Roadmap & Planning; Solution Architecture & Implementation; Data Engineering & Automation; Embedded Technical Partnership; AI & Agentic Automation).",
      'Needs are stated nowhere and implied everywhere: they are inferred by connecting dots across broad signal, then tested — not read off a single report.',
    ],
    kpis: [
      'Validated service opportunities per month',
      'Validation rate (validated ÷ candidates surfaced)',
      'Opportunities that became a client engagement',
      'Candidate → validated turnaround time',
    ],
  },
  {
    key: 'ENGINEERING',
    name: 'Engineering',
    purpose: 'Build and maintain the solutions Zimplixio delivers — client work and internal tooling alike.',
    status: 'RESERVED',
    order: 2,
    knowledge: [
      'Tech-agnostic across backend/frontend frameworks, relational & cloud databases, cloud platforms, data engineering (Azure Data Factory, SSIS), and agentic AI.',
      'Work runs in focused sprints with client-visible progress, following a PDCA methodology.',
      "Outcome over output — \"done isn't done until it works.\"",
    ],
    kpis: [
      'On-time milestone delivery rate',
      'Active projects in flight',
      'Post-delivery rework rate',
      'Cycle time per engagement phase',
    ],
  },
  {
    key: 'MARKETING',
    name: 'Marketing',
    purpose: 'Create demand — build the brand, produce content, and engage prospects.',
    status: 'RESERVED',
    order: 3,
    knowledge: [
      'Ground all messaging in validated Findings, not assumptions — this is the core v1 fix.',
      'Positioning: "Enterprise expertise, SMB agility"; value-plus-cost framing, never cost-leading.',
      'High-trust content angles: "we use what we build" and the data-migration rescue story. Primary channel today: LinkedIn.',
    ],
    kpis: [
      'Publishing cadence (posts per week)',
      'Engagement rate per post',
      'Qualified leads handed to Sales',
      'Audience / follower growth',
    ],
  },
  {
    key: 'SALES',
    name: 'Sales',
    purpose: 'Convert demand into revenue — outreach, qualification, and closing.',
    status: 'RESERVED',
    order: 4,
    knowledge: [
      'Positioning anchor: systems builder, not a hire substitute — "control plus the technology."',
      'Credibility sequencing: value first, credentials (PayPal, HP, IBM) after.',
      'Engagement path: Discovery → Assessment → Execution → Deliver. Book at zimplixio.com/book.',
    ],
    kpis: [
      'Discovery calls booked',
      'Open pipeline value',
      'Win rate (closed-won ÷ total)',
      'Sales-cycle length',
    ],
  },
  {
    key: 'FINANCE',
    name: 'Finance',
    purpose: 'Manage the money — expenses, costs, runway, and billing.',
    status: 'RESERVED',
    order: 5,
    knowledge: [
      'Billing models: Fixed Fee and T&M only — no retainers; Net 15 terms.',
      'Pricing rhythm: fixed assessment fee upfront, 50% deposit before execution, balance at delivery.',
      'US B2B: PDF invoices are legally sufficient; W-9 and 1099-NEC are the key administrative items.',
    ],
    kpis: [
      'Monthly revenue',
      'Runway (months of cost covered)',
      'Receivables outstanding / average days-to-pay',
      'Gross margin per engagement',
    ],
  },
  {
    key: 'OPERATIONS',
    name: 'Operations',
    purpose: 'Run the company as a whole — strategy, coordination, and cross-department oversight. This is where the human supervises the system.',
    status: 'RESERVED',
    order: 6,
    knowledge: [
      'Founder-led, remote-first, two-person core (Joe Ugalde + Maria Jose Espinoza).',
      'People/HR + Legal live here for now — contracts/NDAs, contractor administration.',
      "Long-term, this becomes the supervision layer coordinating each department's agent.",
    ],
    kpis: [
      'Cross-department goal completion',
      'Owner review turnaround (health of the human-in-the-loop gate)',
      'Departments / agents operational',
      'Overall system output health',
    ],
  },
]

async function seedAdminUser() {
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

async function seedDepartments() {
  for (const dept of DEPARTMENTS) {
    const department = await prisma.department.upsert({
      where: { key: dept.key },
      update: {
        name: dept.name,
        purpose: dept.purpose,
        status: dept.status,
        order: dept.order,
      },
      create: {
        key: dept.key,
        name: dept.name,
        purpose: dept.purpose,
        status: dept.status,
        order: dept.order,
      },
    })

    const existingKnowledge = await prisma.knowledge.count({ where: { departmentId: department.id } })
    if (existingKnowledge === 0) {
      await prisma.knowledge.createMany({
        data: dept.knowledge.map((content, i) => ({
          departmentId: department.id,
          content,
          order: i,
        })),
      })
    }

    const existingKpis = await prisma.kpi.count({ where: { departmentId: department.id } })
    if (existingKpis === 0) {
      await prisma.kpi.createMany({
        data: dept.kpis.map((name, i) => ({
          departmentId: department.id,
          name,
          order: i,
        })),
      })
    }

    console.log(`Seeded department: ${department.name}`)
  }
}

async function main() {
  await seedAdminUser()
  await seedDepartments()
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
