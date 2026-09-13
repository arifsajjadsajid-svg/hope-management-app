import type { Metadata } from 'next';
import Link from 'next/link';
import { Layers } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { ClassDialog, DeleteClassButton } from '../academics-dialogs';

export const metadata: Metadata = { title: 'Classes' };
export const dynamic = 'force-dynamic';

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('academics.view');
  const canManage = userCan(user, 'classes.manage');
  const params = await searchParams;

  const current = await getCurrentSession();
  const rawSession = params.sessionId;
  const sessionId = (Array.isArray(rawSession) ? rawSession[0] : rawSession) || current?.id;

  const [sessions, classes] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({
      where: sessionId ? { sessionId } : {},
      include: {
        session: { select: { name: true } },
        sections: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        _count: { select: { subjects: true, enrollments: true } },
      },
      orderBy: [{ session: { startDate: 'desc' } }, { displayOrder: 'asc' }],
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Classes"
        description="Class names are free-form — Grade 9, 10th, First Year, Matric, FSc or O-Level all work."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Classes' }]}
        actions={
          canManage && (
            <ClassDialog
              sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
              defaultSessionId={sessionId}
            />
          )
        }
      />

      <Card>
        <FilterBar
          fields={[
            {
              type: 'select',
              name: 'sessionId',
              label: 'Academic Session',
              className: 'w-[220px]',
              options: sessions.map((s) => ({ value: s.id, label: s.name })),
            },
          ]}
        />

        {classes.length === 0 ? (
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title="No classes in this session"
            description="Create a class, then add its sections and subjects."
            action={
              canManage && (
                <ClassDialog
                  sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
                  defaultSessionId={sessionId}
                />
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th align="center">Order</Th>
                  <Th>Class</Th>
                  <Th>Session</Th>
                  <Th>Sections</Th>
                  <Th align="center">Subjects</Th>
                  <Th align="center">Students</Th>
                  <Th>Status</Th>
                  {canManage && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {classes.map((schoolClass) => (
                  <tr key={schoolClass.id}>
                    <Td align="center" className="tabular text-slate-500">
                      {schoolClass.displayOrder}
                    </Td>
                    <Td className="font-bold text-navy-900">{schoolClass.name}</Td>
                    <Td className="text-slate-600 tabular">{schoolClass.session.name}</Td>
                    <Td>
                      {schoolClass.sections.length === 0 ? (
                        <Link
                          href="/academics/sections"
                          className="text-[12.5px] font-semibold text-amber-700 hover:underline"
                        >
                          Add sections
                        </Link>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {schoolClass.sections.map((section) => (
                            <Badge key={section.id} tone="bg-royal-50 text-royal-700 ring-royal-200">
                              {section.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td align="center" className="tabular">
                      <Link
                        href={`/academics/subjects?classId=${schoolClass.id}`}
                        className="font-semibold text-royal-700 hover:underline"
                      >
                        {schoolClass._count.subjects}
                      </Link>
                    </Td>
                    <Td align="center" className="tabular">
                      <Link
                        href={`/students?classId=${schoolClass.id}`}
                        className="font-semibold text-royal-700 hover:underline"
                      >
                        {schoolClass._count.enrollments}
                      </Link>
                    </Td>
                    <Td>
                      {schoolClass.isActive ? (
                        <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
                      ) : (
                        <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Inactive</Badge>
                      )}
                    </Td>
                    {canManage && (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-0.5">
                          <ClassDialog
                            schoolClass={{
                              id: schoolClass.id,
                              name: schoolClass.name,
                              sessionId: schoolClass.sessionId,
                              displayOrder: schoolClass.displayOrder,
                              isActive: schoolClass.isActive,
                            }}
                            sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
                          />
                          {schoolClass._count.enrollments === 0 && (
                            <DeleteClassButton id={schoolClass.id} name={schoolClass.name} />
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
