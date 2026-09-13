import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { buildWorkbook, spreadsheetHeaders } from '@/server/services/excel';
import { slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Blank import templates with the exact column headers the import wizard
 * understands, pre-filled with one example row.
 */
export async function GET(request: Request) {
  try {
    await requireAnyPermission(['students.import', 'marks.import']);
  } catch {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const type = params.get('type') ?? 'students';
  const academy = await getAcademySettings();

  if (type === 'marks') {
    const examSubjectId = params.get('examSubjectId');
    if (!examSubjectId) {
      return NextResponse.json({ error: 'examSubjectId is required' }, { status: 400 });
    }

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: {
        exam: { select: { id: true, name: true, sessionId: true } },
        subject: { select: { name: true, code: true, classId: true } },
      },
    });
    if (!examSubject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    // Pre-fill the candidate list so the operator only types the marks.
    const [allocations, enrollments] = await Promise.all([
      prisma.rollNumberAllocation.findMany({
        where: { examId: examSubject.exam.id },
        include: {
          student: { select: { id: true, fullName: true } },
          enrollment: { select: { classId: true, section: { select: { name: true } } } },
        },
        orderBy: [{ sequence: 'asc' }],
      }),
      prisma.enrollment.findMany({
        where: {
          sessionId: examSubject.exam.sessionId,
          classId: examSubject.subject.classId,
        },
        include: { student: { select: { id: true, fullName: true } }, section: { select: { name: true } } },
        orderBy: { rollNumber: 'asc' },
      }),
    ]);

    const forClass = allocations.filter(
      (a) => a.enrollment.classId === examSubject.subject.classId,
    );

    const rows = forClass.length
      ? forClass.map((allocation) => ({
          rollNumber: allocation.rollNumber,
          studentName: allocation.student.fullName,
          section: allocation.enrollment.section.name,
          theory: '',
          practical: '',
        }))
      : enrollments.map((enrollment) => ({
          rollNumber: enrollment.rollNumber ?? '',
          studentName: enrollment.student.fullName,
          section: enrollment.section.name,
          theory: '',
          practical: '',
        }));

    const hasPractical = examSubject.practicalMarks > 0;

    const buffer = await buildWorkbook({
      academy,
      sheetName: 'Marks',
      documentTitle: `MARKS ENTRY TEMPLATE — ${examSubject.subject.name.toUpperCase()}`,
      subtitle: `${examSubject.exam.name} · Maximum ${examSubject.maxMarks}${
        hasPractical
          ? ` (theory ${examSubject.theoryMarks} + practical ${examSubject.practicalMarks})`
          : ''
      }`,
      meta: [['Codes', 'ABS = Absent, EX = Exempted, MED = Medical, WH = Withheld']],
      columns: [
        { header: 'Roll Number', key: 'rollNumber', width: 16 },
        { header: 'Student Name', key: 'studentName', width: 28 },
        { header: 'Section', key: 'section', width: 10, numeric: true },
        { header: 'Theory', key: 'theory', width: 12, numeric: true },
        ...(hasPractical
          ? [{ header: 'Practical', key: 'practical', width: 12, numeric: true }]
          : []),
      ],
      rows,
    });

    const fileName = `${slugify(academy.shortName)}-marks-template-${slugify(examSubject.subject.code)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), { headers: spreadsheetHeaders(fileName) });
  }

  const buffer = await buildWorkbook({
    academy,
    sheetName: 'Students',
    documentTitle: 'STUDENT IMPORT TEMPLATE',
    subtitle: 'Fill one row per student. Admission Number, Student Name and Father Name are required.',
    meta: [['Date format', 'DD/MM/YYYY or YYYY-MM-DD'], ['Gender', 'Male / Female / Other']],
    columns: [
      { header: 'Admission Number', key: 'admissionNumber', width: 18 },
      { header: 'Registration Number', key: 'registrationNo', width: 18 },
      { header: 'Student Name', key: 'fullName', width: 26 },
      { header: 'Father Name', key: 'fatherName', width: 26 },
      { header: 'Mother Name', key: 'motherName', width: 24 },
      { header: 'Guardian Name', key: 'guardianName', width: 24 },
      { header: 'Date of Birth', key: 'dateOfBirth', width: 14, numeric: true },
      { header: 'Gender', key: 'gender', width: 10, numeric: true },
      { header: 'B-Form / CNIC', key: 'bformCnic', width: 18 },
      { header: 'Class Roll', key: 'classRollNumber', width: 11, numeric: true },
      { header: 'Parent Phone', key: 'parentPhone', width: 16 },
      { header: 'Student Phone', key: 'studentPhone', width: 16 },
      { header: 'WhatsApp', key: 'whatsappNumber', width: 16 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Address', key: 'address', width: 34 },
      { header: 'Previous School', key: 'previousSchool', width: 26 },
      { header: 'Emergency Contact', key: 'emergencyContact', width: 18 },
      { header: 'Status', key: 'status', width: 12, numeric: true },
    ],
    rows: [
      {
        admissionNumber: 'HSA-2026-0100',
        registrationNo: 'REG-26-1100',
        fullName: 'Example Student',
        fatherName: 'Example Father',
        motherName: 'Example Mother',
        guardianName: 'Example Father',
        dateOfBirth: '14/03/2010',
        gender: 'Male',
        bformCnic: '35202-1234567-1',
        classRollNumber: '01',
        parentPhone: '0300-1234567',
        studentPhone: '',
        whatsappNumber: '0300-1234567',
        email: 'example@student.hopescienceacademy.edu.pk',
        address: 'House 1, Block A, Johar Town, Lahore',
        previousSchool: 'Al-Noor Public School, Lahore',
        emergencyContact: '0333-1234567',
        status: 'ACTIVE',
      },
    ],
  });

  const fileName = `${slugify(academy.shortName)}-student-import-template.xlsx`;
  return new NextResponse(new Uint8Array(buffer), { headers: spreadsheetHeaders(fileName) });
}
