'use client'

import { useLinkStatus } from 'next/link'

/**
 * Inline "this page is on its way" cue for a `<Link>`. Render it INSIDE the
 * Link. Uses Next's `useLinkStatus`, which reports pending while a click waits
 * on a dynamic route that has no `loading.tsx`.
 *
 * Why not route skeletons: our pages render fresh per request and answer in
 * ~100–150 ms; a `loading.tsx` skeleton forces React's ≥300 ms fallback
 * minimum (FALLBACK_THROTTLE_MS), making content arrive later and flash. This
 * cue adds no Suspense boundary, so content shows as soon as it's ready.
 *
 * The cue only becomes visible after ~100 ms (CSS transition-delay), so fast
 * navigations show nothing extra. Styling: `.link-pending*` in src/styles/app.css.
 */
export function LinkPendingHint({ variant = 'dot' }: { variant?: 'dot' | 'underline' }) {
  const { pending } = useLinkStatus()
  const base = variant === 'underline' ? 'link-pending-underline' : 'link-pending-dot'
  return <span aria-hidden="true" className={pending ? `${base} is-pending` : base} />
}
