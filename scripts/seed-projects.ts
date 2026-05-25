/**
 * Seeds Project 1: "Production Setup & Agent Architecture"
 * with all phases and tasks from the master plan.
 * Idempotent — safe to re-run (skips if project name already exists).
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as never)

const d = (offsetDays: number) => {
  const dt = new Date('2026-05-17T00:00:00.000Z')
  dt.setDate(dt.getDate() + offsetDays)
  return dt
}

type TaskInput = {
  name: string
  description?: string
  startOffset: number
  endOffset: number
  depKeys?: string[]
}

type PhaseInput = {
  name: string
  color: string
  tasks: Record<string, TaskInput>
}

const PHASES: PhaseInput[] = [
  {
    name: 'Projects Page (Gantt)',
    color: '#8b5cf6',
    tasks: {
      schema:   { name: 'Add Project/Phase/Task/Dependency models to Prisma', startOffset: 0, endOffset: 0 },
      api:      { name: 'Build API routes (projects, phases, tasks, deps)', startOffset: 0, endOffset: 1, depKeys: ['schema'] },
      ui:       { name: 'Build Gantt UI (ProjectDetailClient + list page)', startOffset: 1, endOffset: 2, depKeys: ['api'] },
      sidebar:  { name: 'Add Projects nav item to Sidebar', startOffset: 1, endOffset: 1, depKeys: ['api'] },
      seed:     { name: 'Seed master plan as Project 1', startOffset: 2, endOffset: 2, depKeys: ['ui'] },
    },
  },
  {
    name: 'Agent Architecture',
    color: '#0ea5e9',
    tasks: {
      contract: { name: 'Document the Agent Contract pattern (6 layers)', startOffset: 3, endOffset: 3 },
      gates:    { name: 'Document approval gate standards', startOffset: 3, endOffset: 3 },
      aiWhere:  { name: 'Document where AI logic lives (Python vs Next.js rule)', startOffset: 3, endOffset: 3 },
      checklist:{ name: 'Create new-agent checklist (2-repo steps)', startOffset: 4, endOffset: 4, depKeys: ['contract', 'gates'] },
    },
  },
  {
    name: 'Cloudflare R2 Setup',
    color: '#f97316',
    tasks: {
      bucket: { name: 'Create R2 bucket in Cloudflare dashboard', startOffset: 3, endOffset: 3 },
      token:  { name: 'Create R2 API token (Object Read & Write)', startOffset: 3, endOffset: 3, depKeys: ['bucket'] },
      creds:  { name: 'Note Account ID, Access Key ID, Secret Access Key', startOffset: 3, endOffset: 3, depKeys: ['token'] },
    },
  },
  {
    name: 'Gmail Auth Migration',
    color: '#ea4335',
    tasks: {
      organize: { name: 'Run emails_organize.py locally to generate token_modify.json', startOffset: 3, endOffset: 3 },
      extract:  { name: 'Extract refresh tokens from token.json + token_modify.json', startOffset: 4, endOffset: 4, depKeys: ['organize'] },
      note:     { name: 'Note GMAIL_CLIENT_ID, CLIENT_SECRET + both refresh tokens', startOffset: 4, endOffset: 4, depKeys: ['extract'] },
    },
  },
  {
    name: 'Python Project Changes',
    color: '#10b981',
    tasks: {
      init:         { name: 'Create execution/utils/__init__.py', startOffset: 4, endOffset: 4 },
      gmailAuth:    { name: 'Create execution/utils/gmail_auth.py', startOffset: 4, endOffset: 5, depKeys: ['init', 'note'] },
      r2Storage:    { name: 'Create execution/utils/r2_storage.py', startOffset: 4, endOffset: 5, depKeys: ['init', 'creds'] },
      emailsFetch:  { name: 'Update emails_fetch.py — use get_gmail_credentials()', startOffset: 5, endOffset: 5, depKeys: ['gmailAuth'] },
      emailsOrg:    { name: 'Update emails_organize.py — use get_gmail_credentials()', startOffset: 5, endOffset: 5, depKeys: ['gmailAuth'] },
      ctxFetch:     { name: 'Update context_fetch.py — R2 cache + optional PDF path', startOffset: 5, endOffset: 5, depKeys: ['r2Storage'] },
      ctxSearch:    { name: 'Update context_search.py — R2 load/save market_context', startOffset: 5, endOffset: 5, depKeys: ['r2Storage'] },
      postsGen:     { name: 'Update posts_generate.py — R2 load market_context', startOffset: 5, endOffset: 5, depKeys: ['r2Storage'] },
      requirements: { name: 'Add requirements.txt + add boto3 to Pipfile', startOffset: 5, endOffset: 5 },
    },
  },
  {
    name: 'Next.js Worker Changes',
    color: '#6366f1',
    tasks: {
      dockerfile: { name: 'Create Dockerfile.worker', startOffset: 6, endOffset: 6 },
      startSh:    { name: 'Create scripts/start-worker.sh', startOffset: 6, endOffset: 6, depKeys: ['dockerfile'] },
      railwayToml:{ name: 'Create railway.toml', startOffset: 6, endOffset: 6 },
    },
  },
  {
    name: 'Railway Deployment',
    color: '#8b5cf6',
    tasks: {
      project:   { name: 'Create Railway project + provision Postgres addon', startOffset: 7, endOffset: 7, depKeys: ['dockerfile', 'startSh', 'railwayToml'] },
      webSvc:    { name: 'Create office-web service (auto-detected Next.js)', startOffset: 7, endOffset: 7, depKeys: ['project'] },
      workerSvc: { name: 'Create office-worker service (Dockerfile.worker)', startOffset: 7, endOffset: 7, depKeys: ['project'] },
      envWeb:    { name: 'Set env vars on office-web (all variables)', startOffset: 8, endOffset: 8, depKeys: ['webSvc'] },
      envWorker: { name: 'Set env vars on office-worker (all variables)', startOffset: 8, endOffset: 8, depKeys: ['workerSvc', 'note', 'creds'] },
      migrate:   { name: 'Add release command: npx prisma migrate deploy', startOffset: 8, endOffset: 8, depKeys: ['envWeb'] },
      deploy:    { name: 'Deploy both services + seed admin user', startOffset: 9, endOffset: 10, depKeys: ['envWeb', 'envWorker', 'migrate'] },
      verify:    { name: 'Verify: worker logs, pipeline trigger, posts, notifications, R2', startOffset: 10, endOffset: 11, depKeys: ['deploy'] },
    },
  },
]

async function main() {
  const existing = await prisma.project.findFirst({
    where: { name: 'Production Setup & Agent Architecture' },
  })
  if (existing) {
    console.log('Project already exists — skipping seed.')
    return
  }

  // Build task key → DB id map for dependencies
  const taskIdMap: Record<string, string> = {}

  const project = await prisma.project.create({
    data: {
      name: 'Production Setup & Agent Architecture',
      description: 'Deploy zimplixio-office to Railway, clean the agent architecture, and establish the infrastructure for the full agent ecosystem.',
      color: '#6366f1',
    },
  })
  console.log(`Created project: ${project.id}`)

  for (let phaseIdx = 0; phaseIdx < PHASES.length; phaseIdx++) {
    const phaseInput = PHASES[phaseIdx]
    const phase = await prisma.phase.create({
      data: { projectId: project.id, name: phaseInput.name, color: phaseInput.color, order: phaseIdx },
    })
    console.log(`  Phase ${phaseIdx + 1}: ${phase.name}`)

    let taskOrder = 0
    for (const [key, t] of Object.entries(phaseInput.tasks)) {
      const task = await prisma.task.create({
        data: {
          phaseId: phase.id,
          name: t.name,
          description: t.description,
          startDate: d(t.startOffset),
          endDate: d(t.endOffset),
          order: taskOrder++,
          status: 'TODO',
        },
      })
      taskIdMap[key] = task.id
      console.log(`    Task: ${task.name}`)
    }
  }

  // Wire up dependencies
  let depCount = 0
  for (const phase of PHASES) {
    for (const [key, t] of Object.entries(phase.tasks)) {
      if (!t.depKeys) continue
      for (const depKey of t.depKeys) {
        const dependentTaskId = taskIdMap[key]
        const requiredTaskId = taskIdMap[depKey]
        if (dependentTaskId && requiredTaskId) {
          await prisma.taskDependency.create({ data: { dependentTaskId, requiredTaskId } })
          depCount++
        }
      }
    }
  }

  console.log(`\nDone. Created ${Object.keys(taskIdMap).length} tasks + ${depCount} dependencies.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
