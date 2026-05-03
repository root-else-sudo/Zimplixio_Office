import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'

export type TxClient = Prisma.TransactionClient

// Wrap multi-statement writes in an interactive Prisma transaction so partial
// failures roll back. Pass-through return value of the inner function.
export function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn)
}
