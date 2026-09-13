'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { recordBackupAction, deleteBackupAction } from '@/server/actions/backup';

/**
 * Downloads the backup, then records it in the history.
 *
 * The download is a normal browser fetch rather than a link so the notes can be
 * attached and the history entry written only once the file has actually
 * arrived — a failed download does not leave a phantom backup in the list.
 */
export function CreateBackupButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    try {
      const response = await fetch('/api/export/backup');
      if (!response.ok) throw new Error(`The server returned ${response.status}.`);

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'academy-backup.json';

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const recorded = await recordBackupAction({ fileName, sizeBytes: blob.size, notes });
      if (!recorded.ok) throw new Error(recorded.error);

      toast.success('Backup downloaded', `${fileName} — keep it somewhere safe.`);
      setOpen(false);
      setNotes('');
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not create the backup',
        error instanceof Error ? error.message : 'Unknown error.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" />
        Download Backup
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Download a database backup"
        description="Every table is written into one file and saved to this computer."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending}>
              Download Backup
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Notes" htmlFor="backup-notes" hint="Optional — why this backup was taken.">
            <Textarea
              id="backup-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Before publishing the First Term result."
            />
          </Field>
          <Alert tone="info">
            Store the file somewhere other than this computer — a cloud drive or a USB stick. A
            backup kept only on the machine it came from does not survive that machine failing.
          </Alert>
        </div>
      </Modal>
    </>
  );
}

/**
 * Restore is the single most destructive action available, so it demands the
 * backup file, a written reason and the Super Admin's own password.
 */
export function RestoreBackupButton() {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirmPhrase, setConfirmPhrase] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [oversize, setOversize] = React.useState(0);
  const [reasonLength, setReasonLength] = React.useState(0);
  const [hasPassword, setHasPassword] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  /**
   * Posted to a route handler rather than through a server action: the upload
   * is large, and this way a refusal comes back as a status and a message the
   * operator can act on instead of a silent no-op.
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);

    try {
      const response = await fetch('/api/admin/restore', {
        method: 'POST',
        body: new FormData(event.currentTarget),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        toast.error(
          'Could not restore',
          payload?.error ?? `The server refused the restore (${response.status}).`,
        );
        return;
      }

      setDone(payload.message ?? 'The database was restored.');
    } catch (error) {
      toast.error(
        'Could not restore',
        error instanceof Error ? error.message : 'The upload did not reach the server.',
      );
    } finally {
      setPending(false);
    }
  };

  const ready =
    fileName !== '' &&
    oversize === 0 &&
    reasonLength >= 10 &&
    hasPassword &&
    confirmPhrase === 'RESTORE';

  /**
   * A browser upload cannot exceed this, so it is checked before submitting
   * rather than letting the request be rejected with nothing useful to show.
   */
  const MAX_UPLOAD = 4 * 1024 * 1024;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" />
        Restore from File
      </Button>

      <Modal
        open={open}
        onClose={() => (done ? (window.location.href = '/login') : setOpen(false))}
        title={done ? 'Restore complete' : 'Restore the database'}
        description={
          done
            ? 'The database now holds the contents of the backup.'
            : 'Replaces every record with the contents of a backup file.'
        }
        size="sm"
      >
        {done ? (
          <div className="space-y-4">
            <Alert tone="success" title="Restored successfully">
              {done}
            </Alert>
            <p className="text-[13px] leading-relaxed text-slate-700">
              Restoring replaced the user accounts as well, so every sign-in — including yours — was
              ended. Sign in again with the password that was in force when this backup was taken.
            </p>
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <Button onClick={() => (window.location.href = '/login')}>Go to sign in</Button>
            </div>
          </div>
        ) : (
        <form ref={formRef} onSubmit={submit} className="space-y-4">
          <Alert tone="danger" title="This replaces all current data">
            Every student, mark, result and audit entry recorded since the backup was taken will be
            removed. It happens in one transaction — if anything is wrong with the file, nothing
            changes at all. Everyone is signed out afterwards.
          </Alert>

          <Field
            label="Backup file"
            htmlFor="restore-file"
            required
            hint="The .json file downloaded from this page."

          >
            <Input
              id="restore-file"
              name="file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                setFileName(chosen?.name ?? '');
                setOversize(chosen && chosen.size > MAX_UPLOAD ? chosen.size : 0);
              }}
            />
          </Field>

          {oversize > 0 && (
            <Alert tone="warning" title="This file is too large to upload">
              It is {(oversize / 1024 / 1024).toFixed(1)} MB, and a browser upload cannot exceed 4
              MB. Restore it from the command line instead, where there is no limit — on a machine
              with the project and the database details:
              <code className="mt-2 block rounded bg-slate-900 px-2.5 py-1.5 font-mono text-[11.5px] text-slate-100">
                npm run restore -- &quot;{fileName}&quot;
              </code>
            </Alert>
          )}

          <Field
            label="Reason for restoring"
            htmlFor="restore-reason"
            required
            hint="At least 10 characters. Recorded in the audit log before the restore runs."

          >
            <Textarea
              id="restore-reason"
              name="reason"
              rows={3}
              onChange={(e) => setReasonLength(e.target.value.trim().length)}
              placeholder="Marks were lost after a failed import; restoring the backup taken this morning."
            />
          </Field>

          <Field
            label="Confirm with your password"
            htmlFor="restore-password"
            required

          >
            <Input
              id="restore-password"
              name="password"
              type="password"
              autoComplete="current-password"
              onChange={(e) => setHasPassword(e.target.value.length > 0)}
            />
          </Field>

          <Field label="Type RESTORE to continue" htmlFor="restore-phrase" required>
            <Input
              id="restore-phrase"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              autoComplete="off"
              className="font-mono"
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending} disabled={!ready}>
              <Upload className="h-4 w-4" />
              Restore Database
            </Button>
          </div>
        </form>
        )}
      </Modal>
    </>
  );
}

export function DeleteBackupButton({ id, fileName }: { id: string; fileName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await deleteBackupAction(id);
    setPending(false);
    setOpen(false);
    if (result.ok) {
      toast.success(result.message ?? 'Entry removed.');
      router.refresh();
    } else {
      toast.error('Could not remove the entry', result.error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
        aria-label="Remove from history"
        title="Remove from history"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Remove from backup history"
        confirmLabel="Remove Entry"
        loading={pending}
        message={
          <>
            Remove the history entry for <strong>{fileName}</strong>? The downloaded file on your
            computer is not affected — only this record of it.
          </>
        }
      />
    </>
  );
}
