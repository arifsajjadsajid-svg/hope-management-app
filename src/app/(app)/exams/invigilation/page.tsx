import type { Metadata } from 'next';
import { ShieldCheck, Printer } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, LinkButton, Alert, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import {
  AssignDutyDialog,
  DeleteDutyButton,
  AutoAssignDutyDialog,
} from './invigilation-clients';
import { formatDate, formatTime12, dayName } from '@/lib/utils';

export const metadata: Metadata = { title: 'Invigilation' };
export const dynamic = 'force-dynamic';

const ROLE_TONE: Record<string, string> = {
  SUPERINTENDENT: 'bg-navy-900 text-gold-300 ring-navy-800',
  INVIGILATOR: 'bg-royal-50 text-royal-700 ring-royal-200',
  RELIEVER: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default async function InvigilationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('exams.view');
  const canManage = userCan(user, 'invigilation.manage');
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
  const teacherFilter = pick('teacherId');

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Invigilation"
          description="Assign teachers to examination rooms."
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Invigilation' }]}
        />
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination and build its date sheet first."
          />
        </Card>
      </>
    );
  }

  const [exam, papers, rooms, teachers, duties] = await Promise.all([
    prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      include: { session: { select: { name: true } } },
    }),
    prisma.dateSheetEntry.findMany({
      where: { examId },
      include: {
        examSubject: { include: { subject: { select: { name: true, code: true } } } },
        schoolClass: { select: { name: true } },
      },
      orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.examRoom.findMany({ where: { isActive: true }, orderBy: { roomNumber: 'asc' } }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' } }),
    prisma.invigilationDuty.findMany({
      where: { examId, ...(teacherFilter ? { teacherId: teacherFilter } : {}) },
      include: {
        teacher: { select: { id: true, fullName: true, employeeCode: true } },
        room: { select: { name: true, roomNumber: true } },
        dateSheetEntry: {
          include: {
            examSubject: { include: { subject: { select: { name: true } } } },
            schoolClass: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { dateSheetEntry: { paperDate: 'asc' } },
        { dateSheetEntry: { startTime: 'asc' } },
        { room: { roomNumber: 'asc' } },
      ],
    }),
  ]);

  const paperOptions = papers.map((paper) => ({
    id: paper.id,
    label: `${formatDate(paper.paperDate)} · ${formatTime12(paper.startTime)} · ${paper.examSubject.subject.name} — ${paper.schoolClass.name}`,
  }));
  const roomOptions = rooms.map((room) => ({
    id: room.id,
    label: `${room.name} (${room.roomNumber})`,
  }));
  const teacherOptions = teachers.map((teacher) => ({
    id: teacher.id,
    label: `${teacher.fullName} — ${teacher.employeeCode}`,
  }));

  // Duty count per teacher, for the workload summary.
  const workload = new Map<string, { name: string; count: number }>();
  for (const duty of duties) {
    const bucket = workload.get(duty.teacherId) ?? { name: duty.teacher.fullName, count: 0 };
    bucket.count += 1;
    workload.set(duty.teacherId, bucket);
  }
  const workloadRows = [...workload.values()].sort((a, b) => b.count - a.count);

  // Group duties by paper date for display.
  const byDate = new Map<string, typeof duties>();
  for (const duty of duties) {
    const key = duty.dateSheetEntry.paperDate.toISOString().slice(0, 10);
    const bucket = byDate.get(key) ?? [];
    bucket.push(duty);
    byDate.set(key, bucket);
  }

  return (
    <>
      <PageHeader
        title="Invigilation Duty Roster"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Invigilation' }]}
        actions={
          <>
            {duties.length > 0 && (
              <LinkButton
                href={`/print/invigilation?examId=${exam.id}`}
                variant="outline"
                size="sm"
                newTab
              >
                <Printer className="h-4 w-4" />
                Print Roster
              </LinkButton>
            )}
            {canManage && (
              <>
                <AutoAssignDutyDialog
                  examId={exam.id}
                  rooms={roomOptions}
                  disabled={papers.length === 0}
                />
                <AssignDutyDialog
                  examId={exam.id}
                  papers={paperOptions}
                  rooms={roomOptions}
                  teachers={teacherOptions}
                  disabled={papers.length === 0}
                />
              </>
            )}
          </>
        }
      />

      {papers.length === 0 && (
        <Alert tone="warning" title="No date sheet" className="mb-5">
          Build the date sheet before assigning invigilation duty.{' '}
          <a href={`/exams/date-sheets?examId=${exam.id}`} className="font-semibold underline">
            Open the date sheet
          </a>
        </Alert>
      )}

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Papers" value={papers.length} tone="navy" />
        <StatCard label="Duties Assigned" value={duties.length} tone="royal" />
        <StatCard label="Teachers on Duty" value={workload.size} tone="emerald" />
        <StatCard
          label="Busiest Teacher"
          value={workloadRows[0]?.count ?? 0}
          hint={workloadRows[0]?.name ?? '—'}
          tone="gold"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Card>
            <FilterBar
              fields={[
                {
                  type: 'select',
                  name: 'examId',
                  label: 'Examination',
                  className: 'min-w-[240px] flex-1',
                  options: exams.map((e) => ({ value: e.id, label: e.name })),
                },
                {
                  type: 'select',
                  name: 'teacherId',
                  label: 'Teacher',
                  className: 'w-[220px]',
                  options: [
                    { value: '', label: 'All teachers' },
                    ...teachers.map((t) => ({ value: t.id, label: t.fullName })),
                  ],
                },
              ]}
            />

            {duties.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-6 w-6" />}
                title="No duties assigned"
                description="Use Auto-assign to distribute duty evenly across the teaching staff, or assign individually."
              />
            ) : (
              <div className="divide-y divide-slate-200">
                {[...byDate.entries()].map(([dateKey, dayDuties]) => (
                  <div key={dateKey}>
                    <div className="flex items-center gap-3 bg-slate-50 px-5 py-2.5">
                      <span className="rounded-md bg-navy-900 px-2.5 py-1 text-[12px] font-bold text-gold-300 tabular">
                        {formatDate(dayDuties[0]!.dateSheetEntry.paperDate)}
                      </span>
                      <span className="text-[13px] font-semibold text-navy-800">
                        {dayName(dayDuties[0]!.dateSheetEntry.paperDate)}
                      </span>
                      <span className="text-[12px] text-slate-500">{dayDuties.length} duties</span>
                    </div>

                    <TableWrap>
                      <Table>
                        <thead className="sr-only">
                          <tr>
                            <Th>Time</Th>
                            <Th>Paper</Th>
                            <Th>Room</Th>
                            <Th>Teacher</Th>
                            <Th>Role</Th>
                            {canManage && <Th align="right">Actions</Th>}
                          </tr>
                        </thead>
                        <tbody>
                          {dayDuties.map((duty) => (
                            <tr key={duty.id}>
                              <Td className="whitespace-nowrap tabular text-slate-700">
                                {formatTime12(duty.dateSheetEntry.startTime)} –{' '}
                                {formatTime12(duty.dateSheetEntry.endTime)}
                              </Td>
                              <Td className="font-semibold text-navy-900">
                                {duty.dateSheetEntry.examSubject.subject.name}
                                <span className="ml-1.5 text-[11.5px] font-normal text-slate-500">
                                  {duty.dateSheetEntry.schoolClass.name}
                                </span>
                              </Td>
                              <Td className="whitespace-nowrap text-slate-700">
                                {duty.room.name}
                                <span className="ml-1 text-[11px] text-slate-400">
                                  ({duty.room.roomNumber})
                                </span>
                              </Td>
                              <Td className="text-slate-800">{duty.teacher.fullName}</Td>
                              <Td>
                                <Badge tone={ROLE_TONE[duty.dutyRole] ?? ROLE_TONE.INVIGILATOR}>
                                  {duty.dutyRole.charAt(0) + duty.dutyRole.slice(1).toLowerCase()}
                                </Badge>
                              </Td>
                              {canManage && (
                                <Td align="right">
                                  <DeleteDutyButton
                                    dutyId={duty.id}
                                    label={`${duty.teacher.fullName} — ${duty.room.name}`}
                                  />
                                </Td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </TableWrap>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="card-title">Duty workload</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Duties per teacher</p>
          </div>
          {workloadRows.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-slate-500">
              No duties assigned yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {workloadRows.map((row) => (
                <li key={row.name} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="truncate text-[13px] text-navy-800">{row.name}</span>
                  <span className="shrink-0 rounded-md bg-navy-900 px-2 py-0.5 text-[12px] font-bold text-gold-300 tabular">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
