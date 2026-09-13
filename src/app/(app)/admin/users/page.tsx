import type { Metadata } from 'next';
import { ShieldCheck, Lock } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge, Alert } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { UserDialog, ResetPasswordButton } from './user-clients';
import { ROLE_LABELS, USER_STATUS } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  INACTIVE: 'bg-slate-100 text-slate-600 ring-slate-200',
  SUSPENDED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await requirePermission('users.manage');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const session = await getCurrentSession();

  const [roles, users, students, teachers] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: {
        ...(pick('roleId') ? { roleId: pick('roleId') } : {}),
        ...(pick('status') ? { status: pick('status') } : {}),
        ...(pick('q')
          ? {
              OR: [
                { username: { contains: pick('q')!.toLowerCase() } },
                { fullName: { contains: pick('q')! } },
                { email: { contains: pick('q')! } },
              ],
            }
          : {}),
      },
      include: {
        role: true,
        student: { select: { fullName: true, admissionNumber: true } },
        teacher: { select: { id: true, fullName: true, employeeCode: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: [{ role: { name: 'asc' } }, { username: 'asc' }],
    }),
    prisma.enrollment.findMany({
      where: { ...(session ? { sessionId: session.id } : {}), student: { status: 'ACTIVE' } },
      include: {
        student: { select: { id: true, fullName: true, admissionNumber: true } },
        schoolClass: { select: { name: true } },
        section: { select: { name: true } },
      },
      orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { rollNumber: 'asc' }],
      take: 800,
    }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' } }),
  ]);

  const roleOptions = roles.map((r) => ({ id: r.id, code: r.code, name: ROLE_LABELS[r.code] ?? r.name }));
  const studentOptions = students.map((e) => ({
    id: e.studentId,
    label: `${e.student.fullName} — ${e.schoolClass.name} ${e.section.name} (${e.student.admissionNumber})`,
  }));
  const teacherOptions = teachers.map((t) => ({
    id: t.id,
    label: `${t.fullName} — ${t.employeeCode}`,
  }));

  const lockedOut = users.filter((u) => u.lockedUntil && u.lockedUntil.getTime() > Date.now());
  const mustChange = users.filter((u) => u.mustChangePassword);

  return (
    <>
      <PageHeader
        title="Users"
        description="Sign-in accounts and the role each one holds. Passwords are stored only as bcrypt hashes and are never visible to anybody."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Users' }]}
        actions={
          <UserDialog roles={roleOptions} students={studentOptions} teachers={teacherOptions} />
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Total Accounts" value={users.length} tone="navy" />
        <StatCard
          label="Active"
          value={users.filter((u) => u.status === 'ACTIVE').length}
          tone="emerald"
        />
        <StatCard
          label="Must Change Password"
          value={mustChange.length}
          tone={mustChange.length ? 'amber' : 'slate'}
        />
        <StatCard
          label="Temporarily Locked"
          value={lockedOut.length}
          tone={lockedOut.length ? 'rose' : 'slate'}
          hint="after repeated failed sign-ins"
        />
      </section>

      {mustChange.length > 0 && (
        <Alert tone="info" className="mb-5">
          {mustChange.length} account(s) are still using an administrator-issued password and will be
          asked to change it at the next sign-in.
        </Alert>
      )}

      <Card>
        <FilterBar
          fields={[
            { type: 'search', name: 'q', placeholder: 'Username, name or email…' },
            {
              type: 'select',
              name: 'roleId',
              label: 'Role',
              className: 'w-[220px]',
              options: [
                { value: '', label: 'All roles' },
                ...roleOptions.map((r) => ({ value: r.id, label: r.name })),
              ],
            },
            {
              type: 'select',
              name: 'status',
              label: 'Status',
              className: 'w-[160px]',
              options: [
                { value: '', label: 'All statuses' },
                ...USER_STATUS.map((s) => ({
                  value: s,
                  label: s.charAt(0) + s.slice(1).toLowerCase(),
                })),
              ],
            },
          ]}
        />

        {users.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="No user accounts found"
            description="Create accounts for the principal, examination controller, teachers and student portals."
            action={
              <UserDialog roles={roleOptions} students={studentOptions} teachers={teacherOptions} />
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Linked To</Th>
                  <Th>Contact</Th>
                  <Th>Last Sign-In</Th>
                  <Th align="center">Sessions</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const locked = user.lockedUntil && user.lockedUntil.getTime() > Date.now();
                  const isSelf = user.id === currentUser.id;

                  return (
                    <tr key={user.id}>
                      <Td>
                        <span className="block font-bold text-navy-900">{user.fullName}</span>
                        <span className="block text-[11.5px] text-slate-500">@{user.username}</span>
                      </Td>
                      <Td>
                        <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">
                          {ROLE_LABELS[user.role.code] ?? user.role.name}
                        </Badge>
                      </Td>
                      <Td className="text-[12.5px] text-slate-700">
                        {user.student
                          ? `${user.student.fullName} (${user.student.admissionNumber})`
                          : user.teacher
                            ? `${user.teacher.fullName} (${user.teacher.employeeCode})`
                            : '—'}
                      </Td>
                      <Td className="text-[12.5px] text-slate-600">
                        {user.email ?? '—'}
                        {user.phone && (
                          <span className="block tabular text-[11.5px]">{user.phone}</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-slate-600 tabular">
                        {formatDateTime(user.lastLoginAt)}
                        {user.lastLoginIp && (
                          <span className="block text-[11px] text-slate-400">{user.lastLoginIp}</span>
                        )}
                      </Td>
                      <Td align="center" className="tabular text-slate-600">
                        {user._count.sessions}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={STATUS_TONE[user.status] ?? STATUS_TONE.INACTIVE}>
                            {user.status.charAt(0) + user.status.slice(1).toLowerCase()}
                          </Badge>
                          {locked && (
                            <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">
                              <Lock className="h-3 w-3" />
                              Locked
                            </Badge>
                          )}
                          {user.mustChangePassword && (
                            <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                              Password change due
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-0.5">
                          <UserDialog
                            roles={roleOptions}
                            students={studentOptions}
                            teachers={teacherOptions}
                            isSelf={isSelf}
                            user={{
                              id: user.id,
                              username: user.username,
                              fullName: user.fullName,
                              email: user.email ?? '',
                              phone: user.phone ?? '',
                              roleId: user.roleId,
                              roleCode: user.role.code,
                              status: user.status,
                              studentId: user.studentId ?? '',
                              teacherId: user.teacher?.id ?? '',
                              mustChangePassword: user.mustChangePassword,
                            }}
                          />
                          {!isSelf && (
                            <ResetPasswordButton userId={user.id} username={user.username} />
                          )}
                        </div>
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
