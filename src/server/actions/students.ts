'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit, diffFields } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { studentSchema } from '@/lib/schemas';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

/** Reads a student payload out of a FormData submission. */
function readStudentForm(formData: FormData) {
  const value = (key: string) => {
    const raw = formData.get(key);
    return raw === null ? undefined : String(raw);
  };

  return studentSchema.parse({
    admissionNumber: value('admissionNumber') ?? '',
    registrationNo: value('registrationNo') ?? '',
    fullName: value('fullName') ?? '',
    fatherName: value('fatherName') ?? '',
    motherName: value('motherName') ?? '',
    guardianName: value('guardianName') ?? '',
    dateOfBirth: value('dateOfBirth') ?? '',
    gender: value('gender') ?? 'MALE',
    bformCnic: value('bformCnic') ?? '',
    admissionDate: value('admissionDate') ?? '',
    parentPhone: value('parentPhone') ?? '',
    studentPhone: value('studentPhone') ?? '',
    whatsappNumber: value('whatsappNumber') ?? '',
    email: value('email') ?? '',
    address: value('address') ?? '',
    previousSchool: value('previousSchool') ?? '',
    emergencyContact: value('emergencyContact') ?? '',
    notes: value('notes') ?? '',
    status: value('status') ?? 'ACTIVE',
    sessionId: value('sessionId') ?? '',
    classId: value('classId') ?? '',
    sectionId: value('sectionId') ?? '',
    classRollNumber: value('classRollNumber') ?? '',
  });
}

/** Ensures the chosen section really belongs to the chosen class and session. */
async function assertPlacement(sessionId: string, classId: string, sectionId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { schoolClass: true },
  });
  if (!section || section.classId !== classId || section.schoolClass.sessionId !== sessionId) {
    throw new BusinessRuleError('The selected section does not belong to the selected class.', {
      sectionId: 'Choose a section of the selected class',
    });
  }
  return section;
}

/** Rejects a section that is already at its maximum strength. */
async function assertCapacity(sectionId: string, excludeStudentId?: string) {
  const section = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });
  const occupied = await prisma.enrollment.count({
    where: {
      sectionId,
      status: { notIn: ['LEFT', 'TRANSFERRED'] },
      ...(excludeStudentId ? { studentId: { not: excludeStudentId } } : {}),
    },
  });
  if (occupied >= section.maxStrength) {
    throw new BusinessRuleError(
      `Section is full — it already holds ${occupied} of ${section.maxStrength} students. Increase the maximum strength or choose another section.`,
      { sectionId: 'Section is at capacity' },
    );
  }
}

export async function createStudentAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await requirePermission('students.create');
    const input = readStudentForm(formData);

    const duplicate = await prisma.student.findUnique({
      where: { admissionNumber: input.admissionNumber },
      select: { id: true, fullName: true },
    });
    if (duplicate) {
      throw new BusinessRuleError(
        `Admission number ${input.admissionNumber} already belongs to ${duplicate.fullName}.`,
        { admissionNumber: 'This admission number is already in use' },
      );
    }

    if (input.registrationNo) {
      const dupReg = await prisma.student.findUnique({
        where: { registrationNo: input.registrationNo },
        select: { id: true },
      });
      if (dupReg) {
        throw new BusinessRuleError('That registration number is already in use.', {
          registrationNo: 'Already in use',
        });
      }
    }

    await assertPlacement(input.sessionId, input.classId, input.sectionId);
    await assertCapacity(input.sectionId);

    if (input.classRollNumber) {
      const rollClash = await prisma.enrollment.findFirst({
        where: { sectionId: input.sectionId, rollNumber: input.classRollNumber },
      });
      if (rollClash) {
        throw new BusinessRuleError('That class roll number is already used in this section.', {
          classRollNumber: 'Already used in this section',
        });
      }
    }

    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          admissionNumber: input.admissionNumber,
          registrationNo: input.registrationNo ?? null,
          fullName: input.fullName,
          fatherName: input.fatherName,
          motherName: input.motherName ?? null,
          guardianName: input.guardianName ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender,
          bformCnic: input.bformCnic ?? null,
          admissionDate: input.admissionDate ?? new Date(),
          parentPhone: input.parentPhone ?? null,
          studentPhone: input.studentPhone ?? null,
          whatsappNumber: input.whatsappNumber ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          previousSchool: input.previousSchool ?? null,
          emergencyContact: input.emergencyContact ?? null,
          notes: input.notes ?? null,
          status: input.status,
        },
      });

      await tx.enrollment.create({
        data: {
          studentId: created.id,
          sessionId: input.sessionId,
          classId: input.classId,
          sectionId: input.sectionId,
          rollNumber: input.classRollNumber ?? null,
          status: 'ACTIVE',
        },
      });

      return created;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      entityType: 'Student',
      entityId: student.id,
      description: `Added student ${student.fullName} (${student.admissionNumber})`,
      newValue: { admissionNumber: student.admissionNumber, fullName: student.fullName },
    });

    revalidatePath('/students');
    return ok({ id: student.id }, `${student.fullName} has been added.`);
  });
}

