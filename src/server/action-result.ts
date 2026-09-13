import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthenticationError, AuthorizationError } from '@/lib/auth';

export type ActionSuccess<T> = { ok: true; message?: string; data?: T };
export type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
  code?: string;
};
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data?: T, message?: string): ActionSuccess<T> {
  return { ok: true, data, message };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string>,
  code?: string,
): ActionFailure {
  return { ok: false, error, fieldErrors, code };
}

/** Domain error thrown by server code to produce a clean user-facing message. */
export class BusinessRuleError extends Error {
  fieldErrors?: Record<string, string>;
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'BusinessRuleError';
    this.fieldErrors = fieldErrors;
  }
}

function humaniseTarget(target: unknown): string {
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  const pretty = fields.map((f) =>
    String(f)
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim(),
  );
  return pretty.join(' + ') || 'value';
}

/**
 * Converts any thrown error into a predictable ActionFailure. Unexpected errors
 * are logged server-side and reported generically so internals never leak to
 * the browser.
 */
export function toActionFailure(error: unknown): ActionFailure {
  if (error instanceof BusinessRuleError) {
    return fail(error.message, error.fieldErrors, 'BUSINESS_RULE');
  }

  if (error instanceof AuthenticationError) {
    return fail(error.message, undefined, 'UNAUTHENTICATED');
  }

  if (error instanceof AuthorizationError) {
    return fail(error.message, undefined, 'FORBIDDEN');
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return fail('Please correct the highlighted fields.', fieldErrors, 'VALIDATION');
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const label = humaniseTarget((error.meta as { target?: unknown } | undefined)?.target);
      return fail(`${label} is already in use. Please enter a unique value.`, undefined, 'DUPLICATE');
    }
    if (error.code === 'P2003') {
      return fail(
        'This record is linked to other data and cannot be changed or removed.',
        undefined,
        'FK_CONSTRAINT',
      );
    }
    if (error.code === 'P2025') {
      return fail('The record no longer exists. It may have been deleted.', undefined, 'NOT_FOUND');
    }
  }

  console.error('[action] unexpected error', error);
  return fail('Something went wrong while processing the request. Please try again.');
}

/**
 * Wraps a server action body so every action returns an ActionResult rather
 * than throwing across the server/client boundary.
 */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    return toActionFailure(error);
  }
}
