'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, KeyRound, Save } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
} from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { USER_STATUS, ROLE } from '@/lib/constants';
import { saveUserAction, resetUserPasswordAction } from '@/server/actions/admin';

export type RoleOption = { id: string; code: string; name: string };
export type LinkOption = { id: string; label: string };

export type UserValues = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  roleId: string;
  roleCode: string;
  status: string;
  studentId: string;
  teacherId: string;
  mustChangePassword: boolean;
};

export function UserDialog({
  user,
  roles,
  students,
  teachers,
  isSelf,
}: {
  user?: UserValues;
  roles: RoleOption[];
  students: LinkOption[];
  teachers: LinkOption[];
  isSelf?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const action = React.useMemo(() => saveUserAction.bind(null, user?.id ?? null), [user?.id]);
  const [state, formAction, pending] = useActionState(action, null);
  const handled = React.useRef<unknown>(null);

  const [roleId, setRoleId] = React.useState(user?.roleId ?? roles[0]?.id ?? '');
  const selectedRole = roles.find((r) => r.id === roleId);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'User saved.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not save the user', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      {user ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-slate-500 transition hover:bg-royal-50 hover:text-royal-700"
          aria-label="Edit user"
          title="Edit user"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New User
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={user ? `Edit user — ${user.username}` : 'Create user account'}
        description={
          user
            ? 'Leave the password blank to keep the current one.'
            : 'The account is created with the password you set here.'
        }
        size="lg"
      >
        <form action={formAction} className="space-y-4" noValidate>
          {state && !state.ok && (
            <Alert tone="danger" title="Could not save">
              {state.error}
            </Alert>
          )}

          {isSelf && (
            <Alert tone="warning">
              This is your own account. You cannot change your own role or deactivate yourself.
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username" htmlFor="username" required error={errors.username}>
              <Input
                id="username"
                name="username"
                defaultValue={user?.username}
                required
                placeholder="controller"
                autoComplete="off"
              />
            </Field>
            <Field label="Full Name" htmlFor="fullName" required error={errors.fullName}>
              <Input id="fullName" name="fullName" defaultValue={user?.fullName} required />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" name="email" type="email" defaultValue={user?.email} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" name="phone" defaultValue={user?.phone} className="tabular" />
            </Field>

            <Field label="Role" htmlFor="roleId" required error={errors.roleId}>
              <Select
                id="roleId"
                name="roleId"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
                disabled={isSelf}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Status" htmlFor="status" required error={errors.status}>
              <Select id="status" name="status" defaultValue={user?.status ?? 'ACTIVE'} disabled={isSelf}>
                {USER_STATUS.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0) + value.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {selectedRole?.code === ROLE.STUDENT && (
            <Field
              label="Linked Student"
              htmlFor="studentId"
              required
              hint="The portal shows this student's date sheet, roll slip and results."
              error={errors.studentId}
            >
              <Select id="studentId" name="studentId" defaultValue={user?.studentId ?? ''} required>
                <option value="">Select student…</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {selectedRole?.code === ROLE.TEACHER && (
            <Field
              label="Linked Teacher"
              htmlFor="teacherId"
              hint="Required for marks entry, so the system knows which subjects this account may edit."
              error={errors.teacherId}
            >
              <Select id="teacherId" name="teacherId" defaultValue={user?.teacherId ?? ''}>
                <option value="">Not linked</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label={user ? 'New password (optional)' : 'Password'}
            htmlFor="password"
            required={!user}
            hint="At least 8 characters, including a letter and a digit."
            error={errors.password}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required={!user}
              placeholder={user ? 'Leave blank to keep the current password' : ''}
            />
          </Field>

          <Checkbox
            name="mustChangePassword"
            defaultChecked={user?.mustChangePassword ?? true}
            label="Require this user to choose a new password at the next sign-in"
          />

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save className="h-4 w-4" />}
              Save User
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Password reset requires the administrator's own password. */
export function ResetPasswordButton({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmWith, setConfirmWith] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = async () => {
    setPending(true);
    setErrors({});
    const result = await resetUserPasswordAction(userId, newPassword, confirmWith);
    setPending(false);

    if (result.ok) {
      toast.success(result.message ?? 'Password reset.');
      setOpen(false);
      setNewPassword('');
      setConfirmWith('');
      router.refresh();
    } else {
      setErrors(result.fieldErrors ?? {});
      toast.error('Could not reset the password', result.error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700"
        aria-label="Reset password"
        title="Reset password"
      >
        <KeyRound className="h-4 w-4" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Reset password — ${username}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={submit}
              loading={pending}
              disabled={newPassword.length < 8 || confirmWith.length === 0}
            >
              Reset Password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">
            The user is signed out of every device and must choose a new password at the next
            sign-in. This is recorded in the audit log.
          </Alert>

          <Field
            label="New password for this user"
            htmlFor="reset-new"
            required
            hint="At least 8 characters, including a letter and a digit."
            error={errors.newPassword}
          >
            <Input
              id="reset-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>

          <Field
            label="Confirm with your own password"
            htmlFor="reset-confirm"
            required
            error={errors.confirmWithPassword}
          >
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="current-password"
              value={confirmWith}
              onChange={(e) => setConfirmWith(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
