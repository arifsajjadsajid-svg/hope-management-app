'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { buildRecipients, previewOne, type BuiltRecipient } from '../services/messaging';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

const campaignSchema = z.object({
  title: z.string().trim().min(1, 'Give the message a title').max(160),
  template: z.string().trim().min(1).max(40),
  channel: z.enum(['WHATSAPP', 'SMS']).default('WHATSAPP'),
  // Browsers submit textarea content with CRLF; normalise so the stored and
  // transmitted message uses plain newlines.
  body: z
    .string()
    .transform((v) => v.replace(/\r\n/g, '\n').trim())
    .pipe(z.string().min(10, 'The message is too short').max(4000)),
  audience: z.enum(['ALL', 'CLASS', 'SECTION', 'STUDENT']),
  audienceRef: z.string().trim().optional(),
  sessionId: z.string().trim().min(1, 'An academic session is required'),
  examId: z.string().trim().optional(),
});

/** Live preview for the composer: renders the message for one real family. */
export async function previewMessageAction(input: {
  body: string;
  audience: 'ALL' | 'CLASS' | 'SECTION' | 'STUDENT';
  audienceRef?: string;
  sessionId: string;
  examId?: string;
  channel?: 'WHATSAPP' | 'SMS';
}): Promise<ActionResult<{ recipient: BuiltRecipient | null }>> {
  return runAction(async () => {
    await requirePermission('notifications.send');

    const recipient = await previewOne({
      body: input.body,
      audience: input.audience,
      audienceRef: input.audienceRef || null,
      sessionId: input.sessionId,
      examId: input.examId || null,
      channel: input.channel ?? 'WHATSAPP',
    });

    return ok({ recipient });
  });
}

/**
 * Creates a campaign and stores the fully rendered message for every family.
 * Nothing is transmitted here — the send list hands the operator one WhatsApp
 * link per family, and each is marked as sent when it is opened.
 */
export async function createCampaignAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requirePermission('notifications.send');

    const input = campaignSchema.parse({
      title: formData.get('title'),
      template: formData.get('template') ?? 'CUSTOM',
      channel: formData.get('channel') ?? 'WHATSAPP',
      body: formData.get('body'),
      audience: formData.get('audience') ?? 'ALL',
      audienceRef: formData.get('audienceRef') ?? '',
      sessionId: formData.get('sessionId'),
      examId: formData.get('examId') ?? '',
    });

    if (input.audience !== 'ALL' && !input.audienceRef) {
      throw new BusinessRuleError('Choose the class, section or student to message.', {
        audienceRef: 'Select an audience',
      });
    }

    const built = await buildRecipients({
      audience: input.audience,
      audienceRef: input.audienceRef || null,
      sessionId: input.sessionId,
      examId: input.examId || null,
      body: input.body,
      channel: input.channel,
    });

    if (built.recipients.length === 0) {
      throw new BusinessRuleError(
        'No active students match that audience, so there is nobody to message.',
      );
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.messageCampaign.create({
        data: {
          title: input.title,
          template: input.template,
          channel: input.channel,
          body: input.body,
          audience: input.audience,
          audienceRef: input.audienceRef || null,
          examId: input.examId || null,
          createdByName: user.fullName,
        },
      });

      await tx.messageRecipient.createMany({
        data: built.recipients.map((recipient) => ({
          campaignId: created.id,
          studentId: recipient.studentId,
          contactName: recipient.contactName,
          contactLabel: recipient.contactLabel,
          phone: recipient.phone,
          dialNumber: recipient.dialNumber,
          renderedBody: recipient.renderedBody,
          // Families with no usable number are parked rather than pretended sent.
          status: recipient.problem ? 'SKIPPED' : 'PENDING',
          note: recipient.problem,
        })),
      });

      return created;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.NOTIFICATION_SENT,
      entityType: 'MessageCampaign',
      entityId: campaign.id,
      description: `Prepared ${input.channel === 'SMS' ? 'SMS' : 'WhatsApp'} message "${input.title}" for ${built.summary.ready} family(ies)${
        built.summary.unreachable ? `; ${built.summary.unreachable} had no usable number` : ''
      }`,
    });

    revalidatePath('/messages');
    return ok(
      { id: campaign.id },
      `${built.summary.ready} message(s) ready to send${
        built.summary.unreachable ? `; ${built.summary.unreachable} skipped for a missing number` : ''
      }.`,
    );
  });
}

/** Marks one family as messaged, the moment their chat link is opened. */
export async function markRecipientSentAction(
  recipientId: string,
  sent: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('notifications.send');

    const recipient = await prisma.messageRecipient.findUnique({
      where: { id: recipientId },
      select: { id: true, status: true },
    });
    if (!recipient) throw new BusinessRuleError('That recipient no longer exists.');
    if (recipient.status === 'SKIPPED' && sent) {
      throw new BusinessRuleError(
        'This family has no usable number. Correct the number on the student record first.',
      );
    }

    await prisma.messageRecipient.update({
      where: { id: recipientId },
      data: sent
        ? { status: 'SENT', sentAt: new Date(), sentByName: user.fullName }
        : { status: 'PENDING', sentAt: null, sentByName: null },
    });

    revalidatePath('/messages');
    return ok(undefined, sent ? 'Marked as sent.' : 'Marked as not sent.');
  });
}

/** Marks every pending family in a campaign as sent, for bulk reconciliation. */
export async function markAllSentAction(
  campaignId: string,
): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const user = await requirePermission('notifications.send');

    const campaign = await prisma.messageCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new BusinessRuleError('That message no longer exists.');

    const result = await prisma.messageRecipient.updateMany({
      where: { campaignId, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date(), sentByName: user.fullName },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.NOTIFICATION_SENT,
      entityType: 'MessageCampaign',
      entityId: campaignId,
      description: `Marked ${result.count} recipient(s) of "${campaign.title}" as sent`,
    });

    revalidatePath('/messages');
    return ok({ count: result.count }, `${result.count} recipient(s) marked as sent.`);
  });
}

export async function deleteCampaignAction(campaignId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('notifications.send');

    const campaign = await prisma.messageCampaign.findUnique({
      where: { id: campaignId },
      include: { _count: { select: { recipients: true } } },
    });
    if (!campaign) throw new BusinessRuleError('That message no longer exists.');

    await prisma.messageCampaign.delete({ where: { id: campaignId } });

    await recordAudit({
      action: AUDIT_ACTIONS.NOTIFICATION_SENT,
      entityType: 'MessageCampaign',
      entityId: campaignId,
      description: `Deleted message "${campaign.title}" and its ${campaign._count.recipients} recipient record(s)`,
      severity: 'WARNING',
    });

    revalidatePath('/messages');
    return ok(undefined, 'Message deleted.');
  });
}
