'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, CheckCircle2, AlertTriangle, Eraser } from 'lucide-react';
import { Button, Alert, Input, Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { saveMarksAction, clearSubjectMarksAction } from '@/server/actions/marks';
import { MARK_SPECIAL_TOKENS, MARK_SPECIAL_LABELS } from '@/lib/constants';
import { cn, round } from '@/lib/utils';

export type MarksGridRow = {
  studentId: string;
  rollNumber: string;
  classRoll: string | null;
  studentName: string;
  fatherName: string;
  sectionName: string;
  theory: string;
  practical: string;
  remarks: string;
  /** Attendance recorded for this paper, when a date sheet entry exists. */
  attendance: 'PRESENT' | 'ABSENT' | 'LATE' | null;
};

type CellIssue = { level: 'error' | 'warn'; message: string } | null;

const SPECIALS = MARK_SPECIAL_TOKENS as readonly string[];

/** Validates one cell exactly the way the server does, for instant feedback. */
function validateCell(value: string, max: number): CellIssue {
  const text = value.trim().toUpperCase();
  if (text === '') return null;
  if (SPECIALS.includes(text)) return null;

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    return { level: 'error', message: `"${value}" is not a number or a valid code` };
  }
  if (numeric < 0) return { level: 'error', message: 'Negative marks are not allowed' };
  if (numeric > max) return { level: 'error', message: `Above the maximum of ${max}` };
  if (numeric === max) return { level: 'warn', message: 'Full marks — please confirm' };
  return null;
}

