/**
 * The Zimplixio logo mark. Single shared component — used by the sidebar and
 * the auth screens. Colors come from the `.brand-mark-*` classes in
 * globals.css (brand tokens), so there is no hex in this file.
 */
export function ZimplixioMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      overflow="visible"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle className="brand-mark-ring" cx="200" cy="200" r="160" strokeWidth="16" fill="none" />
      <path
        className="brand-mark-glyph"
        d="M 313,220 A 115,115 0 1,1 288,126 L 362,126 L 362,176 L 250,176 A 65,65 0 1,0 264,211 Z"
      />
      <polyline className="brand-mark-ring" points="183,183 168,200 183,217" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline className="brand-mark-ring" points="217,183 232,200 217,217" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
