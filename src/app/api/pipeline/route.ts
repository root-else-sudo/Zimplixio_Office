import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyDraftsReady } from '@/lib/notifications'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

const MARKETING_DIR = path.resolve(
  process.env.MARKETING_DIR ?? '/Users/josephugaldeberrocal/Documents/Zimplixio_Marketing'
)
const PYTHON = path.join(MARKETING_DIR, '.venv/bin/python3')

// Pipeline script order is the single source of truth in pipeline.config.json.
// Never hardcode the list here — read it from the config so cron and dashboard stay in sync.
function loadPipelineScripts(): string[] {
  const fsSync = require('fs')
  const configPath = path.join(MARKETING_DIR, 'pipeline.config.json')
  const config = JSON.parse(fsSync.readFileSync(configPath, 'utf-8'))
  return config.scripts as string[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find or create the LinkedIn Posts agent
  const agent = await prisma.agent.upsert({
    where: { name: 'LinkedIn Posts' },
    create: {
      name: 'LinkedIn Posts',
      description: 'Fetches newsletter emails and generates LinkedIn post drafts',
      cronSchedule: '0 13 * * 2,4,5',  // Tue/Thu/Fri at 1 PM — matches run_pipeline.sh
      scriptPath: 'run_pipeline.sh',
    },
    update: {},
  })

  const run = await prisma.pipelineRun.create({
    data: { agentId: agent.id, status: 'RUNNING' },
  })

  // Run pipeline in background — don't await
  runPipeline(run.id, agent.id).catch(console.error)

  return NextResponse.json({ runId: run.id })
}

async function runPipeline(runId: string, agentId: string) {
  const logs: string[] = []
  let failed = false
  const PIPELINE_SCRIPTS = loadPipelineScripts()

  for (const script of PIPELINE_SCRIPTS) {
    try {
      const { stdout, stderr } = await execAsync(
        `${PYTHON} ${path.join(MARKETING_DIR, script)}`,
        { cwd: MARKETING_DIR }
      )
      logs.push(`[${script}]\n${stdout}${stderr}`)
    } catch (err: any) {
      logs.push(`[${script}] ERROR:\n${err.message}`)
      failed = true
      break
    }
  }

  // Ingest generated posts from tmp/posts_draft.json into the DB
  let postCount = 0
  if (!failed) {
    try {
      const fs = await import('fs/promises')
      const draftsPath = path.join(MARKETING_DIR, 'tmp/posts_draft.json')
      const drafts = JSON.parse(await fs.readFile(draftsPath, 'utf-8'))

      for (const draft of drafts) {
        await prisma.post.create({
          data: {
            runId,
            newsletter: draft.newsletter ?? '',
            sourceSubject: draft.source_subject ?? '',
            sourceDate: draft.source_date ? new Date(draft.source_date) : new Date(),
            content: draft.post ?? '',
            status: 'DRAFT',
          },
        })
        postCount++
      }
    } catch (e: any) {
      logs.push(`[ingest] ERROR: ${e.message}`)
    }
  }

  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: failed ? 'FAILED' : 'SUCCESS',
      finishedAt: new Date(),
      log: logs.join('\n\n'),
    },
  })

  await notifyDraftsReady(postCount)
}
