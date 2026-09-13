'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission, userCan, type SessionUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS, MARK_SPECIAL_TOKENS, ROLE } from '@/lib/constants';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';
import { round } from '@/lib/utils';

export type MarkEntryRow = {
  studentId: string;
  /** Empty string clears the mark; "ABS" / "EX" / "MED" / "WH" set a special status. */
  theory: string;
  practical: string;
  remarks?: string;
};

/**
 * A teacher may only touch subjects and sections they are actually assigned to.
 * Examination Controllers and Super Admins are not restricted.
 */
async function assertTeacherScope(
  user: SessionUser,
  examSubjectId: string,
  sectionId: string | null,
) {
  if (user.roleCode !== ROLE.TEACHER) return;
  if (!user.teacherId) {
    throw new BusinessRuleError(
      'Your account is not linked to a teacher record, so marks entry is not available.',
    );
  }

  const examSubject = await prisma.examSubject.findUnique({
    where: { id: examSubjectId },
    select: { subjectId: true, subject: { select: { name: true } } },
  });
  if (!examSubject) throw new BusinessRuleError('That subject is not part of this examination.');

  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId: user.teacherId,
      subjectId: examSubject.subjectId,
      ...(sectionId ? { sectionId } : {}),
    },
  });

  if (!assignment) {
    throw new BusinessRuleError(
      `You are not assigned to teach ${examSubject.subject.name} in this section, so you cannot enter its marks.`,
    );
  }
}

/** Parses one grid cell into a numeric mark or a special status token. */
function parseCell(
  raw: string,
  max: number,
  label: string,
): { value: number | null; special: string | null } {
  const text = (raw ?? '').trim().toUpperCase();
  if (text === '') return { value: null, special: null };

  if ((MARK_SPECIAL_TOKENS as readonly string[]).includes(text)) {
    return { value: null, special: text };
  }

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    throw new BusinessRuleError(
      `"${raw}" is not a valid ${label} mark. Enter a number, or ABS, EX, MED or WH.`,
    );
  }
  if (numeric < 0) {
    throw new BusinessRuleError(`${label} marks cannot be negative.`);
  }
  if (numeric > max + 1e-9) {
    throw new BusinessRuleError(
      `${label} mark ${numeric} exceeds the maximum of ${max} for this paper.`,
    );
  }
  return { value: round(numeric, 2), special: null };
}

/**
 * Saves a batch of marks for one subject. Runs in a single transaction so a
 * partially saved sheet is impossible.
 */
