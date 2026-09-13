'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Archive, RotateCcw } from 'lucide-react';
import { Button, Field, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { archiveStudentAction } from '@/server/actions/students';
import { STUDENT_STATUS, STUDENT_STATUS_LABELS } from '@/lib/constants';

/**
 * Archive / restore control on the student profile. Archiving never deletes a
 * record — the academic history stays intact, the student is simply removed
 * from active rolls.
 */
export function StudentArchiveButton({
  studentId,
  studentName,
  currentStatus,
}: {
  studentId: string;
  studentName: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState(currentStatus === 'ACTIVE' ? 'WITHDRAWN' : 'ACTIVE');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const isActive = currentStatus === 'ACTIVE';

  const submit = async () => {
    setPending(true);
    const result = await archiveStudentAction(studentId, status, reason.trim() || undefined);
    setPending(false);

    if (result.ok) {
      toast.success(result.message ?? 'Status updated.');
      setOpen(false);
      setReason('');
      router.refresh();
    } else {
      toast.error('Could not update status', result.error);
    }
  };

  return (
    <>
      <Button variant={isActive ? 'outline' : 'secondary'} size="sm" onClick={() => setOpen(true)}>
        {isActive ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
        {isActive ? 'Archive' : 'Restore'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isActive ? 'Archive student' : 'Change student status'}
        description={studentName}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} variant={isActive ? 'danger' : 'primary'}>
              Update status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-slate-600">
            The student record and all past results are preserved. Only the status changes, which
            removes the student from active class rolls and future examinations.
          </p>

          <Field label="New status" htmlFor="archive-status" required>
            <Select id="archive-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STUDENT_STATUS.map((value) => (
                <option key={value} value={value}>
                  {STUDENT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Reason"
            htmlFor="archive-reason"
            hint="Appended to the student's notes and recorded in the audit log."
          >
            <Textarea
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Family relocated to Islamabad — school leaving certificate issued."
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
