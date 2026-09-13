'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Grid3x3, Eraser } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Select } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { generateSeatingAction, clearSeatingAction } from '@/server/actions/exams';

export type RoomOption = {
  id: string;
  name: string;
  roomNumber: string;
  capacity: number;
};

/**
 * Builds a seating plan across the selected rooms. Alternate seating interleaves
 * classes (or sections) so neighbouring candidates never sit the same paper.
 */
export function GenerateSeatingDialog({
  examId,
  rooms,
  candidateCount,
  hasExisting,
  disabled,
}: {
  examId: string;
  rooms: RoomOption[];
  candidateCount: number;
  hasExisting: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>(rooms.map((r) => r.id));
  const [strategy, setStrategy] = React.useState<'SEQUENTIAL' | 'ALTERNATE'>('ALTERNATE');
  const [mixBy, setMixBy] = React.useState<'CLASS' | 'SECTION'>('CLASS');
  const [pending, setPending] = React.useState(false);

  const capacity = rooms
    .filter((r) => selected.includes(r.id))
    .reduce((sum, r) => sum + r.capacity, 0);
  const short = candidateCount - capacity;

  const run = async () => {
    setPending(true);
    const result = await generateSeatingAction(examId, selected, strategy, mixBy);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Seating plan generated.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not generate the seating plan', result.error);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Grid3x3 className="h-4 w-4" />
        {hasExisting ? 'Rebuild' : 'Generate'} Seating Plan
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={hasExisting ? 'Rebuild seating plan' : 'Generate seating plan'}
        description={`${candidateCount} candidate(s) hold a roll number for this examination.`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending} disabled={selected.length === 0 || short > 0}>
              {hasExisting ? 'Rebuild Plan' : 'Generate Plan'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {hasExisting && (
            <Alert tone="warning">
              An existing seating plan will be replaced. Seat labels and door lists already printed
              will no longer match.
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seating strategy" htmlFor="strategy" required>
              <Select
                id="strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as 'SEQUENTIAL' | 'ALTERNATE')}
              >
                <option value="ALTERNATE">Alternate — neighbours from different groups</option>
                <option value="SEQUENTIAL">Sequential — by class, section and roll number</option>
              </Select>
            </Field>

            <Field
              label="Alternate between"
              htmlFor="mixBy"
              hint="Only applies to alternate seating."
            >
              <Select
                id="mixBy"
                value={mixBy}
                onChange={(e) => setMixBy(e.target.value as 'CLASS' | 'SECTION')}
                disabled={strategy !== 'ALTERNATE'}
              >
                <option value="CLASS">Classes</option>
                <option value="SECTION">Sections</option>
              </Select>
            </Field>
          </div>

          <div>
            <p className="field-label">Rooms to use</p>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {rooms.length === 0 ? (
                <p className="text-[13px] text-slate-500">
                  No active examination rooms. Add rooms first.
                </p>
              ) : (
                rooms.map((room) => (
                  <Checkbox
                    key={room.id}
                    checked={selected.includes(room.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, room.id] : prev.filter((id) => id !== room.id),
                      )
                    }
                    label={
                      <span className="flex w-full items-center justify-between gap-3">
                        <span>
                          {room.name}{' '}
                          <span className="text-slate-400">({room.roomNumber})</span>
                        </span>
                        <span className="text-[12px] font-semibold text-slate-500 tabular">
                          {room.capacity} seats
                        </span>
                      </span>
                    }
                  />
                ))
              )}
            </div>
          </div>

          <div
            className={`rounded-lg px-4 py-3 text-[13px] ${
              short > 0 ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {short > 0 ? (
              <>
                Selected capacity is <strong className="tabular">{capacity}</strong> seat(s) —{' '}
                <strong className="tabular">{short}</strong> short of the{' '}
                <strong className="tabular">{candidateCount}</strong> candidates. Select more rooms.
              </>
            ) : (
              <>
                Selected capacity <strong className="tabular">{capacity}</strong> seat(s) for{' '}
                <strong className="tabular">{candidateCount}</strong> candidates —{' '}
                <strong className="tabular">{capacity - candidateCount}</strong> spare.
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ClearSeatingButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await clearSeatingAction(examId);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Seating plan cleared.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not clear the plan', result.error);
      setOpen(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Eraser className="h-4 w-4" />
        Clear Plan
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Clear seating plan"
        confirmLabel="Clear Plan"
        loading={pending}
        message="Remove every seat allocation for this examination? The plan can be regenerated at any time."
      />
    </>
  );
}
