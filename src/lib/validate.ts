import { NextRequest, NextResponse } from 'next/server'
import { z, ZodSchema } from 'zod'

export type ParsedBody<T> = { data: T } | NextResponse

export async function parseJson<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<ParsedBody<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    )
  }

  return { data: result.data }
}

export { z }
