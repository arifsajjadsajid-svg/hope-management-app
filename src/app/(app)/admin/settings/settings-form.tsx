'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
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
import { Crest } from '@/components/brand/crest';
import { saveAcademySettingsAction } from '@/server/actions/admin';

export type SettingsValues = {
  name: string;
  shortName: string;
  tagline: string;
  address: string;
  phone1: string;
  phone2: string;
  email: string;
  website: string;
  directorName: string;
  principalName: string;
  examControllerName: string;
  footerMessage: string;
  currentSessionId: string;
  defaultGradingId: string;
  defaultPolicyId: string;
  resultPortalEnabled: boolean;
  logoPath: string | null;
  stampPath: string | null;
  principalSignPath: string | null;
  directorSignPath: string | null;
  examControllerSign: string | null;
};

type ImageField = {
  key: 'logo' | 'stamp' | 'principalSign' | 'directorSign' | 'examControllerSign';
  label: string;
  hint: string;
  current: string | null;
};

/** Upload / preview / remove control for one branding image. */
function ImageUpload({ field }: { field: ImageField }) {
  const [preview, setPreview] = React.useState<string | null>(field.current);
  const [remove, setRemove] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-[12.5px] font-bold text-navy-900">{field.label}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{field.hint}</p>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
          {preview && !remove ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-16 max-w-full object-contain" />
          ) : field.key === 'logo' ? (
            <Crest className="h-12 w-auto" />
          ) : (
            <ImageIcon className="h-5 w-5 text-slate-300" />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Choose file
          </Button>
          {preview && !remove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRemove(true);
                setPreview(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        name={`${field.key}File`}
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setRemove(false);
          const reader = new FileReader();
          reader.onload = () => setPreview(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />
      {remove && <input type="hidden" name={`${field.key}Remove`} value="true" />}
    </div>
  );
}

export function AcademySettingsForm({
  defaults,
  sessions,
  gradingSchemes,
  policies,
}: {
  defaults: SettingsValues;
  sessions: { id: string; name: string }[];
  gradingSchemes: { id: string; name: string }[];
  policies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(saveAcademySettingsAction, null);
  const handled = React.useRef<unknown>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? 'Settings saved.');
      router.refresh();
    } else {
      toast.error('Could not save settings', state.error);
    }
  }, [state, router, toast]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const imageFields: ImageField[] = [
    {
      key: 'logo',
      label: 'Academy Logo',
      hint: 'Replaces the built-in crest on screens and documents.',
      current: defaults.logoPath,
    },
    {
      key: 'stamp',
      label: 'Academy Stamp',
      hint: 'Optional official stamp for printed documents.',
      current: defaults.stampPath,
    },
    {
      key: 'principalSign',
      label: 'Principal Signature',
      hint: 'Printed above the Principal / Director signature line.',
      current: defaults.principalSignPath,
    },
    {
      key: 'directorSign',
      label: 'Director Signature',
      hint: 'Used when no principal signature is set.',
      current: defaults.directorSignPath,
    },
    {
      key: 'examControllerSign',
      label: 'Examination Controller Signature',
      hint: 'Printed on date sheets, roll slips and result documents.',
      current: defaults.examControllerSign,
    },
  ];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && !state.ok && (
        <Alert tone="danger" title="Could not save settings">
          {state.error}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Academy identity"
          description="These details appear on every screen, report, PDF and printed document."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Academy Name" htmlFor="name" required error={errors.name} className="lg:col-span-2">
            <Input id="name" name="name" defaultValue={defaults.name} required />
          </Field>
          <Field
            label="Short Name"
            htmlFor="shortName"
            required
            hint="Used as the crest monogram."
            error={errors.shortName}
          >
            <Input id="shortName" name="shortName" defaultValue={defaults.shortName} required />
          </Field>

          <Field label="Tagline" htmlFor="tagline" required error={errors.tagline} className="lg:col-span-3">
            <Input id="tagline" name="tagline" defaultValue={defaults.tagline} required />
          </Field>

          <Field label="Address" htmlFor="address" required error={errors.address} className="lg:col-span-3">
            <Input id="address" name="address" defaultValue={defaults.address} required />
          </Field>

          <Field label="Phone 1" htmlFor="phone1" required error={errors.phone1}>
            <Input id="phone1" name="phone1" defaultValue={defaults.phone1} required className="tabular" />
          </Field>
          <Field label="Phone 2" htmlFor="phone2" error={errors.phone2}>
            <Input id="phone2" name="phone2" defaultValue={defaults.phone2} className="tabular" />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" defaultValue={defaults.email} />
          </Field>

          <Field label="Website" htmlFor="website" error={errors.website} className="lg:col-span-3">
            <Input id="website" name="website" defaultValue={defaults.website} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Signatories"
          description="Names printed beneath the signature lines on official documents."
        />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Director Name" htmlFor="directorName" error={errors.directorName}>
            <Input id="directorName" name="directorName" defaultValue={defaults.directorName} />
          </Field>
          <Field label="Principal Name" htmlFor="principalName" error={errors.principalName}>
            <Input id="principalName" name="principalName" defaultValue={defaults.principalName} />
          </Field>
          <Field
            label="Examination Controller"
            htmlFor="examControllerName"
            error={errors.examControllerName}
          >
            <Input
              id="examControllerName"
              name="examControllerName"
              defaultValue={defaults.examControllerName}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Logo, stamp & signature images"
          description="PNG, JPEG, WebP, GIF or SVG, up to 2 MB each. Uploads are validated and stored outside the web root."
        />
        <CardBody className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {imageFields.map((field) => (
            <ImageUpload key={field.key} field={field} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Academic defaults"
          description="Applied to new examinations that do not choose their own scheme or policy."
        />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Current Academic Session"
            htmlFor="currentSessionId"
            error={errors.currentSessionId}
          >
            <Select
              id="currentSessionId"
              name="currentSessionId"
              defaultValue={defaults.currentSessionId}
            >
              <option value="">Not set</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Default Grading Scheme" htmlFor="defaultGradingId" error={errors.defaultGradingId}>
            <Select id="defaultGradingId" name="defaultGradingId" defaultValue={defaults.defaultGradingId}>
              <option value="">Built-in scale</option>
              {gradingSchemes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Default Result Policy" htmlFor="defaultPolicyId" error={errors.defaultPolicyId}>
            <Select id="defaultPolicyId" name="defaultPolicyId" defaultValue={defaults.defaultPolicyId}>
              <option value="">Built-in rules</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Documents & portal" />
        <CardBody className="space-y-4">
          <Field
            label="Document Footer Message"
            htmlFor="footerMessage"
            required
            hint="Printed at the foot of every official document."
            error={errors.footerMessage}
          >
            <Textarea
              id="footerMessage"
              name="footerMessage"
              defaultValue={defaults.footerMessage}
              rows={2}
              required
            />
          </Field>

          <Checkbox
            name="resultPortalEnabled"
            defaultChecked={defaults.resultPortalEnabled}
            label="Enable the public result portal so students and parents can look up published results without signing in"
          />
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>
          {!pending && <Save className="h-4 w-4" />}
          Save Academy Settings
        </Button>
      </div>
    </form>
  );
}
