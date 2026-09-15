'use server';

import crypto from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { hashPassword, passwordProblems, requirePermission } from '@/lib/auth';
import { childrenForPhone } from '@/lib/parent-auth';
import { normalisePhone, formatDisplay } from '@/lib/phone';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

/**
 * Staff management of parent portal accounts.
 *
 * The office never learns a password it cannot see again: a temporary password
 * is shown once, handed to the family, and the parent is asked to replace it
 * at first sign-in, after which only they know it.
 */

/** Short, familiar words that survive being read out over the phone. */
const WORDS = [
  'Apple', 'Bird', 'Cloud', 'Desk', 'Eagle', 'Flower', 'Garden', 'Honey', 'Island', 'Jacket',
  'Kite', 'Lemon', 'Mango', 'Night', 'Orange', 'Pencil', 'Queen', 'River', 'Star', 'Tiger',
  'Umbrella', 'Violet', 'Water', 'Yellow', 'Zebra', 'Bridge', 'Candle', 'Dolphin', 'Forest',
  'Glass', 'Hill', 'Lion', 'Moon', 'Ocean', 'Pearl', 'Rain', 'Silver', 'Tree', 'Window', 'Rose',
];

/**
 * A temporary password such as "Mango-River-4827": easy to type on a phone
 * keyboard, unambiguous to read aloud, and — with sign-in lockout after five
 * wrong attempts — far beyond guessing in the window before it is replaced.
 */
function temporaryPassword(): string {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)]!;
  let second = pick();
  const first = pick();
  while (second === first) second = pick();
  return `${first}-${second}-${crypto.randomInt(1000, 10000)}`;
}

function parsePhone(raw: string): string {
  const normalised = normalisePhone(raw);
  if (!normalised.ok) {
    throw new BusinessRuleError(`${normalised.reason}. Write it as 0300-1234567.`, {
      phone: 'Check this number',
    });
  }
  return normalised.dialNumber;
}

const createSchema = z.object({
  phone: z.string().trim().min(1, 'Enter the parent’s mobile number').max(30),
  displayName: z.string().trim().min(2, 'Enter the parent’s name').max(120),
  password: z.string().max(200).optional(),
  mustChangePassword: z.boolean().default(true),
});

export type IssuedCredentials = {
  id: string;
  displayName: string;
  phoneDisplay: string;
  dialNumber: string;
  /** Shown exactly once; the database holds only its hash. */
  password: string;
  children: string[];
};

