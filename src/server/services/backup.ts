import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Backups.
 *
 * The database is PostgreSQL, which no longer sits in a file the application
 * can copy, so a backup here is a complete JSON export of every table that the
 * operator downloads and keeps. This works identically on a laptop, a school
 * server and managed hosting, and the file can be read by anything — it is not
 * tied to a Prisma or PostgreSQL version.
 *
 * The hosting provider's own snapshots (Neon keeps point-in-time history) are
 * the fastest way to undo a bad change; this export is the copy the academy
 * holds itself, independent of any provider.
 */

export class BackupError extends Error {}

/** Matches the file the export produces. */
export const BACKUP_FORMAT = 'hsa-backup-v1';

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  generatedAt: string;
  academy: string;
  rowCounts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

/**
 * Every model in the schema, taken from Prisma's own metadata so a new table
 * is included in backups automatically rather than being silently missed.
 */
function modelNames(): { model: string; client: string }[] {
  return Prisma.dmmf.datamodel.models.map((model) => ({
    model: model.name,
    client: model.name.charAt(0).toLowerCase() + model.name.slice(1),
  }));
}

/**
 * JSON cannot hold dates or binary data, so both are written in a form that
 * survives the round trip: dates as ISO strings, image bytes as base64.
 */
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

/**
 * Reads every table into a single JSON document.
 *
 * Sessions and login attempts are deliberately excluded: they are short-lived
 * security records, restoring them would revive expired logins, and they are
 * by far the largest tables in a busy term.
 */
const EXCLUDED_MODELS = new Set(['UserSession', 'ParentSession', 'LoginAttempt']);

export async function buildBackup(): Promise<BackupFile> {
  const settings = await prisma.academySettings.findUnique({ where: { id: 'academy' } });

  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const { model, client } of modelNames()) {
    if (EXCLUDED_MODELS.has(model)) continue;

    const delegate = (prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[
      client
    ];
    if (!delegate?.findMany) continue;

    const rows = await delegate.findMany();
    tables[model] = rows.map(serialise) as unknown[];
    rowCounts[model] = rows.length;
  }

  return {
    format: BACKUP_FORMAT,
    generatedAt: new Date().toISOString(),
    academy: settings?.name ?? 'The Hope Science Academy',
    rowCounts,
    tables,
  };
}

