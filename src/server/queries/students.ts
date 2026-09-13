import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';

export type StudentListFilters = {
  q?: string;
  classId?: string;
  sectionId?: string;
  sessionId?: string;
  status?: string;
  gender?: string;
  page?: number;
  pageSize?: number;
};

/**
 * Builds the Prisma filter for the student list. The free-text term matches the
 * student's name, father's name, admission/registration number and phone
 * numbers so one search box covers the whole roster.
 */
export function buildStudentWhere(filters: StudentListFilters, sessionId: string) {
  const where: Prisma.StudentWhereInput = {};
  const and: Prisma.StudentWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.gender) and.push({ gender: filters.gender });

  const term = filters.q?.trim();
  if (term) {
    and.push({
      OR: [
        { fullName: { contains: term } },
        { fatherName: { contains: term } },
        { admissionNumber: { contains: term } },
        { registrationNo: { contains: term } },
        { parentPhone: { contains: term } },
        { studentPhone: { contains: term } },
        { whatsappNumber: { contains: term } },
      ],
    });
  }

  const enrolment: Prisma.EnrollmentWhereInput = { sessionId };
  if (filters.classId) enrolment.classId = filters.classId;
  if (filters.sectionId) enrolment.sectionId = filters.sectionId;
  and.push({ enrollments: { some: enrolment } });

  if (and.length) where.AND = and;
  return where;
}

export async function listStudents(filters: StudentListFilters) {
  const session = filters.sessionId
    ? await prisma.academicSession.findUnique({ where: { id: filters.sessionId } })
    : await getCurrentSession();

  const sessionId = session?.id ?? '__none__';
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, filters.pageSize ?? 25));
  const where = buildStudentWhere(filters, sessionId);

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: {
        enrollments: {
          where: { sessionId },
          include: {
            schoolClass: { select: { id: true, name: true, displayOrder: true } },
            section: { select: { id: true, name: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ fullName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    students: students.map((student) => ({
      ...student,
      enrollment: student.enrollments[0] ?? null,
    })),
    total,
    page,
    pageSize,
    session,
  };
}

/** Class / section options for the filter bar, scoped to one session. */
export async function academicOptions(sessionId?: string) {
  const session = sessionId
    ? await prisma.academicSession.findUnique({ where: { id: sessionId } })
    : await getCurrentSession();

  const [sessions, classes, sections] = await Promise.all([
    prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } }),
    session
      ? prisma.schoolClass.findMany({
          where: { sessionId: session.id },
          orderBy: { displayOrder: 'asc' },
        })
      : Promise.resolve([]),
    session
      ? prisma.section.findMany({
          where: { schoolClass: { sessionId: session.id } },
          include: { schoolClass: { select: { name: true, displayOrder: true } } },
          orderBy: [{ schoolClass: { displayOrder: 'asc' } }, { name: 'asc' }],
        })
      : Promise.resolve([]),
  ]);

  return { session, sessions, classes, sections };
}

/**
 * Full student profile: personal details, every enrolment, results across all
 * examinations and the resulting performance analytics.
 */
