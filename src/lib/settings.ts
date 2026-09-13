import 'server-only';

import { cache } from 'react';
import { prisma } from './prisma';
import { ACADEMY_DEFAULTS } from './constants';

export type AcademyProfile = {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  address: string;
  phone1: string;
  phone2: string;
  email: string | null;
  website: string | null;
  logoPath: string | null;
  stampPath: string | null;
  directorName: string | null;
  directorSignPath: string | null;
  principalName: string | null;
  principalSignPath: string | null;
  examControllerName: string | null;
  examControllerSign: string | null;
  footerMessage: string;
  currentSessionId: string | null;
  defaultGradingId: string | null;
  defaultPolicyId: string | null;
  resultPortalEnabled: boolean;
  /** "0322-4157001 | 0300-8194789" — the exact contact line used on documents. */
  contactLine: string;
};

const FALLBACK: AcademyProfile = {
  id: 'academy',
  name: ACADEMY_DEFAULTS.name,
  shortName: ACADEMY_DEFAULTS.shortName,
  tagline: ACADEMY_DEFAULTS.tagline,
  address: ACADEMY_DEFAULTS.address,
  phone1: ACADEMY_DEFAULTS.phone1,
  phone2: ACADEMY_DEFAULTS.phone2,
  email: null,
  website: null,
  logoPath: null,
  stampPath: null,
  directorName: null,
  directorSignPath: null,
  principalName: null,
  principalSignPath: null,
  examControllerName: null,
  examControllerSign: null,
  footerMessage: 'This is a computer generated document issued by The Hope Science Academy.',
  currentSessionId: null,
  defaultGradingId: null,
  defaultPolicyId: null,
  resultPortalEnabled: true,
  contactLine: `${ACADEMY_DEFAULTS.phone1} | ${ACADEMY_DEFAULTS.phone2}`,
};

function withContactLine(row: Omit<AcademyProfile, 'contactLine'>): AcademyProfile {
  const phones = [row.phone1, row.phone2].filter(Boolean);
  return { ...row, contactLine: phones.join(' | ') };
}

/**
 * The academy profile that brands every screen and printed document.
 * Falls back to the built-in Hope Science Academy details if the settings row
 * has not been created yet (i.e. before the first seed).
 */
export const getAcademySettings = cache(async (): Promise<AcademyProfile> => {
  try {
    const row = await prisma.academySettings.findUnique({ where: { id: 'academy' } });
    if (!row) return FALLBACK;
    const { updatedAt: _updatedAt, ...rest } = row;
    return withContactLine(rest as Omit<AcademyProfile, 'contactLine'>);
  } catch {
    return FALLBACK;
  }
});

/** Ensures the singleton settings row exists; used by the seed and by setup. */
export async function ensureAcademySettings(): Promise<void> {
  await prisma.academySettings.upsert({
    where: { id: 'academy' },
    update: {},
    create: {
      id: 'academy',
      name: ACADEMY_DEFAULTS.name,
      shortName: ACADEMY_DEFAULTS.shortName,
      tagline: ACADEMY_DEFAULTS.tagline,
      address: ACADEMY_DEFAULTS.address,
      phone1: ACADEMY_DEFAULTS.phone1,
      phone2: ACADEMY_DEFAULTS.phone2,
    },
  });
}

/** The session marked current in settings, falling back to `isCurrent`. */
export const getCurrentSession = cache(async () => {
  const settings = await getAcademySettings();
  if (settings.currentSessionId) {
    const byId = await prisma.academicSession.findUnique({
      where: { id: settings.currentSessionId },
    });
    if (byId) return byId;
  }
  return (
    (await prisma.academicSession.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.academicSession.findFirst({ orderBy: { startDate: 'desc' } }))
  );
});

/**
 * The address parents actually visit.
 *
 * This ends up inside the QR codes printed on report cards and certificates, so
 * getting it wrong produces documents that verify to nothing. An explicit
 * NEXT_PUBLIC_APP_URL always wins; on Vercel the project's own production
 * domain is used when that is not set, which keeps a first deployment correct
 * before anyone has configured anything.
 */
export function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const vercel =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}
