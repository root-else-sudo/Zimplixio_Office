import type { Metadata } from 'next'
import SetupMfaClient from './SetupMfaClient'

export const metadata: Metadata = { title: 'Set up two-step sign-in' }

export default function SetupMfaPage() {
  return <SetupMfaClient />
}
