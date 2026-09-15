/**
 * Command-line restore.
 *
 *   npm run restore -- storage/backups/auto-2026-09-13T10-04-00.json
 *
 * Replaces every record in the database pointed at by DATABASE_URL with the
 * contents of a backup file. Use this for a database too large to upload
 * through the browser — nothing here goes over HTTP, so there is no size limit.
 *
 * The whole restore runs inside one transaction: if any row is rejected, the
 * database is left exactly as it was.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const EXCLUDED = new Set(['UserSession', 'ParentSession', 'LoginAttempt']);

function modelList() {
  return Prisma.dmmf.datamodel.models
    .filter((m) => !EXCLUDED.has(m.name))
    .map((m) => ({ model: m.name, client: m.name.charAt(0).toLowerCase() + m.name.slice(1) }));
}

/** Parents before children, worked out from the schema's own relations. */
function insertionOrder() {
  const all = modelList();
  const known = new Set(all.map((m) => m.model));

  const dependencies = new Map<string, Set<string>>();
  for (const { model } of all) {
    const definition = Prisma.dmmf.datamodel.models.find((m) => m.name === model)!;
    const needs = new Set<string>();
    for (const field of definition.fields) {
      if (field.kind === 'object' && field.relationFromFields?.length) {
        if (field.type !== model && known.has(field.type)) needs.add(field.type);
      }
    }
    dependencies.set(model, needs);
  }

  const ordered: { model: string; client: string }[] = [];
  const placed = new Set<string>();

  while (ordered.length < all.length) {
    const ready = all.filter(
      (m) => !placed.has(m.model) && [...dependencies.get(m.model)!].every((d) => placed.has(d)),
    );
    if (ready.length === 0) {
      for (const m of all) if (!placed.has(m.model)) { ordered.push(m); placed.add(m.model); }
      break;
    }
    for (const m of ready) { ordered.push(m); placed.add(m.model); }
  }

  return ordered;
}

function deserialiseRow(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const definition = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!definition) return row;

  const out: Record<string, unknown> = {};
  for (const field of definition.fields) {
    if (field.kind === 'object' || !(field.name in row)) continue;

    const value = row[field.name];
    if (value === null || value === undefined) {
      out[field.name] = null;
    } else if (field.type === 'DateTime') {
      out[field.name] = new Date(value as string);
    } else if (field.type === 'Bytes') {
      out[field.name] = Buffer.from((value as { __bytes: string }).__bytes, 'base64');
    } else if (field.type === 'BigInt') {
      out[field.name] = BigInt(value as string);
    } else {
      out[field.name] = value;
    }
  }
  return out;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('\n  Usage: npm run restore -- <path to backup .json>\n');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), target);
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (raw === null) {
    console.error(`\n  Cannot read ${filePath}\n`);
    process.exit(1);
  }

  const file = JSON.parse(raw) as {
    format?: string;
    generatedAt?: string;
    academy?: string;
    tables?: Record<string, unknown[]>;
  };

  if (file.format !== 'hsa-backup-v1' || !file.tables) {
    console.error('\n  That file is not a backup of this system.\n');
    process.exit(1);
  }

  const rows = Object.values(file.tables).reduce((sum, t) => sum + (t?.length ?? 0), 0);
  const current = await prisma.student.count();

  console.log(`\n  Backup:   ${path.basename(filePath)}`);
  console.log(`  Academy:  ${file.academy ?? 'unknown'}`);
  console.log(`  Taken:    ${file.generatedAt ?? 'unknown'}`);
  console.log(`  Contains: ${rows.toLocaleString()} records`);
  console.log(`\n  This REPLACES the database at DATABASE_URL, which currently holds`);
  console.log(`  ${current} student record(s). Everything in it will be removed.\n`);

  if (process.env.RESTORE_YES !== '1') {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('  Type RESTORE to continue: ');
    rl.close();
    if (answer.trim() !== 'RESTORE') {
      console.log('\n  Cancelled. Nothing was changed.\n');
      process.exit(0);
    }
  }

  const order = insertionOrder();
  let written = 0;

  await prisma.$transaction(
    async (tx) => {
      const client = tx as unknown as Record<
        string,
        { deleteMany: (a?: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> }
      >;

      await client.userSession.deleteMany({});
      await client.parentSession.deleteMany({});
      await client.loginAttempt.deleteMany({});

      for (const { client: name } of [...order].reverse()) {
        await client[name].deleteMany({});
      }

      for (const { model, client: name } of order) {
        const table = file.tables![model];
        if (!Array.isArray(table) || table.length === 0) continue;

        const data = table.map((row) => deserialiseRow(model, row as Record<string, unknown>));
        await client[name].createMany({ data });
        written += data.length;
        console.log(`  ${model.padEnd(26)}${data.length}`);
      }
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  console.log(`\n  Restored ${written.toLocaleString()} records. Everyone must sign in again.\n`);
}

main()
  .catch((error) => {
    console.error(`\n  Restore failed, nothing was changed: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
