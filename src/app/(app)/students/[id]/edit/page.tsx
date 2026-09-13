import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { updateStudentAction } from '@/server/actions/students';
import { PageHeader } from '@/components/layout/page-header';
import { StudentForm } from '../../student-form';
import { toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Edit Student' };
export const dynamic = 'force-dynamic';

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('students.edit');
  const { id } = await params;

  const currentSession = await getCurrentSession();

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: { session: true },
        orderBy: { session: { startDate: 'desc' } },
      },
    },
  });
  if (!student) notFound();

  const [sessions, classes, sections] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.section.findMany({ orderBy: { name: 'asc' } }),
  ]);

  // Prefer the enrolment in the current session, otherwise the most recent one.
  const enrollment =
    student.enrollments.find((e) => e.sessionId === currentSession?.id) ??
    student.enrollments[0] ??
    null;

  // Bind the student id into the action so the form only submits field values.
  const action = updateStudentAction.bind(null, student.id);

  return (
    <>
      <PageHeader
        title={`Edit — ${student.fullName}`}
        description={`Admission number ${student.admissionNumber}`}
        breadcrumbs={[
          { label: 'Students', href: '/students' },
          { label: student.fullName, href: `/students/${student.id}` },
          { label: 'Edit' },
        ]}
      />

      <StudentForm
        action={action}
        submitLabel="Save Changes"
        cancelHref={`/students/${student.id}`}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name, sessionId: c.sessionId }))}
        sections={sections.map((s) => ({ id: s.id, name: s.name, classId: s.classId }))}
        defaults={{
          admissionNumber: student.admissionNumber,
          registrationNo: student.registrationNo ?? '',
          fullName: student.fullName,
          fatherName: student.fatherName,
          motherName: student.motherName ?? '',
          guardianName: student.guardianName ?? '',
          dateOfBirth: toISODateInput(student.dateOfBirth),
          gender: student.gender,
          bformCnic: student.bformCnic ?? '',
          admissionDate: toISODateInput(student.admissionDate),
          parentPhone: student.parentPhone ?? '',
          studentPhone: student.studentPhone ?? '',
          whatsappNumber: student.whatsappNumber ?? '',
          email: student.email ?? '',
          address: student.address ?? '',
          previousSchool: student.previousSchool ?? '',
          emergencyContact: student.emergencyContact ?? '',
          notes: student.notes ?? '',
          status: student.status,
          sessionId: enrollment?.sessionId ?? currentSession?.id ?? '',
          classId: enrollment?.classId ?? '',
          sectionId: enrollment?.sectionId ?? '',
          classRollNumber: enrollment?.rollNumber ?? '',
        }}
      />
    </>
  );
}
