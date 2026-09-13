import { ROLE, type RoleCode } from './constants';

/**
 * The complete permission catalogue. Every guarded action in the application
 * maps to exactly one code here; the seed script writes these into the
 * `permissions` table and wires them to roles via `role_permissions`.
 */
export const PERMISSIONS = {
  // Dashboard & search
  'dashboard.view': { name: 'View dashboard', group: 'General' },
  'search.global': { name: 'Use global search', group: 'General' },

  // Students
  'students.view': { name: 'View students', group: 'Students' },
  'students.create': { name: 'Add students', group: 'Students' },
  'students.edit': { name: 'Edit students', group: 'Students' },
  'students.archive': { name: 'Archive / restore students', group: 'Students' },
  'students.import': { name: 'Import students', group: 'Students' },
  'students.export': { name: 'Export student data', group: 'Students' },
  'students.promote': { name: 'Promote students', group: 'Students' },

  // Admissions
  'admissions.view': { name: 'View admission enquiries', group: 'Admissions' },
  'admissions.manage': { name: 'Handle admission enquiries', group: 'Admissions' },

  // Academics
  'academics.view': { name: 'View academic structure', group: 'Academics' },
  'sessions.manage': { name: 'Manage academic sessions', group: 'Academics' },
  'classes.manage': { name: 'Manage classes', group: 'Academics' },
  'sections.manage': { name: 'Manage sections', group: 'Academics' },
  'subjects.manage': { name: 'Manage subjects', group: 'Academics' },
  'teachers.manage': { name: 'Manage teachers & assignments', group: 'Academics' },

  // Examinations
  'exams.view': { name: 'View examinations', group: 'Examinations' },
  'exams.create': { name: 'Create examinations', group: 'Examinations' },
  'exams.edit': { name: 'Edit examinations', group: 'Examinations' },
  'exams.delete': { name: 'Delete examinations', group: 'Examinations' },
  'datesheet.manage': { name: 'Build date sheets', group: 'Examinations' },
  'rollnumbers.manage': { name: 'Generate roll numbers', group: 'Examinations' },
  'rollslips.print': { name: 'Print roll number slips', group: 'Examinations' },
  'rooms.manage': { name: 'Manage examination rooms', group: 'Examinations' },
  'seating.manage': { name: 'Build seating plans', group: 'Examinations' },
  'invigilation.manage': { name: 'Assign invigilation duty', group: 'Examinations' },
  'attendance.manage': { name: 'Record examination attendance', group: 'Examinations' },

  // Marks
  'marks.view': { name: 'View marks', group: 'Marks' },
  'marks.enter': { name: 'Enter / edit marks', group: 'Marks' },
  'marks.import': { name: 'Import marks', group: 'Marks' },
  'marks.verify': { name: 'Run marks verification', group: 'Marks' },

  // Results
  'results.view': { name: 'View results', group: 'Results' },
  'results.process': { name: 'Process results', group: 'Results' },
  'results.approve': { name: 'Approve results', group: 'Results' },
  'results.publish': { name: 'Publish results', group: 'Results' },
  'results.lock': { name: 'Lock results', group: 'Results' },
  'results.unlock': { name: 'Unlock results', group: 'Results' },
  'reportcards.print': { name: 'Print report cards', group: 'Results' },
  'meritlists.view': { name: 'View merit lists & position holders', group: 'Results' },

  // Analytics
  'analytics.view': { name: 'View analytics', group: 'Analytics' },
  'analytics.academy': { name: 'View academy-wide analytics', group: 'Analytics' },

  // Certificates & reports
  'certificates.view': { name: 'View certificates', group: 'Certificates' },
  'certificates.issue': { name: 'Issue certificates', group: 'Certificates' },
  'reports.view': { name: 'Use the reports centre', group: 'Reports' },

  // Administration
  'users.manage': { name: 'Manage users', group: 'Administration' },
  'roles.manage': { name: 'Manage roles & permissions', group: 'Administration' },
  'settings.manage': { name: 'Manage academy settings', group: 'Administration' },
  'grading.manage': { name: 'Manage grading & result policy', group: 'Administration' },
  'audit.view': { name: 'View audit logs', group: 'Administration' },
  'backup.manage': { name: 'Create backups', group: 'Administration' },
  'backup.restore': { name: 'Restore backups', group: 'Administration' },
  'notifications.send': { name: 'Send notifications', group: 'Administration' },

  // Portal (student / parent)
  'portal.view': { name: 'Access the student portal', group: 'Portal' },
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

/** Default permission grant per role. Editable later from Users & Roles. */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  [ROLE.SUPER_ADMIN]: ALL_PERMISSIONS,

  [ROLE.PRINCIPAL]: [
    'dashboard.view',
    'search.global',
    'students.view',
    'students.export',
    'admissions.view',
    'admissions.manage',
    'academics.view',
    'exams.view',
    'marks.view',
    'results.view',
    'results.approve',
    'results.lock',
    'reportcards.print',
    'meritlists.view',
    'analytics.view',
    'analytics.academy',
    'certificates.view',
    'certificates.issue',
    'reports.view',
    'audit.view',
    'notifications.send',
  ],

  [ROLE.EXAM_CONTROLLER]: [
    'dashboard.view',
    'search.global',
    'students.view',
    'students.export',
    'academics.view',
    'exams.view',
    'exams.create',
    'exams.edit',
    'datesheet.manage',
    'rollnumbers.manage',
    'rollslips.print',
    'rooms.manage',
    'seating.manage',
    'invigilation.manage',
    'attendance.manage',
    'marks.view',
    'marks.enter',
    'marks.import',
    'marks.verify',
    'results.view',
    'results.process',
    'results.publish',
    'reportcards.print',
    'meritlists.view',
    'analytics.view',
    'certificates.view',
    'certificates.issue',
    'reports.view',
    'notifications.send',
  ],

  [ROLE.TEACHER]: [
    'dashboard.view',
    'students.view',
    'academics.view',
    'exams.view',
    'marks.view',
    'marks.enter',
    'results.view',
    'analytics.view',
    'reports.view',
  ],

  [ROLE.STUDENT]: ['portal.view'],
};

export function permissionGroups(): Record<string, { code: PermissionCode; name: string }[]> {
  const groups: Record<string, { code: PermissionCode; name: string }[]> = {};
  for (const code of ALL_PERMISSIONS) {
    const meta = PERMISSIONS[code];
    (groups[meta.group] ||= []).push({ code, name: meta.name });
  }
  return groups;
}
