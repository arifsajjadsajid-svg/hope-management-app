'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  LinkButton,
} from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import {
  previewMarksImportAction,
  commitMarksImportAction,
  type MarksImportPreview,
} from '@/server/actions/import';

export function MarksImportWizard({
  examSubjectId,
  subjectLabel,
  disabled,
  disabledReason,
}: {
  examSubjectId: string;
  subjectLabel: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, uploading] = useActionState(previewMarksImportAction, null);
  const [preview, setPreview] = React.useState<MarksImportPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const handled = React.useRef<unknown>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok && state.data) {
      setPreview(state.data);
      toast.info('File validated', state.message);
    } else if (state && !state.ok) {
      toast.error('Could not read the file', state.error);
    }
  }, [state, toast]);

  // Reset the preview whenever the operator picks a different subject.
  React.useEffect(() => {
    setPreview(null);
    handled.current = null;
  }, [examSubjectId]);

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    const result = await commitMarksImportAction({
      fileName: preview.fileName,
      examSubjectId,
      rows: preview.rows,
    });
    setCommitting(false);
    setConfirmOpen(false);

    if (result.ok) {
      toast.success(result.message ?? 'Marks imported.');
      setPreview(null);
      router.refresh();
    } else {
      toast.error('Import failed', result.error);
    }
  };

  if (disabled) {
    return (
      <Alert tone="warning" title="Import is not available">
        {disabledReason}
      </Alert>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardHeader
          title={`Upload marks — ${subjectLabel}`}
          description="Excel (.xlsx) or CSV. Nothing is saved until you confirm the preview."
          actions={
            <LinkButton
              href={`/api/export/template?type=marks&examSubjectId=${examSubjectId}`}
              variant="outline"
              size="sm"
              download
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download Template
            </LinkButton>
          }
        />
        <CardBody>
          {state && !state.ok && (
            <Alert tone="danger" title="Could not read the file" className="mb-4">
              {state.error}
            </Alert>
          )}

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="examSubjectId" value={examSubjectId} />

            <label
              htmlFor="marks-file"
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-royal-400 hover:bg-royal-50/40"
            >
              <Upload className="h-8 w-8 text-slate-400" />
              <span className="mt-3 text-[14px] font-bold text-navy-900">
                Choose the completed marks file
              </span>
              <span className="mt-1 text-[12.5px] text-slate-500">
                Candidates are matched on roll number. ABS, EX, MED and WH are accepted in the marks
                column.
              </span>
              <input
                id="marks-file"
                name="file"
                type="file"
                accept=".xlsx,.csv"
                required
                className="mt-4 block w-full max-w-sm text-[12.5px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-white hover:file:bg-navy-800"
              />
            </label>

            <div className="flex justify-end">
              <Button type="submit" loading={uploading}>
                {!uploading && <Upload className="h-4 w-4" />}
                Upload &amp; Validate
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Rows in File" value={preview.summary.total} tone="navy" />
        <StatCard label="Ready to Import" value={preview.summary.importable} tone="emerald" />
        <StatCard
          label="Rejected"
          value={preview.summary.errors}
          tone={preview.summary.errors ? 'rose' : 'slate'}
        />
        <StatCard
          label="Matched Candidates"
          value={preview.summary.matched}
          tone="royal"
          hint={`of ${preview.summary.total} rows`}
        />
      </section>

      {preview.summary.errors > 0 && (
        <Alert tone="warning" title={`${preview.summary.errors} row(s) will be skipped`} className="mb-5">
          Rows with an unmatched roll number, a mark above the maximum or a blank cell are never
          imported.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Preview — ${preview.fileName}`}
          description={`${preview.subjectName} · maximum ${preview.maxMarks} marks`}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  handled.current = null;
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Another file
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={preview.summary.importable === 0}
              >
                <CheckCircle2 className="h-4 w-4" />
                Import {preview.summary.importable} mark
                {preview.summary.importable === 1 ? '' : 's'}
              </Button>
            </>
          }
        />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th align="center">Row</Th>
                <Th align="center">Status</Th>
                <Th align="center">Roll No.</Th>
                <Th>Student</Th>
                <Th align="center">Theory</Th>
                <Th align="center">Practical</Th>
                <Th align="center">Total</Th>
                <Th>Issues</Th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.rowNumber} className={row.importable ? undefined : 'bg-rose-50/40'}>
                  <Td align="center" className="tabular text-slate-500">{row.rowNumber}</Td>
                  <Td align="center">
                    {row.importable ? (
                      <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready
                      </Badge>
                    ) : (
                      <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">
                        <XCircle className="h-3 w-3" />
                        Skipped
                      </Badge>
                    )}
                  </Td>
                  <Td align="center" className="tabular font-semibold">{row.rollNumber || '—'}</Td>
                  <Td className="text-navy-900">{row.studentName || '—'}</Td>
                  <Td align="center" className="tabular">{row.special ?? row.theory ?? '—'}</Td>
                  <Td align="center" className="tabular">{row.special ? '—' : row.practical || '—'}</Td>
                  <Td align="center" className="font-bold tabular">
                    {row.special ?? (row.total ?? '—')}
                  </Td>
                  <Td>
                    {row.issues.length === 0 ? (
                      <span className="text-[12px] text-slate-400">None</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {row.issues.map((issue, index) => (
                          <li
                            key={index}
                            className={`text-[11.5px] ${
                              issue.level === 'ERROR' ? 'text-rose-700' : 'text-amber-700'
                            }`}
                          >
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={commit}
        title="Confirm marks import"
        confirmLabel={`Import ${preview.summary.importable}`}
        tone="primary"
        loading={committing}
        message={
          <>
            <strong>{preview.summary.importable}</strong> mark(s) will be written for{' '}
            <strong>{preview.subjectName}</strong>. Existing marks for the same candidates are
            replaced, and the change is recorded in the audit log.
          </>
        }
      />
    </>
  );
}
