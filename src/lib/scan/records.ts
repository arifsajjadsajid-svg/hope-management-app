import { checkStudentRow, EMAIL_PATTERN, normaliseDate, normaliseGender, type StudentFields } from '../import-rules';
import { normalisePhone } from '../phone';
import type { RowIssue } from './marks';
import type { AdmissionFormReading, StudentListReading } from './schemas';

/**
 * Reviewing scanned student registers and admission forms. Pure, and run in
 * the browser while the office corrects the readings and again on the server
 * when they save, exactly as for marks.
 */

type ReviewRow<F> = {
  key: string;
  source: number;
  include: boolean;
  fields: F;
  unclear: string[];
  note: string;
};

export type RowReview = {
  issues: Record<string, RowIssue[]>;
  ready: string[];
  summary: { rows: number; included: number; blocked: number; toCheck: number; ready: number };
};

function tally<F>(rows: ReviewRow<F>[], issues: Record<string, RowIssue[]>): RowReview {
  const ready: string[] = [];
  let blocked = 0;
  let toCheck = 0;
  for (const row of rows) {
    if (!row.include) continue;
    const list = issues[row.key] ?? [];
    if (list.some((i) => i.level === 'ERROR')) blocked += 1;
    else if (list.some((i) => i.level === 'CHECK')) toCheck += 1;
    else ready.push(row.key);
  }
  return {
    issues,
    ready,
    summary: {
      rows: rows.length,
      included: rows.filter((r) => r.include).length,
      blocked,
      toCheck,
      ready: ready.length,
    },
  };
}

function uncertain(row: { unclear: string[] }, labels: Record<string, string>): RowIssue[] {
  return row.unclear.map((field) => ({
    level: 'CHECK' as const,
    field,
    message: `The ${labels[field] ?? field} was hard to read. Check it against the paper.`,
  }));
}

/* ------------------------------------------------------------- students */

export type StudentScanRow = ReviewRow<StudentFields>;

export const STUDENT_LABELS: Record<string, string> = {
  admissionNumber: 'admission number',
  registrationNo: 'registration number',
  fullName: 'student name',
  fatherName: 'father name',
  motherName: 'mother name',
  dateOfBirth: 'date of birth',
  gender: 'gender',
  bformCnic: 'B-form / CNIC',
  parentPhone: 'parent phone',
  studentPhone: 'student phone',
  whatsappNumber: 'WhatsApp number',
  email: 'email',
  address: 'address',
  previousSchool: 'previous school',
  classRollNumber: 'class roll number',
};

export function studentRowsFromPages(pages: { source: number; reading: StudentListReading }[]): StudentScanRow[] {
  return pages.flatMap(({ source, reading }) =>
    reading.rows.map((row, index) => ({
      key: `p${source}-r${index}`,
      source,
      include: true,
      fields: {
        admissionNumber: row.admissionNumber?.trim() ?? '',
        registrationNo: row.registrationNo?.trim() ?? '',
        fullName: row.fullName?.trim() ?? '',
        fatherName: row.fatherName?.trim() ?? '',
        motherName: row.motherName?.trim() ?? '',
        guardianName: '',
        dateOfBirth: row.dateOfBirth?.trim() ?? '',
        gender: row.gender?.trim() ?? '',
        bformCnic: row.bformCnic?.trim() ?? '',
        parentPhone: row.parentPhone?.trim() ?? '',
        studentPhone: row.studentPhone?.trim() ?? '',
        whatsappNumber: row.whatsappNumber?.trim() ?? '',
        email: row.email?.trim() ?? '',
        address: row.address?.trim() ?? '',
        previousSchool: row.previousSchool?.trim() ?? '',
        emergencyContact: '',
        classRollNumber: row.classRollNumber?.trim() ?? '',
        status: '',
      },
      unclear: row.unclear.filter((field) => field in STUDENT_LABELS),
      note: row.note?.trim() ?? '',
    })),
  );
}

