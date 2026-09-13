import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';

export const metadata: Metadata = { title: 'Seating Plan' };
export const dynamic = 'force-dynamic';

export default async function SeatingPlanPrintPage({
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
      where: { examId },
      include: {
        room: true,
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

  const byRoom = new Map<string, typeof seats>();
  for (const seat of seats) {
    const bucket = byRoom.get(seat.roomId) ?? [];
    bucket.push(seat);
    byRoom.set(seat.roomId, bucket);
  }

  if (byRoom.size === 0) {
    return (
      <>
        <PrintToolbar title="Seating Plan" subtitle={exam.name} landscape />
        <div className="sheet sheet-a4-landscape flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">
            No seating plan has been generated for this examination.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PrintToolbar
        title="Seating Plan"
        subtitle={`${exam.name} · ${byRoom.size} room(s) · ${seats.length} candidates`}
        landscape
      />

      {[...byRoom.entries()].map(([roomId, roomSeats]) => {
        const room = roomSeats[0]!.room;
        const seatAt = new Map(roomSeats.map((s) => [`${s.rowNo}-${s.colNo}`, s]));

        return (
          <section key={roomId} className="sheet sheet-a4-landscape">
            <Letterhead
              academy={academy}
              documentTitle="Examination Seating Plan"
              subtitle={`${exam.name} · Session ${exam.session.name}`}
            />

            <div
              style={{
                marginTop: '3.5mm',
                border: '0.4mm solid #24384f',
                borderRadius: '1.5mm',
                background: '#f4f6fa',
                padding: '2mm 3mm',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '9.5pt',
              }}
            >
              <span>
                <strong>Room:</strong> {room.name} ({room.roomNumber})
              </span>
              <span>
                <strong>Building:</strong> {room.building ?? '—'}
              </span>
              <span>
                <strong>Grid:</strong> {room.rowCount} rows × {room.colCount} columns
              </span>
              <span>
                <strong>Occupied:</strong> {roomSeats.length} seat(s)
              </span>
            </div>

            <p
              style={{
                textAlign: 'center',
                fontSize: '8pt',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#3a4a60',
                margin: '3mm 0 2mm',
                fontWeight: 700,
              }}
            >
              ← Front of hall / Invigilator desk →
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${room.colCount}, minmax(0, 1fr))`,
                gap: '1.6mm',
              }}
            >
              {Array.from({ length: room.rowCount }).flatMap((_, rowIndex) =>
                Array.from({ length: room.colCount }).map((__, colIndex) => {
                  const seat = seatAt.get(`${rowIndex + 1}-${colIndex + 1}`);
                  if (!seat) {
                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        style={{
                          border: '0.25mm dashed #cbd5e1',
                          borderRadius: '1mm',
                          padding: '1.6mm 1mm',
                          textAlign: 'center',
                          minHeight: '13mm',
                          color: '#cbd5e1',
                          fontSize: '6.5pt',
                        }}
                      >
                        R{rowIndex + 1}C{colIndex + 1}
                        <br />
                        Vacant
                      </div>
                    );
                  }
                  const enrolment = seat.student.enrollments[0];
                  return (
                    <div
                      key={seat.id}
                      style={{
                        border: '0.3mm solid #24384f',
                        borderRadius: '1mm',
                        padding: '1.4mm 1mm',
                        textAlign: 'center',
                        minHeight: '13mm',
                        background: '#ffffff',
                      }}
                    >
                      <p style={{ fontSize: '6pt', color: '#3a4a60' }}>{seat.seatNumber}</p>
                      <p
                        style={{
                          fontSize: '8.5pt',
                          fontWeight: 700,
                          color: '#0f2547',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {rollByStudent.get(seat.studentId) ?? '—'}
                      </p>
                      <p style={{ fontSize: '5.8pt', color: '#3a4a60', lineHeight: 1.2 }}>
                        {enrolment ? `${enrolment.schoolClass.name}-${enrolment.section.name}` : ''}
                      </p>
                    </div>
                  );
                }),
              )}
            </div>

            <div style={{ marginTop: '10mm' }}>
              <SignatureRow
                signatures={[
                  { label: 'Room Superintendent', name: null },
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

            <div style={{ marginTop: '5mm' }}>
              <DocumentFooter academy={academy} />
            </div>
          </section>
        );
      })}
    </>
  );
}
