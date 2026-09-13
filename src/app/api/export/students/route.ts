import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { listStudents } from '@/server/queries/students';
import { buildWorkbook, spreadsheetHeaders } from '@/server/services/excel';
import { recordAudit } from '@/lib/audit';
import { STUDENT_STATUS_LABELS, GENDER_LABELS, AUDIT_ACTIONS } from '@/lib/constants';
import { formatDate, slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requirePermission('students.export');
  } catch {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const academy = await getAcademySettings();

  const { students, session, total } = await listStudents({
    q: params.get('q') ?? undefined,
    classId: params.get('classId') ?? undefined,
    sectionId: params.get('sectionId') ?? undefined,
    sessionId: params.get('sessionId') ?? undefined,
    status: params.get('status') ?? undefined,
    gender: params.get('gender') ?? undefined,
    page: 1,
    pageSize: 5000,
  });

  const buffer = await buildWorkbook({
    academy,
    sheetName: 'Students',
    documentTitle: 'STUDENT LIST',
    subtitle: session ? `Academic Session ${session.name}` : undefined,
    meta: [
      ['Total', String(total)],
      ['Generated', formatDate(new Date())],
    ],
    columns: [
      { header: 'Sr.', key: 'sr', numeric: true, width: 6 },
      { header: 'Admission No.', key: 'admissionNumber', width: 18 },
      { header: 'Registration No.', key: 'registrationNo', width: 18 },
      { header: 'Student Name', key: 'fullName', width: 26 },
      { header: 'Father Name', key: 'fatherName', width: 26 },
      { header: 'Mother Name', key: 'motherName', width: 24 },
      { header: 'Gender', key: 'gender', width: 10, numeric: true },
      { header: 'Date of Birth', key: 'dateOfBirth', width: 14, numeric: true },
      { header: 'B-Form / CNIC', key: 'bformCnic', width: 18 },
      { header: 'Class', key: 'className', width: 14 },
      { header: 'Section', key: 'sectionName', width: 10, numeric: true },
      { header: 'Class Roll', key: 'rollNumber', width: 10, numeric: true },
      { header: 'Parent Phone', key: 'parentPhone', width: 16 },
      { header: 'Student Phone', key: 'studentPhone', width: 16 },
      { header: 'WhatsApp', key: 'whatsappNumber', width: 16 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Address', key: 'address', width: 34 },
      { header: 'Previous School', key: 'previousSchool', width: 26 },
      { header: 'Emergency Contact', key: 'emergencyContact', width: 18 },
      { header: 'Admission Date', key: 'admissionDate', width: 14, numeric: true },
      { header: 'Status', key: 'status', width: 12, numeric: true },
    ],
    rows: students.map((student, index) => ({
      sr: index + 1,
      admissionNumber: student.admissionNumber,
      registrationNo: student.registrationNo ?? '',
      fullName: student.fullName,
      fatherName: student.fatherName,
      motherName: student.motherName ?? '',
      gender: GENDER_LABELS[student.gender] ?? student.gender,
      dateOfBirth: student.dateOfBirth ? formatDate(student.dateOfBirth) : '',
      bformCnic: student.bformCnic ?? '',
      className: student.enrollment?.schoolClass.name ?? '',
      sectionName: student.enrollment?.section.name ?? '',
      rollNumber: student.enrollment?.rollNumber ?? '',
      parentPhone: student.parentPhone ?? '',
      studentPhone: student.studentPhone ?? '',
      whatsappNumber: student.whatsappNumber ?? '',
      email: student.email ?? '',
      address: student.address ?? '',
      previousSchool: student.previousSchool ?? '',
      emergencyContact: student.emergencyContact ?? '',
      admissionDate: student.admissionDate ? formatDate(student.admissionDate) : '',
      status: STUDENT_STATUS_LABELS[student.status] ?? student.status,
    })),
  });

  await recordAudit({
    action: AUDIT_ACTIONS.STUDENT_UPDATED,
    entityType: 'Student',
    description: `Exported ${students.length} student record(s) to Excel`,
  });

  const fileName = `${slugify(academy.shortName)}-students-${session ? slugify(session.name) : 'all'}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), { headers: spreadsheetHeaders(fileName) });
}
