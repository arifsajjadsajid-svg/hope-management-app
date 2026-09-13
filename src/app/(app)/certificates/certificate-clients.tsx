'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Wand2 } from 'lucide-react';
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
import { CERTIFICATE_TYPES, CERTIFICATE_TYPE_LABELS } from '@/lib/constants';
import {
  issueCertificateAction,
  deleteCertificateAction,
  autoIssueCertificatesAction,
} from '@/server/actions/certificates';

export type StudentOption = { id: string; label: string };
export type ExamOption = { id: string; name: string };

export function IssueCertificateDialog({
  students,
  exams,
  defaultExamId,
  today,
}: {
  students: StudentOption[];
  exams: ExamOption[];
  defaultExamId?: string;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(issueCertificateAction, null);
  const handled = React.useRef<unknown>(null);
  const [type, setType] = React.useState<string>('ACADEMIC_EXCELLENCE');

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Certificate issued.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not issue certificate', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Issue Certificate
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Issue a certificate"
        description="Every certificate carries a unique verification code and QR code."
        size="md"
      >
        <form action={formAction} className="space-y-4" noValidate>
          {state && !state.ok && (
            <Alert tone="danger" title="Could not issue">
              {state.error}
            </Alert>
          )}

          <Field label="Student" htmlFor="studentId" required error={errors.studentId}>
            <Select id="studentId" name="studentId" required>
              <option value="">Select student…</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Certificate Type" htmlFor="type" required error={errors.type}>
              <Select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
              >
                {CERTIFICATE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {CERTIFICATE_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Examination" htmlFor="examId" error={errors.examId}>
              <Select id="examId" name="examId" defaultValue={defaultExamId ?? ''}>
                <option value="">Not linked to an examination</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Certificate Title" htmlFor="title" required error={errors.title}>
            <Input
              id="title"
              name="title"
              key={type}
              defaultValue={CERTIFICATE_TYPE_LABELS[type] ?? ''}
              required
            />
          </Field>

          <Field
            label="Award Description"
            htmlFor="description"
            hint="Printed in the body of the certificate."
            error={errors.description}
          >
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="In recognition of outstanding academic achievement throughout the session."
            />
          </Field>

          <Field label="Issue Date" htmlFor="issuedDate" required error={errors.issuedDate}>
            <Input id="issuedDate" name="issuedDate" type="date" defaultValue={today} required />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save className="h-4 w-4" />}
              Issue Certificate
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AutoIssueDialog({
  exams,
  defaultExamId,
}: {
  exams: ExamOption[];
  defaultExamId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [examId, setExamId] = React.useState(defaultExamId ?? '');
  const [positions, setPositions] = React.useState(true);
  const [subjectToppers, setSubjectToppers] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await autoIssueCertificatesAction(examId, { positions, subjectToppers });
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Certificates issued.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not issue certificates', result.error);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Wand2 className="h-4 w-4" />
        Auto-issue
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Auto-issue certificates"
        description="Generates position and subject topper certificates from the processed result."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={run}
              loading={pending}
              disabled={!examId || (!positions && !subjectToppers)}
            >
              Issue Certificates
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Examination" htmlFor="auto-exam" required>
            <Select id="auto-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">Select examination…</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-2.5 rounded-lg bg-slate-50 p-3.5">
            <Checkbox
              checked={positions}
              onChange={(e) => setPositions(e.target.checked)}
              label="First, second and third position in every class (ties included)"
            />
            <Checkbox
              checked={subjectToppers}
              onChange={(e) => setSubjectToppers(e.target.checked)}
              label="Subject topper for every subject of every class"
            />
          </div>

          <p className="text-[12.5px] text-slate-500">
            Certificates that already exist for the same student, examination and award are skipped,
            so this is safe to run more than once.
          </p>
        </div>
      </Modal>
    </>
  );
}

export function RevokeCertificateButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteCertificateAction(id);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Certificate revoked.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not revoke', result.error);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
        aria-label="Revoke certificate"
        title="Revoke certificate"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Revoke certificate"
        confirmLabel="Revoke"
        loading={pending}
        message={
          <>
            Revoke <strong>{title}</strong>? Its verification code will stop validating, and the
            action is recorded in the audit log.
          </>
        }
      />
    </>
  );
}
