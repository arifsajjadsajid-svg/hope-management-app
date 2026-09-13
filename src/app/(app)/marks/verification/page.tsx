import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { runMarksVerification } from '@/server/services/result-processing';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, EmptyState, LinkButton, Alert, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';

export const metadata: Metadata = { title: 'Marks Verification' };
export const dynamic = 'force-dynamic';

const ISSUE_LABELS: Record<string, string> = {
  SUBJECT_NO_MAX: 'Subject has no maximum marks',
  STUDENT_NO_SUBJECTS: 'Student has no subjects',
  MISSING_MARK: 'Missing marks',
  BLANK_MARK: 'Blank marks',
  MARK_ABOVE_MAX: 'Marks above maximum',
  NEGATIVE_MARK: 'Negative marks',
  ABSENT_WITH_MARKS: 'Absent student carries marks',
  PRESENT_MARKED_ABSENT: 'Present but marked ABS',
  FULL_MARKS: 'Full marks recorded',
  NO_ROLL_NUMBER: 'No roll number allocated',
};

export default async function MarksVerificationPage({
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
  const severityFilter = pick('severity');

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Marks Verification"
          description="Check the marks data before results are processed."
          breadcrumbs={[{ label: 'Marks' }, { label: 'Marks Verification' }]}
        />
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination and record marks first."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { session: { select: { name: true } } },
  });

  const verification = await runMarksVerification(examId);

  const visibleIssues = severityFilter
    ? verification.issues.filter((i) => i.severity === severityFilter)
    : verification.issues;

  // Summarise by issue code so the biggest problems stand out first.
  const byCode = new Map<string, { code: string; severity: string; count: number }>();
  for (const issue of verification.issues) {
    const bucket = byCode.get(issue.code) ?? {
      code: issue.code,
      severity: issue.severity,
      count: 0,
    };
    bucket.count += 1;
    byCode.set(issue.code, bucket);
  }
  const summary = [...byCode.values()].sort(
    (a, b) =>
      (a.severity === 'CRITICAL' ? 0 : 1) - (b.severity === 'CRITICAL' ? 0 : 1) ||
      b.count - a.count,
  );

  const clean = verification.criticalCount === 0;

  return (
    <>
      <PageHeader
        title="Marks Verification"
        description={`${exam.name} · Session ${exam.session.name} · ${verification.studentsChecked} candidates across ${verification.subjectsChecked} subjects`}
        breadcrumbs={[{ label: 'Marks' }, { label: 'Marks Verification' }]}
        actions={
          userCan(user, 'results.process') && (
            <LinkButton
              href={`/results/process?examId=${exam.id}`}
              size="sm"
              variant={clean ? 'primary' : 'outline'}
            >
              <CheckCircle2 className="h-4 w-4" />
              Go to Result Processing
            </LinkButton>
          )
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Candidates Checked" value={verification.studentsChecked} tone="navy" />
        <StatCard label="Subjects Checked" value={verification.subjectsChecked} tone="royal" />
        <StatCard
          label="Critical Errors"
          value={verification.criticalCount}
          tone={verification.criticalCount ? 'rose' : 'emerald'}
          hint={verification.criticalCount ? 'must be fixed before publication' : 'none found'}
        />
        <StatCard
          label="Warnings"
          value={verification.warningCount}
          tone={verification.warningCount ? 'amber' : 'slate'}
          hint="advisory only"
        />
      </section>

      {clean ? (
        <Alert tone="success" title="No critical errors found" className="mb-5">
          The marks data for <strong>{exam.name}</strong> passes every critical check. Results can be
          processed and published.
          {verification.warningCount > 0 && (
            <>
              {' '}
              There {verification.warningCount === 1 ? 'is' : 'are'} {verification.warningCount}{' '}
              advisory warning{verification.warningCount === 1 ? '' : 's'} listed below — review them
              if you wish, but they do not block publication.
            </>
          )}
        </Alert>
      ) : (
        <Alert tone="danger" title="Critical errors must be corrected" className="mb-5">
          <strong>{verification.criticalCount}</strong> critical issue
          {verification.criticalCount === 1 ? '' : 's'} would produce an incorrect result. Correct
          them in{' '}
          <Link href={`/marks/entry?examId=${exam.id}`} className="font-semibold underline">
            Enter Marks
          </Link>{' '}
          before processing or publishing this result.
        </Alert>
      )}

      {summary.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Issues by type" />
          <div className="flex flex-wrap gap-2.5 p-5">
            {summary.map((item) => (
              <span
                key={item.code}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
                  item.severity === 'CRITICAL'
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
                }`}
              >
                {item.severity === 'CRITICAL' ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {ISSUE_LABELS[item.code] ?? item.code}
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11.5px] tabular">
                  {item.count}
                </span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[260px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'severity',
              label: 'Severity',
              className: 'w-[170px]',
              options: [
                { value: '', label: 'All issues' },
                { value: 'CRITICAL', label: 'Critical only' },
                { value: 'WARNING', label: 'Warnings only' },
              ],
            },
          ]}
        />

        {visibleIssues.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title={severityFilter ? 'No issues of this severity' : 'Everything checks out'}
            description={
              severityFilter
                ? 'Clear the filter to see the other issues.'
                : 'Missing marks, marks above the maximum, absent candidates carrying marks and unallocated roll numbers are all clear.'
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th align="center">Severity</Th>
                  <Th>Issue</Th>
                  <Th>Details</Th>
                  <Th>Roll No.</Th>
                  <Th>Student</Th>
                  <Th>Subject</Th>
                </tr>
              </thead>
              <tbody>
                {visibleIssues.slice(0, 500).map((issue, index) => (
                  <tr key={`${issue.code}-${index}`}>
                    <Td align="center">
                      {issue.severity === 'CRITICAL' ? (
                        <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">Critical</Badge>
                      ) : (
                        <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Warning</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap font-semibold text-navy-900">
                      {ISSUE_LABELS[issue.code] ?? issue.code}
                    </Td>
                    <Td className="text-slate-700">{issue.message}</Td>
                    <Td className="whitespace-nowrap tabular text-slate-600">
                      {issue.rollNumber ?? '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-700">{issue.studentName ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-slate-700">{issue.subjectName ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {visibleIssues.length > 500 && (
              <p className="px-5 py-3 text-[12.5px] text-slate-500">
                Showing the first 500 of {visibleIssues.length} issues.
              </p>
            )}
          </TableWrap>
        )}
      </Card>
    </>
  );
}
