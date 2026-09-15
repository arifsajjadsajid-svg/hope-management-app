import * as z from 'zod/v4';

/**
 * What the reading service returns for each scanned page. These shapes are
 * sent to the model as a strict output schema, so every field is always
 * present: a value the page does not show comes back as null, never omitted.
 */

export const SCAN_KINDS = ['marks', 'students', 'admissions'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];

const pageAssessment = {
  documentKind: z
    .enum(['MARKS_SHEET', 'STUDENT_LIST', 'ADMISSION_FORM', 'OTHER'])
    .describe('What this page actually is, whatever the office said it would be.'),
  legibility: z.enum(['GOOD', 'PARTLY_UNCLEAR', 'UNREADABLE']),
  problem: z
    .string()
    .nullable()
    .describe(
      'One plain sentence for the school office if something stops a full reading — blurred, cut off, upside down, wrong document. Null when there is none.',
    ),
};

/** Field names, or column keys, whose reading is uncertain and needs a person to check. */
const unclear = z
  .array(z.string())
  .describe('Names of the fields (or column keys) on this entry whose reading is uncertain.');

const note = z
  .string()
  .nullable()
  .describe('A short remark about this entry for the office, e.g. "marks overwritten in pen". Null when there is none.');

export const marksSheetSchema = z.object({
  ...pageAssessment,
  columns: z
    .array(
      z.object({
        key: z.string().describe('A short id for the column, "c1", "c2", …'),
        heading: z.string().describe('The column heading as written on the page.'),
        subjectCode: z
          .string()
          .nullable()
          .describe('The code of the listed subject this column holds marks for, or null.'),
        part: z
          .enum(['MARKS', 'THEORY', 'PRACTICAL', 'GRAND_TOTAL', 'OTHER'])
          .describe(
            'MARKS for a whole paper, THEORY or PRACTICAL for one part of a paper, GRAND_TOTAL for the sum across subjects, OTHER for anything else (percentage, grade, position, remarks).',
          ),
      }),
    )
    .describe('Every column that holds marks or totals, in page order. Not the roll number or name columns.'),
  rows: z.array(
    z.object({
      rollNumber: z.string().nullable(),
      studentName: z.string().nullable(),
      fatherName: z.string().nullable(),
      cells: z.array(
        z.object({
          column: z.string().describe('The key of the column.'),
          value: z.string().describe('Exactly what is written: a number, or ABS, EX, MED or WH. Empty when blank.'),
        }),
      ),
      unclear,
      note,
    }),
  ),
});

const studentFields = {
  admissionNumber: z.string().nullable(),
  registrationNo: z.string().nullable(),
  fullName: z.string().nullable(),
  fatherName: z.string().nullable(),
  motherName: z.string().nullable(),
  dateOfBirth: z.string().nullable().describe('yyyy-mm-dd when the whole date is clear, otherwise as written.'),
  gender: z.string().nullable(),
  bformCnic: z.string().nullable(),
  parentPhone: z.string().nullable(),
  studentPhone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  previousSchool: z.string().nullable(),
  classRollNumber: z.string().nullable(),
};

export const studentListSchema = z.object({
  ...pageAssessment,
  rows: z.array(z.object({ ...studentFields, unclear, note })),
});

export const admissionFormSchema = z.object({
  ...pageAssessment,
  forms: z.array(
    z.object({
      studentName: z.string().nullable(),
      fatherName: z.string().nullable(),
      dateOfBirth: z.string().nullable().describe('yyyy-mm-dd when the whole date is clear, otherwise as written.'),
      gender: z.string().nullable(),
      classApplyingFor: z.string().nullable(),
      previousSchool: z.string().nullable(),
      contactPhone: z.string().nullable(),
      whatsappNumber: z.string().nullable(),
      email: z.string().nullable(),
      address: z.string().nullable(),
      notes: z.string().nullable().describe('Anything else the family wrote that the office should see.'),
      unclear,
      note,
    }),
  ),
});

export type MarksSheetReading = z.infer<typeof marksSheetSchema>;
export type StudentListReading = z.infer<typeof studentListSchema>;
export type AdmissionFormReading = z.infer<typeof admissionFormSchema>;

export type ScanReading =
  | { kind: 'marks'; reading: MarksSheetReading }
  | { kind: 'students'; reading: StudentListReading }
  | { kind: 'admissions'; reading: AdmissionFormReading };
