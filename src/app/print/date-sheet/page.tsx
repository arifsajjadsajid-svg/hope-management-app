import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { EXAM_TYPE_LABELS } from '@/lib/constants';
import { formatDate, formatTime12, formatDuration, dayName } from '@/lib/utils';

export const metadata: Metadata = { title: 'Date Sheet' };
export const dynamic = 'force-dynamic';

export default async function DateSheetPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('exams.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const examId = pick('examId');
  const classFilter = pick('classId');
  if (!examId) notFound();

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({
      where: { id: examId },
      include: {
        session: true,
        examClasses: { include: { schoolClass: { select: { id: true, name: true, displayOrder: true } } } },
        dateSheets: {
          where: classFilter ? { classId: classFilter } : {},
          include: {
            examSubject: { include: { subject: { select: { name: true, code: true } } } },
            schoolClass: { select: { id: true, name: true, displayOrder: true } },
            section: { select: { name: true } },
            room: { select: { name: true, roomNumber: true } },
          },
          orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
        },
      },
    }),
  ]);

  if (!exam) notFound();

  // One printed sheet per class.
  const classes = classFilter
    ? exam.examClasses.filter((c) => c.classId === classFilter)
    : exam.examClasses;

  const orderedClasses = [...classes].sort(
    (a, b) => a.schoolClass.displayOrder - b.schoolClass.displayOrder,
  );

  const instructions = (exam.instructions ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const defaultInstructions = [
    'Candidates must reach the examination centre 15 minutes before the paper begins.',
    'The roll number slip is compulsory for entry into the examination hall.',
    'Mobile phones, smart watches and any unfair means are strictly prohibited.',
    'No candidate is allowed to leave the hall during the first 30 minutes.',
    'Bring your own stationery; borrowing inside the hall is not permitted.',
  ];

  return (
    <>
      <PrintToolbar
        title="Date Sheet"
        subtitle={`${exam.name} · ${orderedClasses.length} class sheet(s)`}
      />

      {orderedClasses.map((examClass) => {
        const papers = exam.dateSheets.filter((d) => d.classId === examClass.classId);

        return (
          <section key={examClass.id} className="sheet sheet-a4">
            <Letterhead
              academy={academy}
              documentTitle="Examination Date Sheet"
              subtitle={`${exam.name} — ${EXAM_TYPE_LABELS[exam.type] ?? exam.type}`}
            />

            <div
              className="mt-[4mm] flex items-center justify-between rounded-[1.5mm] border border-[#24384f] bg-[#f4f6fa] px-[4mm] py-[2.5mm]"
              style={{ fontSize: '10pt' }}
            >
              <span>
                <strong>Class:</strong> {examClass.schoolClass.name}
              </span>
              <span>
                <strong>Session:</strong> {exam.session.name}
              </span>
              <span>
                <strong>Examination Period:</strong> {formatDate(exam.startDate)} –{' '}
                {formatDate(exam.endDate)}
              </span>
            </div>

            {papers.length === 0 ? (
              <p className="mt-[10mm] text-center" style={{ fontSize: '11pt' }}>
                No papers have been scheduled for this class.
              </p>
            ) : (
              <table className="doc-table mt-[4mm]">
                <thead>
                  <tr>
                    <th style={{ width: '8%' }} className="num">
                      Sr.
                    </th>
                    <th style={{ width: '20%' }}>Date</th>
                    <th style={{ width: '14%' }}>Day</th>
                    <th>Subject</th>
                    <th style={{ width: '20%' }}>Timing</th>
                    <th style={{ width: '13%' }} className="num">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((paper, index) => (
                    <tr key={paper.id}>
                      <td className="num">{index + 1}</td>
                      <td className="num">{formatDate(paper.paperDate)}</td>
                      <td>{dayName(paper.paperDate)}</td>
                      <td>
                        <strong>{paper.examSubject.subject.name}</strong>
                        <span style={{ color: '#3a4a60' }}> ({paper.examSubject.subject.code})</span>
                        {paper.section ? ` — Section ${paper.section.name}` : ''}
                        {paper.room ? (
                          <span style={{ display: 'block', fontSize: '8.5pt', color: '#3a4a60' }}>
                            Room: {paper.room.name} ({paper.room.roomNumber})
                          </span>
                        ) : null}
                      </td>
                      <td className="num">
                        {formatTime12(paper.startTime)} – {formatTime12(paper.endTime)}
                      </td>
                      <td className="num">{formatDuration(paper.durationMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-[5mm] avoid-break">
              <h3
                className="doc-serif font-bold uppercase text-[#0f2547]"
                style={{ fontSize: '10pt', letterSpacing: '0.05em' }}
              >
                Important Instructions
              </h3>
              <ol
                className="mt-[1.5mm] list-decimal pl-[6mm]"
                style={{ fontSize: '9pt', lineHeight: 1.7 }}
              >
                {(instructions.length > 0 ? instructions : defaultInstructions).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </div>

            <div className="mt-[14mm]">
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

            <div className="mt-[6mm]">
              <DocumentFooter academy={academy} />
            </div>
          </section>
        );
      })}
    </>
  );
}
