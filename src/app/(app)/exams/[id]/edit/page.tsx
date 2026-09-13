import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveExamAction } from '@/server/actions/exams';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/primitives';
import { ExamForm } from '../../exam-form';
import { toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Edit Examination' };
export const dynamic = 'force-dynamic';

export default async function EditExamPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('exams.edit');
  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      examClasses: { select: { classId: true } },
      examSections: { select: { sectionId: true } },
    },
  });
  if (!exam) notFound();

  const [sessions, classes, sections, gradingSchemes, policies] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.section.findMany({ orderBy: { name: 'asc' } }),
    prisma.gradingScheme.findMany({ orderBy: { name: 'asc' } }),
    prisma.resultPolicy.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const action = saveExamAction.bind(null, exam.id);

  return (
    <>
      <PageHeader
        title={`Edit — ${exam.name}`}
        description="Changing the participating classes adds or removes their subjects from this examination."
        breadcrumbs={[
          { label: 'Examinations', href: '/exams' },
          { label: exam.name, href: `/exams/${exam.id}` },
          { label: 'Edit' },
        ]}
      />

      {exam.resultLocked && (
        <Alert tone="warning" title="Results are locked" className="mb-5">
          This examination cannot be edited until a Super Admin unlocks the result.
        </Alert>
      )}

      <ExamForm
        action={action}
        submitLabel="Save Changes"
        cancelHref={`/exams/${exam.id}`}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name, sessionId: c.sessionId }))}
        sections={sections.map((s) => ({ id: s.id, name: s.name, classId: s.classId }))}
        gradingSchemes={gradingSchemes.map((g) => ({ id: g.id, name: g.name }))}
        policies={policies.map((p) => ({ id: p.id, name: p.name }))}
        defaults={{
          name: exam.name,
          type: exam.type,
          sessionId: exam.sessionId,
          startDate: toISODateInput(exam.startDate),
          endDate: toISODateInput(exam.endDate),
          resultPublishDate: toISODateInput(exam.resultPublishDate),
          instructions: exam.instructions ?? '',
          examCenter: exam.examCenter ?? '',
          gradingSchemeId: exam.gradingSchemeId ?? '',
          resultPolicyId: exam.resultPolicyId ?? '',
          rollNumberPrefix: exam.rollNumberPrefix ?? '',
          rollNumberMethod: exam.rollNumberMethod,
          rollNumberStart: String(exam.rollNumberStart),
          rollNumberPadding: String(exam.rollNumberPadding),
          classIds: exam.examClasses.map((c) => c.classId),
          sectionIds: exam.examSections.map((s) => s.sectionId),
        }}
      />
    </>
  );
}
