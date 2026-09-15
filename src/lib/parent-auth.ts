import 'server-only';

import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { cache } from 'react';
import { prisma } from './prisma';
import { requestContext } from './auth';
import { normalisePhone } from './phone';
import { randomToken, sha256 } from './verification';

/**
 * Parent portal authentication.
 *
 * Kept wholly apart from staff authentication: its own cookie, its own session
 * table, its own guard. `requireUser()` never recognises a parent session, so
 * every staff page and server action refuses a parent by construction rather
 * than by a permission list somebody could misconfigure.
 */

export const PARENT_COOKIE = 'hsa_parent';

/**
 * A remembered device stays signed in until it has gone this long without a
 * visit. Each visit pushes the deadline forward, so a parent who checks results
 * every term is never asked to sign in again.
 */
const REMEMBER_DAYS = 90;

/** Without "keep me signed in", the session ends when the browser closes. */
const SHORT_SESSION_HOURS = 12;

/** Browsers refuse cookies that outlive 400 days, so the cookie is set just under. */
const COOKIE_MAX_AGE_SECONDS = 399 * 24 * 60 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionParent = {
  id: string;
  phone: string;
  displayName: string;
  mustChangePassword: boolean;
  sessionId: string;
};

export async function createParentSession(parentId: string, remember: boolean): Promise<void> {
  const token = randomToken(32);
  const { ip, userAgent } = await requestContext();
  const expiresAt = new Date(
    Date.now() + (remember ? REMEMBER_DAYS * DAY_MS : SHORT_SESSION_HOURS * 60 * 60 * 1000),
  );

  await prisma.parentSession.create({
    data: {
      parentId,
      tokenHash: sha256(token),
      persistent: remember,
      ipAddress: ip,
      userAgent: userAgent?.slice(0, 400) ?? null,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(PARENT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // A remembered device keeps the cookie; the database decides when it has
    // actually expired, which is what lets the deadline slide without having
    // to rewrite the cookie on every page view. An unremembered one gets a
    // browser-session cookie that disappears when the browser closes.
    ...(remember ? { maxAge: COOKIE_MAX_AGE_SECONDS } : {}),
  });
}

export async function destroyParentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(PARENT_COOKIE)?.value;
  if (token) {
    await prisma.parentSession
      .updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  store.delete(PARENT_COOKIE);
}

/** The signed-in parent for this request, or null. Memoised per request. */
export const getCurrentParent = cache(async (): Promise<SessionParent | null> => {
  const store = await cookies();
  const token = store.get(PARENT_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.parentSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { parent: true },
  });

  if (!session || session.revokedAt) return null;
  if (session.parent.status !== 'ACTIVE') return null;

  const now = Date.now();
  if (session.expiresAt.getTime() < now) {
    await prisma.parentSession
      .update({ where: { id: session.id }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
    return null;
  }

  // Slide a remembered session forward, at most once a day so reading a page
  // does not turn into a database write every time.
  if (session.persistent && now - session.lastSeenAt.getTime() > DAY_MS) {
    await prisma.parentSession
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(now + REMEMBER_DAYS * DAY_MS) },
      })
      .catch(() => undefined);
  }

  return {
    id: session.parent.id,
    phone: session.parent.phone,
    displayName: session.parent.displayName,
    mustChangePassword: session.parent.mustChangePassword,
    sessionId: session.id,
  };
});

/** For pages: sends anyone not signed in to the parent sign-in page. */
export async function requireParent(): Promise<SessionParent> {
  const parent = await getCurrentParent();
  if (!parent) redirect('/parent/login');
  return parent;
}

/* ---------------------------------------------------------------- children */

/**
 * Students whose families are still with the academy. A withdrawn or
 * transferred student is left out on purpose: mobile numbers in Pakistan are
 * recycled, and a number that belonged to a family who left years ago may now
 * belong to a stranger.
 */
const HIDDEN_STATUSES = ['WITHDRAWN', 'TRANSFERRED'];

export type ParentChild = {
  id: string;
  fullName: string;
  fatherName: string;
  admissionNumber: string;
  photoPath: string | null;
  gender: string;
  className: string | null;
  sectionName: string | null;
};

/**
 * Every current student grouped under each number that may sign in for them:
 * the parent number and the WhatsApp number, where those differ.
 *
 * Numbers on student records are typed by hand — "0300-1234567",
 * "+92 300 1234567", "03001234567" — so they are grouped in normalised form
 * rather than as text, or a sibling written differently would silently vanish.
 *
 * Built in one pass so the staff screen can show every family without
 * re-reading the student table once per account.
 */
export const familiesByPhone = cache(async (): Promise<Map<string, ParentChild[]>> => {
  const students = await prisma.student.findMany({
    where: {
      archivedAt: null,
      status: { notIn: HIDDEN_STATUSES },
      OR: [{ parentPhone: { not: null } }, { whatsappNumber: { not: null } }],
    },
    select: {
      id: true,
      fullName: true,
      fatherName: true,
      admissionNumber: true,
      photoPath: true,
      gender: true,
      parentPhone: true,
      whatsappNumber: true,
      enrollments: {
        select: { schoolClass: { select: { name: true } }, section: { select: { name: true } } },
        orderBy: { session: { startDate: 'desc' } },
        take: 1,
      },
    },
    orderBy: { fullName: 'asc' },
  });

  const families = new Map<string, ParentChild[]>();

  for (const student of students) {
    const child: ParentChild = {
      id: student.id,
      fullName: student.fullName,
      fatherName: student.fatherName,
      admissionNumber: student.admissionNumber,
      photoPath: student.photoPath,
      gender: student.gender,
      className: student.enrollments[0]?.schoolClass.name ?? null,
      sectionName: student.enrollments[0]?.section.name ?? null,
    };

    const numbers = new Set<string>();
    for (const raw of [student.parentPhone, student.whatsappNumber]) {
      if (!raw) continue;
      const n = normalisePhone(raw);
      if (n.ok) numbers.add(n.dialNumber);
    }

    for (const number of numbers) {
      const list = families.get(number) ?? [];
      list.push(child);
      families.set(number, list);
    }
  }

  return families;
});

/** Every child a given number may see. */
export async function childrenForPhone(dialNumber: string): Promise<ParentChild[]> {
  return (await familiesByPhone()).get(dialNumber) ?? [];
}

/**
 * Returns the child if it belongs to the signed-in parent. Anything else is a
 * plain 404 — not "forbidden" — so the portal never confirms that a student
 * with a given ID exists at all.
 */
export async function requireParentChild(studentId: string): Promise<{
  parent: SessionParent;
  child: ParentChild;
}> {
  const parent = await requireParent();
  const children = await childrenForPhone(parent.phone);
  const child = children.find((c) => c.id === studentId);
  if (!child) notFound();
  return { parent, child };
}

/** Whether the signed-in parent may see a particular uploaded photograph. */
export async function parentCanSeePhoto(photoUrl: string): Promise<boolean> {
  const parent = await getCurrentParent();
  if (!parent) return false;
  const children = await childrenForPhone(parent.phone);
  return children.some((c) => c.photoPath === photoUrl);
}
