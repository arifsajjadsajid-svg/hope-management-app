import { GENDERS, STUDENT_STATUS } from './constants';

/**
 * Checks for student records arriving in bulk — from a spreadsheet or from a
 * scanned register. Pure, so the review screen can show exactly the problems
 * the server will refuse on, while the operator is still correcting them.
 */

export type ImportIssue = { level: 'ERROR' | 'WARNING'; message: string };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseGender(value: string): string {
  const text = value.trim().toUpperCase();
  if (['M', 'MALE', 'BOY'].includes(text)) return 'MALE';
  if (['F', 'FEMALE', 'GIRL'].includes(text)) return 'FEMALE';
  if (GENDERS.includes(text as (typeof GENDERS)[number])) return text;
  return '';
}

/** Returns yyyy-mm-dd, or '' when the date cannot be read. */
export function normaliseDate(value: string): string {
  const text = value.trim();
  if (!text) return '';

  // dd/mm/yyyy, dd-mm-yyyy and dd.mm.yyyy are the common local formats.
  const local = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (local) {
    const [, d, m, y] = local;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // Anything else ("12 March 2010"): read it as a calendar date where it was
  // written, so a browser east of Greenwich does not move it back a day.
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

export type StudentFields = {
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
};

export const STUDENT_FIELD_KEYS: (keyof StudentFields)[] = [
  'admissionNumber',
  'registrationNo',
  'fullName',
  'fatherName',
  'motherName',
  'guardianName',
  'dateOfBirth',
  'gender',
  'bformCnic',
  'parentPhone',
  'studentPhone',
  'whatsappNumber',
  'email',
  'address',
  'previousSchool',
  'emergencyContact',
  'classRollNumber',
  'status',
];

export type StudentCheckContext = {
  /** Lower-cased admission numbers already in the database. */
  existingAdmissions: Set<string>;
  /** Lower-cased registration numbers already in the database. */
  existingRegistrations: Set<string>;
};

/**
 * Checks one row and returns it cleaned up for saving: gender and status
 * defaulted, the date in yyyy-mm-dd, an invalid email dropped.
 *
 * `seenAdmissions` is shared across the rows of one batch so a number used
 * twice in the same file is caught before either copy is saved.
 */
export function checkStudentRow(
  raw: StudentFields,
  context: StudentCheckContext,
  seenAdmissions: Set<string>,
): { fields: StudentFields; issues: ImportIssue[] } {
  const admissionNumber = raw.admissionNumber.trim();
  const fullName = raw.fullName.trim();
  const fatherName = raw.fatherName.trim();
  const gender = normaliseGender(raw.gender);
  const dateOfBirth = normaliseDate(raw.dateOfBirth);
  const status = raw.status.trim().toUpperCase();
  const email = raw.email.trim();
  const registrationNo = raw.registrationNo.trim();

  const issues: ImportIssue[] = [];

  if (!admissionNumber) issues.push({ level: 'ERROR', message: 'Admission number is missing' });
  if (!fullName) issues.push({ level: 'ERROR', message: 'Student name is missing' });
  if (!fatherName) issues.push({ level: 'ERROR', message: 'Father name is missing' });

  if (admissionNumber) {
    const key = admissionNumber.toLowerCase();
    if (context.existingAdmissions.has(key)) {
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

  if (registrationNo && context.existingRegistrations.has(registrationNo.toLowerCase())) {
    issues.push({ level: 'ERROR', message: `Registration number ${registrationNo} already exists` });
  }

  if (!gender) issues.push({ level: 'WARNING', message: 'Gender missing or unrecognised — defaults to Male' });
  if (raw.dateOfBirth.trim() && !dateOfBirth) {
    issues.push({ level: 'WARNING', message: 'Date of birth could not be read and will be left blank' });
  }
  const knownStatus = STUDENT_STATUS.includes(status as (typeof STUDENT_STATUS)[number]);
  if (status && !knownStatus) {
    issues.push({ level: 'WARNING', message: `Status "${status}" is unrecognised — defaults to Active` });
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    issues.push({ level: 'WARNING', message: 'Email looks invalid and will be left blank' });
  }

  const trim = (value: string) => value.trim();

  return {
    fields: {
      admissionNumber,
      registrationNo,
      fullName,
      fatherName,
      motherName: trim(raw.motherName),
      guardianName: trim(raw.guardianName),
      dateOfBirth,
      gender: gender || 'MALE',
      bformCnic: trim(raw.bformCnic),
      parentPhone: trim(raw.parentPhone),
      studentPhone: trim(raw.studentPhone),
      whatsappNumber: trim(raw.whatsappNumber),
      email: email && EMAIL_PATTERN.test(email) ? email : '',
      address: trim(raw.address),
      previousSchool: trim(raw.previousSchool),
      emergencyContact: trim(raw.emergencyContact),
      classRollNumber: trim(raw.classRollNumber),
      status: knownStatus ? status : 'ACTIVE',
    },
    issues,
  };
}
