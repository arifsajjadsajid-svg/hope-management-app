import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  GraduationCap,
  Layers,
  BookOpen,
  ClipboardList,
  Award,
  TrendingUp,
  CalendarClock,
  Activity,
  Trophy,
  FileClock,
} from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { getDashboardData } from '@/server/queries/dashboard';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardBody, EmptyState, Badge } from '@/components/ui/primitives';
import { ExamStatusBadge, GradeBadge, StudentAvatar } from '@/components/ui/status-badge';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { AUDIT_ACTION_LABELS, EXAM_TYPE_LABELS } from '@/lib/constants';
import { formatDate, formatDateTime, formatTime12, formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requirePermission('dashboard.view');
  const academy = await getAcademySettings();
  const data = await getDashboardData();

  const {
    counts,
    upcomingPapers,
    latestPublished,
    passPercentage,
    resultTotals,
    topper,
    recentActivity,
    examSummary,
    session,
  } = data;

  const firstName = user.fullName.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          session
            ? `${academy.name} — academic session ${session.name}. Here is the current state of the academy.`
            : `${academy.name}. No academic session has been created yet.`
        }
        actions={
          session && (
            <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">Session {session.name}</Badge>
          )
        }
      />

      {!session && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardBody>
            <p className="text-sm font-bold text-amber-900">No academic session configured</p>
            <p className="mt-1 text-[13px] text-amber-800">
              Create an academic session to begin enrolling students and scheduling examinations.{' '}
              <Link href="/academics/sessions" className="font-semibold underline">
                Open Sessions
              </Link>
            </p>
          </CardBody>
        </Card>
      )}

      {/* ---------------------------------------------------- headline stats */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard
          label="Total Students"
          value={counts.totalStudents}
          icon={<Users className="h-4.5 w-[18px]" />}
          tone="navy"
          href="/students"
        />
        <StatCard
          label="Active Students"
          value={counts.activeStudents}
          icon={<UserCheck className="h-[18px] w-[18px]" />}
          tone="emerald"
          href="/students?status=ACTIVE"
        />
        <StatCard
          label="Boys"
          value={counts.boys}
          hint={`${counts.activeStudents ? Math.round((counts.boys / counts.activeStudents) * 100) : 0}% of active roll`}
          icon={<GraduationCap className="h-[18px] w-[18px]" />}
          tone="royal"
          href="/students?gender=MALE"
        />
        <StatCard
          label="Girls"
          value={counts.girls}
          hint={`${counts.activeStudents ? Math.round((counts.girls / counts.activeStudents) * 100) : 0}% of active roll`}
          icon={<GraduationCap className="h-[18px] w-[18px]" />}
          tone="gold"
          href="/students?gender=FEMALE"
        />
        <StatCard
          label="Classes"
          value={counts.classCount}
          hint={`${counts.sectionCount} sections`}
          icon={<Layers className="h-[18px] w-[18px]" />}
          tone="slate"
          href="/academics/classes"
        />
        <StatCard
          label="Subjects"
          value={counts.subjectCount}
          hint={`${counts.teacherCount} teachers`}
          icon={<BookOpen className="h-[18px] w-[18px]" />}
          tone="slate"
          href="/academics/subjects"
        />
      </section>

      <section className="mt-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Active Exams"
          value={counts.activeExams}
          icon={<ClipboardList className="h-[18px] w-[18px]" />}
          tone="amber"
          href="/exams"
        />
        <StatCard
          label="Upcoming Papers"
          value={upcomingPapers.length}
          hint="next 14 days"
          icon={<CalendarClock className="h-[18px] w-[18px]" />}
          tone="royal"
          href="/exams/date-sheets"
        />
        <StatCard
          label="Results Pending"
          value={counts.pendingExams}
          hint="processing or awaiting approval"
          icon={<FileClock className="h-[18px] w-[18px]" />}
          tone="rose"
          href="/results/publish"
        />
        <StatCard
          label="Published Results"
          value={counts.publishedExams}
          icon={<Award className="h-[18px] w-[18px]" />}
          tone="emerald"
          href="/results"
        />
        <StatCard
          label="Overall Pass %"
          value={passPercentage ? formatPercent(passPercentage, 1) : '—'}
          hint={latestPublished ? latestPublished.name : 'no published result yet'}
          icon={<TrendingUp className="h-[18px] w-[18px]" />}
          tone="navy"
          href="/analytics"
        />
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        {/* ------------------------------------------------ current topper */}
        <div className="xl:col-span-1">
          <Card className="overflow-hidden">
            <div className="bg-navy-gradient px-5 py-4">
              <div className="flex items-center gap-2 text-gold-300">
                <Trophy className="h-4.5 w-[18px]" />
                <h2 className="text-[13px] font-bold uppercase tracking-wider">Current Topper</h2>
              </div>
              <p className="mt-0.5 text-[11.5px] text-navy-200">
                {latestPublished ? latestPublished.name : 'Awaiting a published result'}
              </p>
            </div>
            <CardBody>
              {topper ? (
                <div className="text-center">
                  <div className="flex justify-center">
                    <StudentAvatar name={topper.name} photoPath={topper.photoPath} size={76} />
                  </div>
                  <p className="mt-3 text-base font-bold text-navy-900">{topper.name}</p>
                  <p className="text-[12.5px] text-slate-500">S/O — D/O {topper.fatherName}</p>
                  <p className="mt-1 text-[12.5px] font-semibold text-navy-700">
                    {topper.className} — Section {topper.sectionName}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-4">
                    <div>
                      <p className="text-2xl font-bold leading-none text-navy-900 tabular">
                        {formatPercent(topper.percentage)}
                      </p>
                      <p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                        Percentage
                      </p>
                    </div>
                    <div className="h-10 w-px bg-slate-200" />
                    <div>
                      <GradeBadge grade={topper.grade} />
                      <p className="mt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                        Grade
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/students/${topper.studentId}`}
                    className="mt-4 inline-block text-[12.5px] font-semibold text-royal-700 underline underline-offset-2"
                  >
                    View student profile
                  </Link>
                </div>
              ) : (
                <EmptyState
                  icon={<Trophy className="h-6 w-6" />}
                  title="No topper yet"
                  description="Publish an examination result to see the leading student here."
                />
              )}
            </CardBody>
          </Card>

          {latestPublished && (
            <Card className="mt-5">
              <CardHeader title="Latest Result Summary" description={latestPublished.name} />
              <CardBody className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Appeared', value: resultTotals.total - resultTotals.absent },
                  { label: 'Passed', value: resultTotals.passed },
                  { label: 'Failed', value: resultTotals.failed },
                  { label: 'Absent', value: resultTotals.absent },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-slate-50 px-3.5 py-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xl font-bold text-navy-900 tabular">{item.value}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* ----------------------------------------------- exams & schedule */}
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Examinations this session"
              actions={
                <Link
                  href="/exams"
                  className="text-[12.5px] font-semibold text-royal-700 hover:underline"
                >
                  View all
                </Link>
              }
            />
            {examSummary.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-6 w-6" />}
                title="No examinations yet"
                description="Create an examination to build date sheets, generate roll numbers and record marks."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Examination</Th>
                      <Th>Type</Th>
                      <Th>Dates</Th>
                      <Th align="center">Subjects</Th>
                      <Th align="center">Results</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {examSummary.map((exam) => (
                      <tr key={exam.id}>
                        <Td>
                          <Link
                            href={`/exams/${exam.id}`}
                            className="font-semibold text-navy-900 hover:text-royal-700"
                          >
                            {exam.name}
                          </Link>
                        </Td>
                        <Td className="text-[12.5px] text-slate-600">
                          {EXAM_TYPE_LABELS[exam.type] ?? exam.type}
                        </Td>
                        <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                          {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
                        </Td>
                        <Td align="center" className="tabular">
                          {exam._count.examSubjects}
                        </Td>
                        <Td align="center" className="tabular">
                          {exam._count.results}
                        </Td>
                        <Td>
                          <ExamStatusBadge status={exam.resultLocked ? 'LOCKED' : exam.status} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Upcoming papers"
              description="Scheduled within the next fourteen days"
              actions={
                <Link
                  href="/exams/date-sheets"
                  className="text-[12.5px] font-semibold text-royal-700 hover:underline"
                >
                  Date sheets
                </Link>
              }
            />
            {upcomingPapers.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-6 w-6" />}
                title="No papers scheduled"
                description="Papers appear here once a date sheet is built for a scheduled examination."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingPapers.map((paper) => (
                  <li key={paper.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-14 shrink-0 rounded-lg bg-navy-900 py-1.5 text-center text-white">
                      <p className="text-[10px] font-bold uppercase leading-none text-gold-300">
                        {new Date(paper.paperDate).toLocaleDateString('en-GB', { month: 'short' })}
                      </p>
                      <p className="text-lg font-bold leading-tight tabular">
                        {new Date(paper.paperDate).getDate()}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-navy-900">
                        {paper.examSubject.subject.name} — {paper.schoolClass.name}
                      </p>
                      <p className="truncate text-[12px] text-slate-500">
                        {paper.exam.name} · {formatTime12(paper.startTime)} to{' '}
                        {formatTime12(paper.endTime)}
                        {paper.room ? ` · ${paper.room.name}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* -------------------------------------------------- recent activity */}
      <Card className="mt-5">
        <CardHeader
          title="Recent activity"
          description="Sensitive actions recorded in the audit log"
          actions={
            <Link
              href="/admin/audit"
              className="text-[12.5px] font-semibold text-royal-700 hover:underline"
            >
              Full audit log
            </Link>
          }
        />
        {recentActivity.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-6 w-6" />}
            title="No activity recorded yet"
            description="Every student edit, marks change, result approval and settings change is logged here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentActivity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    entry.severity === 'CRITICAL'
                      ? 'bg-rose-500'
                      : entry.severity === 'WARNING'
                        ? 'bg-amber-500'
                        : 'bg-royal-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-navy-900">
                    {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  {entry.description && (
                    <p className="truncate text-[12.5px] text-slate-600">{entry.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-medium text-slate-600">{entry.userName ?? '—'}</p>
                  <p className="text-[11px] text-slate-400 tabular">
                    {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
