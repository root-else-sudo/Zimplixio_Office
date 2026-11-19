import { AuthScene } from '@/components/auth/AuthScene'

/**
 * Shared shell for /login, /verify-mfa and /setup-mfa: the lamp-room scene
 * stays mounted while moving between them, so only the card changes.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthScene>{children}</AuthScene>
}
