'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, RotateCcw, Save } from 'lucide-react';
import { Alert, Button, Card, CardHeader, Select } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import {
  matchStudent,
  mergeMarksPages,
  reviewMarks,
  NAME_FIELD,
  ROLL_FIELD,
  STUDENT_FIELD,
  type ColumnTarget,
  type MarksRow,
  type MarksScanContext,
  type SheetColumn,
} from '@/lib/scan/marks';
import type { MarksSheetReading } from '@/lib/scan/schemas';
import { commitMarksScanAction } from '@/server/actions/scan';
import {
  IssueList,
  Notices,
  SourceButton,
  SourceViewer,
  UploadStep,
  cellTone,
  releaseFiles,
  type SourceFile,
} from './scan-shared';

function encodeTarget(target: ColumnTarget): string {
  return target.type === 'SUBJECT' ? `S|${target.examSubjectId}|${target.part}` : target.type;
}

function decodeTarget(value: string): ColumnTarget {
  if (value === 'GRAND_TOTAL') return { type: 'GRAND_TOTAL' };
  if (value.startsWith('S|')) {
    const [, examSubjectId, part] = value.split('|');
    return { type: 'SUBJECT', examSubjectId: examSubjectId!, part: part as 'MARKS' | 'THEORY' | 'PRACTICAL' };
  }
  return { type: 'IGNORE' };
}

