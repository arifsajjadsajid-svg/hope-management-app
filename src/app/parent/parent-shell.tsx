import Link from 'next/link';
import { LogOut, UserCog, Phone } from 'lucide-react';
import type { AcademyProfile } from '@/lib/settings';
import { Crest } from '@/components/brand/crest';
import { parentLogoutAction } from '@/server/actions/parent-auth';

/**
 * Header and footer for every parent portal page. Built for a phone first —
 * that is where nearly every parent will open it — so the header collapses to
 * the crest, the academy name and a sign-out button.
 */
export function ParentShell({
  academy,
  parentName,
  children,
}: {
  academy: AcademyProfile;
  parentName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fa]">
      <header className="bg-navy-gradient">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:gap-4 sm:px-8 sm:py-5">
          <Link href={parentName ? '/parent' : '/parent/login'} className="shrink-0">
            <Crest className="h-11 w-auto sm:h-14" monogram={academy.shortName} />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="doc-title truncate text-[15px] font-bold uppercase leading-tight tracking-wide text-white sm:text-xl">
              {academy.name}
            </p>
            <p className="truncate text-[11.5px] font-semibold text-gold-300 sm:text-[12.5px]">
              Parent Portal
            </p>
          </div>

          {parentName && (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Link
                href="/parent/account"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10"
                aria-label="My account"
              >
                <UserCog className="h-4 w-4" />
                <span className="hidden sm:inline">{parentName}</span>
              </Link>
              <form action={parentLogoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-2.5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10 sm:px-3.5"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </form>
            </div>
          )}
        </div>
        <div className="h-[3px] w-full bg-gold-gradient" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-[12.5px] text-slate-500 sm:px-8">
        <p className="font-semibold uppercase tracking-wide text-navy-800">{academy.name}</p>
        <p className="mt-0.5">{academy.address}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 tabular">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          {academy.contactLine}
        </p>
        <p className="mt-2 text-[11.5px] text-slate-400">
          Only results the academy has published are shown here.
        </p>
      </footer>
    </div>
  );
}
