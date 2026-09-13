'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Users } from 'lucide-react';
import { Alert, Button, Field, Select, Textarea, Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { GradeBadge, ResultStatusBadge } from '@/components/ui/status-badge';
import { PROMOTION_ACTIONS, PROMOTION_ACTION_LABELS } from '@/lib/constants';
import { promoteStudentsAction } from '@/server/actions/promotion';
import type { PromotionPreviewRow } from '@/server/actions/promotion';
import { formatPercent } from '@/lib/utils';

export type TargetOption = { id: string; label: string; classId?: string };

/**
 * Promotion workbench: shows the recommended outcome for each student from
 * their latest published result, and commits the selection in one transaction.
 */
export function PromotionWorkbench({
  rows,
  fromSessionId,
  fromClassId,
  fromClassName,
  toSessionId,
  toSessionName,
  targetClasses,
  targetSections,
}: {
  rows: PromotionPreviewRow[];
  fromSessionId: string;
  fromClassId: string;
  fromClassName: string;
  toSessionId: string;
  toSessionName: string;
  targetClasses: TargetOption[];
  targetSections: TargetOption[];
}) {
  const router = useRouter();
  const toast = useToast();

  const selectable = React.useMemo(() => rows.filter((r) => !r.alreadyEnrolled), [rows]);

  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(selectable.filter((r) => r.recommended === 'PROMOTED').map((r) => r.studentId)),
  );
  const [action, setAction] = React.useState<(typeof PROMOTION_ACTIONS)[number]>('PROMOTED');
  const [toClassId, setToClassId] = React.useState('');
  const [toSectionId, setToSectionId] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setSelected(
      new Set(selectable.filter((r) => r.recommended === 'PROMOTED').map((r) => r.studentId)),
    );
  }, [selectable]);

  const sectionsForClass = targetSections.filter((s) => !toClassId || s.classId === toClassId);

  React.useEffect(() => {
    if (toSectionId && !sectionsForClass.some((s) => s.id === toSectionId)) setToSectionId('');
  }, [toSectionId, sectionsForClass]);

  const needsTarget = action === 'PROMOTED' || action === 'RETAINED';
  const ready =
    selected.size > 0 && (!needsTarget || (Boolean(toClassId) && Boolean(toSectionId)));

  const toggle = (studentId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  const run = async () => {
    setPending(true);
    const result = await promoteStudentsAction({
      fromSessionId,
      toSessionId,
      fromClassId,
      toClassId: needsTarget ? toClassId : undefined,
      toSectionId: needsTarget ? toSectionId : undefined,
      action,
      studentIds: [...selected],
      remarks: remarks.trim() || undefined,
    });
    setPending(false);
    setConfirmOpen(false);

    if (result.ok) {
      toast.success(result.message ?? 'Promotion complete.');
      router.refresh();
    } else {
      toast.error('Promotion failed', result.error);
    }
  };

  return (
    <>
      <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Outcome" htmlFor="promotion-action" required>
          <Select
            id="promotion-action"
            value={action}
            onChange={(e) => setAction(e.target.value as (typeof PROMOTION_ACTIONS)[number])}
          >
            {PROMOTION_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {PROMOTION_ACTION_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Target Class"
          htmlFor="promotion-class"
          required={needsTarget}
          hint={needsTarget ? `In session ${toSessionName}` : 'Not needed for this outcome'}
        >
          <Select
            id="promotion-class"
            value={toClassId}
            onChange={(e) => {
              setToClassId(e.target.value);
              setToSectionId('');
            }}
            disabled={!needsTarget}
          >
            <option value="">Select class…</option>
            {targetClasses.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Target Section" htmlFor="promotion-section" required={needsTarget}>
          <Select
            id="promotion-section"
            value={toSectionId}
            onChange={(e) => setToSectionId(e.target.value)}
            disabled={!needsTarget || !toClassId}
          >
            <option value="">Select section…</option>
            {sectionsForClass.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Remarks" htmlFor="promotion-remarks">
          <Textarea
            id="promotion-remarks"
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Promoted on the annual examination result."
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="font-semibold text-navy-900 tabular">
            {selected.size} of {selectable.length} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set(selectable.map((r) => r.studentId)))}
            className="text-[12.5px] font-semibold text-royal-700 hover:underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() =>
              setSelected(
                new Set(
                  selectable.filter((r) => r.recommended === 'PROMOTED').map((r) => r.studentId),
                ),
              )
            }
            className="text-[12.5px] font-semibold text-royal-700 hover:underline"
          >
            Select recommended
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[12.5px] font-semibold text-slate-600 hover:underline"
          >
            Clear
          </button>
        </div>

        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!ready}>
          <ArrowUpRight className="h-4 w-4" />
          {PROMOTION_ACTION_LABELS[action]} {selected.size} student
          {selected.size === 1 ? '' : 's'}
        </Button>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th align="center">Select</Th>
              <Th align="center">Roll</Th>
              <Th>Student</Th>
              <Th>Father Name</Th>
              <Th>Admission No.</Th>
              <Th align="center">Latest %</Th>
              <Th align="center">Grade</Th>
              <Th>Result</Th>
              <Th>Recommended</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.studentId}
                className={row.alreadyEnrolled ? 'opacity-55' : undefined}
              >
                <Td align="center">
                  <input
                    type="checkbox"
                    checked={selected.has(row.studentId)}
                    disabled={row.alreadyEnrolled}
                    onChange={() => toggle(row.studentId)}
                    className="h-4 w-4 rounded border-slate-300 text-royal-600 focus:ring-royal-300"
                    aria-label={`Select ${row.studentName}`}
                  />
                </Td>
                <Td align="center" className="tabular text-slate-600">
                  {row.classRoll ?? '—'}
                </Td>
                <Td className="font-semibold text-navy-900">{row.studentName}</Td>
                <Td className="text-slate-700">{row.fatherName}</Td>
                <Td className="whitespace-nowrap tabular text-slate-600">{row.admissionNumber}</Td>
                <Td align="center" className="font-semibold tabular">
                  {row.percentage !== null ? formatPercent(row.percentage) : '—'}
                </Td>
                <Td align="center">
                  {row.grade ? <GradeBadge grade={row.grade} /> : <span className="text-slate-400">—</span>}
                </Td>
                <Td>
                  {row.resultStatus ? (
                    <ResultStatusBadge status={row.resultStatus} />
                  ) : (
                    <span className="text-[12px] text-slate-400">No published result</span>
                  )}
                </Td>
                <Td>
                  {row.alreadyEnrolled ? (
                    <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">
                      Already in {toSessionName}
                    </Badge>
                  ) : row.recommended === 'PROMOTED' ? (
                    <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Promote</Badge>
                  ) : (
                    <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Retain</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={run}
        title={`${PROMOTION_ACTION_LABELS[action]} — confirm`}
        confirmLabel={`${PROMOTION_ACTION_LABELS[action]} ${selected.size}`}
        tone="primary"
        loading={pending}
        requirePhrase="PROMOTE"
        message={
          <>
            <strong>{selected.size}</strong> student(s) from <strong>{fromClassName}</strong> will be
            marked <strong>{action.toLowerCase()}</strong>
            {needsTarget && (
              <>
                {' '}
                and enrolled in{' '}
                <strong>
                  {targetClasses.find((c) => c.id === toClassId)?.label} —{' '}
                  {targetSections.find((s) => s.id === toSectionId)?.label}
                </strong>{' '}
                for session <strong>{toSessionName}</strong>
              </>
            )}
            .
            <span className="mt-2 block">
              Existing enrolments and every past result are preserved — promotion only ever adds new
              records.
            </span>
          </>
        }
      />
    </>
  );
}

export function PromotionEmpty() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-navy-50 text-navy-400">
        <Users className="h-6 w-6" />
      </span>
      <p className="text-[15px] font-bold text-navy-900">Choose a class to promote</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
        Select the session and class the students are leaving, and the session they move into.
      </p>
    </div>
  );
}
