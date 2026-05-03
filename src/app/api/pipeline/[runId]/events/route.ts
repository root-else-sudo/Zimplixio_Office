import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Force the Node runtime so we can keep a long-lived ReadableStream open. The
// edge runtime aggressively closes idle connections; SSE needs Node.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLL_INTERVAL_MS = 1_500
const HEARTBEAT_INTERVAL_MS = 25_000
const MAX_DURATION_MS = 30 * 60 * 1000

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { runId } = await params
  const exists = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true },
  })
  if (!exists) {
    return new Response('Not found', { status: 404 })
  }

  const encoder = new TextEncoder()
  let lastEventCreatedAt: Date | null = null
  let lastStatus: string | null = null
  const startedAt = Date.now()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Heartbeat keeps Railway/CloudFront proxies from killing the connection
      // during quiet periods. Lines starting with `:` are SSE comments.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':keepalive\n\n'))
        } catch {
          // Connection already closed
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Poll for new events. Postgres LISTEN/NOTIFY would be tighter but adds
      // complexity; 1.5s polling on a runId-scoped index is fine for our
      // volume.
      const poll = async () => {
        try {
          if (Date.now() - startedAt > MAX_DURATION_MS) {
            controller.enqueue(encoder.encode('event: timeout\ndata: {}\n\n'))
            controller.close()
            return
          }

          const events = await prisma.pipelineEvent.findMany({
            where: {
              runId,
              ...(lastEventCreatedAt ? { createdAt: { gt: lastEventCreatedAt } } : {}),
            },
            orderBy: { createdAt: 'asc' },
            take: 200,
          })

          for (const e of events) {
            const data = JSON.stringify({
              id: e.id,
              stepName: e.stepName,
              eventType: e.eventType,
              payload: e.payload,
              createdAt: e.createdAt.toISOString(),
            })
            controller.enqueue(encoder.encode(`event: pipeline-event\ndata: ${data}\n\n`))
            lastEventCreatedAt = e.createdAt
          }

          // Watch for terminal status — close the stream so the client knows
          // it's done.
          const run = await prisma.pipelineRun.findUnique({
            where: { id: runId },
            select: { status: true },
          })
          if (run && run.status !== lastStatus) {
            const data = JSON.stringify({ status: run.status })
            controller.enqueue(encoder.encode(`event: status\ndata: ${data}\n\n`))
            lastStatus = run.status
          }
          if (run && (run.status === 'SUCCESS' || run.status === 'FAILED')) {
            // One more drain to catch any events written after the status flip.
            await new Promise((r) => setTimeout(r, 200))
            controller.close()
            return
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`
            )
          )
        }
      }

      const pollInterval = setInterval(() => void poll(), POLL_INTERVAL_MS)
      void poll()

      const cleanup = () => {
        clearInterval(heartbeat)
        clearInterval(pollInterval)
      }

      req.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed
        }
      })

      // Override controller.close to also tear down timers when the stream
      // closes from the inside.
      const originalClose = controller.close.bind(controller)
      controller.close = () => {
        cleanup()
        originalClose()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
