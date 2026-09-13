import type { Metadata } from 'next';
import { CalendarDays, Printer } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, EmptyState, LinkButton, Alert, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import {
  DateSheetEntryDialog,
  DeleteDateSheetEntryButton,
  AutoBuildDateSheetButton,
} from './date-sheet-clients';
import { formatDate, formatTime12, formatDuration, dayName, toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Date Sheets' };
export const dynamic = 'force-dynamic';

export default async function DateSheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('exams.view');
  const canManage = userCan(user, 'datesheet.manage');
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
  const classFilter = pick('classId');

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Date Sheets"
          description="Build the paper-by-paper schedule for an examination."
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Date Sheets' }]}
        />
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination before building a date sheet."
            action={
              userCan(user, 'exams.create') && (
                <LinkButton href="/exams/new">Create Examination</LinkButton>
              )
            }
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      examClasses: { include: { schoolClass: { select: { id: true, name: true } } } },
      examSubjects: {
        where: { isIncluded: true },
        include: {
          subject: { select: { name: true, code: true, classId: true, schoolClass: { select: { name: true } } } },
        },
        orderBy: { displayOrder: 'asc' },
      },
      dateSheets: {
        where: classFilter ? { classId: classFilter } : {},
        include: {
          examSubject: { include: { subject: { select: { name: true, code: true } } } },
          schoolClass: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          room: { select: { id: true, name: true, roomNumber: true } },
        },
        orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
      },
    },
  });

  if (!exam) {
    return (
      <Card>
        <EmptyState title="Examination not found" description="It may have been deleted." />
      </Card>
    );
  }

  const [sections, rooms] = await Promise.all([
    prisma.section.findMany({
      where: { classId: { in: exam.examClasses.map((c) => c.classId) } },
      select: { id: true, name: true, classId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.examRoom.findMany({
      where: { isActive: true },
      select: { id: true, name: true, roomNumber: true },
      orderBy: { roomNumber: 'asc' },
    }),
  ]);

  const subjectOptions = exam.examSubjects.map((es) => ({
    examSubjectId: es.id,
    label: `${es.subject.name} (${es.subject.code}) — ${es.subject.schoolClass.name}`,
    classId: es.subject.classId,
    className: es.subject.schoolClass.name,
  }));

  const scheduled = new Set(exam.dateSheets.map((d) => `${d.examSubjectId}|${d.classId}`));
  const unscheduled = subjectOptions.filter(
    (s) => !scheduled.has(`${s.examSubjectId}|${s.classId}`),
  );

  // Group papers by date for display.
  const byDate = new Map<string, typeof exam.dateSheets>();
  for (const entry of exam.dateSheets) {
    const key = entry.paperDate.toISOString().slice(0, 10);
    const bucket = byDate.get(key) ?? [];
    bucket.push(entry);
    byDate.set(key, bucket);
  }

  const locked = exam.resultLocked;

  return (
    <>
      <PageHeader
        title="Date Sheets"
        description={`${exam.name} · Session ${exam.session.name} · ${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Date Sheets' }]}
        actions={
          <>
            <LinkButton
              href={`/print/date-sheet?examId=${exam.id}${classFilter ? `&classId=${classFilter}` : ''}`}
              variant="outline"
              size="sm"
              newTab
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </LinkButton>
            {canManage && (
              <>
                <AutoBuildDateSheetButton
                  examId={exam.id}
                  defaultStart={toISODateInput(exam.startDate)}
                  disabled={locked}
                />
                <DateSheetEntryDialog
                  examId={exam.id}
                  subjects={subjectOptions}
                  sections={sections}
                  rooms={rooms}
                  disabled={locked}
                />
              </>
            )}
          </>
        }
      />

      {locked && (
        <Alert tone="warning" title="Results are locked" className="mb-5">
          The date sheet for this examination can no longer be changed.
        </Alert>
      )}

      {unscheduled.length > 0 && (
        <Alert tone="info" title={`${unscheduled.length} subject(s) not yet scheduled`} className="mb-5">
          {unscheduled.map((s) => s.label).join(' · ')}
        </Alert>
      )}

      <Card>
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'examId',
              label: 'Examination',
              className: 'min-w-[260px] flex-1',
              options: exams.map((e) => ({ value: e.id, label: e.name })),
            },
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              options: [
                { value: '', label: 'All classes' },
                ...exam.examClasses.map((ec) => ({
                  value: ec.schoolClass.id,
                  label: ec.schoolClass.name,
                })),
              ],
            },
          ]}
        />

        {exam.dateSheets.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="No papers scheduled"
            description="Use Auto-build to lay out one paper per working day, or add papers individually."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {[...byDate.entries()].map(([dateKey, entries]) => (
              <div key={dateKey}>
                <div className="flex items-center gap-3 bg-slate-50 px-5 py-2.5">
                  <span className="rounded-md bg-navy-900 px-2.5 py-1 text-[12px] font-bold text-gold-300 tabular">
                    {formatDate(entries[0]!.paperDate)}
                  </span>
                  <span className="text-[13px] font-semibold text-navy-800">
                    {dayName(entries[0]!.paperDate)}
                  </span>
                  <span className="text-[12px] text-slate-500">
                    {entries.length} paper{entries.length === 1 ? '' : 's'}
                  </span>
                </div>

                <TableWrap>
                  <Table>
                    <thead className="sr-only">
                      <tr>
                        <Th>Subject</Th>
                        <Th>Class</Th>
                        <Th>Section</Th>
                        <Th>Time</Th>
                        <Th>Duration</Th>
                        <Th>Room</Th>
                        {canManage && <Th align="right">Actions</Th>}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <Td className="font-semibold text-navy-900">
                            {entry.examSubject.subject.name}
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
                              {entry.examSubject.subject.code}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap text-slate-700">
                            {entry.schoolClass.name}
                          </Td>
                          <Td>
                            {entry.section ? (
                              <Badge tone="bg-royal-50 text-royal-700 ring-royal-200">
                                {entry.section.name}
                              </Badge>
                            ) : (
                              <span className="text-[12px] text-slate-400">All sections</span>
                            )}
                          </Td>
                          <Td className="whitespace-nowrap tabular text-slate-700">
                            {formatTime12(entry.startTime)} – {formatTime12(entry.endTime)}
                          </Td>
                          <Td className="whitespace-nowrap text-[12.5px] text-slate-600">
                            {formatDuration(entry.durationMinutes)}
                          </Td>
                          <Td className="whitespace-nowrap text-[12.5px] text-slate-600">
                            {entry.room ? `${entry.room.name} (${entry.room.roomNumber})` : '—'}
                          </Td>
                          {canManage && (
                            <Td align="right">
                              <div className="flex items-center justify-end gap-0.5">
                                <DateSheetEntryDialog
                                  examId={exam.id}
                                  subjects={subjectOptions}
                                  sections={sections}
                                  rooms={rooms}
                                  disabled={locked}
                                  entry={{
                                    id: entry.id,
                                    examSubjectId: entry.examSubjectId,
                                    classId: entry.classId,
                                    sectionId: entry.sectionId ?? '',
                                    paperDate: toISODateInput(entry.paperDate),
                                    startTime: entry.startTime,
                                    endTime: entry.endTime,
                                    roomId: entry.roomId ?? '',
                                    instructions: entry.instructions ?? '',
                                  }}
                                />
                                <DeleteDateSheetEntryButton
                                  entryId={entry.id}
                                  label={`${entry.examSubject.subject.name} — ${entry.schoolClass.name}`}
                                  disabled={locked}
                                />
                              </div>
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
    </>
  );
}
