import type { Metadata } from 'next';
import { ScrollText, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Badge } from '@/components/ui/primitives';
import { FilterBar } from '@/components/ui/filter-bar';
import { Table, TableWrap, Th, Td, Pagination } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { AUDIT_ACTION_LABELS } from '@/lib/constants';
import { formatDateTime, fromDateInput } from '@/lib/utils';

export const metadata: Metadata = { title: 'Audit Logs' };
export const dynamic = 'force-dynamic';

const SEVERITY = {
  INFO: { tone: 'bg-royal-50 text-royal-700 ring-royal-200', icon: Info },
  WARNING: { tone: 'bg-amber-50 text-amber-700 ring-amber-200', icon: AlertTriangle },
  CRITICAL: { tone: 'bg-rose-50 text-rose-700 ring-rose-200', icon: ShieldAlert },
} as const;

/** Pretty-prints a stored JSON value, falling back to raw text. */
function ValueBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  let text = value;
  try {
    text = JSON.stringify(JSON.parse(value), null, 1);
  } catch {
    // keep the raw string
  }
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <pre className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 px-2 py-1 font-mono text-[10.5px] leading-snug text-slate-700">
        {text}
      </pre>
    </div>
  );
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('audit.view');
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const page = Math.max(1, Number(pick('page') ?? 1) || 1);
  const pageSize = 50;

  const from = fromDateInput(pick('from'));
  const to = fromDateInput(pick('to'));
  if (to) to.setHours(23, 59, 59, 999);

  const where = {
    ...(pick('action') ? { action: pick('action') } : {}),
    ...(pick('severity') ? { severity: pick('severity') } : {}),
    ...(pick('userId') ? { userId: pick('userId') } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(pick('q')
      ? {
          OR: [
            { description: { contains: pick('q')! } },
            { userName: { contains: pick('q')! } },
            { entityId: { contains: pick('q')! } },
          ],
        }
      : {}),
  };

  const [total, entries, users, distinctActions, criticalCount, todayCount] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    prisma.auditLog.count({ where: { severity: 'CRITICAL' } }),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="A permanent record of every sensitive action: student edits, marks changes, result approval, publication, locking, unlocking, settings changes and backups."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Audit Logs' }]}
      />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Total Entries" value={total} tone="navy" />
        <StatCard label="Today" value={todayCount} tone="royal" />
        <StatCard
          label="Critical Actions"
          value={criticalCount}
          tone={criticalCount ? 'rose' : 'slate'}
          hint="unlocks, publications, restores"
        />
        <StatCard label="Distinct Actions" value={distinctActions.length} tone="slate" />
      </section>

      <Card>
        <FilterBar
          fields={[
            { type: 'search', name: 'q', placeholder: 'Description, user or record id…' },
            {
              type: 'select',
              name: 'action',
              label: 'Action',
              className: 'w-[220px]',
              options: [
                { value: '', label: 'All actions' },
                ...distinctActions.map((a) => ({
                  value: a.action,
                  label: AUDIT_ACTION_LABELS[a.action] ?? a.action,
                })),
              ],
            },
            {
              type: 'select',
              name: 'severity',
              label: 'Severity',
              className: 'w-[150px]',
              options: [
                { value: '', label: 'All' },
                { value: 'INFO', label: 'Info' },
                { value: 'WARNING', label: 'Warning' },
                { value: 'CRITICAL', label: 'Critical' },
              ],
            },
            {
              type: 'select',
              name: 'userId',
              label: 'User',
              className: 'w-[200px]',
              options: [
                { value: '', label: 'All users' },
                ...users.map((u) => ({ value: u.id, label: u.fullName })),
              ],
            },
            { type: 'date', name: 'from', label: 'From' },
            { type: 'date', name: 'to', label: 'To' },
          ]}
        />

        {entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-6 w-6" />}
            title="No audit entries"
            description="Nothing matches the current filters."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th align="center">Severity</Th>
                    <Th>Action</Th>
                    <Th>Description</Th>
                    <Th>User</Th>
                    <Th>Record</Th>
                    <Th>Change</Th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const severity =
                      SEVERITY[entry.severity as keyof typeof SEVERITY] ?? SEVERITY.INFO;
                    const Icon = severity.icon;

                    return (
                      <tr key={entry.id}>
                        <Td className="whitespace-nowrap text-[12px] text-slate-600 tabular">
                          {formatDateTime(entry.createdAt)}
                        </Td>
                        <Td align="center">
                          <Badge tone={severity.tone}>
                            <Icon className="h-3 w-3" />
                            {entry.severity}
                          </Badge>
                        </Td>
                        <Td className="whitespace-nowrap font-semibold text-navy-900">
                          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                        </Td>
                        <Td className="max-w-md text-[12.5px] text-slate-700">
                          {entry.description ?? '—'}
                        </Td>
                        <Td className="whitespace-nowrap text-[12.5px]">
                          <span className="block font-medium text-navy-800">
                            {entry.userName ?? 'System'}
                          </span>
                          {entry.userRole && (
                            <span className="block text-[11px] text-slate-400">
                              {entry.userRole}
                            </span>
                          )}
                          {entry.ipAddress && (
                            <span className="block text-[11px] text-slate-400 tabular">
                              {entry.ipAddress}
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-[11.5px] text-slate-500">
                          {entry.entityType ?? '—'}
                          {entry.entityId && (
                            <span className="block font-mono text-[10.5px] text-slate-400">
                              {entry.entityId.slice(0, 12)}
                            </span>
                          )}
                        </Td>
                        <Td className="min-w-[220px] space-y-1.5">
                          <ValueBlock label="Before" value={entry.oldValue} />
                          <ValueBlock label="After" value={entry.newValue} />
                          {!entry.oldValue && !entry.newValue && (
                            <span className="text-[12px] text-slate-400">—</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              basePath="/admin/audit"
              searchParams={{
                q: pick('q'),
                action: pick('action'),
                severity: pick('severity'),
                userId: pick('userId'),
                from: pick('from'),
                to: pick('to'),
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
