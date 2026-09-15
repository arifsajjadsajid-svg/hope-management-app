'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  Users,
  Power,
  LogOut,
  Trash2,
  Copy,
  Check,
  MessageCircle,
} from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  createParentAccountAction,
  grantAccessToAllFamiliesAction,
  setParentStatusAction,
  signOutParentEverywhereAction,
  deleteParentAccountAction,
  type GrantedAccess,
} from '@/server/actions/parents';

/** The message a family receives telling them how to sign in. */
function portalMessage({
  displayName,
  phoneDisplay,
  children,
  portalUrl,
  academyName,
}: {
  displayName: string;
  phoneDisplay: string;
  children: string[];
  portalUrl: string;
  academyName: string;
}): string {
  const childList =
    children.length <= 1
      ? (children[0] ?? 'your child')
      : `${children.slice(0, -1).join(', ')} and ${children.at(-1)}`;

  return [
    `Assalam-o-Alaikum ${displayName},`,
    '',
    `You can now see ${childList}'s results and progress on the ${academyName} parent portal:`,
    `${portalUrl}/parent/login`,
    '',
    `Sign in with your mobile number: ${phoneDisplay}`,
  ].join('\n');
}

/* ----------------------------------------------------- access given dialog */

function AccessGivenDialog({
  access,
  portalUrl,
  academyName,
  onClose,
}: {
  access: GrantedAccess | null;
  portalUrl: string;
  academyName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  if (!access) return null;

  const message = portalMessage({ ...access, portalUrl, academyName });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the details are still on screen.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Portal access given"
      description={`${access.displayName} · ${access.phoneDisplay}`}
      size="sm"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <Alert tone="success">
          This parent can now sign in at <strong>{portalUrl}/parent/login</strong> with the number{' '}
          <strong>{access.phoneDisplay}</strong>, and will see {access.children.join(', ')}.
        </Alert>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy message'}
          </Button>
          <a
            href={`https://wa.me/${access.dialNumber}?text=${encodeURIComponent(message)}`}
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
  label = 'Add Parent',
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
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [granted, setGranted] = React.useState<GrantedAccess | null>(null);

  const submit = async () => {
    setPending(true);
    setErrors({});
    const result = await createParentAccountAction({ phone, displayName });
    setPending(false);

    if (result.ok && result.data) {
      setOpen(false);
      setPhone(prefill?.phone ?? '');
      setDisplayName(prefill?.displayName ?? '');
      // No refresh yet: on the "families without access" list, refreshing would
      // remove this row — and the confirmation below with it — immediately.
      setGranted(result.data);
    } else if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error('Could not give access', result.error);
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
        title="Give a parent portal access"
        description="The parent signs in with this mobile number and sees every child who has it on their record."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Give Access
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
        </div>
      </Modal>

      <AccessGivenDialog
        access={granted}
        portalUrl={portalUrl}
        academyName={academyName}
        onClose={() => {
          setGranted(null);
          router.refresh();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------- give everyone */

export function GrantAllButton({ count }: { count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await grantAccessToAllFamiliesAction();
    setPending(false);
    setOpen(false);
    if (result.ok) toast.success(result.message ?? 'Done.');
    else toast.error('Could not give access', result.error);
    router.refresh();
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" />
        Give all {count} access
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        tone="primary"
        title="Give every family access"
        confirmLabel={`Give ${count} Families Access`}
        loading={pending}
        message={
          <>
            Let all <strong>{count}</strong> families listed here sign in to the parent portal with
            their mobile number. You can switch any of them off afterwards.
          </>
        }
      />
    </>
  );
}

/* ----------------------------------------------------------- row actions */

export function ParentRowActions({
  id,
  displayName,
  dialNumber,
  phoneDisplay,
  childNames,
  status,
  activeDevices,
  portalUrl,
  academyName,
}: {
  id: string;
  displayName: string;
  dialNumber: string;
  phoneDisplay: string;
  childNames: string[];
  status: string;
  activeDevices: number;
  portalUrl: string;
  academyName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = React.useState<null | 'status' | 'signout' | 'delete'>(null);
  const [pending, setPending] = React.useState(false);

  const disabled = status === 'DISABLED';

  const run = async () => {
    setPending(true);
    try {
      const result =
        confirm === 'status'
          ? await setParentStatusAction(id, disabled ? 'ACTIVE' : 'DISABLED')
          : confirm === 'signout'
            ? await signOutParentEverywhereAction(id)
            : await deleteParentAccountAction(id);
      if (result.ok) toast.success(result.message ?? 'Done.');
      else toast.error('Something went wrong', result.error);
      router.refresh();
    } finally {
      setPending(false);
      setConfirm(null);
    }
  };

  const iconButton =
    'rounded-md p-1.5 text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-40';

  const dialogs = {
    status: {
      title: disabled ? 'Switch access on' : 'Switch access off',
      label: disabled ? 'Switch On' : 'Switch Off',
      message: disabled ? (
        <>
          Let <strong>{displayName}</strong> sign in to the portal again?
        </>
      ) : (
        <>
          Stop <strong>{displayName}</strong> signing in? They are signed out of every device now.
          Use this if the number has changed hands or a family has left the academy.
        </>
      ),
    },
    signout: {
      title: 'Sign out of all devices',
      label: 'Sign Out Everywhere',
      message: (
        <>
          Sign <strong>{displayName}</strong> out of all {activeDevices} device(s)? They can sign in
          again with their number — to stop that, switch their access off instead.
        </>
      ),
    },
    delete: {
      title: 'Remove portal access',
      label: 'Remove Access',
      message: (
        <>
          Remove portal access for <strong>{displayName}</strong>? The students and their results are
          not affected — only this parent’s sign-in.
        </>
      ),
    },
  } as const;

  const message = portalMessage({
    displayName,
    phoneDisplay,
    children: childNames,
    portalUrl,
    academyName,
  });

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <a
          href={`https://wa.me/${dialNumber}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className={`${iconButton} hover:bg-emerald-50 hover:text-emerald-700`}
          title="Send the portal link on WhatsApp"
          aria-label="Send the portal link on WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
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
          title="Remove access"
          aria-label="Remove access"
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
    </>
  );
}
