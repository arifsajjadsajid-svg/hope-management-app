import { PrismaClient } from '@prisma/client';

/**
 * Normalises the connection string for serverless hosting.
 *
 * These settings are easy to leave off when the URL is copied out of a
 * dashboard by hand, and each omission fails in a way that does not point at
 * the cause:
 *
 *   connect_timeout   Prisma waits 5 seconds by default. A function in one
 *                     region opening a fresh connection to a shared pooler in
 *                     another can exceed that, and the error it produces —
 *                     "Can't reach database server" — reads like the server is
 *                     down rather than slow to accept.
 *   pgbouncer=true    The transaction pooler (port 6543) cannot do prepared
 *                     statements, which Prisma uses unless told otherwise. The
 *                     site then works until it is busy, and fails with
 *                     "prepared statement already exists" under load.
 *   connection_limit  Every serverless invocation has its own pool, so a large
 *                     limit multiplied by many concurrent functions exhausts
 *                     the database's connection allowance.
 *
 * Anything explicitly present in the URL is left exactly as it is.
 */
function connectionUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Malformed URLs are left for Prisma to report; it words the error better.
    return raw;
  }

  const params = url.searchParams;
  if (!params.has('connect_timeout')) params.set('connect_timeout', '30');

  // Port 6543 is Supabase's transaction pooler; 5432 is a session connection
  // and must not be told it is behind pgbouncer.
  const isTransactionPooler = url.port === '6543';
  if (isTransactionPooler && !params.has('pgbouncer')) params.set('pgbouncer', 'true');
  if (!params.has('connection_limit')) params.set('connection_limit', '1');

  return url.toString();
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = connectionUrl();

/**
 * A single PrismaClient instance is reused across hot reloads in development so
 * the connection pool is not exhausted.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
