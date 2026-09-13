import type { Metadata } from 'next';
import { Grid3x3, Printer, Tag, ListChecks } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, EmptyState, LinkButton, Alert, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatCard } from '@/components/ui/stat-card';
import { GenerateSeatingDialog, ClearSeatingButton } from './seating-clients';

export const metadata: Metadata = { title: 'Seating Plans' };
export const dynamic = 'force-dynamic';

/** Deterministic colour per class so the seat grid is readable at a glance. */
const CLASS_TONES = [
  'bg-royal-100 text-royal-800 border-royal-300',
  'bg-emerald-100 text-emerald-800 border-emerald-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-purple-100 text-purple-800 border-purple-300',
  'bg-teal-100 text-teal-800 border-teal-300',
  'bg-rose-100 text-rose-800 border-rose-300',
];

export default async function SeatingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('exams.view');
  const canManage = userCan(user, 'seating.manage');
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

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Seating Plans"
          description="Allocate candidates to examination halls."
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Seating Plans' }]}
        />
        <Card>
          <EmptyState
            icon={<Grid3x3 className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination and generate roll numbers before planning seating."
          />
        </Card>
      </>
    );
  }

  const [exam, rooms, seats, candidateCount] = await Promise.all([
    prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      include: { session: { select: { name: true } } },
    }),
    prisma.examRoom.findMany({ where: { isActive: true }, orderBy: { roomNumber: 'asc' } }),
    prisma.seatAssignment.findMany({
      where: { examId },
      include: {
        room: true,
        student: {
          select: {
            id: true,
            fullName: true,
            fatherName: true,
            enrollments: {
              select: {
                schoolClass: { select: { name: true } },
                section: { select: { name: true } },
              },
              take: 1,
              orderBy: { session: { startDate: 'desc' } },
            },
          },
        },
      },
      orderBy: [{ room: { roomNumber: 'asc' } }, { rowNo: 'asc' }, { colNo: 'asc' }],
    }),
    prisma.rollNumberAllocation.count({ where: { examId } }),
  ]);

  const rollByStudent = new Map(
    (await prisma.rollNumberAllocation.findMany({ where: { examId } })).map((r) => [
      r.studentId,
      r.rollNumber,
    ]),
  );

  // Group the plan by room.
  const byRoom = new Map<string, typeof seats>();
  for (const seat of seats) {
    const bucket = byRoom.get(seat.roomId) ?? [];
    bucket.push(seat);
    byRoom.set(seat.roomId, bucket);
  }

  const classNames = [
    ...new Set(seats.map((s) => s.student.enrollments[0]?.schoolClass.name ?? '—')),
  ].sort();
  const toneForClass = (name: string) =>
    CLASS_TONES[classNames.indexOf(name) % CLASS_TONES.length] ?? CLASS_TONES[0]!;

  return (
    <>
      <PageHeader
        title="Seating Plans"
        description={`${exam.name} · Session ${exam.session.name}`}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Seating Plans' }]}
        actions={
          <>
            {seats.length > 0 && (
              <>
                <LinkButton
                  href={`/print/seating-plan?examId=${exam.id}`}
                  variant="outline"
                  size="sm"
                  newTab
                >
                  <Printer className="h-4 w-4" />
                  Room Charts
                </LinkButton>
                <LinkButton
                  href={`/print/door-list?examId=${exam.id}`}
                  variant="outline"
                  size="sm"
                  newTab
                >
                  <ListChecks className="h-4 w-4" />
                  Door Lists
                </LinkButton>
                <LinkButton
                  href={`/print/seat-labels?examId=${exam.id}`}
                  variant="outline"
                  size="sm"
                  newTab
                >
                  <Tag className="h-4 w-4" />
                  Seat Labels
                </LinkButton>
              </>
            )}
            {canManage && (
              <>
                {seats.length > 0 && (
                  <ClearSeatingButton examId={exam.id} disabled={exam.resultLocked} />
                )}
                <GenerateSeatingDialog
                  examId={exam.id}
                  rooms={rooms.map((r) => ({
                    id: r.id,
                    name: r.name,
                    roomNumber: r.roomNumber,
                    capacity: Math.min(r.capacity, r.rowCount * r.colCount),
                  }))}
                  candidateCount={candidateCount}
                  hasExisting={seats.length > 0}
                  disabled={exam.resultLocked || candidateCount === 0}
                />
              </>
            )}
          </>
        }
      />

      {candidateCount === 0 && (
        <Alert tone="warning" title="No roll numbers allocated" className="mb-5">
          Seating can only be planned once roll numbers exist.{' '}
          <a
            href={`/exams/roll-numbers?examId=${exam.id}`}
            className="font-semibold underline"
          >
            Generate roll numbers
          </a>{' '}
          first.
        </Alert>
      )}

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Candidates" value={candidateCount} tone="navy" />
        <StatCard label="Seated" value={seats.length} tone="emerald" />
        <StatCard label="Rooms Used" value={byRoom.size} tone="royal" />
        <StatCard
          label="Available Capacity"
          value={rooms.reduce((sum, r) => sum + Math.min(r.capacity, r.rowCount * r.colCount), 0)}
          tone="gold"
          hint={`${rooms.length} active room(s)`}
        />
      </section>

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
          ]}
        />
      </Card>

      {seats.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Grid3x3 className="h-6 w-6" />}
            title="No seating plan yet"
            description="Generate a plan to allocate every candidate to a room and seat. Alternate seating keeps neighbouring candidates from the same class apart."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {classNames.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">
                Legend
              </span>
              {classNames.map((name) => (
                <span
                  key={name}
                  className={`rounded border px-2 py-0.5 text-[11.5px] font-semibold ${toneForClass(name)}`}
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {[...byRoom.entries()].map(([roomId, roomSeats]) => {
            const room = roomSeats[0]!.room;
            const grid: (typeof roomSeats)[number][][] = Array.from(
              { length: room.rowCount },
              () => [],
            );
            const seatAt = new Map(roomSeats.map((s) => [`${s.rowNo}-${s.colNo}`, s]));

            return (
              <Card key={roomId}>
                <CardHeader
                  title={`${room.name} (${room.roomNumber})`}
                  description={`${roomSeats.length} of ${Math.min(room.capacity, room.rowCount * room.colCount)} seats occupied · grid ${room.rowCount} × ${room.colCount}`}
                  actions={
                    <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">
                      {room.building ?? 'Examination Hall'}
                    </Badge>
                  }
                />
                <div className="overflow-x-auto p-5">
                  <div className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    ← Front of hall / Invigilator desk →
                  </div>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${room.colCount}, minmax(96px, 1fr))`,
                      minWidth: room.colCount * 104,
                    }}
                  >
                    {grid.flatMap((_, rowIndex) =>
                      Array.from({ length: room.colCount }, (__, colIndex) => {
                        const seat = seatAt.get(`${rowIndex + 1}-${colIndex + 1}`);
                        if (!seat) {
                          return (
                            <div
                              key={`${rowIndex}-${colIndex}`}
                              className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-2 py-2.5 text-center"
                            >
                              <p className="text-[10px] font-semibold text-slate-300">
                                R{rowIndex + 1}C{colIndex + 1}
                              </p>
                              <p className="mt-1 text-[10.5px] text-slate-300">Vacant</p>
                            </div>
                          );
                        }
                        const className = seat.student.enrollments[0]?.schoolClass.name ?? '—';
                        return (
                          <div
                            key={seat.id}
                            className={`rounded-lg border px-2 py-2 text-center ${toneForClass(className)}`}
                            title={`${seat.student.fullName} — ${className}`}
                          >
                            <p className="text-[10px] font-semibold opacity-70">{seat.seatNumber}</p>
                            <p className="mt-0.5 text-[12px] font-bold tabular">
                              {rollByStudent.get(seat.studentId) ?? '—'}
                            </p>
                            <p className="truncate text-[10px] opacity-80">
                              {seat.student.fullName.split(' ')[0]}
                            </p>
                          </div>
                        );
                      }),
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
