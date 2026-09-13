import type { Metadata } from 'next';
import { DatabaseBackup, Clock, Table2, ShieldAlert } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { backupSummary, formatBytes } from '@/server/services/backup';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, Alert, Badge } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { CreateBackupButton, RestoreBackupButton, DeleteBackupButton } from './backup-clients';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Backup & Restore' };
export const dynamic = 'force-dynamic';

export default async function BackupPage() {
  const user = await requirePermission('backup.manage');
  const canRestore = userCan(user, 'backup.restore');

  const [summary, records] = await Promise.all([
    backupSummary(),
    prisma.backup.findMany({
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  const latest = records[0];

  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description="Complete copies of the academy database — students, marks, results, certificates, photographs and the audit log."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Backup & Restore' }]}
        actions={
          <div className="flex items-center gap-2">
            {canRestore && <RestoreBackupButton />}
            <CreateBackupButton />
          </div>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard
          label="Records to Back Up"
          value={summary.rows.toLocaleString()}
          hint={`across ${summary.tables} tables`}
          tone="navy"
          icon={<Table2 className="h-[18px] w-[18px]" />}
        />
        <StatCard label="Students Held" value={summary.students} tone="royal" />
        <StatCard
          label="Last Backup"
          value={latest ? formatBytes(latest.sizeBytes) : '—'}
          hint={latest ? formatDateTime(latest.createdAt) : 'none taken yet'}
          tone={latest ? 'emerald' : 'amber'}
          icon={<Clock className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Restore Permission"
          value={canRestore ? 'Granted' : 'Denied'}
          hint="Super Admin only"
          tone={canRestore ? 'gold' : 'slate'}
          icon={<ShieldAlert className="h-[18px] w-[18px]" />}
        />
      </section>

      {!latest && (
        <Alert tone="warning" title="No backup has been taken yet" className="mb-5">
          Take one now, and take another before publishing a result, running a promotion or
          importing a spreadsheet.
        </Alert>
      )}

      <Card className="mb-5">
        <CardHeader
          title="How backups work here"
          description="What is included, where the file goes, and how to put it back."
        />
        <CardBody>
          <div className="grid gap-4 text-[13px] leading-relaxed text-slate-700 sm:grid-cols-3">
            <div>
              <p className="mb-1 font-bold text-navy-900">What is included</p>
              <p>
                Every table: students, enrolments, examinations, date sheets, roll numbers, seating,
                attendance, marks, results, certificates, uploaded photographs, users, settings and
                the audit log. Sign-in sessions are left out on purpose, so restoring a backup never
                revives an old login.
              </p>
            </div>
            <div>
              <p className="mb-1 font-bold text-navy-900">Where the file goes</p>
              <p>
                Straight to whichever computer you press the button from, as a single{' '}
                <code className="font-mono text-[12px]">.json</code> file. Keep copies somewhere
                else as well — a cloud drive or a USB stick. A backup stored only on the machine it
                came from does not survive that machine failing.
              </p>
            </div>
            <div>
              <p className="mb-1 font-bold text-navy-900">Putting it back</p>
              <p>
                <strong>Restore from File</strong> replaces everything with the contents of a backup.
                It runs as one transaction, so a file with anything wrong in it changes nothing at
                all. Only a Super Admin may do it, and only with a written reason and their password.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Backup history"
          description="Backups taken from this system, newest first"
        />
        {records.length === 0 ? (
          <EmptyState
            icon={<DatabaseBackup className="h-6 w-6" />}
            title="No backups yet"
            description="Take a backup before publishing results, running a promotion, or making bulk changes."
            action={<CreateBackupButton size="md" />}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>File</Th>
                  <Th align="center">Size</Th>
                  <Th>Taken</Th>
                  <Th>By</Th>
                  <Th>Type</Th>
                  <Th>Notes</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <Td className="font-mono text-[12px] font-semibold text-navy-900">
                      {record.fileName}
                    </Td>
                    <Td align="center" className="tabular text-slate-600">
                      {formatBytes(record.sizeBytes)}
                    </Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                      {formatDateTime(record.createdAt)}
                    </Td>
                    <Td className="text-[12.5px] text-slate-700">
                      {record.createdBy?.fullName ?? 'System'}
                    </Td>
                    <Td>
                      <Badge tone="bg-royal-50 text-royal-700 ring-royal-200">{record.type}</Badge>
                    </Td>
                    <Td className="max-w-xs text-[12.5px] text-slate-600">{record.notes ?? '—'}</Td>
                    <Td align="right">
                      <DeleteBackupButton id={record.id} fileName={record.fileName} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
