'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS, EXAM_STATUS } from '@/lib/constants';
import {
  examSchema,
  dateSheetEntrySchema,
  roomSchema,
  seatingSchema,
  invigilationSchema,
} from '@/lib/schemas';
import { generateRollNumbers, setManualRollNumber } from '../services/roll-numbers';
import {
  addMissingSubjectsToExam,
  missingExamSubjects,
  OPEN_EXAM_STATUSES,
} from '../services/exam-subjects';
import { saveSeatingPlan, type SeatingStrategy } from '../services/seating';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';
import { minutesBetween } from '@/lib/utils';

const formValue = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  return raw === null ? '' : String(raw);
};

/** Blocks any structural change once results have been locked. */
async function assertExamEditable(examId: string, what = 'This examination') {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw new BusinessRuleError('That examination no longer exists.');
  if (exam.resultLocked) {
    throw new BusinessRuleError(
      `${what} is locked. A Super Admin must unlock the result before it can be changed.`,
    );
  }
  return exam;
}

/* ------------------------------------------------------------ examinations */

export async function saveExamAction(
  examId: string | null,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await requirePermission(examId ? 'exams.edit' : 'exams.create');

    const input = examSchema.parse({
      name: formValue(formData, 'name'),
      type: formValue(formData, 'type'),
      sessionId: formValue(formData, 'sessionId'),
      startDate: formValue(formData, 'startDate'),
      endDate: formValue(formData, 'endDate'),
      resultPublishDate: formValue(formData, 'resultPublishDate'),
      instructions: formValue(formData, 'instructions'),
      examCenter: formValue(formData, 'examCenter'),
      gradingSchemeId: formValue(formData, 'gradingSchemeId'),
      resultPolicyId: formValue(formData, 'resultPolicyId'),
      rollNumberPrefix: formValue(formData, 'rollNumberPrefix'),
      rollNumberMethod: formValue(formData, 'rollNumberMethod'),
      rollNumberStart: formValue(formData, 'rollNumberStart') || '1',
      rollNumberPadding: formValue(formData, 'rollNumberPadding') || '3',
      classIds: formData.getAll('classIds').map(String).filter(Boolean),
      sectionIds: formData.getAll('sectionIds').map(String).filter(Boolean),
    });

    if (examId) await assertExamEditable(examId);

    const clash = await prisma.exam.findFirst({
      where: { sessionId: input.sessionId, name: input.name },
    });
    if (clash && clash.id !== examId) {
      throw new BusinessRuleError(
        `An examination named "${input.name}" already exists in this session.`,
        { name: 'Name already used in this session' },
      );
    }

    // Every selected class must belong to the selected session.
    const classes = await prisma.schoolClass.findMany({
      where: { id: { in: input.classIds } },
      include: { subjects: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });
    const foreign = classes.filter((c) => c.sessionId !== input.sessionId);
    if (foreign.length > 0) {
      throw new BusinessRuleError(
        `${foreign.map((c) => c.name).join(', ')} do not belong to the selected academic session.`,
        { classIds: 'Choose classes from the selected session' },
      );
    }
    if (classes.length !== input.classIds.length) {
      throw new BusinessRuleError('One of the selected classes no longer exists.');
    }

    const data = {
      name: input.name,
      type: input.type,
      sessionId: input.sessionId,
      startDate: input.startDate,
      endDate: input.endDate,
      resultPublishDate: input.resultPublishDate ?? null,
      instructions: input.instructions ?? null,
      examCenter: input.examCenter ?? null,
      gradingSchemeId: input.gradingSchemeId || null,
      resultPolicyId: input.resultPolicyId || null,
      rollNumberPrefix: input.rollNumberPrefix ?? null,
      rollNumberMethod: input.rollNumberMethod,
      rollNumberStart: input.rollNumberStart,
      rollNumberPadding: input.rollNumberPadding,
    };

    const saved = await prisma.$transaction(async (tx) => {
      const exam = examId
        ? await tx.exam.update({ where: { id: examId }, data })
        : await tx.exam.create({ data: { ...data, status: EXAM_STATUS.DRAFT } });

      // Reconcile participating classes.
      await tx.examClass.deleteMany({
        where: { examId: exam.id, classId: { notIn: input.classIds } },
      });
      for (const classId of input.classIds) {
        await tx.examClass.upsert({
          where: { examId_classId: { examId: exam.id, classId } },
          update: {},
          create: { examId: exam.id, classId },
        });
      }

      // Sections: an empty selection means every section of the chosen classes.
      const allSections = await tx.section.findMany({
        where: { classId: { in: input.classIds } },
        select: { id: true },
      });
      const targetSectionIds = input.sectionIds.length
        ? input.sectionIds.filter((id) => allSections.some((s) => s.id === id))
        : allSections.map((s) => s.id);

      await tx.examSection.deleteMany({
        where: { examId: exam.id, sectionId: { notIn: targetSectionIds } },
      });
      for (const sectionId of targetSectionIds) {
        await tx.examSection.upsert({
          where: { examId_sectionId: { examId: exam.id, sectionId } },
          update: {},
          create: { examId: exam.id, sectionId },
        });
      }

      // Exam subjects: seed from the class subject definitions, keeping any
      // per-examination overrides that already exist.
      const subjectIds = classes.flatMap((c) => c.subjects.map((s) => s.id));
      await tx.examSubject.deleteMany({
        where: { examId: exam.id, subjectId: { notIn: subjectIds } },
      });
      for (const schoolClass of classes) {
        for (const subject of schoolClass.subjects) {
          await tx.examSubject.upsert({
            where: { examId_subjectId: { examId: exam.id, subjectId: subject.id } },
            update: {},
            create: {
              examId: exam.id,
              subjectId: subject.id,
              maxMarks: subject.maxMarks,
              passingMarks: subject.passingMarks,
              theoryMarks: subject.theoryMarks,
              practicalMarks: subject.practicalMarks,
              practicalPassing: subject.practicalPassing,
              displayOrder: subject.displayOrder,
            },
          });
        }
      }

      return exam;
    });

    await recordAudit({
      action: examId ? AUDIT_ACTIONS.EXAM_UPDATED : AUDIT_ACTIONS.EXAM_CREATED,
      entityType: 'Exam',
      entityId: saved.id,
      description: `${examId ? 'Updated' : 'Created'} examination ${saved.name}`,
      newValue: { name: saved.name, type: saved.type, classes: classes.map((c) => c.name) },
    });

    revalidatePath('/exams');
    revalidatePath(`/exams/${saved.id}`);
    return ok({ id: saved.id }, `Examination "${saved.name}" saved.`);
  });
}

