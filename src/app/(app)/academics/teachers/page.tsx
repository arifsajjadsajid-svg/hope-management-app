import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { TeacherDialog, DeleteTeacherButton } from '../academics-dialogs';
import { GENDER_LABELS } from '@/lib/constants';
import { formatDate, toISODateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Teachers' };
export const dynamic = 'force-dynamic';

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('academics.view');
  const canManage = userCan(user, 'teachers.manage');
  const params = await searchParams;

  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const q = pick('q');
  const status = pick('status');

  const session = await getCurrentSession();

  const teachers = await prisma.teacher.findMany({
    where: {
      ...(status === 'ACTIVE' ? { isActive: true } : status === 'INACTIVE' ? { isActive: false } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { employeeCode: { contains: q } },
              { phone: { contains: q } },
              { qualification: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      user: { select: { id: true, username: true, status: true } },
      subjects: {
        where: session ? { schoolClass: { sessionId: session.id } } : {},
        select: { id: true, name: true, code: true, schoolClass: { select: { name: true } } },
      },
      classTeacherOf: {
        where: session ? { schoolClass: { sessionId: session.id } } : {},
        select: { id: true, name: true, schoolClass: { select: { name: true } } },
      },
      _count: { select: { assignments: true, invigilations: true } },
    },
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
  });

  return (
    <>
      <PageHeader
        title="Teachers"
        description={
          session
            ? `Teaching staff and their subject assignments for session ${session.name}.`
            : 'Teaching staff of the academy.'
        }
        breadcrumbs={[{ label: 'Academics' }, { label: 'Teachers' }]}
        actions={canManage && <TeacherDialog />}
      />

      <Card>
        <FilterBar
          fields={[
            { type: 'search', name: 'q', placeholder: 'Name, employee code, phone…' },
            {
              type: 'select',
              name: 'status',
              label: 'Status',
              className: 'w-[160px]',
              options: [
                { value: '', label: 'All' },
                { value: 'ACTIVE', label: 'On staff' },
                { value: 'INACTIVE', label: 'Inactive' },
              ],
            },
          ]}
        />

        {teachers.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-6 w-6" />}
            title="No teachers found"
            description="Add teaching staff so subjects, class-teacher duty and invigilation can be assigned."
            action={canManage && <TeacherDialog />}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Teacher</Th>
                  <Th>Code</Th>
                  <Th>Designation</Th>
                  <Th>Qualification</Th>
                  <Th>Subjects</Th>
                  <Th>Class Teacher Of</Th>
                  <Th>Contact</Th>
                  <Th>Login</Th>
                  <Th>Status</Th>
                  {canManage && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className={teacher.isActive ? undefined : 'opacity-60'}>
                    <Td>
                      <span className="block font-bold text-navy-900">{teacher.fullName}</span>
                      <span className="block text-[11.5px] text-slate-500">
                        {teacher.gender ? GENDER_LABELS[teacher.gender] : '—'}
                        {teacher.joiningDate ? ` · joined ${formatDate(teacher.joiningDate)}` : ''}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap tabular text-slate-700">{teacher.employeeCode}</Td>
                    <Td className="text-slate-700">{teacher.designation ?? '—'}</Td>
                    <Td className="text-slate-700">{teacher.qualification ?? '—'}</Td>
                    <Td>
                      {teacher.subjects.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {teacher.subjects.slice(0, 4).map((subject) => (
                            <Badge key={subject.id} tone="bg-royal-50 text-royal-700 ring-royal-200">
                              {subject.code} · {subject.schoolClass.name}
                            </Badge>
                          ))}
                          {teacher.subjects.length > 4 && (
                            <Badge>+{teacher.subjects.length - 4}</Badge>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {teacher.classTeacherOf.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {teacher.classTeacherOf.map((section) => (
                            <Badge key={section.id} tone="bg-gold-100 text-gold-800 ring-gold-300">
                              {section.schoolClass.name} — {section.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-slate-600 tabular">
                      {teacher.phone ?? '—'}
                    </Td>
                    <Td>
                      {teacher.user ? (
                        <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                          {teacher.user.username}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-slate-400">No account</span>
                      )}
                    </Td>
                    <Td>
                      {teacher.isActive ? (
                        <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">On staff</Badge>
                      ) : (
                        <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Inactive</Badge>
                      )}
                    </Td>
                    {canManage && (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-0.5">
                          <TeacherDialog
                            teacher={{
                              id: teacher.id,
                              employeeCode: teacher.employeeCode,
                              fullName: teacher.fullName,
                              fatherName: teacher.fatherName,
                              cnic: teacher.cnic,
                              gender: teacher.gender,
                              designation: teacher.designation,
                              qualification: teacher.qualification,
                              phone: teacher.phone,
                              email: teacher.email,
                              address: teacher.address,
                              joiningDate: toISODateInput(teacher.joiningDate),
                              isActive: teacher.isActive,
                            }}
                          />
                          {teacher.subjects.length === 0 &&
                            teacher.classTeacherOf.length === 0 &&
                            teacher._count.invigilations === 0 && (
                              <DeleteTeacherButton id={teacher.id} name={teacher.fullName} />
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