export function reviewStudents(
  rows: StudentScanRow[],
  context: { existingAdmissions: string[]; existingRegistrations: string[] },
): RowReview & { cleaned: Record<string, StudentFields> } {
  const checkContext = {
    existingAdmissions: new Set(context.existingAdmissions),
    existingRegistrations: new Set(context.existingRegistrations),
  };
  const seen = new Set<string>();
  const issues: Record<string, RowIssue[]> = {};
  const cleaned: Record<string, StudentFields> = {};

  for (const row of rows) {
    if (!row.include) {
      issues[row.key] = [];
      continue;
    }
    const checked = checkStudentRow(row.fields, checkContext, seen);
    cleaned[row.key] = checked.fields;
    issues[row.key] = [...checked.issues, ...uncertain(row, STUDENT_LABELS)];
  }

  return { ...tally(rows, issues), cleaned };
}

/**
 * Fills blank admission numbers in order from a starting number: "HSA-0141"
 * gives HSA-0141, HSA-0142, … skipping any already taken.
 */
export function numberBlankAdmissions(
  rows: StudentScanRow[],
  start: string,
  taken: string[],
): StudentScanRow[] | null {
  const match = start.trim().match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const [, prefix, digits] = match;
  const used = new Set([...taken, ...rows.map((r) => r.fields.admissionNumber.toLowerCase()).filter(Boolean)]);

  let next = Number(digits);
  return rows.map((row) => {
    if (!row.include || row.fields.admissionNumber.trim()) return row;
    let candidate: string;
    do {
      candidate = `${prefix}${String(next).padStart(digits!.length, '0')}`;
      next += 1;
    } while (used.has(candidate.toLowerCase()));
    used.add(candidate.toLowerCase());
    return {
      ...row,
      fields: { ...row.fields, admissionNumber: candidate },
      unclear: row.unclear.filter((f) => f !== 'admissionNumber'),
    };
  });
}

/* ------------------------------------------------------------ enquiries */

export type EnquiryFields = {
  studentName: string;
  fatherName: string;
  dateOfBirth: string;
  gender: string;
  classApplyingFor: string;
  previousSchool: string;
  contactPhone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  notes: string;
};

export type EnquiryScanRow = ReviewRow<EnquiryFields>;

export const ENQUIRY_LABELS: Record<string, string> = {
  studentName: "child's name",
  fatherName: 'father name',
  dateOfBirth: 'date of birth',
  gender: 'gender',
  classApplyingFor: 'class applied for',
  previousSchool: 'previous school',
  contactPhone: 'contact number',
  whatsappNumber: 'WhatsApp number',
  email: 'email',
  address: 'address',
  notes: 'notes',
};

const ENQUIRY_LIMITS: Partial<Record<keyof EnquiryFields, number>> = {
  studentName: 120,
  fatherName: 120,
  classApplyingFor: 60,
  previousSchool: 160,
  address: 300,
  notes: 1000,
};

export function enquiryRowsFromPages(pages: { source: number; reading: AdmissionFormReading }[]): EnquiryScanRow[] {
  return pages.flatMap(({ source, reading }) =>
    reading.forms.map((form, index) => ({
      key: `p${source}-f${index}`,
      source,
      include: true,
      fields: {
        studentName: form.studentName?.trim() ?? '',
        fatherName: form.fatherName?.trim() ?? '',
        dateOfBirth: form.dateOfBirth?.trim() ?? '',
        gender: form.gender?.trim() ?? '',
        classApplyingFor: form.classApplyingFor?.trim() ?? '',
        previousSchool: form.previousSchool?.trim() ?? '',
        contactPhone: form.contactPhone?.trim() ?? '',
        whatsappNumber: form.whatsappNumber?.trim() ?? '',
        email: form.email?.trim() ?? '',
        address: form.address?.trim() ?? '',
        notes: form.notes?.trim() ?? '',
      },
      unclear: form.unclear.filter((field) => field in ENQUIRY_LABELS),
      note: form.note?.trim() ?? '',
    })),
  );
}

