'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lamp } from './Lamp'
import { Fireflies } from './Fireflies'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

/** How long the room stays dark on /login before the lamp lights itself. */
const AUTO_LIGHT_MS = 2000

type AuthSceneState = { lit: boolean; light: () => void }

const AuthSceneContext = createContext<AuthSceneState>({ lit: true, light: () => {} })

/** Lets an auth page know whether the lamp is on (e.g. to focus a field once the card appears). */
export function useAuthScene() {
  return useContext(AuthSceneContext)
}

/**
 * The shared "lamp room" behind every auth screen (login, verify-mfa,
 * setup-mfa). Mounted once by `src/app/(auth)/layout.tsx`, so moving between
 * those pages keeps the lamp lit instead of replaying the scene.
 *
 * - /login starts dark; the lamp lights on click/Enter or after AUTO_LIGHT_MS.
 * - The MFA pages start lit (the user already turned it on to get there).
 * - prefers-reduced-motion: starts lit, no ignition sequence.
 *
 * All visuals live in src/styles/auth.css; this component only sets
 * data attributes (data-lit, data-instant).
 */
export function AuthScene({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const startsDark = pathname === '/login'

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [switchedOn, setSwitchedOn] = useState(!startsDark)

  const lit = switchedOn || reducedMotion
  const instant = !startsDark || reducedMotion

  const light = useCallback(() => setSwitchedOn(true), [])

  useEffect(() => {
    if (lit) return
    const timer = window.setTimeout(() => setSwitchedOn(true), AUTO_LIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [lit])

  return (
    <AuthSceneContext.Provider value={{ lit, light }}>
      <div className="auth-scene" data-lit={lit} data-instant={instant || undefined}>
        <div className="auth-floor" aria-hidden="true" />
        <Fireflies />
        <div className="auth-stage">
          <div className="auth-lamp-area">
            <div className="auth-halo" aria-hidden="true" />
            <Lamp lit={lit} onPull={light} />
            <p className="auth-lamp-hint" aria-hidden="true">Pull the chain</p>
          </div>
          {/* Card stays out of the tab order and accessibility tree until the lamp is on. */}
          <main className="auth-card-area" inert={!lit} aria-hidden={!lit || undefined}>
            {children}
          </main>
        </div>
      </div>
    </AuthSceneContext.Provider>
  )
}
