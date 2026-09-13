import type { Metadata } from 'next';
import Link from 'next/link';
import { Award, Printer, FileSpreadsheet, MessageSquare } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { listResults } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, LinkButton, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { ResultStatusBadge, GradeBadge, StudentAvatar } from '@/components/ui/status-badge';
import { RESULT_STATUS_LABELS } from '@/lib/constants';
import { formatPercent, ordinal } from '@/lib/utils';

export const metadata: Metadata = { title: 'Results' };
export const dynamic = 'force-dynamic';

export default async function ResultsPage({
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
          title="Results"
          description="Every processed result for an examination."
          breadcrumbs={[{ label: 'Results' }]}
        />
        <Card>
          <EmptyState
            icon={<Award className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination, record marks and process the result."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      examClasses: { include: { schoolClass: { select: { id: true, name: true } } } },
    },
  });

  const sections = await prisma.section.findMany({
    where: { classId: { in: exam.examClasses.map((c) => c.classId) } },
    include: { schoolClass: { select: { name: true } } },
    orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { name: 'asc' }],
  });

  const filters = {
    examId,
    classId: pick('classId'),
    sectionId: pick('sectionId'),
    status: pick('status'),
    q: pick('q'),
  };

  const results = await listResults(filters);

  const exportQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) exportQuery.set(key, value);
  }

  return (
    <>
      <PageHeader
        title="Results"
        description={`${exam.name} · Session ${exam.session.name} · ${results.length} result(s)`}
        breadcrumbs={[{ label: 'Results' }]}
        actions={
          <>
            <LinkButton
              href={`/api/export/results?${exportQuery.toString()}`}
              variant="outline"
              size="sm"
              download
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </LinkButton>
            <LinkButton
              href={`/print/result-sheet?${exportQuery.toString()}`}
              variant="outline"
              size="sm"
              newTab
            >
              <Printer className="h-4 w-4" />
              Result Sheet
            </LinkButton>
            {userCan(user, 'notifications.send') && results.length > 0 && (
              <LinkButton href="/messages/new" variant="outline" size="sm">
                <MessageSquare className="h-4 w-4" />
                Message Parents
              </LinkButton>
            )}
            {userCan(user, 'reportcards.print') && results.length > 0 && (
              <LinkButton
                href={`/print/report-card?${exportQuery.toString()}`}
                size="sm"
                newTab
              >
                <Award className="h-4 w-4" />
                Print Report Cards
              </LinkButton>
            )}
          </>
        }
      />

      <Card>
        <FilterBar
          fields={[
            { type: 'search', name: 'q', placeholder: 'Student, father name, admission no…' },
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[220px]',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              options: [
                { value: '', label: 'All classes' },
                ...exam.examClasses.map((ec) => ({
                  value: ec.schoolClass.id,
                  label: ec.schoolClass.name,
                })),
              ],
            },
            {
              type: 'select',
              name: 'sectionId',
              label: 'Section',
              options: [
                { value: '', label: 'All sections' },
                ...sections.map((s) => ({
                  value: s.id,
                  label: `${s.schoolClass.name} — ${s.name}`,
                })),
              ],
            },
            {
              type: 'select',
              name: 'status',
              label: 'Status',
              className: 'w-[160px]',
              options: [
                { value: '', label: 'All' },
                ...Object.entries(RESULT_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ],
            },
          ]}
        />

        {results.length === 0 ? (
          <EmptyState
            icon={<Award className="h-6 w-6" />}
            title="No results"
            description="Either the result has not been processed yet, or no student matches the filters."
            action={
              userCan(user, 'results.process') && (
                <LinkButton href={`/results/process?examId=${exam.id}`}>
                  Go to Result Processing
                </LinkButton>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th align="center">Roll No.</Th>
                  <Th>Student</Th>
                  <Th>Father Name</Th>
                  <Th>Class / Section</Th>
                  <Th align="center">Obtained</Th>
                  <Th align="center">Total</Th>
                  <Th align="center">%</Th>
                  <Th align="center">Grade</Th>
                  <Th align="center">Class Pos.</Th>
                  <Th align="center">Sec. Pos.</Th>
                  <Th>Status</Th>
                  <Th align="center">Published</Th>
                  <Th align="right">Report</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id}>
                    <Td align="center">
                      <span className="rounded-md bg-navy-900 px-2 py-1 text-[12px] font-bold text-gold-300 tabular">
                        {result.rollNumber}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        href={`/students/${result.studentId}`}
                        className="flex items-center gap-2.5 group"
                      >
                        <StudentAvatar
                          name={result.student.fullName}
                          photoPath={result.student.photoPath}
                          size={30}
                        />
                        <span className="font-semibold text-navy-900 group-hover:text-royal-700">
                          {result.student.fullName}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-slate-700">{result.student.fatherName}</Td>
                    <Td className="whitespace-nowrap text-slate-700">
                      {result.enrollment.schoolClass.name} — {result.enrollment.section.name}
                    </Td>
                    <Td align="center" className="font-semibold tabular">
                      {result.totalObtained}
                    </Td>
                    <Td align="center" className="tabular text-slate-600">
                      {result.totalMaxMarks}
                    </Td>
                    <Td align="center" className="font-bold tabular text-navy-900">
                      {formatPercent(result.percentage)}
                    </Td>
                    <Td align="center">
                      <GradeBadge grade={result.grade} />
                    </Td>
                    <Td align="center" className="tabular">
                      {result.classPosition ? ordinal(result.classPosition) : '—'}
                    </Td>
                    <Td align="center" className="tabular">
                      {result.sectionPosition ? ordinal(result.sectionPosition) : '—'}
                    </Td>
                    <Td>
                      <ResultStatusBadge status={result.status} />
                    </Td>
                    <Td align="center">
                      {result.isPublished ? (
                        <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Yes</Badge>
                      ) : (
                        <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">No</Badge>
                      )}
                    </Td>
                    <Td align="right">
                      <a
                        href={`/print/report-card?examId=${exam.id}&studentId=${result.studentId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12.5px] font-semibold text-royal-700 hover:underline"
                      >
                        Print
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
