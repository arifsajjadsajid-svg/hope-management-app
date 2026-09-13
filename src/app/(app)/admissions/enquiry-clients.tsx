'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Trash2, PhoneCall } from 'lucide-react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  updateEnquiryAction,
  convertEnquiryAction,
  deleteEnquiryAction,
} from '@/server/actions/admissions';

export type EnquiryRow = {
  id: string;
  reference: string;
  studentName: string;
  fatherName: string;
  classApplyingFor: string;
  gender: string;
  contactPhone: string;
  whatsappNumber: string | null;
  email: string | null;
  address: string | null;
  previousSchool: string | null;
  message: string | null;
  status: string;
  officeNotes: string | null;
  createdAt: string;
  handledByName: string | null;
  studentId: string | null;
  dialNumber: string | null;
};

/** Opens the family's WhatsApp with an opening message already typed. */
export function ContactButton({ row, academyName }: { row: EnquiryRow; academyName: string }) {
  if (!row.dialNumber) return null;

  const text = `Assalam-o-Alaikum ${row.fatherName}, this is ${academyName} regarding your admission enquiry ${row.reference} for ${row.studentName}.`;

  return (
    <a
      href={`https://wa.me/${row.dialNumber}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
      className="rounded-md p-1.5 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
      title="Message this family on WhatsApp"
      aria-label="Message on WhatsApp"
    >
      <PhoneCall className="h-4 w-4" />
    </a>
  );
}

/** Status and office notes, saved together. */
export function StatusControl({ row }: { row: EnquiryRow }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState(row.status);
  const [notes, setNotes] = React.useState(row.officeNotes ?? '');
  const [pending, setPending] = React.useState(false);

  const save = async () => {
    setPending(true);
    const result = await updateEnquiryAction({ id: row.id, status, officeNotes: notes });
    setPending(false);

    if (result.ok) {
      toast.success(result.message ?? 'Enquiry updated.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not update the enquiry', result.error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-semibold text-royal-700 hover:underline"
      >
        Update
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${row.reference} — ${row.studentName}`}
        description="Record what happened after speaking to the family."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Status" htmlFor={`status-${row.id}`}>
            <Select
              id={`status-${row.id}`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={Boolean(row.studentId)}
            >
              <option value="NEW">New — not yet contacted</option>
              <option value="CONTACTED">Contacted — spoken to the family</option>
              <option value="ADMITTED">Admitted</option>
              <option value="DECLINED">Declined / not proceeding</option>
              <option value="SPAM">Spam / not genuine</option>
            </Select>
          </Field>

          {row.studentId && (
            <Alert tone="info">
              This enquiry has already been turned into a student record, so its status stays as
              admitted.
            </Alert>
          )}

          <Field
            label="Office notes"
            htmlFor={`notes-${row.id}`}
            hint="Only staff see this — the family does not."
          >
            <Textarea
              id={`notes-${row.id}`}
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Called on 14 Sept, interview arranged for Monday 9 am."
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/** Turns an enquiry into a real student record. */
export function ConvertButton({
  row,
  suggestedAdmissionNumber,
}: {
  row: EnquiryRow;
  suggestedAdmissionNumber: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [admissionNumber, setAdmissionNumber] = React.useState(suggestedAdmissionNumber);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    const result = await convertEnquiryAction({ id: row.id, admissionNumber });
    setPending(false);

    if (result.ok) {
      toast.success('Student created', result.message);
      setOpen(false);
      router.push(`/students/${result.data?.studentId}`);
    } else {
      setError(result.fieldErrors?.admissionNumber ?? result.error);
      toast.error('Could not create the student', result.error);
    }
  };

  if (row.studentId) {
    return (
      <a
        href={`/students/${row.studentId}`}
        className="text-[12.5px] font-semibold text-emerald-700 hover:underline"
      >
        View student
      </a>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Admit
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a student record"
        description={`${row.studentName} — ${row.gender === 'FEMALE' ? 'daughter' : row.gender === 'MALE' ? 'son' : 'child'} of ${row.fatherName}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending} disabled={!admissionNumber.trim()}>
              Create Student
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            The name, parent, date of birth and contact details from the enquiry are copied onto the
            new student record. You still need to enrol them in a class and section afterwards.
          </Alert>

          <Field
            label="Admission number"
            htmlFor={`adm-${row.id}`}
            required
            hint="Must be unique. The next free number is suggested."
            error={error ?? undefined}
          >
            <Input
              id={`adm-${row.id}`}
              value={admissionNumber}
              onChange={(e) => setAdmissionNumber(e.target.value)}
              className="font-mono"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function DeleteEnquiryButton({ row }: { row: EnquiryRow }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteEnquiryAction(row.id);
    setPending(false);
    setOpen(false);

    if (result.ok) {
      toast.success(result.message ?? 'Enquiry deleted.');
      router.refresh();
    } else {
      toast.error('Could not delete', result.error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
        title="Delete enquiry"
        aria-label="Delete enquiry"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Delete enquiry"
        confirmLabel="Delete"
        loading={pending}
        message={
          <>
            Delete <strong>{row.reference}</strong> from {row.fatherName}? This cannot be undone.
          </>
        }
      />
    </>
  );
}