export function MarksScan({ context }: { context: MarksScanContext }) {
  const router = useRouter();
  const toast = useToast();

  const [files, setFiles] = React.useState<SourceFile[]>([]);
  const [notices, setNotices] = React.useState<string[]>([]);
  const [columns, setColumns] = React.useState<SheetColumn[] | null>(null);
  const [rows, setRows] = React.useState<MarksRow[]>([]);
  const [viewing, setViewing] = React.useState<SourceFile | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);

  const review = React.useMemo(
    () => (columns ? reviewMarks(context, columns, rows) : null),
    [context, columns, rows],
  );

  const reset = () => {
    releaseFiles(files);
    setFiles([]);
    setNotices([]);
    setColumns(null);
    setRows([]);
  };

  const updateRow = (key: string, update: (row: MarksRow) => MarksRow) =>
    setRows((current) => current.map((row) => (row.key === key ? update(row) : row)));

  const confirmField = (key: string, field: string) =>
    updateRow(key, (row) => ({ ...row, unclear: row.unclear.filter((f) => f !== field) }));

  const setValue = (key: string, column: string, value: string) =>
    updateRow(key, (row) => ({
      ...row,
      values: { ...row.values, [column]: value },
      unclear: row.unclear.filter((f) => f !== column),
    }));

  const setRoll = (key: string, rollNumber: string) =>
    updateRow(key, (row) => ({
      ...row,
      rollNumber,
      unclear: row.unclear.filter((f) => f !== ROLL_FIELD),
      studentId: row.studentId || matchStudent(rollNumber, row.studentName, context.students),
    }));

  const save = async () => {
    if (!columns) return;
    setSaving(true);
    const result = await commitMarksScanAction({
      examId: context.exam.id,
      classId: context.classId,
      sectionId: context.sectionId,
      fileNames: files.map((f) => f.name),
      columns,
      rows,
    });
    setSaving(false);
    setConfirmOpen(false);

    if (result.ok) {
      toast.success(result.message ?? 'Marks saved.');
      setSaved(result.message ?? 'Marks saved.');
      reset();
      router.refresh();
    } else {
      toast.error('Nothing was saved', result.error);
    }
  };

  const lockedReason = context.exam.resultLocked
    ? 'Results for this examination are locked. Ask a Super Admin to unlock them before importing marks.'
    : context.subjects.length === 0
      ? 'This class has no subjects in this examination yet.'
      : context.students.length === 0
        ? 'No students are enrolled in this class for the examination’s session.'
        : null;

  if (!columns || !review) {
    return (
      <>
        {saved && (
          <Alert tone="success" title={saved} className="mb-5">
            Check them on <Link href="/marks/entry" className="font-semibold underline">Enter Marks</Link>, or
            scan another sheet below.
          </Alert>
        )}
        <UploadStep<MarksSheetReading>
          kind="marks"
          title={`Scan marks — ${context.exam.name}, ${context.className}${context.sectionName ? ` ${context.sectionName}` : ''}`}
          description="A photo or PDF of an award list, marks sheet or result sheet. One subject or many."
          hint={
            <>
              Take the photo straight on, in good light, with the whole page in view. Use several photos
              for a long sheet. Nothing is saved until you have checked every row.
            </>
          }
          fields={{
            examId: context.exam.id,
            classId: context.classId,
            sectionId: context.sectionId ?? '',
          }}
          disabledReason={lockedReason}
          onRead={({ pages, files: read, notices: found }) => {
            const merged = mergeMarksPages(pages, context);
            setSaved(null);
            setFiles(read);
            setNotices(found);
            setColumns(merged.columns);
            setRows(merged.rows);
            if (merged.rows.length === 0) toast.error('No rows found', 'The pages were read but no student rows were found on them.');
          }}
        />
      </>
    );
  }

  const subjectOptions = context.subjects.flatMap((s) =>
    s.practicalMarks > 0
      ? [
          { value: `S|${s.examSubjectId}|THEORY`, label: `${s.name} — theory (out of ${s.theoryMarks})` },
          { value: `S|${s.examSubjectId}|PRACTICAL`, label: `${s.name} — practical (out of ${s.practicalMarks})` },
        ]
      : [{ value: `S|${s.examSubjectId}|MARKS`, label: `${s.name} (out of ${s.maxMarks})` }],
  );

  const shownColumns = columns.filter((c) => c.target.type !== 'IGNORE');
  const { summary } = review;
  const canSave =
    review.columnProblems.length === 0 && summary.blocked === 0 && summary.toCheck === 0 && summary.marks > 0;

  return (
    <>
      <Notices notices={notices} />

      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-5">
        <StatCard label="Rows Read" value={summary.rows} tone="navy" hint={`${summary.included} included`} />
        <StatCard label="Marks to Save" value={summary.marks} tone="emerald" />
        <StatCard label="To Check" value={summary.toCheck} tone={summary.toCheck ? 'amber' : 'slate'} hint="hard-to-read values" />
        <StatCard label="Problems" value={summary.blocked} tone={summary.blocked ? 'rose' : 'slate'} />
        <StatCard label="Replacing" value={summary.replacing} tone={summary.replacing ? 'royal' : 'slate'} hint="existing marks" />
      </section>

      <Card className="mb-5">
        <CardHeader
          title="What each column on the sheet holds"
          description="Matched automatically from the headings. Correct any that are wrong — columns set to “Not saved” are left out."
        />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Heading on the sheet</Th>
                <Th>Save as</Th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.key}>
                  <Td className="font-semibold text-navy-900">{column.heading}</Td>
                  <Td className="w-[360px]">
                    <Select
                      aria-label={`Save "${column.heading}" as`}
                      value={encodeTarget(column.target)}
                      onChange={(e) =>
                        setColumns((current) =>
                          current!.map((c) => (c.key === column.key ? { ...c, target: decodeTarget(e.target.value) } : c)),
                        )
                      }
                    >
                      <option value="IGNORE">Not saved</option>
                      <option value="GRAND_TOTAL">Overall total (used to check the reading)</option>
                      {subjectOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        {review.columnProblems.length > 0 && (
          <div className="border-t border-slate-200 p-4">
            <Alert tone="danger">
              <ul className="list-disc space-y-0.5 pl-5">
                {review.columnProblems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            </Alert>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Check every row against the paper"
          description="Amber cells were hard to read — correct them, or press “Looks right”. Red cells must be fixed. Untick a row to leave it out."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Start again
              </Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!canSave}>
                <Save className="h-4 w-4" />
                Save {summary.marks} mark{summary.marks === 1 ? '' : 's'}
              </Button>
            </>
          }
        />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th align="center">Use</Th>
                <Th>Roll No.</Th>
                <Th>Name on sheet</Th>
                <Th>Student</Th>
                {shownColumns.map((column) => (
                  <Th key={column.key} align="center" className="whitespace-nowrap">
                    {column.heading}
                    <span className="block text-[10.5px] font-medium normal-case text-slate-400">
                      {column.target.type === 'GRAND_TOTAL'
                        ? 'total (check)'
                        : subjectOptions.find((o) => o.value === encodeTarget(column.target))?.label.replace(/ \(out of.*$/, '')}
                    </span>
                  </Th>
                ))}
                <Th align="center">Page</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const issues = review.issues[row.key] ?? [];
                const showChecks = row.include && (issues.length > 0 || row.note);
                return (
                  <React.Fragment key={row.key}>
                  <tr className={cn(!row.include && 'opacity-50', showChecks && '[&>td]:border-b-0')}>
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateRow(row.key, (r) => ({ ...r, include: e.target.checked }))}
                        aria-label="Include this row"
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </Td>
                    <Td>
                      <input
                        value={row.rollNumber}
                        onChange={(e) => setRoll(row.key, e.target.value)}
                        className={cn('field-input h-8 w-32 px-2 text-[13px] tabular', cellTone(ROLL_FIELD, issues, row.unclear))}
                        aria-label="Roll number on the sheet"
                      />
                    </Td>
                    <Td>
                      <input
                        value={row.studentName}
                        onChange={(e) =>
                          updateRow(row.key, (r) => ({
                            ...r,
                            studentName: e.target.value,
                            unclear: r.unclear.filter((f) => f !== NAME_FIELD),
                          }))
                        }
                        className={cn('field-input h-8 w-40 px-2 text-[13px]', cellTone(NAME_FIELD, issues, row.unclear))}
                        aria-label="Name on the sheet"
                      />
                    </Td>
                    <Td>
                      <select
                        value={row.studentId}
                        onChange={(e) => updateRow(row.key, (r) => ({ ...r, studentId: e.target.value }))}
                        className={cn('field-input h-8 w-56 px-2 text-[13px]', cellTone(STUDENT_FIELD, issues, row.unclear))}
                        aria-label="Student this row belongs to"
                      >
                        <option value="">Choose student…</option>
                        {context.students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {(s.examRoll ?? s.classRoll ?? '—') + ' · ' + s.fullName}
                            {context.sectionId ? '' : ` (${s.sectionName})`}
                          </option>
                        ))}
                      </select>
                    </Td>
                    {shownColumns.map((column) => (
                      <Td key={column.key} align="center">
                        <input
                          value={row.values[column.key] ?? ''}
                          onChange={(e) => setValue(row.key, column.key, e.target.value)}
                          className={cn(
                            'field-input h-8 w-16 px-1.5 text-center text-[13px] tabular',
                            cellTone(column.key, issues, row.unclear),
                          )}
                          aria-label={`${column.heading} for row ${row.rollNumber || row.studentName}`}
                        />
                      </Td>
                    ))}
                    <Td align="center">
                      <SourceButton file={files[row.source]} onOpen={() => setViewing(files[row.source] ?? null)} />
                    </Td>
                  </tr>
                  {showChecks && (
                    <tr>
                      <td colSpan={shownColumns.length + 5} className="!pb-3 !pl-14 !pt-0">
                        {/* Beneath the row rather than in a last column, which a sheet with many subjects pushes off screen. */}
                        <div className="sticky left-14 max-w-[720px]">
                          <IssueList issues={issues} onConfirm={(field) => confirmField(row.key, field)} />
                          {row.note && <p className="mt-1 text-[11.5px] italic text-slate-500">Reader’s note: “{row.note}”</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <SourceViewer file={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={save}
        tone="primary"
        title="Save these marks"
        confirmLabel={`Save ${summary.marks}`}
        loading={saving}
        message={
          <>
            <strong>{summary.marks}</strong> mark(s) will be saved to <strong>{context.exam.name}</strong> for{' '}
            {context.className}
            {context.sectionName ? ` ${context.sectionName}` : ''}.
            {summary.replacing > 0 && (
              <span className="mt-2 flex items-start gap-1.5 text-amber-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {summary.replacing} of them replace marks already entered.
              </span>
            )}
            <span className="mt-2 block">Every change is recorded in the audit log.</span>
          </>
        }
      />
    </>
  );
}
