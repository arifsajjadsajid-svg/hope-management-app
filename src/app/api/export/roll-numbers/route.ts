import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { buildWorkbook, spreadsheetHeaders } from '@/server/services/excel';
import { formatDate, slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requirePermission('exams.view');
  } catch {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const examId = params.get('examId');
  if (!examId) return NextResponse.json({ error: 'examId is required' }, { status: 400 });

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
  ]);
  if (!exam) return NextResponse.json({ error: 'Examination not found' }, { status: 404 });

  const [allocations, seats] = await Promise.all([
    prisma.rollNumberAllocation.findMany({
      where: {
        examId,
        ...(params.get('classId') ? { enrollment: { classId: params.get('classId')! } } : {}),
        ...(params.get('sectionId') ? { enrollment: { sectionId: params.get('sectionId')! } } : {}),
      },
      include: {
        student: { select: { fullName: true, fatherName: true, admissionNumber: true } },
        enrollment: {
          include: {
            schoolClass: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
      orderBy: [{ sequence: 'asc' }, { rollNumber: 'asc' }],
    }),
    prisma.seatAssignment.findMany({
      where: { examId },
      include: { room: { select: { name: true, roomNumber: true } } },
    }),
  ]);

  const seatByStudent = new Map(seats.map((s) => [s.studentId, s]));

  const buffer = await buildWorkbook({
    academy,
    sheetName: 'Roll Numbers',
    documentTitle: `ROLL NUMBER LIST — ${exam.name.toUpperCase()}`,
    subtitle: `Academic Session ${exam.session.name}`,
    meta: [
      ['Candidates', String(allocations.length)],
      ['Generated', formatDate(new Date())],
    ],
    columns: [
      { header: 'Sr.', key: 'sr', numeric: true, width: 6 },
      { header: 'Roll Number', key: 'rollNumber', width: 16 },
      { header: 'Student Name', key: 'studentName', width: 26 },
      { header: 'Father Name', key: 'fatherName', width: 26 },
      { header: 'Admission No.', key: 'admissionNumber', width: 18 },
      { header: 'Class', key: 'className', width: 14 },
      { header: 'Section', key: 'sectionName', numeric: true, width: 10 },
      { header: 'Room', key: 'room', width: 22 },
      { header: 'Seat', key: 'seat', numeric: true, width: 10 },
      { header: 'Examination Centre', key: 'center', width: 40 },
    ],
    rows: allocations.map((allocation, index) => {
      const seat = seatByStudent.get(allocation.studentId);
      return {
        sr: index + 1,
        rollNumber: allocation.rollNumber,
        studentName: allocation.student.fullName,
        fatherName: allocation.student.fatherName,
        admissionNumber: allocation.student.admissionNumber,
        className: allocation.enrollment.schoolClass.name,
        sectionName: allocation.enrollment.section.name,
        room: seat ? `${seat.room.name} (${seat.room.roomNumber})` : '',
        seat: seat?.seatNumber ?? '',
        center: allocation.examCenter ?? exam.examCenter ?? '',
      };
    }),
  });

  const fileName = `${slugify(academy.shortName)}-roll-numbers-${slugify(exam.name)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), { headers: spreadsheetHeaders(fileName) });
}
