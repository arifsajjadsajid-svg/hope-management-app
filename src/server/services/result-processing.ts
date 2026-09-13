import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  computeStudentResult,
  verifyMarksData,
  DEFAULT_POLICY,
  type PolicyLike,
  type SubjectInput,
  type VerificationIssue,
} from '@/lib/result-engine';
import { DEFAULT_GRADE_BANDS, type GradeBandLike } from '@/lib/grading';
import { assignPositions, type RankingMethod } from '@/lib/ranking';
import { verificationCode } from '@/lib/verification';
import { round } from '@/lib/utils';

/**
 * One examination subject together with the subject it belongs to. Declared
 * explicitly rather than inferred from `loadExamContext`, which would make the
 * context type reference itself.
 */
export type ExamSubjectWithSubject = Prisma.ExamSubjectGetPayload<{
  include: {
    subject: { select: { id: true; name: true; code: true; type: true; classId: true } };
  };
}>;

/**
 * Everything the engine needs for one examination, resolved once and reused by
 * result processing, the result preview and the verification screen.
 */
export type ExamContext = Awaited<ReturnType<typeof loadExamContext>>;

export async function loadExamContext(examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      session: true,
      gradingScheme: { include: { bands: { orderBy: { sortOrder: 'asc' } } } },
      resultPolicy: true,
      examClasses: { select: { classId: true } },
      examSections: { select: { sectionId: true } },
      examSubjects: {
        where: { isIncluded: true },
        include: { subject: { select: { id: true, name: true, code: true, type: true, classId: true } } },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });

  if (!exam) throw new Error('Examination not found.');

  const classIds = exam.examClasses.map((c) => c.classId);
  const restrictedSectionIds = exam.examSections.map((s) => s.sectionId);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId: exam.sessionId,
      classId: { in: classIds.length ? classIds : ['__none__'] },
      ...(restrictedSectionIds.length ? { sectionId: { in: restrictedSectionIds } } : {}),
      student: { status: { in: ['ACTIVE', 'GRADUATED'] } },
    },
    include: {
      student: {
        select: { id: true, fullName: true, fatherName: true, photoPath: true, admissionNumber: true },
      },
      schoolClass: { select: { id: true, name: true, displayOrder: true } },
      section: { select: { id: true, name: true } },
    },
    orderBy: [
      { schoolClass: { displayOrder: 'asc' } },
      { section: { name: 'asc' } },
      { rollNumber: 'asc' },
    ],
  });

  const [marks, rolls, attendance, dateSheets] = await Promise.all([
    prisma.mark.findMany({ where: { examId } }),
    prisma.rollNumberAllocation.findMany({ where: { examId } }),
    prisma.examAttendance.findMany({ where: { examId } }),
    prisma.dateSheetEntry.findMany({
      where: { examId },
      select: { id: true, classId: true, sectionId: true, examSubjectId: true },
    }),
  ]);

  const bands: GradeBandLike[] = exam.gradingScheme?.bands.length
    ? exam.gradingScheme.bands
    : DEFAULT_GRADE_BANDS;

  const policy: PolicyLike = exam.resultPolicy ?? DEFAULT_POLICY;

  return {
    exam,
    bands,
    policy,
    enrollments,
    marks,
    rolls,
    attendance,
    dateSheets,
    /** Exam subjects grouped by the class they belong to. */
    subjectsByClass: groupSubjectsByClass(exam.examSubjects),
  };
}

function groupSubjectsByClass(
  examSubjects: ExamSubjectWithSubject[],
): Map<string, ExamSubjectWithSubject[]> {
  const map = new Map<string, ExamSubjectWithSubject[]>();
  for (const es of examSubjects) {
    const bucket = map.get(es.subject.classId);
    if (bucket) bucket.push(es);
    else map.set(es.subject.classId, [es]);
  }
  return map;
}

/* ------------------------------------------------------------ preparation */

function buildSubjectInputs(
  context: ExamContext,
  classId: string,
  studentId: string,
): SubjectInput[] {
  const markByExamSubject = new Map(
    context.marks.filter((m) => m.studentId === studentId).map((m) => [m.examSubjectId, m]),
  );

  return (context.subjectsByClass.get(classId) ?? []).map((es, index) => {
    const mark = markByExamSubject.get(es.id);
    return {
      examSubjectId: es.id,
      subjectName: es.subject.name,
      subjectCode: es.subject.code,
      subjectType: es.subject.type,
      maxMarks: es.maxMarks,
      passingMarks: es.passingMarks,
      theoryMarks: es.theoryMarks,
      practicalMarks: es.practicalMarks,
      practicalPassing: es.practicalPassing,
      displayOrder: es.displayOrder || index,
      mark: mark
        ? {
            theoryMarks: mark.theoryMarks,
            practicalMarks: mark.practicalMarks,
            obtainedMarks: mark.obtainedMarks,
            specialStatus: mark.specialStatus,
            remarks: mark.remarks,
          }
        : null,
    };
  });
}

