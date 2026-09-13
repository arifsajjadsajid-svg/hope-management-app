import type { Metadata } from 'next';
import { Search, Award, ShieldCheck, Info } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { normaliseCode } from '@/lib/verification';
import { Card, CardBody, CardHeader, Alert, Badge } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { RESULT_STATUS_LABELS, EXAM_TYPE_LABELS } from '@/lib/constants';
import { formatMarks, formatPercent, ordinal, formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Result Portal' };
export const dynamic = 'force-dynamic';

type SearchMode = 'ROLL' | 'STUDENT_ID' | 'CODE';

/**
 * Public result search. Only the information a result gazette would normally
 * carry is exposed — no phone numbers, addresses or other private details.
 */
async function findResult(mode: SearchMode, value: string, examId?: string) {
  const term = value.trim();
  if (!term) return null;

  if (mode === 'CODE') {
    const code = normaliseCode(term);
    return prisma.result.findFirst({
      where: { verificationCode: code, isPublished: true },
      include: resultInclude,
    });
  }

  if (mode === 'STUDENT_ID') {
    return prisma.result.findFirst({
      where: {
        isPublished: true,
        student: { admissionNumber: term },
        ...(examId ? { examId } : {}),
      },
      include: resultInclude,
      orderBy: { exam: { startDate: 'desc' } },
    });
  }

  const allocation = await prisma.rollNumberAllocation.findFirst({
    where: { rollNumber: term, ...(examId ? { examId } : {}) },
    orderBy: { exam: { startDate: 'desc' } },
  });
  if (!allocation) return null;

  return prisma.result.findFirst({
    where: { examId: allocation.examId, studentId: allocation.studentId, isPublished: true },
    include: resultInclude,
  });
}

const resultInclude = {
  student: { select: { fullName: true, fatherName: true, admissionNumber: true } },
  exam: {
    select: {
      id: true,
      name: true,
      type: true,
      publishedAt: true,
      session: { select: { name: true } },
    },
  },
  enrollment: {
    include: {
      schoolClass: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
  subjects: { orderBy: { displayOrder: 'asc' as const } },
} as const;

export default async function PublicResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const academy = await getAcademySettings();
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  if (!academy.resultPortalEnabled) {
    return (
      <Alert tone="warning" title="Result portal is closed">
        The public result portal is currently disabled by the academy administration. Please contact
        the office on {academy.contactLine}.
      </Alert>
    );
  }

  const mode = (pick('mode') as SearchMode) || 'ROLL';
  const value = pick('value') ?? '';
  const examId = pick('examId') || undefined;

  const publishedExams = await prisma.exam.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
    take: 25,
  });

  const result = value ? await findResult(mode, value, examId) : null;
  const searched = Boolean(value);

  // Roll number for display, when one exists.
  const rollNumber = result
    ? ((
        await prisma.rollNumberAllocation.findFirst({
          where: { examId: result.examId, studentId: result.studentId },
          select: { rollNumber: true },
        })
      )?.rollNumber ?? '—')
    : null;

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="doc-title text-2xl font-bold uppercase tracking-wide text-navy-900 sm:text-3xl">
          Examination Result Portal
        </h1>
        <p className="mt-2 text-[14px] text-slate-600">
          Search by roll number, student ID or the verification code printed on a report card.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader title="Find a result" />
        <CardBody>
          <form method="get" className="grid gap-4 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label className="field-label" htmlFor="mode">
                Search by
              </label>
              <select id="mode" name="mode" defaultValue={mode} className="field-input">
                <option value="ROLL">Roll Number</option>
                <option value="STUDENT_ID">Student ID (Admission No.)</option>
                <option value="CODE">Verification Code</option>
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="field-label" htmlFor="value">
                Value
              </label>
              <input
                id="value"
                name="value"
                defaultValue={value}
                required
                placeholder="e.g. FT26-9-007"
                className="field-input tabular"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="field-label" htmlFor="examId">
                Examination
              </label>
              <select id="examId" name="examId" defaultValue={examId ?? ''} className="field-input">
                <option value="">Most recent</option>
                {publishedExams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-semibold text-white transition hover:bg-navy-800"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
          </form>

          <p className="mt-4 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Only published results are shown. If your result is not found, it may not have been
            published yet — please contact the academy office on {academy.contactLine}.
          </p>
        </CardBody>
      </Card>

      {searched && !result && (
        <Alert tone="warning" title="No published result found">
          Nothing matches “{value}”. Check the roll number or code and try again, or contact the
          academy office.
        </Alert>
      )}

      {result && (
        <Card>
          <div className="bg-navy-gradient px-5 py-5 text-white sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11.5px] font-bold uppercase tracking-widest text-gold-300">
                  Official Result
                </p>
                <h2 className="doc-title mt-1 text-xl font-bold">{result.student.fullName}</h2>
                <p className="text-[13px] text-navy-200">
                  S/O — D/O {result.student.fatherName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold leading-none tabular">
                  {formatPercent(result.percentage)}
                </p>
                <p className="mt-1 text-[11.5px] font-bold uppercase tracking-wider text-navy-200">
                  Grade {result.grade}
                </p>
              </div>
            </div>
          </div>

          <CardBody>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4">
              {[
                ['Roll Number', rollNumber],
                ['Student ID', result.student.admissionNumber],
                ['Class', result.enrollment.schoolClass.name],
                ['Section', result.enrollment.section.name],
                ['Examination', result.exam.name],
                ['Type', EXAM_TYPE_LABELS[result.exam.type] ?? result.exam.type],
                ['Session', result.exam.session.name],
                ['Published', formatDate(result.exam.publishedAt)],
              ].map(([label, val]) => (
                <div key={String(label)}>
                  <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-[13.5px] font-semibold text-navy-900">
                    {val ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th align="center">Maximum</Th>
                  <Th align="center">Passing</Th>
                  <Th align="center">Obtained</Th>
                  <Th align="center">Percentage</Th>
                  <Th align="center">Grade</Th>
                </tr>
              </thead>
              <tbody>
                {result.subjects.map((subject) => (
                  <tr key={subject.id}>
                    <Td className="font-medium text-navy-900">{subject.subjectName}</Td>
                    <Td align="center" className="tabular">{formatMarks(subject.maxMarks)}</Td>
                    <Td align="center" className="tabular">{formatMarks(subject.passingMarks)}</Td>
                    <Td align="center" className="font-bold tabular">
                      {subject.specialStatus !== 'NONE'
                        ? subject.specialStatus
                        : formatMarks(subject.obtainedMarks)}
                    </Td>
                    <Td align="center" className="tabular">
                      {subject.specialStatus !== 'NONE' ? '—' : formatPercent(subject.percentage, 1)}
                    </Td>
                    <Td align="center" className="font-bold">{subject.grade}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy-50 font-bold">
                  <Td className="text-navy-900">Total</Td>
                  <Td align="center" className="tabular">{formatMarks(result.totalMaxMarks)}</Td>
                  <Td align="center">—</Td>
                  <Td align="center" className="tabular">{formatMarks(result.totalObtained)}</Td>
                  <Td align="center" className="tabular">{formatPercent(result.percentage)}</Td>
                  <Td align="center">{result.grade}</Td>
                </tr>
              </tfoot>
            </Table>
          </TableWrap>

          <CardBody className="grid gap-3 border-t border-slate-200 sm:grid-cols-4">
            {[
              ['Class Position', result.classPosition ? ordinal(result.classPosition) : '—'],
              ['Section Position', result.sectionPosition ? ordinal(result.sectionPosition) : '—'],
              ['Result', RESULT_STATUS_LABELS[result.status] ?? result.status],
              [
                'Promotion',
                result.promotionStatus === 'PROMOTED'
                  ? 'Promoted'
                  : result.promotionStatus === 'NOT_PROMOTED'
                    ? 'Not Promoted'
                    : '—',
              ],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-lg bg-slate-50 px-4 py-3 text-center">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  {label}
                </p>
                <p className="mt-0.5 text-[15px] font-bold text-navy-900">{val}</p>
              </div>
            ))}
          </CardBody>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <p className="flex items-center gap-2 text-[12.5px] text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Verification code{' '}
              <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">
                {result.verificationCode}
              </Badge>
            </p>
            <a
              href={`/verify/${result.verificationCode}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-royal-700 hover:underline"
            >
              <Award className="h-4 w-4" />
              Open the official verification page
            </a>
          </div>
        </Card>
      )}
    </>
  );
}
