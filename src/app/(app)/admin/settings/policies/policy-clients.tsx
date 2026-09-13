'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Save } from 'lucide-react';
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
import { RANKING_METHODS, RANKING_METHOD_LABELS } from '@/lib/constants';
import { saveResultPolicyAction, deleteResultPolicyAction } from '@/server/actions/admin';

export type PolicyValues = {
  id: string;
  name: string;
  description: string;
  overallPassPercent: number;
  requireSubjectPass: boolean;
  requirePracticalPass: boolean;
  compulsoryMustPass: boolean;
  graceMarksMax: number;
  graceMaxSubjects: number;
  compartmentEnabled: boolean;
  compartmentMaxSubjects: number;
  absentCountsAsZero: boolean;
  absentFailsResult: boolean;
  rankingMethod: string;
  promotionPercent: number;
  includeOptionalInTotal: boolean;
  isDefault: boolean;
};

export function PolicyDialog({ policy }: { policy?: PolicyValues }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const action = React.useMemo(
    () => saveResultPolicyAction.bind(null, policy?.id ?? null),
    [policy?.id],
  );
  const [state, formAction, pending] = useActionState(action, null);
  const handled = React.useRef<unknown>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Policy saved.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not save the policy', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      {policy ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-slate-500 transition hover:bg-royal-50 hover:text-royal-700"
          aria-label="Edit policy"
          title="Edit policy"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New Result Policy
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={policy ? `Edit policy — ${policy.name}` : 'Create result policy'}
        description="These rules drive the pass/fail engine, grace marks, compartment handling and ranking."
        size="lg"
      >
        <form action={formAction} className="space-y-4" noValidate>
          {state && !state.ok && (
            <Alert tone="danger" title="Could not save">
              {state.error}
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Policy Name" htmlFor="name" required error={errors.name}>
              <Input id="name" name="name" defaultValue={policy?.name} required />
            </Field>
            <Field label="Description" htmlFor="description" error={errors.description}>
              <Input id="description" name="description" defaultValue={policy?.description} />
            </Field>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-navy-700">
              Pass criteria
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Overall Passing %"
                htmlFor="overallPassPercent"
                required
                error={errors.overallPassPercent}
              >
                <Input
                  id="overallPassPercent"
                  name="overallPassPercent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={policy?.overallPassPercent ?? 50}
                  required
                  className="tabular"
                />
              </Field>
              <Field
                label="Promotion %"
                htmlFor="promotionPercent"
                hint="Minimum for promotion to the next class."
                error={errors.promotionPercent}
              >
                <Input
                  id="promotionPercent"
                  name="promotionPercent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={policy?.promotionPercent ?? 40}
                  className="tabular"
                />
              </Field>
              <Field label="Ranking Method" htmlFor="rankingMethod" required error={errors.rankingMethod}>
                <Select
                  id="rankingMethod"
                  name="rankingMethod"
                  defaultValue={policy?.rankingMethod ?? 'COMPETITION'}
                >
                  {RANKING_METHODS.map((value) => (
                    <option key={value} value={value}>
                      {RANKING_METHOD_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-3.5 space-y-2.5">
              <Checkbox
                name="requireSubjectPass"
                defaultChecked={policy?.requireSubjectPass ?? true}
                label="A candidate must reach the passing marks in every subject"
              />
              <Checkbox
                name="requirePracticalPass"
                defaultChecked={policy?.requirePracticalPass ?? true}
                label="The practical component must be passed separately where one exists"
              />
              <Checkbox
                name="compulsoryMustPass"
                defaultChecked={policy?.compulsoryMustPass ?? true}
                label="Compulsory subjects must be passed to qualify for a compartment"
              />
              <Checkbox
                name="includeOptionalInTotal"
                defaultChecked={policy?.includeOptionalInTotal ?? false}
                label="Include optional subjects in the aggregate total"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-navy-700">
              Grace marks & compartment
            </p>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field
                label="Grace Marks (total)"
                htmlFor="graceMarksMax"
                hint="0 disables grace."
                error={errors.graceMarksMax}
              >
                <Input
                  id="graceMarksMax"
                  name="graceMarksMax"
                  type="number"
                  min={0}
                  step="0.5"
                  defaultValue={policy?.graceMarksMax ?? 0}
                  className="tabular"
                />
              </Field>
              <Field
                label="Max Grace Subjects"
                htmlFor="graceMaxSubjects"
                error={errors.graceMaxSubjects}
              >
                <Input
                  id="graceMaxSubjects"
                  name="graceMaxSubjects"
                  type="number"
                  min={0}
                  defaultValue={policy?.graceMaxSubjects ?? 0}
                  className="tabular"
                />
              </Field>
              <Field
                label="Compartment Subjects"
                htmlFor="compartmentMaxSubjects"
                hint="Failed subjects allowed for a compartment."
                error={errors.compartmentMaxSubjects}
              >
                <Input
                  id="compartmentMaxSubjects"
                  name="compartmentMaxSubjects"
                  type="number"
                  min={0}
                  defaultValue={policy?.compartmentMaxSubjects ?? 1}
                  className="tabular"
                />
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox
                  name="compartmentEnabled"
                  defaultChecked={policy?.compartmentEnabled ?? true}
                  label="Allow compartment"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-navy-700">
              Absent handling
            </p>
            <div className="space-y-2.5">
              <Checkbox
                name="absentCountsAsZero"
                defaultChecked={policy?.absentCountsAsZero ?? true}
                label="An absent paper counts as zero and keeps its maximum in the total"
              />
              <Checkbox
                name="absentFailsResult"
                defaultChecked={policy?.absentFailsResult ?? true}
                label="An absent paper counts as a failed subject"
              />
            </div>
          </div>

          <Checkbox
            name="isDefault"
            defaultChecked={policy?.isDefault ?? false}
            label="Use as the academy default policy"
          />

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save className="h-4 w-4" />}
              Save Policy
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeletePolicyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteResultPolicyAction(id);
    setPending(false);
    setOpen(false);
    if (result.ok) {
      toast.success(result.message ?? 'Policy deleted.');
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
        aria-label="Delete policy"
        title="Delete policy"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Delete result policy"
        confirmLabel="Delete Policy"
        loading={pending}
        message={
          <>
            Delete <strong>{name}</strong>? Only policies not used by any examination can be deleted.
          </>
        }
      />
    </>
  );
}
