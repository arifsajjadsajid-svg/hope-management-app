'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { childrenForPhone, familiesByPhone } from '@/lib/parent-auth';
import { normalisePhone, formatDisplay } from '@/lib/phone';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

/**
 * Staff management of parent portal access.
 *
 * Parents sign in with their mobile number alone, so an account is simply the
 * academy's decision that a number may sign in. Creating one grants access;
 * switching it off removes access and ends every session it has.
 */

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
});

export type GrantedAccess = {
  id: string;
  displayName: string;
  phoneDisplay: string;
  dialNumber: string;
  children: string[];
};

export async function createParentAccountAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<GrantedAccess>> {
  return runAction(async () => {
    const user = await requirePermission('parents.manage');
    const data = createSchema.parse(input);
    const dialNumber = parsePhone(data.phone);

    const existing = await prisma.parentAccount.findUnique({ where: { phone: dialNumber } });
    if (existing) {
      throw new BusinessRuleError(
        `${formatDisplay(dialNumber)} already has portal access (${existing.displayName}).`,
        { phone: 'Already has access' },
      );
    }

    const children = await childrenForPhone(dialNumber);
    if (children.length === 0) {
      throw new BusinessRuleError(
        `No current student has ${formatDisplay(dialNumber)} as a parent or WhatsApp number, so this parent would see nothing. Add the number to the student record first.`,
        { phone: 'No students use this number' },
      );
    }

    const account = await prisma.parentAccount.create({
      data: { phone: dialNumber, displayName: data.displayName, createdByName: user.fullName },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_ACCOUNT_CREATED,
      entityType: 'ParentAccount',
      entityId: account.id,
      description: `Gave ${data.displayName} (${formatDisplay(dialNumber)}) parent portal access to ${children.map((c) => c.fullName).join(', ')}`,
      severity: 'WARNING',
    });

    // Refreshed by the client once the confirmation dialog closes. Revalidating
    // here would re-render the page inside this action's response and remove the
    // "families without access" row — and the dialog with it — straight away.

    return ok(
      {
        id: account.id,
        displayName: account.displayName,
        phoneDisplay: formatDisplay(dialNumber),
        dialNumber,
        children: children.map((c) => c.fullName),
      },
      'Portal access given.',
    );
  });
}

/**
 * Gives portal access to every family on the student records that does not
 * have it yet. With no password to hand out, doing this one family at a time
 * would be nothing but clicking.
 *
 * A number is skipped when every child it covers is already reachable through
 * another number, so a family is not given a second account for their other phone.
 */
export async function grantAccessToAllFamiliesAction(): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const user = await requirePermission('parents.manage');

    const [families, accounts] = await Promise.all([
      familiesByPhone(),
      prisma.parentAccount.findMany({ select: { phone: true } }),
    ]);

    const covered = new Set<string>();
    for (const account of accounts) {
      for (const child of families.get(account.phone) ?? []) covered.add(child.id);
    }

    const toCreate: { phone: string; displayName: string }[] = [];
    for (const [dialNumber, children] of families) {
      if (!children.some((c) => !covered.has(c.id))) continue;
      toCreate.push({ phone: dialNumber, displayName: children[0]?.fatherName ?? 'Parent' });
      // Mark these children covered so the family's second number is skipped.
      for (const child of children) covered.add(child.id);
    }

    if (toCreate.length === 0) {
      return ok({ created: 0 }, 'Every family already has access.');
    }

    const { count } = await prisma.parentAccount.createMany({
      data: toCreate.map((f) => ({ ...f, createdByName: user.fullName })),
      skipDuplicates: true,
    });

    await recordAudit({
      action: AUDIT_ACTIONS.PARENT_ACCOUNT_CREATED,
      entityType: 'ParentAccount',
      description: `Gave parent portal access to ${count} families at once`,
      severity: 'WARNING',
    });

    revalidatePath('/parents');
    return ok({ created: count }, `Portal access given to ${count} families.`);
  });
}

/** Switches access off (or back on). Switching off ends every session. */
export async function setParentStatusAction(
  id: string,
  status: 'ACTIVE' | 'DISABLED',
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('parents.manage');

    const account = await prisma.parentAccount.findUnique({ where: { id } });
    if (!account) throw new BusinessRuleError('That parent account no longer exists.');

    await prisma.$transaction([
      prisma.parentAccount.update({ where: { id }, data: { status } }),
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
      description: `${status === 'DISABLED' ? 'Switched off' : 'Switched on'} portal access for ${account.displayName} (${formatDisplay(account.phone)})`,
      severity: 'WARNING',
    });

    revalidatePath('/parents');
    return ok(undefined, status === 'DISABLED' ? 'Access switched off.' : 'Access switched on.');
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
      description: `Removed portal access for ${account.displayName} (${formatDisplay(account.phone)})`,
      severity: 'WARNING',
    });

    revalidatePath('/parents');
    return ok(undefined, 'Portal access removed.');
  });
}
