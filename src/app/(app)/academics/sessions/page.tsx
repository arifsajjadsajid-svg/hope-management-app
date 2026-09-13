import type { Metadata } from 'next';
import { CalendarRange } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge, Alert } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { SessionDialog, DeleteSessionButton } from '../academics-dialogs';
import { formatDate, toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Academic Sessions' };
export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const user = await requirePermission('academics.view');
  const canManage = userCan(user, 'sessions.manage');

  const sessions = await prisma.academicSession.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { classes: true, enrollments: true, exams: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Academic Sessions"
        description="Every student record, examination and result belongs to a session. Closing a session preserves its history permanently."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Sessions' }]}
        actions={canManage && <SessionDialog />}
      />

      <Alert tone="info" className="mb-5">
        Previous sessions are never overwritten. When students are promoted, a new enrolment is
        created in the next session while the old one stays intact for academic history.
      </Alert>

      <Card>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarRange className="h-6 w-6" />}
            title="No academic sessions yet"
            description="Create your first session, for example 2026-2027, to begin enrolling students."
            action={canManage && <SessionDialog />}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Session</Th>
                  <Th>Period</Th>
                  <Th align="center">Classes</Th>
                  <Th align="center">Enrolments</Th>
                  <Th align="center">Examinations</Th>
                  <Th>Status</Th>
                  {canManage && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <Td className="font-bold text-navy-900 tabular">{session.name}</Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                      {formatDate(session.startDate)} – {formatDate(session.endDate)}
                    </Td>
                    <Td align="center" className="tabular">{session._count.classes}</Td>
                    <Td align="center" className="tabular">{session._count.enrollments}</Td>
                    <Td align="center" className="tabular">{session._count.exams}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {session.isCurrent && (
                          <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">Current</Badge>
                        )}
                        {session.isClosed ? (
                          <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Closed</Badge>
                        ) : (
                          <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Open</Badge>
                        )}
                      </div>
                    </Td>
                    {canManage && (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-0.5">
                          <SessionDialog
                            session={{
                              id: session.id,
                              name: session.name,
                              startDate: toISODateInput(session.startDate),
                              endDate: toISODateInput(session.endDate),
                              isCurrent: session.isCurrent,
                              isClosed: session.isClosed,
                            }}
                          />
                          {session._count.enrollments === 0 && session._count.exams === 0 && (
                            <DeleteSessionButton id={session.id} name={session.name} />
                          )}
                        </div>
                      </Td>
                    )}
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
