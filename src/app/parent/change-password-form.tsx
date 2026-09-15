'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { parentChangePasswordAction } from '@/server/actions/parent-auth';
import type { ActionResult } from '@/server/action-result';

/**
 * Used both for the forced change at first sign-in and for a voluntary change
 * later from the account page.
 */
export function ParentChangePasswordForm({
  firstSignIn,
  doneHref,
}: {
  firstSignIn?: boolean;
  doneHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    parentChangePasswordAction,
    null,
  );
  const [values, setValues] = React.useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  React.useEffect(() => {
    if (!state?.ok) return;
    toast.success(state.message ?? 'Password changed.');
    setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
    router.replace(doneHref);
    router.refresh();
  }, [state, toast, router, doneHref]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const set = (name: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    React.startTransition(() => formAction(data));
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {state && !state.ok && (
        <Alert tone="danger" title="Password not changed">
          {state.error}
        </Alert>
      )}

      <Field
        label={firstSignIn ? 'Password the academy gave you' : 'Current password'}
        htmlFor="currentPassword"
        required
        error={errors.currentPassword}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={set('currentPassword')}
          className="text-[16px]"
        />
      </Field>

      <Field
        label="New password"
        htmlFor="newPassword"
        required
        hint="At least 8 characters, with a letter and a number."
        error={errors.newPassword}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={set('newPassword')}
          className="text-[16px]"
        />
      </Field>

      <Field
        label="Type the new password again"
        htmlFor="confirmPassword"
        required
        error={errors.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={set('confirmPassword')}
          className="text-[16px]"
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {!pending && <KeyRound className="h-4 w-4" />}
        {firstSignIn ? 'Save my password' : 'Change password'}
      </Button>
    </form>
  );
}
