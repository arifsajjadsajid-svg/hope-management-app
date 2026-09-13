'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS, GENDERS, STUDENT_STATUS, MARK_SPECIAL_TOKENS } from '@/lib/constants';
import { readWorkbookRows } from '../services/excel';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';
import { round } from '@/lib/utils';

/* ------------------------------------------------------------- shared */

export type ImportIssue = { level: 'ERROR' | 'WARNING'; message: string };

export type StudentImportRow = {
  rowNumber: number;
  admissionNumber: string;
  registrationNo: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  guardianName: string;
  dateOfBirth: string;
  gender: string;
  bformCnic: string;
  parentPhone: string;
  studentPhone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  previousSchool: string;
  emergencyContact: string;
  classRollNumber: string;
  status: string;
  issues: ImportIssue[];
  importable: boolean;
};

export type StudentImportPreview = {
  fileName: string;
  headers: string[];
  rows: StudentImportRow[];
  summary: { total: number; importable: number; errors: number; warnings: number; duplicates: number };
};

/** Column aliases so a roster exported from another system still maps cleanly. */
const STUDENT_COLUMNS: Record<keyof Omit<StudentImportRow, 'rowNumber' | 'issues' | 'importable'>, string[]> = {
  admissionNumber: ['admission number', 'admission no', 'admission no.', 'admissionnumber', 'adm no'],
  registrationNo: ['registration number', 'registration no', 'registration no.', 'reg no'],
  fullName: ['student name', 'name', 'full name', 'student'],
  fatherName: ['father name', "father's name", 'father'],
  motherName: ['mother name', "mother's name", 'mother'],
  guardianName: ['guardian name', 'guardian'],
  dateOfBirth: ['date of birth', 'dob', 'birth date'],
  gender: ['gender', 'sex'],
  bformCnic: ['b-form / cnic', 'b-form', 'bform', 'cnic', 'b form'],
  parentPhone: ['parent phone', 'parent contact', 'father phone', 'phone'],
  studentPhone: ['student phone', 'student contact'],
  whatsappNumber: ['whatsapp', 'whatsapp number'],
  email: ['email', 'e-mail', 'email address'],
  address: ['address', 'full address', 'home address'],
  previousSchool: ['previous school', 'last school'],
  emergencyContact: ['emergency contact', 'emergency'],
  classRollNumber: ['class roll', 'roll', 'roll number', 'class roll number'],
  status: ['status', 'student status'],
};

function pickColumn(row: Record<string, string>, aliases: string[]): string {
  const normalised = new Map(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]),
  );
  for (const alias of aliases) {
    const value = normalised.get(alias);
    if (value !== undefined && value !== '') return value.trim();
  }
  return '';
}

function normaliseGender(value: string): string {
  const text = value.trim().toUpperCase();
  if (['M', 'MALE', 'BOY'].includes(text)) return 'MALE';
  if (['F', 'FEMALE', 'GIRL'].includes(text)) return 'FEMALE';
  if (GENDERS.includes(text as (typeof GENDERS)[number])) return text;
  return '';
}

function normaliseDate(value: string): string {
  const text = value.trim();
  if (!text) return '';

  // dd/mm/yyyy and dd-mm-yyyy are the common local formats.
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) {
    const [, d, m, y] = local;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  return '';
}

/* ----------------------------------------------------- student import */

