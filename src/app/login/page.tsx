import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck, GraduationCap, FileText, BarChart3 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { ROLE } from '@/lib/constants';
import { Crest, AcademyMark } from '@/components/brand/crest';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign In' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.roleCode === ROLE.STUDENT ? '/portal' : '/dashboard');

  const academy = await getAcademySettings();

  const highlights = [
    { icon: GraduationCap, label: 'Student records & academic history' },
    { icon: FileText, label: 'Roll number slips, date sheets & report cards' },
    { icon: BarChart3, label: 'Merit lists, position holders & analytics' },
    { icon: ShieldCheck, label: 'Result approval, locking & audit trail' },
  ];

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Branding panel */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-navy-gradient px-7 py-10 text-white lg:w-[46%] lg:px-14 lg:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #ffffff 1px, transparent 1px), radial-gradient(circle at 70% 60%, #ffffff 1px, transparent 1px)',
            backgroundSize: '46px 46px, 62px 62px',
          }}
          aria-hidden
        />

        <div className="relative">
          <Crest className="h-20 w-auto" monogram={academy.shortName} />
        </div>

        <div className="relative mt-10 lg:mt-0">
          <h1 className="doc-title text-3xl font-bold uppercase leading-tight tracking-wide lg:text-[2.6rem]">
            {academy.name}
          </h1>
          <div className="mt-4 h-[3px] w-28 rounded-full bg-gold-gradient" />
          <p className="mt-5 max-w-md text-[15px] font-medium leading-relaxed text-navy-100 lg:text-base">
            {academy.tagline}
          </p>

          <ul className="mt-9 space-y-3.5">
            {highlights.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-navy-100">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-300 ring-1 ring-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-12 border-t border-white/15 pt-5 text-[13px] leading-relaxed text-navy-200">
          <p className="font-semibold text-white">{academy.address}</p>
          <p className="mt-0.5 tabular">{academy.contactLine}</p>
          {academy.email && <p className="mt-0.5">{academy.email}</p>}
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="flex flex-1 items-center justify-center bg-[#f4f6fa] px-6 py-12 lg:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <AcademyMark logoPath={academy.logoPath} monogram={academy.shortName} className="h-16 w-auto" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-elevated sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-navy-900">Sign in to continue</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              Enter the credentials issued to you by the academy administration.
            </p>

            <div className="mt-6">
              <LoginForm />
            </div>
          </div>

          <div className="mt-6 text-center text-[12.5px] leading-relaxed text-slate-500">
            <p className="font-semibold uppercase tracking-wide text-navy-800">{academy.name}</p>
            <p className="mt-0.5">{academy.address}</p>
            <p className="tabular">{academy.contactLine}</p>
          </div>

          <p className="mt-5 text-center text-[13px] text-slate-600">
            Parent?{' '}
            <a
              href="/parent/login"
              className="font-semibold text-royal-700 underline underline-offset-2 hover:text-royal-800"
            >
              Sign in to the parent portal
            </a>
          </p>

          {academy.resultPortalEnabled && (
            <p className="mt-5 text-center text-[13px] text-slate-600">
              Looking for your result?{' '}
              <a
                href="/result"
                className="font-semibold text-royal-700 underline underline-offset-2 hover:text-royal-800"
              >
                Open the public result portal
              </a>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