export async function deleteExamAction(examId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('exams.delete');

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { marks: true, results: true } } },
    });
    if (!exam) throw new BusinessRuleError('That examination no longer exists.');

    if (exam.resultLocked || exam.status === EXAM_STATUS.PUBLISHED) {
      throw new BusinessRuleError(
        'Published or locked examinations cannot be deleted. Archive the examination instead.',
      );
    }
    if (exam._count.marks > 0 || exam._count.results > 0) {
      throw new BusinessRuleError(
        `This examination holds ${exam._count.marks} recorded mark(s) and ${exam._count.results} result(s). Deleting it would destroy academic records — archive it instead.`,
      );
    }

    await prisma.exam.delete({ where: { id: examId } });
    await recordAudit({
      action: AUDIT_ACTIONS.EXAM_DELETED,
      entityType: 'Exam',
      entityId: examId,
      description: `Deleted examination ${exam.name}`,
      severity: 'WARNING',
    });

    revalidatePath('/exams');
    return ok(undefined, 'Examination deleted.');
  });
}

export async function setExamStatusAction(
  examId: string,
  status: string,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('exams.edit');
    const exam = await assertExamEditable(examId);

    await prisma.exam.update({ where: { id: examId }, data: { status } });
    await prisma.resultWorkflowEvent.create({
      data: {
        examId,
        fromStatus: exam.status,
        toStatus: status,
        action: 'PROCESS',
        reason: 'Status changed from the examination screen.',
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.EXAM_UPDATED,
      entityType: 'Exam',
      entityId: examId,
      description: `Examination ${exam.name} moved to ${status}`,
      oldValue: { status: exam.status },
      newValue: { status },
    });

    revalidatePath(`/exams/${examId}`);
    revalidatePath('/exams');
    return ok(undefined, 'Examination status updated.');
  });
}

