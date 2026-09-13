'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCheck, Megaphone } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
} from '@/lib/constants';
import {
  sendNotificationAction,
  markAllNotificationsReadAction,
} from '@/server/actions/notifications';

export type AudienceOption = { value: string; label: string };

export function SendNotificationDialog({
  roles,
  classes,
  sections,
  students,
}: {
  roles: AudienceOption[];
  classes: AudienceOption[];
  sections: AudienceOption[];
  students: AudienceOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(sendNotificationAction, null);
  const handled = React.useRef<unknown>(null);
  const [audience, setAudience] = React.useState('ALL');

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Notification sent.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Could not send', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const audienceOptions =
    audience === 'ROLE'
      ? roles
      : audience === 'CLASS'
        ? classes
        : audience === 'SECTION'
          ? sections
          : audience === 'STUDENT'
            ? students
            : [];

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4" />
        New Notification
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send a notification"
        description="Delivered in-app immediately. Email, SMS and WhatsApp are recorded as pending until a gateway is connected."
        size="md"
      >
        <form action={formAction} className="space-y-4" noValidate>
          {state && !state.ok && (
            <Alert tone="danger" title="Could not send">
              {state.error}
            </Alert>
          )}

          <Field label="Title" htmlFor="title" required error={errors.title}>
            <Input
              id="title"
              name="title"
              required
              placeholder="First Term Examination 2026 results published"
            />
          </Field>

          <Field label="Message" htmlFor="message" required error={errors.message}>
            <Textarea
              id="message"
              name="message"
              rows={4}
              required
              placeholder="Results are now available. Report cards can be downloaded from the portal."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="type" required error={errors.type}>
              <Select id="type" name="type" defaultValue="GENERAL">
                {NOTIFICATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {NOTIFICATION_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Audience" htmlFor="audience" required error={errors.audience}>
              <Select
                id="audience"
                name="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option value="ALL">Everybody</option>
                <option value="ROLE">A specific role</option>
                <option value="CLASS">A class</option>
                <option value="SECTION">A section</option>
                <option value="STUDENT">One student</option>
              </Select>
            </Field>
          </div>

          {audience !== 'ALL' && (
            <Field label="Select audience" htmlFor="audienceRef" required error={errors.audienceRef}>
              <Select id="audienceRef" name="audienceRef" required>
                <option value="">Choose…</option>
                {audienceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div>
            <p className="field-label">
              Channels <span className="text-rose-600">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-slate-50 p-3.5 sm:grid-cols-4">
              {NOTIFICATION_CHANNELS.map((channel) => (
                <Checkbox
                  key={channel}
                  name="channels"
                  value={channel}
                  defaultChecked={channel === 'IN_APP'}
                  label={NOTIFICATION_CHANNEL_LABELS[channel]}
                />
              ))}
            </div>
            {errors.channels && <p className="field-error">{errors.channels}</p>}
            <p className="field-hint">
              Only In-App is delivered by this installation. The others are queued so an email, SMS or
              WhatsApp Business gateway can be added later without changing the data model.
            </p>
          </div>

          <Field label="Link" htmlFor="link" hint="Optional in-app link, e.g. /results" error={errors.link}>
            <Input id="link" name="link" placeholder="/results" />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Send className="h-4 w-4" />}
              Send Notification
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function MarkAllReadButton({ unread }: { unread: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await markAllNotificationsReadAction();
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Marked as read.');
      router.refresh();
    } else {
      toast.error('Could not update', result.error);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} loading={pending} disabled={unread === 0}>
      {!pending && <CheckCheck className="h-4 w-4" />}
      Mark all read
    </Button>
  );
}
