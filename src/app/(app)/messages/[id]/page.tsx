import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader, DetailItem } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { SendList, type SendRow } from './send-list';
import { DeleteCampaignButton } from './campaign-actions';
import { templateByKey } from '@/lib/message-templates';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const campaign = await prisma.messageCampaign.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: campaign?.title ?? 'Message' };
}

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('notifications.send');
  const { id } = await params;

  const campaign = await prisma.messageCampaign.findUnique({
    where: { id },
    include: {
      exam: { select: { name: true } },
      recipients: {
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              enrollments: {
                select: {
                  schoolClass: { select: { name: true } },
                  section: { select: { name: true } },
                },
                orderBy: { session: { startDate: 'desc' } },
                take: 1,
              },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { contactName: 'asc' }],
      },
    },
  });

  if (!campaign) notFound();

  const rows: SendRow[] = campaign.recipients.map((recipient) => {
    const enrolment = recipient.student.enrollments[0];
    return {
      id: recipient.id,
      studentId: recipient.studentId,
      studentName: recipient.student.fullName,
      className: enrolment?.schoolClass.name ?? '—',
      sectionName: enrolment?.section.name ?? '—',
      contactName: recipient.contactName,
      contactLabel: recipient.contactLabel,
      phone: recipient.phone,
      dialNumber: recipient.dialNumber,
      renderedBody: recipient.renderedBody,
      status: recipient.status,
      sentAt: recipient.sentAt ? recipient.sentAt.toISOString() : null,
      sentByName: recipient.sentByName,
      note: recipient.note,
    };
  });

  return (
    <>
      <PageHeader
        title={campaign.title}
        description={
          campaign.channel === 'SMS'
            ? "Open each family's messaging app — the number and text are already filled in, you only press send."
            : "Open each family's WhatsApp chat — the message is already typed, you only press send."
        }
        breadcrumbs={[{ label: 'Messages', href: '/messages' }, { label: campaign.title }]}
        actions={<DeleteCampaignButton campaignId={campaign.id} title={campaign.title} />}
      />

      <Card className="mb-5">
        <CardHeader title="About this message" />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4">
            <DetailItem label="Template" value={templateByKey(campaign.template).label} />
            <DetailItem
              label="Channel"
              value={campaign.channel === 'SMS' ? 'SMS (click-to-text)' : 'WhatsApp click-to-chat'}
            />
            <DetailItem label="Examination" value={campaign.exam?.name} />
            <DetailItem
              label="Prepared"
              value={`${formatDateTime(campaign.createdAt)}${
                campaign.createdByName ? ` by ${campaign.createdByName}` : ''
              }`}
            />
          </dl>
        </CardBody>
      </Card>

      <SendList campaignId={campaign.id} rows={rows} channel={campaign.channel} />
    </>
  );
}
