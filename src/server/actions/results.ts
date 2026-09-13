'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireUser, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS, EXAM_STATUS } from '@/lib/constants';
import { processExamResults, runMarksVerification } from '../services/result-processing';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

/** Appends a row to the examination's workflow trail. */
async function logWorkflow(
  examId: string,
  action: string,
  fromStatus: string,
  toStatus: string,
  reason: string | null,
  user: { id: string; fullName: string },
) {
  await prisma.resultWorkflowEvent.create({
    data: {
      examId,
      action,
      fromStatus,
      toStatus,
      reason,
      userId: user.id,
      userName: user.fullName,
    },
  });
}

/* ------------------------------------------------------------- processing */

export async function processResultsAction(
  examId: string,
): Promise<ActionResult<{ processed: number; passed: number; failed: number }>> {
  return runAction(async () => {
    const user = await requirePermission('results.process');

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (exam.resultLocked) {
      throw new BusinessRuleError(
        'Results are locked. A Super Admin must unlock them before reprocessing.',
      );
    }

    // Publication is blocked by critical data errors, so warn early.
    const verification = await runMarksVerification(examId);
    if (verification.criticalCount > 0) {
      throw new BusinessRuleError(
        `${verification.criticalCount} critical issue(s) remain in the marks data. Open Marks Verification, correct them, then process the result.`,
      );
    }

    const summary = await processExamResults(examId);

    await logWorkflow(
      examId,
      'PROCESS',
      exam.status,
      EXAM_STATUS.RESULT_PROCESSING,
      `Processed ${summary.studentsProcessed} result(s); average ${summary.averagePercentage}%.`,
      user,
    );

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_GENERATED,
      entityType: 'Exam',
      entityId: examId,
      description: `Processed results for ${exam.name}: ${summary.studentsProcessed} students, ${summary.passed} pass, ${summary.failed} fail, average ${summary.averagePercentage}%`,
      newValue: summary,
      severity: 'WARNING',
    });

    revalidatePath('/results');
    revalidatePath('/results/process');
    revalidatePath(`/exams/${examId}`);

    return ok(
      { processed: summary.studentsProcessed, passed: summary.passed, failed: summary.failed },
      `${summary.studentsProcessed} result(s) processed — ${summary.passed} pass, ${summary.failed} fail, average ${summary.averagePercentage}%.`,
    );
  });
}

/* --------------------------------------------------------------- workflow */

export async function submitForApprovalAction(examId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('results.process');

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { results: true } } },
    });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (exam._count.results === 0) {
      throw new BusinessRuleError('Process the results before submitting them for approval.');
    }
    if (exam.resultLocked) throw new BusinessRuleError('Results are locked.');

    await prisma.exam.update({
      where: { id: examId },
      data: { status: EXAM_STATUS.AWAITING_APPROVAL },
    });
    await logWorkflow(
      examId,
      'SUBMIT_APPROVAL',
      exam.status,
      EXAM_STATUS.AWAITING_APPROVAL,
      'Submitted to the Principal / Director for approval.',
      user,
    );

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_GENERATED,
      entityType: 'Exam',
      entityId: examId,
      description: `${exam.name} submitted for approval`,
    });

    revalidatePath('/results/publish');
    return ok(undefined, 'Result submitted to the Principal for approval.');
  });
}

export async function approveResultsAction(
  examId: string,
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('results.approve');

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { results: true } } },
    });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (exam._count.results === 0) {
      throw new BusinessRuleError('There are no processed results to approve.');
    }
    if (exam.approvedAt) {
      throw new BusinessRuleError('This result has already been approved.');
    }

    await prisma.exam.update({
      where: { id: examId },
      data: { approvedAt: new Date(), approvedByName: user.fullName },
    });
    await logWorkflow(
      examId,
      'APPROVE',
      exam.status,
      exam.status,
      reason ?? 'Approved by the Principal / Director.',
      user,
    );

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_APPROVED,
      entityType: 'Exam',
      entityId: examId,
      description: `${exam.name} approved by ${user.fullName}${reason ? ` — ${reason}` : ''}`,
      severity: 'WARNING',
    });

    revalidatePath('/results/publish');
    return ok(undefined, 'Result approved. It can now be published.');
  });
}

export async function publishResultsAction(examId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('results.publish');

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { results: true } } },
    });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (exam._count.results === 0) {
      throw new BusinessRuleError('Process the results before publishing.');
    }
    if (!exam.approvedAt) {
      throw new BusinessRuleError(
        'This result has not been approved yet. The Principal / Director must approve it before publication.',
      );
    }

    const verification = await runMarksVerification(examId);
    if (verification.criticalCount > 0) {
      throw new BusinessRuleError(
        `Publication blocked: ${verification.criticalCount} critical issue(s) remain in the marks data.`,
      );
    }

    await prisma.$transaction([
      prisma.result.updateMany({ where: { examId }, data: { isPublished: true } }),
      prisma.exam.update({
        where: { id: examId },
        data: { status: EXAM_STATUS.PUBLISHED, publishedAt: new Date() },
      }),
    ]);

    await logWorkflow(
      examId,
      'PUBLISH',
      exam.status,
      EXAM_STATUS.PUBLISHED,
      `Published ${exam._count.results} result(s) to students and parents.`,
      user,
    );

    // In-app announcement for every account.
    const recipients = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    const notification = await prisma.notification.create({
      data: {
        title: `${exam.name} results published`,
        message: `The results of ${exam.name} are now available. Report cards can be downloaded from the Results section, and by students from the portal.`,
        type: 'RESULT_PUBLISHED',
        channels: 'IN_APP',
        audience: 'ALL',
        link: '/results',
        createdByName: user.fullName,
      },
    });
    await prisma.notificationRecipient.createMany({
      data: recipients.map((r) => ({
        notificationId: notification.id,
        userId: r.id,
        deliveryStatus: 'DELIVERED',
      })),
    });

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_PUBLISHED,
      entityType: 'Exam',
      entityId: examId,
      description: `${exam.name} published — ${exam._count.results} result(s) made visible to students and parents`,
      severity: 'CRITICAL',
    });

    revalidatePath('/results');
    revalidatePath('/results/publish');
    revalidatePath('/dashboard');
    return ok(undefined, `${exam._count.results} result(s) published.`);
  });
}

