'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

/**
 * Records that a backup was downloaded.
 *
 * The file itself goes straight to the operator's computer through
 * /api/export/backup; this only keeps the history entry, so the academy can see
 * who took a backup and when.
 */
export async function recordBackupAction(input: {
  fileName: string;
  sizeBytes: number;
  notes?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('backup.manage');

    await prisma.backup.create({
      data: {
        fileName: input.fileName,
        filePath: 'downloaded',
        sizeBytes: Math.max(0, Math.round(input.sizeBytes)),
        type: 'MANUAL',
        notes: input.notes?.trim() || null,
        createdById: user.id,
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.BACKUP_CREATED,
      entityType: 'Backup',
      entityId: input.fileName,
      description: `Downloaded database backup ${input.fileName} (${input.sizeBytes} bytes)`,
      severity: 'WARNING',
    });

    revalidatePath('/admin/backup');
    return ok(undefined, `Backup ${input.fileName} downloaded.`);
  });
}

/** Removes a history entry. The downloaded file on the operator's PC is untouched. */
export async function deleteBackupAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('backup.manage');

    const record = await prisma.backup.findUnique({ where: { id } });
    if (!record) throw new BusinessRuleError('That backup entry no longer exists.');

    await prisma.backup.delete({ where: { id } });

    await recordAudit({
      action: AUDIT_ACTIONS.BACKUP_CREATED,
      entityType: 'Backup',
      entityId: record.fileName,
      description: `Removed backup history entry ${record.fileName}`,
      severity: 'WARNING',
    });

    revalidatePath('/admin/backup');
    return ok(undefined, 'Entry removed from the backup history.');
  });
}
