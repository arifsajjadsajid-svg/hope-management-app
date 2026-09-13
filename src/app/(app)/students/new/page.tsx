import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { suggestAdmissionNumber } from '@/server/queries/students';
import { createStudentAction } from '@/server/actions/students';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/primitives';
import { StudentForm } from '../student-form';
import { toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Add Student' };
export const dynamic = 'force-dynamic';

export default async function NewStudentPage() {
  await requirePermission('students.create');

  const [sessions, classes, sections, session, admissionNumber] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.section.findMany({ orderBy: { name: 'asc' } }),
    getCurrentSession(),
    suggestAdmissionNumber(),
  ]);

  const ready = sessions.length > 0 && classes.length > 0 && sections.length > 0;

  return (
    <>
      <PageHeader
        title="Add Student"
        description="Create a new student record and place them in a class and section."
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Add Student' }]}
      />

      {!ready ? (
        <Alert tone="warning" title="Academic structure incomplete">
          Before adding students you need at least one academic session, one class and one section.
          Set these up under <strong>Academics</strong>.
        </Alert>
      ) : (
        <StudentForm
          action={createStudentAction}
          submitLabel="Save Student"
          cancelHref="/students"
          sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
          classes={classes.map((c) => ({ id: c.id, name: c.name, sessionId: c.sessionId }))}
          sections={sections.map((s) => ({ id: s.id, name: s.name, classId: s.classId }))}
          defaults={{
            admissionNumber,
            registrationNo: '',
            fullName: '',
            fatherName: '',
            motherName: '',
            guardianName: '',
            dateOfBirth: '',
            gender: 'MALE',
            bformCnic: '',
            admissionDate: toISODateInput(new Date()),
            parentPhone: '',
            studentPhone: '',
            whatsappNumber: '',
            email: '',
            address: '',
            previousSchool: '',
            emergencyContact: '',
            notes: '',
            status: 'ACTIVE',
            sessionId: session?.id ?? '',
            classId: '',
            sectionId: '',
            classRollNumber: '',
          }}
        />
      )}
    </>
  );
}
