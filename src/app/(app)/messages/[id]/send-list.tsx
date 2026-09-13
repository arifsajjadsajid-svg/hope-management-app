'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Send,
  CheckCircle2,
  Undo2,
  AlertTriangle,
  CheckCheck,
  Eye,
  Copy,
  Check,
  FileSpreadsheet,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { Alert, Button, Badge, Card, CardBody, LinkButton } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { whatsappLink, smsLink, formatDisplay } from '@/lib/phone';
import { measureSms } from '@/lib/sms';
import { markRecipientSentAction, markAllSentAction } from '@/server/actions/messages';
import { formatDateTime, cn } from '@/lib/utils';

export type SendRow = {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  sectionName: string;
  contactName: string;
  contactLabel: string;
  phone: string;
  dialNumber: string;
  renderedBody: string;
  status: string;
  sentAt: string | null;
  sentByName: string | null;
  note: string | null;
};

/**
 * The send list. Opening a family's chat marks them as sent immediately, so the
 * operator can work down the list without losing their place — and any row can
 * be put back to pending if the app did not actually open.
 *
 * WhatsApp opens from any browser. An `sms:` link needs a device that can send
 * a text, so on a desktop the operator is pointed at the CSV export instead.
 */
export function SendList({
  campaignId,
  rows,
  channel,
}: {
  campaignId: string;
  rows: SendRow[];
  channel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const isSms = channel === 'SMS';
  const [filter, setFilter] = React.useState<'PENDING' | 'ALL' | 'SENT'>('PENDING');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // Resolved after mount so the server and client render the same markup.
  const [canSendSms, setCanSendSms] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setCanSendSms(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);
  const [markAllOpen, setMarkAllOpen] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);
  const [previewRow, setPreviewRow] = React.useState<SendRow | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const sendable = rows.filter((r) => r.status !== 'SKIPPED');
  const sent = rows.filter((r) => r.status === 'SENT');
  const pending = rows.filter((r) => r.status === 'PENDING');
  const skipped = rows.filter((r) => r.status === 'SKIPPED');
  const percent = sendable.length ? Math.round((sent.length / sendable.length) * 100) : 0;

  const visible =
    filter === 'ALL' ? rows : filter === 'SENT' ? sent : [...pending, ...skipped];

  const setSent = async (row: SendRow, value: boolean) => {
    setBusyId(row.id);
    const result = await markRecipientSentAction(row.id, value);
    setBusyId(null);
    if (result.ok) router.refresh();
    else toast.error('Could not update', result.error);
  };

  /** Opens the family's chat and records the send in one action. */
  const openChat = (row: SendRow) => {
    if (isSms) {
      // sms: must navigate rather than open a tab, or the handler never fires.
      window.location.href = smsLink(row.dialNumber, row.renderedBody, navigator.userAgent);
    } else {
      window.open(whatsappLink(row.dialNumber, row.renderedBody), '_blank', 'noopener');
    }
    void setSent(row, true);
  };

  const copyMessage = async (row: SendRow) => {
    try {
      await navigator.clipboard.writeText(row.renderedBody);
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast.error('Could not copy', 'Your browser blocked clipboard access.');
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    const result = await markAllSentAction(campaignId);
    setMarkingAll(false);
    setMarkAllOpen(false);
    if (result.ok) {
      toast.success(result.message ?? 'Marked as sent.');
      router.refresh();
    } else {
      toast.error('Could not update', result.error);
    }
  };

  return (
    <>
      {/* --------------------------------------------------------- progress */}
      <Card className="mb-5">
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-[200px] flex-1">
              <div className="flex items-end justify-between">
                <p className="text-[13px] font-semibold text-navy-900">
                  {sent.length} of {sendable.length} sent
                </p>
                <p className="text-[13px] font-bold text-royal-700 tabular">{percent}%</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    percent >= 100 ? 'bg-emerald-500' : 'bg-royal-500',
                  )}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-300 p-0.5">
                {(
                  [
                    ['PENDING', `To send (${pending.length + skipped.length})`],
                    ['SENT', `Sent (${sent.length})`],
                    ['ALL', `All (${rows.length})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition',
                      filter === value
                        ? 'bg-navy-900 text-white'
                        : 'text-navy-700 hover:bg-slate-100',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {isSms && (
                <LinkButton
                  href={`/api/export/message-list?campaignId=${campaignId}&format=csv`}
                  variant="outline"
                  size="sm"
                  download
                  title="Number and message columns, ready to upload to a bulk SMS portal"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export CSV
                </LinkButton>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setMarkAllOpen(true)}
                disabled={pending.length === 0}
              >
                <CheckCheck className="h-4 w-4" />
                Mark all sent
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {isSms && canSendSms === false && (
        <Alert tone="warning" title="This computer cannot send a text message" className="mb-5">
          <span className="flex items-start gap-1.5">
            <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              An <strong>Open SMS app</strong> button needs a device with a SIM. Two ways round it:
              open <span className="font-mono text-[12px]">/messages</span> on the academy&rsquo;s
              phone or tablet and work down the list there, or press{' '}
              <strong>Export CSV</strong> and upload the file to your operator&rsquo;s bulk SMS
              portal. If this PC is paired with an Android phone through Windows Phone Link, the
              button will work here too.
            </span>
          </span>
        </Alert>
      )}

      {isSms && canSendSms === true && (
        <Alert tone="info" title="Sending from this device" className="mb-5">
          <span className="flex items-start gap-1.5">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Each <strong>Open SMS app</strong> button opens your messaging app with the number and
              text filled in. Press send there, then use the back gesture to return to this list —
              the family is already marked as sent.
            </span>
          </span>
        </Alert>
      )}

      {skipped.length > 0 && (
        <Alert tone="warning" title={`${skipped.length} family(ies) cannot be messaged`} className="mb-5">
          These students have no usable mobile number on file. Add or correct the number on the
          student record, then prepare the message again for them.
        </Alert>
      )}

      {percent >= 100 && sendable.length > 0 && (
        <Alert tone="success" title="Every message has been sent" className="mb-5">
          All {sendable.length} families have been messaged. The record below is kept permanently.
        </Alert>
      )}

      {/* ------------------------------------------------------------ list */}
      <Card>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th align="center">Status</Th>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th>Send to</Th>
                <Th>Number</Th>
                <Th>Sent</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const isSent = row.status === 'SENT';
                const isSkipped = row.status === 'SKIPPED';

                return (
                  <tr key={row.id} className={cn(isSkipped && 'bg-amber-50/40', isSent && 'bg-emerald-50/30')}>
                    <Td align="center">
                      {isSent ? (
                        <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Sent
                        </Badge>
                      ) : isSkipped ? (
                        <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                          <AlertTriangle className="h-3 w-3" />
                          No number
                        </Badge>
                      ) : (
                        <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">To send</Badge>
                      )}
                    </Td>

                    <Td>
                      <Link
                        href={`/students/${row.studentId}`}
                        className="font-semibold text-navy-900 hover:text-royal-700"
                      >
                        {row.studentName}
                      </Link>
                      {row.note && (
                        <span className="block text-[11.5px] text-amber-700">{row.note}</span>
                      )}
                    </Td>

                    <Td className="whitespace-nowrap text-slate-700">
                      {row.className} — {row.sectionName}
                    </Td>

                    <Td className="text-slate-700">
                      {row.contactName}
                      <span className="block text-[11px] text-slate-400">{row.contactLabel}</span>
                    </Td>

                    <Td className="whitespace-nowrap tabular text-slate-700">
                      {row.dialNumber ? formatDisplay(row.dialNumber) : (row.phone || '—')}
                      {isSms && row.dialNumber && (
                        <span className="block text-[11px] text-slate-400">
                          {measureSms(row.renderedBody).segments} SMS
                        </span>
                      )}
                    </Td>

                    <Td className="whitespace-nowrap text-[12px] text-slate-600 tabular">
                      {row.sentAt ? (
                        <>
                          {formatDateTime(row.sentAt)}
                          {row.sentByName && (
                            <span className="block text-[11px] text-slate-400">
                              {row.sentByName}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>

                    <Td align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewRow(row)}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-navy-800"
                          title="Read the message"
                          aria-label="Read the message"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => copyMessage(row)}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-navy-800"
                          title="Copy the message text"
                          aria-label="Copy the message text"
                        >
                          {copiedId === row.id ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>

                        {isSent ? (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={busyId === row.id}
                            onClick={() => setSent(row, false)}
                          >
                            {busyId !== row.id && <Undo2 className="h-3.5 w-3.5" />}
                            Undo
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={isSkipped ? 'outline' : 'primary'}
                            disabled={isSkipped}
                            loading={busyId === row.id}
                            onClick={() => openChat(row)}
                            title={
                              isSkipped
                                ? 'This family has no usable mobile number'
                                : isSms
                                  ? 'Open the messaging app with the text ready'
                                  : 'Open WhatsApp with the message ready'
                            }
                          >
                            {busyId !== row.id &&
                              (isSms ? (
                                <Smartphone className="h-3.5 w-3.5" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              ))}
                            {isSms ? 'Open SMS app' : 'Open WhatsApp'}
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>

        {visible.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-slate-500">
            {filter === 'PENDING'
              ? 'Every family in this message has been sent to.'
              : 'Nothing to show for this filter.'}
          </p>
        )}
      </Card>

      {/* --------------------------------------------------------- dialogs */}
      <Modal
        open={Boolean(previewRow)}
        onClose={() => setPreviewRow(null)}
        title={previewRow ? `Message to ${previewRow.contactName}` : ''}
        description={
          previewRow
            ? `${previewRow.studentName} · ${previewRow.className} — ${previewRow.sectionName}`
            : undefined
        }
        size="md"
        footer={
          previewRow && (
            <>
              <Button variant="outline" onClick={() => setPreviewRow(null)}>
                Close
              </Button>
              {previewRow.status !== 'SKIPPED' && previewRow.status !== 'SENT' && (
                <Button
                  onClick={() => {
                    openChat(previewRow);
                    setPreviewRow(null);
                  }}
                >
                  <Send className="h-4 w-4" />
                  Open WhatsApp
                </Button>
              )}
            </>
          )
        }
      >
        {previewRow && (
          <div className="rounded-xl bg-[#e5ddd5] p-3">
            <div className="ml-auto rounded-lg rounded-br-none bg-[#dcf8c6] px-3 py-2 shadow-sm">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#111b21]">
                {previewRow.renderedBody}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={markAllOpen}
        onClose={() => setMarkAllOpen(false)}
        onConfirm={markAll}
        title="Mark every remaining family as sent"
        confirmLabel={`Mark ${pending.length} as sent`}
        tone="primary"
        loading={markingAll}
        message={
          <>
            This records <strong>{pending.length}</strong> family(ies) as messaged without opening
            their chats. Use it only when you have already sent those messages another way —
            otherwise work down the list so nobody is missed.
          </>
        }
      />
    </>
  );
}
