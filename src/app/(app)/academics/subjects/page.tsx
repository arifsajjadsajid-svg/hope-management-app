import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { SubjectTypeBadge } from '@/components/ui/status-badge';
import { SubjectDialog, DeleteSubjectButton, CopySubjectsDialog } from '../academics-dialogs';
import { SUBJECT_TYPES, SUBJECT_TYPE_LABELS } from '@/lib/constants';
import { formatMarks } from '@/lib/utils';

export const metadata: Metadata = { title: 'Subjects' };
export const dynamic = 'force-dynamic';

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('academics.view');
  const canManage = userCan(user, 'subjects.manage');
  const params = await searchParams;

  const current = await getCurrentSession();
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const sessionId = pick('sessionId') || current?.id;
  const classId = pick('classId');
  const type = pick('type');

  const [sessions, classes, teachers, subjects] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.schoolClass.findMany({
      where: sessionId ? { sessionId } : {},
      include: { session: { select: { name: true } } },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' } }),
    prisma.subject.findMany({
      where: {
        ...(classId ? { classId } : {}),
        ...(type ? { type } : {}),
        ...(sessionId ? { schoolClass: { sessionId } } : {}),
      },
      include: {
        schoolClass: { select: { id: true, name: true, displayOrder: true, session: { select: { name: true } } } },
        teacher: { select: { id: true, fullName: true } },
        _count: { select: { examSubjects: true } },
      },
      orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { displayOrder: 'asc' }],
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
        title="Subjects"
        description="Marks defined here become the defaults for every examination that includes the subject; each examination can override them."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Subjects' }]}
        actions={
          canManage && (
            <>
              <CopySubjectsDialog classes={classOptions} />
              <SubjectDialog
                classes={classOptions}
                teachers={teacherOptions}
                defaultClassId={classId}
              />
            </>
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
              className: 'w-[190px]',
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
            {
              type: 'select',
              name: 'type',
              label: 'Type',
              options: [
                { value: '', label: 'All types' },
                ...SUBJECT_TYPES.map((t) => ({ value: t, label: SUBJECT_TYPE_LABELS[t]! })),
              ],
            },
          ]}
        />

        {subjects.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No subjects found"
            description="Add subjects to a class, or copy an existing subject list from another class."
            action={
              canManage && <SubjectDialog classes={classOptions} teachers={teacherOptions} />
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Class</Th>
                  <Th>Type</Th>
                  <Th align="center">Max</Th>
                  <Th align="center">Passing</Th>
                  <Th align="center">Theory</Th>
                  <Th align="center">Practical</Th>
                  <Th>Subject Teacher</Th>
                  <Th align="center">In Exams</Th>
                  {canManage && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {subjects.map((subject) => (
                  <tr key={subject.id} className={subject.isActive ? undefined : 'opacity-60'}>
                    <Td>
                      <span className="font-bold text-navy-900">{subject.name}</span>
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-slate-600">
                        {subject.code}
                      </span>
                      {!subject.isActive && (
                        <Badge tone="ml-2 bg-slate-100 text-slate-600 ring-slate-200">Inactive</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-700">{subject.schoolClass.name}</Td>
                    <Td>
                      <SubjectTypeBadge type={subject.type} />
                    </Td>
                    <Td align="center" className="font-semibold tabular">
                      {formatMarks(subject.maxMarks)}
                    </Td>
                    <Td align="center" className="tabular text-slate-600">
                      {formatMarks(subject.passingMarks)}
                    </Td>
                    <Td align="center" className="tabular text-slate-600">
                      {formatMarks(subject.theoryMarks)}
                    </Td>
                    <Td align="center" className="tabular text-slate-600">
                      {subject.practicalMarks > 0 ? (
                        <>
                          {formatMarks(subject.practicalMarks)}
                          <span className="ml-1 text-[10.5px] text-slate-400">
                            (pass {formatMarks(subject.practicalPassing)})
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-slate-700">
                      {subject.teacher?.fullName ?? <span className="text-slate-400">—</span>}
                    </Td>
                    <Td align="center" className="tabular text-slate-600">
                      {subject._count.examSubjects}
                    </Td>
                    {canManage && (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-0.5">
                          <SubjectDialog
                            subject={{
                              id: subject.id,
                              classId: subject.classId,
                              name: subject.name,
                              code: subject.code,
                              type: subject.type,
                              maxMarks: subject.maxMarks,
                              passingMarks: subject.passingMarks,
                              theoryMarks: subject.theoryMarks,
                              practicalMarks: subject.practicalMarks,
                              practicalPassing: subject.practicalPassing,
                              teacherId: subject.teacherId,
                              displayOrder: subject.displayOrder,
                              isActive: subject.isActive,
                            }}
                            classes={classOptions}
                            teachers={teacherOptions}
                          />
                          {subject._count.examSubjects === 0 && (
                            <DeleteSubjectButton id={subject.id} name={subject.name} />
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
