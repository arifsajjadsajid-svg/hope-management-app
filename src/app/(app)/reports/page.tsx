import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Users,
  Layers,
  BookOpen,
  IdCard,
  CalendarDays,
  Grid3x3,
  UserCheck,
  PenSquare,
  Award,
  Trophy,
  CheckCircle2,
  XCircle,
  UserX,
  BarChart3,
  TrendingUp,
  ArrowUpRight,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  Medal,
} from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';

export const metadata: Metadata = { title: 'Reports Centre' };
export const dynamic = 'force-dynamic';

type ReportLink = {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  format: 'PRINT' | 'EXCEL' | 'SCREEN';
  /** Report needs an examination to be selected. */
  needsExam?: boolean;
};

const FORMAT_META = {
  PRINT: { label: 'Print / PDF', icon: Printer, tone: 'bg-navy-900 text-gold-300' },
  EXCEL: { label: 'Excel', icon: FileSpreadsheet, tone: 'bg-emerald-600 text-white' },
  SCREEN: { label: 'On screen', icon: BarChart3, tone: 'bg-royal-600 text-white' },
} as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('reports.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();
  const exams = await prisma.exam.findMany({
    where: session ? { sessionId: session.id } : {},
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
  });

  const examId = pick('examId') || exams[0]?.id;
  const examQuery = examId ? `examId=${examId}` : '';

  const groups: { title: string; description: string; reports: ReportLink[] }[] = [
    {
      title: 'Students & Academics',
      description: 'Roll registers and the academic structure of the academy.',
      reports: [
        {
          label: 'Student List',
          description: 'Full roster with contact details and class placement.',
          icon: Users,
          href: '/print/student-list',
          format: 'PRINT',
        },
        {
          label: 'Student List (Excel)',
          description: 'Every student field, ready for filtering and mail merge.',
          icon: Users,
          href: '/api/export/students?format=xlsx',
          format: 'EXCEL',
        },
        {
          label: 'Class List',
          description: 'Classes with sections, subject counts and enrolment.',
          icon: Layers,
          href: '/academics/classes',
          format: 'SCREEN',
        },
        {
          label: 'Section List',
          description: 'Sections with class teacher, capacity and occupancy.',
          icon: Grid3x3,
          href: '/academics/sections',
          format: 'SCREEN',
        },
        {
          label: 'Subject List',
          description: 'Subjects with marks distribution and subject teacher.',
          icon: BookOpen,
          href: '/academics/subjects',
          format: 'SCREEN',
        },
      ],
    },
    {
      title: 'Examination',
      description: 'Everything needed to run the examination itself.',
      reports: [
        {
          label: 'Date Sheet',
          description: 'Paper-by-paper schedule per class, with instructions.',
          icon: CalendarDays,
          href: `/print/date-sheet?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Roll Number List',
          description: 'Allocated roll numbers with room and seat.',
          icon: IdCard,
          href: `/print/roll-number-list?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Roll Number List (Excel)',
          description: 'Roll numbers for cross-checking and mail merge.',
          icon: IdCard,
          href: `/api/export/roll-numbers?${examQuery}`,
          format: 'EXCEL',
          needsExam: true,
        },
        {
          label: 'Roll Number Slips',
          description: 'Branded slips, one, two or four to an A4 page.',
          icon: IdCard,
          href: `/exams/roll-slips?${examQuery}`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Seating Plan',
          description: 'Room-by-room seat charts in landscape.',
          icon: Grid3x3,
          href: `/print/seating-plan?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Door Lists',
          description: 'Candidate lists to post outside each hall.',
          icon: Grid3x3,
          href: `/print/door-list?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Seat Labels',
          description: 'Cut-out labels for each candidate desk.',
          icon: Grid3x3,
          href: `/print/seat-labels?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Invigilation Duty Roster',
          description: 'Who is on duty, in which room, for every paper.',
          icon: ShieldCheck,
          href: `/print/invigilation?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Exam Attendance Sheets',
          description: 'Signature sheets for each paper.',
          icon: UserCheck,
          href: `/exams/attendance?${examQuery}`,
          format: 'SCREEN',
          needsExam: true,
        },
      ],
    },
    {
      title: 'Marks & Results',
      description: 'Marks sheets, result gazettes, report cards and merit.',
      reports: [
        {
          label: 'Marks Verification Report',
          description: 'Missing marks, values above maximum and other data errors.',
          icon: PenSquare,
          href: `/marks/verification?${examQuery}`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Consolidated Result Sheet',
          description: 'One row per candidate with every subject as a column.',
          icon: FileSpreadsheet,
          href: `/print/result-sheet?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Result Sheet (Excel)',
          description: 'The full gazette, ready for analysis.',
          icon: FileSpreadsheet,
          href: `/api/export/results?${examQuery}`,
          format: 'EXCEL',
          needsExam: true,
        },
        {
          label: 'Report Cards',
          description: 'Official A4 report cards with QR verification.',
          icon: Award,
          href: `/results/report-cards?${examQuery}`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Merit List',
          description: 'Overall, class, section or subject merit list.',
          icon: Trophy,
          href: `/results/merit-lists?${examQuery}`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Position Holders Poster',
          description: 'Poster-style board of the top position holders.',
          icon: Medal,
          href: `/print/topper-poster?${examQuery}`,
          format: 'PRINT',
          needsExam: true,
        },
        {
          label: 'Pass Students',
          description: 'Candidates who passed the examination.',
          icon: CheckCircle2,
          href: `/results?${examQuery}&status=PASS`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Fail Students',
          description: 'Candidates who did not meet the pass criteria.',
          icon: XCircle,
          href: `/results?${examQuery}&status=FAIL`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Absent Students',
          description: 'Candidates absent from the whole examination.',
          icon: UserX,
          href: `/results?${examQuery}&status=ABSENT`,
          format: 'SCREEN',
          needsExam: true,
        },
      ],
    },
    {
      title: 'Analysis & Progress',
      description: 'Performance across classes, sections, subjects and students.',
      reports: [
        {
          label: 'Class Analysis',
          description: 'Pass rate, average, highest and lowest per class and section.',
          icon: Layers,
          href: `/analytics/classes?${examQuery}`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Subject Analysis',
          description: 'Subject-level pass rates, averages and toppers.',
          icon: BookOpen,
          href: `/analytics/subjects?${examQuery}`,
          format: 'SCREEN',
          needsExam: true,
        },
        {
          label: 'Student Progress Report',
          description: 'One student against their own history and the class average.',
          icon: TrendingUp,
          href: '/analytics/students',
          format: 'SCREEN',
        },
        {
          label: 'Examination Comparison',
          description: 'Two examinations side by side, class and subject level.',
          icon: BarChart3,
          href: '/analytics/comparison',
          format: 'SCREEN',
        },
        {
          label: 'Promotion List',
          description: 'Promotion outcome per student at session close.',
          icon: ArrowUpRight,
          href: '/students/promotion',
          format: 'SCREEN',
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Reports Centre"
        description="Every official list, sheet and analysis the academy needs, in print, Excel or on screen."
        breadcrumbs={[{ label: 'Reports' }]}
      />

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination for examination-specific reports',
              className: 'min-w-[320px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
          ]}
        />
      </Card>

      {!examId && (
        <Alert tone="info" className="mb-5">
          Create an examination to unlock the examination-specific reports below.
        </Alert>
      )}

      <div className="space-y-5">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardHeader title={group.title} description={group.description} />
            <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.reports.map((report) => {
                const Icon = report.icon;
                const format = FORMAT_META[report.format];
                const FormatIcon = format.icon;
                const disabled = report.needsExam && !examId;
                const external = report.href.startsWith('/print') || report.href.startsWith('/api');

                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${format.tone}`}
                      >
                        <FormatIcon className="h-3 w-3" />
                        {format.label}
                      </span>
                    </div>
                    <p className="mt-2.5 text-[13.5px] font-bold text-navy-900">{report.label}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
                      {report.description}
                    </p>
                  </>
                );

                if (disabled) {
                  return (
                    <div
                      key={report.label}
                      className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-60"
                      title="Select an examination first"
                    >
                      {inner}
                    </div>
                  );
                }

                return external ? (
                  <a
                    key={report.label}
                    href={report.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-royal-300 hover:shadow-card"
                  >
                    {inner}
                  </a>
                ) : (
                  <Link
                    key={report.label}
                    href={report.href}
                    className="rounded-xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-royal-300 hover:shadow-card"
                  >
                    {inner}
                  </Link>
                );
              })}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