export async function previewStudentImportAction(
  _prev: ActionResult<StudentImportPreview> | null,
  formData: FormData,
): Promise<ActionResult<StudentImportPreview>> {
  return runAction(async () => {
    await requirePermission('students.import');

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      throw new BusinessRuleError('Choose an Excel (.xlsx) or CSV file to import.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BusinessRuleError('The file is larger than 5 MB. Split it into smaller batches.');
    }

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) {
      throw new BusinessRuleError('Only .xlsx and .csv files are supported.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { headers, rows } = await readWorkbookRows(buffer, file.name);

    if (rows.length === 0) {
      throw new BusinessRuleError('The file contains no data rows below the header.');
    }
    if (rows.length > 2000) {
      throw new BusinessRuleError('The file holds more than 2000 rows. Import in smaller batches.');
    }

    const existing = await prisma.student.findMany({
      select: { admissionNumber: true, registrationNo: true },
    });
    const existingAdmissions = new Set(existing.map((s) => s.admissionNumber.toLowerCase()));
    const existingRegistrations = new Set(
      existing.map((s) => s.registrationNo?.toLowerCase()).filter(Boolean) as string[],
    );

    const seenAdmissions = new Set<string>();

    const parsed: StudentImportRow[] = rows.map((raw, index) => {
      const get = (key: keyof typeof STUDENT_COLUMNS) => pickColumn(raw, STUDENT_COLUMNS[key]);

      const admissionNumber = get('admissionNumber');
      const fullName = get('fullName');
      const fatherName = get('fatherName');
      const gender = normaliseGender(get('gender'));
      const dateOfBirth = normaliseDate(get('dateOfBirth'));
      const status = get('status').trim().toUpperCase();

      const issues: ImportIssue[] = [];

      if (!admissionNumber) issues.push({ level: 'ERROR', message: 'Admission number is missing' });
      if (!fullName) issues.push({ level: 'ERROR', message: 'Student name is missing' });
      if (!fatherName) issues.push({ level: 'ERROR', message: 'Father name is missing' });

      if (admissionNumber) {
        const key = admissionNumber.toLowerCase();
        if (existingAdmissions.has(key)) {
          issues.push({
            level: 'ERROR',
            message: `Admission number ${admissionNumber} already exists in the database`,
          });
        }
        if (seenAdmissions.has(key)) {
          issues.push({
            level: 'ERROR',
            message: `Admission number ${admissionNumber} appears more than once in this file`,
          });
        }
        seenAdmissions.add(key);
      }

      const registrationNo = get('registrationNo');
      if (registrationNo && existingRegistrations.has(registrationNo.toLowerCase())) {
        issues.push({
          level: 'ERROR',
          message: `Registration number ${registrationNo} already exists`,
        });
      }

      if (!gender) issues.push({ level: 'WARNING', message: 'Gender missing or unrecognised — defaults to Male' });
      if (get('dateOfBirth') && !dateOfBirth) {
        issues.push({ level: 'WARNING', message: 'Date of birth could not be read and will be left blank' });
      }
      if (status && !STUDENT_STATUS.includes(status as (typeof STUDENT_STATUS)[number])) {
        issues.push({ level: 'WARNING', message: `Status "${status}" is unrecognised — defaults to Active` });
      }

      const email = get('email');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        issues.push({ level: 'WARNING', message: 'Email looks invalid and will be left blank' });
      }

      return {
        rowNumber: index + 2, // +1 for the header row, +1 for 1-based numbering
        admissionNumber,
        registrationNo,
        fullName,
        fatherName,
        motherName: get('motherName'),
        guardianName: get('guardianName'),
        dateOfBirth,
        gender: gender || 'MALE',
        bformCnic: get('bformCnic'),
        parentPhone: get('parentPhone'),
        studentPhone: get('studentPhone'),
        whatsappNumber: get('whatsappNumber'),
        email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
        address: get('address'),
        previousSchool: get('previousSchool'),
        emergencyContact: get('emergencyContact'),
        classRollNumber: get('classRollNumber'),
        status: STUDENT_STATUS.includes(status as (typeof STUDENT_STATUS)[number]) ? status : 'ACTIVE',
        issues,
        importable: !issues.some((i) => i.level === 'ERROR'),
      };
    });

    const summary = {
      total: parsed.length,
      importable: parsed.filter((r) => r.importable).length,
      errors: parsed.filter((r) => !r.importable).length,
      warnings: parsed.filter((r) => r.issues.some((i) => i.level === 'WARNING')).length,
      duplicates: parsed.filter((r) =>
        r.issues.some((i) => i.message.includes('already exists') || i.message.includes('more than once')),
      ).length,
    };

    return ok(
      { fileName: file.name, headers, rows: parsed, summary },
      `${summary.importable} of ${summary.total} row(s) are ready to import.`,
    );
  });
}

