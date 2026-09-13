import type { Metadata } from 'next';
import Link from 'next/link';
import { Award, Printer, FileText } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { listResults } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, LinkButton, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, ResultStatusBadge, StudentAvatar } from '@/components/ui/status-badge';
import { formatPercent, ordinal } from '@/lib/utils';

export const metadata: Metadata = { title: 'Report Cards' };
export const dynamic = 'force-dynamic';

export default async function ReportCardsPage({
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
    where: { ...(session ? { sessionId: session.id } : {}), results: { some: {} } },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
  });

  const examId = pick('examId') || exams[0]?.id;

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Report Cards"
          description="Official, branded report cards with QR verification."
          breadcrumbs={[{ label: 'Results' }, { label: 'Report Cards' }]}
        />
        <Card>
          <EmptyState
            icon={<Award className="h-6 w-6" />}
            title="No processed results"
            description="Report cards become available once an examination result has been processed."
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

  const printQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) printQuery.set(key, value);
  }

  const canPrint = userCan(user, 'reportcards.print');

  return (
    <>
      <PageHeader
        title="Report Cards"
        description={`${exam.name} · Session ${exam.session.name} · ${results.length} report card(s) ready`}
        breadcrumbs={[{ label: 'Results' }, { label: 'Report Cards' }]}
        actions={
          canPrint &&
          results.length > 0 && (
            <LinkButton href={`/print/report-card?${printQuery.toString()}`} size="sm" newTab>
              <Printer className="h-4 w-4" />
              Print {results.length} Report Card{results.length === 1 ? '' : 's'}
            </LinkButton>
          )
        }
      />

      <Card className="mb-5">
        <CardHeader
          title="What is printed"
          description="Each report card is a single A4 page carrying the full academy identity."
        />
        <CardBody>
          <div className="grid gap-3 text-[13px] text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            {[
              'Academy letterhead with crest, address and contact numbers',
              'Student photograph, name, father name, admission and roll number',
              'Subject table: maximum, passing, obtained, percentage and grade',
              'Totals, percentage, grade, class and section position, attendance',
              'Result status and promotion outcome',
              'Teacher and Principal remarks',
              'Parent, class teacher, controller and principal signature lines',
              'QR code linking to the online verification page',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-royal-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {results.some((r) => !r.isPublished) && (
        <Alert tone="info" className="mb-5">
          Some of these results are not published yet. Report cards can still be printed internally;
          students and parents will not see them on the portal until the result is published.
        </Alert>
      )}

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
          ]}
        />

        {results.length === 0 ? (
          <EmptyState
            icon={<Award className="h-6 w-6" />}
            title="No report cards"
            description="No student matches the current filters."
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
                  <Th align="center">%</Th>
                  <Th align="center">Grade</Th>
                  <Th align="center">Position</Th>
                  <Th>Status</Th>
                  <Th>Verification Code</Th>
                  <Th align="right">Report Card</Th>
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
                        className="flex items-center gap-2.5 font-semibold text-navy-900 hover:text-royal-700"
                      >
                        <StudentAvatar
                          name={result.student.fullName}
                          photoPath={result.student.photoPath}
                          size={30}
                        />
                        {result.student.fullName}
                      </Link>
                    </Td>
                    <Td className="text-slate-700">{result.student.fatherName}</Td>
                    <Td className="whitespace-nowrap text-slate-700">
                      {result.enrollment.schoolClass.name} — {result.enrollment.section.name}
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
                    <Td>
                      <ResultStatusBadge status={result.status} />
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-[11.5px] text-slate-600">
                      {result.verificationCode}
                    </Td>
                    <Td align="right">
                      {canPrint && (
                        <a
                          href={`/print/report-card?examId=${exam.id}&studentId=${result.studentId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12.5px] font-semibold text-royal-700 hover:underline"
                        >
                          Print
                        </a>
                      )}
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
