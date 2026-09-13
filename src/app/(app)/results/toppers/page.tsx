import type { Metadata } from 'next';
import Link from 'next/link';
import { Trophy, Printer, Crown, Medal, BookOpen } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { getPositionHolders, getSubjectToppers } from '@/server/queries/results';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, EmptyState, LinkButton, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, StudentAvatar } from '@/components/ui/status-badge';
import { formatPercent, ordinal } from '@/lib/utils';

export const metadata: Metadata = { title: 'Position Holders' };
export const dynamic = 'force-dynamic';

/**
 * Podium styling for the first three visual slots. The label comes from the
 * student's true rank, not the slot, so tied students are both announced as
 * first position.
 */
const PODIUM = [
  {
    ring: 'ring-gold-400',
    badge: 'bg-gold-gradient text-navy-950',
    height: 'sm:order-2 sm:-mt-4',
    avatar: 96,
  },
  {
    ring: 'ring-slate-300',
    badge: 'bg-slate-300 text-navy-900',
    height: 'sm:order-1',
    avatar: 80,
  },
  {
    ring: 'ring-amber-600',
    badge: 'bg-amber-700 text-white',
    height: 'sm:order-3',
    avatar: 80,
  },
];

function positionLabel(position: number): string {
  if (position === 1) return 'First Position';
  if (position === 2) return 'Second Position';
  if (position === 3) return 'Third Position';
  return `Position ${position}`;
}

