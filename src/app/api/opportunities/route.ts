import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serverEnv } from '@/lib/env'
import { withAuth } from '@/lib/rbac'
import { toApiError } from '@/lib/errors'
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

export const GET = withAuth(async () => {
  const opportunities = await prisma.opportunity.findMany({
    orderBy: { generatedAt: 'desc' },
  })
  return NextResponse.json(opportunities)
})

export const POST = withAuth(
  async () => {
    try {
      const dir = marketingDir()
      const python = path.join(dir, '.venv/bin/python3')

      await execAsync(`${python} ${path.join(dir, 'execution/opportunities_find.py')}`, {
        cwd: dir,
      })

      const raw = JSON.parse(
        await readFile(path.join(dir, 'tmp/opportunities.json'), 'utf-8')
      )

      const created = []
      for (const opp of raw) {
        const record = await prisma.opportunity.create({
          data: {
            title: opp.title ?? 'Untitled',
            sector: opp.sector ?? '',
            signal: opp.signal ?? '',
            zimplixioAngle: opp.zimplixio_angle ?? '',
            actions: opp.actions ?? [],
          },
        })
        created.push(record)
      }

      return NextResponse.json({ count: created.length, opportunities: created })
    } catch (err) {
      return toApiError(err, 'opportunities.find')
    }
  },
  { role: 'ADMIN' }
)
