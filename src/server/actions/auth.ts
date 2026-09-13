'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  checkLoginRateLimit,
  createSession,
  destroySession,
  hashPassword,
  passwordProblems,
  recordLoginAttempt,
  requestContext,
  requireUser,
  verifyPassword,
} from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS, ROLE } from '@/lib/constants';
import { runAction, ok, fail, BusinessRuleError, type ActionResult } from '../action-result';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username or email').max(120),
  password: z.string().min(1, 'Enter your password').max(200),
});

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

export async function loginAction(
  _prev: ActionResult<{ redirectTo: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = loginSchema.safeParse({
      username: formData.get('username'),
      password: formData.get('password'),
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      return fail('Please enter your credentials.', fieldErrors);
    }

    const { username, password } = parsed.data;
    const identifier = username.toLowerCase();
    const { ip } = await requestContext();

    const limit = await checkLoginRateLimit(identifier, ip);
    if (limit.blocked) {
      await recordLoginAttempt(identifier, false, 'RATE_LIMITED');
      return fail(
        'Too many failed sign-in attempts. Please wait 15 minutes before trying again.',
      );
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      include: { role: true },
    });

    // Constant-ish work whether or not the user exists, so timing does not
    // reveal which usernames are valid.
    const hash = user?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000';
    const passwordOk = await verifyPassword(password, hash);

    if (!user || !passwordOk) {
      await recordLoginAttempt(identifier, false, user ? 'BAD_PASSWORD' : 'NO_SUCH_USER');
      if (user) {
        const attempts = user.failedAttempts + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: attempts,
            lockedUntil:
              attempts >= LOCKOUT_THRESHOLD
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                : user.lockedUntil,
          },
        });
      }
      await recordAudit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'User',
        entityId: user?.id ?? null,
        description: `Failed sign-in for "${username}"`,
        severity: 'WARNING',
        actor: { id: null, name: username, role: null },
      });
      return fail('Incorrect username or password.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      await recordLoginAttempt(identifier, false, 'LOCKED');
      return fail(
        `This account is temporarily locked after repeated failed attempts. Try again in ${minutes} minute(s), or ask a Super Admin to reset it.`,
      );
    }

    if (user.status !== 'ACTIVE') {
      await recordLoginAttempt(identifier, false, 'INACTIVE');
      return fail('This account is not active. Please contact the academy administrator.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });

    await createSession(user.id);
    await recordLoginAttempt(identifier, true);
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN,
      entityType: 'User',
      entityId: user.id,
      description: `${user.fullName} signed in`,
      actor: { id: user.id, name: user.fullName, role: user.role.code },
    });

    const redirectTo = user.role.code === ROLE.STUDENT ? '/portal' : '/dashboard';
    return ok({ redirectTo }, `Welcome back, ${user.fullName.split(' ')[0]}.`);
  });
}

export async function logoutAction(): Promise<void> {
  const user = await requireUser().catch(() => null);
  if (user) {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGOUT,
      entityType: 'User',
      entityId: user.id,
      description: `${user.fullName} signed out`,
    });
  }
  await destroySession();
  redirect('/login');
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

export async function changeOwnPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireUser();
    const parsed = changePasswordSchema.parse({
      currentPassword: formData.get('currentPassword'),
      newPassword: formData.get('newPassword'),
      confirmPassword: formData.get('confirmPassword'),
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    const valid = await verifyPassword(parsed.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BusinessRuleError('Your current password is incorrect.', {
        currentPassword: 'Incorrect password',
      });
    }

    const problems = passwordProblems(parsed.newPassword);
    if (problems.length) {
      throw new BusinessRuleError(`The new password ${problems.join(', ')}.`, {
        newPassword: `Password ${problems[0]}`,
      });
    }

    if (await verifyPassword(parsed.newPassword, user.passwordHash)) {
      throw new BusinessRuleError('The new password must be different from the current one.', {
        newPassword: 'Choose a different password',
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(parsed.newPassword), mustChangePassword: false },
      }),
      // Every other session for this account is revoked on a password change.
      prisma.userSession.updateMany({
        where: { userId: user.id, id: { not: session.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordAudit({
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      entityType: 'User',
      entityId: user.id,
      description: `${user.fullName} changed their own password`,
      severity: 'WARNING',
    });

    return ok(undefined, 'Your password has been updated.');
  });
}