/** Per-examination maximum / passing marks overrides for one subject. */
export async function updateExamSubjectAction(
  examSubjectId: string,
  values: {
    isIncluded: boolean;
    maxMarks: number;
    passingMarks: number;
    practicalMarks: number;
    practicalPassing: number;
  },
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('exams.edit');

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: { subject: true, exam: true },
    });
    if (!examSubject) throw new BusinessRuleError('That examination subject no longer exists.');
    await assertExamEditable(examSubject.examId);

    if (values.maxMarks <= 0) {
      throw new BusinessRuleError('Maximum marks must be greater than zero.');
    }
    if (values.passingMarks > values.maxMarks) {
      throw new BusinessRuleError('Passing marks cannot exceed the maximum marks.');
    }
    if (values.practicalMarks > values.maxMarks) {
      throw new BusinessRuleError('Practical marks cannot exceed the maximum marks.');
    }
    if (values.practicalPassing > values.practicalMarks) {
      throw new BusinessRuleError('Practical passing marks cannot exceed the practical marks.');
    }

    const marksRecorded = await prisma.mark.count({ where: { examSubjectId } });
    if (marksRecorded > 0 && values.maxMarks < examSubject.maxMarks) {
      const above = await prisma.mark.count({
        where: { examSubjectId, obtainedMarks: { gt: values.maxMarks } },
      });
      if (above > 0) {
        throw new BusinessRuleError(
          `${above} recorded mark(s) exceed the new maximum of ${values.maxMarks}. Correct those marks first.`,
        );
      }
    }

    await prisma.examSubject.update({
      where: { id: examSubjectId },
      data: {
        isIncluded: values.isIncluded,
        maxMarks: values.maxMarks,
        passingMarks: values.passingMarks,
        practicalMarks: values.practicalMarks,
        practicalPassing: values.practicalPassing,
        theoryMarks: values.maxMarks - values.practicalMarks,
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.EXAM_UPDATED,
      entityType: 'ExamSubject',
      entityId: examSubjectId,
      description: `Updated ${examSubject.subject.name} marks for ${examSubject.exam.name}`,
      oldValue: { maxMarks: examSubject.maxMarks, passingMarks: examSubject.passingMarks },
      newValue: values,
    });

    revalidatePath(`/exams/${examSubject.examId}`);
    return ok(undefined, `${examSubject.subject.name} updated.`);
  });
}

/* -------------------------------------------------------------- date sheet */

export async function saveDateSheetEntryAction(
  entryId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('datesheet.manage');

    const input = dateSheetEntrySchema.parse({
      id: entryId ?? '',
      examId: formValue(formData, 'examId'),
      examSubjectId: formValue(formData, 'examSubjectId'),
      classId: formValue(formData, 'classId'),
      sectionId: formValue(formData, 'sectionId'),
      paperDate: formValue(formData, 'paperDate'),
      startTime: formValue(formData, 'startTime'),
      endTime: formValue(formData, 'endTime'),
      roomId: formValue(formData, 'roomId'),
      instructions: formValue(formData, 'instructions'),
    });

    await assertExamEditable(input.examId, 'The date sheet');

    // The paper must fall inside the examination window.
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: input.examId } });
    const day = input.paperDate;
    const startBoundary = new Date(exam.startDate);
    startBoundary.setHours(0, 0, 0, 0);
    const endBoundary = new Date(exam.endDate);
    endBoundary.setHours(23, 59, 59, 999);
    if (day < startBoundary || day > endBoundary) {
      throw new BusinessRuleError(
        `The paper date must fall between the examination's start and end dates.`,
        { paperDate: 'Outside the examination window' },
      );
    }

    // One class cannot sit two papers at the same time on the same day.
    const overlapping = await prisma.dateSheetEntry.findMany({
      where: {
        examId: input.examId,
        classId: input.classId,
        paperDate: input.paperDate,
        ...(entryId ? { id: { not: entryId } } : {}),
      },
      include: { examSubject: { include: { subject: { select: { name: true } } } } },
    });
    const clash = overlapping.find(
      (entry) => input.startTime < entry.endTime && entry.startTime < input.endTime,
    );
    if (clash) {
      throw new BusinessRuleError(
        `This class already sits ${clash.examSubject.subject.name} between ${clash.startTime} and ${clash.endTime} that day.`,
        { startTime: 'Clashes with another paper' },
      );
    }

    const data = {
      examId: input.examId,
      examSubjectId: input.examSubjectId,
      classId: input.classId,
      sectionId: input.sectionId || null,
      paperDate: input.paperDate,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes: minutesBetween(input.startTime, input.endTime),
      roomId: input.roomId || null,
      instructions: input.instructions ?? null,
    };

    const saved = entryId
      ? await prisma.dateSheetEntry.update({ where: { id: entryId }, data })
      : await prisma.dateSheetEntry.create({ data });

    await recordAudit({
      action: AUDIT_ACTIONS.DATESHEET_UPDATED,
      entityType: 'DateSheetEntry',
      entityId: saved.id,
      description: `${entryId ? 'Updated' : 'Added'} a date sheet paper for ${exam.name}`,
      newValue: data,
    });

    revalidatePath('/exams/date-sheets');
    revalidatePath(`/exams/${input.examId}`);
    return ok(undefined, 'Date sheet entry saved.');
  });
}

