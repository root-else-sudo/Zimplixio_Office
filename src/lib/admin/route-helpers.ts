import type { NextResponse } from 'next/server'
import { apiError, toApiError } from '@/lib/errors'
import { AdminNotFoundError, AdminRuleError } from '@/lib/admin/errors'

/** Maps the admin services' typed errors to API responses; anything else becomes a sanitized 500. */
export function adminErrorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof AdminRuleError) return apiError('VALIDATION_ERROR', err.message)
  if (err instanceof AdminNotFoundError) return apiError('NOT_FOUND', err.message)
  return toApiError(err, context)
}
