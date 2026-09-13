import type { Metadata } from 'next';
import { Upload } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { MarksImportWizard } from './import-client';

export const metadata: Metadata = { title: 'Import Marks' };
export const dynamic = 'force-dynamic';

export default async function ImportMarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('marks.import');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();
  const exams = await prisma.exam.findMany({
    where: session ? { sessionId: session.id } : {},
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
  });

  const examId = pick('examId') || exams[0]?.id;

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Import Marks"
          description="Bring completed marks sheets in from Excel or CSV."
          breadcrumbs={[{ label: 'Marks' }, { label: 'Import Marks' }]}
        />
        <Card>
          <EmptyState
            icon={<Upload className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination before importing marks."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { session: { select: { name: true } } },
  });

  const examSubjects = await prisma.examSubject.findMany({
    where: { examId, isIncluded: true },
    include: {
      subject: { select: { name: true, code: true, schoolClass: { select: { name: true } } } },
    },
    orderBy: { displayOrder: 'asc' },
  });

  const examSubjectId = pick('examSubjectId') || examSubjects[0]?.id;
  const examSubject = examSubjects.find((es) => es.id === examSubjectId) ?? null;

  return (
    <>
      <PageHeader
        title="Import Marks"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Marks' }, { label: 'Import Marks' }]}
      />

      <Alert tone="info" className="mb-5">
        Download the template for the subject first — it comes pre-filled with the roll numbers and
        names of every candidate, so only the marks column needs typing. Rows are matched on roll
        number, and nothing is written until you confirm the preview.
      </Alert>

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[240px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'examSubjectId',
              label: 'Subject',
              className: 'min-w-[280px] flex-1',
              options: examSubjects.map((es) => ({
                value: es.id,
                label: `${es.subject.name} (${es.subject.code}) — ${es.subject.schoolClass.name}`,
              })),
            },
          ]}
        />
      </Card>

      {!examSubject ? (
        <Card>
          <EmptyState
            icon={<Upload className="h-6 w-6" />}
            title="No subjects available"
            description="This examination has no included subjects."
          />
        </Card>
      ) : (
        <MarksImportWizard
          key={examSubject.id}
          examSubjectId={examSubject.id}
          subjectLabel={`${examSubject.subject.name} — ${examSubject.subject.schoolClass.name}`}
          disabled={exam.resultLocked}
          disabledReason="Results for this examination are locked. Ask a Super Admin to unlock the result before importing marks."
        />
      )}
    </>
  );
}
