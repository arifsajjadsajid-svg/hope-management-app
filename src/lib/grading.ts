import { round } from './utils';

export type GradeBandLike = {
  grade: string;
  minPercent: number;
  maxPercent: number;
  gpa: number;
  remarks: string | null;
  isFail: boolean;
  sortOrder: number;
};

export type GradeResult = {
  grade: string;
  gpa: number;
  remarks: string | null;
  isFail: boolean;
};

const UNGRADED: GradeResult = { grade: '—', gpa: 0, remarks: null, isFail: false };

/**
 * Maps a percentage onto a grading scheme. Bands are inclusive of both bounds;
 * the highest band whose range contains the value wins, so overlapping bands
 * degrade predictably instead of throwing.
 */
export function gradeForPercentage(
  percentage: number | null | undefined,
  bands: GradeBandLike[],
): GradeResult {
  if (percentage === null || percentage === undefined || Number.isNaN(percentage)) return UNGRADED;
  if (!bands.length) return UNGRADED;

  const value = round(percentage, 2);
  const ordered = [...bands].sort((a, b) => b.minPercent - a.minPercent);

  for (const band of ordered) {
    if (value >= band.minPercent - 1e-9 && value <= band.maxPercent + 1e-9) {
      return { grade: band.grade, gpa: band.gpa, remarks: band.remarks, isFail: band.isFail };
    }
  }

  // Below every band: fall back to the lowest one (conventionally the fail grade).
  const lowest = ordered[ordered.length - 1]!;
  return { grade: lowest.grade, gpa: lowest.gpa, remarks: lowest.remarks, isFail: lowest.isFail };
}

/** The default scheme seeded for the academy: 90+ A+, 80+ A, 70+ B, 60+ C, 50+ D, else F. */
export const DEFAULT_GRADE_BANDS: GradeBandLike[] = [
  { grade: 'A+', minPercent: 90, maxPercent: 100, gpa: 4.0, remarks: 'Outstanding', isFail: false, sortOrder: 1 },
  { grade: 'A', minPercent: 80, maxPercent: 89.99, gpa: 3.7, remarks: 'Excellent', isFail: false, sortOrder: 2 },
  { grade: 'B', minPercent: 70, maxPercent: 79.99, gpa: 3.0, remarks: 'Very Good', isFail: false, sortOrder: 3 },
  { grade: 'C', minPercent: 60, maxPercent: 69.99, gpa: 2.5, remarks: 'Good', isFail: false, sortOrder: 4 },
  { grade: 'D', minPercent: 50, maxPercent: 59.99, gpa: 2.0, remarks: 'Satisfactory', isFail: false, sortOrder: 5 },
  { grade: 'F', minPercent: 0, maxPercent: 49.99, gpa: 0, remarks: 'Needs Improvement', isFail: true, sortOrder: 6 },
];

/** Tailwind tone for a grade chip; unknown grades fall back to neutral. */
export function gradeTone(grade: string): string {
  switch (grade.toUpperCase()) {
    case 'A+':
      return 'bg-emerald-100 text-emerald-800 ring-emerald-300';
    case 'A':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'B':
      return 'bg-royal-50 text-royal-700 ring-royal-200';
    case 'C':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'D':
      return 'bg-orange-50 text-orange-700 ring-orange-200';
    case 'F':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}
