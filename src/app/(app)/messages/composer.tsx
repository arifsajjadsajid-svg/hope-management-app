'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Send,
  Eye,
  AlertTriangle,
  Smartphone,
  Wand2,
} from 'lucide-react';
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
  Badge,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { TEMPLATES, PLACEHOLDERS, templateByKey, templateBody } from '@/lib/message-templates';
import { measureSms, describeSms, toGsmSafe } from '@/lib/sms';
import { createCampaignAction, previewMessageAction } from '@/server/actions/messages';
import type { BuiltRecipient } from '@/server/services/messaging';
import { cn } from '@/lib/utils';

export type Option = { id: string; label: string; parentId?: string };
type Channel = 'WHATSAPP' | 'SMS';

export function MessageComposer({
  sessionId,
  sessionName,
  classes,
  sections,
  students,
  exams,
}: {
  sessionId: string;
  sessionName: string;
  classes: Option[];
  sections: Option[];
  students: Option[];
  exams: { id: string; label: string; hasResults: boolean }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(createCampaignAction, null);
  const handled = React.useRef<unknown>(null);

  const [channel, setChannel] = React.useState<Channel>('WHATSAPP');
  const [templateKey, setTemplateKey] = React.useState('RESULT_PUBLISHED');
  const template = templateByKey(templateKey);

  const [title, setTitle] = React.useState(template.title);
  const [body, setBody] = React.useState(templateBody('RESULT_PUBLISHED', 'WHATSAPP'));
  const [audience, setAudience] = React.useState<'ALL' | 'CLASS' | 'SECTION' | 'STUDENT'>('CLASS');
  const [audienceRef, setAudienceRef] = React.useState('');
  const [examId, setExamId] = React.useState(exams[0]?.id ?? '');

  const [preview, setPreview] = React.useState<BuiltRecipient | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok && state.data) {
      toast.success(state.message ?? 'Message prepared.');
      router.push(`/messages/${state.data.id}`);
      router.refresh();
    } else if (state && !state.ok) {
      toast.error('Could not prepare the message', state.error);
    }
  }, [state, router, toast]);

  const applyTemplate = (key: string) => {
    const next = templateByKey(key);
    setTemplateKey(key);
    setTitle(next.title);
    setBody(templateBody(key, channel));
    setPreview(null);
  };

  /** Switching channel swaps to that channel's wording of the same template. */
  const switchChannel = (next: Channel) => {
    setChannel(next);
    setBody(templateBody(templateKey, next));
    setPreview(null);
  };

  const audienceOptions =
    audience === 'CLASS'
      ? classes
      : audience === 'SECTION'
        ? sections
        : audience === 'STUDENT'
          ? students
          : [];

  React.useEffect(() => {
    setAudienceRef('');
    setPreview(null);
  }, [audience]);

  /** Inserts a placeholder at the cursor rather than at the end. */
  const insertToken = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((prev) => `${prev}${token}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const runPreview = async () => {
    setPreviewing(true);
    const result = await previewMessageAction({
      body,
      audience,
      audienceRef: audienceRef || undefined,
      sessionId,
      examId: examId || undefined,
      channel,
    });
    setPreviewing(false);

    if (result.ok) {
      setPreview(result.data?.recipient ?? null);
      if (!result.data?.recipient) {
        toast.warning('Nobody matches that audience', 'No active student was found to preview.');
      }
    } else {
      toast.error('Could not build the preview', result.error);
    }
  };

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const isSms = channel === 'SMS';
  const examNeeded = template.requiresExam;
  const resultNeeded = template.requiresResult;
  const chosenExam = exams.find((e) => e.id === examId);

  // Cost is measured on the rendered message, because a student's own name can
  // be what pushes a message into the expensive encoding.
  const metrics = React.useMemo(
    () => measureSms(preview?.renderedBody ?? body),
    [preview?.renderedBody, body],
  );

  const readyToSubmit =
    title.trim().length > 0 &&
    body.trim().length >= 10 &&
    (audience === 'ALL' || audienceRef.length > 0) &&
    (!examNeeded || examId.length > 0);

  return (
    <form action={formAction} className="grid gap-5 xl:grid-cols-5">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="template" value={templateKey} />
      <input type="hidden" name="channel" value={channel} />

      {/* ------------------------------------------------------- composer */}
      <div className="space-y-5 xl:col-span-3">
        {state && !state.ok && (
          <Alert tone="danger" title="Could not prepare the message">
            {state.error}
          </Alert>
        )}

        <Card>
          <CardHeader
            title="How should it be sent?"
            description="Both channels use the same contact numbers held on the student records."
          />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {[
              {
                value: 'WHATSAPP' as const,
                icon: MessageSquare,
                label: 'WhatsApp',
                detail: 'Free. Long messages. Opens WhatsApp with the text ready.',
              },
              {
                value: 'SMS' as const,
                icon: Smartphone,
                label: 'SMS',
                detail: 'Reaches any phone, smart or not. Charged per 160 characters.',
              },
            ].map((option) => {
              const Icon = option.icon;
              const active = channel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => switchChannel(option.value)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition',
                    active
                      ? 'border-navy-900 bg-navy-50/60'
                      : 'border-slate-200 bg-white hover:border-navy-300',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', active ? 'text-navy-900' : 'text-slate-400')} />
                    <span className="text-[13.5px] font-bold text-navy-900">{option.label}</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-slate-500">
                    {option.detail}
                  </span>
                </button>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Who should receive this?"
            description={`Families enrolled in session ${sessionName}.`}
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience" htmlFor="audience" required>
              <Select
                id="audience"
                name="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
              >
                <option value="CLASS">A whole class</option>
                <option value="SECTION">One section</option>
                <option value="STUDENT">One student</option>
                <option value="ALL">Every active student</option>
              </Select>
            </Field>

            {audience !== 'ALL' && (
              <Field
                label={
                  audience === 'CLASS' ? 'Class' : audience === 'SECTION' ? 'Section' : 'Student'
                }
                htmlFor="audienceRef"
                required
                error={errors.audienceRef}
              >
                <Select
                  id="audienceRef"
                  name="audienceRef"
                  value={audienceRef}
                  onChange={(e) => {
                    setAudienceRef(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">Choose…</option>
                  {audienceOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label="Examination"
              htmlFor="examId"
              required={examNeeded}
              hint={
                examNeeded
                  ? 'This template uses examination details, so one must be chosen.'
                  : 'Optional — only needed if your message mentions an examination.'
              }
              className={audience === 'ALL' ? undefined : 'sm:col-span-2'}
            >
              <Select
                id="examId"
                name="examId"
                value={examId}
                onChange={(e) => {
                  setExamId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">No examination</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What should it say?"
            description={
              isSms
                ? 'SMS wordings are kept short. Placeholders are replaced with each family’s own details.'
                : 'Pick a template or write your own. Placeholders are replaced with each family’s own details.'
            }
          />
          <CardBody className="space-y-4">
            <Field label="Template" htmlFor="template">
              <Select
                id="template"
                value={templateKey}
                onChange={(e) => applyTemplate(e.target.value)}
              >
                {TEMPLATES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p className="field-hint">{template.description}</p>
            </Field>

            {resultNeeded && chosenExam && !chosenExam.hasResults && (
              <Alert tone="warning" title="This examination has no processed results">
                Marks such as percentage, grade and position will show as “—”. Process the result
                first, or choose a template that does not use them.
              </Alert>
            )}

            <Field label="Message title" htmlFor="title" required error={errors.title}>
              <Input
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <p className="field-hint">
                For your own records only — parents never see this line.
              </p>
            </Field>

            <Field label="Message" htmlFor="body" required error={errors.body}>
              <Textarea
                id="body"
                name="body"
                ref={bodyRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setPreview(null);
                }}
                rows={isSms ? 8 : 16}
                required
                className="font-mono text-[12.5px] leading-relaxed"
              />
            </Field>

            {isSms && <SmsCostPanel metrics={metrics} onFix={() => setBody(toGsmSafe(body))} />}

            <div>
              <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-navy-700">
                Insert a placeholder
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((placeholder) => {
                  const blocked =
                    (placeholder.needsExam && !examId) ||
                    (placeholder.needsResult && chosenExam && !chosenExam.hasResults);
                  return (
                    <button
                      key={placeholder.token}
                      type="button"
                      onClick={() => insertToken(placeholder.token)}
                      title={
                        blocked
                          ? 'Choose an examination with processed results to use this'
                          : placeholder.label
                      }
                      className={cn(
                        'rounded-md border px-2 py-1 font-mono text-[11px] transition',
                        blocked
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-slate-300 bg-white text-navy-700 hover:border-royal-400 hover:bg-royal-50',
                      )}
                    >
                      {placeholder.token}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* -------------------------------------------------------- preview */}
      <div className="xl:col-span-2">
        <div className="sticky top-24 space-y-5">
          <Card>
            <CardHeader
              title="Preview"
              description="Exactly what the first family in this audience will receive."
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runPreview}
                  loading={previewing}
                  disabled={audience !== 'ALL' && !audienceRef}
                >
                  {!previewing && <Eye className="h-4 w-4" />}
                  Refresh
                </Button>
              }
            />
            <CardBody>
              {!preview ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <MessageSquare className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-3 text-[13px] font-semibold text-navy-900">No preview yet</p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {audience !== 'ALL' && !audienceRef
                      ? 'Choose an audience, then press Refresh.'
                      : 'Press Refresh to render the message with real student data.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
                    <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">
                      {preview.studentName}
                    </Badge>
                    <span className="text-slate-500">
                      {preview.className} — {preview.sectionName}
                    </span>
                  </div>

                  {isSms ? (
                    <div className="rounded-xl bg-slate-200 p-3">
                      <div className="max-w-full rounded-2xl rounded-bl-none bg-white px-3.5 py-2.5 shadow-sm">
                        <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-navy-900">
                          {preview.renderedBody}
                        </p>
                      </div>
                      <p className="mt-1.5 text-center text-[10.5px] text-slate-500">
                        Text message to {preview.contactName}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#e5ddd5] p-3">
                      <div className="ml-auto max-w-full rounded-lg rounded-br-none bg-[#dcf8c6] px-3 py-2 shadow-sm">
                        <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-[#111b21]">
                          {preview.renderedBody}
                        </p>
                      </div>
                    </div>
                  )}

                  <dl className="mt-3.5 space-y-1.5 text-[12px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Goes to</dt>
                      <dd className="font-semibold text-navy-900">
                        {preview.contactName}{' '}
                        <span className="font-normal text-slate-500">({preview.contactLabel})</span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Number</dt>
                      <dd className="font-semibold text-navy-900 tabular">
                        {preview.phone || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Characters</dt>
                      <dd className="font-semibold text-navy-900 tabular">
                        {preview.renderedBody.length}
                      </dd>
                    </div>
                  </dl>

                  {isSms && (
                    <SmsCostPanel
                      metrics={metrics}
                      onFix={() => setBody(toGsmSafe(body))}
                      compact
                    />
                  )}

                  {preview.problem && (
                    <Alert tone="warning" className="mt-3">
                      <span className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {preview.problem}
                      </span>
                    </Alert>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={pending}
                disabled={!readyToSubmit}
              >
                {!pending && <Send className="h-4 w-4" />}
                Build the send list
              </Button>
              <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
                {isSms
                  ? 'This prepares one text message per family. Send them from a phone or tablet, or export the list for your operator’s bulk SMS portal.'
                  : 'This prepares one WhatsApp message per family and opens the send list. Nothing is transmitted until you open each chat and press send.'}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </form>
  );
}

/**
 * Shows what an SMS will actually cost, and offers to strip the typographic
 * characters that silently triple it.
 */
function SmsCostPanel({
  metrics,
  onFix,
  compact,
}: {
  metrics: ReturnType<typeof measureSms>;
  onFix: () => void;
  compact?: boolean;
}) {
  const expensive = metrics.encoding === 'UCS-2';
  const multi = metrics.segments > 1;

  return (
    <div
      className={cn(
        'rounded-lg border px-3.5 py-3',
        expensive
          ? 'border-rose-300 bg-rose-50'
          : multi
            ? 'border-amber-300 bg-amber-50'
            : 'border-emerald-300 bg-emerald-50',
        compact && 'mt-3',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            'text-[12.5px] font-bold',
            expensive ? 'text-rose-800' : multi ? 'text-amber-800' : 'text-emerald-800',
          )}
        >
          {metrics.segments === 0 ? 'Empty message' : `${metrics.segments} SMS per recipient`}
        </p>
        <p className="text-[11.5px] font-semibold text-slate-600 tabular">
          {metrics.length} / {metrics.perSegment * Math.max(1, metrics.segments)} characters
        </p>
      </div>

      <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">{describeSms(metrics)}</p>

      {expensive && (
        <div className="mt-2.5 border-t border-rose-200 pt-2.5">
          <p className="text-[11.5px] leading-relaxed text-rose-800">
            These characters fall outside the plain SMS alphabet, so every segment drops from 160
            to 70 characters:{' '}
            <strong className="font-mono">
              {metrics.offenders
                .slice(0, 6)
                .map((o) => `${o.char}${o.count > 1 ? `×${o.count}` : ''}`)
                .join('  ')}
            </strong>
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onFix}>
            <Wand2 className="h-3.5 w-3.5" />
            Replace them with plain equivalents
          </Button>
        </div>
      )}
    </div>
  );
}
