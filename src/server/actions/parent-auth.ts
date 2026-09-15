'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  checkLoginRateLimit,
  hashPassword,
  passwordProblems,
  recordLoginAttempt,
  requestContext,
  verifyPassword,
} from '@/lib/auth';
import {
  createParentSession,
  destroyParentSession,
  getCurrentParent,
} from '@/lib/parent-auth';
import { normalisePhone } from '@/lib/phone';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { runAction, ok, fail, BusinessRuleError, type ActionResult } from '../action-result';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

/** A bcrypt hash of nothing in particular, compared against when no account exists. */
const DUMMY_HASH = '$2a$12$0000000000000000000000000000000000000000000000000000';

const loginSchema = z.object({
  phone: z.string().trim().min(1, 'Enter your mobile number').max(30),
  password: z.string().min(1, 'Enter your password').max(200),
});

export async function parentLoginAction(
  _prev: ActionResult<{ redirectTo: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = loginSchema.safeParse({
      phone: formData.get('phone'),
      password: formData.get('password'),
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      return fail('Please enter your mobile number and password.', fieldErrors);
    }

    const remember = formData.get('remember') === 'on';
    const normalised = normalisePhone(parsed.data.phone);
    const { ip } = await requestContext();

    // Throttled by number and by address, so guessing passwords for one family
    // or trying one password across many numbers both run out quickly.
    const identifier = `parent:${normalised.ok ? normalised.dialNumber : 'invalid'}`;
    const limit = await checkLoginRateLimit(identifier, ip);
    if (limit.blocked) {
      await recordLoginAttempt(identifier, false, 'RATE_LIMITED');
      return fail('Too many attempts. Please wait 15 minutes, or call the academy for help.');
    }

    const account = normalised.ok
      ? await prisma.parentAccount.findUnique({ where: { phone: normalised.dialNumber } })
      : null;

    // The same bcrypt work runs whether or not the account exists, so the time
    // taken does not reveal which numbers have portal accounts.
    const passwordOk = await verifyPassword(parsed.data.password, account?.passwordHash ?? DUMMY_HASH);

    if (!account || !passwordOk) {
      await recordLoginAttempt(identifier, false, account ? 'BAD_PASSWORD' : 'NO_SUCH_ACCOUNT');
      if (account) {
        const attempts = account.failedAttempts + 1;
        await prisma.parentAccount.update({
          where: { id: account.id },
          data: {
            failedAttempts: attempts,
            lockedUntil:
              attempts >= LOCKOUT_THRESHOLD
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                : account.lockedUntil,
          },
        });
      }
      // One message for both cases: never confirm whether a number is registered.
      return fail('Incorrect mobile number or password.');
    }

    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60_000);
      await recordLoginAttempt(identifier, false, 'LOCKED');
      return fail(
        `This account is locked after several wrong passwords. Try again in ${minutes} minute(s), or call the academy.`,
      );
    }

    if (account.status !== 'ACTIVE') {
      await recordLoginAttempt(identifier, false, 'DISABLED');
      return fail('This account has been switched off. Please contact the academy office.');
    }

    await prisma.parentAccount.update({
      where: { id: account.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
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

    return ok({ redirectTo: account.mustChangePassword ? '/parent/change-password' : '/parent' });
  });
}

export async function parentLogoutAction(): Promise<void> {
  await destroyParentSession();
  redirect('/parent/login');
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string().min(1, 'Type the new password again'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

/**
 * A parent replaces the password the office gave them with one only they know.
 * Every other device signed in to the account is signed out.
 */
export async function parentChangePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await getCurrentParent();
    if (!parent) return fail('Your session has ended. Please sign in again.');

    const parsed = changePasswordSchema.parse({
      currentPassword: formData.get('currentPassword'),
      newPassword: formData.get('newPassword'),
      confirmPassword: formData.get('confirmPassword'),
    });

    const account = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });

    if (!(await verifyPassword(parsed.currentPassword, account.passwordHash))) {
      throw new BusinessRuleError('Your current password is not correct.', {
        currentPassword: 'Incorrect password',
      });
    }

    const problems = passwordProblems(parsed.newPassword);
    if (problems.length) {
      throw new BusinessRuleError(`The new password ${problems.join(', ')}.`, {
        newPassword: `Password ${problems[0]}`,
      });
    }

    if (await verifyPassword(parsed.newPassword, account.passwordHash)) {
      throw new BusinessRuleError('Choose a password different from the one the academy gave you.', {
        newPassword: 'Choose a different password',
      });
    }

    await prisma.$transaction([
      prisma.parentAccount.update({
        where: { id: account.id },
        data: { passwordHash: await hashPassword(parsed.newPassword), mustChangePassword: false },
      }),
      prisma.parentSession.updateMany({
        where: { parentId: account.id, id: { not: parent.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_PASSWORD_CHANGED,
      entityType: 'ParentAccount',
      entityId: account.id,
      description: `Parent ${account.displayName} set their own portal password`,
      actor: { id: null, name: account.displayName, role: 'PARENT' },
    });

    return ok(undefined, 'Your password has been changed.');
  });
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
