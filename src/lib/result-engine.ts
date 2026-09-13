/**
 * Result calculation engine.
 *
 * `computeStudentResult` is a pure function: it takes one student's subject
 * marks plus the applicable grading scheme and result policy and returns the
 * complete computed result. Keeping it free of database access means the exact
 * same logic backs result processing, the result preview screen and any test.
 *
 * All arithmetic here runs on the server only — the browser never calculates a
 * mark, a percentage, a grade or a position.
 */

import { gradeForPercentage, type GradeBandLike } from './grading';
import { round, sum } from './utils';
import { MARK_SPECIAL } from './constants';

export type PolicyLike = {
  overallPassPercent: number;
  requireSubjectPass: boolean;
  requirePracticalPass: boolean;
  compulsoryMustPass: boolean;
  graceMarksMax: number;
  graceMaxSubjects: number;
  compartmentEnabled: boolean;
  compartmentMaxSubjects: number;
  absentCountsAsZero: boolean;
  absentFailsResult: boolean;
  rankingMethod: string;
  promotionPercent: number;
  includeOptionalInTotal: boolean;
};

export const DEFAULT_POLICY: PolicyLike = {
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
};

export type MarkInput = {
  theoryMarks: number | null;
  practicalMarks: number | null;
  obtainedMarks: number | null;
  specialStatus: string;
  remarks: string | null;
} | null;

export type SubjectInput = {
  examSubjectId: string;
  subjectName: string;
  subjectCode: string;
  subjectType: string;
  maxMarks: number;
  passingMarks: number;
  theoryMarks: number;
  practicalMarks: number;
  practicalPassing: number;
  displayOrder: number;
  mark: MarkInput;
};

export type ComputedSubject = {
  examSubjectId: string;
  subjectName: string;
  subjectCode: string;
  subjectType: string;
  maxMarks: number;
  passingMarks: number;
  theoryMarks: number | null;
  practicalMarks: number | null;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  gpa: number;
  status: 'PASS' | 'FAIL' | 'ABSENT' | 'EXEMPTED' | 'WITHHELD';
  specialStatus: string;
  graceApplied: number;
  displayOrder: number;
  /** Whether this subject contributes to the aggregate totals. */
  countsToTotal: boolean;
};

export type ComputedResult = {
  subjects: ComputedSubject[];
  totalMaxMarks: number;
  totalObtained: number;
  percentage: number;
  grade: string;
  gpa: number;
  status: 'PASS' | 'FAIL' | 'COMPARTMENT' | 'ABSENT' | 'WITHHELD';
  promotionStatus: 'PROMOTED' | 'NOT_PROMOTED';
  subjectsFailed: number;
  graceMarksUsed: number;
  papersTotal: number;
  papersAttended: number;
};

/* ------------------------------------------------------------ per subject */

function rawObtained(subject: SubjectInput): number {
  const mark = subject.mark;
  if (!mark) return 0;

  const hasPractical = subject.practicalMarks > 0;
  if (hasPractical) {
    const theory = mark.theoryMarks ?? 0;
    const practical = mark.practicalMarks ?? 0;
    // An explicit obtained total wins only when no split was recorded.
    if (mark.theoryMarks === null && mark.practicalMarks === null && mark.obtainedMarks !== null) {
      return mark.obtainedMarks;
    }
    return theory + practical;
  }

  if (mark.obtainedMarks !== null) return mark.obtainedMarks;
  return mark.theoryMarks ?? 0;
}

/**
 * Computes one student's complete result from their subject marks.
 */
