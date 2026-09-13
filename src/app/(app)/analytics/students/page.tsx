import type { Metadata } from 'next';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, LineChart } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { getStudentProfile, analyseStudentPerformance, academicOptions } from '@/server/queries/students';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, LinkButton } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, ResultStatusBadge, StudentAvatar } from '@/components/ui/status-badge';
import { ProgressChart, SubjectRadarChart } from '@/components/charts/charts';
import { MiniStat } from '@/components/ui/stat-card';
import { formatPercent, ordinal, round } from '@/lib/utils';

export const metadata: Metadata = { title: 'Student Progress' };
export const dynamic = 'force-dynamic';

export default async function StudentProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('analytics.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();
  const { classes, sections } = await academicOptions();

  const classId = pick('classId');
  const sectionId = pick('sectionId');
  const studentId = pick('studentId');

  const roster = await prisma.enrollment.findMany({
    where: {
      ...(session ? { sessionId: session.id } : {}),
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      student: { status: 'ACTIVE' },
    },
    include: { student: { select: { id: true, fullName: true, admissionNumber: true } } },
    orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { section: { name: 'asc' } }, { rollNumber: 'asc' }],
    take: 400,
  });

  const selectedId = studentId || roster[0]?.studentId;
  const profile = selectedId ? await getStudentProfile(selectedId) : null;
  const performance = profile ? analyseStudentPerformance(profile.results) : null;

  // Class average per examination, to plot the student against their cohort.
  const classAverages = new Map<string, number>();
  if (profile && performance) {
    const examIds = performance.history.map((h) => h.examId);
    if (examIds.length) {
      const grouped = await prisma.result.groupBy({
        by: ['examId'],
        where: {
          examId: { in: examIds },
          enrollment: { classId: profile.currentEnrollment?.classId ?? undefined },
          status: { notIn: ['ABSENT', 'WITHHELD'] },
        },
        _avg: { percentage: true },
      });
      for (const row of grouped) {
        classAverages.set(row.examId, round(row._avg.percentage ?? 0, 2));
      }
    }
  }

  const TrendIcon =
    !performance || performance.change === null
      ? Minus
      : performance.change > 0
        ? TrendingUp
        : TrendingDown;

  return (
    <>
      <PageHeader
        title="Student Progress"
        description="Track an individual student's performance across every published examination."
        breadcrumbs={[{ label: 'Analytics', href: '/analytics' }, { label: 'Student Progress' }]}
        actions={
          profile && (
            <LinkButton href={`/students/${profile.student.id}`} variant="outline" size="sm">
              Open full profile
            </LinkButton>
          )
        }
      />

      <Card className="mb-5">
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              className: 'w-[180px]',
              options: [
                { value: '', label: 'All classes' },
                ...classes.map((c) => ({ value: c.id, label: c.name })),
              ],
            },
            {
              type: 'select',
              name: 'sectionId',
              label: 'Section',
              className: 'w-[200px]',
              options: [
                { value: '', label: 'All sections' },
                ...sections
                  .filter((s) => !classId || s.classId === classId)
                  .map((s) => ({ value: s.id, label: `${s.schoolClass.name} — ${s.name}` })),
              ],
            },
            {
              type: 'select',
              name: 'studentId',
              label: 'Student',
              className: 'min-w-[280px] flex-1',
              options: roster.map((e) => ({
                value: e.studentId,
                label: `${e.student.fullName} (${e.student.admissionNumber})`,
              })),
            },
          ]}
        />
      </Card>

      {!profile || !performance ? (
        <Card>
          <EmptyState
            icon={<LineChart className="h-6 w-6" />}
            title="Select a student"
            description="Choose a class, section and student to see their progress."
          />
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <CardBody className="flex flex-wrap items-center gap-5">
              <StudentAvatar
                name={profile.student.fullName}
                photoPath={profile.student.photoPath}
                size={64}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/students/${profile.student.id}`}
                  className="text-lg font-bold text-navy-900 hover:text-royal-700"
                >
                  {profile.student.fullName}
                </Link>
                <p className="text-[13px] text-slate-600">
                  S/O — D/O {profile.student.fatherName} · {profile.student.admissionNumber}
                </p>
                {profile.currentEnrollment && (
                  <p className="text-[13px] font-semibold text-navy-700">
                    {profile.currentEnrollment.schoolClass.name} — Section{' '}
                    {profile.currentEnrollment.section.name}
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            <MiniStat
              label="Current %"
              value={
                performance.currentPercentage !== null
                  ? formatPercent(performance.currentPercentage)
                  : '—'
              }
              tone="text-navy-900"
            />
            <MiniStat
              label="Previous %"
              value={
                performance.previousPercentage !== null
                  ? formatPercent(performance.previousPercentage)
                  : '—'
              }
            />
            <MiniStat
              label="Change"
              value={
                performance.change !== null
                  ? `${performance.change > 0 ? '+' : ''}${round(performance.change, 2)}%`
                  : '—'
              }
              tone={
                performance.change === null
                  ? undefined
                  : performance.change > 0
                    ? 'text-emerald-700'
                    : performance.change < 0
                      ? 'text-rose-700'
                      : undefined
              }
            />
            <MiniStat
              label="Class Position"
              value={
                performance.latest?.classPosition ? ordinal(performance.latest.classPosition) : '—'
              }
            />
            <MiniStat
              label="Strongest"
              value={performance.strongestSubject?.code ?? '—'}
              tone="text-emerald-700"
            />
            <MiniStat
              label="Weakest"
              value={performance.weakestSubject?.code ?? '—'}
              tone="text-amber-700"
            />
          </section>

          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Progress against the class average"
                description="Percentage across published examinations"
              />
              <CardBody>
                <ProgressChart
                  data={performance.history.map((h) => ({
                    label: h.examName.length > 16 ? `${h.examName.slice(0, 15)}…` : h.examName,
                    percentage: h.percentage,
                    classAverage: classAverages.get(h.examId),
                  }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Subject profile"
                description="Average percentage per subject across all results"
              />
              <CardBody>
                <SubjectRadarChart
                  data={performance.subjectAverages.map((s) => ({
                    subject: s.code,
                    percentage: round(s.average, 1),
                  }))}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Examination history" />
            {performance.history.length === 0 ? (
              <EmptyState
                icon={<LineChart className="h-6 w-6" />}
                title="No published results"
                description="This student has no published examination results yet."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Examination</Th>
                      <Th>Session</Th>
                      <Th>Class</Th>
                      <Th align="center">Obtained</Th>
                      <Th align="center">%</Th>
                      <Th align="center">Class Average</Th>
                      <Th align="center">Difference</Th>
                      <Th align="center">Grade</Th>
                      <Th align="center">Position</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.history.map((entry) => {
                      const average = classAverages.get(entry.examId);
                      const diff = average !== undefined ? round(entry.percentage - average, 2) : null;
                      return (
                        <tr key={entry.examId}>
                          <Td className="font-semibold text-navy-900">{entry.examName}</Td>
                          <Td className="tabular text-slate-600">{entry.sessionName}</Td>
                          <Td className="whitespace-nowrap text-slate-700">
                            {entry.className} — {entry.sectionName}
                          </Td>
                          <Td align="center" className="tabular">
                            {entry.totalObtained} / {entry.totalMaxMarks}
                          </Td>
                          <Td align="center" className="font-bold tabular">
                            {formatPercent(entry.percentage)}
                          </Td>
                          <Td align="center" className="tabular text-slate-600">
                            {average !== undefined ? formatPercent(average, 1) : '—'}
                          </Td>
                          <Td
                            align="center"
                            className={`font-semibold tabular ${
                              diff === null
                                ? 'text-slate-400'
                                : diff > 0
                                  ? 'text-emerald-700'
                                  : diff < 0
                                    ? 'text-rose-700'
                                    : 'text-slate-500'
                            }`}
                          >
                            {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}%`}
                          </Td>
                          <Td align="center">
                            <GradeBadge grade={entry.grade} />
                          </Td>
                          <Td align="center" className="tabular">
                            {entry.classPosition ? ordinal(entry.classPosition) : '—'}
                          </Td>
                          <Td>
                            <ResultStatusBadge status={entry.status} />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </>
  );
}