export async function commitStudentImportAction(input: {
  fileName: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  rows: StudentImportRow[];
}): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return runAction(async () => {
    const user = await requirePermission('students.import');

    const importable = input.rows.filter((row) => row.importable);
    if (importable.length === 0) {
      throw new BusinessRuleError('There are no valid rows to import.');
    }

    const section = await prisma.section.findUnique({
      where: { id: input.sectionId },
      include: { schoolClass: true },
    });
    if (!section || section.classId !== input.classId) {
      throw new BusinessRuleError('The selected section does not belong to the selected class.');
    }
    if (section.schoolClass.sessionId !== input.sessionId) {
      throw new BusinessRuleError('The selected class does not belong to the selected session.');
    }

    const occupied = await prisma.enrollment.count({
      where: { sectionId: input.sectionId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
    });
    if (occupied + importable.length > section.maxStrength) {
      throw new BusinessRuleError(
        `Importing ${importable.length} student(s) would put ${occupied + importable.length} in a section with a maximum strength of ${section.maxStrength}.`,
      );
    }

    // Re-check duplicates at commit time in case another operator added a student.
    const admissionNumbers = importable.map((r) => r.admissionNumber);
    const clashes = await prisma.student.findMany({
      where: { admissionNumber: { in: admissionNumbers } },
      select: { admissionNumber: true },
    });
    if (clashes.length > 0) {
      throw new BusinessRuleError(
        `These admission numbers now exist in the database: ${clashes.map((c) => c.admissionNumber).join(', ')}. Re-run the preview.`,
      );
    }

    // Next free class roll number in the target section.
    const rolls = await prisma.enrollment.findMany({
      where: { sectionId: input.sectionId, rollNumber: { not: null } },
      select: { rollNumber: true },
    });
    const numbers = rolls.map((r) => Number(r.rollNumber)).filter((n) => Number.isFinite(n));
    let nextRoll = numbers.length ? Math.max(...numbers) + 1 : 1;
    const usedRolls = new Set(rolls.map((r) => r.rollNumber));

    const batch = await prisma.importBatch.create({
      data: {
        type: 'STUDENTS',
        fileName: input.fileName,
        totalRows: input.rows.length,
        status: 'VALIDATED',
        createdById: user.id,
      },
    });

    let imported = 0;

    await prisma.$transaction(
      async (tx) => {
        for (const row of importable) {
          const student = await tx.student.create({
            data: {
              admissionNumber: row.admissionNumber,
              registrationNo: row.registrationNo || null,
              fullName: row.fullName,
              fatherName: row.fatherName,
              motherName: row.motherName || null,
              guardianName: row.guardianName || null,
              dateOfBirth: row.dateOfBirth ? new Date(`${row.dateOfBirth}T12:00:00`) : null,
              gender: row.gender,
              bformCnic: row.bformCnic || null,
              admissionDate: new Date(),
              parentPhone: row.parentPhone || null,
              studentPhone: row.studentPhone || null,
              whatsappNumber: row.whatsappNumber || null,
              email: row.email || null,
              address: row.address || null,
              previousSchool: row.previousSchool || null,
              emergencyContact: row.emergencyContact || null,
              status: row.status,
            },
          });

          let roll = row.classRollNumber.trim();
          if (!roll || usedRolls.has(roll)) {
            roll = String(nextRoll).padStart(2, '0');
            nextRoll += 1;
          }
          usedRolls.add(roll);

          await tx.enrollment.create({
            data: {
              studentId: student.id,
              sessionId: input.sessionId,
              classId: input.classId,
              sectionId: input.sectionId,
              rollNumber: roll,
              status: 'ACTIVE',
            },
          });

          imported += 1;
        }

        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            importedRows: imported,
            failedRows: input.rows.length - imported,
            status: 'COMPLETED',
            logText: `Imported into ${section.schoolClass.name} — ${section.name}`,
          },
        });
      },
      { timeout: 180_000 },
    );

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_IMPORTED,
      entityType: 'ImportBatch',
      entityId: batch.id,
      description: `Imported ${imported} student(s) from "${input.fileName}" into ${section.schoolClass.name} — ${section.name}`,
      severity: 'WARNING',
    });

    revalidatePath('/students');
    return ok(
      { imported, skipped: input.rows.length - imported },
      `${imported} student(s) imported into ${section.schoolClass.name} — ${section.name}.`,
    );
  });
}

/* ------------------------------------------------------- marks import */

export type MarksImportRow = {
  rowNumber: number;
  rollNumber: string;
  studentName: string;
  studentId: string | null;
  theory: string;
  practical: string;
  total: number | null;
  special: string | null;
  issues: ImportIssue[];
  importable: boolean;
};

export type MarksImportPreview = {
  fileName: string;
  subjectName: string;
  maxMarks: number;
  rows: MarksImportRow[];
  summary: { total: number; importable: number; errors: number; matched: number };
};

