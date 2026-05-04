import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/rbac'
import { parseJson, z } from '@/lib/validate'
import { apiError, toApiError } from '@/lib/errors'
import { enqueueLinkedInPublish } from '@/lib/jobs'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'

const PatchSchema = z
  .object({
    status: z.enum(['DRAFT', 'APPROVED', 'REJECTED', 'PUBLISHED']).optional(),
    content: z.string().min(1).max(10_000).optional(),
    rejectionReason: z.string().max(2_000).optional(),
    // Optional source override when an EDIT is the result of accepting a
    // regenerated candidate; the client can pass `source: 'REGENERATED'` and
    // matching feedback so the version row reflects the provenance.
    source: z.enum(['EDITED', 'REGENERATED']).optional(),
    feedback: z.unknown().optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.content !== undefined,
    { message: 'At least one of status or content is required' }
  )

export const PATCH = withAuth<{ id: string }>(
  async (req: NextRequest, { params }, session) => {
    const parsed = await parseJson(req, PatchSchema)
    if (parsed instanceof NextResponse) return parsed
    const { status, content, rejectionReason, source, feedback } = parsed.data

    const { id } = await params

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.post.findUnique({ where: { id } })
        if (!existing) return { kind: 'not-found' as const }

        const data: Record<string, unknown> = {}

        if (content !== undefined && content !== existing.content) {
          data.content = content
          // Append a version row for the new content — UNLESS the new content
          // is identical to the latest version we already recorded (typically
          // the case when the reviewer accepts a REGENERATED candidate as-is:
          // /regenerate already wrote that version row, so we'd otherwise
          // duplicate it).
          const latest = await tx.postVersion.findFirst({
            where: { postId: id },
            orderBy: { version: 'desc' },
            select: { version: true, content: true },
          })
          if (!latest || latest.content !== content) {
            await tx.postVersion.create({
              data: {
                postId: id,
                version: (latest?.version ?? 0) + 1,
                content,
                source: source ?? 'EDITED',
                createdBy: session.user.id,
                feedback:
                  feedback === undefined || feedback === null
                    ? Prisma.JsonNull
                    : (feedback as Prisma.InputJsonValue),
              },
            })
          }
        }

        if (status !== undefined && status !== existing.status) {
          data.status = status
          if (status === 'APPROVED') {
            data.approvedById = session.user.id
            data.approvedAt = new Date()
            // Clear any stale rejection metadata so the audit row reflects the
            // current decision.
            data.rejectedById = null
            data.rejectedAt = null
            data.rejectionReason = null
          } else if (status === 'REJECTED') {
            data.rejectedById = session.user.id
            data.rejectedAt = new Date()
            data.rejectionReason = rejectionReason ?? null
          }
        }

        const post =
          Object.keys(data).length > 0
            ? await tx.post.update({ where: { id }, data })
            : existing

        // If APPROVED status is being set right now, create the outbox row
        // inside the same transaction so an enqueue-time crash can't leave us
        // with a "live" approval and no follow-up job.
        let webhookId: string | null = null
        const becameApproved = status === 'APPROVED' && existing.status !== 'APPROVED'
        if (becameApproved) {
          const wh = await tx.webhook.create({
            data: {
              kind: 'LINKEDIN_PUBLISH',
              postId: id,
              payload: { postId: id, content: post.content },
              status: 'PENDING',
            },
          })
          webhookId = wh.id
        }

        return { kind: 'ok' as const, post, webhookId }
      })

      if (result.kind === 'not-found') return apiError('NOT_FOUND', 'Post not found')

      // Enqueue after the tx commits so we never enqueue a job whose Webhook
      // row was rolled back.
      if (result.webhookId) {
        try {
          await enqueueLinkedInPublish({ webhookId: result.webhookId })
        } catch (err) {
          // Mark the row so the operator can see it stalled at enqueue time.
          // A future cron sweep could re-enqueue PENDING rows older than N
          // minutes; for now this surfaces the failure.
          logger.error(
            { err, webhookId: result.webhookId, postId: id },
            'failed to enqueue linkedin.publish'
          )
          await prisma.webhook.update({
            where: { id: result.webhookId },
            data: { lastError: 'enqueue failed: ' + (err as Error).message },
          })
        }
      }

      return NextResponse.json(result.post)
    } catch (err) {
      return toApiError(err, 'posts.patch')
    }
  },
  { role: 'ADMIN' }
)

export const DELETE = withAuth<{ id: string }>(
  async (_req, { params }) => {
    const { id } = await params
    try {
      await prisma.post.delete({ where: { id } })
      return NextResponse.json({ ok: true })
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        return apiError('NOT_FOUND', 'Post not found')
      }
      return toApiError(err, 'posts.delete')
    }
  },
  { role: 'ADMIN' }
)
