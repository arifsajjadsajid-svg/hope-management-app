/**
 * Central domain vocabulary.
 *
 * Status / type columns are stored as plain strings so the schema works on both
 * SQLite and PostgreSQL. These constants are the single source of truth for the
 * allowed values and their human-readable labels.
 */

export const ACADEMY_DEFAULTS = {
  name: 'The Hope Science Academy',
  shortName: 'HSA',
  tagline: 'Academic & Examination Management System',
  address: '247/E-1, Johar Town, Lahore',
  phone1: '0322-4157001',
  phone2: '0300-8194789',
} as const;

/* ------------------------------------------------------------------ roles */

export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PRINCIPAL: 'PRINCIPAL',
  EXAM_CONTROLLER: 'EXAM_CONTROLLER',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;
export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  PRINCIPAL: 'Principal / Director',
  EXAM_CONTROLLER: 'Examination Controller',
  TEACHER: 'Teacher',
  STUDENT: 'Student / Parent',
};

/* ------------------------------------------------------------- user status */

export const USER_STATUS = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

/* ---------------------------------------------------------- student status */

export const STUDENT_STATUS = [
  'ACTIVE',
  'INACTIVE',
  'WITHDRAWN',
  'TRANSFERRED',
  'GRADUATED',
] as const;
export type StudentStatus = (typeof STUDENT_STATUS)[number];

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  WITHDRAWN: 'Withdrawn',
  TRANSFERRED: 'Transferred',
  GRADUATED: 'Graduated',
};

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

export const ENROLLMENT_STATUS = [
  'ACTIVE',
  'PROMOTED',
  'RETAINED',
  'TRANSFERRED',
  'GRADUATED',
  'LEFT',
] as const;

/* --------------------------------------------------------------- subjects */

export const SUBJECT_TYPES = ['COMPULSORY', 'ELECTIVE', 'PRACTICAL', 'OPTIONAL'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const SUBJECT_TYPE_LABELS: Record<string, string> = {
  COMPULSORY: 'Compulsory',
  ELECTIVE: 'Elective',
  PRACTICAL: 'Practical',
  OPTIONAL: 'Optional',
};

/* ----------------------------------------------------------- examinations */

export const EXAM_TYPES = [
  'WEEKLY_TEST',
  'MONTHLY_TEST',
  'UNIT_TEST',
  'FIRST_TERM',
  'MID_TERM',
  'SECOND_TERM',
  'SEND_UP',
  'PRE_BOARD',
  'MOCK',
  'ANNUAL',
] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const EXAM_TYPE_LABELS: Record<string, string> = {
  WEEKLY_TEST: 'Weekly Test',
  MONTHLY_TEST: 'Monthly Test',
  UNIT_TEST: 'Unit Test',
  FIRST_TERM: 'First Term',
  MID_TERM: 'Mid Term',
  SECOND_TERM: 'Second Term',
  SEND_UP: 'Send-Up Examination',
  PRE_BOARD: 'Pre-Board Examination',
  MOCK: 'Mock Examination',
  ANNUAL: 'Annual Examination',
};

export const EXAM_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  MARKS_ENTRY: 'MARKS_ENTRY',
  RESULT_PROCESSING: 'RESULT_PROCESSING',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  PUBLISHED: 'PUBLISHED',
  LOCKED: 'LOCKED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ExamStatus = (typeof EXAM_STATUS)[keyof typeof EXAM_STATUS];

export const EXAM_STATUS_ORDER: ExamStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'IN_PROGRESS',
  'MARKS_ENTRY',
  'RESULT_PROCESSING',
  'AWAITING_APPROVAL',
  'PUBLISHED',
  'LOCKED',
  'ARCHIVED',
];

export const EXAM_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  MARKS_ENTRY: 'Marks Entry Open',
  RESULT_PROCESSING: 'Result Processing',
  AWAITING_APPROVAL: 'Awaiting Approval',
  PUBLISHED: 'Published',
  LOCKED: 'Locked',
  ARCHIVED: 'Archived',
};

