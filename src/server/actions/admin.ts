'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission, hashPassword, passwordProblems, verifyPassword } from '@/lib/auth';
import { recordAudit, diffFields } from '@/lib/audit';
import { AUDIT_ACTIONS, ROLE } from '@/lib/constants';
import {
  academySettingsSchema,
  gradingSchemeSchema,
  resultPolicySchema,
  newUserSchema,
  userSchema,
} from '@/lib/schemas';
import { saveImageUpload, deleteUpload, UploadError } from '../services/uploads';
import { ALL_PERMISSIONS, type PermissionCode } from '@/lib/permissions';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

const formValue = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  return raw === null ? '' : String(raw);
};
const formBool = (formData: FormData, key: string) =>
  formData.get(key) === 'on' || formData.get(key) === 'true';

/* -------------------------------------------------------- academy settings */

const BRANDING_FIELDS = [
  'logo',
  'stamp',
  'principalSign',
  'directorSign',
  'examControllerSign',
] as const;

const BRANDING_COLUMNS: Record<(typeof BRANDING_FIELDS)[number], string> = {
  logo: 'logoPath',
  stamp: 'stampPath',
  principalSign: 'principalSignPath',
  directorSign: 'directorSignPath',
  examControllerSign: 'examControllerSign',
};

export async function saveAcademySettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('settings.manage');

    const input = academySettingsSchema.parse({
      name: formValue(formData, 'name'),
      shortName: formValue(formData, 'shortName'),
      tagline: formValue(formData, 'tagline'),
      address: formValue(formData, 'address'),
      phone1: formValue(formData, 'phone1'),
      phone2: formValue(formData, 'phone2'),
      email: formValue(formData, 'email'),
      website: formValue(formData, 'website'),
      directorName: formValue(formData, 'directorName'),
      principalName: formValue(formData, 'principalName'),
      examControllerName: formValue(formData, 'examControllerName'),
      footerMessage: formValue(formData, 'footerMessage'),
      currentSessionId: formValue(formData, 'currentSessionId'),
      defaultGradingId: formValue(formData, 'defaultGradingId'),
      defaultPolicyId: formValue(formData, 'defaultPolicyId'),
      resultPortalEnabled: formBool(formData, 'resultPortalEnabled'),
    });

    const existing = await prisma.academySettings.findUnique({ where: { id: 'academy' } });

    // Handle any branding images supplied with the form.
    const imageUpdates: Record<string, string> = {};
    for (const field of BRANDING_FIELDS) {
      const file = formData.get(`${field}File`);
      if (file instanceof File && file.size > 0) {
        try {
          const url = await saveImageUpload(file, 'branding');
          const column = BRANDING_COLUMNS[field];
          imageUpdates[column] = url;
          const previous = (existing as Record<string, unknown> | null)?.[column];
          if (typeof previous === 'string') await deleteUpload(previous);
        } catch (error) {
          if (error instanceof UploadError) {
            throw new BusinessRuleError(`${field}: ${error.message}`, { [`${field}File`]: error.message });
          }
          throw error;
        }
      }
      // Explicit removal.
      if (formData.get(`${field}Remove`) === 'true') {
        const column = BRANDING_COLUMNS[field];
        const previous = (existing as Record<string, unknown> | null)?.[column];
        if (typeof previous === 'string') await deleteUpload(previous);
        imageUpdates[column] = '';
      }
    }

    if (input.currentSessionId) {
      const session = await prisma.academicSession.findUnique({
        where: { id: input.currentSessionId },
      });
      if (!session) throw new BusinessRuleError('The selected academic session no longer exists.');
    }

    const data = {
      name: input.name,
      shortName: input.shortName,
      tagline: input.tagline,
      address: input.address,
      phone1: input.phone1,
      phone2: input.phone2 ?? '',
      email: input.email ?? null,
      website: input.website ?? null,
      directorName: input.directorName ?? null,
      principalName: input.principalName ?? null,
      examControllerName: input.examControllerName ?? null,
      footerMessage: input.footerMessage,
      currentSessionId: input.currentSessionId || null,
      defaultGradingId: input.defaultGradingId || null,
      defaultPolicyId: input.defaultPolicyId || null,
      resultPortalEnabled: input.resultPortalEnabled,
      ...Object.fromEntries(
        Object.entries(imageUpdates).map(([key, value]) => [key, value === '' ? null : value]),
      ),
    };

    await prisma.academySettings.upsert({
      where: { id: 'academy' },
      update: data,
      create: { id: 'academy', ...data },
    });

    // Keep the isCurrent flag on sessions in step with the setting.
    if (input.currentSessionId) {
      await prisma.$transaction([
        prisma.academicSession.updateMany({ data: { isCurrent: false } }),
        prisma.academicSession.update({
          where: { id: input.currentSessionId },
          data: { isCurrent: true },
        }),
      ]);
    }

    const audit = existing
      ? diffFields(
          existing as unknown as Record<string, unknown>,
          data as Record<string, unknown>,
          ['name', 'address', 'phone1', 'phone2', 'principalName', 'currentSessionId', 'resultPortalEnabled'],
        )
      : { old: {}, next: data as Record<string, unknown>, changed: true };

    await recordAudit({
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      entityType: 'AcademySettings',
      entityId: 'academy',
      description: `Academy settings updated`,
      oldValue: audit.changed ? audit.old : undefined,
      newValue: audit.changed ? audit.next : undefined,
      severity: 'WARNING',
    });

    revalidatePath('/', 'layout');
    return ok(undefined, 'Academy settings saved. Every document now uses these details.');
  });
}

