import 'server-only';

import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { prisma } from './prisma';
import type { PermissionCode } from './permissions';
import { ROLE } from './constants';
import { randomToken, sha256 } from './verification';

export const SESSION_COOKIE = 'hsa_session';
export const CSRF_COOKIE = 'hsa_csrf';

const BCRYPT_ROUNDS = 12;

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const SESSION_LIFETIME_MINUTES = envInt('SESSION_LIFETIME_MINUTES', 720);
export const SESSION_IDLE_TIMEOUT_MINUTES = envInt('SESSION_IDLE_TIMEOUT_MINUTES', 60);

/* ------------------------------------------------------------- passwords */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Password strength rules applied to every credential the system stores.
 * Returns a list of human-readable problems (empty means acceptable).
 */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('must be at least 8 characters long');
  if (!/[A-Za-z]/.test(password)) problems.push('must contain a letter');
  if (!/[0-9]/.test(password)) problems.push('must contain a digit');
  const weak = ['password', '12345678', 'admin123', 'qwerty123', 'hopeacademy'];
  if (weak.includes(password.toLowerCase())) problems.push('is too common');
  return problems;
}

/* ----------------------------------------------------------------- tokens */

export { randomToken, sha256, verificationCode } from './verification';

/* ---------------------------------------------------------------- request */

async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0]!.trim() : h.get('x-real-ip');
    return { ip: ip || null, userAgent: h.get('user-agent') };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export { requestContext };

/* --------------------------------------------------------------- sessions */

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  roleCode: string;
  roleName: string;
  permissions: Set<string>;
  avatarPath: string | null;
  studentId: string | null;
  teacherId: string | null;
  mustChangePassword: boolean;
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
};

/**
 * Creates a database-backed session and sets the httpOnly session cookie.
 * The raw token never leaves the cookie; only its SHA-256 hash is stored.
 */
export async function createSession(userId: string): Promise<{ token: string; csrfToken: string }> {
  const token = randomToken(32);
  const csrfToken = randomToken(16);
  const { ip, userAgent } = await requestContext();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MINUTES * 60_000);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfToken,
      ipAddress: ip,
      userAgent: userAgent?.slice(0, 400) ?? null,
      expiresAt,
    },
  });

  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiresAt,
  });
  // Readable by client code so it can echo the token back on API mutations.
  store.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiresAt,
  });

  return { token, csrfToken };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.userSession
      .updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/**
 * Resolves the signed-in user for the current request. Memoised per request so
 * repeated calls inside one render do not re-query the database.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          teacher: { select: { id: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() < now) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  // Idle auto-logout.
  const idleMs = now - session.lastSeenAt.getTime();
  if (idleMs > SESSION_IDLE_TIMEOUT_MINUTES * 60_000) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  if (session.user.status !== 'ACTIVE') return null;

  // Throttle the lastSeenAt write to at most once a minute.
  if (idleMs > 60_000) {
    await prisma.userSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  const permissions = new Set(session.user.role.permissions.map((rp) => rp.permission.code));

  return {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    email: session.user.email,
    roleCode: session.user.role.code,
    roleName: session.user.role.name,
    permissions,
    avatarPath: session.user.avatarPath,
    studentId: session.user.studentId,
    teacherId: session.user.teacher?.id ?? null,
    mustChangePassword: session.user.mustChangePassword,
    sessionId: session.id,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  };
});

/* ------------------------------------------------------------- guard APIs */

export class AuthorizationError extends Error {
  constructor(message = 'You are not authorised to perform this action.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Please sign in to continue.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
  return user;
}

export function userCan(user: SessionUser | null, permission: PermissionCode): boolean {
  if (!user) return false;
  if (user.roleCode === ROLE.SUPER_ADMIN) return true;
  return user.permissions.has(permission);
}

export function userCanAny(user: SessionUser | null, perms: PermissionCode[]): boolean {
  return perms.some((p) => userCan(user, p));
}

export async function requirePermission(permission: PermissionCode): Promise<SessionUser> {
  const user = await requireUser();
  if (!userCan(user, permission)) {
    throw new AuthorizationError(
      `Your role (${user.roleName}) does not have the "${permission}" permission.`,
    );
  }
  return user;
}

export async function requireAnyPermission(perms: PermissionCode[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!userCanAny(user, perms)) {
    throw new AuthorizationError(
      `Your role (${user.roleName}) does not have access to this area.`,
    );
  }
  return user;
}

/* ------------------------------------------------------------ rate limits */

/**
 * Sliding-window throttle for sign-in attempts, applied per username and per IP.
 */
export async function checkLoginRateLimit(
  identifier: string,
  ip: string | null,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date(Date.now() - 15 * 60_000);
  const [byUser, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { identifier, success: false, createdAt: { gte: windowStart } },
    }),
    ip
      ? prisma.loginAttempt.count({
          where: { ipAddress: ip, success: false, createdAt: { gte: windowStart } },
        })
      : Promise.resolve(0),
  ]);

  if (byUser >= 8 || byIp >= 25) return { blocked: true, retryAfterSeconds: 15 * 60 };
  return { blocked: false, retryAfterSeconds: 0 };
}

export async function recordLoginAttempt(
  identifier: string,
  success: boolean,
  reason?: string,
): Promise<void> {
  const { ip } = await requestContext();
  await prisma.loginAttempt
    .create({ data: { identifier, ipAddress: ip, success, reason: reason ?? null } })
    .catch(() => undefined);
}

/** Removes expired and revoked sessions plus stale login attempts. */
export async function pruneExpiredSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  await prisma.$transaction([
    prisma.userSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
}

/** Validates a CSRF token supplied by a non-Server-Action API mutation. */
export async function assertCsrf(supplied: string | null | undefined): Promise<void> {
  const user = await requireUser();
  if (!supplied || supplied !== user.csrfToken) {
    throw new AuthorizationError('Security token mismatch. Please reload the page and try again.');
  }
}