const MARKS_COLUMNS = {
  rollNumber: ['roll number', 'roll no', 'roll no.', 'roll'],
  studentName: ['student name', 'name', 'student'],
  theory: ['theory', 'theory marks', 'marks', 'obtained', 'obtained marks'],
  practical: ['practical', 'practical marks'],
};

export async function previewMarksImportAction(
  _prev: ActionResult<MarksImportPreview> | null,
  formData: FormData,
): Promise<ActionResult<MarksImportPreview>> {
  return runAction(async () => {
    await requirePermission('marks.import');

    const examSubjectId = String(formData.get('examSubjectId') ?? '');
    if (!examSubjectId) throw new BusinessRuleError('Choose the subject these marks belong to.');

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      throw new BusinessRuleError('Choose an Excel (.xlsx) or CSV file to import.');
    }

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: {
        exam: true,
        subject: { select: { name: true, code: true, classId: true } },
      },
    });
    if (!examSubject) throw new BusinessRuleError('That subject is not part of the examination.');
    if (examSubject.exam.resultLocked) {
      throw new BusinessRuleError('Results for this examination are locked; marks cannot be imported.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows } = await readWorkbookRows(buffer, file.name);
    if (rows.length === 0) throw new BusinessRuleError('The file contains no data rows.');

    const [allocations, enrollments] = await Promise.all([
      prisma.rollNumberAllocation.findMany({
        where: { examId: examSubject.examId },
        include: { student: { select: { id: true, fullName: true } } },
      }),
      prisma.enrollment.findMany({
        where: { sessionId: examSubject.exam.sessionId, classId: examSubject.subject.classId },
        include: { student: { select: { id: true, fullName: true } } },
      }),
    ]);

    const byRoll = new Map(allocations.map((a) => [a.rollNumber.toLowerCase(), a.student]));
    for (const enrollment of enrollments) {
      if (enrollment.rollNumber) {
        const key = enrollment.rollNumber.toLowerCase();
        if (!byRoll.has(key)) byRoll.set(key, enrollment.student);
      }
    }
    const classStudentIds = new Set(enrollments.map((e) => e.studentId));

    const hasPractical = examSubject.practicalMarks > 0;
    const theoryMax = hasPractical ? examSubject.theoryMarks : examSubject.maxMarks;

    const parsed: MarksImportRow[] = rows.map((raw, index) => {
      const rollNumber = pickColumn(raw, MARKS_COLUMNS.rollNumber);
      const studentName = pickColumn(raw, MARKS_COLUMNS.studentName);
      const theory = pickColumn(raw, MARKS_COLUMNS.theory);
      const practical = pickColumn(raw, MARKS_COLUMNS.practical);

      const issues: ImportIssue[] = [];
      const student = rollNumber ? byRoll.get(rollNumber.toLowerCase()) : undefined;

      if (!rollNumber) issues.push({ level: 'ERROR', message: 'Roll number is missing' });
      else if (!student) {
        issues.push({ level: 'ERROR', message: `No candidate found with roll number ${rollNumber}` });
      } else if (!classStudentIds.has(student.id)) {
        issues.push({
          level: 'ERROR',
          message: `${student.fullName} is not in the class this subject belongs to`,
        });
      }

      const upper = theory.trim().toUpperCase();
      const special = (MARK_SPECIAL_TOKENS as readonly string[]).includes(upper) ? upper : null;

      let total: number | null = null;
      if (!special) {
        if (theory.trim() === '' && practical.trim() === '') {
          issues.push({ level: 'ERROR', message: 'No marks and no ABS/EX/MED/WH code' });
        } else {
          const theoryValue = theory.trim() === '' ? 0 : Number(theory);
          const practicalValue = practical.trim() === '' ? 0 : Number(practical);

          if (!Number.isFinite(theoryValue)) {
            issues.push({ level: 'ERROR', message: `"${theory}" is not a number or a valid code` });
          } else if (theoryValue < 0) {
            issues.push({ level: 'ERROR', message: 'Negative marks are not allowed' });
          } else if (theoryValue > theoryMax) {
            issues.push({ level: 'ERROR', message: `Theory ${theoryValue} exceeds the maximum of ${theoryMax}` });
          }

          if (hasPractical && !Number.isFinite(practicalValue)) {
            issues.push({ level: 'ERROR', message: `Practical "${practical}" is not a number` });
          } else if (hasPractical && practicalValue > examSubject.practicalMarks) {
            issues.push({
              level: 'ERROR',
              message: `Practical ${practicalValue} exceeds the maximum of ${examSubject.practicalMarks}`,
            });
          }

          if (Number.isFinite(theoryValue) && Number.isFinite(practicalValue)) {
            total = round(theoryValue + (hasPractical ? practicalValue : 0), 2);
            if (total > examSubject.maxMarks) {
              issues.push({
                level: 'ERROR',
                message: `Total ${total} exceeds the paper maximum of ${examSubject.maxMarks}`,
              });
            }
          }
        }
      }

      return {
        rowNumber: index + 2,
        rollNumber,
        studentName: student?.fullName ?? studentName,
        studentId: student?.id ?? null,
        theory,
        practical,
        total,
        special,
        issues,
        importable: !issues.some((i) => i.level === 'ERROR'),
      };
    });

    return ok(
      {
        fileName: file.name,
        subjectName: `${examSubject.subject.name} (${examSubject.subject.code})`,
        maxMarks: examSubject.maxMarks,
        rows: parsed,
        summary: {
          total: parsed.length,
          importable: parsed.filter((r) => r.importable).length,
          errors: parsed.filter((r) => !r.importable).length,
          matched: parsed.filter((r) => r.studentId).length,
        },
      },
      `${parsed.filter((r) => r.importable).length} of ${parsed.length} row(s) are ready to import.`,
    );
  });
}

