import { DepartmentKey } from '@prisma/client'

// URL slugs are kebab-case (product-research); DepartmentKey enum values are
// SCREAMING_SNAKE (PRODUCT_RESEARCH). One conversion, reused everywhere a
// department shows up in a route.
export function departmentSlug(key: DepartmentKey): string {
  return key.toLowerCase().replace(/_/g, '-')
}

export function departmentKeyFromSlug(slug: string): DepartmentKey | null {
  const key = slug.toUpperCase().replace(/-/g, '_')
  return (Object.values(DepartmentKey) as string[]).includes(key)
    ? (key as DepartmentKey)
    : null
}
