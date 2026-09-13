import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { buildPromotionPreview } from '@/server/actions/promotion';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { PromotionWorkbench, PromotionEmpty } from './promotion-client';

export const metadata: Metadata = { title: 'Student Promotion' };
export const dynamic = 'force-dynamic';

export default async function StudentPromotionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('students.promote');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const current = await getCurrentSession();
  const sessions = await prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } });

  const fromSessionId = pick('fromSessionId') || current?.id || sessions[0]?.id;
  const toSessionId =
    pick('toSessionId') || sessions.find((s) => s.id !== fromSessionId)?.id || '';

  const [fromClasses, toClasses] = await Promise.all([
    fromSessionId
      ? prisma.schoolClass.findMany({
          where: { sessionId: fromSessionId },
          orderBy: { displayOrder: 'asc' },
        })
      : Promise.resolve([]),
    toSessionId
      ? prisma.schoolClass.findMany({
          where: { sessionId: toSessionId },
          include: { sections: { orderBy: { name: 'asc' } } },
          orderBy: { displayOrder: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const fromClassId = pick('fromClassId') || fromClasses[0]?.id;
  const fromClass = fromClasses.find((c) => c.id === fromClassId);

  const rows =
    fromSessionId && fromClassId && toSessionId
      ? await buildPromotionPreview(fromSessionId, fromClassId, toSessionId)
      : [];

  const toSession = sessions.find((s) => s.id === toSessionId);

  return (
    <>
      <PageHeader
        title="Student Promotion"
        description="Move a class into the next academic session at the end of the year. Old enrolments and every past result stay exactly as they are."
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Student Promotion' }]}
      />

      {sessions.length < 2 && (
        <Alert tone="warning" title="A second academic session is needed" className="mb-5">
          Create the next academic session under <strong>Academics → Sessions</strong>, with its
          classes and sections, before promoting students into it.
        </Alert>
      )}

      <Alert tone="info" className="mb-5">
        The recommendation for each student comes from their latest published result in the session
        being left — an annual or term result takes precedence over a monthly test. You can override
        any recommendation before confirming.
      </Alert>

      <Card>
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'fromSessionId',
              label: 'From session',
              className: 'w-[180px]',
              options: sessions.map((s) => ({ value: s.id, label: s.name })),
            },
            {
              type: 'select',
              name: 'fromClassId',
              label: 'From class',
              className: 'w-[190px]',
              options: fromClasses.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              type: 'select',
              name: 'toSessionId',
              label: 'To session',
              className: 'w-[180px]',
              options: sessions.map((s) => ({ value: s.id, label: s.name })),
            },
          ]}
        />

        {!fromClass || !toSessionId ? (
          <PromotionEmpty />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ArrowUpRight className="h-6 w-6" />}
            title="No students in this class"
            description="There are no enrolments in the selected class and session."
          />
        ) : (
          <PromotionWorkbench
            rows={rows}
            fromSessionId={fromSessionId!}
            fromClassId={fromClassId!}
            fromClassName={fromClass.name}
            toSessionId={toSessionId}
            toSessionName={toSession?.name ?? ''}
            targetClasses={toClasses.map((c) => ({ id: c.id, label: c.name }))}
            targetSections={toClasses.flatMap((c) =>
              c.sections.map((s) => ({
                id: s.id,
                label: `${c.name} — ${s.name}`,
                classId: c.id,
              })),
            )}
          />
        )}
      </Card>
    </>
  );
}
