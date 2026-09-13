import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { getExamAnalytics } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { MiniStat } from '@/components/ui/stat-card';
import { ComparisonBarChart, GradeDistributionChart } from '@/components/charts/charts';
import { formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Class Analytics' };
export const dynamic = 'force-dynamic';

export default async function ClassAnalyticsPage({
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
          title="Class Analytics"
          description="Class and section performance for an examination."
          breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Class Analytics' }]}
        />
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No processed results"
            description="Process an examination result to see class analytics."
          />
        </Card>
      </>
    );
  }

  const examId = pick('examId') || exams[0]!.id;
  const classFilter = pick('classId');
  const analytics = await getExamAnalytics(examId);

  const classes = analytics.byClass;
  const selected = classFilter ? classes.find((c) => c.id === classFilter) : null;

  // Per-class grade distribution, computed from the stored results.
  const classResults = classFilter
    ? await prisma.result.findMany({
        where: { examId, enrollment: { classId: classFilter } },
        select: { grade: true, status: true },
      })
    : [];

  const gradeCounts = new Map<string, number>(
    analytics.gradeDistribution.map((g) => [g.grade, 0]),
  );
  for (const row of classResults) {
    if (row.status === 'ABSENT' || row.status === 'WITHHELD') continue;
    gradeCounts.set(row.grade, (gradeCounts.get(row.grade) ?? 0) + 1);
  }

  const sectionsOfClass = classFilter
    ? analytics.bySection.filter((s) =>
        s.name.startsWith(`${selected?.name ?? ''} —`),
      )
    : analytics.bySection;

  return (
    <>
      <PageHeader
        title="Class Analytics"
        description={`${analytics.exam.name} · Session ${analytics.exam.session.name}`}
        breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Class Analytics' }]}
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
                ...classes.map((c) => ({ value: c.id, label: c.name })),
              ],
            },
          ]}
        />
      </Card>

      {selected && (
        <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Total" value={selected.total} />
          <MiniStat label="Appeared" value={selected.appeared} />
          <MiniStat label="Passed" value={selected.passed} tone="text-emerald-700" />
          <MiniStat label="Failed" value={selected.failed} tone="text-rose-700" />
          <MiniStat label="Pass %" value={formatPercent(selected.passPercentage, 1)} tone="text-royal-700" />
          <MiniStat label="Average" value={formatPercent(selected.average, 1)} tone="text-navy-900" />
        </section>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Class comparison"
            description="Average and pass percentage side by side"
          />
          <CardBody>
            <ComparisonBarChart
              data={classes.map((c) => ({
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
          <CardHeader
            title={selected ? `Grade distribution — ${selected.name}` : 'Section comparison'}
          />
          <CardBody>
            {selected ? (
              <GradeDistributionChart
                data={[...gradeCounts.entries()].map(([grade, count]) => ({ grade, count }))}
              />
            ) : (
              <ComparisonBarChart
                layout="vertical"
                height={Math.max(240, analytics.bySection.length * 30)}
                data={analytics.bySection.map((s) => ({ name: s.name, Average: s.average }))}
                dataKeys={[{ key: 'Average', label: 'Average %' }]}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader title="Class-wise breakdown" />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Class</Th>
                <Th align="center">Total</Th>
                <Th align="center">Appeared</Th>
                <Th align="center">Passed</Th>
                <Th align="center">Failed</Th>
                <Th align="center">Pass %</Th>
                <Th align="center">Average</Th>
                <Th align="center">Highest</Th>
                <Th align="center">Lowest</Th>
              </tr>
            </thead>
            <tbody>
              {classes.map((row) => (
                <tr key={row.id} className={row.id === classFilter ? 'bg-royal-50/50' : undefined}>
                  <Td className="font-bold text-navy-900">{row.name}</Td>
                  <Td align="center" className="tabular">{row.total}</Td>
                  <Td align="center" className="tabular">{row.appeared}</Td>
                  <Td align="center" className="tabular text-emerald-700">{row.passed}</Td>
                  <Td align="center" className="tabular text-rose-700">{row.failed}</Td>
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
        <CardHeader title="Section-wise breakdown" />
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
              {sectionsOfClass.map((row) => (
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
    </>
  );
}
