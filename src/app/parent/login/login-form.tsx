'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { Button, Field, Input, Alert } from '@/components/ui/primitives';
import { parentLoginAction } from '@/server/actions/parent-auth';
import type { ActionResult } from '@/server/action-result';

export function ParentLoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ redirectTo: string }> | null,
    FormData
  >(parentLoginAction, null);

  // Held in state so an unrecognised number does not also clear what was typed
  // and the "keep me signed in" choice — React resets an uncontrolled form after its action.
  const [phone, setPhone] = React.useState('');
  const [remember, setRemember] = React.useState(true);

  React.useEffect(() => {
    if (state?.ok && state.data?.redirectTo) {
      router.replace(state.data.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    React.startTransition(() => formAction(data));
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {state && !state.ok && (
        <Alert tone="danger" title="Could not sign in">
          {state.error}
        </Alert>
      )}

      <Field
        label="Mobile number"
        htmlFor="phone"
        required
        hint="The number the academy has for you, e.g. 0300-1234567"
        error={fieldErrors.phone}
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          required
          placeholder="0300-1234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={pending}
          className="text-[16px]"
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <input
          type="checkbox"
          name="remember"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] rounded border-slate-300 text-navy-800"
        />
        <span className="text-[13px] leading-snug text-slate-700">
          <strong className="text-navy-900">Keep me signed in on this phone</strong>
          <span className="block text-[12px] text-slate-500">
            Untick this on a shared or public computer.
          </span>
        </span>
      </label>

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {!pending && <LogIn className="h-4 w-4" />}
        {pending ? 'Signing in…' : 'Sign In'}
      </Button>
    </form>
  );
}
