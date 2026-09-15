import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { requireParent } from '@/lib/parent-auth';
import { getAcademySettings } from '@/lib/settings';
import { ParentShell } from '../parent-shell';
import { ParentChangePasswordForm } from '../change-password-form';

export const metadata: Metadata = { title: 'Parent Portal · Choose Your Password' };
export const dynamic = 'force-dynamic';

/**
 * The first stop after signing in with a password from the academy. Until the
 * parent replaces it, the portal sends them back here.
 */
export default async function ParentChangePasswordPage() {
  const parent = await requireParent();
  if (!parent.mustChangePassword) redirect('/parent/account');

  const academy = await getAcademySettings();

  return (
    <ParentShell academy={academy} parentName={parent.displayName}>
      <div className="mx-auto w-full max-w-[420px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-elevated sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-navy-900">Choose your password</h1>
              <p className="text-[13px] text-slate-500">One last step before you see the results</p>
            </div>
          </div>

          <p className="mb-5 rounded-lg bg-royal-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-royal-900">
            Assalam-o-Alaikum {parent.displayName}. The password you were given was temporary. Please
            choose one that <strong>only you know</strong> — nobody at the academy will be able to see it.
          </p>

          <ParentChangePasswordForm firstSignIn doneHref="/parent" />
        </div>
      </div>
    </ParentShell>
  );
}
