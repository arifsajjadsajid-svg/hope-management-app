'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { reviewMarks, type MarksRow, type SheetColumn } from '@/lib/scan/marks';
import {
  reviewEnquiries,
  reviewStudents,
  type EnquiryScanRow,
  type StudentScanRow,
} from '@/lib/scan/records';
import { loadEnquiryContext, loadMarksContext, loadStudentContext } from '../services/scan/context';
import { createStudentsInSection } from '../services/student-import';
import { nextEnquiryReference } from '../services/enquiry-reference';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

/**
 * Saving what was read from scanned documents.
 *
 * The browser sends back the rows as the reviewer left them. None of the
 * browser's verdicts are trusted: every row is checked again here against the
 * records as they are now, and nothing is written unless the whole batch is
 * clean. A reading nobody has confirmed never reaches the database.
 */

const text = (max: number) => z.string().max(max);
const fileNames = z.array(text(200)).max(50);

function describeFiles(names: string[]): string {
  if (names.length === 0) return 'a scan';
  const first = `"${names[0]}"`;
  return names.length === 1 ? first : `${first} and ${names.length - 1} other file(s)`;
}

function refuseUnreviewed(summary: { blocked: number; toCheck: number }) {
  if (summary.blocked > 0) {
    throw new BusinessRuleError(
      `${summary.blocked} row(s) still have problems. Correct them, or untick them to leave them out.`,
    );
  }
  if (summary.toCheck > 0) {
    throw new BusinessRuleError(
      `${summary.toCheck} row(s) have readings nobody has checked yet. Confirm or correct each one first.`,
    );
  }
}

/* ------------------------------------------------------------------ marks */

const targetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SUBJECT'),
    examSubjectId: text(40),
    part: z.enum(['MARKS', 'THEORY', 'PRACTICAL']),
  }),
  z.object({ type: z.literal('GRAND_TOTAL') }),
  z.object({ type: z.literal('IGNORE') }),
]);

const marksInput = z.object({
  examId: text(40).min(1),
  classId: text(40).min(1),
  sectionId: text(40).nullable(),
  fileNames,
  columns: z.array(z.object({ key: text(20), heading: text(200), target: targetSchema })).max(80),
  rows: z
    .array(
      z.object({
        key: text(40),
        source: z.number().int().min(0),
        include: z.boolean(),
        studentId: text(40),
        rollNumber: text(60),
        studentName: text(200),
        values: z.record(text(20), text(40)),
        unclear: z.array(text(40)).max(100),
        note: text(500),
      }),
    )
    .max(1500),
});

export async function commitMarksScanAction(
  input: z.input<typeof marksInput>,
): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => {
    const user = await requirePermission('marks.import');
    const data = marksInput.parse(input);

    const context = await loadMarksContext(data.examId, data.classId, data.sectionId);
    const review = reviewMarks(context, data.columns as SheetColumn[], data.rows as MarksRow[]);

    if (review.columnProblems.length > 0) throw new BusinessRuleError(review.columnProblems[0]!);
    refuseUnreviewed(review.summary);
    if (review.planned.length === 0) throw new BusinessRuleError('There are no marks to save.');

    const subjectNames = new Map(context.subjects.map((s) => [s.examSubjectId, `${s.name} (${s.code})`]));
    const where = `${context.className}${context.sectionName ? ` — ${context.sectionName}` : ''}`;

    const batch = await prisma.importBatch.create({
      data: {
        type: 'SCAN_MARKS',
        fileName: describeFiles(data.fileNames).slice(0, 250),
        totalRows: data.rows.length,
        status: 'VALIDATED',
        createdById: user.id,
      },
    });

    await prisma.$transaction(
      async (tx) => {
        for (const mark of review.planned) {
          const values = {
            theoryMarks: mark.theory,
            practicalMarks: mark.practical,
            obtainedMarks: mark.obtained,
            specialStatus: mark.special,
            updatedById: user.id,
          };
          await tx.mark.upsert({
            where: { examSubjectId_studentId: { examSubjectId: mark.examSubjectId, studentId: mark.studentId } },
            update: values,
            create: {
              ...values,
              examId: data.examId,
              examSubjectId: mark.examSubjectId,
              studentId: mark.studentId,
              enteredById: user.id,
            },
          });
        }

        if (['DRAFT', 'SCHEDULED', 'IN_PROGRESS'].includes(context.exam.status)) {
          await tx.exam.update({ where: { id: data.examId }, data: { status: 'MARKS_ENTRY' } });
        }

        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            importedRows: review.summary.included - review.summary.blocked,
            failedRows: data.rows.length - review.summary.included,
            status: 'COMPLETED',
            logText: `${review.planned.length} mark(s) from a scan saved to ${context.exam.name}, ${where}`,
          },
        });
      },
      { timeout: 180_000 },
    );

    await recordAudit({
      action: AUDIT_ACTIONS.MARKS_IMPORTED,
      entityType: 'ImportBatch',
      entityId: batch.id,
      description: `Saved ${review.planned.length} mark(s) read from ${describeFiles(data.fileNames)} for ${context.exam.name}, ${where}${review.summary.replacing ? ` — ${review.summary.replacing} replaced existing marks` : ''}`,
      oldValue: review.planned
        .filter((m) => m.replaces)
        .map((m) => ({ studentId: m.studentId, subject: subjectNames.get(m.examSubjectId), ...m.replaces })),
      newValue: review.planned.map((m) => ({
        studentId: m.studentId,
        subject: subjectNames.get(m.examSubjectId),
        obtained: m.obtained,
        special: m.special,
      })),
      severity: 'WARNING',
    });

    revalidatePath('/marks/entry');
    revalidatePath(`/exams/${data.examId}`);

    return ok({ saved: review.planned.length }, `${review.planned.length} mark(s) saved.`);
  });
}

