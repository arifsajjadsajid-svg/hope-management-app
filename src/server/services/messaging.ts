import { prisma } from '@/lib/prisma';
import { getAcademySettings, appBaseUrl } from '@/lib/settings';
import { renderTemplate, type TemplateContext } from '@/lib/message-templates';
import { normalisePhone, preferredContact } from '@/lib/phone';
import { RESULT_STATUS_LABELS } from '@/lib/constants';
import { formatDate, formatMarks, formatPercent, ordinal } from '@/lib/utils';

export type MessageAudience = 'ALL' | 'CLASS' | 'SECTION' | 'STUDENT';

export type BuiltRecipient = {
  studentId: string;
  studentName: string;
  fatherName: string;
  admissionNumber: string;
  className: string;
  sectionName: string;
  contactName: string;
  contactLabel: string;
  phone: string;
  dialNumber: string;
  renderedBody: string;
  /** Why this family cannot be messaged, when that is the case. */
  problem: string | null;
};

export type BuildResult = {
  recipients: BuiltRecipient[];
  summary: { total: number; ready: number; unreachable: number; withoutResult: number };
};

/**
 * Resolves an audience to families and renders the message for each one.
 *
 * Nothing is written: this backs both the live preview and the moment a
 * campaign is created, so what the operator previews is exactly what is stored.
 */
export async function buildRecipients(input: {
  audience: MessageAudience;
  audienceRef?: string | null;
  sessionId: string;
  examId?: string | null;
  body: string;
  channel?: 'WHATSAPP' | 'SMS';
}): Promise<BuildResult> {
  const academy = await getAcademySettings();

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId: input.sessionId,
      student: { status: 'ACTIVE' },
      ...(input.audience === 'CLASS' && input.audienceRef ? { classId: input.audienceRef } : {}),
      ...(input.audience === 'SECTION' && input.audienceRef
        ? { sectionId: input.audienceRef }
        : {}),
      ...(input.audience === 'STUDENT' && input.audienceRef
        ? { studentId: input.audienceRef }
        : {}),
    },
    include: {
      student: true,
      session: { select: { name: true } },
      schoolClass: { select: { name: true, displayOrder: true } },
      section: { select: { name: true } },
    },
    orderBy: [
      { schoolClass: { displayOrder: 'asc' } },
      { section: { name: 'asc' } },
      { rollNumber: 'asc' },
    ],
  });

  const studentIds = enrollments.map((e) => e.studentId);

  const [exam, results, rolls] = await Promise.all([
    input.examId
      ? prisma.exam.findUnique({
          where: { id: input.examId },
          include: { session: { select: { name: true } } },
        })
      : Promise.resolve(null),
    input.examId
      ? prisma.result.findMany({
          where: { examId: input.examId, studentId: { in: studentIds } },
        })
      : Promise.resolve([]),
    input.examId
      ? prisma.rollNumberAllocation.findMany({
          where: { examId: input.examId, studentId: { in: studentIds } },
        })
      : Promise.resolve([]),
  ]);

  const resultByStudent = new Map(results.map((r) => [r.studentId, r]));
  const rollByStudent = new Map(rolls.map((r) => [r.studentId, r.rollNumber]));

  const examDates = exam
    ? `${formatDate(exam.startDate)} to ${formatDate(exam.endDate)}`
    : undefined;

  let unreachable = 0;
  let withoutResult = 0;

  const recipients: BuiltRecipient[] = enrollments.map((enrollment) => {
    const student = enrollment.student;
    const contact = preferredContact(student, input.channel ?? 'WHATSAPP');
    const normalised = contact ? normalisePhone(contact.phone) : { ok: false as const, reason: 'No number on file' };
    const result = resultByStudent.get(student.id);

    if (input.examId && !result) withoutResult += 1;

    const context: TemplateContext = {
      academy: academy.name,
      academy_short: academy.shortName,
      academy_phone: academy.contactLine,
      academy_address: academy.address,
      student: student.fullName,
      father: student.fatherName || student.guardianName || 'Parent',
      admission_no: student.admissionNumber,
      class: enrollment.schoolClass.name,
      section: enrollment.section.name,
      class_roll: enrollment.rollNumber ?? '',
      session: enrollment.session.name,
      result_url: `${appBaseUrl()}/result`,
    };

    if (exam) {
      context.exam = exam.name;
      context.exam_roll = rollByStudent.get(student.id) ?? '';
      context.exam_dates = examDates ?? '';
    }

    if (result) {
      context.percentage = formatPercent(result.percentage);
      context.grade = result.grade;
      context.result = RESULT_STATUS_LABELS[result.status] ?? result.status;
      context.obtained_marks = formatMarks(result.totalObtained);
      context.total_marks = formatMarks(result.totalMaxMarks);
      context.class_position = result.classPosition ? ordinal(result.classPosition) : '';
    }

    let problem: string | null = null;
    if (!contact) problem = 'No contact number on this student record';
    else if (!normalised.ok) problem = normalised.reason;
    if (problem) unreachable += 1;

    return {
      studentId: student.id,
      studentName: student.fullName,
      fatherName: student.fatherName,
      admissionNumber: student.admissionNumber,
      className: enrollment.schoolClass.name,
      sectionName: enrollment.section.name,
      contactName: contact?.contactName ?? student.fatherName,
      contactLabel: contact?.label ?? '—',
      phone: contact?.phone ?? '',
      dialNumber: normalised.ok ? normalised.dialNumber : '',
      renderedBody: renderTemplate(input.body, context),
      problem,
    };
  });

  return {
    recipients,
    summary: {
      total: recipients.length,
      ready: recipients.length - unreachable,
      unreachable,
      withoutResult,
    },
  };
}

/**
 * Renders a single example so the composer can show a live preview without
 * building the whole audience.
 */
export async function previewOne(input: {
  audience: MessageAudience;
  audienceRef?: string | null;
  sessionId: string;
  examId?: string | null;
  body: string;
  channel?: 'WHATSAPP' | 'SMS';
}): Promise<BuiltRecipient | null> {
  const built = await buildRecipients(input);
  return built.recipients[0] ?? null;
}
