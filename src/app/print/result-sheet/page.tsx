import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { listResults } from '@/server/queries/results';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { RESULT_STATUS_LABELS } from '@/lib/constants';
import { formatMarks, formatPercent, ordinal, chunk } from '@/lib/utils';

export const metadata: Metadata = { title: 'Consolidated Result Sheet' };
export const dynamic = 'force-dynamic';

const ROWS_PER_PAGE = 20;

/**
 * The consolidated result sheet: one row per candidate with every subject as a
 * column. Printed in landscape so wide subject lists fit.
 */
export default async function ResultSheetPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('results.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const examId = pick('examId');
  if (!examId) notFound();

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
  ]);
  if (!exam) notFound();

  const results = await listResults({
    examId,
    classId: pick('classId'),
    sectionId: pick('sectionId'),
    status: pick('status'),
    q: pick('q'),
  });

  if (results.length === 0) {
    return (
      <>
        <PrintToolbar title="Consolidated Result Sheet" subtitle={exam.name} landscape />
        <div className="sheet sheet-a4-landscape flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">No results match this selection.</p>
        </div>
      </>
    );
  }

  const resultSubjects = await prisma.resultSubject.findMany({
    where: { resultId: { in: results.map((r) => r.id) } },
    orderBy: { displayOrder: 'asc' },
  });

  const subjectsByResult = new Map<string, typeof resultSubjects>();
  for (const row of resultSubjects) {
    const bucket = subjectsByResult.get(row.resultId) ?? [];
    bucket.push(row);
    subjectsByResult.set(row.resultId, bucket);
  }

  // Sheets are grouped per class because subject columns differ between classes.
  const byClass = new Map<string, typeof results>();
  for (const result of results) {
    const key = result.enrollment.schoolClass.name;
    const bucket = byClass.get(key) ?? [];
    bucket.push(result);
    byClass.set(key, bucket);
  }

  return (
    <>
      <PrintToolbar
        title="Consolidated Result Sheet"
        subtitle={`${exam.name} · ${results.length} candidate(s)`}
        landscape
      />

      {[...byClass.entries()].map(([className, classResults]) => {
        // Subject columns come from the first candidate of the class.
        const columns = (subjectsByResult.get(classResults[0]!.id) ?? []).map((s) => ({
          code: s.subjectCode,
          name: s.subjectName,
          max: s.maxMarks,
        }));
        const pages = chunk(classResults, ROWS_PER_PAGE);

        return pages.map((pageRows, pageIndex) => (
          <section key={`${className}-${pageIndex}`} className="sheet sheet-a4-landscape">
            <Letterhead
              academy={academy}
              documentTitle="Consolidated Result Sheet"
              subtitle={`${exam.name} · Session ${exam.session.name} · ${className}`}
            />

            <table className="doc-table" style={{ marginTop: '3.5mm', fontSize: '8pt' }}>
              <thead>
                <tr>
                  <th className="num" style={{ width: '14mm', padding: '2mm 1mm' }}>
                    Roll
                  </th>
                  <th style={{ padding: '2mm 1.5mm' }}>Student Name</th>
                  <th style={{ width: '14mm', padding: '2mm 1mm' }} className="num">
                    Sec.
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.code}
                      className="num"
                      style={{ padding: '2mm 0.6mm', fontSize: '7pt' }}
                      title={column.name}
                    >
                      {column.code}
                      <span style={{ display: 'block', fontWeight: 400, fontSize: '6pt' }}>
                        /{formatMarks(column.max)}
                      </span>
                    </th>
                  ))}
                  <th className="num" style={{ width: '15mm', padding: '2mm 1mm' }}>
                    Total
                  </th>
                  <th className="num" style={{ width: '14mm', padding: '2mm 1mm' }}>
                    %
                  </th>
                  <th className="num" style={{ width: '12mm', padding: '2mm 1mm' }}>
                    Grade
                  </th>
                  <th className="num" style={{ width: '12mm', padding: '2mm 1mm' }}>
                    Pos.
                  </th>
                  <th className="num" style={{ width: '18mm', padding: '2mm 1mm' }}>
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((result) => {
                  const subjects = subjectsByResult.get(result.id) ?? [];
                  const byCode = new Map(subjects.map((s) => [s.subjectCode, s]));

                  return (
                    <tr key={result.id}>
                      <td className="num" style={{ padding: '1.6mm 1mm' }}>
                        <strong>{result.rollNumber}</strong>
                      </td>
                      <td style={{ padding: '1.6mm 1.5mm' }}>{result.student.fullName}</td>
                      <td className="num" style={{ padding: '1.6mm 1mm' }}>
                        {result.enrollment.section.name}
                      </td>
                      {columns.map((column) => {
                        const subject = byCode.get(column.code);
                        const special = subject && subject.specialStatus !== 'NONE';
                        const failing =
                          subject && subject.status === 'FAIL' ? { color: '#be123c', fontWeight: 700 } : {};
                        return (
                          <td
                            key={column.code}
                            className="num"
                            style={{ padding: '1.6mm 0.6mm', ...failing }}
                          >
                            {!subject
                              ? '—'
                              : special
                                ? subject.specialStatus
                                : formatMarks(subject.obtainedMarks)}
                          </td>
                        );
                      })}
                      <td className="num" style={{ padding: '1.6mm 1mm', fontWeight: 700 }}>
                        {formatMarks(result.totalObtained)}
                      </td>
                      <td className="num" style={{ padding: '1.6mm 1mm', fontWeight: 700 }}>
                        {formatPercent(result.percentage, 1)}
                      </td>
                      <td className="num" style={{ padding: '1.6mm 1mm', fontWeight: 700 }}>
                        {result.grade}
                      </td>
                      <td className="num" style={{ padding: '1.6mm 1mm' }}>
                        {result.classPosition ? ordinal(result.classPosition) : '—'}
                      </td>
                      <td
                        className="num"
                        style={{
                          padding: '1.6mm 1mm',
                          fontWeight: 700,
                          color:
                            result.status === 'PASS'
                              ? '#047857'
                              : result.status === 'FAIL'
                                ? '#be123c'
                                : '#b45309',
                        }}
                      >
                        {RESULT_STATUS_LABELS[result.status] ?? result.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pageIndex === pages.length - 1 && (
              <div style={{ marginTop: '10mm' }}>
                <SignatureRow
                  signatures={[
                    { label: 'Prepared By', name: null },
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

            <div style={{ marginTop: '5mm' }}>
              <DocumentFooter
                academy={academy}
                note={`${className} — page ${pageIndex + 1} of ${pages.length} · ${academy.footerMessage}`}
              />
            </div>
          </section>
        ));
      })}
    </>
  );
}
