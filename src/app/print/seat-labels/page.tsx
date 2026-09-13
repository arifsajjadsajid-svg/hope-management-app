import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { PrintToolbar } from '../print-toolbar';
import { chunk } from '@/lib/utils';

export const metadata: Metadata = { title: 'Seat Labels' };
export const dynamic = 'force-dynamic';

/** Twelve labels per A4 sheet (3 columns × 4 rows), sized for desk fronts. */
const PER_PAGE = 12;

export default async function SeatLabelsPrintPage({
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

  const [academy, exam, seats, rolls] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
    prisma.seatAssignment.findMany({
      where: { examId, ...(pick('roomId') ? { roomId: pick('roomId') } : {}) },
      include: {
        room: { select: { name: true, roomNumber: true } },
        student: {
          select: {
            id: true,
            fullName: true,
            enrollments: {
              select: {
                schoolClass: { select: { name: true } },
                section: { select: { name: true } },
              },
              orderBy: { session: { startDate: 'desc' } },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ room: { roomNumber: 'asc' } }, { rowNo: 'asc' }, { colNo: 'asc' }],
    }),
    prisma.rollNumberAllocation.findMany({ where: { examId } }),
  ]);

  if (!exam) notFound();

  const rollByStudent = new Map(rolls.map((r) => [r.studentId, r.rollNumber]));

  if (seats.length === 0) {
    return (
      <>
        <PrintToolbar title="Seat Labels" subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">No seating plan has been generated.</p>
        </div>
      </>
    );
  }

  const pages = chunk(seats, PER_PAGE);

  return (
    <>
      <PrintToolbar
        title="Seat Labels"
        subtitle={`${exam.name} · ${seats.length} label(s)`}
        hint="Cut along the borders and place one label on each candidate's desk before the paper begins."
      />

      {pages.map((pageSeats, pageIndex) => (
        <section
          key={pageIndex}
          className="sheet sheet-a4-flush"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridAutoRows: '1fr',
            gap: '3mm',
          }}
        >
          {pageSeats.map((seat) => {
            const enrolment = seat.student.enrollments[0];
            return (
              <div
                key={seat.id}
                className="avoid-break"
                style={{
                  border: '0.4mm dashed #24384f',
                  borderRadius: '1.5mm',
                  padding: '3mm 2mm',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  background: '#ffffff',
                }}
              >
                <p
                  className="doc-title"
                  style={{
                    fontSize: '7.5pt',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#0f2547',
                    lineHeight: 1.2,
                  }}
                >
                  {academy.shortName} — {academy.name}
                </p>
                <div
                  style={{
                    height: '0.6mm',
                    width: '18mm',
                    margin: '1.5mm auto',
                    background: 'linear-gradient(90deg,#c8a34a,#e6cd8d,#c8a34a)',
                    borderRadius: '1mm',
                  }}
                />
                <p
                  style={{
                    fontSize: '20pt',
                    fontWeight: 700,
                    color: '#0f2547',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.1,
                  }}
                >
                  {rollByStudent.get(seat.studentId) ?? '—'}
                </p>
                <p style={{ fontSize: '8.5pt', fontWeight: 600, color: '#24384f', marginTop: '1mm' }}>
                  {seat.student.fullName}
                </p>
                <p style={{ fontSize: '7.5pt', color: '#3a4a60' }}>
                  {enrolment ? `${enrolment.schoolClass.name} — ${enrolment.section.name}` : ''}
                </p>
                <p
                  style={{
                    marginTop: '1.5mm',
                    fontSize: '8pt',
                    fontWeight: 700,
                    color: '#ffffff',
                    background: '#0f2547',
                    borderRadius: '1mm',
                    padding: '1mm 2mm',
                    display: 'inline-block',
                    alignSelf: 'center',
                  }}
                >
                  {seat.room.roomNumber} · Seat {seat.seatNumber}
                </p>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
