import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/primitives';
import { RolePermissionEditor, type PermissionGroup } from './role-editor';
import { permissionGroups } from '@/lib/permissions';
import { ROLE, ROLE_LABELS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Roles & Permissions' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const currentUser = await requirePermission('roles.manage');

  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: { select: { code: true } } } },
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  });

  const groups: PermissionGroup[] = Object.entries(permissionGroups()).map(
    ([group, permissions]) => ({ group, permissions }),
  );

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Every guarded action in the system maps to a permission. Grant only what each role genuinely needs."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Roles & Permissions' }]}
      />

      <Alert tone="info" className="mb-5">
        Changes take effect the next time a user loads a page. The Super Admin role always holds
        every permission, and you cannot edit the permissions of your own role — this keeps at least
        one fully capable account in the system at all times.
      </Alert>

      <div className="space-y-5">
        {roles.map((role) => {
          const isSuperAdmin = role.code === ROLE.SUPER_ADMIN;
          const isOwnRole = role.code === currentUser.roleCode;

          return (
            <RolePermissionEditor
              key={role.id}
              roleId={role.id}
              roleName={ROLE_LABELS[role.code] ?? role.name}
              roleCode={role.code}
              description={role.description}
              userCount={role._count.users}
              granted={role.permissions.map((p) => p.permission.code)}
              groups={groups}
              locked={isSuperAdmin || isOwnRole}
              lockReason={
                isSuperAdmin
                  ? 'The Super Admin role always holds every permission so the system can never be locked out.'
                  : 'This is your own role. Ask another Super Admin to change it.'
              }
            />
          );
        })}
      </div>
    </>
  );
}
