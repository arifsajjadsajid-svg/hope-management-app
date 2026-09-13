'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { Crest } from '@/components/brand/crest';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { changeOwnPasswordAction } from '@/server/actions/auth';
import { logoutAction } from '@/server/actions/auth';

/**
 * Shown in place of the application until a user with a system-issued password
 * has replaced it. This is why the seeded demo accounts cannot be used with
 * their initial passwords indefinitely.
 */
export function ForcedPasswordChange({
  academyName,
  academyAddress,
  contactLine,
  shortName,
  fullName,
}: {
  academyName: string;
  academyAddress: string;
  contactLine: string;
  shortName: string;
  fullName: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changeOwnPasswordAction, null);

  React.useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-gradient px-5 py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <Crest className="h-16 w-auto" monogram={shortName} />
          <h1 className="doc-title mt-3 text-lg font-bold uppercase tracking-wide">{academyName}</h1>
          <p className="mt-0.5 text-[12px] text-navy-200">{academyAddress}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-elevated">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-navy-900">Set a new password</h2>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
                {fullName}, your account still uses the password issued by the administrator. Choose
                a private password to continue into the system.
              </p>
            </div>
          </div>

          <form action={formAction} className="space-y-4" noValidate>
            {state && !state.ok && (
              <Alert tone="danger" title="Could not update password">
                {state.error}
              </Alert>
            )}

            <Field
              label="Current password"
              htmlFor="currentPassword"
              required
              error={fieldErrors.currentPassword}
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
              error={fieldErrors.newPassword}
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
              error={fieldErrors.confirmPassword}
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

            <Button type="submit" size="lg" className="w-full" loading={pending}>
              {!pending && <KeyRound className="h-4 w-4" />}
              Update password &amp; continue
            </Button>
          </form>

          <form action={logoutAction} className="mt-4 text-center">
            <button
              type="submit"
              className="text-[12.5px] font-semibold text-slate-500 underline underline-offset-2 transition hover:text-rose-700"
            >
              Sign out instead
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[12px] text-navy-200 tabular">{contactLine}</p>
      </div>
    </main>
  );
}
