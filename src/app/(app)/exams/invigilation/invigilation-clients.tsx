'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Wand2 } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Select } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  saveInvigilationAction,
  deleteInvigilationAction,
  autoAssignInvigilationAction,
} from '@/server/actions/exams';

export type PaperOption = { id: string; label: string };
export type SimpleOption = { id: string; label: string };

export function AssignDutyDialog({
  examId,
  papers,
  rooms,
  teachers,
  disabled,
}: {
  examId: string;
  papers: PaperOption[];
  rooms: SimpleOption[];
  teachers: SimpleOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(saveInvigilationAction, null);
  const handled = React.useRef<unknown>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Duty assigned.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not assign duty', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="h-4 w-4" />
        Assign Duty
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Assign invigilation duty"
        description="A teacher cannot be assigned to two rooms in the same time slot."
        size="md"
      >
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="examId" value={examId} />

          {state && !state.ok && (
            <Alert tone="danger" title="Could not assign">
              {state.error}
            </Alert>
          )}

          <Field label="Paper" htmlFor="dateSheetEntryId" required error={errors.dateSheetEntryId}>
            <Select id="dateSheetEntryId" name="dateSheetEntryId" required>
              <option value="">Select paper…</option>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room" htmlFor="roomId" required error={errors.roomId}>
              <Select id="roomId" name="roomId" required>
                <option value="">Select room…</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Duty Role" htmlFor="dutyRole" required error={errors.dutyRole}>
              <Select id="dutyRole" name="dutyRole" defaultValue="INVIGILATOR">
                <option value="INVIGILATOR">Invigilator</option>
                <option value="SUPERINTENDENT">Superintendent</option>
                <option value="RELIEVER">Reliever</option>
              </Select>
            </Field>
          </div>

          <Field label="Teacher" htmlFor="teacherId" required error={errors.teacherId}>
            <Select id="teacherId" name="teacherId" required>
              <option value="">Select teacher…</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save className="h-4 w-4" />}
              Assign Duty
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteDutyButton({ dutyId, label }: { dutyId: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteInvigilationAction(dutyId);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Duty removed.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not remove duty', result.error);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
        aria-label="Remove duty"
        title="Remove duty"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Remove invigilation duty"
        confirmLabel="Remove Duty"
        loading={pending}
        message={<>Remove <strong>{label}</strong> from the duty roster?</>}
      />
    </>
  );
}

export function AutoAssignDutyDialog({
  examId,
  rooms,
  disabled,
}: {
  examId: string;
  rooms: SimpleOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>(rooms.map((r) => r.id));
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await autoAssignInvigilationAction(examId, selected);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Duties assigned.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not assign duties', result.error);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Wand2 className="h-4 w-4" />
        Auto-assign
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Auto-assign invigilation duty"
        description="Distributes duty evenly across active teachers — one superintendent and one invigilator per room, per paper — without double-booking anybody."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending} disabled={selected.length === 0}>
              Assign Duties
            </Button>
          </>
        }
      >
        <div>
          <p className="field-label">Rooms in use</p>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {rooms.map((room) => (
              <Checkbox
                key={room.id}
                checked={selected.includes(room.id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked ? [...prev, room.id] : prev.filter((id) => id !== room.id),
                  )
                }
                label={room.label}
              />
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
