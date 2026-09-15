'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission, requestContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { normalisePhone } from '@/lib/phone';
import { nextEnquiryReference } from '../services/enquiry-reference';
import { runAction, ok, BusinessRuleError, type ActionResult } from '../action-result';

/**
 * Admission enquiries.
 *
 * The submit action is the only thing in this system reachable without signing
 * in, so it is written defensively: every field is bounded, the submission rate
 * is capped per address, and nothing the sender types is ever used to look up
 * or return existing records. A parent gets back only their own reference
 * number.
 */

/** Enquiries allowed from one address within the window. */
const MAX_PER_IP = 5;
const WINDOW_MINUTES = 60;

const enquirySchema = z.object({
  studentName: z.string().trim().min(2, "Enter the child's full name").max(120),
  fatherName: z.string().trim().min(2, "Enter the father's or guardian's name").max(120),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine(
      (d) => d === null || (!Number.isNaN(d.getTime()) && d < new Date() && d > new Date('1990-01-01')),
      { message: 'Enter a valid date of birth' },
    ),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).default('MALE'),
  classApplyingFor: z.string().trim().min(1, 'Choose the class you are applying for').max(60),
  previousSchool: z.string().trim().max(160).optional(),
  contactPhone: z.string().trim().min(1, 'A mobile number is required').max(30),
  whatsappNumber: z.string().trim().max(30).optional(),
  email: z.union([z.string().trim().email('Enter a valid email address'), z.literal('')]).optional(),
  address: z.string().trim().max(300).optional(),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Receives an enquiry from the public form. No authentication.
 *
 * `website` is a honeypot: it is hidden from people by CSS but filled in by
 * most form-spam bots, so anything arriving with it set is recorded as spam
 * rather than reaching the office queue.
 */
export async function submitEnquiryAction(
  _prev: ActionResult<{ reference: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reference: string }>> {
  return runAction(async () => {
    const { ip, userAgent } = await requestContext();

    const input = enquirySchema.parse({
      studentName: formData.get('studentName'),
      fatherName: formData.get('fatherName'),
      dateOfBirth: formData.get('dateOfBirth') ?? '',
      gender: formData.get('gender') ?? 'MALE',
      classApplyingFor: formData.get('classApplyingFor'),
      previousSchool: formData.get('previousSchool') ?? '',
      contactPhone: formData.get('contactPhone'),
      whatsappNumber: formData.get('whatsappNumber') ?? '',
      email: formData.get('email') ?? '',
      address: formData.get('address') ?? '',
      message: formData.get('message') ?? '',
    });

    const phone = normalisePhone(input.contactPhone);
    if (!phone.ok) {
      // phone.reason is already a complete sentence fragment, so it carries the
      // message on its own rather than being glued onto another dash clause.
      throw new BusinessRuleError(`${phone.reason}. Please write it as 0300-1234567.`, {
        contactPhone: 'Check this number',
      });
    }

    if (input.whatsappNumber && !normalisePhone(input.whatsappNumber).ok) {
      throw new BusinessRuleError('That WhatsApp number does not look right.', {
        whatsappNumber: 'Check this number',
      });
    }

    // Throttle by address so the queue cannot be flooded from one machine.
    if (ip) {
      const recent = await prisma.admissionEnquiry.count({
        where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - WINDOW_MINUTES * 60_000) } },
      });
      if (recent >= MAX_PER_IP) {
        throw new BusinessRuleError(
          `You have already sent ${recent} enquiries in the last hour. Please telephone the academy on 0322-4157001 instead.`,
        );
      }
    }

    // Same child, same family, sent twice within the day — return the original
    // reference rather than creating a duplicate for the office to sort out.
    const duplicate = await prisma.admissionEnquiry.findFirst({
      where: {
        studentName: { equals: input.studentName, mode: 'insensitive' },
        contactPhone: input.contactPhone,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
      },
      select: { reference: true },
    });

    if (duplicate) {
      return ok(
        { reference: duplicate.reference },
        'We already have this enquiry — the academy will contact you shortly.',
      );
    }

    const isSpam = String(formData.get('website') ?? '').trim() !== '';
    const reference = await nextEnquiryReference();

    await prisma.admissionEnquiry.create({
      data: {
        reference,
        studentName: input.studentName,
        fatherName: input.fatherName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        classApplyingFor: input.classApplyingFor,
        previousSchool: input.previousSchool || null,
        contactPhone: input.contactPhone,
        whatsappNumber: input.whatsappNumber || null,
        email: input.email || null,
        address: input.address || null,
        message: input.message || null,
        status: isSpam ? 'SPAM' : 'NEW',
        ipAddress: ip,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    });

    revalidatePath('/admissions');

    return ok(
      { reference },
      'Your enquiry has been received. The academy will contact you shortly.',
    );
  });
}

