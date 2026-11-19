'use client'

import { useState } from 'react'
import { useIsClient } from '@/lib/hooks/useMediaQuery'

const COUNT = 18

type Firefly = { id: number; vars: React.CSSProperties }

const random = (min: number, max: number) => Math.random() * (max - min) + min

/**
 * Glowing dots drifting through the room. Each dot gets random per-element
 * values (size, speed, five waypoints) passed as CSS custom properties —
 * the only inline values in the auth screens, because they're per-instance
 * random data. The animation itself (`firefly-drift`, `firefly-twinkle`)
 * lives in src/styles/auth.css.
 *
 * Rendered only on the client, so server and client markup never disagree
 * about random values.
 */
function makeFireflies(): Firefly[] {
  return Array.from({ length: COUNT }, (_, id) => {
    const vars: Record<string, string> = {
      '--size': `${random(3, 7).toFixed(1)}px`,
      '--duration': `${random(35, 65).toFixed(1)}s`,
      '--delay': `-${random(0, 30).toFixed(1)}s`, // negative = already mid-flight on load
      '--twinkle': `${random(2.5, 5).toFixed(1)}s`,
    }
    for (let n = 1; n <= 5; n++) {
      vars[`--x${n}`] = `${random(0, 100).toFixed(1)}vw`
      vars[`--y${n}`] = `${random(0, 100).toFixed(1)}vh`
    }
    return { id, vars: vars as React.CSSProperties }
  })
}

export function Fireflies() {
  const isClient = useIsClient()
  const [flies] = useState(makeFireflies)

  return (
    <div className="auth-fireflies" aria-hidden="true">
      {isClient && flies.map((f) => (
        <span key={f.id} className="firefly" style={f.vars} />
      ))}
    </div>
  )
}
