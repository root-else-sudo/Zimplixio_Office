import { signOut } from '@/lib/auth'
import { authUrl } from '@/lib/auth-redirect'

// Not wrapped in withAuth on purpose: it must work when the session is already
// invalid (that's exactly when guards send people here to clear the cookie).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const login = authUrl('/login', new URL(req.url).origin, { sessionEnded: true })
  // signOut clears the session cookie, then throws a redirect.
  await signOut({ redirectTo: login.pathname + login.search })
}
