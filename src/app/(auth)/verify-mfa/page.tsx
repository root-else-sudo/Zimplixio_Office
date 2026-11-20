import type { Metadata } from 'next'
import { CALLBACK_PARAM, safeCallbackUrl } from '@/lib/auth-redirect'
import VerifyMfaClient from './VerifyMfaClient'

export const metadata: Metadata = { title: 'Verify it’s you' }

export default async function VerifyMfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return <VerifyMfaClient returnTo={safeCallbackUrl(params[CALLBACK_PARAM]) ?? '/'} />
}
