import type { Metadata } from 'next';
import { BookOpen, AlertTriangle } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { getExamAnalytics, getSubjectToppers } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, Badge, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { ComparisonBarChart } from '@/components/charts/charts';
import { StudentAvatar } from '@/components/ui/status-badge';
import { formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Subject Analytics' };
export const dynamic = 'force-dynamic';

export default async function SubjectAnalyticsPage({
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

  if (exams.length === 0) {
    return (
      <>
        <PageHeader
          title="Subject Analytics"
          description="How each subject performed in an examination."
          breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Subject Analytics' }]}
        />
        <Card>
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No processed results"
            description="Process an examination result to see subject analytics."
          />
        </Card>
      </>
    );
  }

  const examId = pick('examId') || exams[0]!.id;
  const classFilter = pick('classId');

  const [analytics, toppers] = await Promise.all([
    getExamAnalytics(examId),
    getSubjectToppers(examId),
  ]);

  const subjects = classFilter
    ? analytics.bySubject.filter(
        (s) => s.className === analytics.byClass.find((c) => c.id === classFilter)?.name,
      )
    : analytics.bySubject;

  const weakest = [...subjects].sort((a, b) => a.average - b.average).slice(0, 3);

  return (
    <>
      <PageHeader
        title="Subject Analytics"
        description={`${analytics.exam.name} · Session ${analytics.exam.session.name}`}
        breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Subject Analytics' }]}
      />

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[250px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              className: 'w-[200px]',
              options: [
                { value: '', label: 'All classes' },
                ...analytics.byClass.map((c) => ({ value: c.id, label: c.name })),
              ],
            },
          ]}
        />
      </Card>

      {weakest.length > 0 && weakest[0]!.average < 60 && (
        <Alert tone="warning" title="Subjects needing attention" className="mb-5">
          {weakest
            .filter((s) => s.average < 60)
            .map((s) => `${s.name} (${s.className}) — ${formatPercent(s.average, 1)} average`)
            .join(' · ')}
        </Alert>
      )}

      <Card className="mb-5">
        <CardHeader title="Average percentage by subject" />
        <CardBody>
          <ComparisonBarChart
            layout="vertical"
            height={Math.max(260, subjects.length * 28)}
            data={subjects.map((s) => ({
              name: `${s.name} · ${s.className}`,
              Average: s.average,
              'Pass %': s.passPercentage,
            }))}
            dataKeys={[
              { key: 'Average', label: 'Average %' },
              { key: 'Pass %', label: 'Pass %' },
            ]}
          />
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Subject-wise breakdown" />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th>Class</Th>
                <Th align="center">Attempted</Th>
                <Th align="center">Passed</Th>
                <Th align="center">Failed</Th>
                <Th align="center">Absent</Th>
                <Th align="center">Pass %</Th>
                <Th align="center">Average</Th>
                <Th align="center">Highest</Th>
                <Th align="center">Lowest</Th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((row) => (
                <tr key={`${row.code}-${row.className}`}>
                  <Td>
                    <span className="font-bold text-navy-900">{row.name}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
                      {row.code}
                    </span>
                  </Td>
                  <Td className="text-slate-700">{row.className}</Td>
                  <Td align="center" className="tabular">{row.attempted}</Td>
                  <Td align="center" className="tabular text-emerald-700">{row.passed}</Td>
                  <Td align="center" className="tabular text-rose-700">{row.failed}</Td>
                  <Td align="center" className="tabular text-slate-500">{row.absent}</Td>
                  <Td align="center" className="font-semibold tabular">
                    {formatPercent(row.passPercentage, 1)}
                  </Td>
                  <Td align="center" className="tabular">{formatPercent(row.average, 1)}</Td>
                  <Td align="center" className="tabular">{formatPercent(row.highest, 1)}</Td>
                  <Td align="center" className="tabular">{formatPercent(row.lowest, 1)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="Subject toppers" description="Highest scorer in each subject" />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {toppers
            .filter(
              (t) =>
                !classFilter ||
                t.className === analytics.byClass.find((c) => c.id === classFilter)?.name,
            )
            .map((row) => (
              <div
                key={`${row.subjectCode}-${row.className}`}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-royal-600" />
                  <p className="text-[12.5px] font-bold text-navy-900">{row.subjectName}</p>
                  <Badge className="ml-auto">{row.className}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <StudentAvatar name={row.studentName} photoPath={row.photoPath} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-navy-900">
                      {row.studentName}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-500">
                      Section {row.sectionName}
                    </p>
                  </div>
                  <p className="shrink-0 text-[14px] font-bold text-navy-900 tabular">
                    {row.obtainedMarks}
                    <span className="text-[11px] font-medium text-slate-400">/{row.maxMarks}</span>
                  </p>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}
