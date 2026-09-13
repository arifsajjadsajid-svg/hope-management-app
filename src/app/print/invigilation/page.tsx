import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { formatDate, formatTime12, dayName, chunk } from '@/lib/utils';

export const metadata: Metadata = { title: 'Invigilation Duty Roster' };
export const dynamic = 'force-dynamic';

const ROWS_PER_PAGE = 26;

export default async function InvigilationPrintPage({
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
  if (!examId) notFound();

  const [academy, exam, duties] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
    prisma.invigilationDuty.findMany({
      where: { examId, ...(pick('teacherId') ? { teacherId: pick('teacherId') } : {}) },
      include: {
        teacher: { select: { fullName: true, employeeCode: true } },
        room: { select: { name: true, roomNumber: true } },
        dateSheetEntry: {
          include: {
            examSubject: { include: { subject: { select: { name: true } } } },
            schoolClass: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { dateSheetEntry: { paperDate: 'asc' } },
        { dateSheetEntry: { startTime: 'asc' } },
        { room: { roomNumber: 'asc' } },
      ],
    }),
  ]);

  if (!exam) notFound();

  if (duties.length === 0) {
    return (
      <>
        <PrintToolbar title="Invigilation Duty Roster" subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">
            No invigilation duties have been assigned for this examination.
          </p>
        </div>
      </>
    );
  }

  const pages = chunk(duties, ROWS_PER_PAGE);

  // Duty count per teacher for the summary block.
  const workload = new Map<string, number>();
  for (const duty of duties) {
    workload.set(duty.teacher.fullName, (workload.get(duty.teacher.fullName) ?? 0) + 1);
  }

  return (
    <>
      <PrintToolbar
        title="Invigilation Duty Roster"
        subtitle={`${exam.name} · ${duties.length} duty assignment(s)`}
      />

      {pages.map((pageDuties, pageIndex) => (
        <section key={pageIndex} className="sheet sheet-a4">
          <Letterhead
            academy={academy}
            documentTitle="Invigilation Duty Roster"
            subtitle={`${exam.name} · Session ${exam.session.name}`}
          />

          <table className="doc-table" style={{ marginTop: '4mm' }}>
            <thead>
              <tr>
                <th className="num" style={{ width: '6%' }}>
                  Sr.
                </th>
                <th className="num" style={{ width: '15%' }}>
                  Date
                </th>
                <th style={{ width: '11%' }}>Day</th>
                <th className="num" style={{ width: '17%' }}>
                  Timing
                </th>
                <th>Paper</th>
                <th style={{ width: '16%' }}>Room</th>
                <th style={{ width: '20%' }}>Teacher on Duty</th>
                <th style={{ width: '14%' }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {pageDuties.map((duty, index) => (
                <tr key={duty.id}>
                  <td className="num">{pageIndex * ROWS_PER_PAGE + index + 1}</td>
                  <td className="num">{formatDate(duty.dateSheetEntry.paperDate)}</td>
                  <td>{dayName(duty.dateSheetEntry.paperDate)}</td>
                  <td className="num">
                    {formatTime12(duty.dateSheetEntry.startTime)} –{' '}
                    {formatTime12(duty.dateSheetEntry.endTime)}
                  </td>
                  <td>
                    <strong>{duty.dateSheetEntry.examSubject.subject.name}</strong>
                    <span style={{ color: '#3a4a60' }}>
                      {' '}
                      — {duty.dateSheetEntry.schoolClass.name}
                    </span>
                  </td>
                  <td>
                    {duty.room.name}{' '}
                    <span style={{ color: '#3a4a60' }}>({duty.room.roomNumber})</span>
                  </td>
                  <td>
                    <strong>{duty.teacher.fullName}</strong>
                    <span style={{ display: 'block', fontSize: '7.5pt', color: '#3a4a60' }}>
                      {duty.teacher.employeeCode}
                    </span>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>
                    {duty.dutyRole.toLowerCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageIndex === pages.length - 1 && (
            <>
              <div style={{ marginTop: '5mm' }} className="avoid-break">
                <h3
                  className="doc-serif font-bold uppercase text-[#0f2547]"
                  style={{ fontSize: '10pt', letterSpacing: '0.05em' }}
                >
                  Duty Summary
                </h3>
                <div
                  style={{
                    marginTop: '2mm',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '1.5mm 4mm',
                    fontSize: '9pt',
                  }}
                >
                  {[...workload.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <span key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{name}</span>
                        <strong>{count}</strong>
                      </span>
                    ))}
                </div>
              </div>

              <div style={{ marginTop: '12mm' }}>
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
            </>
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