export async function getStudentProfile(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        include: {
          session: true,
          schoolClass: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
        },
        orderBy: { session: { startDate: 'desc' } },
      },
      certificates: {
        include: { exam: { select: { name: true } } },
        orderBy: { issuedDate: 'desc' },
      },
      promotions: {
        include: {
          fromSession: { select: { name: true } },
          toSession: { select: { name: true } },
          fromClass: { select: { name: true } },
          toClass: { select: { name: true } },
        },
        orderBy: { processedAt: 'desc' },
      },
      portalUsers: { select: { id: true, username: true, status: true, lastLoginAt: true } },
    },
  });

  if (!student) return null;

  const results = await prisma.result.findMany({
    where: { studentId, isPublished: true },
    include: {
      exam: {
        select: {
          id: true,
          name: true,
          type: true,
          startDate: true,
          status: true,
          session: { select: { id: true, name: true } },
        },
      },
      enrollment: {
        include: {
          schoolClass: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
      subjects: { orderBy: { displayOrder: 'asc' } },
    },
    orderBy: { exam: { startDate: 'asc' } },
  });

  const rollNumbers = await prisma.rollNumberAllocation.findMany({
    where: { studentId },
    include: { exam: { select: { id: true, name: true, status: true, startDate: true } } },
    orderBy: { exam: { startDate: 'desc' } },
  });

  return { student, results, rollNumbers, currentEnrollment: student.enrollments[0] ?? null };
}

export type StudentPerformance = ReturnType<typeof analyseStudentPerformance>;

/**
 * Derives the analytics shown on a student's performance profile: current and
 * previous percentage, best and weakest subject, improvement, and the grade,
 * position and examination history.
 */
export function analyseStudentPerformance(
  results: Awaited<ReturnType<typeof getStudentProfile>> extends null
    ? never
    : NonNullable<Awaited<ReturnType<typeof getStudentProfile>>>['results'],
) {
  const ordered = [...results].sort(
    (a, b) => new Date(a.exam.startDate).getTime() - new Date(b.exam.startDate).getTime(),
  );

  const latest = ordered[ordered.length - 1] ?? null;
  const previous = ordered[ordered.length - 2] ?? null;

  // Average each subject across every published examination.
  const subjectTotals = new Map<string, { name: string; sum: number; count: number }>();
  for (const result of ordered) {
    for (const subject of result.subjects) {
      if (subject.status === 'EXEMPTED' || subject.status === 'WITHHELD') continue;
      const bucket = subjectTotals.get(subject.subjectCode) ?? {
        name: subject.subjectName,
        sum: 0,
        count: 0,
      };
      bucket.sum += subject.percentage;
      bucket.count += 1;
      subjectTotals.set(subject.subjectCode, bucket);
    }
  }

  const subjectAverages = [...subjectTotals.entries()]
    .map(([code, bucket]) => ({
      code,
      name: bucket.name,
      average: bucket.count ? bucket.sum / bucket.count : 0,
    }))
    .sort((a, b) => b.average - a.average);

  const change =
    latest && previous ? latest.percentage - previous.percentage : null;

  return {
    latest,
    previous,
    currentPercentage: latest?.percentage ?? null,
    previousPercentage: previous?.percentage ?? null,
    change,
    improved: change !== null && change > 0,
    strongestSubject: subjectAverages[0] ?? null,
    weakestSubject: subjectAverages[subjectAverages.length - 1] ?? null,
    subjectAverages,
    history: ordered.map((result) => ({
      examId: result.exam.id,
      examName: result.exam.name,
      examType: result.exam.type,
      sessionName: result.exam.session.name,
      date: result.exam.startDate,
      percentage: result.percentage,
      grade: result.grade,
      status: result.status,
      classPosition: result.classPosition,
      sectionPosition: result.sectionPosition,
      className: result.enrollment.schoolClass.name,
      sectionName: result.enrollment.section.name,
      totalObtained: result.totalObtained,
      totalMaxMarks: result.totalMaxMarks,
    })),
  };
}

/** Next admission number, continuing the highest existing sequence. */
export async function suggestAdmissionNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `HSA-${year}-`;
  const last = await prisma.student.findFirst({
    where: { admissionNumber: { startsWith: prefix } },
    orderBy: { admissionNumber: 'desc' },
    select: { admissionNumber: true },
  });

  const lastSeq = last ? Number(last.admissionNumber.slice(prefix.length)) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Next free class roll number inside a section. */
export async function suggestClassRoll(sectionId: string): Promise<string> {
  const rolls = await prisma.enrollment.findMany({
    where: { sectionId, rollNumber: { not: null } },
    select: { rollNumber: true },
  });
  const numbers = rolls
    .map((r) => Number(r.rollNumber))
    .filter((n) => Number.isFinite(n)) as number[];
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return String(next).padStart(2, '0');
}
