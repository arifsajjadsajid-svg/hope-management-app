'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Save, Wand2, ListPlus } from 'lucide-react';
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  saveDateSheetEntryAction,
  deleteDateSheetEntryAction,
  autoBuildDateSheetAction,
  addMissingExamSubjectsAction,
} from '@/server/actions/exams';

export type DateSheetSubjectOption = {
  examSubjectId: string;
  label: string;
  classId: string;
  className: string;
};

export type DateSheetEntryValues = {
  id: string;
  examSubjectId: string;
  classId: string;
  sectionId: string;
  paperDate: string;
  startTime: string;
  endTime: string;
  roomId: string;
  instructions: string;
};

export function DateSheetEntryDialog({
  examId,
  entry,
  subjects,
  sections,
  rooms,
  disabled,
}: {
  examId: string;
  entry?: DateSheetEntryValues;
  subjects: DateSheetSubjectOption[];
  sections: { id: string; name: string; classId: string }[];
  rooms: { id: string; name: string; roomNumber: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const action = React.useMemo(
    () => saveDateSheetEntryAction.bind(null, entry?.id ?? null),
    [entry?.id],
  );
  const [state, formAction, pending] = useActionState(action, null);
  const handled = React.useRef<unknown>(null);

  const [examSubjectId, setExamSubjectId] = React.useState(entry?.examSubjectId ?? '');
  const selected = subjects.find((s) => s.examSubjectId === examSubjectId);
  const classId = selected?.classId ?? entry?.classId ?? '';

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Saved.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not save the paper', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      {entry ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="rounded-md p-1.5 text-slate-500 transition hover:bg-royal-50 hover:text-royal-700 disabled:opacity-40"
          aria-label="Edit paper"
          title="Edit paper"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
          <Plus className="h-4 w-4" />
          Add Paper
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={entry ? 'Edit paper' : 'Add paper to the date sheet'}
        size="md"
      >
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="classId" value={classId} />

          {state && !state.ok && (
            <Alert tone="danger" title="Could not save">
              {state.error}
            </Alert>
          )}

          <Field label="Subject" htmlFor="examSubjectId" required error={errors.examSubjectId}>
            <Select
              id="examSubjectId"
              name="examSubjectId"
              value={examSubjectId}
              onChange={(e) => setExamSubjectId(e.target.value)}
              required
            >
              <option value="">Select subject…</option>
              {subjects.map((subject) => (
                <option key={subject.examSubjectId} value={subject.examSubjectId}>
                  {subject.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Section"
            htmlFor="sectionId"
            hint="Leave blank when the paper applies to every section of the class."
            error={errors.sectionId}
          >
            <Select id="sectionId" name="sectionId" defaultValue={entry?.sectionId ?? ''}>
              <option value="">All sections</option>
              {sections
                .filter((s) => !classId || s.classId === classId)
                .map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Paper Date" htmlFor="paperDate" required error={errors.paperDate}>
              <Input
                id="paperDate"
                name="paperDate"
                type="date"
                defaultValue={entry?.paperDate}
                required
              />
            </Field>
            <Field label="Start Time" htmlFor="startTime" required error={errors.startTime}>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={entry?.startTime ?? '09:00'}
                required
                className="tabular"
              />
            </Field>
            <Field label="End Time" htmlFor="endTime" required error={errors.endTime}>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                defaultValue={entry?.endTime ?? '12:00'}
                required
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Room" htmlFor="roomId" error={errors.roomId}>
            <Select id="roomId" name="roomId" defaultValue={entry?.roomId ?? ''}>
              <option value="">Not specified</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} ({room.roomNumber})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Instructions" htmlFor="instructions" error={errors.instructions}>
            <Textarea
              id="instructions"
              name="instructions"
              defaultValue={entry?.instructions ?? ''}
              rows={2}
              placeholder="Candidates must be seated 15 minutes before the paper begins."
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save className="h-4 w-4" />}
              Save Paper
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteDateSheetEntryButton({
  entryId,
  label,
  disabled,
}: {
  entryId: string;
  label: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteDateSheetEntryAction(entryId);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Removed.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not remove the paper', result.error);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
        aria-label="Remove paper"
        title="Remove paper"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Remove paper"
        confirmLabel="Remove Paper"
        loading={pending}
        message={
          <>
            Remove <strong>{label}</strong> from the date sheet? Papers with recorded attendance
            cannot be removed.
          </>
        }
      />
    </>
  );
}

/** One paper per working day, generated across the whole examination. */
export function AutoBuildDateSheetButton({
  examId,
  defaultStart,
  disabled,
}: {
  examId: string;
  defaultStart: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [startDate, setStartDate] = React.useState(defaultStart);
  const [startTime, setStartTime] = React.useState('09:00');
  const [duration, setDuration] = React.useState('180');
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await autoBuildDateSheetAction(
      examId,
      startDate,
      startTime,
      Number(duration) || 180,
    );
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Date sheet generated.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not generate the date sheet', result.error);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Wand2 className="h-4 w-4" />
        Auto-build
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Auto-build the date sheet"
        description="Schedules one paper per working day for every subject, skipping Sundays. Papers already scheduled are left untouched."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending} disabled={!startDate}>
              Generate Date Sheet
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First paper date" htmlFor="auto-start" required>
            <Input
              id="auto-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Start time" htmlFor="auto-time" required>
            <Input
              id="auto-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="Duration (minutes)" htmlFor="auto-duration" required>
            <Input
              id="auto-duration"
              type="number"
              min={30}
              max={360}
              step={15}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="tabular"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/** Pulls in subjects added to the examination's classes after it was created. */
export function AddMissingSubjectsButton({ examId, count }: { examId: string; count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await addMissingExamSubjectsAction(examId);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Subjects added.');
      router.refresh();
    } else {
      toast.error('Could not add the subjects', result.error);
    }
  };

  return (
    <Button size="sm" onClick={run} loading={pending}>
      <ListPlus className="h-4 w-4" />
      Add {count} missing subject{count === 1 ? '' : 's'}
    </Button>
  );
}
