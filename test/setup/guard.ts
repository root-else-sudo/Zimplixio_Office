/** Throws unless DATABASE_URL_TEST is set and names a database ending in "_test". */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL_TEST is not set; refusing to run tests.')
  const dbName = new URL(url).pathname.replace(/^\//, '')
  if (!dbName.endsWith('_test')) {
    throw new Error(`DATABASE_URL_TEST must point at a database ending in "_test" (got "${dbName}").`)
  }
  return url
}
