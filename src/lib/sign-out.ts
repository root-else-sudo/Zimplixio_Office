'use client'

import { signOut } from 'next-auth/react'
import { clearSignedInMarker } from './auth-redirect'

/**
 * The one way to sign out deliberately. Clears the "was signed in" marker
 * first, so the next visit to /login doesn't claim the session expired.
 */
export async function signOutDeliberately() {
  clearSignedInMarker()
  await signOut({ callbackUrl: '/login' })
}
