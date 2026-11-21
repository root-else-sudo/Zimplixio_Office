/**
 * Interim admin CLI for account management (Access Management Step 1).
 * Run: npm run access -- <command> [--flag value ...]
 *
 *   create-client     --company "<name>" --email <e> --name "<n>" --password <p>
 *   deactivate-user   --email <e>     (status DEACTIVATED, sessionVersion + 1)
 *   reactivate-user   --email <e>     (status ACTIVE only; does not bump)
 *   bump-session      --email <e>     (sessionVersion + 1; ends live sessions)
 *   deactivate-company --name "<n>"   (company DEACTIVATED, all members' sessions ended)
 *
 * Refuses to change the internal company's status. Exits non-zero on any rule error.
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { AccountRuleError, assertAccountRules, normalizeEmail } from '../src/lib/accounts'

const INTERNAL_COMPANY_ID = 'internal-zimplixio'

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const v = args[i + 1]
      if (v === undefined || v.startsWith('--')) throw new AccountRuleError(`Missing value for ${a}`)
      out[a.slice(2)] = v
      i++
    }
  }
  return out
}

function need(flags: Record<string, string>, key: string): string {
  const v = flags[key]
  if (!v || !v.trim()) throw new AccountRuleError(`Missing required flag --${key}`)
  return v.trim()
}

async function findUser(emailRaw: string) {
  const email = normalizeEmail(emailRaw)
  const user = await prisma.user.findUnique({ where: { email }, include: { company: true } })
  if (!user) throw new AccountRuleError(`No user with email ${email}`)
  return user
}

async function createClient(f: Record<string, string>) {
  const companyName = need(f, 'company')
  const email = normalizeEmail(need(f, 'email'))
  const name = need(f, 'name')
  const password = need(f, 'password')
  if (password.length < 8) throw new AccountRuleError('Password must be at least 8 characters.')
  assertAccountRules({ email, companyKind: 'CLIENT', role: 'REVIEWER' })
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new AccountRuleError(`A user with email ${email} already exists.`)
  }
  let company = await prisma.company.findFirst({ where: { name: companyName, kind: 'CLIENT' } })
  if (!company) company = await prisma.company.create({ data: { name: companyName, kind: 'CLIENT' } })
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: { email, name, passwordHash, role: 'REVIEWER', status: 'ACTIVE', mfaEnabled: false, companyId: company.id },
  })
  console.log(`Created client user ${email} in company "${company.name}" (MFA enrollment required at first login).`)
}

async function deactivateUser(f: Record<string, string>) {
  const user = await findUser(need(f, 'email'))
  await prisma.user.update({ where: { id: user.id }, data: { status: 'DEACTIVATED', sessionVersion: { increment: 1 } } })
  console.log(`Deactivated ${user.email}; live sessions ended.`)
}

async function reactivateUser(f: Record<string, string>) {
  const user = await findUser(need(f, 'email'))
  await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } })
  console.log(`Reactivated ${user.email}.`)
}

async function bumpSession(f: Record<string, string>) {
  const user = await findUser(need(f, 'email'))
  await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })
  console.log(`Ended live sessions for ${user.email}.`)
}

async function deactivateCompany(f: Record<string, string>) {
  const name = need(f, 'name')
  const company = await prisma.company.findFirst({ where: { name } })
  if (!company) throw new AccountRuleError(`No company named "${name}"`)
  if (company.id === INTERNAL_COMPANY_ID || company.kind === 'INTERNAL') {
    throw new AccountRuleError('Refusing to change the internal company.')
  }
  const [, members] = await prisma.$transaction([
    prisma.company.update({ where: { id: company.id }, data: { status: 'DEACTIVATED' } }),
    prisma.user.updateMany({ where: { companyId: company.id }, data: { sessionVersion: { increment: 1 } } }),
  ])
  console.log(`Deactivated company "${company.name}"; ended sessions for ${members.count} member(s).`)
}

const COMMANDS: Record<string, (f: Record<string, string>) => Promise<void>> = {
  'create-client': createClient,
  'deactivate-user': deactivateUser,
  'reactivate-user': reactivateUser,
  'bump-session': bumpSession,
  'deactivate-company': deactivateCompany,
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const handler = cmd ? COMMANDS[cmd] : undefined
  if (!handler) {
    console.error(`Usage: npm run access -- <${Object.keys(COMMANDS).join('|')}> [--flag value ...]`)
    process.exitCode = 2
    return
  }
  try {
    await handler(parseFlags(rest))
  } catch (e) {
    if (e instanceof AccountRuleError) {
      console.error(`Error: ${e.message}`)
      process.exitCode = 1
    } else throw e
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
