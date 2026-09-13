import type { Metadata } from 'next';
import { GitCompareArrows, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getExamAnalytics } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { ComparisonBarChart } from '@/components/charts/charts';
import { EXAM_TYPE_LABELS } from '@/lib/constants';
import { formatPercent, round } from '@/lib/utils';

export const metadata: Metadata = { title: 'Exam Comparison' };
export const dynamic = 'force-dynamic';

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const tone = value > 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-slate-500';
  return (
    <span className={`inline-flex items-center gap-1 font-semibold tabular ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {value > 0 ? '+' : ''}
      {round(value, 2)}%
    </span>
  );
}

export default async function ExamComparisonPage({
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

  // Comparison spans sessions, so every examination with results is offered.
  const exams = await prisma.exam.findMany({
    where: { results: { some: {} } },
    orderBy: { startDate: 'desc' },
    include: { session: { select: { name: true } } },
  });

  if (exams.length < 2) {
    return (
      <>
        <PageHeader
          title="Exam Comparison"
          description="Compare two examinations side by side."
          breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Exam Comparison' }]}
        />
        <Card>
          <EmptyState
            icon={<GitCompareArrows className="h-6 w-6" />}
            title="Not enough processed results"
            description="At least two examinations with processed results are needed for a comparison."
          />
        </Card>
      </>
    );
  }

  const leftId = pick('leftId') || exams[1]!.id;
  const rightId = pick('rightId') || exams[0]!.id;

  const [left, right] = await Promise.all([
    getExamAnalytics(leftId),
    getExamAnalytics(rightId),
  ]);

  const sameExam = leftId === rightId;

  const headlineRows: { label: string; left: number; right: number; suffix?: string }[] = [
    { label: 'Candidates appeared', left: left.totals.appeared, right: right.totals.appeared },
    { label: 'Passed', left: left.totals.passed, right: right.totals.passed },
    { label: 'Failed', left: left.totals.failed, right: right.totals.failed },
    { label: 'Absent', left: left.totals.absent, right: right.totals.absent },
    {
      label: 'Pass percentage',
      left: left.totals.passPercentage,
      right: right.totals.passPercentage,
      suffix: '%',
    },
    { label: 'Average percentage', left: left.totals.average, right: right.totals.average, suffix: '%' },
    { label: 'Highest percentage', left: left.totals.highest, right: right.totals.highest, suffix: '%' },
    { label: 'Lowest percentage', left: left.totals.lowest, right: right.totals.lowest, suffix: '%' },
    { label: 'A+ grades', left: left.totals.aPlusCount, right: right.totals.aPlusCount },
  ];

  // Class comparison across both examinations.
  const classNames = [
    ...new Set([...left.byClass.map((c) => c.name), ...right.byClass.map((c) => c.name)]),
  ].sort();

  const classComparison = classNames.map((name) => {
    const a = left.byClass.find((c) => c.name === name);
    const b = right.byClass.find((c) => c.name === name);
    return {
      name,
      leftAverage: a?.average ?? null,
      rightAverage: b?.average ?? null,
      leftPass: a?.passPercentage ?? null,
      rightPass: b?.passPercentage ?? null,
      delta: a && b ? round(b.average - a.average, 2) : null,
    };
  });

  // Subject comparison, matched on subject name plus class.
  const subjectKeys = [
    ...new Set([
      ...left.bySubject.map((s) => `${s.name}|${s.className}`),
      ...right.bySubject.map((s) => `${s.name}|${s.className}`),
    ]),
  ].sort();

  const subjectComparison = subjectKeys.map((key) => {
    const [name, className] = key.split('|');
    const a = left.bySubject.find((s) => s.name === name && s.className === className);
    const b = right.bySubject.find((s) => s.name === name && s.className === className);
    return {
      name: name!,
      className: className!,
      leftAverage: a?.average ?? null,
      rightAverage: b?.average ?? null,
      delta: a && b ? round(b.average - a.average, 2) : null,
    };
  });

  return (
    <>
      <PageHeader
        title="Exam Comparison"
        description="Compare two examinations — terms, sessions or a monthly test against an annual."
        breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Exam Comparison' }]}
      />

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'leftId',
              label: 'Baseline examination',
              className: 'min-w-[280px] flex-1',
              options: exams.map((e) => ({
                value: e.id,
                label: `${e.name} · ${e.session.name}`,
              })),
            },
            {
              type: 'select',
              name: 'rightId',
              label: 'Compared examination',
              className: 'min-w-[280px] flex-1',
              options: exams.map((e) => ({
                value: e.id,
                label: `${e.name} · ${e.session.name}`,
              })),
            },
          ]}
        />
      </Card>

      {sameExam && (
        <Alert tone="info" className="mb-5">
          Both selections are the same examination. Choose two different examinations to see a
          meaningful comparison.
        </Alert>
      )}

      <div className="mb-5 grid gap-3.5 sm:grid-cols-2">
        {[left, right].map((side, index) => (
          <Card key={side.exam.id} className={index === 1 ? 'border-royal-300' : undefined}>
            <CardBody>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                {index === 0 ? 'Baseline' : 'Compared with'}
              </p>
              <p className="mt-1 text-[15px] font-bold text-navy-900">{side.exam.name}</p>
              <p className="text-[12.5px] text-slate-600">
                {EXAM_TYPE_LABELS[side.exam.type] ?? side.exam.type} · Session{' '}
                {side.exam.session.name}
              </p>
              <div className="mt-3 flex gap-5">
                <div>
                  <p className="text-2xl font-bold text-navy-900 tabular">
                    {formatPercent(side.totals.passPercentage, 1)}
                  </p>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Pass rate
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-royal-700 tabular">
                    {formatPercent(side.totals.average, 1)}
                  </p>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Average
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mb-5">
        <CardHeader title="Headline comparison" />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Measure</Th>
                <Th align="center">{left.exam.name}</Th>
                <Th align="center">{right.exam.name}</Th>
                <Th align="center">Change</Th>
              </tr>
            </thead>
            <tbody>
              {headlineRows.map((row) => (
                <tr key={row.label}>
                  <Td className="font-semibold text-navy-900">{row.label}</Td>
                  <Td align="center" className="tabular">
                    {round(row.left, 2)}
                    {row.suffix ?? ''}
                  </Td>
                  <Td align="center" className="font-semibold tabular">
                    {round(row.right, 2)}
                    {row.suffix ?? ''}
                  </Td>
                  <Td align="center">
                    <Delta value={round(row.right - row.left, 2)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Class comparison" description="Average percentage in each examination" />
        <CardBody>
          <ComparisonBarChart
            data={classComparison.map((c) => ({
              name: c.name,
              [left.exam.name]: c.leftAverage ?? 0,
              [right.exam.name]: c.rightAverage ?? 0,
            }))}
            dataKeys={[
              { key: left.exam.name, label: left.exam.name },
              { key: right.exam.name, label: right.exam.name },
            ]}
          />
        </CardBody>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Class</Th>
                <Th align="center">{left.exam.name} avg.</Th>
                <Th align="center">{right.exam.name} avg.</Th>
                <Th align="center">Change</Th>
                <Th align="center">{left.exam.name} pass %</Th>
                <Th align="center">{right.exam.name} pass %</Th>
              </tr>
            </thead>
            <tbody>
              {classComparison.map((row) => (
                <tr key={row.name}>
                  <Td className="font-bold text-navy-900">{row.name}</Td>
                  <Td align="center" className="tabular">
                    {row.leftAverage !== null ? formatPercent(row.leftAverage, 1) : '—'}
                  </Td>
                  <Td align="center" className="tabular">
                    {row.rightAverage !== null ? formatPercent(row.rightAverage, 1) : '—'}
                  </Td>
                  <Td align="center">
                    <Delta value={row.delta} />
                  </Td>
                  <Td align="center" className="tabular">
                    {row.leftPass !== null ? formatPercent(row.leftPass, 1) : '—'}
                  </Td>
                  <Td align="center" className="tabular">
                    {row.rightPass !== null ? formatPercent(row.rightPass, 1) : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="Subject comparison" />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th>Class</Th>
                <Th align="center">{left.exam.name} avg.</Th>
                <Th align="center">{right.exam.name} avg.</Th>
                <Th align="center">Change</Th>
              </tr>
            </thead>
            <tbody>
              {subjectComparison.map((row) => (
                <tr key={`${row.name}-${row.className}`}>
                  <Td className="font-semibold text-navy-900">{row.name}</Td>
                  <Td className="text-slate-700">{row.className}</Td>
                  <Td align="center" className="tabular">
                    {row.leftAverage !== null ? formatPercent(row.leftAverage, 1) : '—'}
                  </Td>
                  <Td align="center" className="tabular">
                    {row.rightAverage !== null ? formatPercent(row.rightAverage, 1) : '—'}
                  </Td>
                  <Td align="center">
                    <Delta value={row.delta} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}
