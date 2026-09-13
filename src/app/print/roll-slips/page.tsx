import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings } from '@/lib/settings';
import { verificationQr } from '@/lib/qr';
import { chunk } from '@/lib/utils';
import { PrintToolbar } from '../print-toolbar';
import { RollSlip, type SlipData } from './roll-slip';

export const metadata: Metadata = { title: 'Roll Number Slips' };
export const dynamic = 'force-dynamic';

export default async function RollSlipsPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('rollslips.print');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const examId = pick('examId');
  if (!examId) notFound();

  const classId = pick('classId');
  const sectionId = pick('sectionId');
  const studentId = pick('studentId');
  const perPage = Number(pick('perPage') ?? 2) === 1 ? 1 : Number(pick('perPage') ?? 2) === 4 ? 4 : 2;

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({
      where: { id: examId },
      include: { session: true },
    }),
  ]);
  if (!exam) notFound();

  const allocations = await prisma.rollNumberAllocation.findMany({
    where: {
      examId,
      ...(studentId ? { studentId } : {}),
      ...(classId ? { enrollment: { classId } } : {}),
      ...(sectionId ? { enrollment: { sectionId } } : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          fatherName: true,
          admissionNumber: true,
          photoPath: true,
        },
      },
      enrollment: {
        include: {
          schoolClass: { select: { id: true, name: true, displayOrder: true } },
          section: { select: { name: true } },
        },
      },
    },
    orderBy: [{ sequence: 'asc' }, { rollNumber: 'asc' }],
  });

  if (allocations.length === 0) {
    return (
      <>
        <PrintToolbar title="Roll Number Slips" subtitle={exam.name} />
        <div className="sheet sheet-a4 flex items-center justify-center">
          <p className="text-center text-[11pt] text-slate-600">
            No roll numbers have been allocated for this selection.
          </p>
        </div>
      </>
    );
  }

  const [dateSheets, seats] = await Promise.all([
    prisma.dateSheetEntry.findMany({
      where: { examId },
      include: {
        examSubject: { include: { subject: { select: { name: true, code: true } } } },
        room: { select: { name: true, roomNumber: true } },
      },
      orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.seatAssignment.findMany({
      where: { examId },
      include: { room: { select: { name: true, roomNumber: true } } },
    }),
  ]);

  const seatByStudent = new Map(seats.map((s) => [s.studentId, s]));

  const slips: SlipData[] = await Promise.all(
    allocations.map(async (allocation) => {
      const seat = seatByStudent.get(allocation.studentId);
      const papers = dateSheets
        .filter(
          (entry) =>
            entry.classId === allocation.enrollment.classId &&
            (entry.sectionId === null || entry.sectionId === allocation.enrollment.sectionId),
        )
        .map((entry) => ({
          subjectName: entry.examSubject.subject.name,
          subjectCode: entry.examSubject.subject.code,
          paperDate: entry.paperDate,
          startTime: entry.startTime,
          endTime: entry.endTime,
          roomLabel: entry.room ? `${entry.room.name} (${entry.room.roomNumber})` : null,
        }));

      // The roll number itself is the verifiable identifier on a slip.
      const code = `RS-${allocation.rollNumber}`;

      return {
        studentId: allocation.studentId,
        rollNumber: allocation.rollNumber,
        studentName: allocation.student.fullName,
        fatherName: allocation.student.fatherName,
        admissionNumber: allocation.student.admissionNumber,
        photoPath: allocation.student.photoPath,
        className: allocation.enrollment.schoolClass.name,
        sectionName: allocation.enrollment.section.name,
        sessionName: exam.session.name,
        examName: exam.name,
        examCenter: allocation.examCenter ?? exam.examCenter ?? `${academy.name}, ${academy.address}`,
        roomLabel: seat ? `${seat.room.name} (${seat.room.roomNumber})` : null,
        seatNumber: seat?.seatNumber ?? null,
        qrDataUrl: await verificationQr(code, perPage === 1 ? 160 : 120),
        verificationCode: code,
        papers,
      };
    }),
  );

  const pages = chunk(slips, perPage);

  return (
    <>
      <PrintToolbar
        title="Roll Number Slips"
        subtitle={`${exam.name} · ${slips.length} slip(s) · ${perPage} per page`}
      />

      {pages.map((pageSlips, pageIndex) => (
        <section
          key={pageIndex}
          className="sheet sheet-a4-flush"
          style={{
            display: 'grid',
            gridTemplateColumns: perPage === 4 ? '1fr 1fr' : '1fr',
            gridTemplateRows:
              perPage === 1 ? '1fr' : perPage === 2 ? '1fr 1fr' : '1fr 1fr',
            gap: '4mm',
          }}
        >
          {pageSlips.map((slip) => (
            <RollSlip
              key={slip.studentId}
              academy={academy}
              slip={slip}
              size={perPage === 1 ? 'lg' : 'sm'}
              showDateSheet={perPage !== 4}
            />
          ))}
        </section>
      ))}
    </>
  );
}