/* ------------------------------------------------------------- grading */

export async function saveGradingSchemeAction(
  schemeId: string | null,
  payload: {
    name: string;
    description: string;
    useGpa: boolean;
    isDefault: boolean;
    bands: {
      grade: string;
      minPercent: number;
      maxPercent: number;
      gpa: number;
      remarks: string;
      isFail: boolean;
    }[];
  },
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('grading.manage');

    const input = gradingSchemeSchema.parse({
      id: schemeId ?? '',
      name: payload.name,
      description: payload.description,
      useGpa: payload.useGpa,
      isDefault: payload.isDefault,
      bands: payload.bands,
    });

    // Bands must cover the range without overlapping.
    const sorted = [...input.bands].sort((a, b) => a.minPercent - b.minPercent);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.minPercent <= sorted[i - 1]!.maxPercent) {
        throw new BusinessRuleError(
          `Grade bands overlap: "${sorted[i - 1]!.grade}" ends at ${sorted[i - 1]!.maxPercent}% and "${sorted[i]!.grade}" starts at ${sorted[i]!.minPercent}%.`,
        );
      }
    }

    const clash = await prisma.gradingScheme.findFirst({ where: { name: input.name } });
    if (clash && clash.id !== schemeId) {
      throw new BusinessRuleError(`A grading scheme named "${input.name}" already exists.`, {
        name: 'Name already in use',
      });
    }

    const saved = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.gradingScheme.updateMany({
          where: schemeId ? { id: { not: schemeId } } : {},
          data: { isDefault: false },
        });
      }

      const scheme = schemeId
        ? await tx.gradingScheme.update({
            where: { id: schemeId },
            data: {
              name: input.name,
              description: input.description ?? null,
              useGpa: input.useGpa,
              isDefault: input.isDefault,
            },
          })
        : await tx.gradingScheme.create({
            data: {
              name: input.name,
              description: input.description ?? null,
              useGpa: input.useGpa,
              isDefault: input.isDefault,
            },
          });

      await tx.gradeBand.deleteMany({ where: { schemeId: scheme.id } });
      await tx.gradeBand.createMany({
        data: sorted
          .slice()
          .reverse()
          .map((band, index) => ({
            schemeId: scheme.id,
            grade: band.grade,
            minPercent: band.minPercent,
            maxPercent: band.maxPercent,
            gpa: band.gpa,
            remarks: band.remarks || null,
            isFail: band.isFail,
            sortOrder: index + 1,
          })),
      });

      if (input.isDefault) {
        await tx.academySettings.update({
          where: { id: 'academy' },
          data: { defaultGradingId: scheme.id },
        });
      }

      return scheme;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.GRADING_UPDATED,
      entityType: 'GradingScheme',
      entityId: saved.id,
      description: `${schemeId ? 'Updated' : 'Created'} grading scheme "${saved.name}" with ${sorted.length} band(s)`,
      newValue: { bands: sorted },
      severity: 'WARNING',
    });

    revalidatePath('/admin/settings/grading');
    return ok(
      undefined,
      `Grading scheme saved. Reprocess any examination that should use the new bands.`,
    );
  });
}

