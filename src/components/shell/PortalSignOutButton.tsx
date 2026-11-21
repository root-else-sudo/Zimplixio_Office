'use client'

import { signOutDeliberately } from '@/lib/sign-out'

export default function PortalSignOutButton() {
  return (
    <button type="button" className="btn-outline" onClick={() => void signOutDeliberately()}>
      Sign out
    </button>
  )
}