export function computeStudentResult(
  subjects: SubjectInput[],
  bands: GradeBandLike[],
  policy: PolicyLike = DEFAULT_POLICY,
): ComputedResult {
  const ordered = [...subjects].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.subjectName.localeCompare(b.subjectName),
  );

  const computed: ComputedSubject[] = ordered.map((subject) => {
    const special = subject.mark?.specialStatus ?? MARK_SPECIAL.NONE;
    const hasPractical = subject.practicalMarks > 0;
    const isOptional = subject.subjectType === 'OPTIONAL';
    const countsToTotal = policy.includeOptionalInTotal || !isOptional;

    // Exempted / medical: the paper is removed from the aggregate entirely.
    if (special === MARK_SPECIAL.EX || special === MARK_SPECIAL.MED) {
      return {
        examSubjectId: subject.examSubjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        subjectType: subject.subjectType,
        maxMarks: subject.maxMarks,
        passingMarks: subject.passingMarks,
        theoryMarks: null,
        practicalMarks: null,
        obtainedMarks: 0,
        percentage: 0,
        grade: '—',
        gpa: 0,
        status: 'EXEMPTED',
        specialStatus: special,
        graceApplied: 0,
        displayOrder: subject.displayOrder,
        countsToTotal: false,
      };
    }

    if (special === MARK_SPECIAL.WH) {
      return {
        examSubjectId: subject.examSubjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        subjectType: subject.subjectType,
        maxMarks: subject.maxMarks,
        passingMarks: subject.passingMarks,
        theoryMarks: null,
        practicalMarks: null,
        obtainedMarks: 0,
        percentage: 0,
        grade: '—',
        gpa: 0,
        status: 'WITHHELD',
        specialStatus: special,
        graceApplied: 0,
        displayOrder: subject.displayOrder,
        countsToTotal,
      };
    }

    if (special === MARK_SPECIAL.ABS) {
      return {
        examSubjectId: subject.examSubjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        subjectType: subject.subjectType,
        maxMarks: subject.maxMarks,
        passingMarks: subject.passingMarks,
        theoryMarks: null,
        practicalMarks: null,
        obtainedMarks: 0,
        percentage: 0,
        grade: gradeForPercentage(0, bands).grade,
        gpa: 0,
        status: 'ABSENT',
        specialStatus: special,
        graceApplied: 0,
        displayOrder: subject.displayOrder,
        // An absent paper still occupies its maximum marks in the total when the
        // policy treats absence as zero.
        countsToTotal: countsToTotal && policy.absentCountsAsZero,
      };
    }

    const obtained = round(Math.max(0, Math.min(rawObtained(subject), subject.maxMarks)), 2);
    const percentage = subject.maxMarks > 0 ? round((obtained / subject.maxMarks) * 100, 2) : 0;
    const gradeInfo = gradeForPercentage(percentage, bands);

    const theoryOk = obtained >= subject.passingMarks;
    const practicalOk =
      !hasPractical ||
      !policy.requirePracticalPass ||
      (subject.mark?.practicalMarks ?? 0) >= subject.practicalPassing;

    return {
      examSubjectId: subject.examSubjectId,
      subjectName: subject.subjectName,
      subjectCode: subject.subjectCode,
      subjectType: subject.subjectType,
      maxMarks: subject.maxMarks,
      passingMarks: subject.passingMarks,
      theoryMarks: subject.mark?.theoryMarks ?? null,
      practicalMarks: subject.mark?.practicalMarks ?? null,
      obtainedMarks: obtained,
      percentage,
      grade: gradeInfo.grade,
      gpa: gradeInfo.gpa,
      status: theoryOk && practicalOk ? 'PASS' : 'FAIL',
      specialStatus: MARK_SPECIAL.NONE,
      graceApplied: 0,
      displayOrder: subject.displayOrder,
      countsToTotal,
    };
  });

  const graceUsed = applyGraceMarks(computed, bands, policy);

  /* ------------------------------------------------------------ aggregate */

  const counted = computed.filter((s) => s.countsToTotal);
  const totalMaxMarks = round(sum(counted.map((s) => s.maxMarks)), 2);
  const totalObtained = round(sum(counted.map((s) => s.obtainedMarks)), 2);
  const percentage = totalMaxMarks > 0 ? round((totalObtained / totalMaxMarks) * 100, 2) : 0;

  const papersTotal = computed.filter((s) => s.status !== 'EXEMPTED').length;
  const papersAttended = computed.filter(
    (s) => s.status === 'PASS' || s.status === 'FAIL',
  ).length;

  const withheldCount = computed.filter((s) => s.status === 'WITHHELD').length;
  const absentCount = computed.filter((s) => s.status === 'ABSENT').length;

  const failedSubjects = computed.filter((s) => {
    if (s.status === 'FAIL') return true;
    if (s.status === 'ABSENT' && policy.absentFailsResult) return true;
    return false;
  });
  const subjectsFailed = failedSubjects.length;
  const compulsoryFailed = failedSubjects.filter((s) => s.subjectType === 'COMPULSORY').length;

  const gradeInfo = gradeForPercentage(percentage, bands);

  let status: ComputedResult['status'];
  if (withheldCount > 0) {
    status = 'WITHHELD';
  } else if (papersTotal > 0 && absentCount === papersTotal) {
    status = 'ABSENT';
  } else if (!policy.requireSubjectPass) {
    status = percentage >= policy.overallPassPercent ? 'PASS' : 'FAIL';
  } else if (subjectsFailed === 0 && percentage >= policy.overallPassPercent) {
    status = 'PASS';
  } else if (
    policy.compartmentEnabled &&
    subjectsFailed > 0 &&
    subjectsFailed <= policy.compartmentMaxSubjects &&
    percentage >= policy.overallPassPercent &&
    !(policy.compulsoryMustPass && compulsoryFailed > policy.compartmentMaxSubjects)
  ) {
    status = 'COMPARTMENT';
  } else {
    status = 'FAIL';
  }

  const promotionStatus: ComputedResult['promotionStatus'] =
    (status === 'PASS' || status === 'COMPARTMENT') && percentage >= policy.promotionPercent
      ? 'PROMOTED'
      : 'NOT_PROMOTED';

  // The aggregate GPA is the mean of the graded papers that count to the total.
  const gpaSubjects = counted.filter((s) => s.status === 'PASS' || s.status === 'FAIL');
  const gpa = gpaSubjects.length
    ? round(sum(gpaSubjects.map((s) => s.gpa)) / gpaSubjects.length, 2)
    : 0;

  return {
    subjects: computed,
    totalMaxMarks,
    totalObtained,
    percentage,
    grade: status === 'ABSENT' || status === 'WITHHELD' ? '—' : gradeInfo.grade,
    gpa,
    status,
    promotionStatus,
    subjectsFailed,
    graceMarksUsed: graceUsed,
    papersTotal,
    papersAttended,
  };
}

