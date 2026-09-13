import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquare, Plus, Send, CheckCircle2, Info } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader, EmptyState, LinkButton, Badge, Alert } from '@/components/ui/primitives';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { templateByKey } from '@/lib/message-templates';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  await requirePermission('notifications.send');

  const campaigns = await prisma.messageCampaign.findMany({
    include: {
      exam: { select: { name: true } },
      recipients: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const totals = campaigns.reduce(
    (acc, campaign) => {
      for (const recipient of campaign.recipients) {
        acc.total += 1;
        if (recipient.status === 'SENT') acc.sent += 1;
        else if (recipient.status === 'SKIPPED') acc.skipped += 1;
        else acc.pending += 1;
      }
      return acc;
    },
    { total: 0, sent: 0, pending: 0, skipped: 0 },
  );

  return (
    <>
      <PageHeader
        title="Messages"
        description="WhatsApp and SMS messages to parents, personalised per family from the contact numbers on each student record."
        breadcrumbs={[{ label: 'Messages' }]}
        actions={
          <LinkButton href="/messages/new" size="sm">
            <Plus className="h-4 w-4" />
            New Message
          </LinkButton>
        }
      />

      <Alert tone="info" className="mb-5">
        <span className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The system writes each family&rsquo;s message and opens their{' '}
            <strong>WhatsApp chat</strong> or <strong>messaging app</strong> with the text already
            typed — your office presses send. No gateway account, approval or integration charge is
            involved. SMS carries a per-message cost from your operator; WhatsApp is free.
            When you are ready to automate either one, the same data model drives the WhatsApp
            Business Cloud API or an SMS gateway without losing this history.
          </span>
        </span>
      </Alert>

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Messages Prepared" value={campaigns.length} tone="navy" />
        <StatCard label="Recipients" value={totals.total} tone="royal" />
        <StatCard
          label="Sent"
          value={totals.sent}
          tone="emerald"
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Awaiting Send"
          value={totals.pending}
          tone={totals.pending ? 'amber' : 'slate'}
          hint={totals.skipped ? `${totals.skipped} skipped — no number` : undefined}
        />
      </section>

      <Card>
        <CardHeader title="Message history" description="Newest first" />
        {campaigns.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" />}
            title="No messages yet"
            description="Prepare a message to tell parents that a result is published, a date sheet is out, or a roll number slip is ready."
            action={
              <LinkButton href="/messages/new">
                <Plus className="h-4 w-4" />
                New Message
              </LinkButton>
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Message</Th>
                  <Th>Channel</Th>
                  <Th>Template</Th>
                  <Th>Examination</Th>
                  <Th>Prepared</Th>
                  <Th align="center">Recipients</Th>
                  <Th>Progress</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const sent = campaign.recipients.filter((r) => r.status === 'SENT').length;
                  const skipped = campaign.recipients.filter((r) => r.status === 'SKIPPED').length;
                  const sendable = campaign.recipients.length - skipped;
                  const percent = sendable ? Math.round((sent / sendable) * 100) : 0;
                  const done = sendable > 0 && sent >= sendable;

                  return (
                    <tr key={campaign.id}>
                      <Td>
                        <Link
                          href={`/messages/${campaign.id}`}
                          className="font-bold text-navy-900 hover:text-royal-700"
                        >
                          {campaign.title}
                        </Link>
                        <span className="block max-w-md truncate text-[11.5px] text-slate-500">
                          {campaign.body.split('\n').find((line) => line.trim()) ?? ''}
                        </span>
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            campaign.channel === 'SMS'
                              ? 'bg-teal-50 text-teal-700 ring-teal-200'
                              : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          }
                        >
                          {campaign.channel === 'SMS' ? 'SMS' : 'WhatsApp'}
                        </Badge>
                      </Td>
                      <Td className="text-[12.5px] text-slate-600">
                        {templateByKey(campaign.template).label}
                      </Td>
                      <Td className="text-[12.5px] text-slate-600">{campaign.exam?.name ?? '—'}</Td>
                      <Td className="whitespace-nowrap text-[12px] text-slate-600 tabular">
                        {formatDateTime(campaign.createdAt)}
                        {campaign.createdByName && (
                          <span className="block text-[11px] text-slate-400">
                            {campaign.createdByName}
                          </span>
                        )}
                      </Td>
                      <Td align="center" className="tabular">
                        {campaign.recipients.length}
                        {skipped > 0 && (
                          <span className="block text-[11px] text-amber-600">{skipped} skipped</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-royal-500'}`}
                              style={{ width: `${Math.min(100, percent)}%` }}
                            />
                          </div>
                          <span className="text-[11.5px] font-semibold text-slate-600 tabular">
                            {sent}/{sendable}
                          </span>
                        </div>
                      </Td>
                      <Td align="right">
                        <Link
                          href={`/messages/${campaign.id}`}
                          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-royal-700 hover:underline"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {done ? 'Review' : 'Open send list'}
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
