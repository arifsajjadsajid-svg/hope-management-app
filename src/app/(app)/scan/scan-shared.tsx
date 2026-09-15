'use client';

import * as React from 'react';
import {
  Camera,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  ScanLine,
  Trash2,
  Upload,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Alert, Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import type { RowIssue } from '@/lib/scan/marks';
import type { ScanKind } from '@/lib/scan/schemas';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------- the files */

export type SourceFile = { name: string; url: string; isPdf: boolean };

export type ReadPage<R> = { source: number; reading: R };

type PageAssessment = { documentKind: string; legibility: string; problem: string | null };

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_LONG_EDGE = 2400;
const MAX_FILES = 20;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Shrinks a phone photo before it is uploaded. A modern phone takes 5–10 MB
 * pictures; the server accepts 4 MB, and the reader sees no more detail than
 * about 2400 pixels along the long edge anyway.
 */
async function prepareFile(file: File): Promise<{ blob: Blob; name: string; source: SourceFile }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('This PDF is larger than 4 MB. Split it into smaller files, or photograph the pages.');
    }
    const blob = file.type ? file : new Blob([file], { type: 'application/pdf' });
    return { blob, name: file.name, source: { name: file.name, url: URL.createObjectURL(blob), isPdf: true } };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      'This photo could not be opened. iPhone HEIC photos only open in Safari — set the camera to "Most Compatible", or save it as JPEG.',
    );
  }

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photo.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = 0.88;
  let blob = await toBlob(canvas, quality);
  while (blob && blob.size > MAX_UPLOAD_BYTES * 0.9 && quality > 0.5) {
    quality -= 0.15;
    blob = await toBlob(canvas, quality);
  }
  if (!blob) throw new Error('This browser could not prepare the photo.');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('This photo is still larger than 4 MB after shrinking.');

  const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
  return { blob, name, source: { name: file.name, url: URL.createObjectURL(blob), isPdf: false } };
}

async function readOne(kind: ScanKind, blob: Blob, name: string, fields: Record<string, string>) {
  const body = new FormData();
  body.set('kind', kind);
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set('file', blob, name);

  const response = await fetch('/api/scan/extract', { method: 'POST', body });
  let payload: { error?: string; reading?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    // A timeout at the hosting platform returns a page rather than JSON.
  }
  if (!response.ok || !payload?.reading) {
    throw new Error(
      payload?.error ??
        (response.status === 504
          ? 'Reading this page took too long. Try a closer photo of just the page.'
          : `The page could not be read (error ${response.status}).`),
    );
  }
  return payload.reading;
}

const EXPECTED_KIND: Record<ScanKind, string> = {
  marks: 'MARKS_SHEET',
  students: 'STUDENT_LIST',
  admissions: 'ADMISSION_FORM',
};

const KIND_WORDS: Record<string, string> = {
  MARKS_SHEET: 'a marks sheet',
  STUDENT_LIST: 'a student list',
  ADMISSION_FORM: 'an admission form',
  OTHER: 'not a school record',
};

export type ReadOutcome<R> = {
  pages: ReadPage<R>[];
  files: SourceFile[];
  /** Things the office should know before trusting the rows. */
  notices: string[];
};

type Item = {
  id: string;
  file: File;
  status: 'waiting' | 'reading' | 'done' | 'failed';
  message?: string;
};

/**
 * Step one of every scan: choose photos or PDFs, send them one at a time to be
 * read, and hand the readings to the review screen.
 */