export async function deleteGradingSchemeAction(schemeId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('grading.manage');

    const scheme = await prisma.gradingScheme.findUnique({
      where: { id: schemeId },
      include: { _count: { select: { exams: true } } },
    });
    if (!scheme) throw new BusinessRuleError('That grading scheme no longer exists.');
    if (scheme._count.exams > 0) {
      throw new BusinessRuleError(
        `"${scheme.name}" is used by ${scheme._count.exams} examination(s) and cannot be deleted.`,
      );
    }
    if (scheme.isDefault) {
      throw new BusinessRuleError('The default grading scheme cannot be deleted. Make another scheme the default first.');
    }

    await prisma.gradingScheme.delete({ where: { id: schemeId } });
    await recordAudit({
      action: AUDIT_ACTIONS.GRADING_UPDATED,
      entityType: 'GradingScheme',
      entityId: schemeId,
      description: `Deleted grading scheme "${scheme.name}"`,
      severity: 'WARNING',
    });

    revalidatePath('/admin/settings/grading');
    return ok(undefined, 'Grading scheme deleted.');
  });
}

/* -------------------------------------------------------- result policy */

export async function saveResultPolicyAction(
  policyId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('grading.manage');

    const input = resultPolicySchema.parse({
      id: policyId ?? '',
      name: formValue(formData, 'name'),
      description: formValue(formData, 'description'),
      overallPassPercent: formValue(formData, 'overallPassPercent'),
      requireSubjectPass: formBool(formData, 'requireSubjectPass'),
      requirePracticalPass: formBool(formData, 'requirePracticalPass'),
      compulsoryMustPass: formBool(formData, 'compulsoryMustPass'),
      graceMarksMax: formValue(formData, 'graceMarksMax') || '0',
      graceMaxSubjects: formValue(formData, 'graceMaxSubjects') || '0',
      compartmentEnabled: formBool(formData, 'compartmentEnabled'),
      compartmentMaxSubjects: formValue(formData, 'compartmentMaxSubjects') || '0',
      absentCountsAsZero: formBool(formData, 'absentCountsAsZero'),
      absentFailsResult: formBool(formData, 'absentFailsResult'),
      rankingMethod: formValue(formData, 'rankingMethod'),
      promotionPercent: formValue(formData, 'promotionPercent') || '0',
      includeOptionalInTotal: formBool(formData, 'includeOptionalInTotal'),
      isDefault: formBool(formData, 'isDefault'),
    });

    const clash = await prisma.resultPolicy.findFirst({ where: { name: input.name } });
    if (clash && clash.id !== policyId) {
      throw new BusinessRuleError(`A result policy named "${input.name}" already exists.`, {
        name: 'Name already in use',
      });
    }

    const { id: _ignored, ...data } = input;

    const saved = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.resultPolicy.updateMany({
          where: policyId ? { id: { not: policyId } } : {},
          data: { isDefault: false },
        });
      }

      const policy = policyId
        ? await tx.resultPolicy.update({
            where: { id: policyId },
            data: { ...data, description: data.description ?? null },
          })
        : await tx.resultPolicy.create({
            data: { ...data, description: data.description ?? null },
          });

      if (input.isDefault) {
        await tx.academySettings.update({
          where: { id: 'academy' },
          data: { defaultPolicyId: policy.id },
        });
      }

      return policy;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.POLICY_UPDATED,
      entityType: 'ResultPolicy',
      entityId: saved.id,
      description: `${policyId ? 'Updated' : 'Created'} result policy "${saved.name}"`,
      newValue: data,
      severity: 'WARNING',
    });

    revalidatePath('/admin/settings/policies');
    return ok(
      undefined,
      'Result policy saved. Reprocess any examination that should use the new rules.',
    );
  });
}

