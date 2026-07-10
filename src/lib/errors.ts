import { NextResponse } from 'next/server'
import { logger } from './logger'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INVALID_JSON: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

export function apiError(code: ApiErrorCode, message?: string): NextResponse {
  return NextResponse.json(
    { error: message ?? code, code },
    { status: STATUS_BY_CODE[code] }
  )
}

// Maps an unknown thrown value to a sanitized 500 response.
// Logs the original error for debugging; never leaks internals to the client.
export function toApiError(err: unknown, context?: string): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status }
    )
  }

  logger.error({ err, context }, 'unhandled API error')
  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  )
}
