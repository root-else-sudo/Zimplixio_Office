import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyDraftsReady } from '@/lib/notifications'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
import { withTransaction } from '@/lib/db/tx'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { readFile } from 'fs/promises'

const execAsync = promisify(exec)

function marketingDir(): string {
  if (!serverEnv.MARKETING_DIR) {
    throw new Error('MARKETING_DIR is not configured for this service')
  }
  return path.resolve(serverEnv.MARKETING_DIR)
}

// Pipeline script order is the single source of truth in pipeline.config.json.
// Never hardcode the list here — read it from the config so cron and dashboard stay in sync.
async function loadPipelineScripts(dir: string): Promise<string[]> {
  const config = JSON.parse(await readFile(path.join(dir, 'pipeline.config.json'), 'utf-8'))
  return config.scripts as string[]
}

export const POST = withAuth(
  async () => {
    let dir: string
    try {
      dir = marketingDir()
    } catch (err) {
      return toApiError(err, 'pipeline.start')
    }

    const agent = await prisma.agent.upsert({
      where: { name: 'LinkedIn Posts' },
      create: {
        name: 'LinkedIn Posts',
        description: 'Fetches newsletter emails and generates LinkedIn post drafts',
        cronSchedule: '0 13 * * 2,4,5',
        scriptPath: 'run_pipeline.sh',
      },
      update: {},
    })

    const run = await prisma.pipelineRun.create({
      data: { agentId: agent.id, status: 'RUNNING' },
    })

    runPipeline(run.id, dir).catch((err) =>
      logger.error({ err, runId: run.id }, 'pipeline crashed')
    )

    return NextResponse.json({ runId: run.id })
  },
  { role: 'ADMIN' }
)

async function runPipeline(runId: string, dir: string) {
  const python = path.join(dir, '.venv/bin/python3')
  const logs: string[] = []
  let failed = false

  let scripts: string[]
  try {
    scripts = await loadPipelineScripts(dir)
  } catch (err) {
    logger.error({ err, runId }, 'failed to load pipeline.config.json')
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        log: `[config] ERROR: ${(err as Error).message}`,
      },
    })
    return
  }

  for (const script of scripts) {
    try {
      const { stdout, stderr } = await execAsync(`${python} ${path.join(dir, script)}`, {
        cwd: dir,
      })
      logs.push(`[${script}]\n${stdout}${stderr}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logs.push(`[${script}] ERROR:\n${msg}`)
      failed = true
      break
    }
  }

  let postCount = 0
  let ingestFailed = false
  if (!failed) {
    try {
      const drafts: Array<Record<string, unknown>> = JSON.parse(
        await readFile(path.join(dir, 'tmp/posts_draft.json'), 'utf-8')
      )

      // Atomic ingest: all posts + the run status update commit together. A
      // partial failure rolls back so we never leave half-ingested drafts
      // attached to a SUCCESS run.
      postCount = await withTransaction(async (tx) => {
        for (const draft of drafts) {
          await tx.post.create({
            data: {
              runId,
              newsletter: (draft.newsletter as string) ?? '',
              sourceSubject: (draft.source_subject as string) ?? '',
              sourceDate: draft.source_date
                ? new Date(draft.source_date as string)
                : new Date(),
              content: (draft.post as string) ?? '',
              status: 'DRAFT',
            },
          })
        }
        await tx.pipelineRun.update({
          where: { id: runId },
          data: {
            status: 'SUCCESS',
            finishedAt: new Date(),
            log: logs.join('\n\n'),
          },
        })
        return drafts.length
      })
    } catch (err) {
      ingestFailed = true
      const msg = err instanceof Error ? err.message : String(err)
      logs.push(`[ingest] ERROR: ${msg}`)
      logger.error({ err, runId }, 'pipeline ingest failed')
    }
  }

  if (failed || ingestFailed) {
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        log: logs.join('\n\n'),
      },
    })
    return
  }

  // Notify only after the tx commits, so we never message about drafts that
  // rolled back.
  await notifyDraftsReady(postCount)
}
