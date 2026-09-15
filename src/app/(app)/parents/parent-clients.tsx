'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  KeyRound,
  Power,
  LogOut,
  Trash2,
  Copy,
  Check,
  MessageCircle,
  ShieldAlert,
} from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  createParentAccountAction,
  resetParentPasswordAction,
  setParentStatusAction,
  signOutParentEverywhereAction,
  deleteParentAccountAction,
  type IssuedCredentials,
} from '@/server/actions/parents';

/* ------------------------------------------------------- credentials card */

/**
 * The one moment the office can see a parent's password. After this dialog
 * closes only the hash remains, so it offers the two ways the academy actually
 * hands details to a family: copying them, or sending them on WhatsApp.
 */
function CredentialsDialog({
  credentials,
  portalUrl,
  academyName,
  onClose,
}: {
  credentials: IssuedCredentials | null;
  portalUrl: string;
  academyName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  if (!credentials) return null;

  const childList =
    credentials.children.length <= 1
      ? (credentials.children[0] ?? 'your child')
      : `${credentials.children.slice(0, -1).join(', ')} and ${credentials.children.at(-1)}`;

  const message = [
    `Assalam-o-Alaikum ${credentials.displayName},`,
    '',
    `Your parent portal account for ${academyName} is ready. You can see ${childList}'s results and progress here:`,
    `${portalUrl}/parent/login`,
    '',
    `Mobile number: ${credentials.phoneDisplay}`,
    `Temporary password: ${credentials.password}`,
    '',
    'You will be asked to choose your own password the first time you sign in. Please do not share it with anyone.',
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the text is still on screen to copy by hand.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Portal sign-in details"
      description={`${credentials.displayName} · ${credentials.phoneDisplay}`}
      size="sm"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <Alert tone="warning" title="Shown only once">
          The password is not stored anywhere readable. Hand it to the family now — if it is lost,
          issue a new one with <strong>Reset password</strong>.
        </Alert>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Mobile number</dt>
              <dd className="font-semibold tabular text-navy-900">{credentials.phoneDisplay}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Temporary password</dt>
              <dd className="rounded-md bg-navy-900 px-2.5 py-1 font-mono text-[14px] font-bold tracking-wide text-gold-300">
                {credentials.password}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-slate-500">Can see</dt>
              <dd className="text-right font-medium text-navy-900">
                {credentials.children.join(', ')}
              </dd>
            </div>
          </dl>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy message'}
          </Button>
          <a
            href={`https://wa.me/${credentials.dialNumber}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            Send on WhatsApp
          </a>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- create account */

export function CreateParentButton({
  portalUrl,
  academyName,
  prefill,
  variant = 'primary',
  label = 'New Parent Account',
}: {
  portalUrl: string;
  academyName: string;
  prefill?: { phone: string; displayName: string };
  variant?: 'primary' | 'outline';
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState(prefill?.phone ?? '');
  const [displayName, setDisplayName] = React.useState(prefill?.displayName ?? '');
  const [password, setPassword] = React.useState('');
  const [mustChange, setMustChange] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [issued, setIssued] = React.useState<IssuedCredentials | null>(null);

  const reset = () => {
    setPhone(prefill?.phone ?? '');
    setDisplayName(prefill?.displayName ?? '');
    setPassword('');
    setMustChange(true);
    setErrors({});
  };

  const submit = async () => {
    setPending(true);
    setErrors({});
    const result = await createParentAccountAction({
      phone,
      displayName,
      password,
      mustChangePassword: mustChange,
    });
    setPending(false);

    if (result.ok && result.data) {
      setOpen(false);
      reset();
      // Deliberately no refresh here. When the account comes from the
      // "families without an account" list, refreshing removes that row — and
      // this component with it — before the password has been seen. The
      // password exists nowhere else, so it would be lost.
      setIssued(result.data);
    } else if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error('Could not create the account', result.error);
    }
  };

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a parent portal account"
        description="The parent signs in with this mobile number and sees every child who has it on their record."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Create Account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Parent’s mobile number"
            htmlFor="parent-phone"
            required
            hint="Must match the parent or WhatsApp number on the student record."
            error={errors.phone}
          >
            <Input
              id="parent-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0300-1234567"
            />
          </Field>

          <Field label="Parent’s name" htmlFor="parent-name" required error={errors.displayName}>
            <Input
              id="parent-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tariq Mehmood"
            />
          </Field>

          <Field
            label="Password"
            htmlFor="parent-password"
            hint="Leave blank and a temporary one is made for you — recommended."
            error={errors.password}
          >
            <Input
              id="parent-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Generate automatically"
            />
          </Field>

          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-[13px] text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-800"
              checked={mustChange}
              onChange={(e) => setMustChange(e.target.checked)}
            />
            <span>
              <strong className="text-navy-900">Parent chooses their own password</strong> at first
              sign-in, so afterwards nobody at the academy knows it.
            </span>
          </label>
        </div>
      </Modal>

      <CredentialsDialog
        credentials={issued}
        portalUrl={portalUrl}
        academyName={academyName}
        onClose={() => {
          setIssued(null);
          router.refresh();
        }}
      />
    </>
  );
}

/* ----------------------------------------------------------- row actions */

export function ParentRowActions({
  id,
  displayName,
  status,
  activeDevices,
  portalUrl,
  academyName,
}: {
  id: string;
  displayName: string;
  status: string;
  activeDevices: number;
  portalUrl: string;
  academyName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = React.useState<null | 'reset' | 'status' | 'signout' | 'delete'>(
    null,
  );
  const [pending, setPending] = React.useState(false);
  const [issued, setIssued] = React.useState<IssuedCredentials | null>(null);

  const disabled = status === 'DISABLED';

  const run = async () => {
    setPending(true);
    try {
      if (confirm === 'reset') {
        const result = await resetParentPasswordAction(id);
        if (result.ok && result.data) {
          setIssued(result.data);
          return; // refreshed when the password dialog is closed
        }
        if (!result.ok) toast.error('Could not reset the password', result.error);
      } else {
        const result =
          confirm === 'status'
            ? await setParentStatusAction(id, disabled ? 'ACTIVE' : 'DISABLED')
            : confirm === 'signout'
              ? await signOutParentEverywhereAction(id)
              : await deleteParentAccountAction(id);
        if (result.ok) toast.success(result.message ?? 'Done.');
        else toast.error('Something went wrong', result.error);
      }
      router.refresh();
    } finally {
      setPending(false);
      setConfirm(null);
    }
  };

  const iconButton =
    'rounded-md p-1.5 text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-40';

  const dialogs = {
    reset: {
      title: 'Reset password',
      label: 'Issue New Password',
      message: (
        <>
          Issue a new temporary password for <strong>{displayName}</strong>? Their current password
          stops working immediately and every device they are signed in on is signed out.
        </>
      ),
    },
    status: {
      title: disabled ? 'Switch account on' : 'Switch account off',
      label: disabled ? 'Switch On' : 'Switch Off',
      message: disabled ? (
        <>
          Let <strong>{displayName}</strong> sign in to the portal again?
        </>
      ) : (
        <>
          Stop <strong>{displayName}</strong> signing in? They are signed out of every device now.
          Use this if the phone number has changed hands or a family has left the academy.
        </>
      ),
    },
    signout: {
      title: 'Sign out of all devices',
      label: 'Sign Out Everywhere',
      message: (
        <>
          Sign <strong>{displayName}</strong> out of all {activeDevices} device(s)? Their password
          still works — use this for a lost or shared phone.
        </>
      ),
    },
    delete: {
      title: 'Delete parent account',
      label: 'Delete Account',
      message: (
        <>
          Delete the portal account for <strong>{displayName}</strong>? The students and their
          results are not affected — only this sign-in is removed.
        </>
      ),
    },
  } as const;

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => setConfirm('reset')}
          className={`${iconButton} hover:bg-royal-50 hover:text-royal-700`}
          title="Reset password"
          aria-label="Reset password"
        >
          <KeyRound className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setConfirm('signout')}
          disabled={activeDevices === 0}
          className={`${iconButton} hover:bg-amber-50 hover:text-amber-700`}
          title="Sign out of all devices"
          aria-label="Sign out of all devices"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setConfirm('status')}
          className={`${iconButton} ${
            disabled ? 'hover:bg-emerald-50 hover:text-emerald-700' : 'hover:bg-slate-100 hover:text-slate-800'
          }`}
          title={disabled ? 'Switch on' : 'Switch off'}
          aria-label={disabled ? 'Switch on' : 'Switch off'}
        >
          <Power className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setConfirm('delete')}
          className={`${iconButton} hover:bg-rose-50 hover:text-rose-700`}
          title="Delete account"
          aria-label="Delete account"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          onConfirm={run}
          title={dialogs[confirm].title}
          confirmLabel={dialogs[confirm].label}
          tone={confirm === 'delete' || (confirm === 'status' && !disabled) ? 'danger' : 'primary'}
          loading={pending}
          message={dialogs[confirm].message}
        />
      )}

      <CredentialsDialog
        credentials={issued}
        portalUrl={portalUrl}
        academyName={academyName}
        onClose={() => {
          setIssued(null);
          router.refresh();
        }}
      />
    </>
  );
}

export function LockedHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
      <ShieldAlert className="h-3 w-3" />
      Locked — too many wrong passwords
    </span>
  );
}
