import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

const MARKETING_DIR = path.resolve(
  process.env.MARKETING_DIR ?? '/Users/josephugaldeberrocal/Documents/Zimplixio_Marketing'
)
const PYTHON = path.join(MARKETING_DIR, '.venv/bin/python3')

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const opportunities = await prisma.opportunity.findMany({
    orderBy: { generatedAt: 'desc' },
  })

  return NextResponse.json(opportunities)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Run the opportunities script
    await execAsync(
      `${PYTHON} ${path.join(MARKETING_DIR, 'execution/opportunities_find.py')}`,
      { cwd: MARKETING_DIR }
    )

    // Read and ingest the output
    const fs = await import('fs/promises')
    const outputPath = path.join(MARKETING_DIR, 'tmp/opportunities.json')
    const raw = JSON.parse(await fs.readFile(outputPath, 'utf-8'))

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
  } catch (err: any) {
    console.error('[opportunities] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
