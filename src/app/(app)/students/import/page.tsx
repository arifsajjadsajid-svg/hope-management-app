import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/primitives';
import { StudentImportWizard } from './import-client';

export const metadata: Metadata = { title: 'Import Students' };
export const dynamic = 'force-dynamic';

export default async function ImportStudentsPage() {
  await requirePermission('students.import');

  const [sessions, classes, sections, current] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.section.findMany({
      include: { schoolClass: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    getCurrentSession(),
  ]);

  const ready = sessions.length > 0 && classes.length > 0 && sections.length > 0;

  return (
    <>
      <PageHeader
        title="Import Students"
        description="Bring an existing roster in from Excel or CSV. Every row is validated and duplicates are rejected — nothing is imported silently."
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Import Students' }]}
      />

      {!ready ? (
        <Alert tone="warning" title="Academic structure incomplete">
          Create at least one academic session, class and section under <strong>Academics</strong>{' '}
          before importing students.
        </Alert>
      ) : (
        <StudentImportWizard
          defaultSessionId={current?.id}
          sessions={sessions.map((s) => ({ id: s.id, label: s.name }))}
          classes={classes.map((c) => ({ id: c.id, label: c.name, parentId: c.sessionId }))}
          sections={sections.map((s) => ({
            id: s.id,
            label: `${s.schoolClass.name} — ${s.name}`,
            parentId: s.classId,
          }))}
        />
      )}
    </>
  );
}