/* ------------------------------------------------------------ computation */

export type StudentComputation = {
  studentId: string;
  enrollmentId: string;
  classId: string;
  sectionId: string;
  className: string;
  sectionName: string;
  fullName: string;
  fatherName: string;
  admissionNumber: string;
  photoPath: string | null;
  rollNumber: string | null;
  attendancePresent: number;
  attendanceTotal: number;
  computed: ReturnType<typeof computeStudentResult>;
  classPosition: number | null;
  sectionPosition: number | null;
};

/**
 * Computes every participating student's result plus class, section and
 * subject positions. Pure with respect to the database: nothing is written.
 */
export function computeExamResults(context: ExamContext): {
  students: StudentComputation[];
  subjectPositions: Map<string, { classPos: Map<string, number>; sectionPos: Map<string, number> }>;
} {
  const rollByStudent = new Map(context.rolls.map((r) => [r.studentId, r.rollNumber]));

  // Attendance is counted against the papers scheduled for the student's class.
  const dateSheetByClass = new Map<string, Set<string>>();
  for (const entry of context.dateSheets) {
    const set = dateSheetByClass.get(entry.classId) ?? new Set<string>();
    set.add(entry.id);
    dateSheetByClass.set(entry.classId, set);
  }
  const attendanceByStudent = new Map<string, { present: number; total: number }>();
  for (const record of context.attendance) {
    const bucket = attendanceByStudent.get(record.studentId) ?? { present: 0, total: 0 };
    bucket.total += 1;
    if (record.status === 'PRESENT' || record.status === 'LATE') bucket.present += 1;
    attendanceByStudent.set(record.studentId, bucket);
  }

  const students: StudentComputation[] = context.enrollments.map((enrollment) => {
    const subjectInputs = buildSubjectInputs(context, enrollment.classId, enrollment.studentId);
    const computed = computeStudentResult(subjectInputs, context.bands, context.policy);
    const attendance = attendanceByStudent.get(enrollment.studentId) ?? {
      present: 0,
      total: dateSheetByClass.get(enrollment.classId)?.size ?? 0,
    };

    return {
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
      classId: enrollment.classId,
      sectionId: enrollment.sectionId,
      className: enrollment.schoolClass.name,
      sectionName: enrollment.section.name,
      fullName: enrollment.student.fullName,
      fatherName: enrollment.student.fatherName,
      admissionNumber: enrollment.student.admissionNumber,
      photoPath: enrollment.student.photoPath,
      rollNumber: rollByStudent.get(enrollment.studentId) ?? enrollment.rollNumber,
      attendancePresent: attendance.present,
      attendanceTotal: attendance.total,
      computed,
      classPosition: null,
      sectionPosition: null,
    };
  });

  const method = (context.policy.rankingMethod as RankingMethod) ?? 'COMPETITION';

  // Only students who actually sat the examination are ranked.
  const rankable = students.filter(
    (s) => s.computed.status !== 'ABSENT' && s.computed.status !== 'WITHHELD',
  );

  for (const [, group] of groupByKey(rankable, (s) => s.classId)) {
    for (const row of assignPositions(
      group.map((s) => ({ item: s, score: s.computed.percentage })),
      method,
    )) {
      row.item.classPosition = row.position;
    }
  }

  for (const [, group] of groupByKey(rankable, (s) => s.sectionId)) {
    for (const row of assignPositions(
      group.map((s) => ({ item: s, score: s.computed.percentage })),
      method,
    )) {
      row.item.sectionPosition = row.position;
    }
  }

  /* ------------------------------------------------- subject-wise positions */

  const subjectPositions = new Map<
    string,
    { classPos: Map<string, number>; sectionPos: Map<string, number> }
  >();

  for (const examSubject of context.exam.examSubjects) {
    const entries = students
      .map((student) => {
        const subject = student.computed.subjects.find(
          (s) => s.examSubjectId === examSubject.id,
        );
        if (!subject) return null;
        if (subject.status === 'ABSENT' || subject.status === 'EXEMPTED' || subject.status === 'WITHHELD') {
          return null;
        }
        return { student, subject };
      })
      .filter((v): v is { student: StudentComputation; subject: (typeof students)[number]['computed']['subjects'][number] } => v !== null);

    const classPos = new Map<string, number>();
    const sectionPos = new Map<string, number>();

    for (const [, group] of groupByKey(entries, (e) => e.student.classId)) {
      for (const row of assignPositions(
        group.map((e) => ({ item: e, score: e.subject.obtainedMarks })),
        method,
      )) {
        classPos.set(row.item.student.studentId, row.position);
      }
    }

    for (const [, group] of groupByKey(entries, (e) => e.student.sectionId)) {
      for (const row of assignPositions(
        group.map((e) => ({ item: e, score: e.subject.obtainedMarks })),
        method,
      )) {
        sectionPos.set(row.item.student.studentId, row.position);
      }
    }

    subjectPositions.set(examSubject.id, { classPos, sectionPos });
  }

  return { students, subjectPositions };
}

