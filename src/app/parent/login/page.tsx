import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { getCurrentParent } from '@/lib/parent-auth';
import { getAcademySettings } from '@/lib/settings';
import { ParentShell } from '../parent-shell';
import { ParentLoginForm } from './login-form';

export const metadata: Metadata = { title: 'Parent Portal · Sign In' };
export const dynamic = 'force-dynamic';

export default async function ParentLoginPage() {
  // A remembered device goes straight in.
  const parent = await getCurrentParent();
  if (parent) redirect('/parent');

  const academy = await getAcademySettings();

  return (
    <ParentShell academy={academy}>
      <div className="mx-auto w-full max-w-[420px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-elevated sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-navy-900">Parent sign in</h1>
              <p className="text-[13px] text-slate-500">See your child’s results and progress</p>
            </div>
          </div>

          <ParentLoginForm />
        </div>

        <div className="mt-5 space-y-2 text-center text-[13px] leading-relaxed text-slate-600">
          <p>
            <strong className="text-navy-900">Number not recognised?</strong>
            <br />
            Call the academy on <span className="tabular">{academy.contactLine}</span>
          </p>
          <p className="text-[12px] text-slate-500">
            Academy staff?{' '}
            <Link href="/login" className="font-semibold text-royal-700 underline underline-offset-2">
              Staff sign in
            </Link>
          </p>
        </div>
      </div>
    </ParentShell>
  );
}
