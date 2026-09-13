'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, ShieldCheck, Lock } from 'lucide-react';
import { Alert, Button, Card, CardBody, CardHeader, Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { updateRolePermissionsAction } from '@/server/actions/admin';

export type PermissionGroup = {
  group: string;
  permissions: { code: string; name: string }[];
};

export function RolePermissionEditor({
  roleId,
  roleName,
  roleCode,
  description,
  userCount,
  granted,
  groups,
  locked,
  lockReason,
}: {
  roleId: string;
  roleName: string;
  roleCode: string;
  description: string | null;
  userCount: number;
  granted: string[];
  groups: PermissionGroup[];
  locked: boolean;
  lockReason?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set(granted));
  const [pending, setPending] = React.useState(false);

  const initial = React.useRef(new Set(granted));
  const dirty =
    selected.size !== initial.current.size ||
    [...selected].some((code) => !initial.current.has(code));

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const toggleGroup = (group: PermissionGroup, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const permission of group.permissions) {
        if (on) next.add(permission.code);
        else next.delete(permission.code);
      }
      return next;
    });

  const save = async () => {
    setPending(true);
    const result = await updateRolePermissionsAction(roleId, [...selected]);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Permissions updated.');
      initial.current = new Set(selected);
      router.refresh();
    } else {
      toast.error('Could not update permissions', result.error);
    }
  };

  return (
    <Card>
      <CardHeader
        title={roleName}
        description={description ?? undefined}
        actions={
          <>
            <Badge tone="bg-slate-100 text-slate-700 ring-slate-200">
              {userCount} account{userCount === 1 ? '' : 's'}
            </Badge>
            <Badge tone="bg-royal-50 text-royal-700 ring-royal-200">
              {locked ? 'All permissions' : `${selected.size} permission(s)`}
            </Badge>
            {!locked && (
              <Button size="sm" onClick={save} loading={pending} disabled={!dirty}>
                {!pending && <Save className="h-4 w-4" />}
                Save
              </Button>
            )}
          </>
        }
      />

      <CardBody className="space-y-4">
        {locked && (
          <Alert tone="info" title="This role cannot be edited">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              {lockReason}
            </span>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const groupCodes = group.permissions.map((p) => p.code);
            const allOn = groupCodes.every((code) => selected.has(code));
            const someOn = groupCodes.some((code) => selected.has(code));

            return (
              <div key={group.group} className="rounded-xl border border-slate-200 p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-navy-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {group.group}
                  </p>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group, !allOn)}
                      className="text-[11.5px] font-semibold text-royal-700 hover:underline"
                    >
                      {allOn ? 'None' : 'All'}
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {group.permissions.map((permission) => (
                    <label
                      key={permission.code}
                      className={`flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-[12.5px] transition ${
                        locked ? 'cursor-default opacity-70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={locked || selected.has(permission.code)}
                        disabled={locked}
                        onChange={() => toggle(permission.code)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-royal-600 focus:ring-royal-300"
                      />
                      <span className="leading-snug text-navy-800">{permission.name}</span>
                    </label>
                  ))}
                </div>

                {someOn && !allOn && !locked && (
                  <p className="mt-2 text-[11px] text-slate-400">Partially granted</p>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
