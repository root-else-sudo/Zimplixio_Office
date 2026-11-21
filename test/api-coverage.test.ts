import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const API_ROOT = path.resolve(__dirname, '../src/app/api')
const EXEMPT = ['auth', path.join('session', 'end')]
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Returns the exported HTTP methods that are not declared as `export const X = withAuth`, or ['(none)'] if none are exported. */
export function findUnwrappedHandlers(source: string): string[] {
  const src = stripComments(source)
  const bad = new Set<string>()
  const exported = new Set<string>()
  for (const m of METHODS) {
    if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(src)) { bad.add(m); exported.add(m) }
    if (new RegExp(`export\\s*\\{[^}]*\\bas\\s+${m}\\b[^}]*\\}`).test(src)) { bad.add(m); exported.add(m) }
    if (new RegExp(`export\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`).test(src)) { bad.add(m); exported.add(m) }
    if (new RegExp(`export\\s+const\\s+${m}\\b`).test(src)) {
      exported.add(m)
      if (!new RegExp(`export\\s+const\\s+${m}\\s*=\\s*withAuth\\s*[<(]`).test(src)) bad.add(m)
    }
  }
  if (exported.size === 0) return ['(none)']
  return [...bad]
}

function routes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? routes(p) : e.name === 'route.ts' ? [p] : []
  })
}

function offenders(): string[] {
  return routes(API_ROOT)
    .map((f) => path.relative(API_ROOT, f))
    .filter((rel) => !EXEMPT.some((x) => rel === x || rel.startsWith(x + path.sep)))
    .flatMap((rel) =>
      findUnwrappedHandlers(fs.readFileSync(path.join(API_ROOT, rel), 'utf8')).map((m) => `${rel}: ${m}`),
    )
}

describe('findUnwrappedHandlers', () => {
  it('flags an unwrapped function next to a wrapped GET', () =>
    expect(findUnwrappedHandlers(
      'export const GET = withAuth(async () => x)\nexport async function DELETE() {}',
    )).toEqual(['DELETE']))
  it('ignores withAuth in comments', () =>
    expect(findUnwrappedHandlers(
      '// withAuth(\n/* export const GET = withAuth( */\nexport const GET = async () => x',
    )).toEqual(['GET']))
  it('passes when all wrapped (generic allowed)', () =>
    expect(findUnwrappedHandlers(
      'export const GET = withAuth(a)\nexport const PATCH = withAuth<{ id: string }>(b)',
    )).toEqual([]))
  it('flags re-export aliases and files with no methods', () => {
    expect(findUnwrappedHandlers('const h = withAuth(a)\nexport { h as POST }')).toEqual(['POST'])
    expect(findUnwrappedHandlers('export const x = 1')).toEqual(['(none)'])
  })
})

describe('API coverage', () => {
  it('every exported HTTP method of every API route is wrapped in withAuth', () => expect(offenders()).toEqual([]))
})
