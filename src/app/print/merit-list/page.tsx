import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { getMeritList, getSubjectToppers, type MeritScope } from '@/server/queries/results';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { formatMarks, formatPercent, chunk } from '@/lib/utils';

export const metadata: Metadata = { title: 'Merit List' };
export const dynamic = 'force-dynamic';

const ROWS_PER_PAGE = 24;

export default async function MeritListPrintPage({
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

  const examId = pick('examId');
  if (!examId) notFound();

  const scope = (pick('scope') as MeritScope | 'SUBJECT') || 'OVERALL';
  const classId = pick('classId');
  const sectionId = pick('sectionId');
  const limit = Number(pick('limit') ?? 0) || undefined;

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
  ]);
  if (!exam) notFound();

  const [scopeClass, scopeSection] = await Promise.all([
    classId ? prisma.schoolClass.findUnique({ where: { id: classId } }) : Promise.resolve(null),
    sectionId
      ? prisma.section.findUnique({
          where: { id: sectionId },
          include: { schoolClass: { select: { name: true } } },
        })
      : Promise.resolve(null),
  ]);

  const title =
    scope === 'SUBJECT'
      ? 'Subject Merit List'
      : scope === 'SECTION'
        ? 'Section Merit List'
        : scope === 'CLASS'
          ? 'Class Merit List'
          : 'Overall Merit List';

  const scopeLabel = scopeSection
    ? `${scopeSection.schoolClass.name} — Section ${scopeSection.name}`
    : scopeClass
      ? scopeClass.name
      : 'All classes';

  if (scope === 'SUBJECT') {
    const toppers = await getSubjectToppers(examId);
    const pages = chunk(toppers, ROWS_PER_PAGE);

    return (
      <>
        <PrintToolbar title="Subject Merit List" subtitle={exam.name} />
        {pages.map((rows, pageIndex) => (
          <section key={pageIndex} className="sheet sheet-a4">
            <Letterhead
              academy={academy}
              documentTitle={title}
              subtitle={`${exam.name} · Session ${exam.session.name}`}
            />
            <table className="doc-table" style={{ marginTop: '4mm' }}>
              <thead>
                <tr>
                  <th className="num" style={{ width: '7%' }}>
                    Sr.
                  </th>
                  <th>Subject</th>
                  <th style={{ width: '14%' }}>Class</th>
                  <th>Topper</th>
                  <th>Father Name</th>
                  <th className="num" style={{ width: '12%' }}>
                    Marks
                  </th>
                  <th className="num" style={{ width: '11%' }}>
                    %
                  </th>
                  <th className="num" style={{ width: '9%' }}>
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.subjectCode}-${row.className}`}>
                    <td className="num">{pageIndex * ROWS_PER_PAGE + index + 1}</td>
                    <td>
                      <strong>{row.subjectName}</strong> ({row.subjectCode})
                    </td>
                    <td>{row.className}</td>
                    <td>
                      <strong>{row.studentName}</strong>
                    </td>
                    <td>{row.fatherName}</td>
                    <td className="num">
                      {formatMarks(row.obtainedMarks)} / {formatMarks(row.maxMarks)}
                    </td>
                    <td className="num">{formatPercent(row.percentage, 1)}</td>
                    <td className="num">
                      <strong>{row.grade}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pageIndex === pages.length - 1 && (
              <div style={{ marginTop: '14mm' }}>
                <SignatureRow
                  signatures={[
                    {
                      label: 'Examination Controller',
                      name: academy.examControllerName,
                      imagePath: academy.examControllerSign,
                    },
                    {
                      label: 'Principal / Director',
                      name: academy.principalName ?? academy.directorName,
                      imagePath: academy.principalSignPath ?? academy.directorSignPath,
                    },
                  ]}
                />
              </div>
            )}

            <div style={{ marginTop: '6mm' }}>
              <DocumentFooter
                academy={academy}
                note={`Page ${pageIndex + 1} of ${pages.length} — ${academy.footerMessage}`}
              />
            </div>
          </section>
        ))}
      </>
    );
  }

  const rows = await getMeritList(examId, {
    scope: scope as MeritScope,
    classId,
    sectionId,
    limit,
  });
  const pages = chunk(rows, ROWS_PER_PAGE);

  if (rows.length === 0) {
    return (
      <>
        <PrintToolbar title={title} subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-center text-[11pt] text-slate-600">
            No students qualify for this merit list.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PrintToolbar title={title} subtitle={`${exam.name} · ${rows.length} student(s)`} />

      {pages.map((pageRows, pageIndex) => (
        <section key={pageIndex} className="sheet sheet-a4">
          <Letterhead
            academy={academy}
            documentTitle={title}
            subtitle={`${exam.name} · Session ${exam.session.name} · ${scopeLabel}`}
          />

          <table className="doc-table" style={{ marginTop: '4mm' }}>
            <thead>
              <tr>
                <th className="num" style={{ width: '9%' }}>
                  Position
                </th>
                <th className="num" style={{ width: '14%' }}>
                  Roll No.
                </th>
                <th>Student Name</th>
                <th>Father Name</th>
                <th style={{ width: '15%' }}>Class / Section</th>
                <th className="num" style={{ width: '9%' }}>
                  Max
                </th>
                <th className="num" style={{ width: '10%' }}>
                  Obtained
                </th>
                <th className="num" style={{ width: '10%' }}>
                  %
                </th>
                <th className="num" style={{ width: '8%' }}>
                  Grade
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => {
                const position = row.position ?? pageIndex * ROWS_PER_PAGE + index + 1;
                return (
                  <tr key={row.id}>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {position}
                    </td>
                    <td className="num">{row.rollNumber}</td>
                    <td>
                      <strong>{row.student.fullName}</strong>
                    </td>
                    <td>{row.student.fatherName}</td>
                    <td>
                      {row.enrollment.schoolClass.name} — {row.enrollment.section.name}
                    </td>
                    <td className="num">{formatMarks(row.totalMaxMarks)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {formatMarks(row.totalObtained)}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {formatPercent(row.percentage)}
                    </td>
                    <td className="num">
                      <strong>{row.grade}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pageIndex === pages.length - 1 && (
            <div style={{ marginTop: '14mm' }}>
              <SignatureRow
                signatures={[
                  {
                    label: 'Examination Controller',
                    name: academy.examControllerName,
                    imagePath: academy.examControllerSign,
                  },
                  {
                    label: 'Principal / Director',
                    name: academy.principalName ?? academy.directorName,
                    imagePath: academy.principalSignPath ?? academy.directorSignPath,
                  },
                ]}
              />
            </div>
          )}

          <div style={{ marginTop: '6mm' }}>
            <DocumentFooter
              academy={academy}
              note={`Page ${pageIndex + 1} of ${pages.length} — ${academy.footerMessage}`}
            />
          </div>
        </section>
      ))}
    </>
  );
}
