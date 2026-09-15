'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import {
  sessionSchema,
  classSchema,
  sectionSchema,
  subjectSchema,
  teacherSchema,
} from '@/lib/schemas';
import { addMissingSubjectsForClasses } from '../services/exam-subjects';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

const formValue = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  return raw === null ? '' : String(raw);
};
const formBool = (formData: FormData, key: string) => formData.get(key) === 'on' || formData.get(key) === 'true';

/* ------------------------------------------------------- academic sessions */

export async function saveSessionAction(
  sessionId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('sessions.manage');

    const input = sessionSchema.parse({
      name: formValue(formData, 'name'),
      startDate: formValue(formData, 'startDate'),
      endDate: formValue(formData, 'endDate'),
      isCurrent: formBool(formData, 'isCurrent'),
      isClosed: formBool(formData, 'isClosed'),
    });

    const clash = await prisma.academicSession.findUnique({ where: { name: input.name } });
    if (clash && clash.id !== sessionId) {
      throw new BusinessRuleError(`A session named "${input.name}" already exists.`, {
        name: 'Session name already in use',
      });
    }

    const saved = await prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicSession.updateMany({
          where: sessionId ? { id: { not: sessionId } } : {},
          data: { isCurrent: false },
        });
      }

      const row = sessionId
        ? await tx.academicSession.update({
            where: { id: sessionId },
            data: {
              name: input.name,
              startDate: input.startDate,
              endDate: input.endDate,
              isCurrent: input.isCurrent,
              isClosed: input.isClosed,
            },
          })
        : await tx.academicSession.create({
            data: {
              name: input.name,
              startDate: input.startDate,
              endDate: input.endDate,
              isCurrent: input.isCurrent,
              isClosed: input.isClosed,
            },
          });

      if (input.isCurrent) {
        await tx.academySettings.update({
          where: { id: 'academy' },
          data: { currentSessionId: row.id },
        });
      }

      return row;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.SESSION_CREATED,
      entityType: 'AcademicSession',
      entityId: saved.id,
      description: `${sessionId ? 'Updated' : 'Created'} academic session ${saved.name}${
        input.isCurrent ? ' (set as current)' : ''
      }`,
      newValue: { name: saved.name, isCurrent: saved.isCurrent, isClosed: saved.isClosed },
    });

    revalidatePath('/academics/sessions');
    revalidatePath('/dashboard');
    return ok(undefined, `Session ${saved.name} saved.`);
  });
}

export async function deleteSessionAction(sessionId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('sessions.manage');

    const session = await prisma.academicSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { enrollments: true, exams: true, classes: true } } },
    });
    if (!session) throw new BusinessRuleError('That session no longer exists.');

    if (session._count.enrollments > 0 || session._count.exams > 0) {
      throw new BusinessRuleError(
        `"${session.name}" holds ${session._count.enrollments} enrolment(s) and ${session._count.exams} examination(s). Academic history is never deleted — close the session instead.`,
      );
    }

    await prisma.academicSession.delete({ where: { id: sessionId } });
    await recordAudit({
      action: AUDIT_ACTIONS.SESSION_CREATED,
      entityType: 'AcademicSession',
      entityId: sessionId,
      description: `Deleted empty academic session ${session.name}`,
      severity: 'WARNING',
    });

    revalidatePath('/academics/sessions');
    return ok(undefined, 'Session deleted.');
  });
}

/* ------------------------------------------------------------------ classes */

export async function saveClassAction(
  classId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('classes.manage');

    const input = classSchema.parse({
      sessionId: formValue(formData, 'sessionId'),
      name: formValue(formData, 'name'),
      displayOrder: formValue(formData, 'displayOrder') || '0',
      isActive: formBool(formData, 'isActive'),
    });

    const clash = await prisma.schoolClass.findFirst({
      where: { sessionId: input.sessionId, name: input.name },
    });
    if (clash && clash.id !== classId) {
      throw new BusinessRuleError(`"${input.name}" already exists in this session.`, {
        name: 'Class name already used in this session',
      });
    }

    const saved = classId
      ? await prisma.schoolClass.update({ where: { id: classId }, data: input })
      : await prisma.schoolClass.create({ data: input });

    await recordAudit({
      action: classId ? AUDIT_ACTIONS.CLASS_UPDATED : AUDIT_ACTIONS.CLASS_CREATED,
      entityType: 'SchoolClass',
      entityId: saved.id,
      description: `${classId ? 'Updated' : 'Created'} class ${saved.name}`,
      newValue: { name: saved.name, displayOrder: saved.displayOrder, isActive: saved.isActive },
    });

    revalidatePath('/academics/classes');
    return ok(undefined, `Class ${saved.name} saved.`);
  });
}

