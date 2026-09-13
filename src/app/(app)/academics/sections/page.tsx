import type { Metadata } from 'next';
import Link from 'next/link';
import { Grid3x3 } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { SectionDialog, DeleteSectionButton } from '../academics-dialogs';

export const metadata: Metadata = { title: 'Sections' };
export const dynamic = 'force-dynamic';

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('academics.view');
  const canManage = userCan(user, 'sections.manage');
  const params = await searchParams;

  const current = await getCurrentSession();
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const sessionId = pick('sessionId') || current?.id;
  const classId = pick('classId');

  const [sessions, classes, teachers, sections] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({
      where: sessionId ? { sessionId } : {},
      include: { session: { select: { name: true } } },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' } }),
    prisma.section.findMany({
      where: {
        ...(classId ? { classId } : {}),
        ...(sessionId ? { schoolClass: { sessionId } } : {}),
      },
      include: {
        schoolClass: { select: { id: true, name: true, displayOrder: true, session: { select: { name: true } } } },
        classTeacher: { select: { id: true, fullName: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { name: 'asc' }],
    }),
  ]);

  const classOptions = classes.map((c) => ({
    id: c.id,
    name: c.name,
    sessionName: c.session.name,
  }));
  const teacherOptions = teachers.map((t) => ({ id: t.id, fullName: t.fullName }));

  return (
    <>
      <PageHeader
        title="Sections"
        description="Each section belongs to a class, carries a class teacher and has a maximum strength that is enforced when students are enrolled."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Sections' }]}
        actions={
          canManage && (
            <SectionDialog
              classes={classOptions}
              teachers={teacherOptions}
              defaultClassId={classId}
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
              className: 'w-[200px]',
              options: sessions.map((s) => ({ value: s.id, label: s.name })),
            },
            {
              type: 'select',
              name: 'classId',
              label: 'Class',
              options: [
                { value: '', label: 'All classes' },
                ...classes.map((c) => ({ value: c.id, label: c.name })),
              ],
            },
          ]}
        />

        {sections.length === 0 ? (
          <EmptyState
            icon={<Grid3x3 className="h-6 w-6" />}
            title="No sections found"
            description="Add a section to a class so students can be enrolled."
            action={
              canManage && <SectionDialog classes={classOptions} teachers={teacherOptions} />
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Class — Section</Th>
                  <Th>Session</Th>
                  <Th>Class Teacher</Th>
                  <Th align="center">Enrolled</Th>
                  <Th align="center">Capacity</Th>
                  <Th>Occupancy</Th>
                  <Th>Status</Th>
                  {canManage && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => {
                  const occupancy = section.maxStrength
                    ? Math.round((section._count.enrollments / section.maxStrength) * 100)
                    : 0;
                  const full = section._count.enrollments >= section.maxStrength;

                  return (
                    <tr key={section.id}>
                      <Td className="font-bold text-navy-900">
                        {section.schoolClass.name} — {section.name}
                      </Td>
                      <Td className="text-slate-600 tabular">{section.schoolClass.session.name}</Td>
                      <Td className="text-slate-700">
                        {section.classTeacher?.fullName ?? (
                          <span className="text-slate-400">Not assigned</span>
                        )}
                      </Td>
                      <Td align="center" className="tabular">
                        <Link
                          href={`/students?sectionId=${section.id}`}
                          className="font-semibold text-royal-700 hover:underline"
                        >
                          {section._count.enrollments}
                        </Link>
                      </Td>
                      <Td align="center" className="tabular text-slate-600">
                        {section.maxStrength}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${
                                full ? 'bg-rose-500' : occupancy > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, occupancy)}%` }}
                            />
                          </div>
                          <span className="text-[11.5px] font-semibold text-slate-600 tabular">
                            {occupancy}%
                          </span>
                        </div>
                      </Td>
                      <Td>
                        {section.isActive ? (
                          <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
                        ) : (
                          <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Inactive</Badge>
                        )}
                      </Td>
                      {canManage && (
                        <Td align="right">
                          <div className="flex items-center justify-end gap-0.5">
                            <SectionDialog
                              section={{
                                id: section.id,
                                name: section.name,
                                classId: section.classId,
                                maxStrength: section.maxStrength,
                                classTeacherId: section.classTeacherId,
                                isActive: section.isActive,
                              }}
                              classes={classOptions}
                              teachers={teacherOptions}
                            />
                            {section._count.enrollments === 0 && (
                              <DeleteSectionButton
                                id={section.id}
                                name={`${section.schoolClass.name} — ${section.name}`}
                              />
                            )}
                          </div>
                        </Td>
                      )}
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
