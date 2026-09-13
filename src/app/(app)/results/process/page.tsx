import type { Metadata } from 'next';
import Link from 'next/link';
import { Calculator, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { runMarksVerification } from '@/server/services/result-processing';
import { getExamAnalytics } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, LinkButton, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { ExamStatusBadge } from '@/components/ui/status-badge';
import { ProcessResultsButton } from '../result-workflow-clients';
import { formatPercent, formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Process Results' };
export const dynamic = 'force-dynamic';

export default async function ProcessResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('results.view');
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
          title="Process Results"
          description="Run the result calculation engine."
          breadcrumbs={[{ label: 'Results' }, { label: 'Process Results' }]}
        />
        <Card>
          <EmptyState
            icon={<Calculator className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination and record marks first."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      resultPolicy: true,
      gradingScheme: { select: { name: true } },
      _count: { select: { results: true, marks: true } },
    },
  });

  const verification = await runMarksVerification(examId);
  const analytics = exam._count.results > 0 ? await getExamAnalytics(examId) : null;

  const canProcess = userCan(user, 'results.process');
  const blocked = verification.criticalCount > 0 || exam.resultLocked;

  return (
    <>
      <PageHeader
        title="Process Results"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Results' }, { label: 'Process Results' }]}
        actions={
          <>
            <LinkButton href={`/marks/verification?examId=${exam.id}`} variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4" />
              Verification
            </LinkButton>
            {canProcess && (
              <ProcessResultsButton
                examId={exam.id}
                hasExisting={exam._count.results > 0}
                disabled={blocked}
                criticalIssues={verification.criticalCount}
              />
            )}
          </>
        }
      />

      {exam.resultLocked && (
        <Alert tone="warning" title="Results are locked" className="mb-5">
          Reprocessing is blocked. A Super Admin can unlock the result from{' '}
          <Link href="/results/publish" className="font-semibold underline">
            Publish Results
          </Link>
          .
        </Alert>
      )}

      {verification.criticalCount > 0 ? (
        <Alert tone="danger" title="Marks data is not ready" className="mb-5">
          <strong>{verification.criticalCount}</strong> critical issue
          {verification.criticalCount === 1 ? '' : 's'} must be corrected before results can be
          processed.{' '}
          <Link
            href={`/marks/verification?examId=${exam.id}`}
            className="font-semibold underline"
          >
            Open Marks Verification
          </Link>
        </Alert>
      ) : (
        <Alert tone="success" title="Marks data passes every critical check" className="mb-5">
          {exam._count.marks.toLocaleString()} mark(s) recorded across{' '}
          {verification.subjectsChecked} subjects for {verification.studentsChecked} candidates.
          {verification.warningCount > 0 &&
            ` ${verification.warningCount} advisory warning(s) — these do not block processing.`}
        </Alert>
      )}

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[280px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
          ]}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</p>
            <div className="mt-1.5">
              <ExamStatusBadge status={exam.resultLocked ? 'LOCKED' : exam.status} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Grading Scheme
            </p>
            <p className="mt-1 text-[13.5px] font-medium text-navy-900">
              {exam.gradingScheme?.name ?? 'Academy default'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Result Policy
            </p>
            <p className="mt-1 text-[13.5px] font-medium text-navy-900">
              {exam.resultPolicy?.name ?? 'Academy default'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Last Processed
            </p>
            <p className="mt-1 text-[13.5px] font-medium text-navy-900 tabular">
              {exam.processedAt ? formatDateTime(exam.processedAt) : 'Never'}
            </p>
          </div>
        </CardBody>
      </Card>

      {exam.resultPolicy && (
        <Card className="mb-5">
          <CardHeader
            title="Rules applied by the engine"
            description="From the result policy attached to this examination."
          />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Overall pass', `${exam.resultPolicy.overallPassPercent}%`],
                ['Subject pass required', exam.resultPolicy.requireSubjectPass ? 'Yes' : 'No'],
                ['Practical pass required', exam.resultPolicy.requirePracticalPass ? 'Yes' : 'No'],
                ['Compulsory must pass', exam.resultPolicy.compulsoryMustPass ? 'Yes' : 'No'],
                [
                  'Grace marks',
                  exam.resultPolicy.graceMarksMax > 0
                    ? `${exam.resultPolicy.graceMarksMax} across ${exam.resultPolicy.graceMaxSubjects} subject(s)`
                    : 'Not allowed',
                ],
                [
                  'Compartment',
                  exam.resultPolicy.compartmentEnabled
                    ? `Up to ${exam.resultPolicy.compartmentMaxSubjects} subject(s)`
                    : 'Disabled',
                ],
                [
                  'Absent handling',
                  exam.resultPolicy.absentCountsAsZero ? 'Counts as zero' : 'Excluded from total',
                ],
                [
                  'Ranking method',
                  exam.resultPolicy.rankingMethod === 'DENSE'
                    ? 'Dense (1, 1, 2)'
                    : 'Competition (1, 1, 3)',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-[13.5px] font-medium text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}

      {analytics ? (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Results" value={analytics.totals.total} tone="navy" />
            <StatCard label="Appeared" value={analytics.totals.appeared} tone="royal" />
            <StatCard label="Passed" value={analytics.totals.passed} tone="emerald" />
            <StatCard label="Failed" value={analytics.totals.failed} tone="rose" />
            <StatCard label="Absent" value={analytics.totals.absent} tone="slate" />
            <StatCard
              label="Pass %"
              value={formatPercent(analytics.totals.passPercentage, 1)}
              tone="gold"
            />
          </section>

          <Card>
            <CardHeader
              title="Class-wise outcome"
              description="Computed from the results currently stored."
              actions={
                <LinkButton href={`/results?examId=${exam.id}`} variant="outline" size="sm">
                  View all results
                </LinkButton>
              }
            />
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
                  {analytics.byClass.map((row) => (
                    <tr key={row.id}>
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
        </>
      ) : (
        <Card>
          <EmptyState
            icon={verification.criticalCount > 0 ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            title="No results processed yet"
            description={
              verification.criticalCount > 0
                ? 'Correct the critical marks issues, then process the result.'
                : 'Run the calculation engine to produce totals, percentages, grades, pass/fail statuses and positions.'
            }
            action={
              canProcess && (
                <ProcessResultsButton
                  examId={exam.id}
                  hasExisting={false}
                  disabled={blocked}
                  criticalIssues={verification.criticalCount}
                />
              )
            }
          />
        </Card>
      )}
    </>
  );
}
