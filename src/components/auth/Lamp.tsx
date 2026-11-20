'use client'

import { useState } from 'react'

/**
 * Floor lamp with a pull chain, drawn in SVG (viewBox 200×520). It's a real
 * <button>, so keyboard users can switch it on with Enter/Space.
 * Colors, the light cone and every animation are styled by class in
 * src/styles/auth.css — no colors are set here.
 */
export function Lamp({ lit, onPull }: { lit: boolean; onPull: () => void }) {
  const [tugging, setTugging] = useState(false)

  function handleClick() {
    setTugging(true) // replays the chain-tug animation; cleared when it ends
    onPull()
  }

  return (
    <button
      type="button"
      className="auth-lamp"
      onClick={handleClick}
      onAnimationEnd={(e) => {
        if (e.animationName === 'chain-tug') setTugging(false)
      }}
      aria-label={lit ? 'Turn off the lamp' : 'Turn on the lamp'}
      aria-pressed={lit}
      data-tug={tugging || undefined}
    >
      <svg viewBox="0 0 200 520" aria-hidden="true">
        <defs>
          <linearGradient id="lamp-cone-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="lamp-cone-stop-a" />
            <stop offset="0.55" className="lamp-cone-stop-b" />
            <stop offset="1" className="lamp-cone-stop-c" />
          </linearGradient>
          <radialGradient id="lamp-pool-gradient">
            <stop offset="0" className="lamp-pool-stop-a" />
            <stop offset="1" className="lamp-pool-stop-b" />
          </radialGradient>
          <filter id="lamp-soften" x="-50%" y="-20%" width="200%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id="lamp-glow" x="-100%" y="-300%" width="300%" height="700%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Light: cone from the shade down to a pool on the floor. */}
        <polygon className="lamp-cone" points="40,84 160,84 430,506 -230,506" filter="url(#lamp-soften)" />
        <ellipse className="lamp-pool" cx="100" cy="506" rx="270" ry="24" />

        {/* Body */}
        <rect className="lamp-pole" x="97.5" y="80" width="5" height="422" rx="2.5" />
        <rect className="lamp-base" x="46" y="498" width="108" height="12" rx="6" />
        <circle className="lamp-shade" cx="100" cy="16" r="4.5" />
        <path className="lamp-shade" d="M28,82 C28,40 60,20 100,20 C140,20 172,40 172,82 Z" />
        <path className="lamp-shade-rim" d="M28,82 L172,82" />
        <ellipse className="lamp-bulb" cx="100" cy="86" rx="30" ry="6" filter="url(#lamp-glow)" />

        {/* Pull chain — the thing you click. */}
        <g className="lamp-pull">
          <line className="lamp-chain" x1="148" y1="82" x2="148" y2="170" />
          <rect className="lamp-bead" x="143" y="170" width="10" height="17" rx="5" />
        </g>
      </svg>
    </button>
  )
}
