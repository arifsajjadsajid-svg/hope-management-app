import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { Crest } from '@/components/brand/crest';
import { logoutAction } from '@/server/actions/auth';

/**
 * Student / parent portal shell. Kept deliberately simple and separate from the
 * staff application shell.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const academy = await getAcademySettings();

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fa]">
      <header className="bg-navy-gradient">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
          <Crest className="h-14 w-auto shrink-0" monogram={academy.shortName} />
          <div className="min-w-0 flex-1">
            <h1 className="doc-title text-lg font-bold uppercase leading-tight tracking-wide text-white sm:text-xl">
              {academy.name}
            </h1>
            <p className="text-[12.5px] text-navy-200">{academy.tagline}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-bold text-white">{user.fullName}</p>
              <p className="text-[11.5px] text-navy-200">Student / Parent Portal</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
        <div className="h-[3px] w-full bg-gold-gradient" />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 sm:px-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-5 py-6 text-center text-[12.5px] text-slate-500 sm:px-8">
        <p className="font-semibold uppercase tracking-wide text-navy-800">{academy.name}</p>
        <p className="mt-0.5">{academy.address}</p>
        <p className="tabular">{academy.contactLine}</p>
        <Link
          href="/account/password"
          className="mt-2 inline-block text-[12px] font-semibold text-royal-700 hover:underline"
        >
          Change password
        </Link>
      </footer>
    </div>
  );
}
