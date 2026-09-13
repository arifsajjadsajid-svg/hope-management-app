'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Save, Copy } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  GENDERS,
  GENDER_LABELS,
  SUBJECT_TYPES,
  SUBJECT_TYPE_LABELS,
} from '@/lib/constants';
import type { ActionResult } from '@/server/action-result';
import {
  saveSessionAction,
  deleteSessionAction,
  saveClassAction,
  deleteClassAction,
  saveSectionAction,
  deleteSectionAction,
  saveSubjectAction,
  deleteSubjectAction,
  saveTeacherAction,
  deleteTeacherAction,
  copySubjectsAction,
} from '@/server/actions/academics';

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Shared shell for the small create/edit dialogs used across the Academics
 * module: opens a modal, runs a server action, surfaces field errors and
 * refreshes the page on success.
 */
function FormDialog({
  trigger,
  title,
  description,
  action,
  children,
  size = 'md',
  submitLabel = 'Save',
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  description?: string;
  action: FormAction;
  children: (errors: Record<string, string>) => React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  submitLabel?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(action, null);
  const handled = React.useRef<ActionResult | null>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Saved.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not save', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      {trigger(() => setOpen(true))}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size={size}
      >
        <form action={formAction} className="space-y-4" noValidate>
          {state && !state.ok && (
            <Alert tone="danger" title="Could not save">
              {state.error}
            </Alert>
          )}
          {children(errors)}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save className="h-4 w-4" />}
              {submitLabel}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Small icon button used to open an edit dialog. */
function EditTrigger(open: () => void) {
  return (
    <button
      type="button"
      onClick={open}
      className="rounded-md p-1.5 text-slate-500 transition hover:bg-royal-50 hover:text-royal-700"
      aria-label="Edit"
      title="Edit"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
}

function AddTrigger(label: string) {
  return (open: () => void) => (
    <Button size="sm" onClick={open}>
      <Plus className="h-4 w-4" />
      {label}
    </Button>
  );
}

/* ------------------------------------------------------------ delete button */

export function DeleteButton({
  onDelete,
  title,
  message,
  label = 'Delete',
}: {
  onDelete: () => Promise<ActionResult>;
  title: string;
  message: React.ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await onDelete();
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Deleted.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not delete', result.error);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
        aria-label={label}
        title={label}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title={title}
        message={message}
        confirmLabel={label}
        loading={pending}
      />
    </>
  );
}

/* ---------------------------------------------------------------- sessions */

export type SessionRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isClosed: boolean;
};

export function SessionDialog({ session }: { session?: SessionRow }) {
  const action = React.useMemo(
    () => saveSessionAction.bind(null, session?.id ?? null),
    [session?.id],
  );

  return (
    <FormDialog
      trigger={session ? EditTrigger : AddTrigger('New Session')}
      title={session ? `Edit session — ${session.name}` : 'Create academic session'}
      description="Every student record, examination and result belongs to a session."
      action={action}
      submitLabel={session ? 'Save Changes' : 'Create Session'}
    >
      {(errors) => (
        <>
          <Field
            label="Session Name"
            htmlFor="name"
            required
            hint="For example 2026-2027"
            error={errors.name}
          >
            <Input id="name" name="name" defaultValue={session?.name} required placeholder="2026-2027" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start Date" htmlFor="startDate" required error={errors.startDate}>
              <Input id="startDate" name="startDate" type="date" defaultValue={session?.startDate} required />
            </Field>
            <Field label="End Date" htmlFor="endDate" required error={errors.endDate}>
              <Input id="endDate" name="endDate" type="date" defaultValue={session?.endDate} required />
            </Field>
          </div>

          <div className="space-y-2.5 rounded-lg bg-slate-50 p-3.5">
            <Checkbox
              name="isCurrent"
              defaultChecked={session?.isCurrent}
              label="Set as the current session (used as the default across the system)"
            />
            <Checkbox
              name="isClosed"
              defaultChecked={session?.isClosed}
              label="Closed — historical records stay readable but no new enrolments are made"
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function DeleteSessionButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton
      onDelete={() => deleteSessionAction(id)}
      title="Delete academic session"
      message={
        <>
          Delete <strong>{name}</strong>? This is only possible while the session holds no
          enrolments or examinations — academic history is never removed.
        </>
      }
    />
  );
}

/* ----------------------------------------------------------------- classes */

export type ClassRow = {
  id: string;
  name: string;
  sessionId: string;
  displayOrder: number;
  isActive: boolean;
};

export function ClassDialog({
  schoolClass,
  sessions,
  defaultSessionId,
}: {
  schoolClass?: ClassRow;
  sessions: { id: string; name: string }[];
  defaultSessionId?: string;
}) {
  const action = React.useMemo(
    () => saveClassAction.bind(null, schoolClass?.id ?? null),
    [schoolClass?.id],
  );

  return (
    <FormDialog
      trigger={schoolClass ? EditTrigger : AddTrigger('New Class')}
      title={schoolClass ? `Edit class — ${schoolClass.name}` : 'Create class'}
      description="Names are free-form: Grade 9, 10th, First Year, FSc, O-Level and so on."
      action={action}
      submitLabel={schoolClass ? 'Save Changes' : 'Create Class'}
    >
      {(errors) => (
        <>
          <Field label="Academic Session" htmlFor="sessionId" required error={errors.sessionId}>
            <Select
              id="sessionId"
              name="sessionId"
              defaultValue={schoolClass?.sessionId ?? defaultSessionId}
              required
            >
              <option value="">Select session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Class Name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" defaultValue={schoolClass?.name} required placeholder="Grade 9" />
          </Field>

          <Field
            label="Display Order"
            htmlFor="displayOrder"
            hint="Controls the order classes appear in lists and reports (lower first)."
            error={errors.displayOrder}
          >
            <Input
              id="displayOrder"
              name="displayOrder"
              type="number"
              min={0}
              defaultValue={schoolClass?.displayOrder ?? 0}
              className="tabular"
            />
          </Field>

          <Checkbox name="isActive" defaultChecked={schoolClass?.isActive ?? true} label="Active" />
        </>
      )}
    </FormDialog>
  );
}

export function DeleteClassButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton
      onDelete={() => deleteClassAction(id)}
      title="Delete class"
      message={
        <>
          Delete <strong>{name}</strong>? Only classes with no enrolled students and no linked
          examinations can be deleted.
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- sections */

export type SectionRow = {
  id: string;
  name: string;
  classId: string;
  maxStrength: number;
  classTeacherId: string | null;
  isActive: boolean;
};

export function SectionDialog({
  section,
  classes,
  teachers,
  defaultClassId,
}: {
  section?: SectionRow;
  classes: { id: string; name: string; sessionName: string }[];
  teachers: { id: string; fullName: string }[];
  defaultClassId?: string;
}) {
  const action = React.useMemo(
    () => saveSectionAction.bind(null, section?.id ?? null),
    [section?.id],
  );

  return (
    <FormDialog
      trigger={section ? EditTrigger : AddTrigger('New Section')}
      title={section ? `Edit section — ${section.name}` : 'Create section'}
      action={action}
      submitLabel={section ? 'Save Changes' : 'Create Section'}
    >
      {(errors) => (
        <>
          <Field label="Class" htmlFor="classId" required error={errors.classId}>
            <Select id="classId" name="classId" defaultValue={section?.classId ?? defaultClassId} required>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.sessionName}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Section Name" htmlFor="name" required error={errors.name}>
              <Input id="name" name="name" defaultValue={section?.name} required placeholder="A" />
            </Field>
            <Field label="Maximum Strength" htmlFor="maxStrength" required error={errors.maxStrength}>
              <Input
                id="maxStrength"
                name="maxStrength"
                type="number"
                min={1}
                defaultValue={section?.maxStrength ?? 40}
                required
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Class Teacher" htmlFor="classTeacherId" error={errors.classTeacherId}>
            <Select id="classTeacherId" name="classTeacherId" defaultValue={section?.classTeacherId ?? ''}>
              <option value="">Not assigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <Checkbox name="isActive" defaultChecked={section?.isActive ?? true} label="Active" />
        </>
      )}
    </FormDialog>
  );
}

export function DeleteSectionButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton
      onDelete={() => deleteSectionAction(id)}
      title="Delete section"
      message={
        <>
          Delete section <strong>{name}</strong>? Only empty sections can be deleted.
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- subjects */

export type SubjectRow = {
  id: string;
  classId: string;
  name: string;
  code: string;
  type: string;
  maxMarks: number;
  passingMarks: number;
  theoryMarks: number;
  practicalMarks: number;
  practicalPassing: number;
  teacherId: string | null;
  displayOrder: number;
  isActive: boolean;
};

export function SubjectDialog({
  subject,
  classes,
  teachers,
  defaultClassId,
}: {
  subject?: SubjectRow;
  classes: { id: string; name: string; sessionName: string }[];
  teachers: { id: string; fullName: string }[];
  defaultClassId?: string;
}) {
  const action = React.useMemo(
    () => saveSubjectAction.bind(null, subject?.id ?? null),
    [subject?.id],
  );

  // Keep theory + practical in step with the maximum as the operator types.
  const [maxMarks, setMaxMarks] = React.useState(String(subject?.maxMarks ?? 100));
  const [practical, setPractical] = React.useState(String(subject?.practicalMarks ?? 0));
  const theory = Math.max(0, (Number(maxMarks) || 0) - (Number(practical) || 0));

  return (
    <FormDialog
      trigger={subject ? EditTrigger : AddTrigger('New Subject')}
      title={subject ? `Edit subject — ${subject.name}` : 'Create subject'}
      description="Marks defined here become the defaults for every examination that includes this subject."
      action={action}
      size="lg"
      submitLabel={subject ? 'Save Changes' : 'Create Subject'}
    >
      {(errors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class" htmlFor="classId" required error={errors.classId}>
              <Select id="classId" name="classId" defaultValue={subject?.classId ?? defaultClassId} required>
                <option value="">Select class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.sessionName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject Type" htmlFor="type" required error={errors.type}>
              <Select id="type" name="type" defaultValue={subject?.type ?? 'COMPULSORY'}>
                {SUBJECT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {SUBJECT_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Subject Name" htmlFor="name" required error={errors.name} className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={subject?.name} required placeholder="Physics" />
            </Field>
            <Field label="Code" htmlFor="code" required error={errors.code}>
              <Input
                id="code"
                name="code"
                defaultValue={subject?.code}
                required
                placeholder="PHY"
                className="uppercase"
              />
            </Field>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-navy-700">
              Marks distribution
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Maximum Marks" htmlFor="maxMarks" required error={errors.maxMarks}>
                <Input
                  id="maxMarks"
                  name="maxMarks"
                  type="number"
                  min={0}
                  step="0.5"
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(e.target.value)}
                  required
                  className="tabular"
                />
              </Field>
              <Field label="Passing Marks" htmlFor="passingMarks" required error={errors.passingMarks}>
                <Input
                  id="passingMarks"
                  name="passingMarks"
                  type="number"
                  min={0}
                  step="0.5"
                  defaultValue={subject?.passingMarks ?? 33}
                  required
                  className="tabular"
                />
              </Field>
              <Field label="Practical Marks" htmlFor="practicalMarks" error={errors.practicalMarks}>
                <Input
                  id="practicalMarks"
                  name="practicalMarks"
                  type="number"
                  min={0}
                  step="0.5"
                  value={practical}
                  onChange={(e) => setPractical(e.target.value)}
                  className="tabular"
                />
              </Field>
              <Field
                label="Practical Passing"
                htmlFor="practicalPassing"
                error={errors.practicalPassing}
              >
                <Input
                  id="practicalPassing"
                  name="practicalPassing"
                  type="number"
                  min={0}
                  step="0.5"
                  defaultValue={subject?.practicalPassing ?? 0}
                  className="tabular"
                />
              </Field>
            </div>
            <input type="hidden" name="theoryMarks" value={theory} />
            <p className="mt-2.5 text-[12px] text-slate-600">
              Theory marks are calculated automatically:{' '}
              <strong className="tabular text-navy-900">{theory}</strong> (maximum −
              practical).
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject Teacher" htmlFor="teacherId" error={errors.teacherId}>
              <Select id="teacherId" name="teacherId" defaultValue={subject?.teacherId ?? ''}>
                <option value="">Not assigned</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Display Order" htmlFor="displayOrder" error={errors.displayOrder}>
              <Input
                id="displayOrder"
                name="displayOrder"
                type="number"
                min={0}
                defaultValue={subject?.displayOrder ?? 0}
                className="tabular"
              />
            </Field>
          </div>

          <Checkbox name="isActive" defaultChecked={subject?.isActive ?? true} label="Active" />
        </>
      )}
    </FormDialog>
  );
}

export function DeleteSubjectButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton
      onDelete={() => deleteSubjectAction(id)}
      title="Delete subject"
      message={
        <>
          Delete <strong>{name}</strong>? Subjects already used in an examination cannot be deleted.
        </>
      }
    />
  );
}

/** Copies an entire subject list from one class to another. */
export function CopySubjectsDialog({
  classes,
}: {
  classes: { id: string; name: string; sessionName: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await copySubjectsAction(from, to);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Subjects copied.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not copy subjects', result.error);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="h-4 w-4" />
        Copy Subjects
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Copy subjects between classes"
        description="Subjects already present in the target class are skipped."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending} disabled={!from || !to || from === to}>
              Copy Subjects
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Copy from" htmlFor="copy-from" required>
            <Select id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Select source class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.sessionName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Copy to" htmlFor="copy-to" required>
            <Select id="copy-to" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Select target class…</option>
              {classes
                .filter((c) => c.id !== from)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.sessionName}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------- teachers */

export type TeacherRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  fatherName: string | null;
  cnic: string | null;
  gender: string | null;
  designation: string | null;
  qualification: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  joiningDate: string;
  isActive: boolean;
};

export function TeacherDialog({ teacher }: { teacher?: TeacherRow }) {
  const action = React.useMemo(
    () => saveTeacherAction.bind(null, teacher?.id ?? null),
    [teacher?.id],
  );

  return (
    <FormDialog
      trigger={teacher ? EditTrigger : AddTrigger('New Teacher')}
      title={teacher ? `Edit teacher — ${teacher.fullName}` : 'Add teacher'}
      action={action}
      size="lg"
      submitLabel={teacher ? 'Save Changes' : 'Add Teacher'}
    >
      {(errors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee Code" htmlFor="employeeCode" required error={errors.employeeCode}>
              <Input
                id="employeeCode"
                name="employeeCode"
                defaultValue={teacher?.employeeCode}
                required
                placeholder="HSA-T-010"
                className="tabular"
              />
            </Field>
            <Field label="Full Name" htmlFor="fullName" required error={errors.fullName}>
              <Input id="fullName" name="fullName" defaultValue={teacher?.fullName} required />
            </Field>
            <Field label="Father Name" htmlFor="fatherName" error={errors.fatherName}>
              <Input id="fatherName" name="fatherName" defaultValue={teacher?.fatherName ?? ''} />
            </Field>
            <Field label="CNIC" htmlFor="cnic" error={errors.cnic}>
              <Input id="cnic" name="cnic" defaultValue={teacher?.cnic ?? ''} className="tabular" />
            </Field>
            <Field label="Gender" htmlFor="gender" error={errors.gender}>
              <Select id="gender" name="gender" defaultValue={teacher?.gender ?? ''}>
                <option value="">Not specified</option>
                {GENDERS.map((value) => (
                  <option key={value} value={value}>
                    {GENDER_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Designation" htmlFor="designation" error={errors.designation}>
              <Input
                id="designation"
                name="designation"
                defaultValue={teacher?.designation ?? ''}
                placeholder="Senior Instructor"
              />
            </Field>
            <Field label="Qualification" htmlFor="qualification" error={errors.qualification}>
              <Input
                id="qualification"
                name="qualification"
                defaultValue={teacher?.qualification ?? ''}
                placeholder="M.Sc Physics"
              />
            </Field>
            <Field label="Joining Date" htmlFor="joiningDate" error={errors.joiningDate}>
              <Input
                id="joiningDate"
                name="joiningDate"
                type="date"
                defaultValue={teacher?.joiningDate ?? ''}
              />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" name="phone" defaultValue={teacher?.phone ?? ''} className="tabular" />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" name="email" type="email" defaultValue={teacher?.email ?? ''} />
            </Field>
          </div>

          <Field label="Address" htmlFor="address" error={errors.address}>
            <Textarea id="address" name="address" defaultValue={teacher?.address ?? ''} rows={2} />
          </Field>

          <Checkbox name="isActive" defaultChecked={teacher?.isActive ?? true} label="Currently on staff" />
        </>
      )}
    </FormDialog>
  );
}

export function DeleteTeacherButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton
      onDelete={() => deleteTeacherAction(id)}
      title="Delete teacher"
      message={
        <>
          Delete <strong>{name}</strong>? Teachers linked to subjects, sections or invigilation duty
          cannot be deleted — mark them inactive instead.
        </>
      }
    />
  );
}
