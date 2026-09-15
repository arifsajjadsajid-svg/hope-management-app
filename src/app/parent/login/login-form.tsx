'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Field, Input, Alert } from '@/components/ui/primitives';
import { parentLoginAction } from '@/server/actions/parent-auth';
import type { ActionResult } from '@/server/action-result';

export function ParentLoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ redirectTo: string }> | null,
    FormData
  >(parentLoginAction, null);
  const [showPassword, setShowPassword] = React.useState(false);

  // Held in state so a wrong password does not also clear the number and the
  // "keep me signed in" choice — React resets an uncontrolled form after its action.
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

      <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="Your password"
            className="pr-11 text-[16px]"
            disabled={pending}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-navy-700"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>
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
