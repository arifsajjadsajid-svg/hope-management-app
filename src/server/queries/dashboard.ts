import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/settings';
import { round } from '@/lib/utils';

const ACTIVE_EXAM_STATUSES = [
  'SCHEDULED',
  'IN_PROGRESS',
  'MARKS_ENTRY',
  'RESULT_PROCESSING',
  'AWAITING_APPROVAL',
];

export async function getDashboardData() {
  const session = await getCurrentSession();
  const sessionId = session?.id ?? '__none__';

  const [
    totalStudents,
    activeStudents,
    boys,
    girls,
    classCount,
    sectionCount,
    subjectCount,
    teacherCount,
    activeExams,
    publishedExams,
    pendingExams,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { status: 'ACTIVE', gender: 'MALE' } }),
    prisma.student.count({ where: { status: 'ACTIVE', gender: 'FEMALE' } }),
    prisma.schoolClass.count({ where: { sessionId } }),
    prisma.section.count({ where: { schoolClass: { sessionId } } }),
    prisma.subject.count({ where: { schoolClass: { sessionId } } }),
    prisma.teacher.count({ where: { isActive: true } }),
    prisma.exam.count({ where: { sessionId, status: { in: ACTIVE_EXAM_STATUSES } } }),
    prisma.exam.count({ where: { sessionId, status: 'PUBLISHED' } }),
    prisma.exam.count({
      where: { sessionId, status: { in: ['RESULT_PROCESSING', 'AWAITING_APPROVAL'] } },
    }),
  ]);

  // Papers scheduled in the coming fortnight.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const upcomingPapers = await prisma.dateSheetEntry.findMany({
    where: {
      exam: { sessionId, status: { in: [...ACTIVE_EXAM_STATUSES, 'DRAFT'] } },
      paperDate: { gte: today, lte: horizon },
    },
    include: {
      exam: { select: { id: true, name: true } },
      examSubject: { include: { subject: { select: { name: true } } } },
      schoolClass: { select: { name: true } },
      room: { select: { name: true, roomNumber: true } },
    },
    orderBy: [{ paperDate: 'asc' }, { startTime: 'asc' }],
    take: 8,
  });

  // The most recently published examination drives the headline result figures.
  const latestPublished = await prisma.exam.findFirst({
    where: { sessionId, status: 'PUBLISHED' },
    orderBy: [{ publishedAt: 'desc' }, { endDate: 'desc' }],
    select: { id: true, name: true, type: true, publishedAt: true },
  });

  let passPercentage = 0;
  let topper: {
    name: string;
    fatherName: string;
    photoPath: string | null;
    className: string;
    sectionName: string;
    percentage: number;
    grade: string;
    studentId: string;
  } | null = null;
  let resultTotals = { total: 0, passed: 0, failed: 0, absent: 0 };

  if (latestPublished) {
    const results = await prisma.result.findMany({
      where: { examId: latestPublished.id },
      select: { status: true, percentage: true },
    });
    const appeared = results.filter((r) => r.status !== 'ABSENT' && r.status !== 'WITHHELD');
    const passed = results.filter((r) => r.status === 'PASS' || r.status === 'COMPARTMENT').length;
    resultTotals = {
      total: results.length,
      passed,
      failed: results.filter((r) => r.status === 'FAIL').length,
      absent: results.filter((r) => r.status === 'ABSENT').length,
    };
    passPercentage = appeared.length ? round((passed / appeared.length) * 100, 2) : 0;

    const best = await prisma.result.findFirst({
      where: { examId: latestPublished.id, status: { notIn: ['ABSENT', 'WITHHELD'] } },
      orderBy: [{ percentage: 'desc' }, { totalObtained: 'desc' }],
      include: {
        student: { select: { id: true, fullName: true, fatherName: true, photoPath: true } },
        enrollment: {
          include: {
            schoolClass: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
    });

    if (best) {
      topper = {
        studentId: best.student.id,
        name: best.student.fullName,
        fatherName: best.student.fatherName,
        photoPath: best.student.photoPath,
        className: best.enrollment.schoolClass.name,
        sectionName: best.enrollment.section.name,
        percentage: best.percentage,
        grade: best.grade,
      };
    }
  }

  const recentActivity = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      action: true,
      description: true,
      userName: true,
      severity: true,
      createdAt: true,
    },
  });

  const examSummary = await prisma.exam.findMany({
    where: { sessionId },
    orderBy: [{ startDate: 'desc' }],
    take: 6,
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      resultLocked: true,
      _count: { select: { results: true, examSubjects: true } },
    },
  });

  return {
    session,
    counts: {
      totalStudents,
      activeStudents,
      boys,
      girls,
      classCount,
      sectionCount,
      subjectCount,
      teacherCount,
      activeExams,
      publishedExams,
      pendingExams,
    },
    upcomingPapers,
    latestPublished,
    passPercentage,
    resultTotals,
    topper,
    recentActivity,
    examSummary,
  };
}
