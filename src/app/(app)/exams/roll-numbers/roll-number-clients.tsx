'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Save, Check } from 'lucide-react';
import { Button, Input, Alert } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { generateRollNumbersAction, setManualRollNumberAction } from '@/server/actions/exams';

/**
 * Commits the previewed roll numbers. Regeneration is confirmed explicitly
 * because it replaces every existing allocation for the examination.
 */
export function GenerateRollNumbersButton({
  examId,
  hasExisting,
  duplicates,
  disabled,
  count,
}: {
  examId: string;
  hasExisting: boolean;
  duplicates: string[];
  disabled?: boolean;
  count: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await generateRollNumbersAction(examId);
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Roll numbers generated.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not generate roll numbers', result.error);
      setOpen(false);
    }
  };

  const blocked = duplicates.length > 0 || count === 0;

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled || blocked}
        title={
          duplicates.length > 0
            ? 'Duplicate roll numbers would be created'
            : count === 0
              ? 'No eligible students'
              : undefined
        }
      >
        <Wand2 className="h-4 w-4" />
        {hasExisting ? 'Regenerate' : 'Generate'} Roll Numbers
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title={hasExisting ? 'Regenerate roll numbers' : 'Generate roll numbers'}
        confirmLabel={hasExisting ? 'Replace Roll Numbers' : 'Generate'}
        tone={hasExisting ? 'danger' : 'primary'}
        loading={pending}
        requirePhrase={hasExisting ? 'REGENERATE' : undefined}
        message={
          hasExisting ? (
            <>
              This replaces every existing roll number for this examination with the{' '}
              <strong>{count}</strong> shown in the preview. Roll number slips already handed out
              will no longer match.
            </>
          ) : (
            <>
              Allocate <strong>{count}</strong> roll number(s) exactly as shown in the preview?
            </>
          )
        }
      />
    </>
  );
}

/** Inline editor used when the examination is set to manual roll numbers. */
export function ManualRollNumberInput({
  examId,
  studentId,
  current,
  disabled,
}: {
  examId: string;
  studentId: string;
  current: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = React.useState(current);
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const dirty = value.trim() !== current;

  const save = async () => {
    setPending(true);
    const result = await setManualRollNumberAction(examId, studentId, value.trim());
    setPending(false);
    if (result.ok) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
      router.refresh();
    } else {
      toast.error('Could not set the roll number', result.error);
      setValue(current);
    }
  };

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && dirty) {
            e.preventDefault();
            void save();
          }
        }}
        disabled={disabled || pending}
        className="h-8 w-[120px] px-2 text-center text-[13px] tabular"
        aria-label="Roll number"
      />
      {dirty ? (
        <Button size="sm" variant="secondary" onClick={save} loading={pending} className="h-8 px-2">
          {!pending && <Save className="h-3.5 w-3.5" />}
        </Button>
      ) : saved ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <span className="w-8" />
      )}
    </div>
  );
}

export function DuplicateWarning({ duplicates }: { duplicates: string[] }) {
  if (duplicates.length === 0) return null;
  return (
    <Alert tone="danger" title="Duplicate roll numbers detected" className="mb-5">
      Generation is blocked because these roll numbers would be issued more than once:{' '}
      <strong>{duplicates.slice(0, 8).join(', ')}</strong>
      {duplicates.length > 8 ? ` and ${duplicates.length - 8} more` : ''}. Change the prefix, the
      padding or the allocation method on the examination.
    </Alert>
  );
}
