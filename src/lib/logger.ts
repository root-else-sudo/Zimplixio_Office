import pino from 'pino'
import { serverEnv } from './env'

const isDev = (serverEnv.NODE_ENV ?? 'production') !== 'production'

export const logger = pino({
  level: serverEnv.LOG_LEVEL ?? 'info',
  base: { service: 'zimplixio-office' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.apiKey',
      '*.api_key',
      '*.token',
      '*.secret',
      '*.mfaSecret',
    ],
    censor: '[REDACTED]',
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
    },
  }),
})

// Convenience for tagging route-scoped loggers.
export function routeLogger(name: string) {
  return logger.child({ route: name })
}
