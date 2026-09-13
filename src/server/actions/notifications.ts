'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { notificationSchema } from '@/lib/schemas';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

const formValue = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  return raw === null ? '' : String(raw);
};

/**
 * Resolves the audience of a notification to the user accounts that should
 * receive it in the application.
 */
async function resolveRecipients(audience: string, reference: string | undefined) {
  if (audience === 'ROLE' && reference) {
    return prisma.user.findMany({ where: { status: 'ACTIVE', roleId: reference }, select: { id: true } });
  }

  if (audience === 'STUDENT' && reference) {
    return prisma.user.findMany({ where: { status: 'ACTIVE', studentId: reference }, select: { id: true } });
  }

  if ((audience === 'CLASS' || audience === 'SECTION') && reference) {
    const enrollments = await prisma.enrollment.findMany({
      where: audience === 'CLASS' ? { classId: reference } : { sectionId: reference },
      select: { studentId: true },
    });
    return prisma.user.findMany({
      where: { status: 'ACTIVE', studentId: { in: enrollments.map((e) => e.studentId) } },
      select: { id: true },
    });
  }

  return prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
}

export async function sendNotificationAction(
  _prev: ActionResult<{ recipients: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ recipients: number }>> {
  return runAction(async () => {
    const user = await requirePermission('notifications.send');

    const input = notificationSchema.parse({
      title: formValue(formData, 'title'),
      message: formValue(formData, 'message'),
      type: formValue(formData, 'type'),
      channels: formData.getAll('channels').map(String).filter(Boolean),
      audience: formValue(formData, 'audience') || 'ALL',
      audienceRef: formValue(formData, 'audienceRef'),
      link: formValue(formData, 'link'),
    });

    if (input.audience !== 'ALL' && !input.audienceRef) {
      throw new BusinessRuleError('Choose the specific audience for this notification.', {
        audienceRef: 'Select an audience',
      });
    }

    const recipients = await resolveRecipients(input.audience, input.audienceRef);
    if (recipients.length === 0) {
      throw new BusinessRuleError(
        'No active user accounts match that audience, so nobody would receive this notification.',
      );
    }

    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          title: input.title,
          message: input.message,
          type: input.type,
          channels: input.channels.join(','),
          audience: input.audience,
          audienceRef: input.audienceRef ?? null,
          link: input.link ?? null,
          createdByName: user.fullName,
        },
      });

      await tx.notificationRecipient.createMany({
        data: recipients.map((recipient) => ({
          notificationId: created.id,
          userId: recipient.id,
          // Only the in-app channel is delivered by this installation; email,
          // SMS and WhatsApp are recorded as pending until a gateway is wired in.
          deliveryStatus: input.channels.includes('IN_APP') ? 'DELIVERED' : 'PENDING',
        })),
      });

      return created;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.NOTIFICATION_SENT,
      entityType: 'Notification',
      entityId: notification.id,
      description: `Sent "${input.title}" to ${recipients.length} recipient(s) via ${input.channels.join(', ')}`,
    });

    revalidatePath('/notifications');
    return ok(
      { recipients: recipients.length },
      `Notification delivered to ${recipients.length} recipient(s).`,
    );
  });
}

export async function markNotificationReadAction(
  notificationId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();

    await prisma.notificationRecipient.updateMany({
      where: { notificationId, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    revalidatePath('/notifications');
    return ok(undefined, 'Marked as read.');
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const user = await requireUser();

    const result = await prisma.notificationRecipient.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    revalidatePath('/notifications');
    return ok({ count: result.count }, `${result.count} notification(s) marked as read.`);
  });
}
