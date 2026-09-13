/**
 * Emergency Super Admin password reset, for when nobody can sign in.
 *
 *   npm run reset-admin -- "NewStrongPassword123"
 *
 * Run it from the machine hosting the application; there is no way to trigger
 * it over the network. The change is written to the audit log.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLE } from '../src/lib/constants';

const prisma = new PrismaClient();

function problems(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('must be at least 8 characters long');
  if (!/[A-Za-z]/.test(password)) issues.push('must contain a letter');
  if (!/[0-9]/.test(password)) issues.push('must contain a digit');
  return issues;
}

async function main() {
  const password = process.argv[2];
  const username = process.argv[3];

  if (!password) {
    console.error('Usage: npm run reset-admin -- "<new password>" [username]');
    process.exit(1);
  }

  const invalid = problems(password);
  if (invalid.length) {
    console.error(`The password ${invalid.join(', ')}.`);
    process.exit(1);
  }

  const user = username
    ? await prisma.user.findUnique({ where: { username: username.toLowerCase() }, include: { role: true } })
    : await prisma.user.findFirst({
        where: { role: { code: ROLE.SUPER_ADMIN } },
        include: { role: true },
        orderBy: { createdAt: 'asc' },
      });

  if (!user) {
    console.error(
      username
        ? `No user found with the username "${username}".`
        : 'No Super Admin account exists. Run "npm run db:seed" to create one.',
    );
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
        status: 'ACTIVE',
        failedAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: user.role.code,
        action: 'USER_PASSWORD_RESET',
        entityType: 'User',
        entityId: user.id,
        description: `Password reset from the command line for ${user.username}`,
        severity: 'CRITICAL',
      },
    }),
  ]);

  console.log(`\nPassword reset for "${user.username}" (${user.role.name}).`);
  console.log('Every session for that account has been signed out.');
  console.log('The user will be asked to choose a new password at the next sign-in.\n');
}

main()
  .catch((error) => {
    console.error('Reset failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
