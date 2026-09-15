import 'server-only';

import { prisma } from '@/lib/prisma';
import type { StudentFields } from '@/lib/import-rules';
import { BusinessRuleError } from '../action-result';

/**
 * Creates students in bulk and enrols them in one section. Shared by the
 * spreadsheet import and the scanned-register import, so both apply the same
 * capacity check, duplicate re-check and roll numbering.
 *
 * Rows must already have passed `checkStudentRow`.
 */
export async function createStudentsInSection(input: {
  userId: string;
  batchType: string;
  fileName: string;
  totalRows: number;
  sessionId: string;
  classId: string;
  sectionId: string;
  rows: StudentFields[];
}): Promise<{ imported: number; batchId: string; sectionLabel: string }> {
  const { rows } = input;
  if (rows.length === 0) throw new BusinessRuleError('There are no valid rows to import.');

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
  const sectionLabel = `${section.schoolClass.name} — ${section.name}`;

  const occupied = await prisma.enrollment.count({
    where: { sectionId: input.sectionId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
  });
  if (occupied + rows.length > section.maxStrength) {
    throw new BusinessRuleError(
      `Importing ${rows.length} student(s) would put ${occupied + rows.length} in a section with a maximum strength of ${section.maxStrength}.`,
    );
  }

  // Re-check duplicates at commit time in case another operator added a student.
  const clashes = await prisma.student.findMany({
    where: { admissionNumber: { in: rows.map((r) => r.admissionNumber) } },
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
      type: input.batchType,
      fileName: input.fileName,
      totalRows: input.totalRows,
      status: 'VALIDATED',
      createdById: input.userId,
    },
  });

  let imported = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
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
          failedRows: input.totalRows - imported,
          status: 'COMPLETED',
          logText: `Imported into ${sectionLabel}`,
        },
      });
    },
    { timeout: 180_000 },
  );

  return { imported, batchId: batch.id, sectionLabel };
}
