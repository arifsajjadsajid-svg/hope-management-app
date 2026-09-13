'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { promotionSchema } from '@/lib/schemas';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

export type PromotionPreviewRow = {
  studentId: string;
  studentName: string;
  fatherName: string;
  admissionNumber: string;
  classRoll: string | null;
  percentage: number | null;
  grade: string | null;
  resultStatus: string | null;
  promotionStatus: string | null;
  recommended: 'PROMOTED' | 'RETAINED';
  alreadyEnrolled: boolean;
};

/**
 * Builds the promotion preview for one class: every student with their latest
 * result in the session and the outcome the engine recommends.
 */
export async function buildPromotionPreview(
  fromSessionId: string,
  fromClassId: string,
  toSessionId: string,
): Promise<PromotionPreviewRow[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId: fromSessionId, classId: fromClassId },
    include: {
      student: { select: { id: true, fullName: true, fatherName: true, admissionNumber: true, status: true } },
    },
    orderBy: { rollNumber: 'asc' },
  });

  const studentIds = enrollments.map((e) => e.studentId);

  const [results, nextEnrollments] = await Promise.all([
    prisma.result.findMany({
      where: {
        studentId: { in: studentIds },
        exam: { sessionId: fromSessionId },
        isPublished: true,
      },
      include: { exam: { select: { startDate: true, type: true } } },
      orderBy: { exam: { startDate: 'desc' } },
    }),
    prisma.enrollment.findMany({
      where: { sessionId: toSessionId, studentId: { in: studentIds } },
      select: { studentId: true },
    }),
  ]);

  // The most recent published result decides the recommendation; an annual or
  // second-term result takes precedence over a monthly test where both exist.
  const priority = (type: string) =>
    type === 'ANNUAL' ? 3 : type === 'SECOND_TERM' || type === 'FIRST_TERM' ? 2 : 1;

  const bestByStudent = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    const current = bestByStudent.get(result.studentId);
    if (
      !current ||
      priority(result.exam.type) > priority(current.exam.type) ||
      (priority(result.exam.type) === priority(current.exam.type) &&
        result.exam.startDate > current.exam.startDate)
    ) {
      bestByStudent.set(result.studentId, result);
    }
  }

  const enrolledNext = new Set(nextEnrollments.map((e) => e.studentId));

  return enrollments.map((enrollment) => {
    const result = bestByStudent.get(enrollment.studentId);
    return {
      studentId: enrollment.studentId,
      studentName: enrollment.student.fullName,
      fatherName: enrollment.student.fatherName,
      admissionNumber: enrollment.student.admissionNumber,
      classRoll: enrollment.rollNumber,
      percentage: result?.percentage ?? null,
      grade: result?.grade ?? null,
      resultStatus: result?.status ?? null,
      promotionStatus: result?.promotionStatus ?? null,
      recommended: result?.promotionStatus === 'PROMOTED' ? 'PROMOTED' : 'RETAINED',
      alreadyEnrolled: enrolledNext.has(enrollment.studentId),
    };
  });
}

/**
 * Moves the selected students into the next session. Previous enrolments and
 * every result attached to them are preserved untouched — a promotion only ever
 * adds records.
 */
