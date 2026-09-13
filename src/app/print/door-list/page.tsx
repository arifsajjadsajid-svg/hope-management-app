import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { Letterhead, DocumentFooter, SignatureRow } from '@/components/brand/letterhead';
import { PrintToolbar } from '../print-toolbar';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Door List' };
export const dynamic = 'force-dynamic';

export default async function DoorListPrintPage({
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
            fatherName: true,
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
        <PrintToolbar title="Door List" subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-[11pt] text-slate-600">No seating plan has been generated.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PrintToolbar
        title="Door Lists"
        subtitle={`${exam.name} · ${byRoom.size} room(s)`}
        hint="Door lists are posted outside each examination hall so candidates can find their room."
      />

      {[...byRoom.entries()].map(([roomId, roomSeats]) => {
        const room = roomSeats[0]!.room;
        const sorted = [...roomSeats].sort((a, b) =>
          (rollByStudent.get(a.studentId) ?? '').localeCompare(
            rollByStudent.get(b.studentId) ?? '',
            undefined,
            { numeric: true },
          ),
        );

        return (
          <section key={roomId} className="sheet sheet-a4">
            <Letterhead
              academy={academy}
              documentTitle="Door List"
              subtitle={`${exam.name} · Session ${exam.session.name}`}
            />

            <div
              style={{
                marginTop: '4mm',
                border: '0.5mm solid #0f2547',
                borderRadius: '1.5mm',
                background: '#0f2547',
                color: '#e6cd8d',
                padding: '3mm',
                textAlign: 'center',
              }}
            >
              <p
                className="doc-title"
                style={{ fontSize: '16pt', fontWeight: 700, letterSpacing: '0.06em' }}
              >
                {room.name} — {room.roomNumber}
              </p>
              <p style={{ fontSize: '9pt', color: '#c5d7ec', marginTop: '0.8mm' }}>
                {room.building ?? 'Examination Hall'} · {sorted.length} candidates ·{' '}
                {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
              </p>
            </div>

            <table className="doc-table" style={{ marginTop: '4mm' }}>
              <thead>
                <tr>
                  <th className="num" style={{ width: '7%' }}>
                    Sr.
                  </th>
                  <th className="num" style={{ width: '15%' }}>
                    Roll No.
                  </th>
                  <th>Student Name</th>
                  <th>Father Name</th>
                  <th style={{ width: '17%' }}>Class / Section</th>
                  <th className="num" style={{ width: '11%' }}>
                    Seat
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((seat, index) => {
                  const enrolment = seat.student.enrollments[0];
                  return (
                    <tr key={seat.id}>
                      <td className="num">{index + 1}</td>
                      <td className="num">
                        <strong>{rollByStudent.get(seat.studentId) ?? '—'}</strong>
                      </td>
                      <td>{seat.student.fullName}</td>
                      <td>{seat.student.fatherName}</td>
                      <td>
                        {enrolment
                          ? `${enrolment.schoolClass.name} — ${enrolment.section.name}`
                          : '—'}
                      </td>
                      <td className="num">
                        <strong>{seat.seatNumber}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: '12mm' }}>
              <SignatureRow
                signatures={[
                  { label: 'Room Superintendent', name: null },
                  {
                    label: 'Examination Controller',
                    name: academy.examControllerName,
                    imagePath: academy.examControllerSign,
                  },
                ]}
              />
            </div>

            <div style={{ marginTop: '6mm' }}>
              <DocumentFooter academy={academy} />
            </div>
          </section>
        );
      })}
    </>
  );
}
