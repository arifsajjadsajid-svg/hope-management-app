'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { changeOwnPasswordAction } from '@/server/actions/auth';

export function ChangePasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(changeOwnPasswordAction, null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const handled = React.useRef<unknown>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Password updated.');
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form ref={formRef} action={formAction} className="max-w-md space-y-4" noValidate>
      {state && !state.ok && (
        <Alert tone="danger" title="Could not update password">
          {state.error}
        </Alert>
      )}
      {state?.ok && (
        <Alert tone="success" title="Password updated">
          Your new password is active. Every other device has been signed out.
        </Alert>
      )}

      <Field
        label="Current password"
        htmlFor="currentPassword"
        required
        error={errors.currentPassword}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </Field>

      <Field
        label="New password"
        htmlFor="newPassword"
        required
        hint="At least 8 characters, including a letter and a digit."
        error={errors.newPassword}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        required
        error={errors.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
        />
      </Field>

      <Button type="submit" loading={pending}>
        {!pending && <KeyRound className="h-4 w-4" />}
        Update Password
      </Button>
    </form>
  );
}
