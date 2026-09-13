import type { Metadata } from 'next';
import { PenSquare } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { MarksGrid, type MarksGridRow } from './marks-grid';
import { ROLE } from '@/lib/constants';

export const metadata: Metadata = { title: 'Enter Marks' };
export const dynamic = 'force-dynamic';

export default async function MarksEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('marks.view');
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
          title="Enter Marks"
          description="Record subject marks for an examination."
          breadcrumbs={[{ label: 'Marks' }, { label: 'Enter Marks' }]}
        />
        <Card>
          <EmptyState
            icon={<PenSquare className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination before entering marks."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      examClasses: { select: { classId: true } },
      examSections: { select: { sectionId: true } },
    },
  });

  // Teachers only see the subjects they are assigned to.
  const isTeacher = user.roleCode === ROLE.TEACHER;
  const teacherSubjectIds = isTeacher && user.teacherId
    ? (
        await prisma.teacherAssignment.findMany({
          where: { teacherId: user.teacherId },
          select: { subjectId: true },
        })
      ).map((a) => a.subjectId)
    : null;

  const examSubjects = await prisma.examSubject.findMany({
    where: {
      examId,
      isIncluded: true,
      ...(teacherSubjectIds ? { subjectId: { in: teacherSubjectIds } } : {}),
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          classId: true,
          schoolClass: { select: { name: true } },
        },
      },
    },
    orderBy: [{ displayOrder: 'asc' }],
  });

  const examSubjectId = pick('examSubjectId') || examSubjects[0]?.id;
  const examSubject = examSubjects.find((es) => es.id === examSubjectId) ?? null;

  const sections = examSubject
    ? await prisma.section.findMany({
        where: {
          classId: examSubject.subject.classId,
          ...(exam.examSections.length
            ? { id: { in: exam.examSections.map((s) => s.sectionId) } }
            : {}),
          ...(isTeacher && user.teacherId
            ? {
                assignments: {
                  some: { teacherId: user.teacherId, subjectId: examSubject.subject.id },
                },
              }
            : {}),
        },
        orderBy: { name: 'asc' },
      })
    : [];

  const sectionId = pick('sectionId') || sections[0]?.id || null;

  let rows: MarksGridRow[] = [];

  if (examSubject && sectionId) {
    const [enrollments, marks, rolls, attendanceRows] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          sessionId: exam.sessionId,
          classId: examSubject.subject.classId,
          sectionId,
          student: { status: 'ACTIVE' },
        },
        include: {
          student: { select: { id: true, fullName: true, fatherName: true } },
          section: { select: { name: true } },
        },
      }),
      prisma.mark.findMany({ where: { examSubjectId: examSubject.id } }),
      prisma.rollNumberAllocation.findMany({ where: { examId } }),
      prisma.examAttendance.findMany({
        where: { examId, dateSheetEntry: { examSubjectId: examSubject.id } },
      }),
    ]);

    const markByStudent = new Map(marks.map((m) => [m.studentId, m]));
    const rollByStudent = new Map(rolls.map((r) => [r.studentId, r.rollNumber]));
    const attendanceByStudent = new Map(attendanceRows.map((a) => [a.studentId, a.status]));
    const hasPractical = examSubject.practicalMarks > 0;

    rows = enrollments
      .map((enrollment) => {
        const mark = markByStudent.get(enrollment.studentId);
        const special = mark && mark.specialStatus !== 'NONE' ? mark.specialStatus : null;

        return {
          studentId: enrollment.studentId,
          rollNumber: rollByStudent.get(enrollment.studentId) ?? enrollment.rollNumber ?? '—',
          classRoll: enrollment.rollNumber,
          studentName: enrollment.student.fullName,
          fatherName: enrollment.student.fatherName,
          sectionName: enrollment.section.name,
          theory: special
            ? special
            : mark?.theoryMarks !== null && mark?.theoryMarks !== undefined
              ? String(mark.theoryMarks)
              : mark?.obtainedMarks !== null && mark?.obtainedMarks !== undefined && !hasPractical
                ? String(mark.obtainedMarks)
                : '',
          practical:
            !special && mark?.practicalMarks !== null && mark?.practicalMarks !== undefined
              ? String(mark.practicalMarks)
              : '',
          remarks: mark?.remarks ?? '',
          attendance: (attendanceByStudent.get(enrollment.studentId) ?? null) as
            | 'PRESENT'
            | 'ABSENT'
            | 'LATE'
            | null,
        };
      })
      .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
  }

  const canEnter = userCan(user, 'marks.enter');
  const locked = exam.resultLocked;
  const publishedAndTeacher = exam.status === 'PUBLISHED' && isTeacher;
  const readOnly = !canEnter || locked || publishedAndTeacher;
  const readOnlyReason = locked
    ? 'Results for this examination are locked. Ask a Super Admin to unlock the result before editing marks.'
    : publishedAndTeacher
      ? 'This result has been published. Teachers cannot change marks after publication.'
      : !canEnter
        ? 'Your role can view marks but not edit them.'
        : undefined;

  return (
    <>
      <PageHeader
        title="Enter Marks"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Marks' }, { label: 'Enter Marks' }]}
      />

      {isTeacher && examSubjects.length === 0 && (
        <Alert tone="info" title="No assigned subjects" className="mb-5">
          You have no subject assignments for this examination. Ask the Examination Controller to
          assign your subjects and sections under <strong>Academics → Teachers</strong>.
        </Alert>
      )}

      <Card>
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[230px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'examSubjectId',
              label: 'Subject',
              className: 'min-w-[250px] flex-1',
              options: examSubjects.map((es) => ({
                value: es.id,
                label: `${es.subject.name} (${es.subject.code}) — ${es.subject.schoolClass.name}`,
              })),
            },
            {
              type: 'select',
              name: 'sectionId',
              label: 'Section',
              className: 'w-[160px]',
              options: sections.map((s) => ({ value: s.id, label: s.name })),
            },
          ]}
        />

        {!examSubject ? (
          <EmptyState
            icon={<PenSquare className="h-6 w-6" />}
            title="No subjects available"
            description="This examination has no included subjects, or none are assigned to you."
          />
        ) : !sectionId ? (
          <EmptyState
            icon={<PenSquare className="h-6 w-6" />}
            title="No sections available"
            description="The class for this subject has no sections in this examination."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<PenSquare className="h-6 w-6" />}
            title="No candidates"
            description="No active students are enrolled in this section."
          />
        ) : (
          <MarksGrid
            key={`${examSubject.id}-${sectionId}`}
            examId={exam.id}
            examSubjectId={examSubject.id}
            sectionId={sectionId}
            subjectName={`${examSubject.subject.name} — ${examSubject.subject.schoolClass.name}`}
            maxMarks={examSubject.maxMarks}
            passingMarks={examSubject.passingMarks}
            theoryMax={examSubject.theoryMarks}
            practicalMax={examSubject.practicalMarks}
            practicalPassing={examSubject.practicalPassing}
            initialRows={rows}
            readOnly={readOnly}
            readOnlyReason={readOnlyReason}
            canClear={userCan(user, 'marks.verify') && !locked}
          />
        )}
      </Card>
    </>
  );
}