/* ------------------------------------------------------- office side */

const statusSchema = z.enum(['NEW', 'CONTACTED', 'ADMITTED', 'DECLINED', 'SPAM']);

export async function updateEnquiryAction(input: {
  id: string;
  status: string;
  officeNotes?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermission('admissions.manage');
    const status = statusSchema.parse(input.status);

    const enquiry = await prisma.admissionEnquiry.findUnique({ where: { id: input.id } });
    if (!enquiry) throw new BusinessRuleError('That enquiry no longer exists.');

    if (enquiry.studentId && status !== 'ADMITTED') {
      throw new BusinessRuleError(
        'This enquiry has already been turned into a student record, so it cannot be moved out of Admitted.',
      );
    }

    await prisma.admissionEnquiry.update({
      where: { id: input.id },
      data: {
        status,
        officeNotes: input.officeNotes?.trim() || null,
        handledById: user.id,
        handledAt: new Date(),
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.ENQUIRY_UPDATED,
      entityType: 'AdmissionEnquiry',
      entityId: enquiry.reference,
      description: `Enquiry ${enquiry.reference} (${enquiry.studentName}) marked ${status}`,
      severity: 'INFO',
    });

    revalidatePath('/admissions');
    return ok(undefined, `Enquiry marked ${status.toLowerCase()}.`);
  });
}

/**
 * Turns an accepted enquiry into a real student record.
 *
 * The enquiry keeps a link to the student it produced, so the office can always
 * trace an admission back to the form the family filled in.
 */
export async function convertEnquiryAction(input: {
  id: string;
  admissionNumber: string;
}): Promise<ActionResult<{ studentId: string }>> {
  return runAction(async () => {
    await requirePermission('students.create');
    await requirePermission('admissions.manage');

    const admissionNumber = input.admissionNumber.trim();
    if (!admissionNumber) {
      throw new BusinessRuleError('An admission number is required.', {
        admissionNumber: 'Enter an admission number',
      });
    }

    const enquiry = await prisma.admissionEnquiry.findUnique({ where: { id: input.id } });
    if (!enquiry) throw new BusinessRuleError('That enquiry no longer exists.');
    if (enquiry.studentId) {
      throw new BusinessRuleError('This enquiry has already been turned into a student record.');
    }

    const clash = await prisma.student.findUnique({ where: { admissionNumber } });
    if (clash) {
      throw new BusinessRuleError(`Admission number ${admissionNumber} is already used.`, {
        admissionNumber: 'Already in use',
      });
    }

    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          admissionNumber,
          fullName: enquiry.studentName,
          fatherName: enquiry.fatherName,
          dateOfBirth: enquiry.dateOfBirth,
          gender: enquiry.gender,
          admissionDate: new Date(),
          parentPhone: enquiry.contactPhone,
          whatsappNumber: enquiry.whatsappNumber,
          email: enquiry.email,
          address: enquiry.address,
          previousSchool: enquiry.previousSchool,
          notes: `Admitted from public enquiry ${enquiry.reference}.`,
          status: 'ACTIVE',
        },
      });

      await tx.admissionEnquiry.update({
        where: { id: enquiry.id },
        data: { status: 'ADMITTED', studentId: created.id, handledAt: new Date() },
      });

      return created;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.ENQUIRY_CONVERTED,
      entityType: 'Student',
      entityId: student.id,
      description: `Enquiry ${enquiry.reference} admitted as student ${admissionNumber} (${student.fullName})`,
      severity: 'WARNING',
    });

    revalidatePath('/admissions');
    revalidatePath('/students');

    return ok(
      { studentId: student.id },
      `${student.fullName} added as student ${admissionNumber}. Enrol them in a class from the student record.`,
    );
  });
}

export async function deleteEnquiryAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission('admissions.manage');

    const enquiry = await prisma.admissionEnquiry.findUnique({ where: { id } });
    if (!enquiry) throw new BusinessRuleError('That enquiry no longer exists.');
    if (enquiry.studentId) {
      throw new BusinessRuleError(
        'This enquiry produced a student record, so it is kept as part of that admission history.',
      );
    }

    await prisma.admissionEnquiry.delete({ where: { id } });

    await recordAudit({
      action: AUDIT_ACTIONS.ENQUIRY_DELETED,
      entityType: 'AdmissionEnquiry',
      entityId: enquiry.reference,
      description: `Deleted enquiry ${enquiry.reference} (${enquiry.studentName})`,
      severity: 'WARNING',
    });

    revalidatePath('/admissions');
    return ok(undefined, 'Enquiry deleted.');
  });
}
