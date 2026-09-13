import { prisma } from '@/lib/prisma';
import { round, average } from '@/lib/utils';

export type ResultFilters = {
  examId: string;
  classId?: string;
  sectionId?: string;
  status?: string;
  q?: string;
};

const resultInclude = {
  student: {
    select: { id: true, fullName: true, fatherName: true, photoPath: true, admissionNumber: true },
  },
  enrollment: {
    include: {
      schoolClass: { select: { id: true, name: true, displayOrder: true } },
      section: { select: { id: true, name: true } },
    },
  },
} as const;

export async function listResults(filters: ResultFilters) {
  const rolls = await prisma.rollNumberAllocation.findMany({
    where: { examId: filters.examId },
    select: { studentId: true, rollNumber: true },
  });
  const rollByStudent = new Map(rolls.map((r) => [r.studentId, r.rollNumber]));

  const results = await prisma.result.findMany({
    where: {
      examId: filters.examId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.classId ? { enrollment: { classId: filters.classId } } : {}),
      ...(filters.sectionId ? { enrollment: { sectionId: filters.sectionId } } : {}),
      ...(filters.q
        ? {
            student: {
              OR: [
                { fullName: { contains: filters.q } },
                { fatherName: { contains: filters.q } },
                { admissionNumber: { contains: filters.q } },
              ],
            },
          }
        : {}),
    },
    include: resultInclude,
    orderBy: [
      { enrollment: { schoolClass: { displayOrder: 'asc' } } },
      { percentage: 'desc' },
    ],
  });

  return results.map((result) => ({
    ...result,
    rollNumber: rollByStudent.get(result.studentId) ?? result.enrollment.rollNumber ?? '—',
  }));
}

/* ------------------------------------------------------------- merit list */

export type MeritScope = 'OVERALL' | 'CLASS' | 'SECTION';

export async function getMeritList(
  examId: string,
  options: { scope: MeritScope; classId?: string; sectionId?: string; limit?: number },
) {
  const rows = await listResults({
    examId,
    classId: options.scope !== 'OVERALL' ? options.classId : undefined,
    sectionId: options.scope === 'SECTION' ? options.sectionId : undefined,
  });

  // Absent and withheld candidates are excluded from merit.
  const eligible = rows.filter((r) => r.status !== 'ABSENT' && r.status !== 'WITHHELD');
  const sorted = [...eligible].sort(
    (a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained,
  );

  const positioned = sorted.map((row) => ({
    ...row,
    position:
      options.scope === 'SECTION'
        ? row.sectionPosition
        : options.scope === 'CLASS'
          ? row.classPosition
          : null,
  }));

  // The overall merit list is ranked across the whole examination.
  if (options.scope === 'OVERALL') {
    let position = 0;
    let lastScore: number | null = null;
    positioned.forEach((row, index) => {
      const score = round(row.percentage, 2);
      if (lastScore === null || score !== lastScore) {
        position = index + 1;
        lastScore = score;
      }
      row.position = position;
    });
  }

  return options.limit ? positioned.slice(0, options.limit) : positioned;
}

/* -------------------------------------------------------- position holders */

export async function getPositionHolders(examId: string, top = 10) {
  const rows = await listResults({ examId });
  const eligible = rows.filter((r) => r.status !== 'ABSENT' && r.status !== 'WITHHELD');

  // The examination's own ranking method decides how ties are numbered.
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { resultPolicy: { select: { rankingMethod: true } } },
  });
  const method = exam?.resultPolicy?.rankingMethod === 'DENSE' ? 'DENSE' : 'COMPETITION';

  const sorted = [...eligible].sort(
    (a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained,
  );

  // Attach the true overall position so tied students share a rank rather than
  // being numbered by their place in the array.
  let position = 0;
  let lastScore: number | null = null;
  const ranked = sorted.map((row, index) => {
    const score = round(row.percentage, 2);
    if (lastScore === null || score !== lastScore) {
      position = method === 'DENSE' ? position + 1 : index + 1;
      lastScore = score;
    }
    return { ...row, overallPosition: position };
  });

  const overall = ranked.slice(0, top);

  // Best result in each class and in each section.
  const classToppers = new Map<string, (typeof eligible)[number]>();
  const sectionToppers = new Map<string, (typeof eligible)[number]>();
  for (const row of eligible) {
    const bestClass = classToppers.get(row.enrollment.classId);
    if (!bestClass || row.percentage > bestClass.percentage) {
      classToppers.set(row.enrollment.classId, row);
    }
    const bestSection = sectionToppers.get(row.enrollment.sectionId);
    if (!bestSection || row.percentage > bestSection.percentage) {
      sectionToppers.set(row.enrollment.sectionId, row);
    }
  }

  return {
    overall,
    classToppers: [...classToppers.values()].sort(
      (a, b) => a.enrollment.schoolClass.displayOrder - b.enrollment.schoolClass.displayOrder,
    ),
    sectionToppers: [...sectionToppers.values()].sort(
      (a, b) =>
        a.enrollment.schoolClass.displayOrder - b.enrollment.schoolClass.displayOrder ||
        a.enrollment.section.name.localeCompare(b.enrollment.section.name),
    ),
  };
}

