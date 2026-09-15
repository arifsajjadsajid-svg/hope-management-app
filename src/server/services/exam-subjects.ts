import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { EXAM_STATUS } from '@/lib/constants';

/**
 * Keeping an examination's subjects in step with its classes.
 *
 * An examination takes a copy of its classes' subjects when it is saved, so it
 * can carry its own marks for each (a monthly test out of 25, say, where the
 * subject is normally out of 100). The catch is ordering: a subject added to a
 * class after the examination was created never reached it, and the date sheet
 * then reported that the examination had no subjects at all.
 */

/**
 * Statuses in which an examination can still take a new subject. Once marks
 * entry begins, adding a subject would change totals and positions for results
 * already under way, so from then on nothing is added automatically.
 */
export const OPEN_EXAM_STATUSES: string[] = [
  EXAM_STATUS.DRAFT,
  EXAM_STATUS.SCHEDULED,
  EXAM_STATUS.IN_PROGRESS,
];

type Db = typeof prisma | Prisma.TransactionClient;

export type MissingSubject = { id: string; name: string; code: string; className: string };

/** Active subjects of an examination's classes that the examination does not have. */
export async function missingExamSubjects(examId: string, db: Db = prisma): Promise<MissingSubject[]> {
  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: {
      examClasses: { select: { classId: true } },
      examSubjects: { select: { subjectId: true } },
    },
  });
  if (!exam) return [];

  const have = new Set(exam.examSubjects.map((es) => es.subjectId));
  const subjects = await db.subject.findMany({
    where: { classId: { in: exam.examClasses.map((c) => c.classId) }, isActive: true },
    select: { id: true, name: true, code: true, schoolClass: { select: { name: true } } },
    orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { displayOrder: 'asc' }],
  });

  return subjects
    .filter((s) => !have.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, code: s.code, className: s.schoolClass.name }));
}

/**
 * Adds an examination's missing subjects, copying each subject's marks scheme.
 * Returns the subjects added. Does nothing for an examination past marks entry
 * or with locked results.
 */
export async function addMissingSubjectsToExam(examId: string, db: Db = prisma): Promise<MissingSubject[]> {
  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: { status: true, resultLocked: true },
  });
  if (!exam || exam.resultLocked || !OPEN_EXAM_STATUSES.includes(exam.status)) return [];

  const missing = await missingExamSubjects(examId, db);
  if (missing.length === 0) return [];

  const subjects = await db.subject.findMany({ where: { id: { in: missing.map((m) => m.id) } } });

  await db.examSubject.createMany({
    data: subjects.map((subject) => ({
      examId,
      subjectId: subject.id,
      maxMarks: subject.maxMarks,
      passingMarks: subject.passingMarks,
      theoryMarks: subject.theoryMarks,
      practicalMarks: subject.practicalMarks,
      practicalPassing: subject.practicalPassing,
      displayOrder: subject.displayOrder,
    })),
    skipDuplicates: true,
  });

  return missing;
}

/**
 * After a class gains subjects, adds them to every open examination of that
 * class. Returns the examinations that changed, for telling the user.
 */
export async function addMissingSubjectsForClasses(
  classIds: string[],
  db: Db = prisma,
): Promise<{ examName: string; added: MissingSubject[] }[]> {
  const exams = await db.exam.findMany({
    where: {
      examClasses: { some: { classId: { in: classIds } } },
      status: { in: OPEN_EXAM_STATUSES },
      resultLocked: false,
    },
    select: { id: true, name: true },
  });

  const changed: { examName: string; added: MissingSubject[] }[] = [];
  for (const exam of exams) {
    const added = await addMissingSubjectsToExam(exam.id, db);
    if (added.length) changed.push({ examName: exam.name, added });
  }
  return changed;
}
