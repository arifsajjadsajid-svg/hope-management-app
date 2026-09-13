import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Pencil,
  CalendarDays,
  IdCard,
  Printer,
  Grid3x3,
  UserCheck,
  PenSquare,
  ShieldCheck,
  Award,
  Lock,
  Check,
} from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader, DetailItem } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, LinkButton, Badge, Alert } from '@/components/ui/primitives';
import { ExamStatusBadge } from '@/components/ui/status-badge';
import {
  ExamSubjectEditor,
  ExamStatusControl,
  DeleteExamButton,
} from './exam-detail-clients';
import {
  EXAM_TYPE_LABELS,
  ROLL_METHOD_LABELS,
  EXAM_STATUS_LABELS,
} from '@/lib/constants';
import { formatDate, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const exam = await prisma.exam.findUnique({ where: { id }, select: { name: true } });
  return { title: exam?.name ?? 'Examination' };
}

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('exams.view');
  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      session: true,
      gradingScheme: { select: { name: true } },
      resultPolicy: { select: { name: true, overallPassPercent: true, rankingMethod: true } },
      examClasses: { include: { schoolClass: { select: { id: true, name: true } } } },
      examSections: {
        include: { section: { select: { id: true, name: true, schoolClass: { select: { name: true } } } } },
      },
      examSubjects: {
        include: {
          subject: {
            select: {
              name: true,
              code: true,
              type: true,
              schoolClass: { select: { name: true } },
            },
          },
          _count: { select: { marks: true } },
        },
        orderBy: [{ displayOrder: 'asc' }],
      },
      workflowEvents: { orderBy: { createdAt: 'desc' }, take: 8 },
      _count: {
        select: {
          dateSheets: true,
          rollNumbers: true,
          seats: true,
          invigilations: true,
          attendance: true,
          marks: true,
          results: true,
        },
      },
    },
  });

  if (!exam) notFound();

  const expectedMarks = await (async () => {
    const classIds = exam.examClasses.map((c) => c.classId);
    const sectionIds = exam.examSections.map((s) => s.sectionId);
    const enrollments = await prisma.enrollment.findMany({
      where: {
        sessionId: exam.sessionId,
        classId: { in: classIds.length ? classIds : ['__none__'] },
        ...(sectionIds.length ? { sectionId: { in: sectionIds } } : {}),
      },
      select: { classId: true },
    });
    // Each student sits every included subject of their own class.
    const subjectsPerClass = new Map<string, number>();
    for (const es of exam.examSubjects) {
      if (!es.isIncluded) continue;
      const key = es.subject.schoolClass.name;
      subjectsPerClass.set(key, (subjectsPerClass.get(key) ?? 0) + 1);
    }
    const classNameById = new Map(exam.examClasses.map((c) => [c.classId, c.schoolClass.name]));
    return enrollments.reduce((total, enrollment) => {
      const className = classNameById.get(enrollment.classId);
      return total + (className ? (subjectsPerClass.get(className) ?? 0) : 0);
    }, 0);
  })();

  const editable = !exam.resultLocked;
  const marksProgress = expectedMarks ? Math.round((exam._count.marks / expectedMarks) * 100) : 0;

  const steps = [
    {
      label: 'Date sheet',
      done: exam._count.dateSheets > 0,
      count: exam._count.dateSheets,
      href: `/exams/date-sheets?examId=${exam.id}`,
      icon: CalendarDays,
    },
    {
      label: 'Roll numbers',
      done: exam._count.rollNumbers > 0,
      count: exam._count.rollNumbers,
      href: `/exams/roll-numbers?examId=${exam.id}`,
      icon: IdCard,
    },
    {
      label: 'Seating plan',
      done: exam._count.seats > 0,
      count: exam._count.seats,
      href: `/exams/seating?examId=${exam.id}`,
      icon: Grid3x3,
    },
    {
      label: 'Invigilation',
      done: exam._count.invigilations > 0,
      count: exam._count.invigilations,
      href: `/exams/invigilation?examId=${exam.id}`,
      icon: ShieldCheck,
    },
    {
      label: 'Attendance',
      done: exam._count.attendance > 0,
      count: exam._count.attendance,
      href: `/exams/attendance?examId=${exam.id}`,
      icon: UserCheck,
    },
    {
      label: 'Marks entry',
      done: expectedMarks > 0 && exam._count.marks >= expectedMarks,
      count: exam._count.marks,
      href: `/marks/entry?examId=${exam.id}`,
      icon: PenSquare,
    },
    {
      label: 'Results',
      done: exam._count.results > 0,
      count: exam._count.results,
      href: `/results/process?examId=${exam.id}`,
      icon: Award,
    },
  ];

  return (
    <>
      <PageHeader
        title={exam.name}
        description={`${EXAM_TYPE_LABELS[exam.type] ?? exam.type} · Session ${exam.session.name} · ${formatDate(
          exam.startDate,
        )} – ${formatDate(exam.endDate)}`}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: exam.name }]}
        actions={
          <>
            <LinkButton
              href={`/print/date-sheet?examId=${exam.id}`}
              variant="outline"
              size="sm"
              newTab
            >
              <Printer className="h-4 w-4" />
              Date Sheet
            </LinkButton>
            {userCan(user, 'exams.edit') && (
              <ExamStatusControl
                examId={exam.id}
                currentStatus={exam.status}
                locked={exam.resultLocked}
              />
            )}
            {userCan(user, 'exams.delete') && (
              <DeleteExamButton
                examId={exam.id}
                examName={exam.name}
                disabled={exam._count.marks > 0 || exam._count.results > 0 || exam.resultLocked}
              />
            )}
            {userCan(user, 'exams.edit') && (
              <LinkButton href={`/exams/${exam.id}/edit`} size="sm" variant="primary">
                <Pencil className="h-4 w-4" />
                Edit
              </LinkButton>
            )}
          </>
        }
      />

      {exam.resultLocked && (
        <Alert tone="warning" title="Results are locked" className="mb-5">
          Marks and structural changes are blocked. A Super Admin can unlock the result from{' '}
          <Link href="/results/publish" className="font-semibold underline">
            Publish Results
          </Link>
          , stating a reason which is recorded in the audit log.
        </Alert>
      )}

      {/* ------------------------------------------------------ workflow steps */}
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.label}
              href={step.href}
              className={`card flex flex-col items-center gap-2 p-3.5 text-center transition hover:-translate-y-0.5 hover:shadow-elevated ${
                step.done ? 'border-emerald-200 bg-emerald-50/40' : ''
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  step.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {step.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="text-[12px] font-bold leading-tight text-navy-900">{step.label}</span>
              <span className="text-[11px] text-slate-500 tabular">{step.count}</span>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Examination details"
              actions={<ExamStatusBadge status={exam.resultLocked ? 'LOCKED' : exam.status} />}
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <DetailItem label="Type" value={EXAM_TYPE_LABELS[exam.type] ?? exam.type} />
                <DetailItem label="Session" value={exam.session.name} />
                <DetailItem label="Start Date" value={formatDate(exam.startDate)} />
                <DetailItem label="End Date" value={formatDate(exam.endDate)} />
                <DetailItem label="Result Date" value={formatDate(exam.resultPublishDate)} />
                <DetailItem label="Status" value={EXAM_STATUS_LABELS[exam.status] ?? exam.status} />
                <DetailItem
                  label="Grading Scheme"
                  value={exam.gradingScheme?.name ?? 'Academy default'}
                />
                <DetailItem
                  label="Result Policy"
                  value={exam.resultPolicy?.name ?? 'Academy default'}
                />
                <DetailItem
                  label="Pass Mark"
                  value={
                    exam.resultPolicy ? `${exam.resultPolicy.overallPassPercent}% overall` : '—'
                  }
                />
                <DetailItem
                  label="Ranking"
                  value={exam.resultPolicy?.rankingMethod ?? 'COMPETITION'}
                />
                <DetailItem
                  label="Roll Number Method"
                  value={ROLL_METHOD_LABELS[exam.rollNumberMethod] ?? exam.rollNumberMethod}
                  className="col-span-2"
                />
                <DetailItem
                  label="Examination Centre"
                  value={exam.examCenter}
                  className="col-span-2"
                />
                {exam.instructions && (
                  <DetailItem
                    label="Instructions"
                    value={<span className="whitespace-pre-line">{exam.instructions}</span>}
                    className="col-span-2"
                  />
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Participating classes & sections" />
            <CardBody className="space-y-3.5">
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Classes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {exam.examClasses.map((ec) => (
                    <Badge key={ec.id} tone="bg-navy-900 text-gold-300 ring-navy-800">
                      {ec.schoolClass.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Sections
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {exam.examSections.length === 0 ? (
                    <span className="text-[13px] text-slate-400">All sections</span>
                  ) : (
                    exam.examSections.map((es) => (
                      <Badge key={es.id} tone="bg-royal-50 text-royal-700 ring-royal-200">
                        {es.section.schoolClass.name} — {es.section.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Marks entry progress" />
            <CardBody>
              <div className="flex items-end justify-between">
                <p className="text-2xl font-bold text-navy-900 tabular">
                  {exam._count.marks.toLocaleString()}
                  <span className="text-sm font-medium text-slate-400">
                    {' '}
                    / {expectedMarks.toLocaleString()}
                  </span>
                </p>
                <p className="text-sm font-bold text-royal-700 tabular">{marksProgress}%</p>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    marksProgress >= 100 ? 'bg-emerald-500' : 'bg-royal-500'
                  }`}
                  style={{ width: `${Math.min(100, marksProgress)}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-slate-500">
                {marksProgress >= 100
                  ? 'All expected marks have been recorded.'
                  : `${(expectedMarks - exam._count.marks).toLocaleString()} entries still outstanding.`}
              </p>
            </CardBody>
          </Card>

          {exam.workflowEvents.length > 0 && (
            <Card>
              <CardHeader title="Result workflow trail" />
              <ul className="divide-y divide-slate-100">
                {exam.workflowEvents.map((event) => (
                  <li key={event.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-slate-400" />
                      <p className="text-[13px] font-semibold text-navy-900">
                        {event.action.replace(/_/g, ' ')}
                      </p>
                    </div>
                    {event.reason && (
                      <p className="mt-0.5 text-[12px] text-slate-600">{event.reason}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-400 tabular">
                      {event.userName ?? 'System'} · {formatDateTime(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------ subjects */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title="Examination subjects"
              description="Marks below apply to this examination only — the class subject definitions are untouched."
            />
            {exam.examSubjects.length === 0 ? (
              <CardBody>
                <Alert tone="warning">
                  No subjects are attached. Edit the examination and select at least one class that
                  has subjects defined.
                </Alert>
              </CardBody>
            ) : (
              <ExamSubjectEditor
                editable={editable && userCan(user, 'exams.edit')}
                rows={exam.examSubjects.map((es) => ({
                  id: es.id,
                  subjectName: es.subject.name,
                  subjectCode: es.subject.code,
                  subjectType: es.subject.type,
                  className: es.subject.schoolClass.name,
                  isIncluded: es.isIncluded,
                  maxMarks: es.maxMarks,
                  passingMarks: es.passingMarks,
                  theoryMarks: es.theoryMarks,
                  practicalMarks: es.practicalMarks,
                  practicalPassing: es.practicalPassing,
                  marksRecorded: es._count.marks,
                }))}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
