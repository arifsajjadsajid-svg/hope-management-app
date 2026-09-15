/**
 * =====================================================================
 *  THE HOPE SCIENCE ACADEMY — first-run setup for a live database
 * ---------------------------------------------------------------------
 *  Prepares an empty database for real use: the permission catalogue,
 *  the five roles, the grading scheme and result policies, the academy
 *  settings, and one Super Admin account.
 *
 *  No students, classes or examinations are created — those are entered
 *  through the application. For a practice copy with demonstration data,
 *  run `npm run db:seed` instead.
 *
 *  Usage (from a machine with DATABASE_URL pointing at the live server):
 *
 *    ADMIN_USERNAME=principal ADMIN_PASSWORD='a long password' \
 *    ADMIN_NAME='Muhammad Arif Sajjad' npm run db:bootstrap
 *
 *  Safe to re-run, and meant to be after an update: new permissions are added
 *  to the roles, an existing admin account (and its password) is left alone,
 *  and no academic data is touched.
 * =====================================================================
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, ROLE_PERMISSIONS, ALL_PERMISSIONS } from '../src/lib/permissions';
import { ROLE, ROLE_LABELS, ACADEMY_DEFAULTS } from '../src/lib/constants';
import { DEFAULT_GRADE_BANDS } from '../src/lib/grading';

const prisma = new PrismaClient();

const ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: 'Unrestricted control of the entire system, including users, settings and backups.',
  PRINCIPAL: 'Academy-wide performance oversight, final result approval and result locking.',
  EXAM_CONTROLLER:
    'Runs the examination cycle: schedules, roll numbers, seating, marks, results and publication.',
  TEACHER: 'Enters and edits marks for assigned classes and subjects before results are locked.',
  STUDENT: 'Secure portal access to date sheets, roll number slips, results and academic history.',
};

function log(step: string, detail = '') {
  console.log(`  ${step.padEnd(34)}${detail}`);
}

/** Rejects the passwords that get a school system broken into. */
function checkPassword(password: string): void {
  const problems: string[] = [];
  if (password.length < 12) problems.push('at least 12 characters');
  if (!/[a-z]/.test(password)) problems.push('a lower-case letter');
  if (!/[A-Z]/.test(password)) problems.push('a capital letter');
  if (!/[0-9]/.test(password)) problems.push('a digit');

  const weak = ['password', '12345678', 'admin', 'qwerty', 'letmein', 'hope@'];
  if (weak.some((bad) => password.toLowerCase().includes(bad))) {
    problems.push('something less guessable than a common word or the academy name');
  }

  if (problems.length) {
    throw new Error(`ADMIN_PASSWORD needs ${problems.join(', ')}.`);
  }
}

async function bootstrapPermissions() {
  // Which permissions this run introduces. Only those are granted to existing
  // roles below: anything an administrator has since added to or taken away
  // from a role under Users & Roles is their decision and stays as it is.
  const introduced = new Set<string>();

  for (const code of ALL_PERMISSIONS) {
    const meta = PERMISSIONS[code];
    const existing = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
    if (!existing) introduced.add(code);
    await prisma.permission.upsert({
      where: { code },
      update: { name: meta.name, groupName: meta.group },
      create: { code, name: meta.name, groupName: meta.group },
    });
  }

  // A permission removed from the catalogue takes its grants with it (cascade).
  await prisma.permission.deleteMany({ where: { code: { notIn: [...ALL_PERMISSIONS] } } });

  const permissionByCode = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  let granted = 0;

  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const existingRole = await prisma.role.findUnique({ where: { code }, select: { id: true } });
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABELS[code] ?? code, description: ROLE_DESCRIPTIONS[code] ?? null },
      create: {
        code,
        name: ROLE_LABELS[code] ?? code,
        description: ROLE_DESCRIPTIONS[code] ?? null,
        isSystem: true,
      },
    });

    // A brand-new role gets its full default set; an existing one only the
    // permissions that did not exist until now.
    const toGrant = existingRole ? permissions.filter((p) => introduced.has(p)) : permissions;

    for (const permissionCode of toGrant) {
      const permissionId = permissionByCode.get(permissionCode);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
      granted += 1;
    }
  }

  log(
    'Roles & permissions',
    `${ALL_PERMISSIONS.length} permissions across ${Object.keys(ROLE_PERMISSIONS).length} roles` +
      (introduced.size ? ` — ${introduced.size} new, ${granted} grant(s) added` : ' — nothing new'),
  );

  return new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
}