export async function deleteDateSheetEntryAction(entryId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('datesheet.manage');

    const entry = await prisma.dateSheetEntry.findUnique({
      where: { id: entryId },
      include: { _count: { select: { attendance: true, invigilations: true } } },
    });
    if (!entry) throw new BusinessRuleError('That date sheet entry no longer exists.');
    await assertExamEditable(entry.examId, 'The date sheet');

    if (entry._count.attendance > 0) {
      throw new BusinessRuleError(
        `Attendance has already been recorded for this paper (${entry._count.attendance} record(s)). Clear the attendance first.`,
      );
    }

    await prisma.dateSheetEntry.delete({ where: { id: entryId } });
    await recordAudit({
      action: AUDIT_ACTIONS.DATESHEET_UPDATED,
      entityType: 'DateSheetEntry',
      entityId: entryId,
      description: 'Deleted a date sheet paper',
      severity: 'WARNING',
    });

    revalidatePath('/exams/date-sheets');
    return ok(undefined, 'Paper removed from the date sheet.');
  });
}

/**
 * Brings an examination's subjects up to date with its classes — for an
 * examination created before some of its classes' subjects were added.
 */
export async function addMissingExamSubjectsAction(
  examId: string,
): Promise<ActionResult<{ added: number }>> {
  return runAction(async () => {
    await requireAnyPermission(['exams.edit', 'datesheet.manage']);

    const exam = await assertExamEditable(examId);
    if (!OPEN_EXAM_STATUSES.includes(exam.status)) {
      throw new BusinessRuleError(
        'Marks entry has already begun for this examination, so subjects can no longer be added — doing so would change results already under way.',
      );
    }

    const missing = await missingExamSubjects(examId);
    if (missing.length === 0) {
      return ok({ added: 0 }, 'This examination already has every subject of its classes.');
    }

    const added = await addMissingSubjectsToExam(examId);

    await recordAudit({
      action: AUDIT_ACTIONS.EXAM_UPDATED,
      entityType: 'Exam',
      entityId: examId,
      description: `Added ${added.length} subject(s) to ${exam.name}: ${added.map((s) => `${s.name} (${s.className})`).join(', ')}`,
    });

    revalidatePath('/exams/date-sheets');
    revalidatePath(`/exams/${examId}`);
    return ok(
      { added: added.length },
      `Added ${added.length} subject(s) to ${exam.name}. You can schedule them now.`,
    );
  });
}

/**
 * Lays out one paper per working day for every subject of the examination,
 * skipping Sundays. Existing entries are left untouched.
 */
