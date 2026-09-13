import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings, getCurrentSession } from '@/lib/settings';
import { saveExamAction } from '@/server/actions/exams';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/primitives';
import { ExamForm } from '../exam-form';
import { toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'New Examination' };
export const dynamic = 'force-dynamic';

export default async function NewExamPage() {
  await requirePermission('exams.create');

  const [sessions, classes, sections, gradingSchemes, policies, session, academy] =
    await Promise.all([
      prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
      prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } }),
      prisma.section.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.gradingScheme.findMany({ orderBy: { name: 'asc' } }),
      prisma.resultPolicy.findMany({ orderBy: { name: 'asc' } }),
      getCurrentSession(),
      getAcademySettings(),
    ]);

  const today = new Date();
  const twoWeeks = new Date(today.getTime() + 12 * 24 * 60 * 60 * 1000);

  const action = saveExamAction.bind(null, null);

  return (
    <>
      <PageHeader
        title="New Examination"
        description="Set up an examination, choose the participating classes and define how roll numbers are allocated."
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'New Examination' }]}
      />

      {classes.length === 0 ? (
        <Alert tone="warning" title="No classes available">
          Create at least one class with subjects under <strong>Academics</strong> before setting up
          an examination.
        </Alert>
      ) : (
        <ExamForm
          action={action}
          submitLabel="Create Examination"
          cancelHref="/exams"
          sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
          classes={classes.map((c) => ({ id: c.id, name: c.name, sessionId: c.sessionId }))}
          sections={sections.map((s) => ({ id: s.id, name: s.name, classId: s.classId }))}
          gradingSchemes={gradingSchemes.map((g) => ({ id: g.id, name: g.name }))}
          policies={policies.map((p) => ({ id: p.id, name: p.name }))}
          defaults={{
            name: '',
            type: 'FIRST_TERM',
            sessionId: session?.id ?? '',
            startDate: toISODateInput(today),
            endDate: toISODateInput(twoWeeks),
            resultPublishDate: '',
            instructions:
              'Candidates must bring their roll number slip and report to the allotted room 15 minutes before the paper begins. Mobile phones and unfair means are strictly prohibited.',
            examCenter: `${academy.name}, ${academy.address}`,
            gradingSchemeId: '',
            resultPolicyId: '',
            rollNumberPrefix: '',
            rollNumberMethod: 'CLASS_WISE',
            rollNumberStart: '1',
            rollNumberPadding: '3',
            classIds: [],
            sectionIds: [],
          }}
        />
      )}
    </>
  );
}
