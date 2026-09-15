'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { checkLoginRateLimit, recordLoginAttempt, requestContext } from '@/lib/auth';
import {
  createParentSession,
  destroyParentSession,
  getCurrentParent,
} from '@/lib/parent-auth';
import { normalisePhone } from '@/lib/phone';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { runAction, ok, fail, type ActionResult } from '../action-result';

const loginSchema = z.object({
  phone: z.string().trim().min(1, 'Enter your mobile number').max(30),
});

/**
 * Signs a parent in with their mobile number alone.
 *
 * The number only works once the office has given that family access, and
 * access can be switched off at any time. Attempts with numbers that have no
 * access are throttled per address, which slows anyone trying number after
 * number to find the families that do.
 */
export async function parentLoginAction(
  _prev: ActionResult<{ redirectTo: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = loginSchema.safeParse({ phone: formData.get('phone') });
    if (!parsed.success) {
      return fail('Please enter your mobile number.', {
        phone: parsed.error.issues[0]?.message ?? 'Enter your mobile number',
      });
    }

    const remember = formData.get('remember') === 'on';
    const normalised = normalisePhone(parsed.data.phone);
    const { ip } = await requestContext();

    const identifier = `parent:${normalised.ok ? normalised.dialNumber : 'invalid'}`;
    const limit = await checkLoginRateLimit(identifier, ip);
    if (limit.blocked) {
      await recordLoginAttempt(identifier, false, 'RATE_LIMITED');
      return fail('Too many attempts. Please wait 15 minutes, or call the academy for help.');
    }

    if (!normalised.ok) {
      await recordLoginAttempt(identifier, false, 'INVALID_NUMBER');
      return fail(`${normalised.reason}. Please write it as 0300-1234567.`, {
        phone: 'Check this number',
      });
    }

    const account = await prisma.parentAccount.findUnique({
      where: { phone: normalised.dialNumber },
    });

    if (!account) {
      await recordLoginAttempt(identifier, false, 'NO_SUCH_ACCOUNT');
      return fail(
        'This number does not have access to the parent portal yet. Please call the academy office.',
        { phone: 'Not registered' },
      );
    }

    if (account.status !== 'ACTIVE') {
      await recordLoginAttempt(identifier, false, 'DISABLED');
      return fail('Access for this number has been switched off. Please contact the academy office.');
    }

    await prisma.parentAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    await createParentSession(account.id, remember);
    await recordLoginAttempt(identifier, true);
    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_LOGIN,
      entityType: 'ParentAccount',
      entityId: account.id,
      description: `Parent ${account.displayName} signed in to the portal${remember ? ' (device remembered)' : ''}`,
      actor: { id: null, name: account.displayName, role: 'PARENT' },
    });

    return ok({ redirectTo: '/parent' });
  });
}

export async function parentLogoutAction(): Promise<void> {
  await destroyParentSession();
  redirect('/parent/login');
}

/** Signs out every device except this one — for a lost or shared phone. */
export async function parentSignOutOtherDevicesAction(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const parent = await getCurrentParent();
    if (!parent) return fail('Your session has ended. Please sign in again.');

    const { count } = await prisma.parentSession.updateMany({
      where: { parentId: parent.id, id: { not: parent.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return ok(
      { count },
      count ? `Signed out of ${count} other device(s).` : 'No other devices were signed in.',
    );
  });
}
