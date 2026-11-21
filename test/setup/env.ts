import { existsSync } from 'node:fs'
import { assertTestDatabaseUrl } from './guard'

if (existsSync('.env')) process.loadEnvFile('.env')

process.env.DATABASE_URL = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST)
