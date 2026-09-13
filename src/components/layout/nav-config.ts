import type { PermissionCode } from '@/lib/permissions';

export type NavLink = {
  label: string;
  href: string;
  /** Any one of these permissions grants visibility. */
  permissions?: PermissionCode[];
  /** Match child routes as active (default true for non-index links). */
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  /** lucide-react icon name, resolved in the sidebar. */
  icon: string;
  href?: string;
  permissions?: PermissionCode[];
  children?: NavLink[];
};

/**
 * The sidebar structure. Groups and links are hidden automatically when the
 * signed-in role holds none of the listed permissions.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    href: '/dashboard',
    permissions: ['dashboard.view'],
  },
  {
    label: 'Students',
    icon: 'Users',
    permissions: ['students.view'],
    children: [
      { label: 'All Students', href: '/students', permissions: ['students.view'], exact: true },
      { label: 'Add Student', href: '/students/new', permissions: ['students.create'] },
      { label: 'Student Promotion', href: '/students/promotion', permissions: ['students.promote'] },
      { label: 'Import Students', href: '/students/import', permissions: ['students.import'] },
    ],
  },
  {
    label: 'Academics',
    icon: 'BookOpen',
    permissions: ['academics.view'],
    children: [
      { label: 'Sessions', href: '/academics/sessions', permissions: ['academics.view'] },
      { label: 'Classes', href: '/academics/classes', permissions: ['academics.view'] },
      { label: 'Sections', href: '/academics/sections', permissions: ['academics.view'] },
      { label: 'Subjects', href: '/academics/subjects', permissions: ['academics.view'] },
      { label: 'Teachers', href: '/academics/teachers', permissions: ['academics.view'] },
    ],
  },
  {
    label: 'Examinations',
    icon: 'ClipboardList',
    permissions: ['exams.view'],
    children: [
      { label: 'Exams', href: '/exams', permissions: ['exams.view'], exact: true },
      { label: 'Date Sheets', href: '/exams/date-sheets', permissions: ['exams.view'] },
      { label: 'Roll Numbers', href: '/exams/roll-numbers', permissions: ['exams.view'] },
      { label: 'Roll Number Slips', href: '/exams/roll-slips', permissions: ['exams.view'] },
      { label: 'Rooms', href: '/exams/rooms', permissions: ['exams.view'] },
      { label: 'Seating Plans', href: '/exams/seating', permissions: ['exams.view'] },
      { label: 'Invigilation', href: '/exams/invigilation', permissions: ['exams.view'] },
      { label: 'Exam Attendance', href: '/exams/attendance', permissions: ['exams.view'] },
    ],
  },
  {
    label: 'Marks',
    icon: 'PenSquare',
    permissions: ['marks.view'],
    children: [
      { label: 'Enter Marks', href: '/marks/entry', permissions: ['marks.view'] },
      { label: 'Import Marks', href: '/marks/import', permissions: ['marks.import'] },
      { label: 'Marks Verification', href: '/marks/verification', permissions: ['marks.view'] },
    ],
  },
  {
    label: 'Results',
    icon: 'Award',
    permissions: ['results.view'],
    children: [
      { label: 'Process Results', href: '/results/process', permissions: ['results.view'] },
      { label: 'Results', href: '/results', permissions: ['results.view'], exact: true },
      { label: 'Report Cards', href: '/results/report-cards', permissions: ['results.view'] },
      { label: 'Merit Lists', href: '/results/merit-lists', permissions: ['meritlists.view'] },
      { label: 'Position Holders', href: '/results/toppers', permissions: ['meritlists.view'] },
      { label: 'Publish Results', href: '/results/publish', permissions: ['results.view'] },
    ],
  },
  {
    label: 'Analytics',
    icon: 'BarChart3',
    permissions: ['analytics.view'],
    children: [
      { label: 'Academy Analytics', href: '/analytics', permissions: ['analytics.view'], exact: true },
      { label: 'Class Analytics', href: '/analytics/classes', permissions: ['analytics.view'] },
      { label: 'Subject Analytics', href: '/analytics/subjects', permissions: ['analytics.view'] },
      { label: 'Student Progress', href: '/analytics/students', permissions: ['analytics.view'] },
      { label: 'Exam Comparison', href: '/analytics/comparison', permissions: ['analytics.view'] },
    ],
  },
  {
    label: 'Messages',
    icon: 'MessageSquare',
    href: '/messages',
    permissions: ['notifications.send'],
  },
  {
    label: 'Certificates',
    icon: 'Medal',
    href: '/certificates',
    permissions: ['certificates.view'],
  },
  {
    label: 'Reports',
    icon: 'FileSpreadsheet',
    href: '/reports',
    permissions: ['reports.view'],
  },
  {
    label: 'Users & Roles',
    icon: 'ShieldCheck',
    permissions: ['users.manage', 'roles.manage'],
    children: [
      { label: 'Users', href: '/admin/users', permissions: ['users.manage'] },
      { label: 'Roles & Permissions', href: '/admin/roles', permissions: ['roles.manage'] },
    ],
  },
  {
    label: 'Audit Logs',
    icon: 'ScrollText',
    href: '/admin/audit',
    permissions: ['audit.view'],
  },
  {
    label: 'Backup',
    icon: 'DatabaseBackup',
    href: '/admin/backup',
    permissions: ['backup.manage'],
  },
  {
    label: 'Academy Settings',
    icon: 'Settings',
    permissions: ['settings.manage', 'grading.manage'],
    children: [
      { label: 'Academy Profile', href: '/admin/settings', permissions: ['settings.manage'], exact: true },
      { label: 'Grading Schemes', href: '/admin/settings/grading', permissions: ['grading.manage'] },
      { label: 'Result Policies', href: '/admin/settings/policies', permissions: ['grading.manage'] },
    ],
  },
];

/** Human-readable labels for breadcrumb segments that are not obvious. */
export const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Administration',
  'date-sheets': 'Date Sheets',
  'roll-numbers': 'Roll Numbers',
  'roll-slips': 'Roll Number Slips',
  'report-cards': 'Report Cards',
  'merit-lists': 'Merit Lists',
  toppers: 'Position Holders',
  audit: 'Audit Logs',
  messages: 'Messages',
  new: 'Add New',
  entry: 'Enter Marks',
  verification: 'Marks Verification',
  process: 'Process Results',
  publish: 'Publish Results',
  comparison: 'Exam Comparison',
  promotion: 'Student Promotion',
  seating: 'Seating Plans',
  invigilation: 'Invigilation',
  attendance: 'Exam Attendance',
  settings: 'Academy Settings',
  grading: 'Grading Schemes',
  policies: 'Result Policies',
  backup: 'Backup & Restore',
  users: 'Users',
  roles: 'Roles & Permissions',
};