export async function saveMarksAction(
  examId: string,
  examSubjectId: string,
  sectionId: string | null,
  rows: MarkEntryRow[],
  finalize: boolean,
): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => {
    const user = await requirePermission('marks.enter');

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: { exam: true, subject: { select: { name: true, code: true } } },
    });
    if (!examSubject) throw new BusinessRuleError('That subject is not part of this examination.');
    if (examSubject.examId !== examId) {
      throw new BusinessRuleError('The subject does not belong to the selected examination.');
    }

    if (examSubject.exam.resultLocked) {
      throw new BusinessRuleError(
        'Results for this examination are locked. Marks can no longer be edited — ask a Super Admin to unlock the result first.',
      );
    }
    if (examSubject.exam.status === 'PUBLISHED' && user.roleCode === ROLE.TEACHER) {
      throw new BusinessRuleError(
        'This result has been published. Teachers cannot change marks after publication.',
      );
    }
    if (!examSubject.isIncluded) {
      throw new BusinessRuleError(
        `${examSubject.subject.name} is excluded from this examination, so marks cannot be entered.`,
      );
    }

    await assertTeacherScope(user, examSubjectId, sectionId);

    const hasPractical = examSubject.practicalMarks > 0;
    const theoryMax = hasPractical ? examSubject.theoryMarks : examSubject.maxMarks;

    // Existing marks, so the audit trail can record what actually changed.
    const existing = await prisma.mark.findMany({
      where: { examSubjectId, studentId: { in: rows.map((r) => r.studentId) } },
    });
    const existingByStudent = new Map(existing.map((m) => [m.studentId, m]));

    type Prepared = {
      studentId: string;
      theoryMarks: number | null;
      practicalMarks: number | null;
      obtainedMarks: number | null;
      specialStatus: string;
      remarks: string | null;
      clear: boolean;
    };

    const prepared: Prepared[] = rows.map((row) => {
      const theory = parseCell(row.theory, theoryMax, 'Theory');
      const practical = hasPractical
        ? parseCell(row.practical, examSubject.practicalMarks, 'Practical')
        : { value: null, special: null };

      // A special token in either cell applies to the whole paper.
      const special = theory.special ?? practical.special;

      if (special) {
        return {
          studentId: row.studentId,
          theoryMarks: null,
          practicalMarks: null,
          obtainedMarks: null,
          specialStatus: special,
          remarks: row.remarks?.trim() || null,
          clear: false,
        };
      }

      if (theory.value === null && practical.value === null) {
        return {
          studentId: row.studentId,
          theoryMarks: null,
          practicalMarks: null,
          obtainedMarks: null,
          specialStatus: 'NONE',
          remarks: row.remarks?.trim() || null,
          clear: true,
        };
      }

      const obtained = round((theory.value ?? 0) + (practical.value ?? 0), 2);
      if (obtained > examSubject.maxMarks + 1e-9) {
        throw new BusinessRuleError(
          `Theory plus practical (${obtained}) exceeds the paper maximum of ${examSubject.maxMarks}.`,
        );
      }

      return {
        studentId: row.studentId,
        theoryMarks: theory.value,
        practicalMarks: hasPractical ? practical.value : null,
        obtainedMarks: obtained,
        specialStatus: 'NONE',
        remarks: row.remarks?.trim() || null,
        clear: false,
      };
    });

    if (finalize) {
      const blank = prepared.filter((p) => p.clear);
      if (blank.length > 0) {
        throw new BusinessRuleError(
          `${blank.length} candidate(s) still have no mark. Enter a number, or ABS / EX / MED / WH, before finalising.`,
        );
      }
    }

    await prisma.$transaction(
      async (tx) => {
        for (const row of prepared) {
          if (row.clear) {
            await tx.mark.deleteMany({ where: { examSubjectId, studentId: row.studentId } });
            continue;
          }

          await tx.mark.upsert({
            where: { examSubjectId_studentId: { examSubjectId, studentId: row.studentId } },
            update: {
              theoryMarks: row.theoryMarks,
              practicalMarks: row.practicalMarks,
              obtainedMarks: row.obtainedMarks,
              specialStatus: row.specialStatus,
              remarks: row.remarks,
              isFinalized: finalize,
              updatedById: user.id,
            },
            create: {
              examId,
              examSubjectId,
              studentId: row.studentId,
              theoryMarks: row.theoryMarks,
              practicalMarks: row.practicalMarks,
              obtainedMarks: row.obtainedMarks,
              specialStatus: row.specialStatus,
              remarks: row.remarks,
              isFinalized: finalize,
              enteredById: user.id,
              updatedById: user.id,
            },
          });
        }

        // Opening marks entry moves the examination forward automatically.
        if (['DRAFT', 'SCHEDULED', 'IN_PROGRESS'].includes(examSubject.exam.status)) {
          await tx.exam.update({ where: { id: examId }, data: { status: 'MARKS_ENTRY' } });
        }
      },
      { timeout: 120_000 },
    );

    // Audit only the values that actually moved.
    const changes = prepared
      .filter((row) => {
        const before = existingByStudent.get(row.studentId);
        if (!before) return !row.clear;
        if (row.clear) return true;
        return (
          before.obtainedMarks !== row.obtainedMarks ||
          before.theoryMarks !== row.theoryMarks ||
          before.practicalMarks !== row.practicalMarks ||
          before.specialStatus !== row.specialStatus
        );
      })
      .map((row) => {
        const before = existingByStudent.get(row.studentId);
        return {
          studentId: row.studentId,
          from: before
            ? { obtained: before.obtainedMarks, special: before.specialStatus }
            : null,
          to: row.clear ? null : { obtained: row.obtainedMarks, special: row.specialStatus },
        };
      });

    if (changes.length > 0) {
      const isEdit = changes.some((c) => c.from !== null);
      await recordAudit({
        action: isEdit ? AUDIT_ACTIONS.MARKS_CHANGED : AUDIT_ACTIONS.MARKS_ENTERED,
        entityType: 'ExamSubject',
        entityId: examSubjectId,
        description: `${isEdit ? 'Changed' : 'Entered'} ${changes.length} mark(s) for ${examSubject.subject.name} (${examSubject.subject.code}) in ${examSubject.exam.name}${finalize ? ' and finalised the sheet' : ''}`,
        oldValue: changes.map((c) => ({ studentId: c.studentId, ...c.from })),
        newValue: changes.map((c) => ({ studentId: c.studentId, ...c.to })),
        severity: isEdit ? 'WARNING' : 'INFO',
      });
    }

    revalidatePath('/marks/entry');
    revalidatePath(`/exams/${examId}`);

    return ok(
      { saved: prepared.filter((p) => !p.clear).length },
      finalize
        ? `Marks saved and the sheet has been finalised (${prepared.length} candidates).`
        : `Marks saved for ${prepared.filter((p) => !p.clear).length} candidate(s).`,
    );
  });
}

/** Clears every mark for one subject — used before a re-entry. */
export async function clearSubjectMarksAction(
  examSubjectId: string,
): Promise<ActionResult<{ removed: number }>> {
  return runAction(async () => {
    const user = await requirePermission('marks.enter');

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: { exam: true, subject: { select: { name: true } } },
    });
    if (!examSubject) throw new BusinessRuleError('That subject no longer exists.');
    if (examSubject.exam.resultLocked) {
      throw new BusinessRuleError('Results are locked; marks cannot be cleared.');
    }
    if (!userCan(user, 'marks.verify')) {
      throw new BusinessRuleError(
        'Clearing a whole marks sheet is restricted to the Examination Controller and Super Admin.',
      );
    }

    const removed = await prisma.mark.deleteMany({ where: { examSubjectId } });

    await recordAudit({
      action: AUDIT_ACTIONS.MARKS_CHANGED,
      entityType: 'ExamSubject',
      entityId: examSubjectId,
      description: `Cleared all ${removed.count} mark(s) for ${examSubject.subject.name} in ${examSubject.exam.name}`,
      severity: 'CRITICAL',
    });

    revalidatePath('/marks/entry');
    return ok({ removed: removed.count }, `${removed.count} mark(s) cleared.`);
  });
}
