import type { Metadata } from 'next';
import { Users, UserCheck, PowerOff, UserX, ExternalLink, AlertTriangle } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAcademySettings, appBaseUrl } from '@/lib/settings';
import { familiesByPhone, type ParentChild } from '@/lib/parent-auth';
import { formatDisplay } from '@/lib/phone';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, EmptyState, Alert, Badge } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { formatDateTime } from '@/lib/utils';
import { CreateParentButton, GrantAllButton, ParentRowActions } from './parent-clients';

export const metadata: Metadata = { title: 'Parent Accounts' };
export const dynamic = 'force-dynamic';

function ChildList({ items }: { items: ParentChild[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map((child) => (
        <li key={child.id} className="text-[12.5px] leading-snug">
          <a href={`/students/${child.id}`} className="font-semibold text-navy-900 hover:text-royal-700">
            {child.fullName}
          </a>
          {child.className && (
            <span className="text-slate-500">
              {' '}
              · {child.className}
              {child.sectionName ? `-${child.sectionName}` : ''}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function ParentAccountsPage() {
  const user = await requirePermission('parents.view');
  const canManage = userCan(user, 'parents.manage');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [academy, families, accounts] = await Promise.all([
    getAcademySettings(),
    familiesByPhone(),
    prisma.parentAccount.findMany({
      include: {
        _count: {
          select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } },
        },
      },
      orderBy: { displayName: 'asc' },
    }),
  ]);

  const portalUrl = appBaseUrl();

  // Every student already reachable through some account, so a family covered
  // by their WhatsApp number is not suggested again under their other number.
  const covered = new Set<string>();
  for (const account of accounts) {
    for (const child of families.get(account.phone) ?? []) covered.add(child.id);
  }

  const withoutAccount = [...families.entries()]
    .filter(([, children]) => children.some((c) => !covered.has(c.id)))
    .map(([dialNumber, children]) => ({ dialNumber, children }))
    .sort((a, b) => (a.children[0]?.fatherName ?? '').localeCompare(b.children[0]?.fatherName ?? ''));

  const signedInRecently = accounts.filter(
    (a) => a.lastLoginAt && a.lastLoginAt >= thirtyDaysAgo,
  ).length;
  const switchedOff = accounts.filter((a) => a.status === 'DISABLED').length;

  return (
    <>
      <PageHeader
        title="Parent Accounts"
        description="Sign-ins for the parent portal, where families see their children’s results and progress."
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Parent Accounts' }]}
        actions={
          <div className="flex items-center gap-2">
            <a
              href="/parent/login"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Parent portal
            </a>
            {canManage && <CreateParentButton portalUrl={portalUrl} academyName={academy.name} />}
          </div>
        }
      />

      <Alert tone="info" className="mb-5">
        Parents sign in at <strong>{portalUrl}/parent/login</strong> with their mobile number — there is
        no password. A number can only sign in once it has access here. Parents see only their own
        children — every current student whose parent or WhatsApp number matches — and only results
        the academy has published. They cannot change anything.
      </Alert>

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard
          label="Parent Accounts"
          value={accounts.length}
          tone="navy"
          icon={<Users className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Signed In (30 days)"
          value={signedInRecently}
          tone="emerald"
          icon={<UserCheck className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Switched Off"
          value={switchedOff}
          tone={switchedOff ? 'amber' : 'slate'}
          icon={<PowerOff className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Families Without Access"
          value={withoutAccount.length}
          tone={withoutAccount.length ? 'royal' : 'slate'}
          icon={<UserX className="h-[18px] w-[18px]" />}
        />
      </section>

      <Card className="mb-5">
        <CardHeader title="Parents with access" description={`${accounts.length} parent(s)`} />
        {accounts.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No parents have access yet"
            description="Give access below to the families already on your student records, or add a parent by hand."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Parent</Th>
                  <Th>Can see</Th>
                  <Th>Status</Th>
                  <Th>Last sign-in</Th>
                  <Th align="center">Devices</Th>
                  {canManage && <Th align="right" />}
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const children = families.get(account.phone) ?? [];

                  return (
                    <tr key={account.id}>
                      <Td>
                        <span className="font-bold text-navy-900">{account.displayName}</span>
                        <span className="block text-[12px] tabular text-slate-500">
                          {formatDisplay(account.phone)}
                        </span>
                      </Td>
                      <Td>
                        {children.length ? (
                          <ChildList items={children} />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            No current student uses this number
                          </span>
                        )}
                      </Td>
                      <Td>
                        {account.status === 'DISABLED' ? (
                          <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Switched off</Badge>
                        ) : (
                          <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] tabular text-slate-600">
                        {account.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'Never'}
                      </Td>
                      <Td align="center" className="tabular text-slate-700">
                        {account._count.sessions}
                      </Td>
                      {canManage && (
                        <Td align="right">
                          <ParentRowActions
                            id={account.id}
                            displayName={account.displayName}
                            dialNumber={account.phone}
                            phoneDisplay={formatDisplay(account.phone)}
                            childNames={children.map((c) => c.fullName)}
                            status={account.status}
                            activeDevices={account._count.sessions}
                            portalUrl={portalUrl}
                            academyName={academy.name}
                          />
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Families without access"
          description="Numbers on current student records that cannot sign in yet"
          actions={
            canManage && withoutAccount.length > 1 ? (
              <GrantAllButton count={withoutAccount.length} />
            ) : undefined
          }
        />
        {withoutAccount.length === 0 ? (
          <EmptyState
            icon={<UserCheck className="h-6 w-6" />}
            title="Every family can sign in"
            description="Each current student with a parent or WhatsApp number can be seen by a parent."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Mobile number</Th>
                  <Th>Children</Th>
                  {canManage && <Th align="right" />}
                </tr>
              </thead>
              <tbody>
                {withoutAccount.map(({ dialNumber, children }) => (
                  <tr key={dialNumber}>
                    <Td className="whitespace-nowrap">
                      <span className="font-semibold tabular text-navy-900">
                        {formatDisplay(dialNumber)}
                      </span>
                      <span className="block text-[12px] text-slate-500">
                        {children[0]?.fatherName}
                      </span>
                    </Td>
                    <Td>
                      <ChildList items={children} />
                    </Td>
                    {canManage && (
                      <Td align="right">
                        <CreateParentButton
                          portalUrl={portalUrl}
                          academyName={academy.name}
                          variant="outline"
                          label="Give access"
                          prefill={{
                            phone: formatDisplay(dialNumber),
                            displayName: children[0]?.fatherName ?? '',
                          }}
                        />
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