export async function deleteClassAction(classId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('classes.manage');

    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: classId },
      include: { _count: { select: { enrollments: true, sections: true, subjects: true, examClasses: true } } },
    });
    if (!schoolClass) throw new BusinessRuleError('That class no longer exists.');

    if (schoolClass._count.enrollments > 0 || schoolClass._count.examClasses > 0) {
      throw new BusinessRuleError(
        `"${schoolClass.name}" has ${schoolClass._count.enrollments} enrolled student(s) and is used by ${schoolClass._count.examClasses} examination(s). Deactivate it instead of deleting.`,
      );
    }

    await prisma.schoolClass.delete({ where: { id: classId } });
    await recordAudit({
      action: AUDIT_ACTIONS.CLASS_UPDATED,
      entityType: 'SchoolClass',
      entityId: classId,
      description: `Deleted class ${schoolClass.name}`,
      severity: 'WARNING',
    });

    revalidatePath('/academics/classes');
    return ok(undefined, 'Class deleted.');
  });
}

/* ----------------------------------------------------------------- sections */

export async function saveSectionAction(
  sectionId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('sections.manage');

    const input = sectionSchema.parse({
      classId: formValue(formData, 'classId'),
      name: formValue(formData, 'name'),
      maxStrength: formValue(formData, 'maxStrength') || '40',
      classTeacherId: formValue(formData, 'classTeacherId'),
      isActive: formBool(formData, 'isActive'),
    });

    const clash = await prisma.section.findFirst({
      where: { classId: input.classId, name: input.name },
    });
    if (clash && clash.id !== sectionId) {
      throw new BusinessRuleError(`Section "${input.name}" already exists in this class.`, {
        name: 'Section name already used in this class',
      });
    }

    if (sectionId) {
      const occupied = await prisma.enrollment.count({
        where: { sectionId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
      });
      if (occupied > input.maxStrength) {
        throw new BusinessRuleError(
          `This section already holds ${occupied} students; the maximum strength cannot be lower than that.`,
          { maxStrength: `Must be at least ${occupied}` },
        );
      }
    }

    const data = {
      classId: input.classId,
      name: input.name,
      maxStrength: input.maxStrength,
      classTeacherId: input.classTeacherId || null,
      isActive: input.isActive,
    };

    const saved = sectionId
      ? await prisma.section.update({ where: { id: sectionId }, data })
      : await prisma.section.create({ data });

    await recordAudit({
      action: sectionId ? AUDIT_ACTIONS.SECTION_UPDATED : AUDIT_ACTIONS.SECTION_CREATED,
      entityType: 'Section',
      entityId: saved.id,
      description: `${sectionId ? 'Updated' : 'Created'} section ${saved.name}`,
      newValue: data,
    });

    revalidatePath('/academics/sections');
    return ok(undefined, `Section ${saved.name} saved.`);
  });
}

export async function deleteSectionAction(sectionId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('sections.manage');

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!section) throw new BusinessRuleError('That section no longer exists.');

    if (section._count.enrollments > 0) {
      throw new BusinessRuleError(
        `Section "${section.name}" still holds ${section._count.enrollments} student(s). Move them first or deactivate the section.`,
      );
    }

    await prisma.section.delete({ where: { id: sectionId } });
    await recordAudit({
      action: AUDIT_ACTIONS.SECTION_UPDATED,
      entityType: 'Section',
      entityId: sectionId,
      description: `Deleted section ${section.name}`,
      severity: 'WARNING',
    });

    revalidatePath('/academics/sections');
    return ok(undefined, 'Section deleted.');
  });
}

/* ----------------------------------------------------------------- subjects */

