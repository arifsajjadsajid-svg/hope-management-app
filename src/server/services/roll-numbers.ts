import { prisma } from '@/lib/prisma';

export type RollPreviewRow = {
  studentId: string;
  enrollmentId: string;
  studentName: string;
  fatherName: string;
  admissionNumber: string;
  className: string;
  sectionName: string;
  classRoll: string | null;
  rollNumber: string;
  sequence: number;
  /** Roll number already stored for this student on this examination. */
  existing: string | null;
  changed: boolean;
};

/** "Grade 9" -> "9", "First Year" -> "FY", "O-Level" -> "OL" */
export function classToken(className: string): string {
  const digits = className.match(/\d+/);
  if (digits) return digits[0];
  const words = className.split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words.map((w) => w[0]!.toUpperCase()).join('');
}

function pad(value: number, width: number): string {
  return String(value).padStart(Math.max(1, width), '0');
}

/**
 * Builds the roll numbers an examination would receive, without writing
 * anything. Drives the mandatory preview screen before generation is committed.
 */
export async function previewRollNumbers(examId: string): Promise<{
  rows: RollPreviewRow[];
  duplicates: string[];
  method: string;
}> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      examClasses: { select: { classId: true } },
      examSections: { select: { sectionId: true } },
    },
  });
  if (!exam) throw new Error('Examination not found.');

  const classIds = exam.examClasses.map((c) => c.classId);
  const sectionIds = exam.examSections.map((s) => s.sectionId);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId: exam.sessionId,
      classId: { in: classIds.length ? classIds : ['__none__'] },
      ...(sectionIds.length ? { sectionId: { in: sectionIds } } : {}),
      status: { notIn: ['LEFT', 'TRANSFERRED'] },
      student: { status: { notIn: ['WITHDRAWN', 'TRANSFERRED'] } },
    },
    include: {
      student: { select: { id: true, fullName: true, fatherName: true, admissionNumber: true } },
      schoolClass: { select: { name: true, displayOrder: true } },
      section: { select: { name: true } },
    },
    orderBy: [
      { schoolClass: { displayOrder: 'asc' } },
      { section: { name: 'asc' } },
      { student: { fullName: 'asc' } },
    ],
  });

  const existing = new Map(
    (await prisma.rollNumberAllocation.findMany({ where: { examId } })).map((r) => [
      r.studentId,
      r.rollNumber,
    ]),
  );

  const prefix = exam.rollNumberPrefix?.trim() ?? '';
  const padding = exam.rollNumberPadding || 3;
  const start = exam.rollNumberStart || 1;
  const method = exam.rollNumberMethod;

  const counters = new Map<string, number>();
  const nextSequence = (bucket: string) => {
    const current = counters.get(bucket) ?? start;
    counters.set(bucket, current + 1);
    return current;
  };

  const rows: RollPreviewRow[] = enrollments.map((enrollment) => {
    const cls = classToken(enrollment.schoolClass.name);
    const sec = enrollment.section.name;

    let bucket = '__all__';
    let rollNumber: string;
    let sequence: number;

    switch (method) {
      case 'CLASS_WISE':
        bucket = enrollment.classId;
        sequence = nextSequence(bucket);
        rollNumber = `${prefix}${cls}-${pad(sequence, padding)}`;
        break;
      case 'SECTION_WISE':
        bucket = enrollment.sectionId;
        sequence = nextSequence(bucket);
        rollNumber = `${prefix}${cls}${sec}-${pad(sequence, padding)}`;
        break;
      case 'MANUAL':
        sequence = nextSequence(bucket);
        rollNumber = existing.get(enrollment.studentId) ?? '';
        break;
      case 'SEQUENTIAL':
      case 'EXAM_SPECIFIC':
      default:
        sequence = nextSequence(bucket);
        rollNumber = `${prefix}${pad(sequence, padding)}`;
        break;
    }

    const prior = existing.get(enrollment.studentId) ?? null;

    return {
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
      studentName: enrollment.student.fullName,
      fatherName: enrollment.student.fatherName,
      admissionNumber: enrollment.student.admissionNumber,
      className: enrollment.schoolClass.name,
      sectionName: enrollment.section.name,
      classRoll: enrollment.rollNumber,
      rollNumber,
      sequence,
      existing: prior,
      changed: prior !== null && prior !== rollNumber,
    };
  });

  // Detect collisions inside the generated set.
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row.rollNumber) continue;
    seen.set(row.rollNumber, (seen.get(row.rollNumber) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([roll]) => roll);

  return { rows, duplicates, method };
}

/**
 * Commits generated roll numbers. Runs in one transaction so a partial
 * allocation can never be left behind, and refuses to run once results for the
 * examination are locked.
 */
export async function generateRollNumbers(examId: string): Promise<{
  created: number;
  updated: number;
  total: number;
}> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw new Error('Examination not found.');
  if (exam.resultLocked) {
    throw new Error('Results are locked for this examination. Roll numbers cannot be regenerated.');
  }
  if (exam.rollNumberMethod === 'MANUAL') {
    throw new Error(
      'This examination uses manual roll numbers. Enter them individually instead of generating.',
    );
  }

  const { rows, duplicates } = await previewRollNumbers(examId);

  if (rows.length === 0) {
    throw new Error('No active students were found in the classes selected for this examination.');
  }
  if (duplicates.length > 0) {
    throw new Error(
      `Generation aborted: duplicate roll numbers would be created (${duplicates.slice(0, 5).join(', ')}). Adjust the prefix, padding or method.`,
    );
  }

  const existing = await prisma.rollNumberAllocation.findMany({ where: { examId } });
  const existingByStudent = new Map(existing.map((r) => [r.studentId, r]));

  let created = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      // Clearing first avoids transient unique-constraint clashes when roll
      // numbers are shuffled between students.
      await tx.rollNumberAllocation.deleteMany({ where: { examId } });

      for (const row of rows) {
        await tx.rollNumberAllocation.create({
          data: {
            examId,
            studentId: row.studentId,
            enrollmentId: row.enrollmentId,
            rollNumber: row.rollNumber,
            sequence: row.sequence,
            method: exam.rollNumberMethod,
            examCenter: exam.examCenter,
          },
        });
        if (existingByStudent.has(row.studentId)) updated += 1;
        else created += 1;
      }
    },
    { timeout: 60_000 },
  );

  return { created, updated, total: rows.length };
}

/** Sets a single roll number by hand (used by the MANUAL method). */
export async function setManualRollNumber(
  examId: string,
  studentId: string,
  rollNumber: string,
): Promise<void> {
  const trimmed = rollNumber.trim();
  if (!trimmed) throw new Error('Enter a roll number.');

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, session: { exams: { some: { id: examId } } } },
    select: { id: true },
  });
  if (!enrollment) throw new Error('This student is not enrolled in the examination session.');

  const clash = await prisma.rollNumberAllocation.findFirst({
    where: { examId, rollNumber: trimmed, studentId: { not: studentId } },
  });
  if (clash) throw new Error(`Roll number ${trimmed} is already allocated to another student.`);

  await prisma.rollNumberAllocation.upsert({
    where: { examId_studentId: { examId, studentId } },
    update: { rollNumber: trimmed, method: 'MANUAL' },
    create: {
      examId,
      studentId,
      enrollmentId: enrollment.id,
      rollNumber: trimmed,
      sequence: 0,
      method: 'MANUAL',
    },
  });
}
