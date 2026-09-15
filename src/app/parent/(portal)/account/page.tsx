import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireParent, childrenForPhone } from '@/lib/parent-auth';
import { prisma } from '@/lib/prisma';
import { formatDisplay } from '@/lib/phone';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';
import { ParentChangePasswordForm } from '../../change-password-form';
import { SignOutOtherDevicesButton } from './account-clients';

export const metadata: Metadata = { title: 'Parent Portal · My Account' };
export const dynamic = 'force-dynamic';

export default async function ParentAccountPage() {
  const parent = await requireParent();

  const [children, sessions] = await Promise.all([
    childrenForPhone(parent.phone),
    prisma.parentSession.findMany({
      where: { parentId: parent.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, lastSeenAt: true, createdAt: true },
      orderBy: { lastSeenAt: 'desc' },
    }),
  ]);

  const otherDevices = sessions.filter((s) => s.id !== parent.sessionId).length;

  return (
    <>
      <Link
        href="/parent"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-royal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to results
      </Link>

      <h1 className="mb-5 text-2xl font-bold tracking-tight text-navy-900">My account</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" />
          <CardBody>
            <dl className="space-y-3 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Name</dt>
                <dd className="font-semibold text-navy-900">{parent.displayName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Mobile number</dt>
                <dd className="font-semibold tabular text-navy-900">{formatDisplay(parent.phone)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Children</dt>
                <dd className="text-right font-semibold text-navy-900">
                  {children.map((c) => c.fullName).join(', ') || '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
              To change your number or add a child, please contact the academy office.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Signed-in devices" description={`${sessions.length} device(s)`} />
          <CardBody>
            <ul className="space-y-2.5">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-slate-700">
                    {describeDevice(session.userAgent)}
                    {session.id === parent.sessionId && (
                      <span className="ml-1.5 text-[11.5px] font-semibold text-emerald-600">This device</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular text-slate-400">
                    {formatDateTime(session.lastSeenAt)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <SignOutOtherDevicesButton disabled={otherDevices === 0} />
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Change password" description="Choose one only you know" />
          <CardBody className="max-w-md">
            <ParentChangePasswordForm doneHref="/parent/account" />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/** A readable name for a browser, so a parent can recognise their own devices. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const os = /Android/i.test(userAgent)
    ? 'Android phone'
    : /iPhone/i.test(userAgent)
      ? 'iPhone'
      : /iPad/i.test(userAgent)
        ? 'iPad'
        : /Windows/i.test(userAgent)
          ? 'Windows computer'
          : /Mac OS/i.test(userAgent)
            ? 'Mac'
            : 'Device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  return browser ? `${os} · ${browser}` : os;
}
