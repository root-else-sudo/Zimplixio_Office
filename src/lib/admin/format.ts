const FMT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

/** Deterministic (UTC) so server and client renders match. */
export function formatDateTime(iso: string | Date): string {
  return `${FMT.format(new Date(iso))} UTC`
}