export async function deleteResultPolicyAction(policyId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('grading.manage');

    const policy = await prisma.resultPolicy.findUnique({
      where: { id: policyId },
      include: { _count: { select: { exams: true } } },
    });
    if (!policy) throw new BusinessRuleError('That result policy no longer exists.');
    if (policy._count.exams > 0) {
      throw new BusinessRuleError(
        `"${policy.name}" is used by ${policy._count.exams} examination(s) and cannot be deleted.`,
      );
    }
    if (policy.isDefault) {
      throw new BusinessRuleError('The default policy cannot be deleted. Make another policy the default first.');
    }

    await prisma.resultPolicy.delete({ where: { id: policyId } });
    await recordAudit({
      action: AUDIT_ACTIONS.POLICY_UPDATED,
      entityType: 'ResultPolicy',
      entityId: policyId,
      description: `Deleted result policy "${policy.name}"`,
      severity: 'WARNING',
    });

    revalidatePath('/admin/settings/policies');
    return ok(undefined, 'Result policy deleted.');
  });
}

/* ----------------------------------------------------------------- users */

export async function saveUserAction(
  userId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission('users.manage');

    const base = {
      username: formValue(formData, 'username'),
      fullName: formValue(formData, 'fullName'),
      email: formValue(formData, 'email'),
      phone: formValue(formData, 'phone'),
      roleId: formValue(formData, 'roleId'),
      status: formValue(formData, 'status') || 'ACTIVE',
      studentId: formValue(formData, 'studentId'),
      teacherId: formValue(formData, 'teacherId'),
      mustChangePassword: formBool(formData, 'mustChangePassword'),
    };

    const password = formValue(formData, 'password');
    const input = userId ? userSchema.parse(base) : newUserSchema.parse({ ...base, password });

    const clash = await prisma.user.findUnique({ where: { username: input.username } });
    if (clash && clash.id !== userId) {
      throw new BusinessRuleError(`The username "${input.username}" is already in use.`, {
        username: 'Already in use',
      });
    }

    if (input.email) {
      const emailClash = await prisma.user.findUnique({ where: { email: input.email } });
      if (emailClash && emailClash.id !== userId) {
        throw new BusinessRuleError('That email address is already linked to another account.', {
          email: 'Already in use',
        });
      }
    }

    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw new BusinessRuleError('The selected role no longer exists.');

    if (role.code === ROLE.STUDENT && !input.studentId) {
      throw new BusinessRuleError('A student / parent account must be linked to a student record.', {
        studentId: 'Select the student this account belongs to',
      });
    }

    if (password) {
      const problems = passwordProblems(password);
      if (problems.length) {
        throw new BusinessRuleError(`The password ${problems.join(', ')}.`, {
          password: `Password ${problems[0]}`,
        });
      }
    }

    // A Super Admin must never be able to lock themselves out.
    if (userId === actor.id) {
      if (input.status !== 'ACTIVE') {
        throw new BusinessRuleError('You cannot deactivate your own account.');
      }
      if (role.code !== actor.roleCode) {
        throw new BusinessRuleError('You cannot change your own role.');
      }
    }

    const existing = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;

    const data = {
      username: input.username,
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      roleId: input.roleId,
      status: input.status,
      studentId: input.studentId || null,
      mustChangePassword: input.mustChangePassword,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    };

    const saved = await prisma.$transaction(async (tx) => {
      const user = userId
        ? await tx.user.update({ where: { id: userId }, data })
        : await tx.user.create({ data: { ...data, passwordHash: data.passwordHash! } });

      // Link or unlink the teacher profile.
      await tx.teacher.updateMany({ where: { userId: user.id }, data: { userId: null } });
      if (input.teacherId) {
        await tx.teacher.update({ where: { id: input.teacherId }, data: { userId: user.id } });
      }

      // Changing a password ends every existing session for that account.
      if (password) {
        await tx.userSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return user;
    });

    await recordAudit({
      action: userId ? AUDIT_ACTIONS.USER_UPDATED : AUDIT_ACTIONS.USER_CREATED,
      entityType: 'User',
      entityId: saved.id,
      description: `${userId ? 'Updated' : 'Created'} user ${saved.username} (${role.name})${password ? ' and set a new password' : ''}`,
      oldValue: existing ? { username: existing.username, status: existing.status, roleId: existing.roleId } : undefined,
      newValue: { username: saved.username, status: saved.status, roleId: saved.roleId },
      severity: 'WARNING',
    });

    revalidatePath('/admin/users');
    return ok(undefined, `User ${saved.username} saved.`);
  });
}

