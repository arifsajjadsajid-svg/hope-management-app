/**
 * Command-line backup, for scheduling with Windows Task Scheduler or cron.
 *
 *   npm run backup
 *
 * Writes a complete JSON export of the database into storage/backups on the
 * machine that runs it, and records it in the backups table so it appears in
 * the Backup & Restore screen. Point DATABASE_URL at the live database and this
 * can be scheduled on an office PC to keep the academy's own copies of a
 * cloud-hosted system.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const BACKUP_ROOT = path.join(process.cwd(), 'storage', 'backups');
/** Snapshots older than this are pruned automatically. */
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 30);

/** Short-lived security records; see src/server/services/backup.ts. */
const EXCLUDED = new Set(['UserSession', 'LoginAttempt']);

function serialise(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { __bytes: value.toString('base64') };
  if (value instanceof Uint8Array) return { __bytes: Buffer.from(value).toString('base64') };
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialise(inner);
    }
    return out;
  }
  return value;
}

async function main() {
  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const model of Prisma.dmmf.datamodel.models) {
    if (EXCLUDED.has(model.name)) continue;

    const key = model.name.charAt(0).toLowerCase() + model.name.slice(1);
    const delegate = (prisma as unknown as Record<string, { findMany?: () => Promise<unknown[]> }>)[
      key
    ];
    if (!delegate?.findMany) continue;

    const rows = await delegate.findMany();
    tables[model.name] = rows.map(serialise);
    rowCounts[model.name] = rows.length;
  }

  const settings = await prisma.academySettings.findUnique({ where: { id: 'academy' } });

  const body = JSON.stringify(
    {
      format: 'hsa-backup-v1',
      generatedAt: new Date().toISOString(),
      academy: settings?.name ?? 'The Hope Science Academy',
      rowCounts,
      tables,
    },
  );

  await fs.mkdir(BACKUP_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `auto-${stamp}.json`;
  const filePath = path.join(BACKUP_ROOT, fileName);

  await fs.writeFile(filePath, body, 'utf8');
  const sizeBytes = Buffer.byteLength(body);

  await prisma.backup.create({
    data: {
      fileName,
      filePath,
      sizeBytes,
      type: 'AUTO',
      notes: 'Scheduled backup',
    },
  });

  const total = Object.values(rowCounts).reduce((sum, n) => sum + n, 0);
  console.log(
    `Backup written: ${fileName} (${(sizeBytes / 1024).toFixed(0)} KB, ${total} records across ${
      Object.keys(rowCounts).length
    } tables)`,
  );

  /* ------------------------------------------------------------ pruning */

  if (KEEP_DAYS > 0) {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    const entries = await fs.readdir(BACKUP_ROOT).catch(() => [] as string[]);
    let pruned = 0;

    for (const entry of entries) {
      if (!entry.startsWith('auto-') || !entry.endsWith('.json')) continue;
      const target = path.join(BACKUP_ROOT, entry);
      const info = await fs.stat(target);
      if (info.mtime.getTime() < cutoff) {
        await fs.unlink(target).catch(() => undefined);
        await prisma.backup.deleteMany({ where: { fileName: entry } });
        pruned += 1;
      }
    }

    if (pruned > 0) console.log(`Pruned ${pruned} snapshot(s) older than ${KEEP_DAYS} days.`);
  }
}

main()
  .catch((error) => {
    console.error('Backup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