/**
 * Awards grace marks to the papers that fall shortest of the pass mark, within
 * the policy's total-marks and subject-count budget. Mutates `subjects` in
 * place and returns the number of grace marks actually awarded.
 */
function applyGraceMarks(
  subjects: ComputedSubject[],
  bands: GradeBandLike[],
  policy: PolicyLike,
): number {
  if (policy.graceMarksMax <= 0 || policy.graceMaxSubjects <= 0) return 0;

  const candidates = subjects
    .filter((s) => s.status === 'FAIL')
    .map((s) => ({ subject: s, deficit: round(s.passingMarks - s.obtainedMarks, 2) }))
    .filter((c) => c.deficit > 0 && c.deficit <= policy.graceMarksMax)
    .sort((a, b) => a.deficit - b.deficit);

  let budget = policy.graceMarksMax;
  let slots = policy.graceMaxSubjects;
  let awarded = 0;

  for (const candidate of candidates) {
    if (slots <= 0 || budget <= 0) break;
    if (candidate.deficit > budget) continue;

    const s = candidate.subject;
    s.obtainedMarks = round(s.obtainedMarks + candidate.deficit, 2);
    s.graceApplied = candidate.deficit;
    s.percentage = s.maxMarks > 0 ? round((s.obtainedMarks / s.maxMarks) * 100, 2) : 0;
    const info = gradeForPercentage(s.percentage, bands);
    s.grade = info.grade;
    s.gpa = info.gpa;
    s.status = 'PASS';

    budget = round(budget - candidate.deficit, 2);
    slots -= 1;
    awarded = round(awarded + candidate.deficit, 2);
  }

  return awarded;
}

/* -------------------------------------------------- verification helpers */

export type VerificationIssue = {
  severity: 'CRITICAL' | 'WARNING';
  code: string;
  message: string;
  studentName?: string;
  rollNumber?: string;
  subjectName?: string;
};

/**
 * Flags the problems that must be resolved before a result may be processed and
 * published. CRITICAL issues block publication; WARNINGs are advisory.
 */