/** Tailwind classes used by the status badge component. */
export const EXAM_STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  SCHEDULED: 'bg-royal-50 text-royal-700 ring-royal-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 ring-amber-200',
  MARKS_ENTRY: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  RESULT_PROCESSING: 'bg-purple-50 text-purple-700 ring-purple-200',
  AWAITING_APPROVAL: 'bg-orange-50 text-orange-700 ring-orange-200',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  LOCKED: 'bg-navy-100 text-navy-800 ring-navy-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

/* ------------------------------------------------------------ roll numbers */

export const ROLL_METHODS = [
  'SEQUENTIAL',
  'CLASS_WISE',
  'SECTION_WISE',
  'EXAM_SPECIFIC',
  'MANUAL',
] as const;
export type RollMethod = (typeof ROLL_METHODS)[number];

export const ROLL_METHOD_LABELS: Record<string, string> = {
  SEQUENTIAL: 'Sequential (whole examination)',
  CLASS_WISE: 'Class-wise (restart per class)',
  SECTION_WISE: 'Section-wise (restart per section)',
  EXAM_SPECIFIC: 'Examination-specific (prefix + running number)',
  MANUAL: 'Manual entry',
};

/* ------------------------------------------------------------------ marks */

export const MARK_SPECIAL = {
  NONE: 'NONE',
  ABS: 'ABS',
  EX: 'EX',
  MED: 'MED',
  WH: 'WH',
} as const;
export type MarkSpecial = (typeof MARK_SPECIAL)[keyof typeof MARK_SPECIAL];

export const MARK_SPECIAL_LABELS: Record<string, string> = {
  NONE: 'Normal entry',
  ABS: 'Absent',
  EX: 'Exempted',
  MED: 'Medical',
  WH: 'Withheld',
};

/** Values a user may type into a marks cell instead of a number. */
export const MARK_SPECIAL_TOKENS = ['ABS', 'EX', 'MED', 'WH'] as const;

/* -------------------------------------------------------------- attendance */

export const ATTENDANCE_STATUS = ['PRESENT', 'ABSENT', 'LATE'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

/* ----------------------------------------------------------------- results */

export const RESULT_STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  COMPARTMENT: 'COMPARTMENT',
  ABSENT: 'ABSENT',
  WITHHELD: 'WITHHELD',
} as const;
export type ResultStatus = (typeof RESULT_STATUS)[keyof typeof RESULT_STATUS];

export const RESULT_STATUS_LABELS: Record<string, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  COMPARTMENT: 'Compartment',
  ABSENT: 'Absent',
  WITHHELD: 'Withheld',
};

export const RESULT_STATUS_TONE: Record<string, string> = {
  PASS: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FAIL: 'bg-rose-50 text-rose-700 ring-rose-200',
  COMPARTMENT: 'bg-amber-50 text-amber-700 ring-amber-200',
  ABSENT: 'bg-slate-100 text-slate-600 ring-slate-200',
  WITHHELD: 'bg-purple-50 text-purple-700 ring-purple-200',
};

export const PROMOTION_STATUS = ['PROMOTED', 'NOT_PROMOTED'] as const;

export const SUBJECT_RESULT_STATUS = [
  'PASS',
  'FAIL',
  'ABSENT',
  'EXEMPTED',
  'WITHHELD',
] as const;

export const RANKING_METHODS = ['COMPETITION', 'DENSE'] as const;
export const RANKING_METHOD_LABELS: Record<string, string> = {
  COMPETITION: 'Competition ranking (1, 1, 3)',
  DENSE: 'Dense ranking (1, 1, 2)',
};

/* ------------------------------------------------------------- promotions */

export const PROMOTION_ACTIONS = ['PROMOTED', 'RETAINED', 'TRANSFERRED', 'GRADUATED'] as const;
export const PROMOTION_ACTION_LABELS: Record<string, string> = {
  PROMOTED: 'Promote to next class',
  RETAINED: 'Retain in same class',
  TRANSFERRED: 'Transferred out',
  GRADUATED: 'Graduated',
};

/* ----------------------------------------------------------- certificates */

