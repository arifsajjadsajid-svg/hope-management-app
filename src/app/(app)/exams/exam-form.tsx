'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, X, Info } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  EXAM_TYPES,
  EXAM_TYPE_LABELS,
  ROLL_METHODS,
  ROLL_METHOD_LABELS,
} from '@/lib/constants';
import type { ActionResult } from '@/server/action-result';

export type ExamFormOption = { id: string; name: string };
export type ExamFormClass = { id: string; name: string; sessionId: string };
export type ExamFormSection = { id: string; name: string; classId: string };

export type ExamFormValues = {
  name: string;
  type: string;
  sessionId: string;
  startDate: string;
  endDate: string;
  resultPublishDate: string;
  instructions: string;
  examCenter: string;
  gradingSchemeId: string;
  resultPolicyId: string;
  rollNumberPrefix: string;
  rollNumberMethod: string;
  rollNumberStart: string;
  rollNumberPadding: string;
  classIds: string[];
  sectionIds: string[];
};

export function ExamForm({
  action,
  defaults,
  sessions,
  classes,
  sections,
  gradingSchemes,
  policies,
  submitLabel,
  cancelHref,
}: {
  action: (
    prev: ActionResult<{ id: string }> | null,
    formData: FormData,
  ) => Promise<ActionResult<{ id: string }>>;
  defaults: ExamFormValues;
  sessions: ExamFormOption[];
  classes: ExamFormClass[];
  sections: ExamFormSection[];
  gradingSchemes: ExamFormOption[];
  policies: ExamFormOption[];
  submitLabel: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, null);

  const [sessionId, setSessionId] = React.useState(defaults.sessionId);
  const [classIds, setClassIds] = React.useState<string[]>(defaults.classIds);
  const [sectionIds, setSectionIds] = React.useState<string[]>(defaults.sectionIds);
  const [rollMethod, setRollMethod] = React.useState(defaults.rollNumberMethod);

  const visibleClasses = React.useMemo(
    () => classes.filter((c) => c.sessionId === sessionId),
    [classes, sessionId],
  );
  const visibleSections = React.useMemo(
    () => sections.filter((s) => classIds.includes(s.classId)),
    [sections, classIds],
  );

  React.useEffect(() => {
    setClassIds((prev) => prev.filter((id) => visibleClasses.some((c) => c.id === id)));
  }, [visibleClasses]);

  React.useEffect(() => {
    setSectionIds((prev) => prev.filter((id) => visibleSections.some((s) => s.id === id)));
  }, [visibleSections]);

  React.useEffect(() => {
    if (state?.ok && state.data?.id) {
      toast.success(state.message ?? 'Saved.');
      router.push(`/exams/${state.data.id}`);
      router.refresh();
    } else if (state && !state.ok) {
      toast.error('Could not save', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((v) => v !== id) : [...list, id];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && !state.ok && (
        <Alert tone="danger" title="The examination could not be saved">
          {state.error}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Examination details"
          description="These details appear on the date sheet, roll number slips and report cards."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Examination Name"
            htmlFor="name"
            required
            error={errors.name}
            className="lg:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={defaults.name}
              required
              placeholder="First Term Examination 2026"
            />
          </Field>

          <Field label="Examination Type" htmlFor="type" required error={errors.type}>
            <Select id="type" name="type" defaultValue={defaults.type}>
              {EXAM_TYPES.map((value) => (
                <option key={value} value={value}>
                  {EXAM_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

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

          <Field label="Start Date" htmlFor="startDate" required error={errors.startDate}>
            <Input id="startDate" name="startDate" type="date" defaultValue={defaults.startDate} required />
          </Field>

          <Field label="End Date" htmlFor="endDate" required error={errors.endDate}>
            <Input id="endDate" name="endDate" type="date" defaultValue={defaults.endDate} required />
          </Field>

          <Field
            label="Result Publication Date"
            htmlFor="resultPublishDate"
            error={errors.resultPublishDate}
          >
            <Input
              id="resultPublishDate"
              name="resultPublishDate"
              type="date"
              defaultValue={defaults.resultPublishDate}
            />
          </Field>

          <Field
            label="Examination Centre"
            htmlFor="examCenter"
            className="lg:col-span-2"
            error={errors.examCenter}
          >
            <Input
              id="examCenter"
              name="examCenter"
              defaultValue={defaults.examCenter}
              placeholder="The Hope Science Academy, 247/E-1, Johar Town, Lahore"
            />
          </Field>

          <Field
            label="Examination Instructions"
            htmlFor="instructions"
            className="lg:col-span-3"
            hint="Printed on the date sheet and roll number slip."
            error={errors.instructions}
          >
            <Textarea
              id="instructions"
              name="instructions"
              defaultValue={defaults.instructions}
              rows={3}
              placeholder="Candidates must bring their roll number slip and report to the allotted room 15 minutes before the paper."
            />
          </Field>
        </CardBody>
      </Card>

      {/* -------------------------------------------------- classes & sections */}
      <Card>
        <CardHeader
          title="Participating classes & sections"
          description="Subjects are added automatically from the subject list of each selected class."
        />
        <CardBody className="space-y-5">
          <div>
            <p className="field-label">
              Classes <span className="text-rose-600">*</span>
            </p>
            {visibleClasses.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[13px] text-slate-500">
                {sessionId
                  ? 'The selected session has no classes yet.'
                  : 'Select an academic session first.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visibleClasses.map((schoolClass) => {
                  const active = classIds.includes(schoolClass.id);
                  return (
                    <button
                      key={schoolClass.id}
                      type="button"
                      onClick={() => setClassIds((prev) => toggle(prev, schoolClass.id))}
                      className={`rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition ${
                        active
                          ? 'border-navy-900 bg-navy-900 text-white'
                          : 'border-slate-300 bg-white text-navy-800 hover:border-navy-400'
                      }`}
                      aria-pressed={active}
                    >
                      {schoolClass.name}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.classIds && <p className="field-error">{errors.classIds}</p>}
            {classIds.map((id) => (
              <input key={id} type="hidden" name="classIds" value={id} />
            ))}
          </div>

          <div>
            <p className="field-label">Sections</p>
            {visibleSections.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[13px] text-slate-500">
                Select at least one class to choose its sections.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {visibleSections.map((section) => {
                    const active = sectionIds.includes(section.id);
                    const parent = classes.find((c) => c.id === section.classId);
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setSectionIds((prev) => toggle(prev, section.id))}
                        className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                          active
                            ? 'border-royal-600 bg-royal-600 text-white'
                            : 'border-slate-300 bg-white text-navy-800 hover:border-royal-400'
                        }`}
                        aria-pressed={active}
                      >
                        {parent?.name} — {section.name}
                      </button>
                    );
                  })}
                </div>
                <p className="field-hint flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  Leave every section unselected to include all sections of the chosen classes.
                </p>
              </>
            )}
            {sectionIds.map((id) => (
              <input key={id} type="hidden" name="sectionIds" value={id} />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------- rules & rolls */}
      <Card>
        <CardHeader
          title="Grading, result rules & roll numbers"
          description="Leave the grading scheme or policy blank to use the academy defaults."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Grading Scheme" htmlFor="gradingSchemeId" error={errors.gradingSchemeId}>
            <Select id="gradingSchemeId" name="gradingSchemeId" defaultValue={defaults.gradingSchemeId}>
              <option value="">Academy default</option>
              {gradingSchemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Result Policy" htmlFor="resultPolicyId" error={errors.resultPolicyId}>
            <Select id="resultPolicyId" name="resultPolicyId" defaultValue={defaults.resultPolicyId}>
              <option value="">Academy default</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Roll Number Method"
            htmlFor="rollNumberMethod"
            required
            error={errors.rollNumberMethod}
          >
            <Select
              id="rollNumberMethod"
              name="rollNumberMethod"
              value={rollMethod}
              onChange={(e) => setRollMethod(e.target.value)}
            >
              {ROLL_METHODS.map((value) => (
                <option key={value} value={value}>
                  {ROLL_METHOD_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Roll Number Prefix"
            htmlFor="rollNumberPrefix"
            hint="Example: FT26-"
            error={errors.rollNumberPrefix}
          >
            <Input
              id="rollNumberPrefix"
              name="rollNumberPrefix"
              defaultValue={defaults.rollNumberPrefix}
              disabled={rollMethod === 'MANUAL'}
              placeholder="FT26-"
            />
          </Field>

          <Field label="Start Number" htmlFor="rollNumberStart" error={errors.rollNumberStart}>
            <Input
              id="rollNumberStart"
              name="rollNumberStart"
              type="number"
              min={1}
              defaultValue={defaults.rollNumberStart}
              disabled={rollMethod === 'MANUAL'}
              className="tabular"
            />
          </Field>

          <Field
            label="Number Padding"
            htmlFor="rollNumberPadding"
            hint="3 produces 001, 002, 003…"
            error={errors.rollNumberPadding}
          >
            <Input
              id="rollNumberPadding"
              name="rollNumberPadding"
              type="number"
              min={1}
              max={8}
              defaultValue={defaults.rollNumberPadding}
              disabled={rollMethod === 'MANUAL'}
              className="tabular"
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
        <Button type="submit" size="lg" loading={pending} disabled={classIds.length === 0}>
          {!pending && <Save className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