export async function promoteStudentsAction(input: {
  fromSessionId: string;
  toSessionId: string;
  fromClassId: string;
  toClassId?: string;
  toSectionId?: string;
  action: 'PROMOTED' | 'RETAINED' | 'TRANSFERRED' | 'GRADUATED';
  studentIds: string[];
  remarks?: string;
}): Promise<ActionResult<{ processed: number; skipped: number }>> {
  return runAction(async () => {
    const user = await requirePermission('students.promote');

    const parsed = promotionSchema.parse(input);

    if (parsed.fromSessionId === parsed.toSessionId && parsed.action === 'PROMOTED') {
      throw new BusinessRuleError('Promote students into a different academic session.');
    }

    const needsTarget = parsed.action === 'PROMOTED' || parsed.action === 'RETAINED';
    if (needsTarget && (!parsed.toClassId || !parsed.toSectionId)) {
      throw new BusinessRuleError('Choose the class and section the students move into.', {
        toClassId: 'Required',
      });
    }

    const [fromSession, toSession, fromClass] = await Promise.all([
      prisma.academicSession.findUnique({ where: { id: parsed.fromSessionId } }),
      prisma.academicSession.findUnique({ where: { id: parsed.toSessionId } }),
      prisma.schoolClass.findUnique({ where: { id: parsed.fromClassId } }),
    ]);
    if (!fromSession || !toSession || !fromClass) {
      throw new BusinessRuleError('The selected session or class no longer exists.');
    }

    let targetSection: { id: string; classId: string; maxStrength: number } | null = null;
    if (needsTarget) {
      const section = await prisma.section.findUnique({
        where: { id: parsed.toSectionId! },
        include: { schoolClass: true },
      });
      if (!section || section.classId !== parsed.toClassId) {
        throw new BusinessRuleError('The selected section does not belong to the target class.');
      }
      if (section.schoolClass.sessionId !== parsed.toSessionId) {
        throw new BusinessRuleError('The target class does not belong to the target session.');
      }
      targetSection = {
        id: section.id,
        classId: section.classId,
        maxStrength: section.maxStrength,
      };

      const occupied = await prisma.enrollment.count({
        where: { sectionId: section.id, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
      });
      if (occupied + parsed.studentIds.length > section.maxStrength) {
        throw new BusinessRuleError(
          `${section.name} would hold ${occupied + parsed.studentIds.length} students but its maximum strength is ${section.maxStrength}. Increase the strength or split the group.`,
        );
      }
    }

    // Students already enrolled in the target session are skipped rather than duplicated.
    const existingNext = await prisma.enrollment.findMany({
      where: { sessionId: parsed.toSessionId, studentId: { in: parsed.studentIds } },
      select: { studentId: true },
    });
    const skip = new Set(existingNext.map((e) => e.studentId));
    const toProcess = parsed.studentIds.filter((id) => !skip.has(id));

    if (toProcess.length === 0) {
      throw new BusinessRuleError(
        'Every selected student already has an enrolment in the target session.',
      );
    }

    const sourceEnrollments = await prisma.enrollment.findMany({
      where: { sessionId: parsed.fromSessionId, studentId: { in: toProcess } },
    });
    const sourceByStudent = new Map(sourceEnrollments.map((e) => [e.studentId, e]));

    // Next free class roll number in the target section.
    let nextRoll = 1;
    if (targetSection) {
      const rolls = await prisma.enrollment.findMany({
        where: { sectionId: targetSection.id, rollNumber: { not: null } },
        select: { rollNumber: true },
      });
      const numbers = rolls.map((r) => Number(r.rollNumber)).filter((n) => Number.isFinite(n));
      nextRoll = numbers.length ? Math.max(...numbers) + 1 : 1;
    }

    await prisma.$transaction(
      async (tx) => {
        for (const studentId of toProcess) {
          const source = sourceByStudent.get(studentId);
          if (!source) continue;

          // Record the outcome against the old enrolment; never delete it.
          await tx.enrollment.update({
            where: { id: source.id },
            data: {
              status:
                parsed.action === 'PROMOTED'
                  ? 'PROMOTED'
                  : parsed.action === 'RETAINED'
                    ? 'RETAINED'
                    : parsed.action === 'GRADUATED'
                      ? 'GRADUATED'
                      : 'TRANSFERRED',
            },
          });

          if (needsTarget && targetSection) {
            await tx.enrollment.create({
              data: {
                studentId,
                sessionId: parsed.toSessionId,
                classId: parsed.toClassId!,
                sectionId: targetSection.id,
                rollNumber: String(nextRoll).padStart(2, '0'),
                status: 'ACTIVE',
              },
            });
            nextRoll += 1;
          }

          if (parsed.action === 'GRADUATED' || parsed.action === 'TRANSFERRED') {
            await tx.student.update({
              where: { id: studentId },
              data: {
                status: parsed.action === 'GRADUATED' ? 'GRADUATED' : 'TRANSFERRED',
                archivedAt: new Date(),
              },
            });
          }

          await tx.studentPromotion.create({
            data: {
              studentId,
              fromSessionId: parsed.fromSessionId,
              toSessionId: needsTarget ? parsed.toSessionId : null,
              fromClassId: source.classId,
              toClassId: needsTarget ? parsed.toClassId! : null,
              fromSectionId: source.sectionId,
              toSectionId: needsTarget ? targetSection!.id : null,
              action: parsed.action,
              remarks: parsed.remarks ?? null,
              processedByName: user.fullName,
            },
          });
        }
      },
      { timeout: 120_000 },
    );

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_PROMOTED,
      entityType: 'SchoolClass',
      entityId: parsed.fromClassId,
      description: `${parsed.action} ${toProcess.length} student(s) from ${fromClass.name} (${fromSession.name}) to ${toSession.name}${skip.size ? `; ${skip.size} already enrolled and skipped` : ''}`,
      newValue: { action: parsed.action, students: toProcess.length },
      severity: 'WARNING',
    });

    revalidatePath('/students/promotion');
    revalidatePath('/students');

    return ok(
      { processed: toProcess.length, skipped: skip.size },
      `${toProcess.length} student(s) ${parsed.action.toLowerCase()}${skip.size ? `; ${skip.size} skipped (already enrolled)` : ''}.`,
    );
  });
}
