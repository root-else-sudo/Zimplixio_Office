import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup/env.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    // next-auth imports 'next/server' without an extension; inlining lets Vite resolve it
    server: { deps: { inline: ['next-auth'] } },
    pool: 'forks',
    fileParallelism: false, // one shared test database
  },
})
