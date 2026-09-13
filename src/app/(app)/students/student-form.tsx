'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, X } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  GENDERS,
  GENDER_LABELS,
  STUDENT_STATUS,
  STUDENT_STATUS_LABELS,
} from '@/lib/constants';
import type { ActionResult } from '@/server/action-result';

export type FormSession = { id: string; name: string };
export type FormClass = { id: string; name: string; sessionId: string };
export type FormSection = { id: string; name: string; classId: string };

export type StudentFormValues = {
  admissionNumber: string;
  registrationNo: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  guardianName: string;
  dateOfBirth: string;
  gender: string;
  bformCnic: string;
  admissionDate: string;
  parentPhone: string;
  studentPhone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  previousSchool: string;
  emergencyContact: string;
  notes: string;
  status: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  classRollNumber: string;
};

export function StudentForm({
  action,
  defaults,
  sessions,
  classes,
  sections,
  submitLabel,
  cancelHref,
}: {
  action: (
    prev: ActionResult<{ id: string }> | null,
    formData: FormData,
  ) => Promise<ActionResult<{ id: string }>>;
  defaults: StudentFormValues;
  sessions: FormSession[];
  classes: FormClass[];
  sections: FormSection[];
  submitLabel: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, null);

  const [sessionId, setSessionId] = React.useState(defaults.sessionId);
  const [classId, setClassId] = React.useState(defaults.classId);
  const [sectionId, setSectionId] = React.useState(defaults.sectionId);

  const visibleClasses = React.useMemo(
    () => classes.filter((c) => c.sessionId === sessionId),
    [classes, sessionId],
  );
  const visibleSections = React.useMemo(
    () => sections.filter((s) => s.classId === classId),
    [sections, classId],
  );

  // Keep the cascade consistent when a parent selection changes.
  React.useEffect(() => {
    if (classId && !visibleClasses.some((c) => c.id === classId)) {
      setClassId('');
      setSectionId('');
    }
  }, [classId, visibleClasses]);

  React.useEffect(() => {
    if (sectionId && !visibleSections.some((s) => s.id === sectionId)) setSectionId('');
  }, [sectionId, visibleSections]);

  React.useEffect(() => {
    if (state?.ok && state.data?.id) {
      toast.success(state.message ?? 'Saved.');
      router.push(`/students/${state.data.id}`);
      router.refresh();
    } else if (state && !state.ok) {
      toast.error('Could not save', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && !state.ok && (
        <Alert tone="danger" title="The record could not be saved">
          {state.error}
        </Alert>
      )}

      {/* ------------------------------------------------ personal details */}
      <Card>
        <CardHeader
          title="Student details"
          description="Identity information printed on roll number slips, report cards and certificates."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Admission Number" htmlFor="admissionNumber" required error={errors.admissionNumber}>
            <Input
              id="admissionNumber"
              name="admissionNumber"
              defaultValue={defaults.admissionNumber}
              required
              className="tabular"
            />
          </Field>
          <Field label="Registration Number" htmlFor="registrationNo" error={errors.registrationNo}>
            <Input
              id="registrationNo"
              name="registrationNo"
              defaultValue={defaults.registrationNo}
              className="tabular"
            />
          </Field>
          <Field label="Status" htmlFor="status" required error={errors.status}>
            <Select id="status" name="status" defaultValue={defaults.status}>
              {STUDENT_STATUS.map((value) => (
                <option key={value} value={value}>
                  {STUDENT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Student Name" htmlFor="fullName" required error={errors.fullName}>
            <Input id="fullName" name="fullName" defaultValue={defaults.fullName} required />
          </Field>
          <Field label="Father Name" htmlFor="fatherName" required error={errors.fatherName}>
            <Input id="fatherName" name="fatherName" defaultValue={defaults.fatherName} required />
          </Field>
          <Field label="Mother Name" htmlFor="motherName" error={errors.motherName}>
            <Input id="motherName" name="motherName" defaultValue={defaults.motherName} />
          </Field>

          <Field label="Guardian Name" htmlFor="guardianName" error={errors.guardianName}>
            <Input id="guardianName" name="guardianName" defaultValue={defaults.guardianName} />
          </Field>
          <Field label="Date of Birth" htmlFor="dateOfBirth" error={errors.dateOfBirth}>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={defaults.dateOfBirth} />
          </Field>
          <Field label="Gender" htmlFor="gender" required error={errors.gender}>
            <Select id="gender" name="gender" defaultValue={defaults.gender}>
              {GENDERS.map((value) => (
                <option key={value} value={value}>
                  {GENDER_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="B-Form / CNIC"
            htmlFor="bformCnic"
            hint="Format: 35202-1234567-1"
            error={errors.bformCnic}
          >
            <Input id="bformCnic" name="bformCnic" defaultValue={defaults.bformCnic} className="tabular" />
          </Field>
          <Field label="Admission Date" htmlFor="admissionDate" error={errors.admissionDate}>
            <Input
              id="admissionDate"
              name="admissionDate"
              type="date"
              defaultValue={defaults.admissionDate}
            />
          </Field>
          <Field label="Previous School" htmlFor="previousSchool" error={errors.previousSchool}>
            <Input id="previousSchool" name="previousSchool" defaultValue={defaults.previousSchool} />
          </Field>
        </CardBody>
      </Card>

      {/* --------------------------------------------------------- placement */}
      <Card>
        <CardHeader
          title="Class placement"
          description="The academic session, class and section this student belongs to."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Academic Session" htmlFor="sessionId" required error={errors.sessionId}>
            <Select
              id="sessionId"
              name="sessionId"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
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

          <Field label="Class" htmlFor="classId" required error={errors.classId}>
            <Select
              id="classId"
              name="classId"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId('');
              }}
              required
              disabled={!sessionId}
            >
              <option value="">{sessionId ? 'Select class…' : 'Select a session first'}</option>
              {visibleClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Section" htmlFor="sectionId" required error={errors.sectionId}>
            <Select
              id="sectionId"
              name="sectionId"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              required
              disabled={!classId}
            >
              <option value="">{classId ? 'Select section…' : 'Select a class first'}</option>
              {visibleSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Class Roll Number"
            htmlFor="classRollNumber"
            hint="Distinct from the examination roll number"
            error={errors.classRollNumber}
          >
            <Input
              id="classRollNumber"
              name="classRollNumber"
              defaultValue={defaults.classRollNumber}
              className="tabular"
            />
          </Field>
        </CardBody>
      </Card>

      {/* ----------------------------------------------------------- contact */}
      <Card>
        <CardHeader title="Contact & address" description="Used for notifications and correspondence." />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Parent Phone" htmlFor="parentPhone" error={errors.parentPhone}>
            <Input id="parentPhone" name="parentPhone" defaultValue={defaults.parentPhone} className="tabular" />
          </Field>
          <Field label="Student Phone" htmlFor="studentPhone" error={errors.studentPhone}>
            <Input id="studentPhone" name="studentPhone" defaultValue={defaults.studentPhone} className="tabular" />
          </Field>
          <Field label="WhatsApp Number" htmlFor="whatsappNumber" error={errors.whatsappNumber}>
            <Input
              id="whatsappNumber"
              name="whatsappNumber"
              defaultValue={defaults.whatsappNumber}
              className="tabular"
            />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" defaultValue={defaults.email} />
          </Field>
          <Field label="Emergency Contact" htmlFor="emergencyContact" error={errors.emergencyContact}>
            <Input
              id="emergencyContact"
              name="emergencyContact"
              defaultValue={defaults.emergencyContact}
              className="tabular"
            />
          </Field>
          <Field label="Full Address" htmlFor="address" className="lg:col-span-3" error={errors.address}>
            <Textarea id="address" name="address" defaultValue={defaults.address} rows={2} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="lg:col-span-3" error={errors.notes}>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={defaults.notes}
              rows={3}
              placeholder="Any internal remark about this student…"
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Link
          href={cancelHref}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-navy-800 transition hover:bg-slate-50"
        >
          <X className="h-4 w-4" />
          Cancel
        </Link>
        <Button type="submit" size="lg" loading={pending}>
          {!pending && <Save className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
