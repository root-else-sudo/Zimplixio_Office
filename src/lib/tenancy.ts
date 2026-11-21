import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ActiveSession } from '@/lib/session-guard'
import type { AccountKind } from '@/lib/accounts'

/** Models whose rows belong to exactly one company. Projects will be the first entry. */
export const TENANT_OWNED_MODELS = [] as const satisfies readonly Prisma.ModelName[]

export type TenantContext = {
  userId: string
  companyId: string
  accountKind: AccountKind
  isPlatformAdmin: boolean
}

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantScopeError'
  }
}

export function getTenantContext(active: ActiveSession): TenantContext {
  return {
    userId: active.userId,
    companyId: active.companyId,
    accountKind: active.accountKind,
    isPlatformAdmin: active.isPlatformAdmin,
  }
}

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

const WHERE_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany',
])

/** Restrict `where` to the company; never widen a caller-supplied filter. */
function scopeWhere(where: unknown, companyId: string): Rec {
  if (!isRec(where)) return { companyId }
  if (!('companyId' in where) || where.companyId === undefined) return { ...where, companyId }
  // Keep unique keys top-level; AND the company in so a foreign filter can only narrow to nothing.
  const existing = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND]
  return { ...where, AND: [...existing, { companyId }] }
}

const RELATION_FIELDS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.flatMap((m) => m.fields.filter((f) => f.kind === 'object').map((f) => f.name)),
)

/** Reject relation paths in filters/ordering (they form a read oracle across tenants). */
function assertNoRelationKeys(node: unknown, where: string): void {
  if (Array.isArray(node)) return node.forEach((n) => assertNoRelationKeys(n, where))
  if (!isRec(node)) return
  for (const [k, v] of Object.entries(node)) {
    if (RELATION_FIELDS.has(k)) throw new TenantScopeError(`Relation paths in ${where} are not allowed on tenant-scoped models`)
    if (k === 'AND' || k === 'OR' || k === 'NOT') assertNoRelationKeys(v, where)
  }
}

/** Reject nested reads/writes through relations: extensions never see them. */
function assertNoRelations(args: Rec, allowCompanyOnData: boolean): void {
  assertNoRelationKeys(args.where, 'where')
  assertNoRelationKeys(args.orderBy, 'orderBy')
  // Prisma resolves the cursor row in a subquery that ignores the scoped `where`, leaking foreign row ids.
  if (args.cursor !== undefined) throw new TenantScopeError('cursor is not allowed on tenant-scoped models')
  if (args.include !== undefined) throw new TenantScopeError('include is not allowed on tenant-scoped models')
  if (isRec(args.select)) {
    for (const k of Object.keys(args.select)) {
      if (k === '_count' || RELATION_FIELDS.has(k)) {
        throw new TenantScopeError('Relation select is not allowed on tenant-scoped models')
      }
    }
  }
  const check = (data: unknown) => {
    if (!isRec(data)) return
    for (const k of Object.keys(data)) {
      if (RELATION_FIELDS.has(k) && !(allowCompanyOnData && k === 'company')) {
        throw new TenantScopeError('Nested relation writes are not allowed on tenant-scoped models')
      }
    }
  }
  for (const key of ['data', 'create', 'update'] as const) {
    const d = args[key]
    if (Array.isArray(d)) d.forEach(check)
    else check(d)
  }
}

/** Force `companyId` onto a create payload; reject any attempt to target another company. */
function scopeData(data: unknown, companyId: string): Rec {
  if (!isRec(data)) throw new TenantScopeError('Invalid create payload for tenant-scoped model')
  const { company, ...rest } = data
  if ('companyId' in rest && rest.companyId !== undefined && rest.companyId !== companyId) {
    throw new TenantScopeError('Cannot write to another company')
  }
  if (company !== undefined) {
    const connectId =
      isRec(company) && isRec(company.connect) ? company.connect.id : undefined
    if (connectId !== companyId) throw new TenantScopeError('Cannot write to another company')
  }
  return { ...rest, companyId }
}

/**
 * Test/internal building block. App code MUST use `tenantDb`, which exposes only the
 * tenant-owned delegates. NOTE: raw queries ($queryRaw, $executeRaw, ...) are NOT
 * covered by scopedClient, nor are nested relation operations beyond what is rejected here.
 */
