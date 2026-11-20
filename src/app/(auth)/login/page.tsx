import type { Metadata } from 'next'
import { CALLBACK_PARAM, REASON_PARAM, REASON_SESSION_ENDED, safeCallbackUrl } from '@/lib/auth-redirect'
import LoginClient from './LoginClient'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return (
    <LoginClient
      returnTo={safeCallbackUrl(params[CALLBACK_PARAM]) ?? '/'}
      sessionEnded={params[REASON_PARAM] === REASON_SESSION_ENDED}
    />
  )
}
