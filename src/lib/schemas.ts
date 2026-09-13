import { z } from 'zod';
import {
  STUDENT_STATUS,
  GENDERS,
  SUBJECT_TYPES,
  EXAM_TYPES,
  ROLL_METHODS,
  RANKING_METHODS,
  ATTENDANCE_STATUS,
  MARK_SPECIAL_TOKENS,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  CERTIFICATE_TYPES,
  PROMOTION_ACTIONS,
  USER_STATUS,
} from './constants';

/* ------------------------------------------------------------- helpers */

/** Trims a string and converts "" to undefined so optional fields stay clean. */
const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

const requiredText = (label: string, max = 255) =>
  z.string().trim().min(1, `${label} is required`).max(max, `Must be ${max} characters or fewer`);

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T12:00:00`) : undefined))
  .refine((v) => v === undefined || !Number.isNaN(v.getTime()), 'Enter a valid date');

const requiredDate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((v) => new Date(`${v}T12:00:00`))
    .refine((v) => !Number.isNaN(v.getTime()), 'Enter a valid date');

const phone = optionalText(30).refine(
  (v) => v === undefined || /^[0-9+\-\s()]{7,30}$/.test(v),
  'Enter a valid phone number',
);

const nonNegative = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).min(0, `${label} cannot be negative`);

const positiveInt = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).int().min(1, `${label} must be at least 1`);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/* -------------------------------------------------------------- students */

export const studentSchema = z.object({
  admissionNumber: requiredText('Admission number', 40),
  registrationNo: optionalText(40),
  fullName: requiredText('Student name', 120),
  fatherName: requiredText('Father name', 120),
  motherName: optionalText(120),
  guardianName: optionalText(120),
  dateOfBirth: optionalDate,
  gender: z.enum(GENDERS),
  bformCnic: optionalText(25),
  admissionDate: optionalDate,
  parentPhone: phone,
  studentPhone: phone,
  whatsappNumber: phone,
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || z.string().email().safeParse(v).success, 'Enter a valid email'),
  address: optionalText(400),
  previousSchool: optionalText(160),
  emergencyContact: phone,
  notes: optionalText(1000),
  status: z.enum(STUDENT_STATUS),
  // Enrolment (current session)
  sessionId: requiredText('Academic session'),
  classId: requiredText('Class'),
  sectionId: requiredText('Section'),
  classRollNumber: optionalText(20),
});

export type StudentInput = z.infer<typeof studentSchema>;

export const studentFilterSchema = z.object({
  q: z.string().trim().optional(),
  classId: z.string().trim().optional(),
  sectionId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

/* ------------------------------------------------------------- academics */

export const sessionSchema = z
  .object({
    name: requiredText('Session name', 40),
    startDate: requiredDate('Start date'),
    endDate: requiredDate('End date'),
    isCurrent: z.coerce.boolean().default(false),
    isClosed: z.coerce.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'The end date must fall after the start date',
    path: ['endDate'],
  });

export const classSchema = z.object({
  sessionId: requiredText('Academic session'),
  name: requiredText('Class name', 60),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const sectionSchema = z.object({
  classId: requiredText('Class'),
  name: requiredText('Section name', 30),
  maxStrength: positiveInt('Maximum strength').max(500),
  classTeacherId: optionalText(40),
  isActive: z.coerce.boolean().default(true),
});

export const subjectSchema = z
  .object({
    classId: requiredText('Class'),
    name: requiredText('Subject name', 80),
    code: requiredText('Subject code', 20),
    type: z.enum(SUBJECT_TYPES),
    maxMarks: nonNegative('Maximum marks').max(2000),
    passingMarks: nonNegative('Passing marks').max(2000),
    theoryMarks: nonNegative('Theory marks').max(2000),
    practicalMarks: nonNegative('Practical marks').max(2000),
    practicalPassing: nonNegative('Practical passing marks').max(2000),
    teacherId: optionalText(40),
    displayOrder: z.coerce.number().int().min(0).max(999).default(0),
    isActive: z.coerce.boolean().default(true),
  })
  .refine((v) => v.passingMarks <= v.maxMarks, {
    message: 'Passing marks cannot exceed the maximum marks',
    path: ['passingMarks'],
  })
  .refine((v) => v.theoryMarks + v.practicalMarks === v.maxMarks, {
    message: 'Theory marks plus practical marks must equal the maximum marks',
    path: ['theoryMarks'],
  })
  .refine((v) => v.practicalPassing <= v.practicalMarks, {
    message: 'Practical passing marks cannot exceed the practical marks',
    path: ['practicalPassing'],
  });

export const teacherSchema = z.object({
  employeeCode: requiredText('Employee code', 30),
  fullName: requiredText('Teacher name', 120),
  fatherName: optionalText(120),
  cnic: optionalText(25),
  gender: z.enum(GENDERS).optional(),
  designation: optionalText(80),
  qualification: optionalText(120),
  phone,
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || z.string().email().safeParse(v).success, 'Enter a valid email'),
  address: optionalText(300),
  joiningDate: optionalDate,
  isActive: z.coerce.boolean().default(true),
});

/* ----------------------------------------------------------- examinations */

export const examSchema = z
  .object({
    name: requiredText('Examination name', 140),
    type: z.enum(EXAM_TYPES),
    sessionId: requiredText('Academic session'),
    startDate: requiredDate('Start date'),
    endDate: requiredDate('End date'),
    resultPublishDate: optionalDate,
    instructions: optionalText(2000),
    examCenter: optionalText(200),
    gradingSchemeId: optionalText(40),
    resultPolicyId: optionalText(40),
    rollNumberPrefix: optionalText(20),
    rollNumberMethod: z.enum(ROLL_METHODS),
    rollNumberStart: z.coerce.number().int().min(1).max(999999).default(1),
    rollNumberPadding: z.coerce.number().int().min(1).max(8).default(3),
    classIds: z.array(z.string().trim().min(1)).min(1, 'Select at least one class'),
    sectionIds: z.array(z.string().trim().min(1)).default([]),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'The end date cannot fall before the start date',
    path: ['endDate'],
  });

export const examSubjectSchema = z
  .object({
    examSubjectId: z.string().trim().min(1),
    isIncluded: z.coerce.boolean().default(true),
    maxMarks: nonNegative('Maximum marks').max(2000),
    passingMarks: nonNegative('Passing marks').max(2000),
    theoryMarks: nonNegative('Theory marks').max(2000),
    practicalMarks: nonNegative('Practical marks').max(2000),
    practicalPassing: nonNegative('Practical passing marks').max(2000),
  })
  .refine((v) => v.passingMarks <= v.maxMarks, {
    message: 'Passing marks cannot exceed the maximum marks',
    path: ['passingMarks'],
  })
  .refine((v) => v.theoryMarks + v.practicalMarks === v.maxMarks, {
    message: 'Theory plus practical must equal the maximum marks',
    path: ['theoryMarks'],
  });

export const dateSheetEntrySchema = z
  .object({
    id: optionalText(40),
    examId: requiredText('Examination'),
    examSubjectId: requiredText('Subject'),
    classId: requiredText('Class'),
    sectionId: optionalText(40),
    paperDate: requiredDate('Paper date'),
    startTime: z.string().trim().regex(HHMM, 'Use 24-hour time, e.g. 09:00'),
    endTime: z.string().trim().regex(HHMM, 'Use 24-hour time, e.g. 12:00'),
    roomId: optionalText(40),
    instructions: optionalText(600),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

export const roomSchema = z.object({
  name: requiredText('Room name', 80),
  roomNumber: requiredText('Room number', 30),
  building: optionalText(80),
  capacity: positiveInt('Capacity').max(1000),
  rowCount: positiveInt('Rows').max(60),
  colCount: positiveInt('Columns').max(60),
  isActive: z.coerce.boolean().default(true),
});

export const seatingSchema = z.object({
  examId: requiredText('Examination'),
  roomIds: z.array(z.string().trim().min(1)).min(1, 'Select at least one room'),
  strategy: z.enum(['SEQUENTIAL', 'ALTERNATE']),
  mixBy: z.enum(['CLASS', 'SECTION']),
});

export const invigilationSchema = z.object({
  examId: requiredText('Examination'),
  dateSheetEntryId: requiredText('Paper'),
  roomId: requiredText('Room'),
  teacherId: requiredText('Teacher'),
  dutyRole: z.enum(['INVIGILATOR', 'RELIEVER', 'SUPERINTENDENT']).default('INVIGILATOR'),
});

export const attendanceRowSchema = z.object({
  studentId: z.string().trim().min(1),
  status: z.enum(ATTENDANCE_STATUS),
  remarks: optionalText(200),
});

/* ----------------------------------------------------------------- marks */

/**
 * One cell of the marks grid. Numeric fields arrive as strings from the form and
 * may also carry a special token (ABS / EX / MED / WH).
 */
export const markRowSchema = z.object({
  studentId: z.string().trim().min(1),
  examSubjectId: z.string().trim().min(1),
  theory: z.string().trim().optional(),
  practical: z.string().trim().optional(),
  specialStatus: z.enum(['NONE', ...MARK_SPECIAL_TOKENS]).default('NONE'),
  remarks: optionalText(200),
});

export const marksBatchSchema = z.object({
  examId: requiredText('Examination'),
  examSubjectId: requiredText('Subject'),
  sectionId: optionalText(40),
  finalize: z.coerce.boolean().default(false),
  rows: z.array(markRowSchema).max(2000),
});

/* --------------------------------------------------------------- grading */

export const gradeBandSchema = z
  .object({
    grade: requiredText('Grade', 6),
    minPercent: nonNegative('Minimum percent').max(100),
    maxPercent: nonNegative('Maximum percent').max(100),
    gpa: nonNegative('GPA').max(10),
    remarks: optionalText(120),
    isFail: z.coerce.boolean().default(false),
  })
  .refine((v) => v.maxPercent >= v.minPercent, {
    message: 'The maximum must be greater than or equal to the minimum',
    path: ['maxPercent'],
  });

export const gradingSchemeSchema = z.object({
  id: optionalText(40),
  name: requiredText('Scheme name', 80),
  description: optionalText(300),
  useGpa: z.coerce.boolean().default(false),
  isDefault: z.coerce.boolean().default(false),
  bands: z.array(gradeBandSchema).min(1, 'Add at least one grade band'),
});

export const resultPolicySchema = z.object({
  id: optionalText(40),
  name: requiredText('Policy name', 80),
  description: optionalText(300),
  overallPassPercent: nonNegative('Overall passing percentage').max(100),
  requireSubjectPass: z.coerce.boolean().default(true),
  requirePracticalPass: z.coerce.boolean().default(true),
  compulsoryMustPass: z.coerce.boolean().default(true),
  graceMarksMax: nonNegative('Grace marks').max(100),
  graceMaxSubjects: z.coerce.number().int().min(0).max(20).default(0),
  compartmentEnabled: z.coerce.boolean().default(true),
  compartmentMaxSubjects: z.coerce.number().int().min(0).max(20).default(1),
  absentCountsAsZero: z.coerce.boolean().default(true),
  absentFailsResult: z.coerce.boolean().default(true),
  rankingMethod: z.enum(RANKING_METHODS),
  promotionPercent: nonNegative('Promotion percentage').max(100),
  includeOptionalInTotal: z.coerce.boolean().default(false),
  isDefault: z.coerce.boolean().default(false),
});

/* -------------------------------------------------------------- settings */

export const academySettingsSchema = z.object({
  name: requiredText('Academy name', 140),
  shortName: requiredText('Short name', 20),
  tagline: requiredText('Tagline', 140),
  address: requiredText('Address', 240),
  phone1: requiredText('Primary phone', 30),
  phone2: optionalText(30),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || z.string().email().safeParse(v).success, 'Enter a valid email'),
  website: optionalText(160),
  directorName: optionalText(120),
  principalName: optionalText(120),
  examControllerName: optionalText(120),
  footerMessage: requiredText('Footer message', 400),
  currentSessionId: optionalText(40),
  defaultGradingId: optionalText(40),
  defaultPolicyId: optionalText(40),
  resultPortalEnabled: z.coerce.boolean().default(true),
});

/* ------------------------------------------------------------------ users */

export const userSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(60)
    .regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, digits, dot, underscore or hyphen only'),
  fullName: requiredText('Full name', 120),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || z.string().email().safeParse(v).success, 'Enter a valid email'),
  phone,
  roleId: requiredText('Role'),
  status: z.enum(USER_STATUS),
  studentId: optionalText(40),
  teacherId: optionalText(40),
  mustChangePassword: z.coerce.boolean().default(true),
});

export const newUserSchema = userSchema.extend({
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

/* ---------------------------------------------------------- notifications */

export const notificationSchema = z.object({
  title: requiredText('Title', 160),
  message: requiredText('Message', 2000),
  type: z.enum(NOTIFICATION_TYPES),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1, 'Select at least one channel'),
  audience: z.enum(['ALL', 'ROLE', 'CLASS', 'SECTION', 'STUDENT']),
  audienceRef: optionalText(40),
  link: optionalText(200),
});

/* ----------------------------------------------------------- certificates */

export const certificateSchema = z.object({
  studentId: requiredText('Student'),
  examId: optionalText(40),
  type: z.enum(CERTIFICATE_TYPES),
  title: requiredText('Certificate title', 160),
  description: optionalText(600),
  issuedDate: requiredDate('Issue date'),
});

/* ------------------------------------------------------------- promotion */

export const promotionSchema = z.object({
  fromSessionId: requiredText('Current session'),
  toSessionId: requiredText('Next session'),
  fromClassId: requiredText('Current class'),
  toClassId: optionalText(40),
  toSectionId: optionalText(40),
  action: z.enum(PROMOTION_ACTIONS),
  studentIds: z.array(z.string().trim().min(1)).min(1, 'Select at least one student'),
  remarks: optionalText(300),
});

/* --------------------------------------------------- result workflow */

export const workflowSchema = z.object({
  examId: requiredText('Examination'),
  action: z.enum([
    'PROCESS',
    'SUBMIT_APPROVAL',
    'APPROVE',
    'PUBLISH',
    'UNPUBLISH',
    'LOCK',
    'UNLOCK',
    'ARCHIVE',
  ]),
  reason: optionalText(500),
  password: optionalText(200),
});
