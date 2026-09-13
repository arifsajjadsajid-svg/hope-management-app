import type { Metadata } from 'next';
import Link from 'next/link';
import { Trophy, Printer, FileSpreadsheet } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { getMeritList, getSubjectToppers, type MeritScope } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, LinkButton, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, ResultStatusBadge, StudentAvatar } from '@/components/ui/status-badge';
import { formatPercent, ordinal } from '@/lib/utils';

export const metadata: Metadata = { title: 'Merit Lists' };
export const dynamic = 'force-dynamic';

const SCOPES: { value: MeritScope | 'SUBJECT'; label: string }[] = [
  { value: 'OVERALL', label: 'Overall merit list' },
  { value: 'CLASS', label: 'Class merit list' },
  { value: 'SECTION', label: 'Section merit list' },
  { value: 'SUBJECT', label: 'Subject merit list' },
];

export default async function MeritListsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('meritlists.view');
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
          title="Merit Lists"
          description="Ranked lists of students by examination performance."
          breadcrumbs={[{ label: 'Results' }, { label: 'Merit Lists' }]}
        />
        <Card>
          <EmptyState
            icon={<Trophy className="h-6 w-6" />}
            title="No processed results"
            description="Merit lists appear once an examination result has been processed."
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

  const scope = (pick('scope') as MeritScope | 'SUBJECT') || 'OVERALL';
  const classId = pick('classId');
  const sectionId = pick('sectionId');
  const limit = Number(pick('limit') ?? 0) || undefined;

  const rows =
    scope === 'SUBJECT'
      ? []
      : await getMeritList(examId, { scope: scope as MeritScope, classId, sectionId, limit });

  const subjectToppers = scope === 'SUBJECT' ? await getSubjectToppers(examId) : [];

  const query = new URLSearchParams({ examId, scope });
  if (classId) query.set('classId', classId);
  if (sectionId) query.set('sectionId', sectionId);
  if (limit) query.set('limit', String(limit));

  const scopeLabel = SCOPES.find((s) => s.value === scope)?.label ?? 'Merit list';

  return (
    <>
      <PageHeader
        title="Merit Lists"
        description={`${exam.name} · Session ${exam.session.name} · ${scopeLabel}`}
        breadcrumbs={[{ label: 'Results' }, { label: 'Merit Lists' }]}
        actions={
          <>
            <LinkButton
              href={`/api/export/merit-list?${query.toString()}`}
              variant="outline"
              size="sm"
              download
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </LinkButton>
            <LinkButton href={`/print/merit-list?${query.toString()}`} size="sm" newTab>
              <Printer className="h-4 w-4" />
              Print / PDF
            </LinkButton>
          </>
        }
      />

      {scope === 'CLASS' && !classId && (
        <Alert tone="info" className="mb-5">
          Select a class to see its merit list. Without a class, positions shown are the stored
          class positions across all classes.
        </Alert>
      )}

      <Card>
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[220px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'scope',
              label: 'Merit list type',
              className: 'w-[200px]',
              options: SCOPES.map((s) => ({ value: s.value, label: s.label })),
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
              name: 'limit',
              label: 'Show',
              className: 'w-[140px]',
              options: [
                { value: '', label: 'All students' },
                { value: '3', label: 'Top 3' },
                { value: '5', label: 'Top 5' },
                { value: '10', label: 'Top 10' },
                { value: '20', label: 'Top 20' },
              ],
            },
          ]}
        />

        {scope === 'SUBJECT' ? (
          subjectToppers.length === 0 ? (
            <EmptyState
              icon={<Trophy className="h-6 w-6" />}
              title="No subject results"
              description="Process the examination result to build subject merit lists."
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Subject</Th>
                    <Th>Class</Th>
                    <Th>Topper</Th>
                    <Th>Father Name</Th>
                    <Th align="center">Section</Th>
                    <Th align="center">Obtained</Th>
                    <Th align="center">Max</Th>
                    <Th align="center">%</Th>
                    <Th align="center">Grade</Th>
                  </tr>
                </thead>
                <tbody>
                  {subjectToppers.map((row) => (
                    <tr key={`${row.subjectCode}-${row.className}`}>
                      <Td className="font-bold text-navy-900">
                        {row.subjectName}
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
                          {row.subjectCode}
                        </span>
                      </Td>
                      <Td className="text-slate-700">{row.className}</Td>
                      <Td>
                        <Link
                          href={`/students/${row.studentId}`}
                          className="flex items-center gap-2.5 font-semibold text-navy-900 hover:text-royal-700"
                        >
                          <StudentAvatar name={row.studentName} photoPath={row.photoPath} size={30} />
                          {row.studentName}
                        </Link>
                      </Td>
                      <Td className="text-slate-700">{row.fatherName}</Td>
                      <Td align="center" className="text-slate-600">{row.sectionName}</Td>
                      <Td align="center" className="font-bold tabular">{row.obtainedMarks}</Td>
                      <Td align="center" className="tabular text-slate-600">{row.maxMarks}</Td>
                      <Td align="center" className="font-semibold tabular">
                        {formatPercent(row.percentage, 1)}
                      </Td>
                      <Td align="center">
                        <GradeBadge grade={row.grade} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-6 w-6" />}
            title="No students in this merit list"
            description="Either the result has not been processed, or no student matches the filters."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th align="center">Position</Th>
                  <Th align="center">Roll No.</Th>
                  <Th>Student Name</Th>
                  <Th>Father Name</Th>
                  <Th>Class / Section</Th>
                  <Th align="center">Max Marks</Th>
                  <Th align="center">Obtained</Th>
                  <Th align="center">%</Th>
                  <Th align="center">Grade</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const position = row.position ?? index + 1;
                  return (
                    <tr
                      key={row.id}
                      className={position <= 3 ? 'bg-gold-50/60' : undefined}
                    >
                      <Td align="center">
                        <span
                          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12.5px] font-bold tabular ${
                            position === 1
                              ? 'bg-gold-gradient text-navy-950'
                              : position === 2
                                ? 'bg-slate-300 text-navy-900'
                                : position === 3
                                  ? 'bg-amber-700/80 text-white'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {position}
                        </span>
                      </Td>
                      <Td align="center" className="tabular text-slate-700">{row.rollNumber}</Td>
                      <Td>
                        <Link
                          href={`/students/${row.studentId}`}
                          className="flex items-center gap-2.5 font-semibold text-navy-900 hover:text-royal-700"
                        >
                          <StudentAvatar
                            name={row.student.fullName}
                            photoPath={row.student.photoPath}
                            size={30}
                          />
                          {row.student.fullName}
                        </Link>
                      </Td>
                      <Td className="text-slate-700">{row.student.fatherName}</Td>
                      <Td className="whitespace-nowrap text-slate-700">
                        {row.enrollment.schoolClass.name} — {row.enrollment.section.name}
                      </Td>
                      <Td align="center" className="tabular text-slate-600">{row.totalMaxMarks}</Td>
                      <Td align="center" className="font-bold tabular">{row.totalObtained}</Td>
                      <Td align="center" className="font-bold tabular text-navy-900">
                        {formatPercent(row.percentage)}
                      </Td>
                      <Td align="center">
                        <GradeBadge grade={row.grade} />
                      </Td>
                      <Td>
                        <ResultStatusBadge status={row.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
