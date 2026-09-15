import { round } from '../utils';
import type { MarksSheetReading } from './schemas';

/**
 * Turning a scanned marks sheet into marks.
 *
 * Everything here is pure and runs twice: in the browser, so the reviewer sees
 * each problem while correcting the sheet, and again on the server when they
 * save, against freshly loaded records. What the reviewer saw is exactly what
 * the server accepts or refuses.
 */

/* ------------------------------------------------------------------ types */

export type MarksScanContext = {
  exam: { id: string; name: string; status: string; resultLocked: boolean };
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  subjects: {
    examSubjectId: string;
    code: string;
    name: string;
    maxMarks: number;
    theoryMarks: number;
    practicalMarks: number;
  }[];
  students: {
    id: string;
    fullName: string;
    fatherName: string;
    examRoll: string | null;
    classRoll: string | null;
    sectionName: string;
  }[];
  existing: {
    studentId: string;
    examSubjectId: string;
    theory: number | null;
    practical: number | null;
    obtained: number | null;
    special: string;
  }[];
};

export type MarkPart = 'MARKS' | 'THEORY' | 'PRACTICAL';

export type ColumnTarget =
  | { type: 'SUBJECT'; examSubjectId: string; part: MarkPart }
  | { type: 'GRAND_TOTAL' }
  | { type: 'IGNORE' };

export type SheetColumn = { key: string; heading: string; target: ColumnTarget };

export type MarksRow = {
  key: string;
  /** Index of the uploaded file the row was read from. */
  source: number;
  include: boolean;
  studentId: string;
  rollNumber: string;
  studentName: string;
  values: Record<string, string>;
  /** Field keys the reader was unsure of and nobody has checked yet. */
  unclear: string[];
  note: string;
};

/**
 * ERROR and CHECK both stop a sheet being saved. CHECK is a reading the scan
 * was unsure of: it clears once someone has corrected or confirmed it.
 */
export type RowIssue = { level: 'ERROR' | 'CHECK' | 'WARNING'; message: string; field?: string };

export type PlannedMark = {
  studentId: string;
  examSubjectId: string;
  theory: number | null;
  practical: number | null;
  obtained: number | null;
  special: string;
  replaces: { obtained: number | null; special: string } | null;
};

export type MarksReview = {
  columnProblems: string[];
  issues: Record<string, RowIssue[]>;
  planned: PlannedMark[];
  summary: {
    rows: number;
    included: number;
    blocked: number;
    toCheck: number;
    marks: number;
    replacing: number;
  };
};

export const STUDENT_FIELD = 'student';
export const ROLL_FIELD = 'rollNumber';
export const NAME_FIELD = 'studentName';

/* ----------------------------------------------------------- normalising */

function simplify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(muhammad|mohammad|mohammed|muhammed|m\.)\s*/g, 'muhammad ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameRoll(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const clean = (value: string) => value.trim().toLowerCase().replace(/^0+(?=\d)/, '');
  return clean(a) === clean(b);
}