export function UploadStep<R extends PageAssessment>({
  kind,
  title,
  description,
  hint,
  fields,
  disabledReason,
  onRead,
}: {
  kind: ScanKind;
  title: string;
  description: React.ReactNode;
  hint?: React.ReactNode;
  fields: Record<string, string>;
  disabledReason?: string | null;
  onRead: (outcome: ReadOutcome<R>) => void;
}) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      status: 'waiting' as const,
    }));
    setItems((current) => [...current, ...incoming].slice(0, MAX_FILES));
  };

  const setItem = (id: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const run = async () => {
    setBusy(true);
    const pages: ReadPage<R>[] = [];
    const files: SourceFile[] = [];
    const notices: string[] = [];

    for (const item of items) {
      setItem(item.id, { status: 'reading', message: undefined });
      try {
        const prepared = await prepareFile(item.file);
        const reading = (await readOne(kind, prepared.blob, prepared.name, fields)) as R;
        const source = files.length;
        files.push(prepared.source);
        pages.push({ source, reading });

        const label = `File ${source + 1} (${item.file.name})`;
        if (reading.documentKind !== EXPECTED_KIND[kind]) {
          notices.push(`${label} looks like ${KIND_WORDS[reading.documentKind] ?? 'a different document'}, not what was expected. Check its rows carefully.`);
        }
        if (reading.legibility !== 'GOOD' || reading.problem) {
          notices.push(`${label}: ${reading.problem ?? 'parts of the page were hard to read.'}`);
        }
        setItem(item.id, { status: 'done' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not be read.';
        notices.push(`${item.file.name} was not read: ${message}`);
        setItem(item.id, { status: 'failed', message });
      }
    }

    setBusy(false);
    if (pages.length > 0) onRead({ pages, files, notices });
  };

  const readable = items.length > 0 && !busy && !disabledReason;

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-4">
        {disabledReason && <Alert tone="warning">{disabledReason}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-royal-400 hover:bg-royal-50/40 disabled:opacity-60"
          >
            <Upload className="h-7 w-7 text-slate-400" />
            <span className="mt-2 text-[14px] font-bold text-navy-900">Choose photos or PDFs</span>
            <span className="mt-1 text-[12px] text-slate-500">JPEG, PNG or PDF · several at once</span>
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-royal-400 hover:bg-royal-50/40 disabled:opacity-60"
          >
            <Camera className="h-7 w-7 text-slate-400" />
            <span className="mt-2 text-[14px] font-bold text-navy-900">Take a photo</span>
            <span className="mt-1 text-[12px] text-slate-500">On a phone, opens the camera</span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />

        {items.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                <span className="w-5 text-right tabular text-slate-400">{index + 1}</span>
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy-900">{item.file.name}</p>
                  {item.message && <p className="text-[12px] text-rose-700">{item.message}</p>}
                </div>
                {item.status === 'reading' && (
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-royal-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…
                  </span>
                )}
                {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {item.status === 'failed' && <XCircle className="h-4 w-4 text-rose-600" />}
                {item.status !== 'reading' && !busy && (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((i) => i.id !== item.id))}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <p className="text-[12.5px] text-slate-500">
            Each page usually takes 30 seconds to two minutes. Keep this page open until it finishes.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px] leading-relaxed text-slate-500">{hint}</div>
          <Button onClick={run} disabled={!readable} loading={busy}>
            {!busy && <ScanLine className="h-4 w-4" />}
            {items.length > 1 ? `Read ${items.length} files` : 'Read document'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------- review */

export function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <Alert tone="warning" title="Check these before saving" className="mb-5">
      <ul className="list-disc space-y-0.5 pl-5">
        {notices.map((notice, index) => (
          <li key={index}>{notice}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function IssueList({
  issues,
  onConfirm,
}: {
  issues: RowIssue[];
  /** Clears one uncertain reading once a person has looked at it. */
  onConfirm: (field: string) => void;
}) {
  if (issues.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  return (
    <ul className="min-w-[220px] space-y-1">
      {issues.map((issue, index) => (
        <li
          key={index}
          className={cn(
            'flex items-start gap-1 text-[11.5px] leading-snug',
            issue.level === 'ERROR' ? 'text-rose-700' : issue.level === 'CHECK' ? 'text-amber-800' : 'text-slate-600',
          )}
        >
          {issue.level === 'ERROR' ? (
            <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
          ) : issue.level === 'CHECK' ? (
            <Eye className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          <span>
            {issue.message}
            {issue.level === 'CHECK' && issue.field && (
              <button
                type="button"
                onClick={() => onConfirm(issue.field!)}
                className="ml-1.5 rounded bg-amber-100 px-1.5 py-px font-bold text-amber-900 hover:bg-amber-200"
              >
                Looks right
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tailwind classes for an editable cell: amber while unchecked, red when wrong. */
export function cellTone(field: string, issues: RowIssue[], unclear: string[]): string {
  if (issues.some((i) => i.level === 'ERROR' && i.field === field)) return 'border-rose-400 bg-rose-50';
  if (unclear.includes(field)) return 'border-amber-400 bg-amber-50';
  return '';
}

export function SourceButton({ file, onOpen }: { file: SourceFile | undefined; onOpen: () => void }) {
  if (!file) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-royal-300 hover:text-royal-700"
      title={`See ${file.name}`}
    >
      <Eye className="h-3 w-3" /> View
    </button>
  );
}

export function SourceViewer({ file, onClose }: { file: SourceFile | null; onClose: () => void }) {
  if (!file) return null;
  return (
    <Modal open onClose={onClose} title={file.name} size="xl">
      {file.isPdf ? (
        <div className="space-y-3">
          <iframe src={file.url} title={file.name} className="h-[70vh] w-full rounded-lg border border-slate-200" />
          <a href={file.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-royal-700">
            Open the PDF in a new tab
          </a>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={file.name} className="mx-auto max-h-[75vh] w-auto rounded-lg border border-slate-200" />
      )}
    </Modal>
  );
}

/** Frees the browser memory held by previews once they are no longer shown. */
export function releaseFiles(files: SourceFile[]) {
  for (const file of files) URL.revokeObjectURL(file.url);
}
