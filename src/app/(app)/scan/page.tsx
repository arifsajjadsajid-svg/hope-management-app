import type { Metadata } from 'next';
import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import { requireAnyPermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { ROLE } from '@/lib/constants';
import type { ScanKind } from '@/lib/scan/schemas';
import type { PermissionCode } from '@/lib/permissions';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, Card, EmptyState } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { cn } from '@/lib/utils';
import { loadEnquiryContext, loadMarksContext, loadStudentContext } from '@/server/services/scan/context';
import { scanningConfigured } from '@/server/services/scan/read-document';
import { MarksScan } from './marks-scan';
import { EnquiriesScan, StudentsScan } from './records-scan';

export const metadata: Metadata = { title: 'Scan Documents' };
export const dynamic = 'force-dynamic';

const TABS: { kind: ScanKind; label: string; permission: PermissionCode }[] = [
  { kind: 'marks', label: 'Marks & result sheets', permission: 'marks.import' },
  { kind: 'students', label: 'Student lists', permission: 'students.import' },
  { kind: 'admissions', label: 'Admission forms', permission: 'admissions.manage' },
];

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAnyPermission(TABS.map((t) => t.permission));
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const tabs = TABS.filter((t) => userCan(user, t.permission));
  const kind = tabs.find((t) => t.kind === pick('kind'))?.kind ?? tabs[0]!.kind;

  const header = (
    <PageHeader
      title="Scan Documents"
      description="Photograph a marks sheet, student list or admission form. The page is read for you, you check every row, and only then is it saved."
      breadcrumbs={[{ label: 'Scan Documents' }]}
    />
  );

  if (!scanningConfigured()) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<ScanLine className="h-6 w-6" />}
            title="Document scanning is not switched on yet"
            description={
              user.roleCode === ROLE.SUPER_ADMIN ? (
                <>
                  Scanning reads pages with Claude, Anthropic&apos;s AI, which needs an API key. Create one at
                  console.anthropic.com (add credit under Billing first), then in Vercel open the project →
                  Settings → Environment Variables, add <strong>ANTHROPIC_API_KEY</strong>, and redeploy.
                </>
              ) : (
                'Ask the Super Admin to switch it on.'
              )
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Kind of document">
        {tabs.map((tab) => (
          <Link
            key={tab.kind}
            href={`/scan?kind=${tab.kind}`}
            className={cn(
              'rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition',
              tab.kind === kind
                ? 'border-navy-900 bg-navy-900 text-white'
                : 'border-slate-300 bg-white text-navy-800 hover:bg-slate-50',
            )}
            aria-current={tab.kind === kind ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {kind === 'marks' && <MarksTab pick={pick} />}
      {kind === 'students' && <StudentsTab />}
      {kind === 'admissions' && <EnquiriesScan context={await loadEnquiryContext()} />}

      <Alert tone="info" className="mt-5">
        Pages are sent to Anthropic to be read and are not kept by this system. Every page read is recorded in
        the audit log.
      </Alert>
    </>
  );
}

async function MarksTab({ pick }: { pick: (key: string) => string | undefined }) {
  const session = await getCurrentSession();
  const exams = await prisma.exam.findMany({
    where: session ? { sessionId: session.id } : {},
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      name: true,
      examClasses: {
        select: { schoolClass: { select: { id: true, name: true, displayOrder: true } } },
      },
    },
  });

  if (exams.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ScanLine className="h-6 w-6" />}
          title="No examinations yet"
          description="Create an examination before scanning its marks."
        />
      </Card>
    );
  }

  const exam = exams.find((e) => e.id === pick('examId')) ?? exams[0]!;
  const classes = exam.examClasses
    .map((c) => c.schoolClass)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const schoolClass = classes.find((c) => c.id === pick('classId')) ?? classes[0];

  const sections = schoolClass
    ? await prisma.section.findMany({
        where: { classId: schoolClass.id, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];
  const section = sections.find((s) => s.id === pick('sectionId')) ?? null;

  return (
    <>
      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[220px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              className: 'min-w-[160px]',
              options: classes.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              type: 'select',
              name: 'sectionId',
              label: 'Section',
              className: 'min-w-[150px]',
              options: [{ value: '', label: 'All sections' }, ...sections.map((s) => ({ value: s.id, label: s.name }))],
            },
          ]}
        />
      </Card>

      {!schoolClass ? (
        <Card>
          <EmptyState
            icon={<ScanLine className="h-6 w-6" />}
            title="This examination has no classes"
            description="Add a class to the examination first."
          />
        </Card>
      ) : (
        <MarksScan
          key={`${exam.id}-${schoolClass.id}-${section?.id ?? 'all'}`}
          context={await loadMarksContext(exam.id, schoolClass.id, section?.id ?? null)}
        />
      )}
    </>
  );
}

async function StudentsTab() {
  const [sessions, classes, sections, current, context] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.section.findMany({ include: { schoolClass: { select: { name: true } } }, orderBy: { name: 'asc' } }),
    getCurrentSession(),
    loadStudentContext(),
  ]);

  if (sections.length === 0) {
    return (
      <Alert tone="warning" title="Academic structure incomplete">
        Create at least one academic session, class and section under <strong>Academics</strong> before adding
        students.
      </Alert>
    );
  }

  return (
    <StudentsScan
      defaultSessionId={current?.id}
      sessions={sessions.map((s) => ({ id: s.id, label: s.name }))}
      classes={classes.map((c) => ({ id: c.id, label: c.name, parentId: c.sessionId }))}
      sections={sections.map((s) => ({ id: s.id, label: `${s.schoolClass.name} — ${s.name}`, parentId: s.classId }))}
      context={context}
    />
  );
}
