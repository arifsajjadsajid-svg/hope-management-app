import { PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient instance is reused across hot reloads in development so
 * the SQLite/Postgres connection pool is not exhausted.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
