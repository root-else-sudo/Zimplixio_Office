import ProductResearchTabs from '@/components/departments/ProductResearchTabs'

// Static route — resolved by Next.js before the sibling [key] dynamic segment.
// Only Product/Research has department-specific artifacts (Company Profile,
// Findings) so far; other departments stay on the generic [key] route until
// they earn their own specific tree like this one.
export const dynamic = 'force-dynamic'

export default function ProductResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <ProductResearchTabs />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
