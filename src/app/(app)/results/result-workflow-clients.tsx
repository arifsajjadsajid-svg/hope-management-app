'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Calculator,
  Send,
  BadgeCheck,
  Upload,
  Undo2,
  Lock,
  Unlock,
} from 'lucide-react';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  processResultsAction,
  submitForApprovalAction,
  approveResultsAction,
  publishResultsAction,
  unpublishResultsAction,
  lockResultsAction,
  unlockResultsAction,
} from '@/server/actions/results';

/** Shared handler: run an action, toast the outcome, refresh the page. */
function useRunner() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (
      fn: () => Promise<{ ok: boolean; message?: string; error?: string }>,
      onSuccess?: () => void,
    ) => {
      setPending(true);
      const result = await fn();
      setPending(false);
      if (result.ok) {
        toast.success(result.message ?? 'Done.');
        onSuccess?.();
        router.refresh();
        return true;
      }
      toast.error('Action failed', result.error ?? 'Please try again.');
      return false;
    },
    [router, toast],
  );

  return { run, pending };
}

/* -------------------------------------------------------------- processing */

export function ProcessResultsButton({
  examId,
  hasExisting,
  disabled,
  criticalIssues,
}: {
  examId: string;
  hasExisting: boolean;
  disabled?: boolean;
  criticalIssues: number;
}) {
  const { run, pending } = useRunner();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Calculator className="h-4 w-4" />
        {hasExisting ? 'Reprocess Results' : 'Process Results'}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => run(() => processResultsAction(examId), () => setOpen(false))}
        title={hasExisting ? 'Reprocess results' : 'Process results'}
        confirmLabel={hasExisting ? 'Reprocess' : 'Process Results'}
        tone="primary"
        loading={pending}
        message={
          <>
            The engine recalculates every subject total, percentage, grade, GPA, pass/fail status
            and class, section and subject position from the marks currently recorded.
            {hasExisting && (
              <span className="mt-2 block">
                Existing results are replaced. Verification codes already printed on report cards
                are preserved.
              </span>
            )}
            {criticalIssues > 0 && (
              <span className="mt-2 block font-semibold text-rose-700">
                {criticalIssues} critical marks issue(s) are outstanding — processing will be
                rejected until they are corrected.
              </span>
            )}
          </>
        }
      />
    </>
  );
}

/* --------------------------------------------------------------- approval */

export function SubmitForApprovalButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const { run, pending } = useRunner();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Send className="h-4 w-4" />
        Submit for Approval
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => run(() => submitForApprovalAction(examId), () => setOpen(false))}
        title="Submit for approval"
        confirmLabel="Submit"
        tone="primary"
        loading={pending}
        message="Send this result to the Principal / Director for approval. Marks stay editable until the result is locked."
      />
    </>
  );
}

export function ApproveResultsButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const { run, pending } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <BadgeCheck className="h-4 w-4" />
        Approve Result
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Approve examination result"
        description="Approval is recorded against your name and is required before publication."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                run(() => approveResultsAction(examId, reason.trim() || undefined), () => {
                  setOpen(false);
                  setReason('');
                })
              }
              loading={pending}
            >
              Approve Result
            </Button>
          </>
        }
      >
        <Field label="Approval note" htmlFor="approve-reason" hint="Optional — stored in the workflow trail.">
          <Textarea
            id="approve-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Checked against the marks sheets and verification report."
          />
        </Field>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------ publication */

export function PublishResultsButton({
  examId,
  count,
  disabled,
  approved,
}: {
  examId: string;
  count: number;
  disabled?: boolean;
  approved: boolean;
}) {
  const { run, pending } = useRunner();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="gold" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Upload className="h-4 w-4" />
        Publish Result
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => run(() => publishResultsAction(examId), () => setOpen(false))}
        title="Publish examination result"
        confirmLabel="Publish Now"
        tone="primary"
        loading={pending}
        requirePhrase="PUBLISH"
        message={
          <>
            Publishing makes <strong>{count}</strong> result(s) visible to students and parents on
            the portal and the public result page, and sends an announcement to every account.
            {!approved && (
              <span className="mt-2 block font-semibold text-rose-700">
                This result has not been approved yet — publication will be rejected.
              </span>
            )}
          </>
        }
      />
    </>
  );
}

export function UnpublishResultsButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const { run, pending } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Undo2 className="h-4 w-4" />
        Withdraw
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Withdraw the published result"
        description="Students and parents will no longer see this result."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 5}
              loading={pending}
              onClick={() =>
                run(() => unpublishResultsAction(examId, reason), () => {
                  setOpen(false);
                  setReason('');
                })
              }
            >
              Withdraw Result
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">
            Withdrawing a published result is recorded in the audit log with your name and the
            reason you give.
          </Alert>
          <Field label="Reason" htmlFor="unpublish-reason" required>
            <Textarea
              id="unpublish-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Marks correction required in Physics for Grade 10."
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* ----------------------------------------------------------------- locking */

export function LockResultsButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const { run, pending } = useRunner();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Lock className="h-4 w-4" />
        Lock Result
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => run(() => lockResultsAction(examId), () => setOpen(false))}
        title="Lock examination result"
        confirmLabel="Lock Result"
        tone="primary"
        loading={pending}
        message="Once locked, teachers and the Examination Controller can no longer change marks, the date sheet, roll numbers or the seating plan for this examination. Only a Super Admin can unlock it, and only with a written reason."
      />
    </>
  );
}

/**
 * Unlocking demands a written reason and the operator's own password; both are
 * recorded permanently in the audit log.
 */
export function UnlockResultsButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = async () => {
    setPending(true);
    setErrors({});
    const result = await unlockResultsAction(examId, reason, password);
    setPending(false);

    if (result.ok) {
      toast.success(result.message ?? 'Result unlocked.');
      setOpen(false);
      setReason('');
      setPassword('');
      router.refresh();
    } else {
      setErrors(result.fieldErrors ?? {});
      toast.error('Could not unlock', result.error);
    }
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Unlock className="h-4 w-4" />
        Unlock Result
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Unlock examination result"
        description="This is the most sensitive action in the system."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={submit}
              loading={pending}
              disabled={reason.trim().length < 10 || password.length === 0}
            >
              Unlock Result
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="danger" title="Everything after this point is audited">
            Unlocking allows marks and results that have already been published to be changed. Your
            name, the time, and the reason below are written permanently to the audit log.
          </Alert>

          <Field
            label="Reason for unlocking"
            htmlFor="unlock-reason"
            required
            hint="At least 10 characters."
            error={errors.reason}
          >
            <Textarea
              id="unlock-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Board notification requires the Chemistry practical marks of Grade 10 to be revised."
            />
          </Field>

          <Field
            label="Confirm with your password"
            htmlFor="unlock-password"
            required
            error={errors.password}
          >
            <Input
              id="unlock-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