export function scopedClient<C extends PrismaClient>(
  client: C,
  companyId: string,
  models: readonly string[],
) {
  if (!companyId) throw new TenantScopeError('companyId is required')
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!models.includes(model)) return query(args)
          const a: Rec = isRec(args) ? { ...args } : {}

          const isCreateLike = operation === 'create' || operation === 'upsert'
          // allowCompanyOnData=true lets create/upsert.create carry a `company` connect, which scopeData
          // validates. upsert.update's company/companyId is blocked by the separate explicit check in the
          // 'upsert' case below; do not remove that check when editing this.
          assertNoRelations(a, isCreateLike)

          if (operation === 'update' || operation === 'updateMany') {
            if (isRec(a.data) && (a.data.companyId !== undefined || a.data.company !== undefined)) {
              throw new TenantScopeError('Cannot change the owning company')
            }
          }
          if (WHERE_OPS.has(operation)) {
            a.where = scopeWhere(a.where, companyId)
            return query(a)
          }
          switch (operation) {
            case 'create':
              a.data = scopeData(a.data, companyId)
              return query(a)
            case 'createMany':
              a.data = Array.isArray(a.data)
                ? a.data.map((d) => scopeData(d, companyId))
                : scopeData(a.data, companyId)
              return query(a)
            case 'upsert':
              a.where = scopeWhere(a.where, companyId)
              a.create = scopeData(a.create, companyId)
              // update must not move the row to another company
              if (isRec(a.update) && (a.update.companyId !== undefined || a.update.company !== undefined)) {
                throw new TenantScopeError('Cannot change the owning company')
              }
              return query(a)
            default:
              throw new TenantScopeError(`Operation ${operation} is not allowed on ${model}`)
          }
        },
      },
    },
  })
}

const ALLOWED_OPS = [
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany',
  'create', 'createMany', 'upsert',
] as const
type AllowedOp = (typeof ALLOWED_OPS)[number]

type ScopedClient = ReturnType<typeof scopedClient<PrismaClient>>
type HandleFor<M extends Prisma.ModelName> = {
  [K in M as Uncapitalize<M>]: Pick<ScopedClient[Uncapitalize<M>], AllowedOp>
}
export type TenantDb = HandleFor<(typeof TENANT_OWNED_MODELS)[number]>

/**
 * Builds the handle exposed to app code: for each listed model, a plain object with only the
 * allowed operations, each returning a plain Promise. This hides `$parent` (which would expose
 * the unscoped client) and Prisma's fluent relation accessors.
 */
export function buildTenantHandle<C extends PrismaClient, M extends Prisma.ModelName>(
  client: C,
  companyId: string,
  models: readonly M[],
): HandleFor<M> {
  const scoped = scopedClient(client, companyId, models) as unknown as Record<
    string,
    Record<string, (args?: unknown) => Promise<unknown>>
  >
  const out: Record<string, Record<string, (args?: unknown) => Promise<unknown>>> = {}
  for (const model of models) {
    const key = model.charAt(0).toLowerCase() + model.slice(1)
    const delegate = scoped[key]
    const wrapper: Record<string, (args?: unknown) => Promise<unknown>> = {}
    for (const op of ALLOWED_OPS) {
      wrapper[op] = async (args?: unknown) => delegate[op](args)
    }
    out[key] = wrapper
  }
  return out as unknown as HandleFor<M>
}

export function tenantDb(ctx: TenantContext, opts?: { actingForCompanyId?: string }): TenantDb {
  const acting = opts?.actingForCompanyId
  let companyId: string
  if (ctx.accountKind === 'CLIENT') {
    if (acting !== undefined) throw new TenantScopeError('Clients cannot act for another company')
    companyId = ctx.companyId
  } else {
    if (!acting) throw new TenantScopeError('Staff must name a client company to act for')
    companyId = acting
  }
  return buildTenantHandle(prisma, companyId, TENANT_OWNED_MODELS)
}

export async function getOwnCompany(ctx: TenantContext): Promise<{ id: string; name: string }> {
  // Plain `prisma` on purpose: Company has no companyId column; keying by ctx.companyId is equivalent to tenant scoping.
  return prisma.company.findUniqueOrThrow({
    where: { id: ctx.companyId },
    select: { id: true, name: true },
  })
}