/** 0–1: how many name words the two share, ignoring order. */
export function nameLikeness(a: string, b: string): number {
  const wordsA = new Set(simplify(a).split(' ').filter(Boolean));
  const wordsB = new Set(simplify(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared += 1;
  return shared / Math.max(wordsA.size, wordsB.size);
}

export type ParsedMark =
  | { kind: 'blank' }
  | { kind: 'special'; token: 'ABS' | 'EX' | 'MED' | 'WH' }
  | { kind: 'number'; value: number }
  | { kind: 'invalid'; raw: string };

const SPECIAL_WORDS: Record<string, 'ABS' | 'EX' | 'MED' | 'WH'> = {
  A: 'ABS',
  AB: 'ABS',
  ABS: 'ABS',
  ABSENT: 'ABS',
  EX: 'EX',
  EXEMPT: 'EX',
  EXEMPTED: 'EX',
  MED: 'MED',
  MEDICAL: 'MED',
  WH: 'WH',
  WITHHELD: 'WH',
};

export function parseMark(raw: string | undefined): ParsedMark {
  const text = (raw ?? '').trim();
  if (text === '' || /^[-–—.]+$/.test(text)) return { kind: 'blank' };

  const word = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (!/\d/.test(text) && SPECIAL_WORDS[word]) return { kind: 'special', token: SPECIAL_WORDS[word] };

  // "32½" and "32 1/2" are common on handwritten sheets.
  const half = text.match(/^(\d+)\s*(?:½|1\/2)$/);
  if (half) return { kind: 'number', value: Number(half[1]) + 0.5 };

  const value = Number(text.replace(/,/g, '.'));
  if (!Number.isFinite(value) || value < 0) return { kind: 'invalid', raw: text };
  return { kind: 'number', value: round(value, 2) };
}

function describeMark(obtained: number | null, special: string): string {
  if (special && special !== 'NONE') return special;
  return obtained === null ? 'no mark' : String(obtained);
}

/* ---------------------------------------------------- building the review */

/** Suggests what a column on the sheet holds, from what the reader reported. */
export function suggestTarget(
  column: MarksSheetReading['columns'][number],
  subjects: MarksScanContext['subjects'],
): ColumnTarget {
  if (column.part === 'GRAND_TOTAL') return { type: 'GRAND_TOTAL' };
  if (column.part === 'OTHER') return { type: 'IGNORE' };

  const heading = simplify(column.heading);
  const subject =
    subjects.find((s) => column.subjectCode && s.code.toLowerCase() === column.subjectCode.toLowerCase()) ??
    subjects.find((s) => simplify(s.code) === heading || simplify(s.name) === heading) ??
    subjects.find((s) => {
      const name = simplify(s.name);
      return name.length > 3 && (heading.includes(name) || name.includes(heading));
    });

  if (!subject) return { type: 'IGNORE' };

  if (subject.practicalMarks > 0) return { type: 'SUBJECT', examSubjectId: subject.examSubjectId, part: column.part };
  // A paper with no practical part has one mark, however the column is headed.
  return {
    type: 'SUBJECT',
    examSubjectId: subject.examSubjectId,
    part: column.part === 'PRACTICAL' ? 'PRACTICAL' : 'MARKS',
  };
}

/** Finds the student a row belongs to: by roll number first, then by an unmistakable name. */
export function matchStudent(
  rollNumber: string,
  studentName: string,
  students: MarksScanContext['students'],
): string {
  if (rollNumber) {
    const byExamRoll = students.filter((s) => sameRoll(s.examRoll, rollNumber));
    if (byExamRoll.length === 1) return byExamRoll[0]!.id;
    const byClassRoll = students.filter((s) => sameRoll(s.classRoll, rollNumber));
    if (byClassRoll.length === 1) return byClassRoll[0]!.id;
    // Several sections share class roll numbers: use the name to choose.
    const candidates = [...byExamRoll, ...byClassRoll];
    if (candidates.length > 1 && studentName) {
      const best = candidates
        .map((s) => ({ s, score: nameLikeness(s.fullName, studentName) }))
        .sort((a, b) => b.score - a.score);
      if (best[0]!.score >= 0.5 && best[0]!.score > (best[1]?.score ?? 0)) return best[0]!.s.id;
    }
  }

  if (studentName) {
    const scored = students
      .map((s) => ({ s, score: nameLikeness(s.fullName, studentName) }))
      .filter((x) => x.score >= 0.99);
    if (scored.length === 1) return scored[0]!.s.id;
  }

  return '';
}

/**
 * Merges the pages of one upload into a single sheet. Columns with the same
 * heading and role on different pages become one column.
 */
export function mergeMarksPages(
  pages: { source: number; reading: MarksSheetReading }[],
  context: MarksScanContext,
): { columns: SheetColumn[]; rows: MarksRow[] } {
  const columns: SheetColumn[] = [];
  const columnByIdentity = new Map<string, string>();
  const rows: MarksRow[] = [];

  for (const { source, reading } of pages) {
    const keyMap = new Map<string, string>();

    for (const column of reading.columns) {
      const identity = `${(column.subjectCode ?? simplify(column.heading)).toLowerCase()}|${column.part}`;
      let key = columnByIdentity.get(identity);
      if (!key) {
        key = `col${columns.length + 1}`;
        columnByIdentity.set(identity, key);
        columns.push({
          key,
          heading: column.heading.trim() || `Column ${columns.length + 1}`,
          target: suggestTarget(column, context.subjects),
        });
      }
      keyMap.set(column.key, key);
    }

    reading.rows.forEach((row, index) => {
      const values: Record<string, string> = {};
      for (const cell of row.cells) {
        const key = keyMap.get(cell.column);
        if (key) values[key] = cell.value.trim();
      }
      const rollNumber = row.rollNumber?.trim() ?? '';
      const studentName = row.studentName?.trim() ?? '';

      const unclear = row.unclear
        .map((field) => (field === ROLL_FIELD || field === NAME_FIELD ? field : keyMap.get(field)))
        .filter((field): field is string => Boolean(field));

      rows.push({
        key: `p${source}-r${index}`,
        source,
        include: true,
        studentId: matchStudent(rollNumber, studentName, context.students),
        rollNumber,
        studentName,
        values,
        unclear: [...new Set(unclear)],
        note: row.note?.trim() ?? '',
      });
    });
  }

  return { columns, rows };
}

/* ------------------------------------------------------------- validation */

export function reviewMarks(
  context: MarksScanContext,
  columns: SheetColumn[],
  rows: MarksRow[],
): MarksReview {
  const subjects = new Map(context.subjects.map((s) => [s.examSubjectId, s]));
  const students = new Map(context.students.map((s) => [s.id, s]));
  const existing = new Map(context.existing.map((m) => [`${m.studentId}|${m.examSubjectId}`, m]));
  const headings = new Map(columns.map((c) => [c.key, c.heading]));

  /* ---- the column matching itself */

  const columnProblems: string[] = [];
  const bySubject = new Map<string, Partial<Record<MarkPart, string>>>();
  let totalColumn: string | null = null;

  for (const column of columns) {
    const target = column.target;
    if (target.type === 'GRAND_TOTAL') {
      if (totalColumn) columnProblems.push('Only one column can be the overall total.');
      totalColumn = column.key;
      continue;
    }
    if (target.type !== 'SUBJECT') continue;

    const subject = subjects.get(target.examSubjectId);
    if (!subject) {
      columnProblems.push(`"${column.heading}" is matched to a subject that is not in this examination.`);
      continue;
    }

    const parts = bySubject.get(subject.examSubjectId) ?? {};
    if (parts[target.part]) {
      columnProblems.push(`Two columns are matched to ${subject.name} (${target.part.toLowerCase()}).`);
    }
    parts[target.part] = column.key;
    bySubject.set(subject.examSubjectId, parts);

    if (subject.practicalMarks > 0 && target.part === 'MARKS') {
      columnProblems.push(
        `${subject.name} is marked out of ${subject.theoryMarks} theory + ${subject.practicalMarks} practical, so "${column.heading}" must be matched as its theory or practical column — one combined mark cannot be split.`,
      );
    }
    if (subject.practicalMarks === 0 && target.part !== 'MARKS') {
      columnProblems.push(
        `${subject.name} has no practical part in this examination; match "${column.heading}" as its marks.`,
      );
    }
  }

  if (context.exam.resultLocked) {
    columnProblems.push('Results for this examination are locked, so marks cannot be changed.');
  }

  /* ---- each row */

  const issues: Record<string, RowIssue[]> = {};
  const planned: PlannedMark[] = [];
  const included = rows.filter((r) => r.include);

  const studentUse = new Map<string, number>();
  for (const row of included) {
    if (row.studentId) studentUse.set(row.studentId, (studentUse.get(row.studentId) ?? 0) + 1);
  }

  let blocked = 0;
  let toCheck = 0;

  for (const row of rows) {
    const list: RowIssue[] = [];
    issues[row.key] = list;
    if (!row.include) continue;

    const rowPlan: PlannedMark[] = [];
    const student = students.get(row.studentId);

    if (!student) {
      list.push({
        level: 'ERROR',
        field: STUDENT_FIELD,
        message: row.studentId
          ? 'That student is not in this class.'
          : 'Choose which student this row belongs to.',
      });
    } else {
      if ((studentUse.get(student.id) ?? 0) > 1) {
        list.push({ level: 'ERROR', field: STUDENT_FIELD, message: `${student.fullName} is chosen on more than one row.` });
      }
      if (row.rollNumber && !sameRoll(row.rollNumber, student.examRoll) && !sameRoll(row.rollNumber, student.classRoll)) {
        list.push({
          level: 'WARNING',
          field: ROLL_FIELD,
          message: `Roll number ${row.rollNumber} on the sheet is not ${student.fullName}'s (${student.examRoll ?? student.classRoll ?? 'none'}).`,
        });
      }
      if (row.studentName && nameLikeness(row.studentName, student.fullName) < 0.5) {
        list.push({
          level: 'WARNING',
          field: NAME_FIELD,
          message: `The name on the sheet, "${row.studentName}", does not look like ${student.fullName}.`,
        });
      }
    }

    let sheetSum = 0;
    let allNumbersRead = true;

    for (const [examSubjectId, parts] of bySubject) {
      const subject = subjects.get(examSubjectId)!;
      const read = (part: MarkPart) => (parts[part] ? parseMark(row.values[parts[part]!]) : ({ kind: 'blank' } as const));

      const cells = (['MARKS', 'THEORY', 'PRACTICAL'] as MarkPart[])
        .filter((part) => parts[part])
        .map((part) => ({ part, key: parts[part]!, mark: read(part) }));

      const invalid = cells.find((c) => c.mark.kind === 'invalid');
      if (invalid) {
        list.push({
          level: 'ERROR',
          field: invalid.key,
          message: `${subject.name}: "${row.values[invalid.key]}" is not a mark. Use a number, or ABS, EX, MED or WH.`,
        });
        allNumbersRead = false;
        continue;
      }

      const special = cells.find((c) => c.mark.kind === 'special');
      if (special && special.mark.kind === 'special') {
        rowPlan.push({
          studentId: row.studentId,
          examSubjectId,
          theory: null,
          practical: null,
          obtained: null,
          special: special.mark.token,
          replaces: null,
        });
        continue;
      }

      const numberOf = (part: MarkPart) => {
        const cell = cells.find((c) => c.part === part);
        return cell && cell.mark.kind === 'number' ? cell.mark.value : null;
      };

      if (subject.practicalMarks === 0) {
        const value = numberOf('MARKS');
        if (value === null) continue;
        sheetSum += value;
        if (value > subject.maxMarks) {
          list.push({
            level: 'ERROR',
            field: parts.MARKS,
            message: `${subject.name}: ${value} is more than the maximum of ${subject.maxMarks}.`,
          });
          continue;
        }
        rowPlan.push({ studentId: row.studentId, examSubjectId, theory: value, practical: null, obtained: value, special: 'NONE', replaces: null });
        continue;
      }

      // A paper with theory and practical parts.
      const sheetTheory = numberOf('THEORY');
      const sheetPractical = numberOf('PRACTICAL');
      if (sheetTheory === null && sheetPractical === null) continue;
      sheetSum += (sheetTheory ?? 0) + (sheetPractical ?? 0);

      let bad = false;
      if (sheetTheory !== null && sheetTheory > subject.theoryMarks) {
        list.push({ level: 'ERROR', field: parts.THEORY, message: `${subject.name}: theory ${sheetTheory} is more than the maximum of ${subject.theoryMarks}.` });
        bad = true;
      }
      if (sheetPractical !== null && sheetPractical > subject.practicalMarks) {
        list.push({ level: 'ERROR', field: parts.PRACTICAL, message: `${subject.name}: practical ${sheetPractical} is more than the maximum of ${subject.practicalMarks}.` });
        bad = true;
      }
      if (bad) continue;

      // Keep the part this sheet does not show from what is already entered.
      const before = existing.get(`${row.studentId}|${examSubjectId}`);
      const theory = sheetTheory ?? before?.theory ?? null;
      const practical = sheetPractical ?? before?.practical ?? null;
      if (theory === null || practical === null) {
        list.push({
          level: 'WARNING',
          message: `${subject.name}: no ${theory === null ? 'theory' : 'practical'} mark yet, so its total counts ${theory === null ? 'the practical' : 'theory'} only until that is entered.`,
        });
      }

      rowPlan.push({
        studentId: row.studentId,
        examSubjectId,
        theory,
        practical,
        obtained: round((theory ?? 0) + (practical ?? 0), 2),
        special: 'NONE',
        replaces: null,
      });
    }

    // What each mark replaces.
    for (const mark of rowPlan) {
      const before = existing.get(`${mark.studentId}|${mark.examSubjectId}`);
      if (!before) continue;
      const unchanged =
        before.special === mark.special &&
        before.obtained === mark.obtained &&
        before.theory === mark.theory &&
        before.practical === mark.practical;
      if (unchanged) continue;
      mark.replaces = { obtained: before.obtained, special: before.special };
      list.push({
        level: 'WARNING',
        message: `${subjects.get(mark.examSubjectId)!.name}: replaces ${describeMark(before.obtained, before.special)} with ${describeMark(mark.obtained, mark.special)}.`,
      });
    }

    // The sheet's own total is a check on the reading of every mark on the row.
    if (totalColumn && allNumbersRead) {
      const total = parseMark(row.values[totalColumn]);
      if (total.kind === 'number' && Math.abs(total.value - round(sheetSum, 2)) > 0.01) {
        list.push({
          level: 'WARNING',
          field: totalColumn,
          message: `The total written on the sheet is ${total.value}, but the marks read add up to ${round(sheetSum, 2)}. One of them may be misread.`,
        });
      }
    }

    for (const field of row.unclear) {
      const label =
        field === ROLL_FIELD ? 'roll number' : field === NAME_FIELD ? 'name' : (headings.get(field) ?? 'a value');
      list.push({ level: 'CHECK', field, message: `The ${label} was hard to read. Check it against the paper.` });
    }

    if (rowPlan.length === 0 && !list.some((i) => i.level === 'ERROR')) {
      list.push({ level: 'WARNING', message: 'No marks on this row, so nothing will be saved for it.' });
    }

    const hasError = list.some((i) => i.level === 'ERROR');
    const hasCheck = list.some((i) => i.level === 'CHECK');
    if (hasError) blocked += 1;
    else if (hasCheck) toCheck += 1;
    if (!hasError) planned.push(...rowPlan);
  }

  return {
    columnProblems,
    issues,
    planned,
    summary: {
      rows: rows.length,
      included: included.length,
      blocked,
      toCheck,
      marks: planned.length,
      replacing: planned.filter((p) => p.replaces).length,
    },
  };
}