export async function commitMarksImportAction(input: {
  fileName: string;
  examSubjectId: string;
  rows: MarksImportRow[];
}): Promise<ActionResult<{ imported: number }>> {
  return runAction(async () => {
    const user = await requirePermission('marks.import');

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: input.examSubjectId },
      include: { exam: true, subject: { select: { name: true, code: true } } },
    });
    if (!examSubject) throw new BusinessRuleError('That subject no longer exists.');
    if (examSubject.exam.resultLocked) {
      throw new BusinessRuleError('Results are locked; marks cannot be imported.');
    }

    const importable = input.rows.filter((row) => row.importable && row.studentId);
    if (importable.length === 0) throw new BusinessRuleError('There are no valid rows to import.');

    const hasPractical = examSubject.practicalMarks > 0;

    const batch = await prisma.importBatch.create({
      data: {
        type: 'MARKS',
        fileName: input.fileName,
        totalRows: input.rows.length,
        status: 'VALIDATED',
        createdById: user.id,
      },
    });

    await prisma.$transaction(
      async (tx) => {
        for (const row of importable) {
          const theoryValue = row.special ? null : row.theory.trim() === '' ? 0 : Number(row.theory);
          const practicalValue =
            row.special || !hasPractical ? null : row.practical.trim() === '' ? 0 : Number(row.practical);

          await tx.mark.upsert({
            where: {
              examSubjectId_studentId: {
                examSubjectId: input.examSubjectId,
                studentId: row.studentId!,
              },
            },
            update: {
              theoryMarks: theoryValue,
              practicalMarks: practicalValue,
              obtainedMarks: row.special ? null : row.total,
              specialStatus: row.special ?? 'NONE',
              updatedById: user.id,
            },
            create: {
              examId: examSubject.examId,
              examSubjectId: input.examSubjectId,
              studentId: row.studentId!,
              theoryMarks: theoryValue,
              practicalMarks: practicalValue,
              obtainedMarks: row.special ? null : row.total,
              specialStatus: row.special ?? 'NONE',
              enteredById: user.id,
              updatedById: user.id,
            },
          });
        }

        if (['DRAFT', 'SCHEDULED', 'IN_PROGRESS'].includes(examSubject.exam.status)) {
          await tx.exam.update({
            where: { id: examSubject.examId },
            data: { status: 'MARKS_ENTRY' },
          });
        }

        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            importedRows: importable.length,
            failedRows: input.rows.length - importable.length,
            status: 'COMPLETED',
            logText: `Imported into ${examSubject.subject.name} for ${examSubject.exam.name}`,
          },
        });
      },
      { timeout: 180_000 },
    );

    await recordAudit({
      action: AUDIT_ACTIONS.MARKS_IMPORTED,
      entityType: 'ExamSubject',
      entityId: input.examSubjectId,
      description: `Imported ${importable.length} mark(s) for ${examSubject.subject.name} (${examSubject.subject.code}) from "${input.fileName}"`,
      severity: 'WARNING',
    });

    revalidatePath('/marks/entry');
    return ok({ imported: importable.length }, `${importable.length} mark(s) imported.`);
  });
}
