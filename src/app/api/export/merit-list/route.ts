import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { getMeritList, getSubjectToppers, type MeritScope } from '@/server/queries/results';
import { buildWorkbook, spreadsheetHeaders } from '@/server/services/excel';
import { RESULT_STATUS_LABELS } from '@/lib/constants';
import { formatDate, round, slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requirePermission('meritlists.view');
  } catch {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const examId = params.get('examId');
  if (!examId) return NextResponse.json({ error: 'examId is required' }, { status: 400 });

  const scope = (params.get('scope') as MeritScope | 'SUBJECT') || 'OVERALL';
  const classId = params.get('classId') ?? undefined;
  const sectionId = params.get('sectionId') ?? undefined;
  const limit = Number(params.get('limit') ?? 0) || undefined;

  const [academy, exam] = await Promise.all([
    getAcademySettings(),
    prisma.exam.findUnique({ where: { id: examId }, include: { session: true } }),
  ]);
  if (!exam) return NextResponse.json({ error: 'Examination not found' }, { status: 404 });

  if (scope === 'SUBJECT') {
    const toppers = await getSubjectToppers(examId);
    const buffer = await buildWorkbook({
      academy,
      sheetName: 'Subject Merit',
      documentTitle: `SUBJECT MERIT LIST — ${exam.name.toUpperCase()}`,
      subtitle: `Academic Session ${exam.session.name}`,
      meta: [['Generated', formatDate(new Date())]],
      columns: [
        { header: 'Sr.', key: 'sr', numeric: true, width: 6 },
        { header: 'Subject', key: 'subject', width: 26 },
        { header: 'Code', key: 'code', numeric: true, width: 10 },
        { header: 'Class', key: 'className', width: 14 },
        { header: 'Topper', key: 'studentName', width: 26 },
        { header: 'Father Name', key: 'fatherName', width: 26 },
        { header: 'Section', key: 'sectionName', numeric: true, width: 10 },
        { header: 'Obtained', key: 'obtained', numeric: true, width: 11 },
        { header: 'Maximum', key: 'max', numeric: true, width: 11 },
        { header: 'Percentage', key: 'percentage', numeric: true, width: 12 },
        { header: 'Grade', key: 'grade', numeric: true, width: 9 },
      ],
      rows: toppers.map((row, index) => ({
        sr: index + 1,
        subject: row.subjectName,
        code: row.subjectCode,
        className: row.className,
        studentName: row.studentName,
        fatherName: row.fatherName,
        sectionName: row.sectionName,
        obtained: round(row.obtainedMarks, 2),
        max: round(row.maxMarks, 2),
        percentage: round(row.percentage, 2),
        grade: row.grade,
      })),
    });

    const fileName = `${slugify(academy.shortName)}-subject-merit-${slugify(exam.name)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), { headers: spreadsheetHeaders(fileName) });
  }

  const rows = await getMeritList(examId, {
    scope: scope as MeritScope,
    classId,
    sectionId,
    limit,
  });

  const scopeLabel =
    scope === 'SECTION' ? 'SECTION MERIT LIST' : scope === 'CLASS' ? 'CLASS MERIT LIST' : 'OVERALL MERIT LIST';

  const buffer = await buildWorkbook({
    academy,
    sheetName: 'Merit List',
    documentTitle: `${scopeLabel} — ${exam.name.toUpperCase()}`,
    subtitle: `Academic Session ${exam.session.name}`,
    meta: [
      ['Students', String(rows.length)],
      ['Generated', formatDate(new Date())],
    ],
    columns: [
      { header: 'Position', key: 'position', numeric: true, width: 10 },
      { header: 'Roll No.', key: 'rollNumber', width: 14 },
      { header: 'Student Name', key: 'studentName', width: 26 },
      { header: 'Father Name', key: 'fatherName', width: 26 },
      { header: 'Class', key: 'className', width: 12 },
      { header: 'Section', key: 'sectionName', numeric: true, width: 9 },
      { header: 'Maximum Marks', key: 'totalMax', numeric: true, width: 14 },
      { header: 'Obtained Marks', key: 'totalObtained', numeric: true, width: 14 },
      { header: 'Percentage', key: 'percentage', numeric: true, width: 12 },
      { header: 'Grade', key: 'grade', numeric: true, width: 9 },
      { header: 'Result', key: 'status', numeric: true, width: 14 },
    ],
    rows: rows.map((row, index) => ({
      position: row.position ?? index + 1,
      rollNumber: row.rollNumber,
      studentName: row.student.fullName,
      fatherName: row.student.fatherName,
      className: row.enrollment.schoolClass.name,
      sectionName: row.enrollment.section.name,
      totalMax: round(row.totalMaxMarks, 2),
      totalObtained: round(row.totalObtained, 2),
      percentage: round(row.percentage, 2),
      grade: row.grade,
      status: RESULT_STATUS_LABELS[row.status] ?? row.status,
    })),
  });

  const fileName = `${slugify(academy.shortName)}-merit-${slugify(exam.name)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), { headers: spreadsheetHeaders(fileName) });
}
