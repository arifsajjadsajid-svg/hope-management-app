import 'server-only';

import { prisma } from './prisma';
import { getCurrentUser, requestContext } from './auth';

type AuditInput = {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  /** Explicit actor, for flows that run before the session exists (e.g. login). */
  actor?: { id: string | null; name: string | null; role: string | null };
};

function serialise(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const json = JSON.stringify(value);
    // Keep individual audit rows bounded so a bulk operation cannot bloat the table.
    return json.length > 8000 ? `${json.slice(0, 8000)}…(truncated)` : json;
  } catch {
    return String(value);
  }
}

/**
 * Writes an audit row. Auditing must never break the operation it is recording,
 * so all failures are swallowed after being logged to the server console.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const actor = input.actor ?? (await currentActor());
    const { ip, userAgent } = await requestContext();

    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        description: input.description ?? null,
        oldValue: serialise(input.oldValue),
        newValue: serialise(input.newValue),
        ipAddress: ip,
        userAgent: userAgent?.slice(0, 300) ?? null,
        severity: input.severity ?? 'INFO',
      },
    });
  } catch (error) {
    console.error('[audit] failed to record audit entry', error);
  }
}

async function currentActor() {
  const user = await getCurrentUser().catch(() => null);
  return {
    id: user?.id ?? null,
    name: user?.fullName ?? 'System',
    role: user?.roleCode ?? null,
  };
}

/**
 * Produces a shallow diff of two records limited to `fields`, so audit entries
 * carry only what actually changed.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
): { old: Record<string, unknown>; next: Record<string, unknown>; changed: boolean } {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const field of fields) {
    if (!(field in after)) continue;
    const prev = before[field];
    const next = after[field];
    const prevNorm = prev instanceof Date ? prev.toISOString() : prev;
    const nextNorm = next instanceof Date ? next.toISOString() : next;
    if (prevNorm !== nextNorm) {
      oldValues[field as string] = prevNorm ?? null;
      newValues[field as string] = nextNorm ?? null;
    }
  }

  return {
    old: oldValues,
    next: newValues,
    changed: Object.keys(newValues).length > 0,
  };
}
