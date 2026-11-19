'use client'

import { useSyncExternalStore } from 'react'

/**
 * Live match state of a CSS media query. Returns `serverValue` during SSR
 * and hydration, then the real value — without a setState-in-effect.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  )
}

const noopSubscribe = () => () => {}

/** True only on the client after hydration — for markup that must not be server-rendered (e.g. random values). */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}
