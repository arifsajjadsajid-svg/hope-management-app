import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { parseBackup, restoreBackup, BackupError } from '@/server/services/backup';

export const dynamic = 'force-dynamic';
// Clearing and re-inserting every table takes far longer than a normal request.
export const maxDuration = 300;

/**
 * Restores the database from an uploaded backup file.
 *
 * This is a route handler rather than a server action deliberately: the upload
 * is large, and a route handler reports what went wrong with an ordinary HTTP
 * status and message instead of failing opaquely. Given that this is the most
 * destructive operation in the system, the operator must be able to see exactly
 * why it did not run.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requirePermission('backup.restore');
  } catch {
    return NextResponse.json(
      { error: 'Only a Super Admin may restore the database.' },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          'The upload could not be read — it is most likely too large for the server to accept. Restore it with "npm run restore" instead.',
      },
      { status: 413 },
    );
  }

  const reason = String(form.get('reason') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const upload = form.get('file');

  if (reason.length < 10) {
    return NextResponse.json(
      { error: 'Give a reason of at least 10 characters. It is recorded permanently.' },
      { status: 400 },
    );
  }

  if (!(upload instanceof File) || upload.size === 0) {
    return NextResponse.json({ error: 'No backup file was received.' }, { status: 400 });
  }

  const account = await prisma.user.findUnique({ where: { id: user.id } });
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return NextResponse.json({ error: 'Password confirmation failed.' }, { status: 401 });
  }

  try {
    const file = parseBackup(await upload.text());

    // Recorded before the attempt, so a restore that fails and rolls back still
    // leaves evidence in the log that someone tried.
    await recordAudit({
      action: AUDIT_ACTIONS.BACKUP_RESTORED,
      entityType: 'Backup',
      entityId: upload.name,
      description: `RESTORE ATTEMPTED from ${upload.name} (taken ${file.generatedAt}) — ${reason}`,
      severity: 'CRITICAL',
    });

    const { restored } = await restoreBackup(file);
    const rows = Object.values(restored).reduce((sum, n) => sum + n, 0);

    // Recorded again afterwards: the entry above was inside the data the restore
    // just replaced, so without this the log would show no trace of it.
    await recordAudit({
      action: AUDIT_ACTIONS.BACKUP_RESTORED,
      entityType: 'Backup',
      entityId: upload.name,
      description: `Database RESTORED from ${upload.name} (taken ${file.generatedAt}) by ${user.fullName} — ${rows} records — ${reason}`,
      severity: 'CRITICAL',
      // No user id: the session is gone by now, and a backup from another
      // installation may not contain this account at all.
      actor: { id: null, name: user.fullName, role: user.roleName },
    });

    return NextResponse.json({
      ok: true,
      rows,
      tables: Object.keys(restored).length,
      message: `Database restored from ${upload.name} — ${rows.toLocaleString()} records across ${
        Object.keys(restored).length
      } tables.`,
    });
  } catch (error) {
    if (error instanceof BackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[restore] failed', error);
    return NextResponse.json(
      {
        error: `The restore failed and nothing was changed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      },
      { status: 500 },
    );
  }
}