/** Suggested download name, e.g. "hsa-backup-2026-09-13-1432.json". */
export function backupFileName(shortName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const slug = shortName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'academy'}-backup-${stamp}.json`;
}

/** Totals shown on the backup page without building the whole export. */
export async function backupSummary(): Promise<{
  tables: number;
  rows: number;
  students: number;
  results: number;
}> {
  const models = modelNames().filter((m) => !EXCLUDED_MODELS.has(m.model));

  const counts = await Promise.all(
    models.map(async ({ client }) => {
      const delegate = (prisma as unknown as Record<string, { count: () => Promise<number> }>)[
        client
      ];
      if (!delegate?.count) return 0;
      return delegate.count();
    }),
  );

  const [students, results] = await Promise.all([
    prisma.student.count(),
    prisma.result.count(),
  ]);

  return {
    tables: models.length,
    rows: counts.reduce((sum, n) => sum + n, 0),
    students,
    results,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------
// RESTORE
// ---------------------------------------------------------------------

/**
 * Orders the models so that a row is always inserted after whatever it points
 * at — classes after sessions, marks after students. Derived from the schema's
 * own relations rather than a hand-written list, so it stays correct when a
 * table is added.
 */
function insertionOrder(): { model: string; client: string }[] {
  const all = modelNames().filter((m) => !EXCLUDED_MODELS.has(m.model));
  const byName = new Map(all.map((m) => [m.model, m]));

  const dependencies = new Map<string, Set<string>>();
  for (const { model } of all) {
    const definition = Prisma.dmmf.datamodel.models.find((m) => m.name === model)!;
    const needs = new Set<string>();
    for (const field of definition.fields) {
      // A relation field that holds the foreign key points at a parent row.
      if (field.kind === 'object' && field.relationFromFields?.length) {
        if (field.type !== model && byName.has(field.type)) needs.add(field.type);
      }
    }
    dependencies.set(model, needs);
  }

  const ordered: { model: string; client: string }[] = [];
  const placed = new Set<string>();

  // Repeatedly take whatever has all of its parents already placed.
  while (ordered.length < all.length) {
    const ready = all.filter(
      (m) => !placed.has(m.model) && [...dependencies.get(m.model)!].every((d) => placed.has(d)),
    );

    if (ready.length === 0) {
      // A cycle of optional relations: place the rest as they come. Optional
      // foreign keys tolerate this because the parent may legitimately be null.
      for (const m of all) if (!placed.has(m.model)) { ordered.push(m); placed.add(m.model); }
      break;
    }

    for (const m of ready) { ordered.push(m); placed.add(m.model); }
  }

  return ordered;
}

/** Turns the JSON representation back into the types Prisma expects. */
function deserialiseRow(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const definition = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!definition) return row;

  const out: Record<string, unknown> = {};

  for (const field of definition.fields) {
    if (field.kind === 'object') continue; // relations are carried by their FK columns
    if (!(field.name in row)) continue;

    const value = row[field.name];
    if (value === null || value === undefined) {
      out[field.name] = null;
      continue;
    }

    if (field.type === 'DateTime') {
      const date = new Date(value as string);
      if (Number.isNaN(date.getTime())) {
        throw new BackupError(`${model}.${field.name} holds a date the file cannot represent.`);
      }
      out[field.name] = date;
    } else if (field.type === 'Bytes') {
      const wrapper = value as { __bytes?: string };
      if (typeof wrapper?.__bytes !== 'string') {
        throw new BackupError(`${model}.${field.name} is not valid image data.`);
      }
      out[field.name] = Buffer.from(wrapper.__bytes, 'base64');
    } else if (field.type === 'BigInt') {
      out[field.name] = BigInt(value as string);
    } else {
      out[field.name] = value;
    }
  }

  return out;
}

/** Reads an uploaded backup file and checks it is one of ours. */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON. Upload the backup exactly as downloaded.');
  }

  const file = parsed as Partial<BackupFile>;
  if (file?.format !== BACKUP_FORMAT) {
    throw new BackupError(
      'That file is not a backup of this system. Look for a file ending in .json produced by Backup & Restore.',
    );
  }
  if (!file.tables || typeof file.tables !== 'object') {
    throw new BackupError('The backup file is incomplete — it contains no tables.');
  }

  return file as BackupFile;
}

/**
 * Replaces the entire database with the contents of a backup.
 *
 * Everything happens inside one transaction: if any row is rejected the
 * original data is left exactly as it was, so a failed restore cannot leave the
 * academy with half a database. Active sign-ins are cleared, because the users
 * they belong to are being replaced.
 */
export async function restoreBackup(file: BackupFile): Promise<{ restored: Record<string, number> }> {
  const order = insertionOrder();
  const restored: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      const client = tx as unknown as Record<
        string,
        {
          deleteMany: (args?: unknown) => Promise<unknown>;
          createMany: (args: unknown) => Promise<unknown>;
        }
      >;

      // Sessions first: they reference users, and every login is being invalidated.
      await client.userSession.deleteMany({});
      await client.parentSession.deleteMany({});
      await client.loginAttempt.deleteMany({});

      // Children before parents.
      for (const { client: name } of [...order].reverse()) {
        await client[name].deleteMany({});
      }

      // Parents before children.
      for (const { model, client: name } of order) {
        const rows = file.tables[model];
        if (!Array.isArray(rows) || rows.length === 0) {
          restored[model] = 0;
          continue;
        }

        const data = rows.map((row) => deserialiseRow(model, row as Record<string, unknown>));
        await client[name].createMany({ data });
        restored[model] = data.length;
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  return { restored };
}