function groupByKey<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/* -------------------------------------------------------------- persistence */

export type ProcessSummary = {
  studentsProcessed: number;
  passed: number;
  failed: number;
  absent: number;
  withheld: number;
  compartment: number;
  averagePercentage: number;
  highestPercentage: number;
};

/**
 * Recomputes and stores results for an entire examination inside a single
 * transaction. Existing verification codes are preserved so a report card that
 * has already been handed out keeps verifying after a re-run.
 */
export async function processExamResults(examId: string): Promise<ProcessSummary> {
  const context = await loadExamContext(examId);

  if (context.exam.resultLocked) {
    throw new Error('Results for this examination are locked. Unlock them before reprocessing.');
  }
  if (context.enrollments.length === 0) {
    throw new Error('No students are enrolled in the classes selected for this examination.');
  }
  if (context.exam.examSubjects.length === 0) {
    throw new Error('This examination has no subjects configured.');
  }

  const { students, subjectPositions } = computeExamResults(context);

  const existingCodes = new Map(
    (
      await prisma.result.findMany({
        where: { examId },
        select: { studentId: true, verificationCode: true, teacherRemarks: true, principalRemarks: true },
      })
    ).map((r) => [r.studentId, r]),
  );

  const resultRows = students.map((student) => {
    const existing = existingCodes.get(student.studentId);
    return {
      id: randomUUID(),
      examId,
      studentId: student.studentId,
      enrollmentId: student.enrollmentId,
      totalMaxMarks: student.computed.totalMaxMarks,
      totalObtained: student.computed.totalObtained,
      percentage: student.computed.percentage,
      grade: student.computed.grade,
      gpa: student.computed.gpa,
      status: student.computed.status,
      promotionStatus: student.computed.promotionStatus,
      classPosition: student.classPosition,
      sectionPosition: student.sectionPosition,
      subjectsFailed: student.computed.subjectsFailed,
      graceMarksUsed: student.computed.graceMarksUsed,
      papersTotal: student.computed.papersTotal,
      papersAttended: student.computed.papersAttended,
      attendancePresent: student.attendancePresent,
      attendanceTotal: student.attendanceTotal,
      teacherRemarks: existing?.teacherRemarks ?? null,
      principalRemarks: existing?.principalRemarks ?? null,
      verificationCode: existing?.verificationCode ?? verificationCode('RC'),
      isPublished: false,
      computedAt: new Date(),
    };
  });

  const resultIdByStudent = new Map(resultRows.map((r) => [r.studentId, r.id]));

  const subjectRows = students.flatMap((student) =>
    student.computed.subjects.map((subject) => {
      const positions = subjectPositions.get(subject.examSubjectId);
      return {
        id: randomUUID(),
        resultId: resultIdByStudent.get(student.studentId)!,
        examSubjectId: subject.examSubjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        subjectType: subject.subjectType,
        maxMarks: subject.maxMarks,
        passingMarks: subject.passingMarks,
        theoryMarks: subject.theoryMarks,
        practicalMarks: subject.practicalMarks,
        obtainedMarks: subject.obtainedMarks,
        percentage: subject.percentage,
        grade: subject.grade,
        gpa: subject.gpa,
        status: subject.status,
        specialStatus: subject.specialStatus,
        graceApplied: subject.graceApplied,
        classPosition: positions?.classPos.get(student.studentId) ?? null,
        sectionPosition: positions?.sectionPos.get(student.studentId) ?? null,
        displayOrder: subject.displayOrder,
      };
    }),
  );

  // Whether the exam was already published is preserved across a reprocess.
  const wasPublished = context.exam.status === 'PUBLISHED';
  if (wasPublished) {
    for (const row of resultRows) row.isPublished = true;
  }

  await prisma.$transaction(
    async (tx) => {
      // Cascade removes the old result_subjects rows.
      await tx.result.deleteMany({ where: { examId } });
      await tx.result.createMany({ data: resultRows });
      // Chunked so a large cohort stays well inside SQLite's parameter limit.
      for (let i = 0; i < subjectRows.length; i += 500) {
        await tx.resultSubject.createMany({ data: subjectRows.slice(i, i + 500) });
      }
      await tx.exam.update({
        where: { id: examId },
        data: {
          processedAt: new Date(),
          status: wasPublished ? 'PUBLISHED' : 'RESULT_PROCESSING',
        },
      });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  const percentages = students
    .filter((s) => s.computed.status !== 'ABSENT' && s.computed.status !== 'WITHHELD')
    .map((s) => s.computed.percentage);

  return {
    studentsProcessed: students.length,
    passed: students.filter((s) => s.computed.status === 'PASS').length,
    failed: students.filter((s) => s.computed.status === 'FAIL').length,
    absent: students.filter((s) => s.computed.status === 'ABSENT').length,
    withheld: students.filter((s) => s.computed.status === 'WITHHELD').length,
    compartment: students.filter((s) => s.computed.status === 'COMPARTMENT').length,
    averagePercentage: percentages.length
      ? round(percentages.reduce((a, b) => a + b, 0) / percentages.length, 2)
      : 0,
    highestPercentage: percentages.length ? round(Math.max(...percentages), 2) : 0,
  };
}

/* ------------------------------------------------------------ verification */

/**
 * Runs the pre-publication data checks for an examination.
 */
export async function runMarksVerification(examId: string): Promise<{
  issues: VerificationIssue[];
  criticalCount: number;
  warningCount: number;
  studentsChecked: number;
  subjectsChecked: number;
}> {
  const context = await loadExamContext(examId);

  const rollByStudent = new Map(context.rolls.map((r) => [r.studentId, r.rollNumber]));
  const attendanceKey = (studentId: string, examSubjectId: string) => `${studentId}:${examSubjectId}`;
  const dateSheetToSubject = new Map(context.dateSheets.map((d) => [d.id, d.examSubjectId]));
  const attendanceLookup = new Map<string, 'PRESENT' | 'ABSENT' | 'LATE'>();
  for (const record of context.attendance) {
    const examSubjectId = dateSheetToSubject.get(record.dateSheetEntryId);
    if (examSubjectId) {
      attendanceLookup.set(
        attendanceKey(record.studentId, examSubjectId),
        record.status as 'PRESENT' | 'ABSENT' | 'LATE',
      );
    }
  }

  const marksByStudent = new Map<string, Map<string, (typeof context.marks)[number]>>();
  for (const mark of context.marks) {
    const bucket = marksByStudent.get(mark.studentId) ?? new Map();
    bucket.set(mark.examSubjectId, mark);
    marksByStudent.set(mark.studentId, bucket);
  }

  const students = context.enrollments.map((enrollment) => {
    const subjectList = context.subjectsByClass.get(enrollment.classId) ?? [];
    const marks = marksByStudent.get(enrollment.studentId);

    return {
      studentId: enrollment.studentId,
      fullName: enrollment.student.fullName,
      rollNumber: rollByStudent.get(enrollment.studentId) ?? enrollment.rollNumber ?? null,
      subjects: subjectList.map((es) => {
        const mark = marks?.get(es.id);
        return {
          examSubjectId: es.id,
          subjectName: es.subject.name,
          maxMarks: es.maxMarks,
          mark: mark
            ? {
                theoryMarks: mark.theoryMarks,
                practicalMarks: mark.practicalMarks,
                obtainedMarks: mark.obtainedMarks,
                specialStatus: mark.specialStatus,
                remarks: mark.remarks,
              }
            : null,
          attendance: attendanceLookup.get(attendanceKey(enrollment.studentId, es.id)) ?? null,
        };
      }),
    };
  });

  const issues = verifyMarksData({
    students,
    examSubjects: context.exam.examSubjects.map((es) => ({
      examSubjectId: es.id,
      subjectName: es.subject.name,
      maxMarks: es.maxMarks,
    })),
  });

  return {
    issues,
    criticalCount: issues.filter((i) => i.severity === 'CRITICAL').length,
    warningCount: issues.filter((i) => i.severity === 'WARNING').length,
    studentsChecked: students.length,
    subjectsChecked: context.exam.examSubjects.length,
  };
}