export async function createParentAccountAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<IssuedCredentials>> {
  return runAction(async () => {
    const user = await requirePermission('parents.manage');
    const data = createSchema.parse(input);
    const dialNumber = parsePhone(data.phone);

    const existing = await prisma.parentAccount.findUnique({ where: { phone: dialNumber } });
    if (existing) {
      throw new BusinessRuleError(
        `${formatDisplay(dialNumber)} already has a portal account (${existing.displayName}). Reset its password instead.`,
        { phone: 'Already has an account' },
      );
    }

    const children = await childrenForPhone(dialNumber);
    if (children.length === 0) {
      throw new BusinessRuleError(
        `No current student has ${formatDisplay(dialNumber)} as a parent or WhatsApp number, so this account would show nothing. Add the number to the student record first.`,
        { phone: 'No students use this number' },
      );
    }

    const typed = data.password?.trim();
    if (typed) {
      const problems = passwordProblems(typed);
      if (problems.length) {
        throw new BusinessRuleError(`The password ${problems.join(', ')}.`, {
          password: `Password ${problems[0]}`,
        });
      }
    }
    const password = typed || temporaryPassword();

    const account = await prisma.parentAccount.create({
      data: {
        phone: dialNumber,
        displayName: data.displayName,
        passwordHash: await hashPassword(password),
        mustChangePassword: data.mustChangePassword,
        createdByName: user.fullName,
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_ACCOUNT_CREATED,
      entityType: 'ParentAccount',
      entityId: account.id,
      description: `Created parent portal account for ${data.displayName} (${formatDisplay(dialNumber)}) covering ${children.map((c) => c.fullName).join(', ')}`,
      severity: 'WARNING',
    });

    // No revalidatePath here. Revalidating re-renders the page inside this
    // action's own response, which removes a "families without an account"
    // row — and the dialog showing this password — before the office has seen
    // it. The client refreshes once the password dialog is closed instead.

    return ok(
      {
        id: account.id,
        displayName: account.displayName,
        phoneDisplay: formatDisplay(dialNumber),
        dialNumber,
        password,
        children: children.map((c) => c.fullName),
      },
      'Parent account created.',
    );
  });
}

/**
 * Issues a fresh temporary password — for a parent who has forgotten theirs.
 * Every device signed in to the account is signed out at the same moment.
 */
export async function resetParentPasswordAction(
  id: string,
): Promise<ActionResult<IssuedCredentials>> {
  return runAction(async () => {
    await requirePermission('parents.manage');

    const account = await prisma.parentAccount.findUnique({ where: { id } });
    if (!account) throw new BusinessRuleError('That parent account no longer exists.');

    const password = temporaryPassword();

    await prisma.$transaction([
      prisma.parentAccount.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          failedAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.parentSession.updateMany({
        where: { parentId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    const children = await childrenForPhone(account.phone);

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_PASSWORD_RESET,
      entityType: 'ParentAccount',
      entityId: id,
      description: `Reset the portal password for ${account.displayName} (${formatDisplay(account.phone)}) and signed out all their devices`,
      severity: 'WARNING',
    });

    // Refreshed by the client once the password dialog closes, as with
    // creating an account, so the page never re-renders underneath a password
    // the office has not finished reading.

    return ok(
      {
        id,
        displayName: account.displayName,
        phoneDisplay: formatDisplay(account.phone),
        dialNumber: account.phone,
        password,
        children: children.map((c) => c.fullName),
      },
      'New temporary password issued.',
    );
  });
}

/** Switches an account off (or back on). Switching off ends every session. */
export async function setParentStatusAction(
  id: string,
  status: 'ACTIVE' | 'DISABLED',
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('parents.manage');

    const account = await prisma.parentAccount.findUnique({ where: { id } });
    if (!account) throw new BusinessRuleError('That parent account no longer exists.');

    await prisma.$transaction([
      prisma.parentAccount.update({
        where: { id },
        data: { status, ...(status === 'ACTIVE' ? { failedAttempts: 0, lockedUntil: null } : {}) },
      }),
      ...(status === 'DISABLED'
        ? [
            prisma.parentSession.updateMany({
              where: { parentId: id, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_ACCOUNT_UPDATED,
      entityType: 'ParentAccount',
      entityId: id,
      description: `${status === 'DISABLED' ? 'Switched off' : 'Switched on'} the portal account for ${account.displayName} (${formatDisplay(account.phone)})`,
      severity: 'WARNING',
    });

    revalidatePath('/parents');
    return ok(undefined, status === 'DISABLED' ? 'Account switched off.' : 'Account switched on.');
  });
}

export async function signOutParentEverywhereAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('parents.manage');

    const account = await prisma.parentAccount.findUnique({ where: { id } });
    if (!account) throw new BusinessRuleError('That parent account no longer exists.');

    const { count } = await prisma.parentSession.updateMany({
      where: { parentId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_ACCOUNT_UPDATED,
      entityType: 'ParentAccount',
      entityId: id,
      description: `Signed ${account.displayName} out of ${count} device(s)`,
      severity: 'INFO',
    });

    revalidatePath('/parents');
    return ok(undefined, count ? `Signed out of ${count} device(s).` : 'No devices were signed in.');
  });
}

export async function deleteParentAccountAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('parents.manage');

    const account = await prisma.parentAccount.findUnique({ where: { id } });
    if (!account) throw new BusinessRuleError('That parent account no longer exists.');

    // Sessions cascade with the account.
    await prisma.parentAccount.delete({ where: { id } });

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_ACCOUNT_DELETED,
      entityType: 'ParentAccount',
      entityId: id,
      description: `Deleted the portal account for ${account.displayName} (${formatDisplay(account.phone)})`,
      severity: 'WARNING',
    });

    revalidatePath('/parents');
    return ok(undefined, 'Parent account deleted.');
  });
}
