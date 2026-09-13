'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { CheckCircle2, Send, Info } from 'lucide-react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { submitEnquiryAction } from '@/server/actions/admissions';
import type { ActionResult } from '@/server/action-result';

/**
 * The public admission enquiry form.
 *
 * Anyone may fill this in — there is no account and no sign-in. It writes a
 * record the office reviews before anything becomes a student, so a stranger's
 * submission never touches the academic data.
 */
type Values = Record<string, string>;

const EMPTY: Values = {
  studentName: '',
  fatherName: '',
  dateOfBirth: '',
  gender: 'MALE',
  classApplyingFor: '',
  previousSchool: '',
  contactPhone: '',
  whatsappNumber: '',
  email: '',
  address: '',
  message: '',
};

export function EnquiryForm({ classOptions }: { classOptions: string[] }) {
  /*
   * The fields are controlled rather than left to the DOM because React clears
   * an uncontrolled form once its action returns. On a form this long, a parent
   * who mistypes one digit would otherwise lose everything they had entered —
   * on a phone, most would simply give up, and the academy would never hear
   * from them.
   */
  const [values, setValues] = React.useState<Values>(EMPTY);
  const set = (name: string) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [name]: event.target.value }));

  const [state, formAction, pending] = useActionState<
    ActionResult<{ reference: string }> | null,
    FormData
  >(submitEnquiryAction, null);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  /*
   * Submitted by hand rather than with <form action={…}>, because React resets
   * the form element once an action returns — which wipes the dropdowns even
   * though their values are held in state. Dispatching inside a transition
   * keeps the pending flag working without that reset.
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    React.startTransition(() => formAction(data));
  };

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h2 className="doc-title text-lg font-bold text-navy-900">Enquiry received</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-slate-600">
          {state.message}
        </p>

        <div className="mx-auto mt-5 max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            Your reference number
          </p>
          <p className="doc-title mt-1 text-xl font-bold tabular text-navy-900">
            {state.data?.reference}
          </p>
        </div>

        <p className="mt-4 text-[12.5px] text-slate-500">
          Please keep this number. Quote it when you telephone or visit the academy.
        </p>

        <Button variant="outline" className="mt-5" onClick={() => setValues(EMPTY)}>
          Send another enquiry
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {state && !state.ok && (
        <Alert tone="danger" title="Your enquiry was not sent">
          {state.error}
        </Alert>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="doc-title mb-4 text-[15px] font-bold uppercase tracking-wide text-navy-900">
          About the child
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Child's full name"
            htmlFor="studentName"
            required
            error={errors.studentName}
          >
            <Input id="studentName" name="studentName" maxLength={120} autoComplete="off" value={values.studentName} onChange={set('studentName')} />
          </Field>

          <Field
            label="Father's / guardian's name"
            htmlFor="fatherName"
            required
            error={errors.fatherName}
          >
            <Input id="fatherName" name="fatherName" maxLength={120} autoComplete="off" value={values.fatherName} onChange={set('fatherName')} />
          </Field>

          <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth}>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" value={values.dateOfBirth} onChange={set('dateOfBirth')} />
          </Field>

          <Field label="Gender" htmlFor="gender">
            <Select id="gender" name="gender" value={values.gender} onChange={set('gender')}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field
            label="Class applying for"
            htmlFor="classApplyingFor"
            required
            error={errors.classApplyingFor}
          >
            <Select id="classApplyingFor" name="classApplyingFor" value={values.classApplyingFor} onChange={set('classApplyingFor')}>
              <option value="" disabled>
                Choose a class…
              </option>
              {classOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Previous school" htmlFor="previousSchool" hint="If any">
            <Input id="previousSchool" name="previousSchool" maxLength={160} autoComplete="off" value={values.previousSchool} onChange={set('previousSchool')} />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="doc-title mb-4 text-[15px] font-bold uppercase tracking-wide text-navy-900">
          How we can reach you
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Mobile number"
            htmlFor="contactPhone"
            required
            hint="For example 0300-1234567"
            error={errors.contactPhone}
          >
            <Input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              inputMode="tel"
              maxLength={30}
              placeholder="0300-1234567"
              value={values.contactPhone}
              onChange={set('contactPhone')}
            />
          </Field>

          <Field
            label="WhatsApp number"
            htmlFor="whatsappNumber"
            hint="If different from above"
            error={errors.whatsappNumber}
          >
            <Input id="whatsappNumber" name="whatsappNumber" type="tel" maxLength={30} value={values.whatsappNumber} onChange={set('whatsappNumber')} />
          </Field>

          <Field label="Email address" htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" maxLength={160} autoComplete="off" value={values.email} onChange={set('email')} />
          </Field>

          <Field label="Home address" htmlFor="address">
            <Input id="address" name="address" maxLength={300} autoComplete="off" value={values.address} onChange={set('address')} />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            label="Anything you would like to tell us"
            htmlFor="message"
            hint="Optional — questions about fees, timings, or the child's needs."
          >
            <Textarea id="message" name="message" rows={4} maxLength={1000} value={values.message} onChange={set('message')} />
          </Field>
        </div>

        {/*
          Honeypot. Hidden from people, but form-spam bots fill in every field
          they find — anything arriving with this set is filed as spam instead
          of reaching the office queue.
        */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Do not fill this in</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      <Alert tone="info">
        <span className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Sending this form does not admit your child. The academy will telephone you to arrange
            the next step. Your details are used only for this admission enquiry.
          </span>
        </span>
      </Alert>

      <div className="flex justify-end">
        <Button type="submit" size="md" loading={pending}>
          <Send className="h-4 w-4" />
          Send Enquiry
        </Button>
      </div>
    </form>
  );
}
