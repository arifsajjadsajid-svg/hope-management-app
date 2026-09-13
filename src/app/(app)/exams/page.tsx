import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Plus, Lock } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, LinkButton, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { ExamStatusBadge } from '@/components/ui/status-badge';
import { EXAM_TYPES, EXAM_TYPE_LABELS, EXAM_STATUS_ORDER, EXAM_STATUS_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Examinations' };
export const dynamic = 'force-dynamic';

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('exams.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const current = await getCurrentSession();
  const sessionId = pick('sessionId') || current?.id;
  const type = pick('type');
  const status = pick('status');
  const q = pick('q');

  const [sessions, exams] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.exam.findMany({
      where: {
        ...(sessionId ? { sessionId } : {}),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        ...(q ? { name: { contains: q } } : {}),
      },
      include: {
        session: { select: { name: true } },
        examClasses: { include: { schoolClass: { select: { name: true } } } },
        _count: {
          select: { examSubjects: true, dateSheets: true, rollNumbers: true, marks: true, results: true },
        },
      },
      orderBy: [{ startDate: 'desc' }],
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Examinations"
        description="Create examinations, then build the date sheet, allocate roll numbers, record marks and process results."
        breadcrumbs={[{ label: 'Examinations' }]}
        actions={
          userCan(user, 'exams.create') && (
            <LinkButton href="/exams/new" size="sm">
              <Plus className="h-4 w-4" />
              New Examination
            </LinkButton>
          )
        }
      />

      <Card>
        <FilterBar
          fields={[
            { type: 'search', name: 'q', placeholder: 'Examination name…' },
            {
              type: 'select',
              name: 'sessionId',
              label: 'Session',
              className: 'w-[180px]',
              options: sessions.map((s) => ({ value: s.id, label: s.name })),
            },
            {
              type: 'select',
              name: 'type',
              label: 'Type',
              options: [
                { value: '', label: 'All types' },
                ...EXAM_TYPES.map((t) => ({ value: t, label: EXAM_TYPE_LABELS[t]! })),
              ],
            },
            {
              type: 'select',
              name: 'status',
              label: 'Status',
              options: [
                { value: '', label: 'All statuses' },
                ...EXAM_STATUS_ORDER.map((s) => ({ value: s, label: EXAM_STATUS_LABELS[s]! })),
              ],
            },
          ]}
        />

        {exams.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="No examinations found"
            description="Create an examination to begin the cycle: date sheet, roll numbers, seating, marks and results."
            action={
              userCan(user, 'exams.create') && (
                <LinkButton href="/exams/new">
                  <Plus className="h-4 w-4" />
                  New Examination
                </LinkButton>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Examination</Th>
                  <Th>Classes</Th>
                  <Th>Dates</Th>
                  <Th align="center">Subjects</Th>
                  <Th align="center">Papers</Th>
                  <Th align="center">Roll Nos.</Th>
                  <Th align="center">Marks</Th>
                  <Th align="center">Results</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id}>
                    <Td>
                      <Link
                        href={`/exams/${exam.id}`}
                        className="font-bold text-navy-900 hover:text-royal-700"
                      >
                        {exam.name}
                      </Link>
                      <span className="block text-[11.5px] text-slate-500">
                        {EXAM_TYPE_LABELS[exam.type] ?? exam.type} · {exam.session.name}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {exam.examClasses.slice(0, 3).map((ec) => (
                          <Badge key={ec.id} tone="bg-royal-50 text-royal-700 ring-royal-200">
                            {ec.schoolClass.name}
                          </Badge>
                        ))}
                        {exam.examClasses.length > 3 && (
                          <Badge>+{exam.examClasses.length - 3}</Badge>
                        )}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                      {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
                    </Td>
                    <Td align="center" className="tabular">{exam._count.examSubjects}</Td>
                    <Td align="center" className="tabular">{exam._count.dateSheets}</Td>
                    <Td align="center" className="tabular">{exam._count.rollNumbers}</Td>
                    <Td align="center" className="tabular">{exam._count.marks}</Td>
                    <Td align="center" className="tabular">{exam._count.results}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <ExamStatusBadge status={exam.status} />
                        {exam.resultLocked && (
                          <span title="Result locked">
                            <Lock className="h-3.5 w-3.5 text-navy-700" />
                          </span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