export async function unpublishResultsAction(
  examId: string,
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('results.publish');

    if (!reason?.trim()) {
      throw new BusinessRuleError('A reason is required to withdraw a published result.');
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (exam.resultLocked) {
      throw new BusinessRuleError('Unlock the result before withdrawing it from publication.');
    }

    await prisma.$transaction([
      prisma.result.updateMany({ where: { examId }, data: { isPublished: false } }),
      prisma.exam.update({
        where: { id: examId },
        data: { status: EXAM_STATUS.AWAITING_APPROVAL, publishedAt: null },
      }),
    ]);

    await logWorkflow(
      examId,
      'UNPUBLISH',
      exam.status,
      EXAM_STATUS.AWAITING_APPROVAL,
      reason.trim(),
      user,
    );

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_UNPUBLISHED,
      entityType: 'Exam',
      entityId: examId,
      description: `${exam.name} withdrawn from publication — ${reason.trim()}`,
      severity: 'CRITICAL',
    });

    revalidatePath('/results');
    revalidatePath('/results/publish');
    return ok(undefined, 'Result withdrawn from publication.');
  });
}

/* ----------------------------------------------------------------- locking */

export async function lockResultsAction(examId: string, reason?: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('results.lock');

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (exam.resultLocked) throw new BusinessRuleError('This result is already locked.');
    if (!exam.approvedAt) {
      throw new BusinessRuleError('Approve the result before locking it.');
    }

    await prisma.exam.update({
      where: { id: examId },
      data: { resultLocked: true, lockedAt: new Date() },
    });
    await logWorkflow(
      examId,
      'LOCK',
      exam.status,
      exam.status,
      reason ?? 'Locked after approval; marks can no longer be edited.',
      user,
    );

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_LOCKED,
      entityType: 'Exam',
      entityId: examId,
      description: `${exam.name} locked by ${user.fullName}${reason ? ` — ${reason}` : ''}`,
      severity: 'CRITICAL',
    });

    revalidatePath('/results/publish');
    revalidatePath(`/exams/${examId}`);
    return ok(undefined, 'Result locked. Marks and structure are now read-only.');
  });
}

/**
 * Unlocking is the most sensitive action in the system: it requires the
 * `results.unlock` permission, a written reason and the operator's own
 * password, and the full before/after state is written to the audit log.
 */
export async function unlockResultsAction(
  examId: string,
  reason: string,
  password: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('results.unlock');

    if (!reason?.trim() || reason.trim().length < 10) {
      throw new BusinessRuleError(
        'Give a clear reason of at least 10 characters. It is recorded permanently in the audit log.',
        { reason: 'Enter a fuller reason' },
      );
    }

    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const passwordOk = await verifyPassword(password ?? '', account.passwordHash);
    if (!passwordOk) {
      throw new BusinessRuleError('Password confirmation failed.', {
        password: 'Incorrect password',
      });
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (!exam.resultLocked) throw new BusinessRuleError('This result is not locked.');

    await prisma.exam.update({
      where: { id: examId },
      data: { resultLocked: false, lockedAt: null },
    });
    await logWorkflow(examId, 'UNLOCK', exam.status, exam.status, reason.trim(), user);

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_UNLOCKED,
      entityType: 'Exam',
      entityId: examId,
      description: `${exam.name} UNLOCKED by ${user.fullName} — ${reason.trim()}`,
      oldValue: { resultLocked: true, lockedAt: exam.lockedAt },
      newValue: { resultLocked: false, lockedAt: null },
      severity: 'CRITICAL',
    });

    revalidatePath('/results/publish');
    revalidatePath(`/exams/${examId}`);
    return ok(undefined, 'Result unlocked. Every change from now on is audited.');
  });
}

/* ----------------------------------------------------------------- remarks */

export async function saveResultRemarksAction(
  resultId: string,
  teacherRemarks: string,
  principalRemarks: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();

    const result = await prisma.result.findUnique({
      where: { id: resultId },
      include: { exam: true, student: { select: { fullName: true } } },
    });
    if (!result) throw new BusinessRuleError('That result no longer exists.');
    if (result.exam.resultLocked) {
      throw new BusinessRuleError('Results are locked; remarks can no longer be changed.');
    }

    const canTeacherRemark = user.permissions.has('marks.enter') || user.roleCode === 'SUPER_ADMIN';
    const canPrincipalRemark =
      user.permissions.has('results.approve') || user.roleCode === 'SUPER_ADMIN';

    if (!canTeacherRemark && !canPrincipalRemark) {
      throw new BusinessRuleError('You are not authorised to write remarks on report cards.');
    }

    await prisma.result.update({
      where: { id: resultId },
      data: {
        ...(canTeacherRemark ? { teacherRemarks: teacherRemarks.trim() || null } : {}),
        ...(canPrincipalRemark ? { principalRemarks: principalRemarks.trim() || null } : {}),
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.RESULT_GENERATED,
      entityType: 'Result',
      entityId: resultId,
      description: `Updated report card remarks for ${result.student.fullName}`,
    });

    revalidatePath('/results');
    return ok(undefined, 'Remarks saved.');
  });
}
