import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Sparkles,
  Users,
  GraduationCap,
} from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { getExamAnalytics, getAcademyAnalytics } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatCard, MiniStat } from '@/components/ui/stat-card';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, StudentAvatar, ExamStatusBadge } from '@/components/ui/status-badge';
import {
  GradeDistributionChart,
  PassFailChart,
  ComparisonBarChart,
  ProgressChart,
} from '@/components/charts/charts';
import { EXAM_TYPE_LABELS } from '@/lib/constants';
import { formatPercent, round } from '@/lib/utils';

export const metadata: Metadata = { title: 'Academy Analytics' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('analytics.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();
  const exams = await prisma.exam.findMany({
    where: { ...(session ? { sessionId: session.id } : {}), results: { some: {} } },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
  });

  if (!session || exams.length === 0) {
    return (
      <>
        <PageHeader
          title="Academy Analytics"
          description="Academy-wide performance across published examinations."
          breadcrumbs={[{ label: 'Analytics' }]}
        />
        <Card>
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="No processed results yet"
            description="Analytics appear once at least one examination result has been processed."
          />
        </Card>
      </>
    );
  }

  const examId = pick('examId') || exams[0]!.id;
  const [analytics, academyWide] = await Promise.all([
    getExamAnalytics(examId),
    getAcademyAnalytics(session.id),
  ]);

  const { totals, byClass, bySection, bySubject, gradeDistribution, exam } = analytics;

  return (
    <>
      <PageHeader
        title="Academy Analytics"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Analytics' }]}
        actions={<ExamStatusBadge status={exam.resultLocked ? 'LOCKED' : exam.status} />}
      />

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[300px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
          ]}
        />
      </Card>

      {/* ------------------------------------------------------ headline */}
      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Students" value={totals.total} tone="navy" />
        <StatCard label="Appeared" value={totals.appeared} tone="royal" />
        <StatCard label="Absent" value={totals.absent} tone="slate" />
        <StatCard label="Passed" value={totals.passed} tone="emerald" />
        <StatCard label="Failed" value={totals.failed} tone="rose" />
        <StatCard
          label="Pass Percentage"
          value={formatPercent(totals.passPercentage, 1)}
          tone="gold"
        />
      </section>

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat label="Highest %" value={formatPercent(totals.highest, 2)} tone="text-emerald-700" />
        <MiniStat label="Lowest %" value={formatPercent(totals.lowest, 2)} tone="text-rose-700" />
        <MiniStat label="Average %" value={formatPercent(totals.average, 2)} tone="text-royal-700" />
        <MiniStat label="A+ Grades" value={totals.aPlusCount} tone="text-emerald-700" />
        <MiniStat label="Failures" value={totals.failCount} tone="text-rose-700" />
      </section>

      {/* -------------------------------------------------------- charts */}
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Pass vs Fail" />
          <CardBody>
            <PassFailChart
              passed={totals.passed}
              failed={totals.failed}
              absent={totals.absent}
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Grade distribution" description="Across every appeared candidate" />
          <CardBody>
            <GradeDistributionChart data={gradeDistribution} />
          </CardBody>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Class performance" description="Average percentage per class" />
          <CardBody>
            <ComparisonBarChart
              data={byClass.map((c) => ({
                name: c.name,
                Average: c.average,
                'Pass %': c.passPercentage,
              }))}
              dataKeys={[
                { key: 'Average', label: 'Average %' },
                { key: 'Pass %', label: 'Pass %' },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Subject performance" description="Average percentage per subject" />
          <CardBody>
            <ComparisonBarChart
              layout="vertical"
              height={Math.max(240, bySubject.length * 26)}
              data={bySubject.map((s) => ({
                name: `${s.code} · ${s.className}`,
                Average: s.average,
              }))}
              dataKeys={[{ key: 'Average', label: 'Average %' }]}
            />
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------ academy summary */}
      <Card className="mb-5">
        <CardHeader
          title="Academy-wide picture"
          description={`Across ${academyWide.perExam.length} published examination(s) in session ${session.name}`}
        />
        <CardBody className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Trophy,
              tone: 'border-emerald-200 bg-emerald-50/50 text-emerald-700',
              label: 'Best performing class',
              value: academyWide.best?.class?.name ?? '—',
              hint: academyWide.best?.class
                ? `${formatPercent(academyWide.best.class.average, 1)} average`
                : '',
            },
            {
              icon: Sparkles,
              tone: 'border-royal-200 bg-royal-50/50 text-royal-700',
              label: 'Best performing subject',
              value: academyWide.best?.subject?.name ?? '—',
              hint: academyWide.best?.subject
                ? `${formatPercent(academyWide.best.subject.average, 1)} average`
                : '',
            },
            {
              icon: AlertTriangle,
              tone: 'border-amber-200 bg-amber-50/50 text-amber-700',
              label: 'Class needing attention',
              value: academyWide.needsAttention?.class?.name ?? '—',
              hint: academyWide.needsAttention?.class
                ? `${formatPercent(academyWide.needsAttention.class.average, 1)} average`
                : '',
            },
            {
              icon: AlertTriangle,
              tone: 'border-rose-200 bg-rose-50/50 text-rose-700',
              label: 'Subject needing attention',
              value: academyWide.needsAttention?.subject?.name ?? '—',
              hint: academyWide.needsAttention?.subject
                ? `${formatPercent(academyWide.needsAttention.subject.average, 1)} average`
                : '',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider">
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </p>
                <p className="mt-1.5 text-[15px] font-bold text-navy-900">{item.value}</p>
                <p className="text-[12px] text-slate-600 tabular">{item.hint}</p>
              </div>
            );
          })}
        </CardBody>

        <div className="grid gap-5 border-t border-slate-200 p-5 lg:grid-cols-2">
          <div>
            <p className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-navy-700">
              Examination trend
            </p>
            <ProgressChart
              height={230}
              data={academyWide.perExam.map((e) => ({
                label: e.name.length > 14 ? `${e.name.slice(0, 13)}…` : e.name,
                percentage: e.passPercentage,
                classAverage: e.average,
              }))}
            />
          </div>

          <div className="space-y-3.5">
            {academyWide.best?.topper && (
              <div className="flex items-center gap-3.5 rounded-xl border border-gold-300 bg-gold-50/50 p-4">
                <StudentAvatar
                  name={academyWide.best.topper.student.fullName}
                  photoPath={academyWide.best.topper.student.photoPath}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-gold-700">
                    Top student
                  </p>
                  <Link
                    href={`/students/${academyWide.best.topper.studentId}`}
                    className="block truncate text-[14px] font-bold text-navy-900 hover:text-royal-700"
                  >
                    {academyWide.best.topper.student.fullName}
                  </Link>
                  <p className="truncate text-[12px] text-slate-600">
                    {academyWide.best.topper.enrollment.schoolClass.name} —{' '}
                    {academyWide.best.topper.enrollment.section.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-navy-900 tabular">
                    {formatPercent(academyWide.best.topper.percentage)}
                  </p>
                  <GradeBadge grade={academyWide.best.topper.grade} />
                </div>
              </div>
            )}

            {academyWide.mostImproved && (
              <div className="flex items-center gap-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
                    Most improved student
                  </p>
                  <Link
                    href={`/students/${academyWide.mostImproved.studentId}`}
                    className="block truncate text-[14px] font-bold text-navy-900 hover:text-royal-700"
                  >
                    {academyWide.mostImproved.name}
                  </Link>
                  <p className="truncate text-[12px] text-slate-600 tabular">
                    {formatPercent(academyWide.mostImproved.from, 1)} →{' '}
                    {formatPercent(academyWide.mostImproved.to, 1)}
                  </p>
                </div>
                <Badge tone="bg-emerald-600 text-white ring-emerald-700">
                  +{round(academyWide.mostImproved.gain, 2)}%
                </Badge>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/analytics/classes"
                className="rounded-xl border border-slate-200 p-4 transition hover:border-royal-300 hover:bg-royal-50/40"
              >
                <Users className="h-4 w-4 text-royal-600" />
                <p className="mt-1.5 text-[13px] font-bold text-navy-900">Class analytics</p>
                <p className="text-[11.5px] text-slate-500">Section-level breakdown</p>
              </Link>
              <Link
                href="/analytics/subjects"
                className="rounded-xl border border-slate-200 p-4 transition hover:border-royal-300 hover:bg-royal-50/40"
              >
                <GraduationCap className="h-4 w-4 text-royal-600" />
                <p className="mt-1.5 text-[13px] font-bold text-navy-900">Subject analytics</p>
                <p className="text-[11.5px] text-slate-500">Per-subject outcomes</p>
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {/* --------------------------------------------------------- tables */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Class-wise summary" />
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th align="center">Appeared</Th>
                  <Th align="center">Passed</Th>
                  <Th align="center">Pass %</Th>
                  <Th align="center">Average</Th>
                  <Th align="center">Highest</Th>
                </tr>
              </thead>
              <tbody>
                {byClass.map((row) => (
                  <tr key={row.id}>
                    <Td className="font-bold text-navy-900">{row.name}</Td>
                    <Td align="center" className="tabular">{row.appeared}</Td>
                    <Td align="center" className="tabular text-emerald-700">{row.passed}</Td>
                    <Td align="center" className="font-semibold tabular">
                      {formatPercent(row.passPercentage, 1)}
                    </Td>
                    <Td align="center" className="tabular">{formatPercent(row.average, 1)}</Td>
                    <Td align="center" className="tabular">{formatPercent(row.highest, 1)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader title="Section-wise summary" />
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Section</Th>
                  <Th align="center">Appeared</Th>
                  <Th align="center">Passed</Th>
                  <Th align="center">Pass %</Th>
                  <Th align="center">Average</Th>
                </tr>
              </thead>
              <tbody>
                {bySection.map((row) => (
                  <tr key={row.id}>
                    <Td className="font-semibold text-navy-900">{row.name}</Td>
                    <Td align="center" className="tabular">{row.appeared}</Td>
                    <Td align="center" className="tabular text-emerald-700">{row.passed}</Td>
                    <Td align="center" className="font-semibold tabular">
                      {formatPercent(row.passPercentage, 1)}
                    </Td>
                    <Td align="center" className="tabular">{formatPercent(row.average, 1)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}