export async function saveSubjectAction(
  subjectId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('subjects.manage');

    const input = subjectSchema.parse({
      classId: formValue(formData, 'classId'),
      name: formValue(formData, 'name'),
      code: formValue(formData, 'code').toUpperCase(),
      type: formValue(formData, 'type'),
      maxMarks: formValue(formData, 'maxMarks'),
      passingMarks: formValue(formData, 'passingMarks'),
      theoryMarks: formValue(formData, 'theoryMarks'),
      practicalMarks: formValue(formData, 'practicalMarks') || '0',
      practicalPassing: formValue(formData, 'practicalPassing') || '0',
      teacherId: formValue(formData, 'teacherId'),
      displayOrder: formValue(formData, 'displayOrder') || '0',
      isActive: formBool(formData, 'isActive'),
    });

    const clash = await prisma.subject.findFirst({
      where: { classId: input.classId, code: input.code },
    });
    if (clash && clash.id !== subjectId) {
      throw new BusinessRuleError(`Subject code "${input.code}" is already used in this class.`, {
        code: 'Code already used in this class',
      });
    }

    const data = {
      classId: input.classId,
      name: input.name,
      code: input.code,
      type: input.type,
      maxMarks: input.maxMarks,
      passingMarks: input.passingMarks,
      theoryMarks: input.theoryMarks,
      practicalMarks: input.practicalMarks,
      practicalPassing: input.practicalPassing,
      teacherId: input.teacherId || null,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
    };

    const saved = subjectId
      ? await prisma.subject.update({ where: { id: subjectId }, data })
      : await prisma.subject.create({ data });

    await recordAudit({
      action: subjectId ? AUDIT_ACTIONS.SUBJECT_UPDATED : AUDIT_ACTIONS.SUBJECT_CREATED,
      entityType: 'Subject',
      entityId: saved.id,
      description: `${subjectId ? 'Updated' : 'Created'} subject ${saved.name} (${saved.code})`,
      newValue: data,
    });

    // An examination created before this subject existed would otherwise never
    // include it, and its date sheet would have nothing to schedule.
    const examsUpdated = saved.isActive ? await addMissingSubjectsForClasses([saved.classId]) : [];
    if (examsUpdated.length) revalidatePath('/exams');

    revalidatePath('/academics/subjects');
    return ok(
      undefined,
      examsUpdated.length
        ? `Subject ${saved.name} saved and added to ${examsUpdated.map((e) => `"${e.examName}"`).join(', ')}.`
        : `Subject ${saved.name} saved.`,
    );
  });
}

export async function deleteSubjectAction(subjectId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('subjects.manage');

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { _count: { select: { examSubjects: true } } },
    });
    if (!subject) throw new BusinessRuleError('That subject no longer exists.');

    if (subject._count.examSubjects > 0) {
      throw new BusinessRuleError(
        `"${subject.name}" is part of ${subject._count.examSubjects} examination(s) and carries recorded marks. Deactivate it instead of deleting.`,
      );
    }

    await prisma.subject.delete({ where: { id: subjectId } });
    await recordAudit({
      action: AUDIT_ACTIONS.SUBJECT_UPDATED,
      entityType: 'Subject',
      entityId: subjectId,
      description: `Deleted subject ${subject.name} (${subject.code})`,
      severity: 'WARNING',
    });

    revalidatePath('/academics/subjects');
    return ok(undefined, 'Subject deleted.');
  });
}

/** Copies every subject of one class into another — used when opening a new class. */
export async function copySubjectsAction(
  fromClassId: string,
  toClassId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('subjects.manage');

    if (fromClassId === toClassId) {
      throw new BusinessRuleError('Choose two different classes.');
    }

    const [source, target] = await Promise.all([
      prisma.schoolClass.findUnique({ where: { id: fromClassId }, include: { subjects: true } }),
      prisma.schoolClass.findUnique({ where: { id: toClassId }, include: { subjects: true } }),
    ]);
    if (!source || !target) throw new BusinessRuleError('One of the selected classes no longer exists.');

    const existingCodes = new Set(target.subjects.map((s) => s.code));
    const toCopy = source.subjects.filter((s) => !existingCodes.has(s.code));

    if (toCopy.length === 0) {
      throw new BusinessRuleError(`${target.name} already has every subject from ${source.name}.`);
    }

    await prisma.subject.createMany({
      data: toCopy.map((subject) => ({
        classId: toClassId,
        name: subject.name,
        code: subject.code,
        type: subject.type,
        maxMarks: subject.maxMarks,
        passingMarks: subject.passingMarks,
        theoryMarks: subject.theoryMarks,
        practicalMarks: subject.practicalMarks,
        practicalPassing: subject.practicalPassing,
        teacherId: subject.teacherId,
        displayOrder: subject.displayOrder,
        isActive: subject.isActive,
      })),
    });

    await recordAudit({
      action: AUDIT_ACTIONS.SUBJECT_CREATED,
      entityType: 'SchoolClass',
      entityId: toClassId,
      description: `Copied ${toCopy.length} subject(s) from ${source.name} to ${target.name}`,
    });

    const examsUpdated = await addMissingSubjectsForClasses([toClassId]);

    revalidatePath('/academics/subjects');
    if (examsUpdated.length) revalidatePath('/exams');
    return ok(
      undefined,
      examsUpdated.length
        ? `Copied ${toCopy.length} subject(s) into ${target.name} and added them to ${examsUpdated.map((e) => `"${e.examName}"`).join(', ')}.`
        : `Copied ${toCopy.length} subject(s) into ${target.name}.`,
    );
  });
}