export const CERTIFICATE_TYPES = [
  'FIRST_POSITION',
  'SECOND_POSITION',
  'THIRD_POSITION',
  'ACADEMIC_EXCELLENCE',
  'SUBJECT_TOPPER',
  'MOST_IMPROVED',
  'OUTSTANDING',
  'PERFECT_ATTENDANCE',
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_TYPE_LABELS: Record<string, string> = {
  FIRST_POSITION: 'Certificate of First Position',
  SECOND_POSITION: 'Certificate of Second Position',
  THIRD_POSITION: 'Certificate of Third Position',
  ACADEMIC_EXCELLENCE: 'Certificate of Academic Excellence',
  SUBJECT_TOPPER: 'Subject Topper Award',
  MOST_IMPROVED: 'Most Improved Student Award',
  OUTSTANDING: 'Outstanding Performance Award',
  PERFECT_ATTENDANCE: 'Perfect Attendance Award',
};

/* ---------------------------------------------------------- notifications */

export const NOTIFICATION_TYPES = [
  'EXAM_ANNOUNCEMENT',
  'DATESHEET_PUBLISHED',
  'ROLL_SLIP_AVAILABLE',
  'RESULT_PUBLISHED',
  'RESULT_UPDATED',
  'STUDENT_ABSENCE',
  'GENERAL',
] as const;

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  EXAM_ANNOUNCEMENT: 'Examination Announcement',
  DATESHEET_PUBLISHED: 'Date Sheet Published',
  ROLL_SLIP_AVAILABLE: 'Roll Number Slip Available',
  RESULT_PUBLISHED: 'Result Published',
  RESULT_UPDATED: 'Result Updated',
  STUDENT_ABSENCE: 'Student Absence',
  GENERAL: 'General Notice',
};

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'] as const;
export const NOTIFICATION_CHANNEL_LABELS: Record<string, string> = {
  IN_APP: 'In-App',
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

/* ------------------------------------------------------------------ audit */

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  STUDENT_CREATED: 'STUDENT_CREATED',
  STUDENT_UPDATED: 'STUDENT_UPDATED',
  STUDENT_ARCHIVED: 'STUDENT_ARCHIVED',
  STUDENT_RESTORED: 'STUDENT_RESTORED',
  STUDENT_IMPORTED: 'STUDENT_IMPORTED',
  STUDENT_PROMOTED: 'STUDENT_PROMOTED',
  ENQUIRY_RECEIVED: 'ENQUIRY_RECEIVED',
  ENQUIRY_UPDATED: 'ENQUIRY_UPDATED',
  ENQUIRY_CONVERTED: 'ENQUIRY_CONVERTED',
  ENQUIRY_DELETED: 'ENQUIRY_DELETED',
  PARENT_ACCOUNT_CREATED: 'PARENT_ACCOUNT_CREATED',
  PARENT_ACCOUNT_UPDATED: 'PARENT_ACCOUNT_UPDATED',
  PARENT_ACCOUNT_DELETED: 'PARENT_ACCOUNT_DELETED',
  PARENT_LOGIN: 'PARENT_LOGIN',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  ROLE_UPDATED: 'ROLE_UPDATED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  SESSION_CREATED: 'SESSION_CREATED',
  CLASS_CREATED: 'CLASS_CREATED',
  CLASS_UPDATED: 'CLASS_UPDATED',
  SECTION_CREATED: 'SECTION_CREATED',
  SECTION_UPDATED: 'SECTION_UPDATED',
  SUBJECT_CREATED: 'SUBJECT_CREATED',
  SUBJECT_UPDATED: 'SUBJECT_UPDATED',
  TEACHER_CREATED: 'TEACHER_CREATED',
  TEACHER_UPDATED: 'TEACHER_UPDATED',
  EXAM_CREATED: 'EXAM_CREATED',
  EXAM_UPDATED: 'EXAM_UPDATED',
  EXAM_DELETED: 'EXAM_DELETED',
  DATESHEET_UPDATED: 'DATESHEET_UPDATED',
  ROLL_NUMBERS_GENERATED: 'ROLL_NUMBERS_GENERATED',
  SEATING_GENERATED: 'SEATING_GENERATED',
  INVIGILATION_UPDATED: 'INVIGILATION_UPDATED',
  ATTENDANCE_MARKED: 'ATTENDANCE_MARKED',
  MARKS_ENTERED: 'MARKS_ENTERED',
  MARKS_CHANGED: 'MARKS_CHANGED',
  MARKS_IMPORTED: 'MARKS_IMPORTED',
  RESULT_GENERATED: 'RESULT_GENERATED',
  RESULT_APPROVED: 'RESULT_APPROVED',
  RESULT_PUBLISHED: 'RESULT_PUBLISHED',
  RESULT_UNPUBLISHED: 'RESULT_UNPUBLISHED',
  RESULT_LOCKED: 'RESULT_LOCKED',
  RESULT_UNLOCKED: 'RESULT_UNLOCKED',
  CERTIFICATE_ISSUED: 'CERTIFICATE_ISSUED',
  CERTIFICATE_REVOKED: 'CERTIFICATE_REVOKED',
  NOTIFICATION_SENT: 'NOTIFICATION_SENT',
  BACKUP_CREATED: 'BACKUP_CREATED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  GRADING_UPDATED: 'GRADING_UPDATED',
  POLICY_UPDATED: 'POLICY_UPDATED',
} as const;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in',
  LOGOUT: 'Signed out',
  STUDENT_CREATED: 'Student added',
  STUDENT_UPDATED: 'Student edited',
  STUDENT_ARCHIVED: 'Student archived',
  STUDENT_RESTORED: 'Student restored',
  STUDENT_IMPORTED: 'Students imported',
  STUDENT_PROMOTED: 'Students promoted',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  USER_PASSWORD_RESET: 'Password reset',
  ROLE_UPDATED: 'Role permissions updated',
  SETTINGS_UPDATED: 'Academy settings changed',
  SESSION_CREATED: 'Academic session created',
  CLASS_CREATED: 'Class created',
  CLASS_UPDATED: 'Class updated',
  SECTION_CREATED: 'Section created',
  SECTION_UPDATED: 'Section updated',
  SUBJECT_CREATED: 'Subject created',
  SUBJECT_UPDATED: 'Subject updated',
  TEACHER_CREATED: 'Teacher added',
  TEACHER_UPDATED: 'Teacher updated',
  EXAM_CREATED: 'Examination created',
  EXAM_UPDATED: 'Examination updated',
  EXAM_DELETED: 'Examination deleted',
  DATESHEET_UPDATED: 'Date sheet updated',
  ROLL_NUMBERS_GENERATED: 'Roll numbers generated',
  SEATING_GENERATED: 'Seating plan generated',
  INVIGILATION_UPDATED: 'Invigilation duty updated',
  ATTENDANCE_MARKED: 'Exam attendance marked',
  MARKS_ENTERED: 'Marks entered',
  MARKS_CHANGED: 'Marks changed',
  MARKS_IMPORTED: 'Marks imported',
  RESULT_GENERATED: 'Result generated',
  RESULT_APPROVED: 'Result approved',
  RESULT_PUBLISHED: 'Result published',
  RESULT_UNPUBLISHED: 'Result unpublished',
  RESULT_LOCKED: 'Result locked',
  RESULT_UNLOCKED: 'Result unlocked',
  CERTIFICATE_ISSUED: 'Certificate issued',
  CERTIFICATE_REVOKED: 'Certificate revoked',
  NOTIFICATION_SENT: 'Notification sent',
  BACKUP_CREATED: 'Backup created',
  BACKUP_RESTORED: 'Backup restored',
  GRADING_UPDATED: 'Grading scheme updated',
  POLICY_UPDATED: 'Result policy updated',
};

/* --------------------------------------------------------------- workflow */

export const WORKFLOW_ACTIONS = [
  'PROCESS',
  'VERIFY',
  'SUBMIT_APPROVAL',
  'APPROVE',
  'LOCK',
  'UNLOCK',
  'PUBLISH',
  'UNPUBLISH',
  'ARCHIVE',
] as const;

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 25;
