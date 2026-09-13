'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Field, Input, Alert } from '@/components/ui/primitives';
import { loginAction } from '@/server/actions/auth';

export function LoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    if (state?.ok && state.data?.redirectTo) {
      router.replace(state.data.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok && (
        <Alert tone="danger" title="Sign-in failed">
          {state.error}
        </Alert>
      )}

      <Field label="Username or Email" htmlFor="username" required error={fieldErrors.username}>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          placeholder="e.g. admin"
          disabled={pending}
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
            placeholder="••••••••"
            className="pr-11"
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

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {!pending && <LogIn className="h-4 w-4" />}
        {pending ? 'Signing in…' : 'Sign In'}
      </Button>

      <p className="pt-1 text-center text-xs leading-relaxed text-slate-500">
        Access is monitored and every action is recorded in the audit log.
        <br />
        Forgotten your password? Contact the academy Super Admin.
      </p>
    </form>
  );
}