/* ----------------------------------------------------------------- teachers */

export async function saveTeacherAction(
  teacherId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('teachers.manage');

    const input = teacherSchema.parse({
      employeeCode: formValue(formData, 'employeeCode'),
      fullName: formValue(formData, 'fullName'),
      fatherName: formValue(formData, 'fatherName'),
      cnic: formValue(formData, 'cnic'),
      gender: formValue(formData, 'gender') || undefined,
      designation: formValue(formData, 'designation'),
      qualification: formValue(formData, 'qualification'),
      phone: formValue(formData, 'phone'),
      email: formValue(formData, 'email'),
      address: formValue(formData, 'address'),
      joiningDate: formValue(formData, 'joiningDate'),
      isActive: formBool(formData, 'isActive'),
    });

    const clash = await prisma.teacher.findUnique({ where: { employeeCode: input.employeeCode } });
    if (clash && clash.id !== teacherId) {
      throw new BusinessRuleError(`Employee code "${input.employeeCode}" is already in use.`, {
        employeeCode: 'Already in use',
      });
    }

    const data = {
      employeeCode: input.employeeCode,
      fullName: input.fullName,
      fatherName: input.fatherName ?? null,
      cnic: input.cnic ?? null,
      gender: input.gender ?? null,
      designation: input.designation ?? null,
      qualification: input.qualification ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      joiningDate: input.joiningDate ?? null,
      isActive: input.isActive,
    };

    const saved = teacherId
      ? await prisma.teacher.update({ where: { id: teacherId }, data })
      : await prisma.teacher.create({ data });

    await recordAudit({
      action: teacherId ? AUDIT_ACTIONS.TEACHER_UPDATED : AUDIT_ACTIONS.TEACHER_CREATED,
      entityType: 'Teacher',
      entityId: saved.id,
      description: `${teacherId ? 'Updated' : 'Added'} teacher ${saved.fullName} (${saved.employeeCode})`,
    });

    revalidatePath('/academics/teachers');
    return ok(undefined, `${saved.fullName} saved.`);
  });
}

export async function deleteTeacherAction(teacherId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('teachers.manage');

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: {
        _count: { select: { subjects: true, classTeacherOf: true, invigilations: true } },
      },
    });
    if (!teacher) throw new BusinessRuleError('That teacher record no longer exists.');

    const linked =
      teacher._count.subjects + teacher._count.classTeacherOf + teacher._count.invigilations;
    if (linked > 0) {
      throw new BusinessRuleError(
        `${teacher.fullName} is linked to ${teacher._count.subjects} subject(s), ${teacher._count.classTeacherOf} section(s) and ${teacher._count.invigilations} invigilation duty(ies). Mark them inactive instead.`,
      );
    }

    await prisma.teacher.delete({ where: { id: teacherId } });
    await recordAudit({
      action: AUDIT_ACTIONS.TEACHER_UPDATED,
      entityType: 'Teacher',
      entityId: teacherId,
      description: `Deleted teacher ${teacher.fullName}`,
      severity: 'WARNING',
    });

    revalidatePath('/academics/teachers');
    return ok(undefined, 'Teacher deleted.');
  });
}

/** Assigns or removes a teacher for one subject in one section. */
export async function toggleTeacherAssignmentAction(
  teacherId: string,
  subjectId: string,
  sectionId: string,
  assign: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('teachers.manage');

    if (assign) {
      await prisma.teacherAssignment.upsert({
        where: { teacherId_subjectId_sectionId: { teacherId, subjectId, sectionId } },
        update: {},
        create: { teacherId, subjectId, sectionId },
      });
    } else {
      await prisma.teacherAssignment.deleteMany({ where: { teacherId, subjectId, sectionId } });
    }

    await recordAudit({
      action: AUDIT_ACTIONS.TEACHER_UPDATED,
      entityType: 'TeacherAssignment',
      entityId: teacherId,
      description: `${assign ? 'Assigned' : 'Removed'} teaching assignment`,
      newValue: { teacherId, subjectId, sectionId, assigned: assign },
    });

    revalidatePath('/academics/teachers');
    return ok(undefined, assign ? 'Assignment added.' : 'Assignment removed.');
  });
}
