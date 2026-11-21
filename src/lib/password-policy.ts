import { z } from 'zod'

export const PASSWORD_MIN = 12
// bcrypt only uses the first 72 bytes, so cap at 72 UTF-8 bytes.
export const PASSWORD_MAX_BYTES = 72

/** One rule set for the API and the client form. */
export function passwordSchema(email: string) {
  return z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
    .refine(
      (v) => new TextEncoder().encode(v).length <= PASSWORD_MAX_BYTES,
      `Password is too long (maximum ${PASSWORD_MAX_BYTES} bytes)`,
    )
    .refine((v) => v.toLowerCase() !== email.trim().toLowerCase(), 'Password must not be your email address')
}
