import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { listResults } from '@/server/queries/results';
import { buildWorkbook, spreadsheetHeaders, type SheetColumn } from '@/server/services/excel';
import { RESULT_STATUS_LABELS } from '@/lib/constants';
import { formatDate, round, slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requirePermission('results.view');
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

  const results = await listResults({
    examId,
    classId: params.get('classId') ?? undefined,
    sectionId: params.get('sectionId') ?? undefined,
    status: params.get('status') ?? undefined,
    q: params.get('q') ?? undefined,
  });

  const resultSubjects = await prisma.resultSubject.findMany({
    where: { resultId: { in: results.map((r) => r.id) } },
    orderBy: { displayOrder: 'asc' },
  });

  const subjectsByResult = new Map<string, typeof resultSubjects>();
  for (const row of resultSubjects) {
    const bucket = subjectsByResult.get(row.resultId) ?? [];
    bucket.push(row);
    subjectsByResult.set(row.resultId, bucket);
  }

  // Subject columns: the union across all candidates, keeping display order.
  const subjectOrder = new Map<string, { code: string; name: string; order: number }>();
  for (const row of resultSubjects) {
    if (!subjectOrder.has(row.subjectCode)) {
      subjectOrder.set(row.subjectCode, {
        code: row.subjectCode,
        name: row.subjectName,
        order: row.displayOrder,
      });
    }
  }
  const subjectColumns = [...subjectOrder.values()].sort((a, b) => a.order - b.order);

  const columns: SheetColumn[] = [
    { header: 'Sr.', key: 'sr', numeric: true, width: 6 },
    { header: 'Roll No.', key: 'rollNumber', width: 14 },
    { header: 'Student Name', key: 'studentName', width: 26 },
    { header: 'Father Name', key: 'fatherName', width: 26 },
    { header: 'Class', key: 'className', width: 12 },
    { header: 'Section', key: 'sectionName', width: 9, numeric: true },
    ...subjectColumns.map((s) => ({
      header: s.code,
      key: `subject_${s.code}`,
      numeric: true,
      width: 10,
    })),
    { header: 'Total Max', key: 'totalMax', numeric: true, width: 11 },
    { header: 'Obtained', key: 'totalObtained', numeric: true, width: 11 },
    { header: 'Percentage', key: 'percentage', numeric: true, width: 12 },
    { header: 'Grade', key: 'grade', numeric: true, width: 9 },
    { header: 'GPA', key: 'gpa', numeric: true, width: 8 },
    { header: 'Class Pos.', key: 'classPosition', numeric: true, width: 11 },
    { header: 'Section Pos.', key: 'sectionPosition', numeric: true, width: 12 },
    { header: 'Result', key: 'status', numeric: true, width: 14 },
    { header: 'Promotion', key: 'promotion', numeric: true, width: 14 },
    { header: 'Verification Code', key: 'verificationCode', width: 20 },
  ];

  const rows = results.map((result, index) => {
    const subjects = subjectsByResult.get(result.id) ?? [];
    const byCode = new Map(subjects.map((s) => [s.subjectCode, s]));

    const subjectCells: Record<string, string | number> = {};
    for (const column of subjectColumns) {
      const subject = byCode.get(column.code);
      subjectCells[`subject_${column.code}`] = !subject
        ? ''
        : subject.specialStatus !== 'NONE'
          ? subject.specialStatus
          : round(subject.obtainedMarks, 2);
    }

    return {
      sr: index + 1,
      rollNumber: result.rollNumber,
      studentName: result.student.fullName,
      fatherName: result.student.fatherName,
      className: result.enrollment.schoolClass.name,
      sectionName: result.enrollment.section.name,
      ...subjectCells,
      totalMax: round(result.totalMaxMarks, 2),
      totalObtained: round(result.totalObtained, 2),
      percentage: round(result.percentage, 2),
      grade: result.grade,
      gpa: round(result.gpa, 2),
      classPosition: result.classPosition ?? '',
      sectionPosition: result.sectionPosition ?? '',
      status: RESULT_STATUS_LABELS[result.status] ?? result.status,
      promotion:
        result.promotionStatus === 'PROMOTED'
          ? 'Promoted'
          : result.promotionStatus === 'NOT_PROMOTED'
            ? 'Not Promoted'
            : '',
      verificationCode: result.verificationCode,
    };
  });

  const buffer = await buildWorkbook({
    academy,
    sheetName: 'Results',
    documentTitle: `CONSOLIDATED RESULT — ${exam.name.toUpperCase()}`,
    subtitle: `Academic Session ${exam.session.name}`,
    meta: [
      ['Candidates', String(results.length)],
      ['Generated', formatDate(new Date())],
    ],
    columns,
    rows,
  });

  const fileName = `${slugify(academy.shortName)}-results-${slugify(exam.name)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), { headers: spreadsheetHeaders(fileName) });
}
