import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getAcademySettings } from '@/lib/settings';
import { Crest } from '@/components/brand/crest';
import { ROLE } from '@/lib/constants';

/**
 * Account pages are reachable by every signed-in role, including student and
 * parent portal accounts, so they sit outside the staff application shell.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const academy = await getAcademySettings();
  const home = user.roleCode === ROLE.STUDENT ? '/portal' : '/dashboard';

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fa]">
      <header className="bg-navy-gradient">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
          <Crest className="h-12 w-auto shrink-0" monogram={academy.shortName} />
          <div className="min-w-0 flex-1">
            <h1 className="doc-title text-base font-bold uppercase leading-tight tracking-wide text-white">
              {academy.name}
            </h1>
            <p className="text-[12px] text-navy-200">My Account</p>
          </div>
          <Link
            href={home}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
        <div className="h-[3px] w-full bg-gold-gradient" />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-5 py-5 text-center text-[12px] text-slate-500">
        <p className="font-semibold uppercase tracking-wide text-navy-800">{academy.name}</p>
        <p className="tabular">{academy.contactLine}</p>
      </footer>
    </div>
  );
}
