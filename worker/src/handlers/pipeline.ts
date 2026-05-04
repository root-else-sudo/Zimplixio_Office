import path from 'path'
import { readFile } from 'fs/promises'
import { execa } from 'execa'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { notifyDraftsReady, notifyPipelineFailed } from '@/lib/notifications'
import type { PipelineRunPayload } from '@/lib/pgboss'

const STEP_TIMEOUT_MS = 5 * 60 * 1000

// Single source of truth for the on-disk drafts file. Validating closes the
// silent-success bug: a malformed JSON used to mark the run SUCCESS with 0
// posts ingested.
const DraftSchema = z.object({
  newsletter: z.string().optional().default(''),
  source_subject: z.string().optional().default(''),
  source_date: z.string().optional(),
  post: z.string().min(1),
})
const DraftsSchema = z.array(DraftSchema)

interface PipelineConfig {
  scripts: string[]
}

function marketingDir(): string {
  if (!serverEnv.MARKETING_DIR) {
    throw new Error('MARKETING_DIR is required for the pipeline worker')
  }
  return path.resolve(serverEnv.MARKETING_DIR)
}

async function logEvent(
  runId: string,
  stepName: string,
  eventType: 'started' | 'stdout' | 'stderr' | 'finished' | 'failed',
  payload: Record<string, unknown> = {}
) {
  try {
    await prisma.pipelineEvent.create({
      data: { runId, stepName, eventType, payload: payload as object },
    })
  } catch (err) {
    logger.error({ err, runId, stepName, eventType }, 'failed to write pipeline event')
  }
}

// Notification call that never throws — a Twilio/push outage shouldn't crash
// the worker handler we're trying to finalise.
async function safeNotifyFailed(runId: string, summary: string) {
  try {
    await notifyPipelineFailed(runId, summary)
  } catch (err) {
    logger.error({ err, runId }, 'pipeline-failed notification dispatch failed')
  }
}

export async function handlePipelineRun(payload: PipelineRunPayload): Promise<void> {
  const { runId } = payload
  const log = logger.child({ runId, job: 'pipeline.run' })

  let dir: string
  try {
    dir = marketingDir()
  } catch (err) {
    const msg = (err as Error).message
    log.error({ err }, 'pipeline aborted: MARKETING_DIR not set')
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: 'FAILED', finishedAt: new Date() },
    })
    await logEvent(runId, 'config', 'failed', { error: msg })
    await safeNotifyFailed(runId, msg)
    return
  }

  const python = path.join(dir, '.venv/bin/python3')

  let scripts: string[]
  try {
    const config: PipelineConfig = JSON.parse(
      await readFile(path.join(dir, 'pipeline.config.json'), 'utf-8')
    )
    scripts = config.scripts
  } catch (err) {
    const msg = (err as Error).message
    log.error({ err }, 'failed to load pipeline.config.json')
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: 'FAILED', finishedAt: new Date() },
    })
    await logEvent(runId, 'config', 'failed', { error: msg })
    await safeNotifyFailed(runId, msg)
    return
  }

  await logEvent(runId, 'pipeline', 'started', { scripts })

  let failed = false
  let failedStep: string | null = null
  let failureMessage: string | null = null

  for (const script of scripts) {
    await logEvent(runId, script, 'started')
    try {
      const proc = execa(python, [path.join(dir, script)], {
        cwd: dir,
        timeout: STEP_TIMEOUT_MS,
        all: true,
      })

      // Stream stdout/stderr lines into events so the dashboard sees progress.
      proc.stdout?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trimEnd()
        if (line) void logEvent(runId, script, 'stdout', { line })
      })
      proc.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trimEnd()
        if (line) void logEvent(runId, script, 'stderr', { line })
      })

      const result = await proc
      await logEvent(runId, script, 'finished', { exitCode: result.exitCode ?? 0 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error({ err, script }, 'pipeline step failed')
      await logEvent(runId, script, 'failed', { error: msg })
      failed = true
      failedStep = script
      failureMessage = msg
      break
    }
  }

  if (failed) {
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: 'FAILED', finishedAt: new Date() },
    })
    await logEvent(runId, 'pipeline', 'failed', {
      step: failedStep,
      error: failureMessage,
    })
    await safeNotifyFailed(runId, `Step ${failedStep}: ${failureMessage}`)
    return
  }

  // Ingest drafts. Schema-validate before touching the DB — a malformed file
  // now produces FAILED, not silent SUCCESS.
  let postCount = 0
  try {
    const raw = JSON.parse(
      await readFile(path.join(dir, 'tmp/posts_draft.json'), 'utf-8')
    )
    const drafts = DraftsSchema.parse(raw)

    postCount = await prisma.$transaction(async (tx) => {
      for (const draft of drafts) {
        const post = await tx.post.create({
          data: {
            runId,
            newsletter: draft.newsletter,
            sourceSubject: draft.source_subject,
            sourceDate: draft.source_date ? new Date(draft.source_date) : new Date(),
            content: draft.post,
            status: 'DRAFT',
          },
        })
        // Audit: snapshot the original generated content as v1.
        await tx.postVersion.create({
          data: {
            postId: post.id,
            version: 1,
            content: draft.post,
            source: 'ORIGINAL',
          },
        })
      }
      await tx.pipelineRun.update({
        where: { id: runId },
        data: { status: 'SUCCESS', finishedAt: new Date() },
      })
      return drafts.length
    })

    await logEvent(runId, 'ingest', 'finished', { postCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err }, 'pipeline ingest failed')
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: 'FAILED', finishedAt: new Date() },
    })
    await logEvent(runId, 'ingest', 'failed', { error: msg })
    await safeNotifyFailed(runId, `Ingest: ${msg}`)
    return
  }

  await logEvent(runId, 'pipeline', 'finished', { postCount })
  await notifyDraftsReady(postCount)
}