/** Highest scorer in each subject of the examination. */
export async function getSubjectToppers(examId: string) {
  const subjects = await prisma.resultSubject.findMany({
    where: { result: { examId }, status: { in: ['PASS', 'FAIL'] } },
    include: {
      result: {
        include: {
          student: { select: { id: true, fullName: true, fatherName: true, photoPath: true } },
          enrollment: {
            include: {
              schoolClass: { select: { name: true, displayOrder: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const best = new Map<
    string,
    {
      subjectName: string;
      subjectCode: string;
      className: string;
      obtainedMarks: number;
      maxMarks: number;
      percentage: number;
      grade: string;
      studentId: string;
      studentName: string;
      fatherName: string;
      photoPath: string | null;
      sectionName: string;
    }
  >();

  for (const row of subjects) {
    // Subject records are per class, so the topper is computed per class.
    const key = `${row.subjectCode}|${row.result.enrollment.schoolClass.name}`;
    const current = best.get(key);
    if (!current || row.percentage > current.percentage) {
      best.set(key, {
        subjectName: row.subjectName,
        subjectCode: row.subjectCode,
        className: row.result.enrollment.schoolClass.name,
        obtainedMarks: row.obtainedMarks,
        maxMarks: row.maxMarks,
        percentage: row.percentage,
        grade: row.grade,
        studentId: row.result.student.id,
        studentName: row.result.student.fullName,
        fatherName: row.result.student.fatherName,
        photoPath: row.result.student.photoPath,
        sectionName: row.result.enrollment.section.name,
      });
    }
  }

  return [...best.values()].sort(
    (a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName),
  );
}

/* -------------------------------------------------------------- analytics */

export type ExamAnalytics = Awaited<ReturnType<typeof getExamAnalytics>>;

export async function getExamAnalytics(examId: string) {
  const [exam, results, subjectRows] = await Promise.all([
    prisma.exam.findUnique({
      where: { id: examId },
      include: {
        session: { select: { name: true } },
        gradingScheme: { include: { bands: { orderBy: { sortOrder: 'asc' } } } },
      },
    }),
    prisma.result.findMany({
      where: { examId },
      include: {
        enrollment: {
          include: {
            schoolClass: { select: { id: true, name: true, displayOrder: true } },
            section: { select: { id: true, name: true } },
          },
        },
        student: { select: { id: true, fullName: true, fatherName: true, photoPath: true } },
      },
    }),
    prisma.resultSubject.findMany({
      where: { result: { examId } },
      include: {
        result: {
          include: {
            enrollment: { include: { schoolClass: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
  ]);

  if (!exam) throw new Error('Examination not found.');

  const appeared = results.filter((r) => r.status !== 'ABSENT' && r.status !== 'WITHHELD');
  const passed = appeared.filter((r) => r.status === 'PASS' || r.status === 'COMPARTMENT');
  const failed = appeared.filter((r) => r.status === 'FAIL');
  const absent = results.filter((r) => r.status === 'ABSENT');
  const percentages = appeared.map((r) => r.percentage);

  // Grade distribution, ordered by the scheme's own band order.
  const bandOrder = exam.gradingScheme?.bands.map((b) => b.grade) ?? [
    'A+',
    'A',
    'B',
    'C',
    'D',
    'F',
  ];
  const gradeCounts = new Map<string, number>(bandOrder.map((g) => [g, 0]));
  for (const result of appeared) {
    gradeCounts.set(result.grade, (gradeCounts.get(result.grade) ?? 0) + 1);
  }

  /* ---------------------------------------------------------- by class */
  const classMap = new Map<
    string,
    { id: string; name: string; order: number; results: typeof results }
  >();
  for (const result of results) {
    const cls = result.enrollment.schoolClass;
    const bucket = classMap.get(cls.id) ?? {
      id: cls.id,
      name: cls.name,
      order: cls.displayOrder,
      results: [] as typeof results,
    };
    bucket.results.push(result);
    classMap.set(cls.id, bucket);
  }

  const byClass = [...classMap.values()]
    .sort((a, b) => a.order - b.order)
    .map((bucket) => {
      const app = bucket.results.filter((r) => r.status !== 'ABSENT' && r.status !== 'WITHHELD');
      const pass = app.filter((r) => r.status === 'PASS' || r.status === 'COMPARTMENT').length;
      return {
        id: bucket.id,
        name: bucket.name,
        total: bucket.results.length,
        appeared: app.length,
        passed: pass,
        failed: app.length - pass,
        passPercentage: app.length ? round((pass / app.length) * 100, 2) : 0,
        average: round(average(app.map((r) => r.percentage)), 2),
        highest: app.length ? round(Math.max(...app.map((r) => r.percentage)), 2) : 0,
        lowest: app.length ? round(Math.min(...app.map((r) => r.percentage)), 2) : 0,
      };
    });

  /* -------------------------------------------------------- by section */
  const sectionMap = new Map<
    string,
    { id: string; label: string; results: typeof results }
  >();
  for (const result of results) {
    const key = result.enrollment.sectionId;
    const bucket = sectionMap.get(key) ?? {
      id: key,
      label: `${result.enrollment.schoolClass.name} — ${result.enrollment.section.name}`,
      results: [] as typeof results,
    };
    bucket.results.push(result);
    sectionMap.set(key, bucket);
  }

  const bySection = [...sectionMap.values()]
    .map((bucket) => {
      const app = bucket.results.filter((r) => r.status !== 'ABSENT' && r.status !== 'WITHHELD');
      const pass = app.filter((r) => r.status === 'PASS' || r.status === 'COMPARTMENT').length;
      return {
        id: bucket.id,
        name: bucket.label,
        appeared: app.length,
        passed: pass,
        passPercentage: app.length ? round((pass / app.length) * 100, 2) : 0,
        average: round(average(app.map((r) => r.percentage)), 2),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  /* -------------------------------------------------------- by subject */
  const subjectMap = new Map<
    string,
    {
      code: string;
      name: string;
      className: string;
      marks: number[];
      pass: number;
      fail: number;
      absent: number;
    }
  >();

  for (const row of subjectRows) {
    const key = `${row.subjectCode}|${row.result.enrollment.schoolClass.name}`;
    const bucket = subjectMap.get(key) ?? {
      code: row.subjectCode,
      name: row.subjectName,
      className: row.result.enrollment.schoolClass.name,
      marks: [] as number[],
      pass: 0,
      fail: 0,
      absent: 0,
    };

    if (row.status === 'PASS') {
      bucket.pass += 1;
      bucket.marks.push(row.percentage);
    } else if (row.status === 'FAIL') {
      bucket.fail += 1;
      bucket.marks.push(row.percentage);
    } else if (row.status === 'ABSENT') {
      bucket.absent += 1;
    }

    subjectMap.set(key, bucket);
  }

  const bySubject = [...subjectMap.values()]
    .map((bucket) => {
      const attempted = bucket.pass + bucket.fail;
      return {
        code: bucket.code,
        name: bucket.name,
        className: bucket.className,
        attempted,
        passed: bucket.pass,
        failed: bucket.fail,
        absent: bucket.absent,
        passPercentage: attempted ? round((bucket.pass / attempted) * 100, 2) : 0,
        average: round(average(bucket.marks), 2),
        highest: bucket.marks.length ? round(Math.max(...bucket.marks), 2) : 0,
        lowest: bucket.marks.length ? round(Math.min(...bucket.marks), 2) : 0,
      };
    })
    .sort((a, b) => b.average - a.average);

  const topper = [...appeared].sort((a, b) => b.percentage - a.percentage)[0] ?? null;

  return {
    exam,
    totals: {
      total: results.length,
      appeared: appeared.length,
      absent: absent.length,
      passed: passed.length,
      failed: failed.length,
      passPercentage: appeared.length ? round((passed.length / appeared.length) * 100, 2) : 0,
      highest: percentages.length ? round(Math.max(...percentages), 2) : 0,
      lowest: percentages.length ? round(Math.min(...percentages), 2) : 0,
      average: round(average(percentages), 2),
      aPlusCount: appeared.filter((r) => r.grade === 'A+').length,
      failCount: failed.length,
    },
    gradeDistribution: bandOrder.map((grade) => ({
      grade,
      count: gradeCounts.get(grade) ?? 0,
    })),
    byClass,
    bySection,
    bySubject,
    topper,
  };
}

/**
 * Academy-wide picture used by the Principal / Director dashboard: performance
 * across every published examination of the current session.
 */
export async function getAcademyAnalytics(sessionId: string) {
  const exams = await prisma.exam.findMany({
    where: { sessionId, status: 'PUBLISHED' },
    orderBy: { startDate: 'asc' },
    select: { id: true, name: true, type: true, startDate: true },
  });

  if (exams.length === 0) {
    return { exams: [], perExam: [], best: null, needsAttention: null, mostImproved: null };
  }

  const perExam = await Promise.all(
    exams.map(async (exam) => {
      const analytics = await getExamAnalytics(exam.id);
      return { exam, analytics };
    }),
  );

  // Best and weakest performers across the whole session.
  const classAggregate = new Map<string, { name: string; totals: number[] }>();
  const subjectAggregate = new Map<string, { name: string; totals: number[] }>();

  for (const { analytics } of perExam) {
    for (const cls of analytics.byClass) {
      const bucket = classAggregate.get(cls.name) ?? { name: cls.name, totals: [] };
      bucket.totals.push(cls.average);
      classAggregate.set(cls.name, bucket);
    }
    for (const subject of analytics.bySubject) {
      const key = subject.name;
      const bucket = subjectAggregate.get(key) ?? { name: subject.name, totals: [] };
      bucket.totals.push(subject.average);
      subjectAggregate.set(key, bucket);
    }
  }

  const classRanking = [...classAggregate.values()]
    .map((c) => ({ name: c.name, average: round(average(c.totals), 2) }))
    .sort((a, b) => b.average - a.average);

  const subjectRanking = [...subjectAggregate.values()]
    .map((s) => ({ name: s.name, average: round(average(s.totals), 2) }))
    .sort((a, b) => b.average - a.average);

  // Most improved student: largest gain between the first and last published exam.
  let mostImproved: {
    studentId: string;
    name: string;
    from: number;
    to: number;
    gain: number;
  } | null = null;

  if (exams.length >= 2) {
    const firstExam = exams[0]!;
    const lastExam = exams[exams.length - 1]!;
    const [firstResults, lastResults] = await Promise.all([
      prisma.result.findMany({
        where: { examId: firstExam.id },
        select: { studentId: true, percentage: true, student: { select: { fullName: true } } },
      }),
      prisma.result.findMany({
        where: { examId: lastExam.id },
        select: { studentId: true, percentage: true, student: { select: { fullName: true } } },
      }),
    ]);

    const firstByStudent = new Map(firstResults.map((r) => [r.studentId, r.percentage]));
    for (const row of lastResults) {
      const before = firstByStudent.get(row.studentId);
      if (before === undefined) continue;
      const gain = round(row.percentage - before, 2);
      if (!mostImproved || gain > mostImproved.gain) {
        mostImproved = {
          studentId: row.studentId,
          name: row.student.fullName,
          from: before,
          to: row.percentage,
          gain,
        };
      }
    }
  }

  return {
    exams,
    perExam: perExam.map(({ exam, analytics }) => ({
      examId: exam.id,
      name: exam.name,
      type: exam.type,
      date: exam.startDate,
      passPercentage: analytics.totals.passPercentage,
      average: analytics.totals.average,
      appeared: analytics.totals.appeared,
    })),
    best: {
      class: classRanking[0] ?? null,
      subject: subjectRanking[0] ?? null,
      topper: perExam[perExam.length - 1]?.analytics.topper ?? null,
    },
    needsAttention: {
      class: classRanking[classRanking.length - 1] ?? null,
      subject: subjectRanking[subjectRanking.length - 1] ?? null,
    },
    classRanking,
    subjectRanking,
    mostImproved,
  };
}