export default async function ToppersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('meritlists.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();
  const exams = await prisma.exam.findMany({
    where: { ...(session ? { sessionId: session.id } : {}), results: { some: {} } },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
  });

  const examId = pick('examId') || exams[0]?.id;
  const top = Number(pick('top') ?? 10) || 10;

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Position Holders"
          description="The leading students of an examination."
          breadcrumbs={[{ label: 'Results' }, { label: 'Position Holders' }]}
        />
        <Card>
          <EmptyState
            icon={<Trophy className="h-6 w-6" />}
            title="No processed results"
            description="Position holders appear once an examination result has been processed."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { session: { select: { name: true } } },
  });

  const [holders, subjectToppers] = await Promise.all([
    getPositionHolders(examId, top),
    getSubjectToppers(examId),
  ]);

  const podium = holders.overall.slice(0, 3);
  const rest = holders.overall.slice(3);

  return (
    <>
      <PageHeader
        title="Position Holders"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Results' }, { label: 'Position Holders' }]}
        actions={
          <LinkButton
            href={`/print/topper-poster?examId=${exam.id}&top=${top}`}
            size="sm"
            newTab
          >
            <Printer className="h-4 w-4" />
            Print Poster
          </LinkButton>
        }
      />

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[280px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'top',
              label: 'Show',
              className: 'w-[150px]',
              options: [
                { value: '3', label: 'Top 3' },
                { value: '5', label: 'Top 5' },
                { value: '10', label: 'Top 10' },
                { value: '20', label: 'Top 20' },
              ],
            },
          ]}
        />
      </Card>

      {holders.overall.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="h-6 w-6" />}
            title="No position holders"
            description="No student has a rankable result for this examination."
          />
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------------- podium */}
          <section className="mb-6 overflow-hidden rounded-2xl bg-navy-gradient p-6 sm:p-8">
            <div className="mb-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-[12px] font-bold uppercase tracking-widest text-gold-300 ring-1 ring-white/15">
                <Crown className="h-3.5 w-3.5" />
                Top Position Holders
              </div>
              <h2 className="doc-title mt-3 text-2xl font-bold text-white">{exam.name}</h2>
              <p className="text-[13px] text-navy-200">Session {exam.session.name}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {podium.map((row, index) => {
                const style = PODIUM[index]!;
                return (
                  <div
                    key={row.id}
                    className={`flex flex-col items-center rounded-xl bg-white/[0.07] p-5 text-center ring-1 ring-white/10 backdrop-blur ${style.height}`}
                  >
                    <span
                      className={`mb-3 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${style.badge}`}
                    >
                      {positionLabel(row.overallPosition)}
                    </span>
                    <StudentAvatar
                      name={row.student.fullName}
                      photoPath={row.student.photoPath}
                      size={style.avatar}
                      className={`ring-4 ${style.ring}`}
                    />
                    <p className="mt-3 text-[15px] font-bold text-white">{row.student.fullName}</p>
                    <p className="text-[12px] text-navy-200">S/O — D/O {row.student.fatherName}</p>
                    <p className="mt-1 text-[12px] font-semibold text-gold-300">
                      {row.enrollment.schoolClass.name} — {row.enrollment.section.name}
                    </p>
                    <p className="mt-1 text-[11.5px] text-navy-300 tabular">
                      Roll No. {row.rollNumber}
                    </p>

                    <div className="mt-4 flex items-center gap-4">
                      <div>
                        <p className="text-2xl font-bold leading-none text-white tabular">
                          {formatPercent(row.percentage)}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-navy-300">
                          Percentage
                        </p>
                      </div>
                      <div className="h-9 w-px bg-white/20" />
                      <div>
                        <p className="text-2xl font-bold leading-none text-gold-300 tabular">
                          {row.grade}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-navy-300">
                          Grade
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-[11.5px] text-navy-200 tabular">
                      {row.totalObtained} / {row.totalMaxMarks} marks
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* --------------------------------------------------- full list */}
          {rest.length > 0 && (
            <Card className="mb-5">
              <CardHeader
                title={`Remaining merit positions (${rest.length})`}
                description="Ranked across the whole examination"
              />
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th align="center">#</Th>
                      <Th align="center">Roll No.</Th>
                      <Th>Student</Th>
                      <Th>Father Name</Th>
                      <Th>Class / Section</Th>
                      <Th align="center">Marks</Th>
                      <Th align="center">%</Th>
                      <Th align="center">Grade</Th>
                      <Th align="center">Class Pos.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((row) => (
                      <tr key={row.id}>
                        <Td align="center" className="font-bold tabular text-slate-500">
                          {row.overallPosition}
                        </Td>
                        <Td align="center" className="tabular text-slate-700">{row.rollNumber}</Td>
                        <Td>
                          <Link
                            href={`/students/${row.studentId}`}
                            className="flex items-center gap-2.5 font-semibold text-navy-900 hover:text-royal-700"
                          >
                            <StudentAvatar
                              name={row.student.fullName}
                              photoPath={row.student.photoPath}
                              size={30}
                            />
                            {row.student.fullName}
                          </Link>
                        </Td>
                        <Td className="text-slate-700">{row.student.fatherName}</Td>
                        <Td className="whitespace-nowrap text-slate-700">
                          {row.enrollment.schoolClass.name} — {row.enrollment.section.name}
                        </Td>
                        <Td align="center" className="tabular">
                          {row.totalObtained} / {row.totalMaxMarks}
                        </Td>
                        <Td align="center" className="font-bold tabular">
                          {formatPercent(row.percentage)}
                        </Td>
                        <Td align="center">
                          <GradeBadge grade={row.grade} />
                        </Td>
                        <Td align="center" className="tabular">
                          {row.classPosition ? ordinal(row.classPosition) : '—'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {/* ------------------------------------------------ class toppers */}
            <Card>
              <CardHeader
                title="Class toppers"
                description="Highest percentage in each class"
              />
              <ul className="divide-y divide-slate-100">
                {holders.classToppers.map((row) => (
                  <li key={row.id} className="flex items-center gap-3.5 px-5 py-3.5">
                    <Medal className="h-4 w-4 shrink-0 text-gold-500" />
                    <StudentAvatar
                      name={row.student.fullName}
                      photoPath={row.student.photoPath}
                      size={38}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/students/${row.studentId}`}
                        className="block truncate text-[13.5px] font-bold text-navy-900 hover:text-royal-700"
                      >
                        {row.student.fullName}
                      </Link>
                      <p className="truncate text-[12px] text-slate-500">
                        {row.enrollment.schoolClass.name} — {row.enrollment.section.name} · Roll{' '}
                        {row.rollNumber}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-bold text-navy-900 tabular">
                        {formatPercent(row.percentage)}
                      </p>
                      <GradeBadge grade={row.grade} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* ---------------------------------------------- section toppers */}
            <Card>
              <CardHeader
                title="Section toppers"
                description="Highest percentage in each section"
              />
              <ul className="divide-y divide-slate-100">
                {holders.sectionToppers.map((row) => (
                  <li key={row.id} className="flex items-center gap-3.5 px-5 py-3.5">
                    <Medal className="h-4 w-4 shrink-0 text-royal-500" />
                    <StudentAvatar
                      name={row.student.fullName}
                      photoPath={row.student.photoPath}
                      size={38}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/students/${row.studentId}`}
                        className="block truncate text-[13.5px] font-bold text-navy-900 hover:text-royal-700"
                      >
                        {row.student.fullName}
                      </Link>
                      <p className="truncate text-[12px] text-slate-500">
                        {row.enrollment.schoolClass.name} — Section {row.enrollment.section.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-bold text-navy-900 tabular">
                        {formatPercent(row.percentage)}
                      </p>
                      <GradeBadge grade={row.grade} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* --------------------------------------------- subject toppers */}
          {subjectToppers.length > 0 && (
            <Card className="mt-5">
              <CardHeader
                title="Subject toppers"
                description="Highest scorer in each subject, per class"
              />
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {subjectToppers.map((row) => (
                  <div
                    key={`${row.subjectCode}-${row.className}`}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5 text-royal-600" />
                      <p className="text-[12.5px] font-bold text-navy-900">{row.subjectName}</p>
                      <Badge className="ml-auto">{row.className}</Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <StudentAvatar
                        name={row.studentName}
                        photoPath={row.photoPath}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/students/${row.studentId}`}
                          className="block truncate text-[13px] font-semibold text-navy-900 hover:text-royal-700"
                        >
                          {row.studentName}
                        </Link>
                        <p className="truncate text-[11.5px] text-slate-500">
                          Section {row.sectionName}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[15px] font-bold text-navy-900 tabular">
                          {row.obtainedMarks}
                          <span className="text-[11px] font-medium text-slate-400">
                            /{row.maxMarks}
                          </span>
                        </p>
                        <p className="text-[11px] font-semibold text-royal-700 tabular">
                          {formatPercent(row.percentage, 1)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
