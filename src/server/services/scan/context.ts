import 'server-only';

import { prisma } from '@/lib/prisma';
import type { MarksScanContext } from '@/lib/scan/marks';
import { normalisePhone } from '@/lib/phone';
import { BusinessRuleError } from '@/server/action-result';

/**
 * The records a scan is checked against. Loaded when the review screen opens
 * and loaded again, fresh, at the moment of saving.
 */

export async function loadMarksContext(
  examId: string,
  classId: string,
  sectionId: string | null,
): Promise<MarksScanContext> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      status: true,
      resultLocked: true,
      sessionId: true,
      examClasses: { where: { classId }, select: { schoolClass: { select: { name: true } } } },
    },
  });
  if (!exam) throw new BusinessRuleError('That examination no longer exists.');
  const examClass = exam.examClasses[0];
  if (!examClass) throw new BusinessRuleError('That class does not sit this examination.');

  const section = sectionId
    ? await prisma.section.findFirst({ where: { id: sectionId, classId }, select: { id: true, name: true } })
    : null;
  if (sectionId && !section) throw new BusinessRuleError('That section does not belong to the class.');

  const [examSubjects, enrollments] = await Promise.all([
    prisma.examSubject.findMany({
      where: { examId, isIncluded: true, subject: { classId } },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.enrollment.findMany({
      where: {
        sessionId: exam.sessionId,
        classId,
        ...(sectionId ? { sectionId } : {}),
        status: { notIn: ['LEFT', 'TRANSFERRED'] },
      },
      include: {
        student: { select: { id: true, fullName: true, fatherName: true } },
        section: { select: { name: true } },
        rollAllocations: { where: { examId }, select: { rollNumber: true } },
      },
    }),
  ]);

  const studentIds = enrollments.map((e) => e.studentId);
  const marks = await prisma.mark.findMany({
    where: { examId, studentId: { in: studentIds }, examSubjectId: { in: examSubjects.map((s) => s.id) } },
    select: {
      studentId: true,
      examSubjectId: true,
      theoryMarks: true,
      practicalMarks: true,
      obtainedMarks: true,
      specialStatus: true,
    },
  });

  const students = enrollments
    .map((e) => ({
      id: e.student.id,
      fullName: e.student.fullName,
      fatherName: e.student.fatherName,
      examRoll: e.rollAllocations[0]?.rollNumber ?? null,
      classRoll: e.rollNumber,
      sectionName: e.section.name,
    }))
    .sort((a, b) =>
      (a.examRoll ?? a.classRoll ?? '').localeCompare(b.examRoll ?? b.classRoll ?? '', undefined, {
        numeric: true,
      }),
    );

  return {
    exam: { id: exam.id, name: exam.name, status: exam.status, resultLocked: exam.resultLocked },
    classId,
    className: examClass.schoolClass.name,
    sectionId: section?.id ?? null,
    sectionName: section?.name ?? null,
    subjects: examSubjects.map((es) => ({
      examSubjectId: es.id,
      code: es.subject.code,
      name: es.subject.name,
      maxMarks: es.maxMarks,
      theoryMarks: es.theoryMarks,
      practicalMarks: es.practicalMarks,
    })),
    students,
    existing: marks.map((m) => ({
      studentId: m.studentId,
      examSubjectId: m.examSubjectId,
      theory: m.theoryMarks,
      practical: m.practicalMarks,
      obtained: m.obtainedMarks,
      special: m.specialStatus,
    })),
  };
}

export async function loadStudentContext(): Promise<{
  existingAdmissions: string[];
  existingRegistrations: string[];
}> {
  const existing = await prisma.student.findMany({ select: { admissionNumber: true, registrationNo: true } });
  return {
    existingAdmissions: existing.map((s) => s.admissionNumber.toLowerCase()),
    existingRegistrations: existing
      .map((s) => s.registrationNo?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  };
}

/** Enquiries from the last six months, to warn about a family entered twice. */
export async function loadEnquiryContext(): Promise<{
  recent: { name: string; dialNumber: string; reference: string }[];
}> {
  const since = new Date(Date.now() - 183 * 24 * 60 * 60 * 1000);
  const enquiries = await prisma.admissionEnquiry.findMany({
    where: { createdAt: { gte: since }, status: { not: 'SPAM' } },
    select: { studentName: true, contactPhone: true, reference: true },
  });
  return {
    recent: enquiries.flatMap((e) => {
      const phone = normalisePhone(e.contactPhone);
      return phone.ok
        ? [{ name: e.studentName.trim().toLowerCase(), dialNumber: phone.dialNumber, reference: e.reference }]
        : [];
    }),
  };
}
