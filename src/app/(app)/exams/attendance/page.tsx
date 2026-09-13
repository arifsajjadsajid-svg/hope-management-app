import type { Metadata } from 'next';
import { UserCheck, Printer } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, LinkButton, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { AttendanceGrid, type AttendanceRow } from './attendance-grid';
import { formatDate, formatTime12 } from '@/lib/utils';

export const metadata: Metadata = { title: 'Exam Attendance' };
export const dynamic = 'force-dynamic';

export default async function ExamAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('exams.view');
  const canManage = userCan(user, 'attendance.manage');
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
          title="Exam Attendance"
          description="Record who sat each paper."
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Exam Attendance' }]}
        />
        <Card>
          <EmptyState
            icon={<UserCheck className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination and build its date sheet first."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { session: { select: { name: true } } },
  });

  const papers = await prisma.dateSheetEntry.findMany({
    where: { examId },
    include: {
      examSubject: { include: { subject: { select: { name: true, code: true } } } },
      schoolClass: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      _count: { select: { attendance: true } },
    },
    orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
  });

  const paperId = pick('paperId') || papers[0]?.id;
  const paper = papers.find((p) => p.id === paperId) ?? null;

  let rows: AttendanceRow[] = [];

  if (paper) {
    const [enrollments, existing, rolls, seats] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          sessionId: exam.sessionId,
          classId: paper.classId,
          ...(paper.sectionId ? { sectionId: paper.sectionId } : {}),
          student: { status: 'ACTIVE' },
        },
        include: {
          student: { select: { id: true, fullName: true, fatherName: true } },
          schoolClass: { select: { name: true } },
          section: { select: { name: true } },
        },
        orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
      }),
      prisma.examAttendance.findMany({ where: { dateSheetEntryId: paper.id } }),
      prisma.rollNumberAllocation.findMany({ where: { examId } }),
      prisma.seatAssignment.findMany({ where: { examId } }),
    ]);

    const existingByStudent = new Map(existing.map((a) => [a.studentId, a]));
    const rollByStudent = new Map(rolls.map((r) => [r.studentId, r.rollNumber]));
    const seatByStudent = new Map(seats.map((s) => [s.studentId, s.seatNumber]));

    rows = enrollments
      .map((enrollment) => {
        const record = existingByStudent.get(enrollment.studentId);
        return {
          studentId: enrollment.studentId,
          rollNumber:
            rollByStudent.get(enrollment.studentId) ?? enrollment.rollNumber ?? '—',
          studentName: enrollment.student.fullName,
          fatherName: enrollment.student.fatherName,
          className: enrollment.schoolClass.name,
          sectionName: enrollment.section.name,
          seatNumber: seatByStudent.get(enrollment.studentId) ?? null,
          status: (record?.status ?? 'PRESENT') as AttendanceRow['status'],
          remarks: record?.remarks ?? '',
        };
      })
      .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
  }

  return (
    <>
      <PageHeader
        title="Exam Attendance"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Exam Attendance' }]}
        actions={
          paper && (
            <LinkButton
              href={`/print/attendance-sheet?paperId=${paper.id}`}
              variant="outline"
              size="sm"
              newTab
            >
              <Printer className="h-4 w-4" />
              Print Attendance Sheet
            </LinkButton>
          )
        }
      />

      {papers.length === 0 && (
        <Alert tone="warning" title="No date sheet" className="mb-5">
          Attendance is recorded per paper, so the date sheet must be built first.{' '}
          <a href={`/exams/date-sheets?examId=${exam.id}`} className="font-semibold underline">
            Open the date sheet
          </a>
        </Alert>
      )}

      <Card>
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
              name: 'paperId',
              label: 'Paper',
              className: 'min-w-[320px] flex-1',
              options: papers.map((p) => ({
                value: p.id,
                label: `${formatDate(p.paperDate)} · ${formatTime12(p.startTime)} · ${p.examSubject.subject.name} — ${p.schoolClass.name}${
                  p.section ? ` (${p.section.name})` : ''
                }${p._count.attendance > 0 ? ' ✓' : ''}`,
              })),
            },
          ]}
        />

        {!paper ? (
          <EmptyState
            icon={<UserCheck className="h-6 w-6" />}
            title="Select a paper"
            description="Choose a paper from the date sheet to record attendance."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UserCheck className="h-6 w-6" />}
            title="No candidates"
            description="No active students are enrolled in the class this paper belongs to."
          />
        ) : (
          <>
            <div className="border-b border-slate-200 bg-navy-50/50 px-5 py-3">
              <p className="text-[13px] font-bold text-navy-900">
                {paper.examSubject.subject.name} ({paper.examSubject.subject.code}) —{' '}
                {paper.schoolClass.name}
                {paper.section ? ` · Section ${paper.section.name}` : ''}
              </p>
              <p className="text-[12.5px] text-slate-600 tabular">
                {formatDate(paper.paperDate)} · {formatTime12(paper.startTime)} –{' '}
                {formatTime12(paper.endTime)}
              </p>
            </div>

            <AttendanceGrid
              key={paper.id}
              dateSheetEntryId={paper.id}
              initialRows={rows}
              readOnly={!canManage || exam.resultLocked}
            />
          </>
        )}
      </Card>
    </>
  );
}
