'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, Trash2, RefreshCw } from 'lucide-react';
import { Button, Checkbox, Input, Select, Alert } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { SubjectTypeBadge } from '@/components/ui/status-badge';
import { EXAM_STATUS_ORDER, EXAM_STATUS_LABELS } from '@/lib/constants';
import {
  updateExamSubjectAction,
  deleteExamAction,
  setExamStatusAction,
} from '@/server/actions/exams';

export type ExamSubjectRow = {
  id: string;
  subjectName: string;
  subjectCode: string;
  subjectType: string;
  className: string;
  isIncluded: boolean;
  maxMarks: number;
  passingMarks: number;
  theoryMarks: number;
  practicalMarks: number;
  practicalPassing: number;
  marksRecorded: number;
};

/**
 * Inline editor for each subject's per-examination marks. A monthly test can
 * therefore carry 25 marks per paper while the annual carries 75, without
 * touching the class subject definitions.
 */
export function ExamSubjectEditor({
  rows,
  editable,
}: {
  rows: ExamSubjectRow[];
  editable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = React.useState(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.id,
        {
          isIncluded: row.isIncluded,
          maxMarks: String(row.maxMarks),
          passingMarks: String(row.passingMarks),
          practicalMarks: String(row.practicalMarks),
          practicalPassing: String(row.practicalPassing),
        },
      ]),
    ),
  );
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const update = (id: string, patch: Partial<(typeof draft)[string]>) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  const dirty = (row: ExamSubjectRow) => {
    const d = draft[row.id];
    if (!d) return false;
    return (
      d.isIncluded !== row.isIncluded ||
      Number(d.maxMarks) !== row.maxMarks ||
      Number(d.passingMarks) !== row.passingMarks ||
      Number(d.practicalMarks) !== row.practicalMarks ||
      Number(d.practicalPassing) !== row.practicalPassing
    );
  };

  const save = async (row: ExamSubjectRow) => {
    const d = draft[row.id]!;
    setSavingId(row.id);
    const result = await updateExamSubjectAction(row.id, {
      isIncluded: d.isIncluded,
      maxMarks: Number(d.maxMarks),
      passingMarks: Number(d.passingMarks),
      practicalMarks: Number(d.practicalMarks),
      practicalPassing: Number(d.practicalPassing),
    });
    setSavingId(null);

    if (result.ok) {
      toast.success(result.message ?? 'Subject updated.');
      router.refresh();
    } else {
      toast.error('Could not update subject', result.error);
    }
  };

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Subject</Th>
            <Th>Class</Th>
            <Th>Type</Th>
            <Th align="center">Included</Th>
            <Th align="center">Max</Th>
            <Th align="center">Passing</Th>
            <Th align="center">Practical</Th>
            <Th align="center">Prac. Pass</Th>
            <Th align="center">Theory</Th>
            <Th align="center">Marks Entered</Th>
            {editable && <Th align="right" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const d = draft[row.id]!;
            const theory = Math.max(0, (Number(d.maxMarks) || 0) - (Number(d.practicalMarks) || 0));
            return (
              <tr key={row.id} className={d.isIncluded ? undefined : 'opacity-55'}>
                <Td>
                  <span className="font-semibold text-navy-900">{row.subjectName}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
                    {row.subjectCode}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-slate-600">{row.className}</Td>
                <Td>
                  <SubjectTypeBadge type={row.subjectType} />
                </Td>
                <Td align="center">
                  <input
                    type="checkbox"
                    checked={d.isIncluded}
                    disabled={!editable}
                    onChange={(e) => update(row.id, { isIncluded: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-royal-600 focus:ring-royal-300"
                    aria-label={`Include ${row.subjectName}`}
                  />
                </Td>
                {(
                  [
                    ['maxMarks', d.maxMarks],
                    ['passingMarks', d.passingMarks],
                    ['practicalMarks', d.practicalMarks],
                    ['practicalPassing', d.practicalPassing],
                  ] as const
                ).map(([key, value]) => (
                  <Td key={key} align="center">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={value}
                      disabled={!editable}
                      onChange={(e) => update(row.id, { [key]: e.target.value })}
                      className="no-spinner w-[68px] rounded-md border border-slate-300 px-2 py-1 text-center text-[13px] tabular focus:border-royal-500 focus:outline-none focus:ring-1 focus:ring-royal-300 disabled:bg-slate-100"
                    />
                  </Td>
                ))}
                <Td align="center" className="font-semibold tabular text-slate-700">
                  {theory}
                </Td>
                <Td align="center" className="tabular text-slate-600">
                  {row.marksRecorded}
                </Td>
                {editable && (
                  <Td align="right">
                    <Button
                      size="sm"
                      variant={dirty(row) ? 'secondary' : 'outline'}
                      disabled={!dirty(row)}
                      loading={savingId === row.id}
                      onClick={() => save(row)}
                    >
                      {savingId !== row.id && <Save className="h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/* -------------------------------------------------------------- status */

export function ExamStatusControl({
  examId,
  currentStatus,
  locked,
}: {
  examId: string;
  currentStatus: string;
  locked: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState(currentStatus);
  const [pending, setPending] = React.useState(false);

  const apply = async () => {
    setPending(true);
    const result = await setExamStatusAction(examId, status);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Status updated.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not change status', result.error);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={locked}>
        <RefreshCw className="h-4 w-4" />
        Change Status
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Change examination status"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={apply} loading={pending} disabled={status === currentStatus}>
              Update Status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            Publication, approval and locking are handled from{' '}
            <strong>Results → Publish Results</strong>, which records the full approval trail. Use
            this control for the earlier stages only.
          </Alert>
          <div>
            <label className="field-label" htmlFor="exam-status">
              Status
            </label>
            <Select id="exam-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {EXAM_STATUS_ORDER.filter(
                (s) => !['PUBLISHED', 'LOCKED'].includes(s) || s === currentStatus,
              ).map((value) => (
                <option key={value} value={value}>
                  {EXAM_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------- delete */

export function DeleteExamButton({
  examId,
  examName,
  disabled,
}: {
  examId: string;
  examName: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteExamAction(examId);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Examination deleted.');
      router.push('/exams');
      router.refresh();
    } else {
      toast.error('Could not delete', result.error);
      setOpen(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Delete examination"
        confirmLabel="Delete Examination"
        loading={pending}
        requirePhrase="DELETE"
        message={
          <>
            Permanently delete <strong>{examName}</strong>, along with its date sheet, roll numbers
            and seating plan? This is only possible while no marks or results exist.
          </>
        }
      />
    </>
  );
}