/* --------------------------------------------------------------- students */

const studentFieldsSchema = z.object({
  admissionNumber: text(60),
  registrationNo: text(60),
  fullName: text(120),
  fatherName: text(120),
  motherName: text(120),
  guardianName: text(120),
  dateOfBirth: text(40),
  gender: text(20),
  bformCnic: text(30),
  parentPhone: text(30),
  studentPhone: text(30),
  whatsappNumber: text(30),
  email: text(120),
  address: text(300),
  previousSchool: text(160),
  emergencyContact: text(60),
  classRollNumber: text(20),
  status: text(20),
});

const studentsInput = z.object({
  sessionId: text(40).min(1, 'Choose the session'),
  classId: text(40).min(1, 'Choose the class'),
  sectionId: text(40).min(1, 'Choose the section'),
  fileNames,
  rows: z
    .array(
      z.object({
        key: text(40),
        source: z.number().int().min(0),
        include: z.boolean(),
        fields: studentFieldsSchema,
        unclear: z.array(text(40)).max(40),
        note: text(500),
      }),
    )
    .max(1000),
});

export async function commitStudentScanAction(
  input: z.input<typeof studentsInput>,
): Promise<ActionResult<{ imported: number }>> {
  return runAction(async () => {
    const user = await requirePermission('students.import');
    const data = studentsInput.parse(input);

    const review = reviewStudents(data.rows as StudentScanRow[], await loadStudentContext());
    refuseUnreviewed(review.summary);

    const rows = review.ready.map((key) => review.cleaned[key]!);
    const { imported, batchId, sectionLabel } = await createStudentsInSection({
      userId: user.id,
      batchType: 'SCAN_STUDENTS',
      fileName: describeFiles(data.fileNames).slice(0, 250),
      totalRows: data.rows.length,
      sessionId: data.sessionId,
      classId: data.classId,
      sectionId: data.sectionId,
      rows,
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_IMPORTED,
      entityType: 'ImportBatch',
      entityId: batchId,
      description: `Added ${imported} student(s) read from ${describeFiles(data.fileNames)} to ${sectionLabel}`,
      severity: 'WARNING',
    });

    revalidatePath('/students');
    return ok({ imported }, `${imported} student(s) added to ${sectionLabel}.`);
  });
}

/* -------------------------------------------------------------- enquiries */

const enquiriesInput = z.object({
  fileNames,
  rows: z
    .array(
      z.object({
        key: text(40),
        source: z.number().int().min(0),
        include: z.boolean(),
        fields: z.object({
          studentName: text(200),
          fatherName: text(200),
          dateOfBirth: text(40),
          gender: text(20),
          classApplyingFor: text(100),
          previousSchool: text(200),
          contactPhone: text(40),
          whatsappNumber: text(40),
          email: text(200),
          address: text(400),
          notes: text(1200),
        }),
        unclear: z.array(text(40)).max(40),
        note: text(500),
      }),
    )
    .max(300),
});

export async function commitEnquiryScanAction(
  input: z.input<typeof enquiriesInput>,
): Promise<ActionResult<{ references: string[] }>> {
  return runAction(async () => {
    const user = await requirePermission('admissions.manage');
    const data = enquiriesInput.parse(input);

    const review = reviewEnquiries(data.rows as EnquiryScanRow[], await loadEnquiryContext());
    refuseUnreviewed(review.summary);
    if (review.ready.length === 0) throw new BusinessRuleError('There are no forms to save.');

    const notesByKey = new Map(data.rows.map((r) => [r.key, r.note]));

    const references = await prisma.$transaction(
      async (tx) => {
        const created: string[] = [];
        for (const key of review.ready) {
          const form = review.cleaned[key]!;
          const reference = await nextEnquiryReference(tx);
          const readerNote = notesByKey.get(key)?.trim();

          await tx.admissionEnquiry.create({
            data: {
              reference,
              studentName: form.studentName,
              fatherName: form.fatherName,
              dateOfBirth: form.dateOfBirth ? new Date(`${form.dateOfBirth}T12:00:00`) : null,
              gender: form.gender,
              classApplyingFor: form.classApplyingFor,
              previousSchool: form.previousSchool || null,
              contactPhone: form.contactPhone,
              whatsappNumber: form.whatsappNumber || null,
              email: form.email || null,
              address: form.address || null,
              message: form.notes || null,
              status: 'NEW',
              officeNotes: [`Entered from a scanned admission form by ${user.fullName}.`, readerNote]
                .filter(Boolean)
                .join(' '),
            },
          });
          created.push(reference);
        }
        return created;
      },
      { timeout: 120_000 },
    );

    await recordAudit({
      action: AUDIT_ACTIONS.ENQUIRY_RECEIVED,
      entityType: 'AdmissionEnquiry',
      entityId: references[0] ?? null,
      description: `Entered ${references.length} admission enquir${references.length === 1 ? 'y' : 'ies'} from ${describeFiles(data.fileNames)}: ${references.join(', ')}`,
      severity: 'INFO',
    });

    revalidatePath('/admissions');
    return ok(
      { references },
      `${references.length} enquir${references.length === 1 ? 'y' : 'ies'} added to Admissions.`,
    );
  });
}