export function verifyMarksData(input: {
  students: {
    studentId: string;
    fullName: string;
    rollNumber: string | null;
    subjects: {
      examSubjectId: string;
      subjectName: string;
      maxMarks: number;
      mark: MarkInput;
      /** Attendance recorded for this paper, when a date sheet entry exists. */
      attendance?: 'PRESENT' | 'ABSENT' | 'LATE' | null;
    }[];
  }[];
  examSubjects: { examSubjectId: string; subjectName: string; maxMarks: number }[];
}): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  for (const subject of input.examSubjects) {
    if (!subject.maxMarks || subject.maxMarks <= 0) {
      issues.push({
        severity: 'CRITICAL',
        code: 'SUBJECT_NO_MAX',
        message: `"${subject.subjectName}" has no maximum marks configured.`,
        subjectName: subject.subjectName,
      });
    }
  }

  for (const student of input.students) {
    const label = student.rollNumber ? `${student.rollNumber} — ${student.fullName}` : student.fullName;

    if (student.subjects.length === 0) {
      issues.push({
        severity: 'CRITICAL',
        code: 'STUDENT_NO_SUBJECTS',
        message: `${label} has no examination subjects assigned.`,
        studentName: student.fullName,
        rollNumber: student.rollNumber ?? undefined,
      });
      continue;
    }

    for (const subject of student.subjects) {
      const mark = subject.mark;

      if (!mark) {
        issues.push({
          severity: 'CRITICAL',
          code: 'MISSING_MARK',
          message: `${label} — no marks recorded for ${subject.subjectName}.`,
          studentName: student.fullName,
          rollNumber: student.rollNumber ?? undefined,
          subjectName: subject.subjectName,
        });
        continue;
      }

      const isSpecial = mark.specialStatus !== MARK_SPECIAL.NONE;
      const obtained =
        mark.obtainedMarks ?? (mark.theoryMarks ?? 0) + (mark.practicalMarks ?? 0);

      if (!isSpecial && mark.obtainedMarks === null && mark.theoryMarks === null) {
        issues.push({
          severity: 'CRITICAL',
          code: 'BLANK_MARK',
          message: `${label} — ${subject.subjectName} is blank. Enter a mark or ABS/EX/MED/WH.`,
          studentName: student.fullName,
          rollNumber: student.rollNumber ?? undefined,
          subjectName: subject.subjectName,
        });
      }

      if (!isSpecial && obtained > subject.maxMarks + 1e-9) {
        issues.push({
          severity: 'CRITICAL',
          code: 'MARK_ABOVE_MAX',
          message: `${label} — ${subject.subjectName}: ${obtained} exceeds the maximum of ${subject.maxMarks}.`,
          studentName: student.fullName,
          rollNumber: student.rollNumber ?? undefined,
          subjectName: subject.subjectName,
        });
      }

      if (!isSpecial && obtained < 0) {
        issues.push({
          severity: 'CRITICAL',
          code: 'NEGATIVE_MARK',
          message: `${label} — ${subject.subjectName} has a negative mark.`,
          studentName: student.fullName,
          rollNumber: student.rollNumber ?? undefined,
          subjectName: subject.subjectName,
        });
      }

      if (subject.attendance === 'ABSENT' && !isSpecial && obtained > 0) {
        issues.push({
          severity: 'CRITICAL',
          code: 'ABSENT_WITH_MARKS',
          message: `${label} — marked absent in ${subject.subjectName} but carries ${obtained} marks.`,
          studentName: student.fullName,
          rollNumber: student.rollNumber ?? undefined,
          subjectName: subject.subjectName,
        });
      }

      if (subject.attendance === 'PRESENT' && mark.specialStatus === MARK_SPECIAL.ABS) {
        issues.push({
          severity: 'WARNING',
          code: 'PRESENT_MARKED_ABSENT',
          message: `${label} — attendance shows present in ${subject.subjectName} but the mark is ABS.`,
          studentName: student.fullName,
          rollNumber: student.rollNumber ?? undefined,
          subjectName: subject.subjectName,
        });
      }

      if (!isSpecial && subject.maxMarks > 0 && obtained === subject.maxMarks) {
        issues.push({
          severity: 'WARNING',
          code: 'FULL_MARKS',
          message: `${label} — full marks in ${subject.subjectName}. Please confirm.`,
          studentName: student.fullName,
          rollNumber: student.rollNumber ?? undefined,
          subjectName: subject.subjectName,
        });
      }
    }

    if (!student.rollNumber) {
      issues.push({
        severity: 'WARNING',
        code: 'NO_ROLL_NUMBER',
        message: `${student.fullName} has no roll number allocated for this examination.`,
        studentName: student.fullName,
      });
    }
  }

  return issues;
}
