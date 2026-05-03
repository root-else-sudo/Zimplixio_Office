import { prisma } from './prisma'

export interface RateLimitOptions {
  // Unique scope, e.g. 'mfa.verify'. Combined with the actor key.
  scope: string
  // Per-actor identifier (typically userId).
  actor: string
  // Maximum allowed requests within the window.
  limit: number
  // Window length in milliseconds.
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

// Fixed-window rate limiter backed by Postgres.
// Sufficient for low-traffic admin endpoints. Replace with Redis/Upstash if
// per-request contention becomes an issue.
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { scope, actor, limit, windowMs } = opts
  const key = `${scope}:${actor}`
  const now = new Date()

  return prisma.$transaction(async (tx) => {
    const row = await tx.rateLimit.findUnique({ where: { key } })

    const expired =
      !row || now.getTime() - row.windowStart.getTime() >= windowMs

    if (expired) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      })
      return { allowed: true, remaining: limit - 1, retryAfterMs: 0 }
    }

    if (row!.count >= limit) {
      const elapsed = now.getTime() - row!.windowStart.getTime()
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, windowMs - elapsed),
      }
    }

    const updated = await tx.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    })
    return {
      allowed: true,
      remaining: Math.max(0, limit - updated.count),
      retryAfterMs: 0,
    }
  })
}
