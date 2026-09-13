'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Save } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { saveRoomAction, deleteRoomAction } from '@/server/actions/exams';

export type RoomValues = {
  id: string;
  name: string;
  roomNumber: string;
  building: string;
  capacity: number;
  rowCount: number;
  colCount: number;
  isActive: boolean;
};

export function RoomDialog({ room }: { room?: RoomValues }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const action = React.useMemo(() => saveRoomAction.bind(null, room?.id ?? null), [room?.id]);
  const [state, formAction, pending] = useActionState(action, null);
  const handled = React.useRef<unknown>(null);

  const [rows, setRows] = React.useState(String(room?.rowCount ?? 6));
  const [cols, setCols] = React.useState(String(room?.colCount ?? 5));
  const gridSeats = (Number(rows) || 0) * (Number(cols) || 0);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Room saved.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not save the room', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      {room ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-slate-500 transition hover:bg-royal-50 hover:text-royal-700"
          aria-label="Edit room"
          title="Edit room"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New Room
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={room ? `Edit room — ${room.name}` : 'Create examination room'}
        description="Rows and columns define the seat grid used by the seating plan."
        size="md"
      >
        <form action={formAction} className="space-y-4" noValidate>
          {state && !state.ok && (
            <Alert tone="danger" title="Could not save">
              {state.error}
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room Name" htmlFor="name" required error={errors.name}>
              <Input
                id="name"
                name="name"
                defaultValue={room?.name}
                required
                placeholder="Examination Hall A"
              />
            </Field>
            <Field label="Room Number" htmlFor="roomNumber" required error={errors.roomNumber}>
              <Input
                id="roomNumber"
                name="roomNumber"
                defaultValue={room?.roomNumber}
                required
                placeholder="HALL-A"
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Building / Block" htmlFor="building" error={errors.building}>
            <Input
              id="building"
              name="building"
              defaultValue={room?.building}
              placeholder="Main Block"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Rows" htmlFor="rowCount" required error={errors.rowCount}>
              <Input
                id="rowCount"
                name="rowCount"
                type="number"
                min={1}
                max={60}
                value={rows}
                onChange={(e) => setRows(e.target.value)}
                required
                className="tabular"
              />
            </Field>
            <Field label="Columns" htmlFor="colCount" required error={errors.colCount}>
              <Input
                id="colCount"
                name="colCount"
                type="number"
                min={1}
                max={60}
                value={cols}
                onChange={(e) => setCols(e.target.value)}
                required
                className="tabular"
              />
            </Field>
            <Field
              label="Capacity"
              htmlFor="capacity"
              required
              hint={`Grid holds ${gridSeats} seats`}
              error={errors.capacity}
            >
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                defaultValue={room?.capacity ?? 30}
                required
                className="tabular"
              />
            </Field>
          </div>

          <Checkbox name="isActive" defaultChecked={room?.isActive ?? true} label="Available for examinations" />

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save className="h-4 w-4" />}
              Save Room
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteRoomButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteRoomAction(id);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Room deleted.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not delete the room', result.error);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
        aria-label="Delete room"
        title="Delete room"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Delete examination room"
        confirmLabel="Delete Room"
        loading={pending}
        message={
          <>
            Delete <strong>{name}</strong>? Rooms used by a seating plan, date sheet or duty roster
            cannot be deleted.
          </>
        }
      />
    </>
  );
}
