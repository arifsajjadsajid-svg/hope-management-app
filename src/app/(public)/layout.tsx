import Link from 'next/link';
import { getAcademySettings } from '@/lib/settings';
import { Crest } from '@/components/brand/crest';

/**
 * Shell for the pages a member of the public can reach without signing in:
 * the result portal and the document verification page.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const academy = await getAcademySettings();

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fa]">
      <header className="bg-navy-gradient">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
          <Crest className="h-14 w-auto shrink-0" monogram={academy.shortName} />
          <div className="min-w-0 flex-1">
            <h1 className="doc-title text-lg font-bold uppercase leading-tight tracking-wide text-white sm:text-xl">
              {academy.name}
            </h1>
            <p className="text-[12.5px] text-navy-200">{academy.address}</p>
            <p className="text-[12.5px] text-navy-200 tabular">{academy.contactLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/admission"
              className="rounded-lg bg-gold-gradient px-4 py-2 text-[13px] font-bold text-navy-900 transition hover:brightness-105"
            >
              Apply for Admission
            </Link>
            <Link
              href="/parent/login"
              className="rounded-lg border border-white/25 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10"
            >
              Parent Login
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-white/25 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10"
            >
              Staff Sign In
            </Link>
          </div>
        </div>
        <div className="h-[3px] w-full bg-gold-gradient" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-5 py-6 text-center text-[12.5px] text-slate-500 sm:px-8">
        <p className="font-semibold uppercase tracking-wide text-navy-800">{academy.name}</p>
        <p className="mt-0.5">{academy.address}</p>
        <p className="tabular">{academy.contactLine}</p>
        <p className="mt-2 text-[11.5px] text-slate-400">
          {academy.tagline} — results shown here are official and verifiable.
        </p>
      </footer>
    </div>
  );
}
