/**
 * Refuses to continue unless DATABASE_URL points at a database on this machine.
 *
 *   tsx scripts/require-local-database.ts && prisma migrate reset --force
 *
 * Guards the commands that delete everything — loading demonstration data and
 * resetting the schema. On a developer's PC the same .env file is often used to
 * run migrations against the live database, which leaves the live school one
 * mistyped command away from losing every student, result and account.
 *
 * To seed a remote database on purpose (a practice copy on Neon, say), name it
 * explicitly:  SEED_ALLOW_REMOTE_HOST=the-exact-hostname
 */

import { pathToFileURL } from 'node:url';

export function requireLocalDatabase(action: string): void {
  // Prisma loads .env when it starts, which is after this check runs.
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile('.env');
    } catch {
      // No .env file: fall through and report the missing variable.
    }
  }

  const raw = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch {
    // Unparseable or missing: treated as not local.
  }

  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (local) return;
  if (host && process.env.SEED_ALLOW_REMOTE_HOST === host) return;

  console.error(
    [
      '',
      `  REFUSED: ${action} deletes every student, session, exam, result and user account.`,
      '',
      `  DATABASE_URL points at ${host || '(nothing)'}, which is not a database on this machine.`,
      '  If that is the live academy database, this would have erased it.',
      '',
      '  To run it against a local test database, set DATABASE_URL to one on localhost.',
      '  To run it against a remote practice copy deliberately, set',
      `  SEED_ALLOW_REMOTE_HOST=${host || '<hostname>'}`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}

// Run directly from package.json scripts.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  requireLocalDatabase(process.argv[2] ?? 'This command');
}
