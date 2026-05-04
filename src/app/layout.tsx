import type { Metadata } from 'next'
import { Poppins, DM_Sans } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-poppins',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-dm-sans',
})

export const metadata: Metadata = {
  title: 'Zimplixio Office',
  description: 'Business operations dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${dmSans.variable} h-full`}>
      <body className="h-full">
        {/* SessionProvider lives at the root so useSession().update() works on
            auth pages (verify-mfa, setup-mfa) — not just under (dashboard). */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
