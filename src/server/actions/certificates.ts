'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { verificationCode } from '@/lib/verification';
import { AUDIT_ACTIONS, CERTIFICATE_TYPE_LABELS } from '@/lib/constants';
import { certificateSchema } from '@/lib/schemas';
import { getPositionHolders, getSubjectToppers } from '../queries/results';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';
import { formatPercent, round } from '@/lib/utils';

const formValue = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  return raw === null ? '' : String(raw);
};

export async function issueCertificateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('certificates.issue');

    const input = certificateSchema.parse({
      studentId: formValue(formData, 'studentId'),
      examId: formValue(formData, 'examId'),
      type: formValue(formData, 'type'),
      title: formValue(formData, 'title'),
      description: formValue(formData, 'description'),
      issuedDate: formValue(formData, 'issuedDate'),
    });

    const student = await prisma.student.findUnique({
      where: { id: input.studentId },
      include: {
        enrollments: {
          include: {
            schoolClass: { select: { name: true } },
            session: { select: { name: true } },
          },
          orderBy: { session: { startDate: 'desc' } },
          take: 1,
        },
      },
    });
    if (!student) throw new BusinessRuleError('That student no longer exists.');

    const enrolment = student.enrollments[0];

    const certificate = await prisma.certificate.create({
      data: {
        studentId: input.studentId,
        examId: input.examId || null,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        className: enrolment?.schoolClass.name ?? null,
        sessionName: enrolment?.session.name ?? null,
        issuedDate: input.issuedDate,
        verificationCode: verificationCode('CT'),
        issuedById: user.id,
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.CERTIFICATE_ISSUED,
      entityType: 'Certificate',
      entityId: certificate.id,
      description: `Issued "${certificate.title}" to ${student.fullName}`,
      newValue: { type: certificate.type, code: certificate.verificationCode },
    });

    revalidatePath('/certificates');
    revalidatePath(`/students/${input.studentId}`);
    return ok(undefined, `Certificate issued to ${student.fullName}.`);
  });
}

export async function deleteCertificateAction(certificateId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('certificates.issue');

    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { student: { select: { fullName: true } } },
    });
    if (!certificate) throw new BusinessRuleError('That certificate no longer exists.');

    await prisma.certificate.delete({ where: { id: certificateId } });

    await recordAudit({
      action: AUDIT_ACTIONS.CERTIFICATE_REVOKED,
      entityType: 'Certificate',
      entityId: certificateId,
      description: `Revoked "${certificate.title}" issued to ${certificate.student.fullName} (code ${certificate.verificationCode})`,
      severity: 'WARNING',
    });

    revalidatePath('/certificates');
    return ok(undefined, 'Certificate revoked.');
  });
}

/**
 * Issues position and merit certificates for an examination in one pass:
 * first, second and third position per class, plus every subject topper.
 * Certificates that already exist for the same student, exam and type are
 * skipped so the action is safe to run twice.
 */
export async function autoIssueCertificatesAction(
  examId: string,
  options: { positions: boolean; subjectToppers: boolean },
): Promise<ActionResult<{ issued: number; skipped: number }>> {
  return runAction(async () => {
    const user = await requirePermission('certificates.issue');

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { session: { select: { name: true } }, _count: { select: { results: true } } },
    });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');
    if (exam._count.results === 0) {
      throw new BusinessRuleError('Process the examination result before issuing certificates.');
    }
    if (!options.positions && !options.subjectToppers) {
      throw new BusinessRuleError('Choose at least one certificate category to issue.');
    }

    const existing = await prisma.certificate.findMany({
      where: { examId },
      select: { studentId: true, type: true, title: true },
    });
    const taken = new Set(existing.map((c) => `${c.studentId}|${c.type}|${c.title}`));

    type NewCertificate = {
      studentId: string;
      type: string;
      title: string;
      description: string;
      className: string | null;
      sessionName: string;
    };

    const planned: NewCertificate[] = [];

    if (options.positions) {
      const holders = await getPositionHolders(examId, 100);
      const positionMeta: Record<number, { type: string; title: string }> = {
        1: { type: 'FIRST_POSITION', title: 'Certificate of First Position' },
        2: { type: 'SECOND_POSITION', title: 'Certificate of Second Position' },
        3: { type: 'THIRD_POSITION', title: 'Certificate of Third Position' },
      };

      // Class positions 1–3 (ties included).
      const byClass = new Map<string, typeof holders.overall>();
      for (const row of holders.overall) {
        const bucket = byClass.get(row.enrollment.classId) ?? [];
        bucket.push(row);
        byClass.set(row.enrollment.classId, bucket);
      }

      const classResults = await prisma.result.findMany({
        where: { examId, classPosition: { in: [1, 2, 3] } },
        include: {
          student: { select: { id: true, fullName: true } },
          enrollment: { include: { schoolClass: { select: { name: true } } } },
        },
      });

      for (const result of classResults) {
        const meta = positionMeta[result.classPosition!];
        if (!meta) continue;
        planned.push({
          studentId: result.studentId,
          type: meta.type,
          title: meta.title,
          description: `Awarded for securing position ${result.classPosition} in ${result.enrollment.schoolClass.name} with ${formatPercent(result.percentage)} in ${exam.name}.`,
          className: result.enrollment.schoolClass.name,
          sessionName: exam.session.name,
        });
      }
    }

    if (options.subjectToppers) {
      const toppers = await getSubjectToppers(examId);
      for (const topper of toppers) {
        planned.push({
          studentId: topper.studentId,
          type: 'SUBJECT_TOPPER',
          title: `Subject Topper — ${topper.subjectName}`,
          description: `Awarded for the highest score in ${topper.subjectName} (${round(topper.obtainedMarks, 2)} out of ${round(topper.maxMarks, 2)}, ${formatPercent(topper.percentage, 1)}) in ${exam.name}.`,
          className: topper.className,
          sessionName: exam.session.name,
        });
      }
    }

    const fresh = planned.filter((c) => !taken.has(`${c.studentId}|${c.type}|${c.title}`));
    const skipped = planned.length - fresh.length;

    if (fresh.length === 0) {
      throw new BusinessRuleError(
        `Every certificate in this category has already been issued for ${exam.name}.`,
      );
    }

    await prisma.certificate.createMany({
      data: fresh.map((certificate) => ({
        studentId: certificate.studentId,
        examId,
        type: certificate.type,
        title: certificate.title,
        description: certificate.description,
        className: certificate.className,
        sessionName: certificate.sessionName,
        issuedDate: new Date(),
        verificationCode: verificationCode('CT'),
        issuedById: user.id,
      })),
    });

    await recordAudit({
      action: AUDIT_ACTIONS.CERTIFICATE_ISSUED,
      entityType: 'Exam',
      entityId: examId,
      description: `Issued ${fresh.length} certificate(s) for ${exam.name}${skipped ? ` (${skipped} already existed)` : ''}`,
      severity: 'WARNING',
    });

    revalidatePath('/certificates');
    return ok(
      { issued: fresh.length, skipped },
      `${fresh.length} certificate(s) issued${skipped ? `, ${skipped} already existed` : ''}.`,
    );
  });
}
