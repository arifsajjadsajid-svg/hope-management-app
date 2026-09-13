import type { Metadata } from 'next';
import { IdCard, Printer, LayoutGrid } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, LinkButton, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StudentAvatar } from '@/components/ui/status-badge';

export const metadata: Metadata = { title: 'Roll Number Slips' };
export const dynamic = 'force-dynamic';

const LAYOUTS = [
  { value: '1', label: 'One slip per A4 page', hint: 'Largest — includes the full date sheet' },
  { value: '2', label: 'Two slips per A4 page', hint: 'Balanced — the usual choice' },
  { value: '4', label: 'Four slips per A4 page', hint: 'Compact — saves paper for large cohorts' },
];

export default async function RollSlipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('exams.view');
  const canPrint = userCan(user, 'rollslips.print');
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
  const classId = pick('classId');
  const sectionId = pick('sectionId');
  const perPage = pick('perPage') || '2';

  if (!examId) {
    return (
      <>
        <PageHeader
          title="Roll Number Slips"
          description="Branded, printable examination slips."
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Roll Number Slips' }]}
        />
        <Card>
          <EmptyState
            icon={<IdCard className="h-6 w-6" />}
            title="No examinations yet"
            description="Create an examination and generate roll numbers first."
          />
        </Card>
      </>
    );
  }

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      examClasses: { include: { schoolClass: { select: { id: true, name: true } } } },
    },
  });

  const sections = await prisma.section.findMany({
    where: { classId: { in: exam.examClasses.map((c) => c.classId) } },
    include: { schoolClass: { select: { name: true } } },
    orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { name: 'asc' }],
  });

  const allocations = await prisma.rollNumberAllocation.findMany({
    where: {
      examId,
      ...(classId ? { enrollment: { classId } } : {}),
      ...(sectionId ? { enrollment: { sectionId } } : {}),
    },
    include: {
      student: { select: { id: true, fullName: true, fatherName: true, photoPath: true, admissionNumber: true } },
      enrollment: {
        include: {
          schoolClass: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
    orderBy: [{ sequence: 'asc' }, { rollNumber: 'asc' }],
  });

  const seats = await prisma.seatAssignment.findMany({
    where: { examId },
    include: { room: { select: { name: true, roomNumber: true } } },
  });
  const seatByStudent = new Map(seats.map((s) => [s.studentId, s]));

  const printQuery = new URLSearchParams({ examId, perPage });
  if (classId) printQuery.set('classId', classId);
  if (sectionId) printQuery.set('sectionId', sectionId);

  return (
    <>
      <PageHeader
        title="Roll Number Slips"
        description={`${exam.name} · Session ${exam.session.name} · ${allocations.length} slip(s) ready`}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Roll Number Slips' }]}
        actions={
          canPrint &&
          allocations.length > 0 && (
            <LinkButton href={`/print/roll-slips?${printQuery.toString()}`} size="sm" newTab>
              <Printer className="h-4 w-4" />
              Print {allocations.length} Slip{allocations.length === 1 ? '' : 's'}
            </LinkButton>
          )
        }
      />

      {allocations.length === 0 && (
        <Alert tone="warning" title="No roll numbers allocated" className="mb-5">
          Slips can only be printed once roll numbers exist.{' '}
          <a href={`/exams/roll-numbers?examId=${exam.id}`} className="font-semibold underline">
            Generate roll numbers
          </a>{' '}
          first.
        </Alert>
      )}

      <Card className="mb-5">
        <CardHeader
          title="Page layout"
          description="Choose how many slips are printed on each A4 sheet."
        />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {LAYOUTS.map((layout) => {
            const query = new URLSearchParams({ examId, perPage: layout.value });
            if (classId) query.set('classId', classId);
            if (sectionId) query.set('sectionId', sectionId);
            const active = perPage === layout.value;
            return (
              <a
                key={layout.value}
                href={`/exams/roll-slips?${query.toString()}`}
                className={`rounded-xl border-2 p-4 transition ${
                  active
                    ? 'border-navy-900 bg-navy-50/60'
                    : 'border-slate-200 bg-white hover:border-navy-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid
                    className={`h-4 w-4 ${active ? 'text-navy-900' : 'text-slate-400'}`}
                  />
                  <span className="text-[13.5px] font-bold text-navy-900">{layout.label}</span>
                </span>
                <span className="mt-1 block text-[12px] text-slate-500">{layout.hint}</span>
              </a>
            );
          })}
        </CardBody>
      </Card>

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
            {
              type: 'select',
              name: 'sectionId',
              label: 'Section',
              options: [
                { value: '', label: 'All sections' },
                ...sections
                  .filter((s) => !classId || s.classId === classId)
                  .map((s) => ({
                    value: s.id,
                    label: `${s.schoolClass.name} — ${s.name}`,
                  })),
              ],
            },
          ]}
        />

        {allocations.length === 0 ? (
          <EmptyState
            icon={<IdCard className="h-6 w-6" />}
            title="No slips to print"
            description="No roll numbers match the current filters."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th align="center">Roll No.</Th>
                  <Th>Student</Th>
                  <Th>Father Name</Th>
                  <Th>Admission No.</Th>
                  <Th>Class / Section</Th>
                  <Th>Room</Th>
                  <Th align="center">Seat</Th>
                  <Th align="right">Slip</Th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((allocation) => {
                  const seat = seatByStudent.get(allocation.studentId);
                  return (
                    <tr key={allocation.id}>
                      <Td align="center">
                        <span className="rounded-md bg-navy-900 px-2 py-1 text-[12px] font-bold text-gold-300 tabular">
                          {allocation.rollNumber}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <StudentAvatar
                            name={allocation.student.fullName}
                            photoPath={allocation.student.photoPath}
                            size={32}
                          />
                          <span className="font-semibold text-navy-900">
                            {allocation.student.fullName}
                          </span>
                        </span>
                      </Td>
                      <Td className="text-slate-700">{allocation.student.fatherName}</Td>
                      <Td className="whitespace-nowrap tabular text-slate-600">
                        {allocation.student.admissionNumber}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-700">
                        {allocation.enrollment.schoolClass.name} —{' '}
                        {allocation.enrollment.section.name}
                      </Td>
                      <Td className="whitespace-nowrap text-[12.5px] text-slate-600">
                        {seat ? `${seat.room.name} (${seat.room.roomNumber})` : '—'}
                      </Td>
                      <Td align="center" className="tabular text-slate-600">
                        {seat?.seatNumber ?? '—'}
                      </Td>
                      <Td align="right">
                        {canPrint && (
                          <a
                            href={`/print/roll-slips?examId=${exam.id}&studentId=${allocation.studentId}&perPage=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[12.5px] font-semibold text-royal-700 hover:underline"
                          >
                            Print
                          </a>
                        )}
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
  );
}