export async function autoBuildDateSheetAction(
  examId: string,
  startDateISO: string,
  startTime: string,
  durationMinutes: number,
): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    await requirePermission('datesheet.manage');
    const exam = await assertExamEditable(examId, 'The date sheet');

    const [examSubjects, existing, rooms] = await Promise.all([
      prisma.examSubject.findMany({
        where: { examId, isIncluded: true },
        include: { subject: { select: { classId: true, name: true } } },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.dateSheetEntry.findMany({ where: { examId }, select: { examSubjectId: true, classId: true } }),
      prisma.examRoom.findMany({ where: { isActive: true }, orderBy: { roomNumber: 'asc' } }),
    ]);

    if (examSubjects.length === 0) {
      throw new BusinessRuleError(
        'This examination has no subjects yet. If you added subjects to its class after creating the examination, use "Add missing subjects" on this page first.',
      );
    }

    const already = new Set(existing.map((e) => `${e.examSubjectId}|${e.classId}`));

    // Group by display order so the same subject across classes sits the same day.
    const byOrder = new Map<number, typeof examSubjects>();
    for (const examSubject of examSubjects) {
      const bucket = byOrder.get(examSubject.displayOrder) ?? [];
      bucket.push(examSubject);
      byOrder.set(examSubject.displayOrder, bucket);
    }

    const cursor = new Date(`${startDateISO}T12:00:00`);
    if (Number.isNaN(cursor.getTime())) {
      throw new BusinessRuleError('Enter a valid start date for the date sheet.');
    }

    const [sh, sm] = startTime.split(':').map(Number);
    if (Number.isNaN(sh) || Number.isNaN(sm)) {
      throw new BusinessRuleError('Enter a valid start time, for example 09:00.');
    }
    const endMinutes = sh * 60 + sm + durationMinutes;
    const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(
      endMinutes % 60,
    ).padStart(2, '0')}`;

    const rows: {
      examId: string;
      examSubjectId: string;
      classId: string;
      paperDate: Date;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      roomId: string | null;
      instructions: string;
    }[] = [];

    let dayIndex = 0;
    for (const order of [...byOrder.keys()].sort((a, b) => a - b)) {
      while (cursor.getDay() === 0) cursor.setDate(cursor.getDate() + 1);
      const paperDate = new Date(cursor);

      for (const examSubject of byOrder.get(order)!) {
        const key = `${examSubject.id}|${examSubject.subject.classId}`;
        if (already.has(key)) continue;
        rows.push({
          examId,
          examSubjectId: examSubject.id,
          classId: examSubject.subject.classId,
          paperDate,
          startTime,
          endTime,
          durationMinutes,
          roomId: rooms[dayIndex % Math.max(1, rooms.length)]?.id ?? null,
          instructions:
            'Candidates must be seated 15 minutes before the paper begins. Mobile phones are strictly prohibited.',
        });
      }

      cursor.setDate(cursor.getDate() + 1);
      dayIndex += 1;
    }

    if (rows.length === 0) {
      throw new BusinessRuleError('Every subject of this examination is already scheduled.');
    }

    const lastDate = rows.reduce((max, r) => (r.paperDate > max ? r.paperDate : max), rows[0]!.paperDate);

    await prisma.$transaction(async (tx) => {
      await tx.dateSheetEntry.createMany({ data: rows });
      // Widen the examination window if the generated sheet runs past it.
      if (lastDate > exam.endDate) {
        await tx.exam.update({ where: { id: examId }, data: { endDate: lastDate } });
      }
      const firstDate = rows.reduce((min, r) => (r.paperDate < min ? r.paperDate : min), rows[0]!.paperDate);
      if (firstDate < exam.startDate) {
        await tx.exam.update({ where: { id: examId }, data: { startDate: firstDate } });
      }
    });

    await recordAudit({
      action: AUDIT_ACTIONS.DATESHEET_UPDATED,
      entityType: 'Exam',
      entityId: examId,
      description: `Auto-generated ${rows.length} date sheet paper(s) for ${exam.name}`,
    });

    revalidatePath('/exams/date-sheets');
    revalidatePath(`/exams/${examId}`);
    return ok({ created: rows.length }, `${rows.length} paper(s) scheduled.`);
  });
}

/* ------------------------------------------------------------ roll numbers */

export async function generateRollNumbersAction(
  examId: string,
): Promise<ActionResult<{ total: number }>> {
  return runAction(async () => {
    await requirePermission('rollnumbers.manage');

    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const result = await generateRollNumbers(examId);

    await recordAudit({
      action: AUDIT_ACTIONS.ROLL_NUMBERS_GENERATED,
      entityType: 'Exam',
      entityId: examId,
      description: `Generated ${result.total} roll number(s) for ${exam.name} using the ${exam.rollNumberMethod} method`,
      newValue: result,
      severity: 'WARNING',
    });

    revalidatePath('/exams/roll-numbers');
    revalidatePath(`/exams/${examId}`);
    return ok({ total: result.total }, `${result.total} roll number(s) allocated.`);
  });
}

export async function setManualRollNumberAction(
  examId: string,
  studentId: string,
  rollNumber: string,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('rollnumbers.manage');
    await setManualRollNumber(examId, studentId, rollNumber);

    await recordAudit({
      action: AUDIT_ACTIONS.ROLL_NUMBERS_GENERATED,
      entityType: 'RollNumberAllocation',
      entityId: studentId,
      description: `Set roll number ${rollNumber} manually`,
    });

    revalidatePath('/exams/roll-numbers');
    return ok(undefined, `Roll number set to ${rollNumber}.`);
  });
}

/* ------------------------------------------------------------------- rooms */

export async function saveRoomAction(
  roomId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('rooms.manage');

    const input = roomSchema.parse({
      name: formValue(formData, 'name'),
      roomNumber: formValue(formData, 'roomNumber'),
      building: formValue(formData, 'building'),
      capacity: formValue(formData, 'capacity'),
      rowCount: formValue(formData, 'rowCount'),
      colCount: formValue(formData, 'colCount'),
      isActive: formData.get('isActive') === 'on',
    });

    if (input.capacity > input.rowCount * input.colCount) {
      throw new BusinessRuleError(
        `Capacity (${input.capacity}) exceeds the seat grid of ${input.rowCount} × ${input.colCount} = ${
          input.rowCount * input.colCount
        } seats.`,
        { capacity: 'Larger than the seat grid' },
      );
    }

    const clash = await prisma.examRoom.findUnique({ where: { roomNumber: input.roomNumber } });
    if (clash && clash.id !== roomId) {
      throw new BusinessRuleError(`Room number "${input.roomNumber}" is already in use.`, {
        roomNumber: 'Already in use',
      });
    }

    const data = {
      name: input.name,
      roomNumber: input.roomNumber,
      building: input.building ?? null,
      capacity: input.capacity,
      rowCount: input.rowCount,
      colCount: input.colCount,
      isActive: input.isActive,
    };

    const saved = roomId
      ? await prisma.examRoom.update({ where: { id: roomId }, data })
      : await prisma.examRoom.create({ data });

    await recordAudit({
      action: AUDIT_ACTIONS.SEATING_GENERATED,
      entityType: 'ExamRoom',
      entityId: saved.id,
      description: `${roomId ? 'Updated' : 'Created'} examination room ${saved.name} (${saved.roomNumber})`,
    });

    revalidatePath('/exams/rooms');
    return ok(undefined, `Room ${saved.name} saved.`);
  });
}

export async function deleteRoomAction(roomId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('rooms.manage');

    const room = await prisma.examRoom.findUnique({
      where: { id: roomId },
      include: { _count: { select: { seats: true, dateSheets: true, invigilations: true } } },
    });
    if (!room) throw new BusinessRuleError('That room no longer exists.');

    const linked = room._count.seats + room._count.dateSheets + room._count.invigilations;
    if (linked > 0) {
      throw new BusinessRuleError(
        `${room.name} is used by an existing seating plan, date sheet or duty roster. Deactivate it instead.`,
      );
    }

    await prisma.examRoom.delete({ where: { id: roomId } });
    await recordAudit({
      action: AUDIT_ACTIONS.SEATING_GENERATED,
      entityType: 'ExamRoom',
      entityId: roomId,
      description: `Deleted examination room ${room.name}`,
      severity: 'WARNING',
    });

    revalidatePath('/exams/rooms');
    return ok(undefined, 'Room deleted.');
  });
}

/* ----------------------------------------------------------------- seating */

export async function generateSeatingAction(
  examId: string,
  roomIds: string[],
  strategy: SeatingStrategy,
  mixBy: 'CLASS' | 'SECTION',
): Promise<ActionResult<{ seated: number }>> {
  return runAction(async () => {
    await requirePermission('seating.manage');

    const input = seatingSchema.parse({ examId, roomIds, strategy, mixBy });
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: input.examId } });

    const result = await saveSeatingPlan(input.examId, {
      roomIds: input.roomIds,
      strategy: input.strategy,
      mixBy: input.mixBy,
    });

    await recordAudit({
      action: AUDIT_ACTIONS.SEATING_GENERATED,
      entityType: 'Exam',
      entityId: input.examId,
      description: `Generated a ${input.strategy.toLowerCase()} seating plan for ${exam.name}: ${result.seated} students across ${result.rooms} room(s)`,
      newValue: result,
      severity: 'WARNING',
    });

    revalidatePath('/exams/seating');
    return ok({ seated: result.seated }, `${result.seated} students seated across ${result.rooms} room(s).`);
  });
}

export async function clearSeatingAction(examId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('seating.manage');
    const removed = await prisma.seatAssignment.deleteMany({ where: { examId } });

    await recordAudit({
      action: AUDIT_ACTIONS.SEATING_GENERATED,
      entityType: 'Exam',
      entityId: examId,
      description: `Cleared the seating plan (${removed.count} seat assignments removed)`,
      severity: 'WARNING',
    });

    revalidatePath('/exams/seating');
    return ok(undefined, 'Seating plan cleared.');
  });
}

/* ------------------------------------------------------------ invigilation */

export async function saveInvigilationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('invigilation.manage');

    const input = invigilationSchema.parse({
      examId: formValue(formData, 'examId'),
      dateSheetEntryId: formValue(formData, 'dateSheetEntryId'),
      roomId: formValue(formData, 'roomId'),
      teacherId: formValue(formData, 'teacherId'),
      dutyRole: formValue(formData, 'dutyRole') || 'INVIGILATOR',
    });

    const entry = await prisma.dateSheetEntry.findUnique({
      where: { id: input.dateSheetEntryId },
      include: { examSubject: { include: { subject: { select: { name: true } } } } },
    });
    if (!entry) throw new BusinessRuleError('That paper no longer exists in the date sheet.');

    // A teacher cannot be on duty in two rooms at the same time.
    const sameSlot = await prisma.invigilationDuty.findFirst({
      where: {
        teacherId: input.teacherId,
        dateSheetEntry: {
          paperDate: entry.paperDate,
          startTime: { lt: entry.endTime },
          endTime: { gt: entry.startTime },
        },
        roomId: { not: input.roomId },
      },
      include: { room: { select: { name: true } } },
    });
    if (sameSlot) {
      throw new BusinessRuleError(
        `This teacher is already on duty in ${sameSlot.room.name} during that time slot.`,
        { teacherId: 'Already on duty at this time' },
      );
    }

    await prisma.invigilationDuty.upsert({
      where: {
        dateSheetEntryId_roomId_teacherId: {
          dateSheetEntryId: input.dateSheetEntryId,
          roomId: input.roomId,
          teacherId: input.teacherId,
        },
      },
      update: { dutyRole: input.dutyRole },
      create: {
        examId: input.examId,
        dateSheetEntryId: input.dateSheetEntryId,
        roomId: input.roomId,
        teacherId: input.teacherId,
        dutyRole: input.dutyRole,
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.INVIGILATION_UPDATED,
      entityType: 'InvigilationDuty',
      entityId: input.dateSheetEntryId,
      description: `Assigned invigilation duty for ${entry.examSubject.subject.name}`,
      newValue: input,
    });

    revalidatePath('/exams/invigilation');
    return ok(undefined, 'Invigilation duty assigned.');
  });
}

export async function deleteInvigilationAction(dutyId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('invigilation.manage');
    await prisma.invigilationDuty.delete({ where: { id: dutyId } });

    await recordAudit({
      action: AUDIT_ACTIONS.INVIGILATION_UPDATED,
      entityType: 'InvigilationDuty',
      entityId: dutyId,
      description: 'Removed an invigilation duty',
    });

    revalidatePath('/exams/invigilation');
    return ok(undefined, 'Duty removed.');
  });
}

/**
 * Distributes invigilation duty evenly across active teachers, two per room per
 * paper, never double-booking a teacher in the same time slot.
 */
export async function autoAssignInvigilationAction(
  examId: string,
  roomIds: string[],
): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    await requirePermission('invigilation.manage');

    const [exam, entries, teachers, existing] = await Promise.all([
      prisma.exam.findUniqueOrThrow({ where: { id: examId } }),
      prisma.dateSheetEntry.findMany({ where: { examId }, orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }] }),
      prisma.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' } }),
      prisma.invigilationDuty.findMany({ where: { examId } }),
    ]);

    if (entries.length === 0) {
      throw new BusinessRuleError('Build the date sheet before assigning invigilation duty.');
    }
    if (teachers.length === 0) {
      throw new BusinessRuleError('No active teachers are available for duty.');
    }
    if (roomIds.length === 0) {
      throw new BusinessRuleError('Select at least one room.');
    }

    const taken = new Set(existing.map((d) => `${d.dateSheetEntryId}|${d.roomId}|${d.teacherId}`));
    // Tracks which teachers are already busy in a given date+time slot.
    const busy = new Map<string, Set<string>>();
    for (const duty of existing) {
      const entry = entries.find((e) => e.id === duty.dateSheetEntryId);
      if (!entry) continue;
      const slot = `${entry.paperDate.toISOString().slice(0, 10)}|${entry.startTime}`;
      const set = busy.get(slot) ?? new Set<string>();
      set.add(duty.teacherId);
      busy.set(slot, set);
    }

    const rows: {
      examId: string;
      dateSheetEntryId: string;
      roomId: string;
      teacherId: string;
      dutyRole: string;
    }[] = [];

    let cursor = 0;
    for (const entry of entries) {
      const slot = `${entry.paperDate.toISOString().slice(0, 10)}|${entry.startTime}`;
      const slotBusy = busy.get(slot) ?? new Set<string>();

      for (const roomId of roomIds) {
        // Two invigilators per room: one superintendent, one invigilator.
        for (let seat = 0; seat < 2; seat++) {
          let chosen: string | null = null;
          for (let attempt = 0; attempt < teachers.length; attempt++) {
            const candidate = teachers[(cursor + attempt) % teachers.length]!;
            const key = `${entry.id}|${roomId}|${candidate.id}`;
            if (!slotBusy.has(candidate.id) && !taken.has(key)) {
              chosen = candidate.id;
              cursor = (cursor + attempt + 1) % teachers.length;
              break;
            }
          }
          if (!chosen) continue;

          slotBusy.add(chosen);
          taken.add(`${entry.id}|${roomId}|${chosen}`);
          rows.push({
            examId,
            dateSheetEntryId: entry.id,
            roomId,
            teacherId: chosen,
            dutyRole: seat === 0 ? 'SUPERINTENDENT' : 'INVIGILATOR',
          });
        }
      }
      busy.set(slot, slotBusy);
    }

    if (rows.length === 0) {
      throw new BusinessRuleError(
        'No further duties could be assigned — every slot is already covered, or too few teachers are available.',
      );
    }

    for (let i = 0; i < rows.length; i += 200) {
      await prisma.invigilationDuty.createMany({ data: rows.slice(i, i + 200) });
    }

    await recordAudit({
      action: AUDIT_ACTIONS.INVIGILATION_UPDATED,
      entityType: 'Exam',
      entityId: examId,
      description: `Auto-assigned ${rows.length} invigilation duty(ies) for ${exam.name}`,
    });

    revalidatePath('/exams/invigilation');
    return ok({ created: rows.length }, `${rows.length} duties assigned.`);
  });
}

/* -------------------------------------------------------- exam attendance */

export async function saveAttendanceAction(
  dateSheetEntryId: string,
  rows: { studentId: string; status: string; remarks?: string }[],
): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => {
    const user = await requirePermission('attendance.manage');

    const entry = await prisma.dateSheetEntry.findUnique({
      where: { id: dateSheetEntryId },
      include: { exam: true, examSubject: { include: { subject: { select: { name: true } } } } },
    });
    if (!entry) throw new BusinessRuleError('That paper no longer exists in the date sheet.');
    if (entry.exam.resultLocked) {
      throw new BusinessRuleError('Results for this examination are locked; attendance cannot change.');
    }

    const valid = new Set(['PRESENT', 'ABSENT', 'LATE']);
    for (const row of rows) {
      if (!valid.has(row.status)) {
        throw new BusinessRuleError(`"${row.status}" is not a valid attendance status.`);
      }
    }

    await prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          await tx.examAttendance.upsert({
            where: {
              dateSheetEntryId_studentId: { dateSheetEntryId, studentId: row.studentId },
            },
            update: {
              status: row.status,
              remarks: row.remarks ?? null,
              markedByName: user.fullName,
              markedAt: new Date(),
            },
            create: {
              examId: entry.examId,
              dateSheetEntryId,
              studentId: row.studentId,
              status: row.status,
              remarks: row.remarks ?? null,
              markedByName: user.fullName,
            },
          });
        }
      },
      { timeout: 60_000 },
    );

    const absentCount = rows.filter((r) => r.status === 'ABSENT').length;

    await recordAudit({
      action: AUDIT_ACTIONS.ATTENDANCE_MARKED,
      entityType: 'DateSheetEntry',
      entityId: dateSheetEntryId,
      description: `Recorded attendance for ${entry.examSubject.subject.name} — ${rows.length} candidates, ${absentCount} absent`,
    });

    revalidatePath('/exams/attendance');
    return ok(
      { saved: rows.length },
      `Attendance saved for ${rows.length} candidate(s)${absentCount ? ` — ${absentCount} absent` : ''}.`,
    );
  });
}