function cellNumeric(value: string): number | null {
  const text = value.trim().toUpperCase();
  if (text === '' || SPECIALS.includes(text)) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Spreadsheet-style marks entry. Arrow keys and Enter move between cells,
 * totals update as you type, and the browser warns before leaving with unsaved
 * changes.
 */
export function MarksGrid({
  examId,
  examSubjectId,
  sectionId,
  subjectName,
  maxMarks,
  passingMarks,
  theoryMax,
  practicalMax,
  practicalPassing,
  initialRows,
  readOnly,
  readOnlyReason,
  canClear,
}: {
  examId: string;
  examSubjectId: string;
  sectionId: string | null;
  subjectName: string;
  maxMarks: number;
  passingMarks: number;
  theoryMax: number;
  practicalMax: number;
  practicalPassing: number;
  initialRows: MarksGridRow[];
  readOnly?: boolean;
  readOnlyReason?: string;
  canClear?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = React.useState(initialRows);
  const [dirty, setDirty] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [finalizeOpen, setFinalizeOpen] = React.useState(false);
  const [clearOpen, setClearOpen] = React.useState(false);
  const hasPractical = practicalMax > 0;

  const inputRefs = React.useRef<Map<string, HTMLInputElement>>(new Map());

  React.useEffect(() => {
    setRows(initialRows);
    setDirty(false);
  }, [initialRows]);

  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = (studentId: string, field: 'theory' | 'practical' | 'remarks', value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, [field]: value } : row)),
    );
    setDirty(true);
  };

  /** Enter / arrow keys walk down the same column, like a spreadsheet. */
  const onKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    column: 'theory' | 'practical',
  ) => {
    const move = (delta: number) => {
      const target = inputRefs.current.get(`${rowIndex + delta}-${column}`);
      if (target) {
        event.preventDefault();
        target.focus();
        target.select();
      }
    };
    if (event.key === 'Enter' || event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
  };

  const stats = React.useMemo(() => {
    let entered = 0;
    let blank = 0;
    let errors = 0;
    let absent = 0;
    let failing = 0;
    const totals: number[] = [];

    for (const row of rows) {
      const theoryIssue = validateCell(row.theory, hasPractical ? theoryMax : maxMarks);
      const practicalIssue = hasPractical ? validateCell(row.practical, practicalMax) : null;
      if (theoryIssue?.level === 'error' || practicalIssue?.level === 'error') errors += 1;

      const theoryText = row.theory.trim().toUpperCase();
      const practicalText = row.practical.trim().toUpperCase();
      const special = SPECIALS.includes(theoryText)
        ? theoryText
        : SPECIALS.includes(practicalText)
          ? practicalText
          : null;

      if (special) {
        entered += 1;
        if (special === 'ABS') absent += 1;
        continue;
      }

      const theoryValue = cellNumeric(row.theory);
      const practicalValue = cellNumeric(row.practical);
      if (theoryValue === null && practicalValue === null) {
        blank += 1;
        continue;
      }

      entered += 1;
      const total = round((theoryValue ?? 0) + (practicalValue ?? 0), 2);
      totals.push(total);
      if (total < passingMarks) failing += 1;
    }

    return {
      entered,
      blank,
      errors,
      absent,
      failing,
      average: totals.length
        ? round(totals.reduce((a, b) => a + b, 0) / totals.length, 2)
        : 0,
      highest: totals.length ? Math.max(...totals) : 0,
    };
  }, [rows, hasPractical, theoryMax, practicalMax, maxMarks, passingMarks]);

  const save = async (finalize: boolean) => {
    if (stats.errors > 0) {
      toast.error(
        'Fix the highlighted cells first',
        `${stats.errors} row(s) contain a mark above the maximum, a negative value or an unrecognised code.`,
      );
      return;
    }

    setPending(true);
    const result = await saveMarksAction(
      examId,
      examSubjectId,
      sectionId,
      rows.map((row) => ({
        studentId: row.studentId,
        theory: row.theory,
        practical: row.practical,
        remarks: row.remarks,
      })),
      finalize,
    );
    setPending(false);
    setFinalizeOpen(false);

    if (result.ok) {
      toast.success(result.message ?? 'Marks saved.');
      setDirty(false);
      router.refresh();
    } else {
      toast.error('Could not save marks', result.error);
    }
  };

  const clearAll = async () => {
    setPending(true);
    const result = await clearSubjectMarksAction(examSubjectId);
    setPending(false);
    setClearOpen(false);
    if (result.ok) {
      toast.success(result.message ?? 'Marks cleared.');
      setDirty(false);
      router.refresh();
    } else {
      toast.error('Could not clear marks', result.error);
    }
  };

  return (
    <>
      {/* ------------------------------------------------------------ toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-navy-50/40 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
          <span className="font-bold text-navy-900">{subjectName}</span>
          <span className="text-slate-600">
            Max <strong className="tabular text-navy-900">{maxMarks}</strong>
            {hasPractical && (
              <>
                {' '}
                (theory <strong className="tabular">{theoryMax}</strong> + practical{' '}
                <strong className="tabular">{practicalMax}</strong>)
              </>
            )}
          </span>
          <span className="text-slate-600">
            Passing <strong className="tabular text-navy-900">{passingMarks}</strong>
            {hasPractical && practicalPassing > 0 && (
              <>
                {' '}
                · practical <strong className="tabular">{practicalPassing}</strong>
              </>
            )}
          </span>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {canClear && (
              <Button variant="outline" size="sm" onClick={() => setClearOpen(true)}>
                <Eraser className="h-4 w-4" />
                Clear Sheet
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setFinalizeOpen(true)} disabled={pending}>
              <CheckCircle2 className="h-4 w-4" />
              Save &amp; Finalise
            </Button>
            <Button size="sm" onClick={() => save(false)} loading={pending} disabled={!dirty}>
              {!pending && <Save className="h-4 w-4" />}
              Save Draft
            </Button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Candidates', value: rows.length, tone: 'text-navy-900' },
          { label: 'Entered', value: stats.entered, tone: 'text-emerald-700' },
          { label: 'Blank', value: stats.blank, tone: stats.blank ? 'text-amber-700' : 'text-slate-500' },
          { label: 'Errors', value: stats.errors, tone: stats.errors ? 'text-rose-700' : 'text-slate-500' },
          { label: 'Absent', value: stats.absent, tone: 'text-slate-600' },
          { label: 'Below Pass', value: stats.failing, tone: stats.failing ? 'text-rose-700' : 'text-slate-500' },
          { label: 'Average', value: stats.average, tone: 'text-royal-700' },
        ].map((item) => (
          <div key={item.label} className="bg-white px-4 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              {item.label}
            </p>
            <p className={cn('mt-0.5 text-lg font-bold leading-none tabular', item.tone)}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {readOnly && readOnlyReason && (
        <div className="px-5 pt-4">
          <Alert tone="warning" title="Read only">
            {readOnlyReason}
          </Alert>
        </div>
      )}

      {dirty && (
        <div className="px-5 pt-4">
          <Alert tone="warning">
            You have unsaved changes. Save the sheet before leaving this page.
          </Alert>
        </div>
      )}

      <div className="px-5 pt-4">
        <p className="text-[12px] leading-relaxed text-slate-500">
          Enter a number, or one of{' '}
          {SPECIALS.map((token) => (
            <span key={token} className="mx-0.5">
              <strong className="text-navy-800">{token}</strong> ({MARK_SPECIAL_LABELS[token]})
            </span>
          ))}
          . Press <strong>Enter</strong> or the arrow keys to move down a column.
        </p>
      </div>

      {/* --------------------------------------------------------------- grid */}
      <TableWrap className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th align="center">Roll No.</Th>
              <Th>Student Name</Th>
              <Th>Father Name</Th>
              <Th align="center">Section</Th>
              <Th align="center">Attendance</Th>
              <Th align="center">{hasPractical ? `Theory (${theoryMax})` : `Marks (${maxMarks})`}</Th>
              {hasPractical && <Th align="center">Practical ({practicalMax})</Th>}
              <Th align="center">Total</Th>
              <Th align="center">Status</Th>
              <Th>Remarks</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const theoryIssue = validateCell(row.theory, hasPractical ? theoryMax : maxMarks);
              const practicalIssue = hasPractical ? validateCell(row.practical, practicalMax) : null;

              const theoryText = row.theory.trim().toUpperCase();
              const practicalText = row.practical.trim().toUpperCase();
              const special = SPECIALS.includes(theoryText)
                ? theoryText
                : SPECIALS.includes(practicalText)
                  ? practicalText
                  : null;

              const theoryValue = cellNumeric(row.theory);
              const practicalValue = cellNumeric(row.practical);
              const hasValue = theoryValue !== null || practicalValue !== null;
              const total = hasValue ? round((theoryValue ?? 0) + (practicalValue ?? 0), 2) : null;

              const practicalShort =
                hasPractical &&
                practicalValue !== null &&
                practicalPassing > 0 &&
                practicalValue < practicalPassing;

              const attendanceMismatch =
                row.attendance === 'ABSENT' && total !== null && total > 0;

              const cellClass = (issue: CellIssue) =>
                cn(
                  'no-spinner h-8 w-[86px] rounded-md border px-2 text-center text-[13px] font-semibold tabular transition',
                  'focus:outline-none focus:ring-2',
                  issue?.level === 'error'
                    ? 'border-rose-400 bg-rose-50 text-rose-800 focus:border-rose-500 focus:ring-rose-200'
                    : issue?.level === 'warn'
                      ? 'border-amber-400 bg-amber-50 text-amber-800 focus:border-amber-500 focus:ring-amber-200'
                      : 'border-slate-300 text-navy-900 focus:border-royal-500 focus:ring-royal-200',
                  'disabled:bg-slate-100 disabled:text-slate-500',
                );

              return (
                <tr key={row.studentId} className={special ? 'bg-slate-50' : undefined}>
                  <Td align="center">
                    <span className="rounded-md bg-navy-900 px-2 py-1 text-[12px] font-bold text-gold-300 tabular">
                      {row.rollNumber}
                    </span>
                  </Td>
                  <Td className="font-semibold text-navy-900">{row.studentName}</Td>
                  <Td className="text-slate-700">{row.fatherName}</Td>
                  <Td align="center" className="text-slate-600">{row.sectionName}</Td>
                  <Td align="center">
                    {row.attendance === 'ABSENT' ? (
                      <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">Absent</Badge>
                    ) : row.attendance === 'LATE' ? (
                      <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Late</Badge>
                    ) : row.attendance === 'PRESENT' ? (
                      <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Present</Badge>
                    ) : (
                      <span className="text-[12px] text-slate-400">—</span>
                    )}
                  </Td>

                  <Td align="center">
                    <input
                      ref={(el) => {
                        if (el) inputRefs.current.set(`${index}-theory`, el);
                        else inputRefs.current.delete(`${index}-theory`);
                      }}
                      value={row.theory}
                      disabled={readOnly}
                      onChange={(e) => update(row.studentId, 'theory', e.target.value)}
                      onKeyDown={(e) => onKeyDown(e, index, 'theory')}
                      onFocus={(e) => e.target.select()}
                      className={cellClass(theoryIssue)}
                      inputMode="decimal"
                      aria-label={`Marks for ${row.studentName}`}
                      title={theoryIssue?.message}
                    />
                  </Td>

                  {hasPractical && (
                    <Td align="center">
                      <input
                        ref={(el) => {
                          if (el) inputRefs.current.set(`${index}-practical`, el);
                          else inputRefs.current.delete(`${index}-practical`);
                        }}
                        value={row.practical}
                        disabled={readOnly || Boolean(special)}
                        onChange={(e) => update(row.studentId, 'practical', e.target.value)}
                        onKeyDown={(e) => onKeyDown(e, index, 'practical')}
                        onFocus={(e) => e.target.select()}
                        className={cellClass(practicalIssue)}
                        inputMode="decimal"
                        aria-label={`Practical marks for ${row.studentName}`}
                        title={practicalIssue?.message}
                      />
                    </Td>
                  )}

                  <Td align="center" className="font-bold tabular text-navy-900">
                    {special ? <span className="text-slate-500">{special}</span> : (total ?? '—')}
                  </Td>

                  <Td align="center">
                    {special ? (
                      <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">
                        {MARK_SPECIAL_LABELS[special]}
                      </Badge>
                    ) : total === null ? (
                      <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Blank</Badge>
                    ) : total >= passingMarks && !practicalShort ? (
                      <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Pass</Badge>
                    ) : (
                      <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">
                        {practicalShort ? 'Practical short' : 'Fail'}
                      </Badge>
                    )}
                  </Td>

                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={row.remarks}
                        disabled={readOnly}
                        onChange={(e) => update(row.studentId, 'remarks', e.target.value)}
                        placeholder="—"
                        className="h-8 min-w-[130px] px-2 text-[12.5px]"
                        aria-label={`Remarks for ${row.studentName}`}
                      />
                      {attendanceMismatch && (
                        <span title="Marked absent in attendance but carries marks">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {!readOnly && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <Button variant="outline" onClick={() => setFinalizeOpen(true)} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" />
            Save &amp; Finalise
          </Button>
          <Button onClick={() => save(false)} loading={pending} disabled={!dirty}>
            {!pending && <Save className="h-4 w-4" />}
            Save Draft
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        onConfirm={() => save(true)}
        title="Finalise this marks sheet"
        confirmLabel="Save & Finalise"
        tone="primary"
        loading={pending}
        message={
          <>
            Finalising records every mark as complete for <strong>{subjectName}</strong>. Every
            candidate must have a mark or one of ABS / EX / MED / WH.
            {stats.blank > 0 && (
              <span className="mt-2 block font-semibold text-rose-700">
                {stats.blank} candidate(s) are still blank — finalising will be rejected.
              </span>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={clearAll}
        title="Clear the entire marks sheet"
        confirmLabel="Clear All Marks"
        loading={pending}
        requirePhrase="CLEAR"
        message={
          <>
            Delete every recorded mark for <strong>{subjectName}</strong> across all sections? This
            cannot be undone and is written to the audit log.
          </>
        }
      />
    </>
  );
}