export async function resetUserPasswordAction(
  userId: string,
  newPassword: string,
  confirmWithPassword: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission('users.manage');

    const account = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await verifyPassword(confirmWithPassword, account.passwordHash))) {
      throw new BusinessRuleError('Your password confirmation is incorrect.', {
        confirmWithPassword: 'Incorrect password',
      });
    }

    const problems = passwordProblems(newPassword);
    if (problems.length) {
      throw new BusinessRuleError(`The new password ${problems.join(', ')}.`, {
        newPassword: `Password ${problems[0]}`,
      });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new BusinessRuleError('That user no longer exists.');

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: true,
          failedAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordAudit({
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      entityType: 'User',
      entityId: userId,
      description: `Reset the password of ${target.username}; the user must change it at next sign-in`,
      severity: 'CRITICAL',
    });

    revalidatePath('/admin/users');
    return ok(
      undefined,
      `Password reset. ${target.username} must choose a new password at the next sign-in.`,
    );
  });
}

/* ----------------------------------------------------------------- roles */

export async function updateRolePermissionsAction(
  roleId: string,
  permissions: string[],
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission('roles.manage');

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BusinessRuleError('That role no longer exists.');

    if (role.code === ROLE.SUPER_ADMIN) {
      throw new BusinessRuleError(
        'The Super Admin role always holds every permission and cannot be restricted.',
      );
    }
    if (role.code === actor.roleCode) {
      throw new BusinessRuleError('You cannot change the permissions of your own role.');
    }

    const valid = new Set<string>(ALL_PERMISSIONS as readonly string[]);
    const requested = permissions.filter((code) => valid.has(code));

    const permissionRows = await prisma.permission.findMany({
      where: { code: { in: requested } },
      select: { id: true, code: true },
    });

    const before = await prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: { select: { code: true } } },
    });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({
        data: permissionRows.map((permission) => ({ roleId, permissionId: permission.id })),
      }),
    ]);

    await recordAudit({
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      entityType: 'Role',
      entityId: roleId,
      description: `Updated permissions for ${role.name}: ${permissionRows.length} granted`,
      oldValue: before.map((p) => p.permission.code),
      newValue: permissionRows.map((p) => p.code),
      severity: 'CRITICAL',
    });

    revalidatePath('/admin/roles');
    return ok(undefined, `${role.name} now holds ${permissionRows.length} permission(s).`);
  });
}