async function bootstrapGrading() {
  const existing = await prisma.gradingScheme.findFirst({ where: { isDefault: true } });
  if (existing) {
    const policy = await prisma.resultPolicy.findFirst({ where: { isDefault: true } });
    log('Grading scheme', 'already present — left unchanged');
    return { schemeId: existing.id, policyId: policy?.id ?? null };
  }

  const scheme = await prisma.gradingScheme.create({
    data: {
      name: 'Academy Standard Grading',
      description:
        'Default percentage-to-grade scale used across all examinations of the academy. Editable under Administration → Grading.',
      useGpa: true,
      isDefault: true,
      bands: { create: DEFAULT_GRADE_BANDS.map((band) => ({ ...band })) },
    },
  });

  const policy = await prisma.resultPolicy.create({
    data: {
      name: 'Academy Standard Result Policy',
      description:
        'Overall 50% pass, subject-wise pass required, one compartment subject permitted, competition ranking.',
      overallPassPercent: 50,
      requireSubjectPass: true,
      requirePracticalPass: true,
      compulsoryMustPass: true,
      graceMarksMax: 0,
      graceMaxSubjects: 0,
      compartmentEnabled: true,
      compartmentMaxSubjects: 1,
      absentCountsAsZero: true,
      absentFailsResult: true,
      rankingMethod: 'COMPETITION',
      promotionPercent: 40,
      includeOptionalInTotal: false,
      isDefault: true,
    },
  });

  await prisma.resultPolicy.create({
    data: {
      name: 'Monthly & Weekly Test Policy',
      description:
        'Lighter policy for class tests: subject-wise pass not enforced, no compartment, dense ranking so tied students share a position.',
      overallPassPercent: 50,
      requireSubjectPass: false,
      requirePracticalPass: false,
      compulsoryMustPass: false,
      compartmentEnabled: false,
      compartmentMaxSubjects: 0,
      absentCountsAsZero: true,
      absentFailsResult: false,
      rankingMethod: 'DENSE',
      promotionPercent: 40,
      isDefault: false,
    },
  });

  log('Grading & result policies', `${DEFAULT_GRADE_BANDS.length} grade bands, 2 policies`);
  return { schemeId: scheme.id, policyId: policy.id };
}

async function bootstrapSettings(gradingId: string, policyId: string | null) {
  await prisma.academySettings.upsert({
    where: { id: 'academy' },
    update: {},
    create: {
      id: 'academy',
      name: process.env.ACADEMY_NAME || ACADEMY_DEFAULTS.name,
      shortName: process.env.ACADEMY_SHORT_NAME || ACADEMY_DEFAULTS.shortName,
      tagline: ACADEMY_DEFAULTS.tagline,
      address: process.env.ACADEMY_ADDRESS || ACADEMY_DEFAULTS.address,
      phone1: process.env.ACADEMY_PHONE1 || ACADEMY_DEFAULTS.phone1,
      phone2: process.env.ACADEMY_PHONE2 || ACADEMY_DEFAULTS.phone2,
      defaultGradingId: gradingId,
      defaultPolicyId: policyId,
      resultPortalEnabled: true,
    },
  });
  log('Academy settings', 'editable under Administration → Academy Settings');
}

async function bootstrapAdmin(roleIds: Map<string, string>) {
  const username = (process.env.ADMIN_USERNAME ?? '').trim();
  const fullName = (process.env.ADMIN_NAME ?? '').trim() || 'System Administrator';

  if (!username) {
    throw new Error('Set ADMIN_USERNAME before running this. It names the first sign-in.');
  }

  // Re-running this script is how new permissions reach a live database after
  // an update, so an account that already exists is left exactly as it is.
  // Overwriting it would silently put back the password from .env and undo
  // whatever the administrator has changed it to since.
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    log('Super Admin account', `${username} — already exists, left unchanged`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    throw new Error('Set ADMIN_PASSWORD before running this. It is the first sign-in password.');
  }
  if (!/^[a-z0-9._-]{3,32}$/i.test(username)) {
    throw new Error('ADMIN_USERNAME must be 3–32 characters: letters, digits, dot, dash, underscore.');
  }
  checkPassword(password);

  const roleId = roleIds.get(ROLE.SUPER_ADMIN);
  if (!roleId) throw new Error('The Super Admin role is missing. Re-run this script.');

  await prisma.user.create({
    data: {
      username,
      fullName,
      email: process.env.ADMIN_EMAIL?.trim() || null,
      passwordHash: await bcrypt.hash(password, 12),
      roleId,
      status: 'ACTIVE',
      mustChangePassword: false,
    },
  });

  log('Super Admin account', username);
}

async function main() {
  console.log('\n  Preparing the database for live use\n');

  const roleIds = await bootstrapPermissions();
  const { schemeId, policyId } = await bootstrapGrading();
  await bootstrapSettings(schemeId, policyId);
  await bootstrapAdmin(roleIds);

  const students = await prisma.student.count();

  console.log('\n  Ready.');
  console.log(`  Students on record: ${students}`);
  console.log('  Sign in, then create the academic session, classes, sections and subjects.\n');
}

main()
  .catch((error) => {
    console.error(`\n  Setup failed: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