export type CleanEnquiry = {
  studentName: string;
  fatherName: string;
  dateOfBirth: string;
  gender: string;
  classApplyingFor: string;
  previousSchool: string;
  contactPhone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  notes: string;
};

export function reviewEnquiries(
  rows: EnquiryScanRow[],
  context: { recent: { name: string; dialNumber: string; reference: string }[] },
): RowReview & { cleaned: Record<string, CleanEnquiry> } {
  const issues: Record<string, RowIssue[]> = {};
  const cleaned: Record<string, CleanEnquiry> = {};
  const seen = new Set<string>();

  for (const row of rows) {
    const list: RowIssue[] = [];
    issues[row.key] = list;
    if (!row.include) continue;

    const f = row.fields;
    if (f.studentName.trim().length < 2) list.push({ level: 'ERROR', field: 'studentName', message: "The child's name is missing." });
    if (f.fatherName.trim().length < 2) list.push({ level: 'ERROR', field: 'fatherName', message: "The father's or guardian's name is missing." });
    if (!f.classApplyingFor.trim()) list.push({ level: 'ERROR', field: 'classApplyingFor', message: 'The class applied for is missing.' });

    for (const [field, limit] of Object.entries(ENQUIRY_LIMITS) as [keyof EnquiryFields, number][]) {
      if (f[field].trim().length > limit) {
        list.push({ level: 'ERROR', field, message: `The ${ENQUIRY_LABELS[field]} is longer than ${limit} characters.` });
      }
    }

    const phone = normalisePhone(f.contactPhone);
    if (!f.contactPhone.trim()) {
      list.push({ level: 'ERROR', field: 'contactPhone', message: 'A contact number is required.' });
    } else if (!phone.ok) {
      list.push({ level: 'ERROR', field: 'contactPhone', message: `Contact number: ${phone.reason}.` });
    }

    if (f.whatsappNumber.trim() && !normalisePhone(f.whatsappNumber).ok) {
      list.push({ level: 'ERROR', field: 'whatsappNumber', message: 'The WhatsApp number does not look right.' });
    }

    const email = f.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      list.push({ level: 'WARNING', field: 'email', message: 'The email looks invalid and will be left blank.' });
    }

    const dateOfBirth = normaliseDate(f.dateOfBirth);
    if (f.dateOfBirth.trim() && !dateOfBirth) {
      list.push({ level: 'WARNING', field: 'dateOfBirth', message: 'The date of birth could not be read and will be left blank.' });
    }

    const gender = normaliseGender(f.gender);
    if (!gender) list.push({ level: 'WARNING', field: 'gender', message: 'Gender missing or unrecognised — defaults to Male.' });

    if (phone.ok && f.studentName.trim()) {
      const identity = `${f.studentName.trim().toLowerCase()}|${phone.dialNumber}`;
      if (seen.has(identity)) {
        list.push({ level: 'ERROR', message: 'The same child and number appear on another form in this upload.' });
      }
      seen.add(identity);

      const earlier = context.recent.find(
        (e) => e.dialNumber === phone.dialNumber && e.name === f.studentName.trim().toLowerCase(),
      );
      if (earlier) {
        list.push({ level: 'WARNING', message: `This family already has enquiry ${earlier.reference} for this child.` });
      }
    }

    list.push(...uncertain(row, ENQUIRY_LABELS));

    cleaned[row.key] = {
      studentName: f.studentName.trim(),
      fatherName: f.fatherName.trim(),
      dateOfBirth,
      gender: gender === 'MALE' || gender === 'FEMALE' || gender === 'OTHER' ? gender : 'MALE',
      classApplyingFor: f.classApplyingFor.trim(),
      previousSchool: f.previousSchool.trim(),
      contactPhone: f.contactPhone.trim(),
      whatsappNumber: f.whatsappNumber.trim(),
      email: email && EMAIL_PATTERN.test(email) ? email : '',
      address: f.address.trim(),
      notes: f.notes.trim(),
    };
  }

  return { ...tally(rows, issues), cleaned };
}
