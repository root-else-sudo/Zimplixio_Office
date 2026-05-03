import path from 'path'
import { readFile } from 'fs/promises'
import { execa } from 'execa'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { OpportunitiesFindPayload } from '@/lib/pgboss'

const STEP_TIMEOUT_MS = 5 * 60 * 1000

const OpportunitySchema = z.object({
  title: z.string().optional().default('Untitled'),
  sector: z.string().optional().default(''),
  signal: z.string().optional().default(''),
  zimplixio_angle: z.string().optional().default(''),
  actions: z.unknown().optional().default([]),
})
const OpportunitiesSchema = z.array(OpportunitySchema)

function marketingDir(): string {
  if (!serverEnv.MARKETING_DIR) {
    throw new Error('MARKETING_DIR is required for the opportunities worker')
  }
  return path.resolve(serverEnv.MARKETING_DIR)
}

export async function handleOpportunitiesFind(
  payload: OpportunitiesFindPayload
): Promise<void> {
  const log = logger.child({ job: 'opportunities.find', triggeredBy: payload.triggeredByUserId })

  let dir: string
  try {
    dir = marketingDir()
  } catch (err) {
    log.error({ err }, 'opportunities aborted: MARKETING_DIR not set')
    throw err
  }

  const python = path.join(dir, '.venv/bin/python3')
  const script = path.join(dir, 'execution/opportunities_find.py')

  try {
    await execa(python, [script], { cwd: dir, timeout: STEP_TIMEOUT_MS })
  } catch (err) {
    log.error({ err }, 'opportunities script failed')
    throw err
  }

  let raw: unknown
  try {
    raw = JSON.parse(await readFile(path.join(dir, 'tmp/opportunities.json'), 'utf-8'))
  } catch (err) {
    log.error({ err }, 'failed to read tmp/opportunities.json')
    throw err
  }

  const parsed = OpportunitiesSchema.safeParse(raw)
  if (!parsed.success) {
    log.error({ issues: parsed.error.issues }, 'opportunities.json failed schema')
    throw new Error('opportunities.json failed schema validation')
  }

  await prisma.$transaction(async (tx) => {
    for (const opp of parsed.data) {
      await tx.opportunity.create({
        data: {
          title: opp.title,
          sector: opp.sector,
          signal: opp.signal,
          zimplixioAngle: opp.zimplixio_angle,
          actions: (opp.actions ?? []) as object,
        },
      })
    }
  })

  log.info({ count: parsed.data.length }, 'opportunities ingested')
}
