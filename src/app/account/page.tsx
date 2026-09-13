import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyRound, ShieldCheck, Clock, Monitor } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardBody, CardHeader, Badge } from '@/components/ui/primitives';
import { DetailItem } from '@/components/layout/page-header';
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'My Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireUser();

  const [account, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { role: true, student: { select: { fullName: true, admissionNumber: true } } },
    }),
    prisma.userSession.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      take: 5,
    }),
  ]);

  // Group the permissions this role actually holds, for transparency.
  const held = [...user.permissions] as PermissionCode[];
  const groups = new Map<string, string[]>();
  for (const code of held) {
    const meta = PERMISSIONS[code];
    if (!meta) continue;
    const bucket = groups.get(meta.group) ?? [];
    bucket.push(meta.name);
    groups.set(meta.group, bucket);
  }

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-navy-900">My Account</h1>

      <Card className="mb-5">
        <CardHeader
          title="Profile"
          actions={
            <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">
              {ROLE_LABELS[account.role.code] ?? account.role.name}
            </Badge>
          }
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
            <DetailItem label="Full Name" value={account.fullName} />
            <DetailItem label="Username" value={account.username} />
            <DetailItem label="Email" value={account.email} />
            <DetailItem label="Phone" value={account.phone} />
            <DetailItem label="Status" value={account.status} />
            <DetailItem label="Last Sign-In" value={formatDateTime(account.lastLoginAt)} />
            {account.student && (
              <DetailItem
                label="Linked Student"
                value={`${account.student.fullName} (${account.student.admissionNumber})`}
                className="col-span-2 sm:col-span-3"
              />
            )}
          </dl>
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="Password"
          description="Choose a private password that nobody else in the academy knows."
        />
        <CardBody>
          <Link
            href="/account/password"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-semibold text-white transition hover:bg-navy-800"
          >
            <KeyRound className="h-4 w-4" />
            Change Password
          </Link>
          {account.mustChangePassword && (
            <p className="mt-3 text-[13px] font-semibold text-amber-700">
              Your account is still using the password issued by the administrator.
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="Active sessions"
          description="Signing in elsewhere creates a new session. Changing your password ends all of them except this one."
        />
        <ul className="divide-y divide-slate-100">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-start gap-3 px-5 py-3.5">
              <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-navy-900">
                  {session.userAgent?.slice(0, 70) ?? 'Unknown device'}
                </p>
                <p className="text-[11.5px] text-slate-500 tabular">
                  {session.ipAddress ?? 'local'} · last active {formatDateTime(session.lastSeenAt)}
                </p>
              </div>
              {session.id === user.sessionId && (
                <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">This device</Badge>
              )}
            </li>
          ))}
        </ul>
        <CardBody className="border-t border-slate-100 pt-3.5">
          <p className="flex items-center gap-1.5 text-[12.5px] text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Sessions end automatically after a period of inactivity.
          </p>
        </CardBody>
      </Card>

      {groups.size > 0 && (
        <Card>
          <CardHeader
            title="What your role can do"
            description="Permissions granted to your role by the Super Admin."
          />
          <CardBody className="space-y-4">
            {[...groups.entries()].map(([group, items]) => (
              <div key={group}>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-navy-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {group}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <Badge key={item} tone="bg-royal-50 text-royal-700 ring-royal-200">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  );
}
