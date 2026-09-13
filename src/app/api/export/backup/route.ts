import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { buildBackup, backupFileName } from '@/server/services/backup';

export const dynamic = 'force-dynamic';
// A full export of a busy term takes longer than the default budget.
export const maxDuration = 60;

/**
 * Downloads a complete backup of the database as a single JSON file.
 *
 * The file is generated in memory and streamed to the operator's computer —
 * nothing is written on the server, which is what lets this work on hosting
 * with a read-only filesystem.
 */
export async function GET() {
  try {
    await requirePermission('backup.manage');
  } catch {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const academy = await getAcademySettings();
  const backup = await buildBackup();
  // Written compactly rather than indented: the file is read by the restore,
  // not by a person, and indentation adds a third to its size for nothing.
  const body = JSON.stringify(backup);

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${backupFileName(academy.shortName)}"`,
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store',
    },
  });
}
