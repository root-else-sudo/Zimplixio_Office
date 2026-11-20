'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lamp } from './Lamp'
import { Fireflies } from './Fireflies'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

/** How long the room stays dark on /login before the lamp lights itself (once). */
const AUTO_LIGHT_MS = 10_000

/**
 * 'auto' = nobody has touched the chain yet (lamp follows the page default
 * and the one-time auto-light timer); 'on'/'off' = the user's explicit choice,
 * which always wins — a lamp switched off on purpose never relights itself.
 */
type LampSwitch = 'auto' | 'on' | 'off'

type AuthSceneState = { lit: boolean; toggle: () => void }

const AuthSceneContext = createContext<AuthSceneState>({ lit: true, toggle: () => {} })

/** Lets an auth page know whether the lamp is on (e.g. to focus a field once the card appears). */
export function useAuthScene() {
  return useContext(AuthSceneContext)
}

/**
 * The shared "lamp room" behind every auth screen (login, verify-mfa,
 * setup-mfa). Mounted once by `src/app/(auth)/layout.tsx`, so moving between
 * those pages keeps the lamp lit instead of replaying the scene.
 *
 * - /login starts dark; the lamp lights when the chain is pulled (click or
 *   Enter/Space), or by itself once after AUTO_LIGHT_MS if nobody pulls it.
 * - Pulling the chain again switches it off: the card hides (typed values are
 *   kept) until it's pulled back on.
 * - The MFA pages start lit (the user already turned it on to get there).
 * - prefers-reduced-motion: starts lit, no ignition sequence; the chain still toggles.
 *
 * All visuals live in src/styles/auth.css; this component only sets
 * data attributes (data-lit, data-switch, data-instant).
 */
export function AuthScene({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const startsDark = pathname === '/login'

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [lampSwitch, setLampSwitch] = useState<LampSwitch>('auto')
  const [autoLit, setAutoLit] = useState(false)

  const lit =
    lampSwitch === 'on' || (lampSwitch === 'auto' && (!startsDark || reducedMotion || autoLit))
  const instant = !startsDark || reducedMotion

  const toggle = useCallback(() => setLampSwitch(lit ? 'off' : 'on'), [lit])

  // One-time auto-light, only while nobody has touched the chain.
  useEffect(() => {
    if (lampSwitch !== 'auto' || lit) return
    const timer = window.setTimeout(() => setAutoLit(true), AUTO_LIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [lampSwitch, lit])

  return (
    <AuthSceneContext.Provider value={{ lit, toggle }}>
      <div
        className="auth-scene"
        data-lit={lit}
        data-switch={lampSwitch}
        data-instant={instant || undefined}
      >
        <div className="auth-floor" aria-hidden="true" />
        <Fireflies />
        <div className="auth-stage">
          <div className="auth-lamp-area">
            <div className="auth-halo" aria-hidden="true" />
            <Lamp lit={lit} onPull={toggle} />
            <p className="auth-lamp-hint" aria-hidden="true">Pull the chain</p>
          </div>
          {/* Card stays out of the tab order and accessibility tree while the lamp is off. */}
          <main className="auth-card-area" inert={!lit} aria-hidden={!lit || undefined}>
            {children}
          </main>
        </div>
      </div>
    </AuthSceneContext.Provider>
  )
}