export async function updateStudentAction(
  studentId: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await requirePermission('students.edit');
    const input = readStudentForm(formData);

    const existing = await prisma.student.findUnique({
      where: { id: studentId },
      include: { enrollments: { where: { sessionId: input.sessionId }, take: 1 } },
    });
    if (!existing) throw new BusinessRuleError('That student record no longer exists.');

    if (existing.admissionNumber !== input.admissionNumber) {
      const clash = await prisma.student.findUnique({
        where: { admissionNumber: input.admissionNumber },
        select: { id: true },
      });
      if (clash && clash.id !== studentId) {
        throw new BusinessRuleError('That admission number belongs to another student.', {
          admissionNumber: 'Already in use',
        });
      }
    }

    await assertPlacement(input.sessionId, input.classId, input.sectionId);

    const currentEnrollment = existing.enrollments[0] ?? null;
    if (!currentEnrollment || currentEnrollment.sectionId !== input.sectionId) {
      await assertCapacity(input.sectionId, studentId);
    }

    if (input.classRollNumber) {
      const rollClash = await prisma.enrollment.findFirst({
        where: {
          sectionId: input.sectionId,
          rollNumber: input.classRollNumber,
          studentId: { not: studentId },
        },
      });
      if (rollClash) {
        throw new BusinessRuleError('That class roll number is already used in this section.', {
          classRollNumber: 'Already used in this section',
        });
      }
    }

    const audit = diffFields(
      existing as unknown as Record<string, unknown>,
      {
        admissionNumber: input.admissionNumber,
        fullName: input.fullName,
        fatherName: input.fatherName,
        status: input.status,
        parentPhone: input.parentPhone ?? null,
        email: input.email ?? null,
      },
      ['admissionNumber', 'fullName', 'fatherName', 'status', 'parentPhone', 'email'],
    );

    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: {
          admissionNumber: input.admissionNumber,
          registrationNo: input.registrationNo ?? null,
          fullName: input.fullName,
          fatherName: input.fatherName,
          motherName: input.motherName ?? null,
          guardianName: input.guardianName ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender,
          bformCnic: input.bformCnic ?? null,
          admissionDate: input.admissionDate ?? existing.admissionDate,
          parentPhone: input.parentPhone ?? null,
          studentPhone: input.studentPhone ?? null,
          whatsappNumber: input.whatsappNumber ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          previousSchool: input.previousSchool ?? null,
          emergencyContact: input.emergencyContact ?? null,
          notes: input.notes ?? null,
          status: input.status,
          archivedAt: input.status === 'ACTIVE' ? null : existing.archivedAt,
        },
      });

      if (currentEnrollment) {
        await tx.enrollment.update({
          where: { id: currentEnrollment.id },
          data: {
            classId: input.classId,
            sectionId: input.sectionId,
            rollNumber: input.classRollNumber ?? null,
          },
        });
      } else {
        await tx.enrollment.create({
          data: {
            studentId,
            sessionId: input.sessionId,
            classId: input.classId,
            sectionId: input.sectionId,
            rollNumber: input.classRollNumber ?? null,
            status: 'ACTIVE',
          },
        });
      }
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      entityType: 'Student',
      entityId: studentId,
      description: `Edited student ${input.fullName} (${input.admissionNumber})`,
      oldValue: audit.changed ? audit.old : undefined,
      newValue: audit.changed ? audit.next : undefined,
    });

    revalidatePath('/students');
    revalidatePath(`/students/${studentId}`);
    return ok({ id: studentId }, 'Student record updated.');
  });
}

export async function archiveStudentAction(
  studentId: string,
  status: string,
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('students.archive');

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new BusinessRuleError('That student record no longer exists.');

    const restoring = status === 'ACTIVE';

    await prisma.student.update({
      where: { id: studentId },
      data: {
        status,
        archivedAt: restoring ? null : new Date(),
        notes: reason ? `${student.notes ? `${student.notes}\n` : ''}${reason}` : student.notes,
      },
    });

    await recordAudit({
      action: restoring ? AUDIT_ACTIONS.STUDENT_RESTORED : AUDIT_ACTIONS.STUDENT_ARCHIVED,
      entityType: 'Student',
      entityId: studentId,
      description: `${student.fullName} (${student.admissionNumber}) set to ${status}${reason ? ` — ${reason}` : ''}`,
      oldValue: { status: student.status },
      newValue: { status },
      severity: 'WARNING',
    });

    revalidatePath('/students');
    revalidatePath(`/students/${studentId}`);
    return ok(undefined, restoring ? 'Student restored to active.' : `Student marked ${status.toLowerCase()}.`);
  });
}
