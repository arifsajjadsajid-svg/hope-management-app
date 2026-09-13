import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck, Search } from 'lucide-react';
import { getAcademySettings } from '@/lib/settings';
import { normaliseCode } from '@/lib/verification';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Verify a Document' };
export const dynamic = 'force-dynamic';

export default async function VerifyLandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const academy = await getAcademySettings();
  const params = await searchParams;
  const raw = params.code;
  const code = Array.isArray(raw) ? raw[0] : raw;

  if (code?.trim()) redirect(`/verify/${encodeURIComponent(normaliseCode(code))}`);

  return (
    <>
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-gold-300">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <h1 className="doc-title mt-4 text-2xl font-bold uppercase tracking-wide text-navy-900">
          Verify a Document
        </h1>
        <p className="mt-2 text-[14px] text-slate-600">
          Confirm that a report card, certificate or roll number slip was genuinely issued by{' '}
          {academy.name}.
        </p>
      </div>

      <Card className="mx-auto max-w-xl">
        <CardHeader
          title="Enter the verification code"
          description="The code is printed beneath the QR code on every official document."
        />
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="field-label" htmlFor="code">
                Verification Code
              </label>
              <input
                id="code"
                name="code"
                required
                autoFocus
                placeholder="RC-K7M3P-Q9XTB"
                className="field-input font-mono uppercase"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-5 text-sm font-semibold text-white transition hover:bg-navy-800"
            >
              <Search className="h-4 w-4" />
              Verify
            </button>
          </form>

          <p className="mt-4 text-[12.5px] leading-relaxed text-slate-500">
            Scanning the QR code on a document opens this page automatically. If a document cannot be
            verified, contact the academy office on {academy.contactLine}.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
