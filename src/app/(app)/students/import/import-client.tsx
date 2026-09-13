'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Select,
  Badge,
  LinkButton,
} from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import {
  previewStudentImportAction,
  commitStudentImportAction,
  type StudentImportPreview,
} from '@/server/actions/import';

export type Option = { id: string; label: string; parentId?: string };

const STEPS = ['Upload file', 'Preview & validate', 'Confirm import'] as const;

function StepBar({ current }: { current: number }) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
                done
                  ? 'bg-emerald-600 text-white'
                  : active
                    ? 'bg-navy-900 text-gold-300'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span
              className={`text-[13px] font-semibold ${
                active ? 'text-navy-900' : done ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {step}
            </span>
            {index < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

export function StudentImportWizard({
  sessions,
  classes,
  sections,
  defaultSessionId,
}: {
  sessions: Option[];
  classes: Option[];
  sections: Option[];
  defaultSessionId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, uploading] = useActionState(previewStudentImportAction, null);
  const [preview, setPreview] = React.useState<StudentImportPreview | null>(null);
  const [sessionId, setSessionId] = React.useState(defaultSessionId ?? '');
  const [classId, setClassId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
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

  const visibleClasses = classes.filter((c) => !sessionId || c.parentId === sessionId);
  const visibleSections = sections.filter((s) => !classId || s.parentId === classId);

  React.useEffect(() => {
    if (classId && !visibleClasses.some((c) => c.id === classId)) {
      setClassId('');
      setSectionId('');
    }
  }, [classId, visibleClasses]);

  React.useEffect(() => {
    if (sectionId && !visibleSections.some((s) => s.id === sectionId)) setSectionId('');
  }, [sectionId, visibleSections]);

  const step = !preview ? 0 : 1;
  const ready = Boolean(preview && sessionId && classId && sectionId && preview.summary.importable > 0);

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    const result = await commitStudentImportAction({
      fileName: preview.fileName,
      sessionId,
      classId,
      sectionId,
      rows: preview.rows,
    });
    setCommitting(false);
    setConfirmOpen(false);

    if (result.ok) {
      toast.success(result.message ?? 'Import complete.');
      setPreview(null);
      router.push('/students');
      router.refresh();
    } else {
      toast.error('Import failed', result.error);
    }
  };

  return (
    <>
      <StepBar current={step} />

      {!preview ? (
        <Card>
          <CardHeader
            title="Upload a student roster"
            description="Excel (.xlsx) or CSV, up to 5 MB and 2000 rows. Nothing is saved until you confirm."
            actions={
              <LinkButton
                href="/api/export/template?type=students"
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
              <label
                htmlFor="import-file"
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-royal-400 hover:bg-royal-50/40"
              >
                <Upload className="h-8 w-8 text-slate-400" />
                <span className="mt-3 text-[14px] font-bold text-navy-900">
                  Choose an Excel or CSV file
                </span>
                <span className="mt-1 text-[12.5px] text-slate-500">
                  Column headers are matched flexibly — “Admission No.”, “Adm No” and “Admission
                  Number” all work.
                </span>
                <input
                  id="import-file"
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

            <div className="mt-5 rounded-lg bg-slate-50 p-4 text-[12.5px] leading-relaxed text-slate-600">
              <p className="mb-1.5 font-bold text-navy-900">Required columns</p>
              <p>
                <strong>Admission Number</strong>, <strong>Student Name</strong> and{' '}
                <strong>Father Name</strong>. Everything else is optional. Rows with a duplicate or
                missing admission number are rejected and never imported silently.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-5">
            <StatCard label="Rows in File" value={preview.summary.total} tone="navy" />
            <StatCard label="Ready to Import" value={preview.summary.importable} tone="emerald" />
            <StatCard
              label="Rejected"
              value={preview.summary.errors}
              tone={preview.summary.errors ? 'rose' : 'slate'}
            />
            <StatCard
              label="Warnings"
              value={preview.summary.warnings}
              tone={preview.summary.warnings ? 'amber' : 'slate'}
            />
            <StatCard
              label="Duplicates"
              value={preview.summary.duplicates}
              tone={preview.summary.duplicates ? 'rose' : 'slate'}
            />
          </section>

          <Card className="mb-5">
            <CardHeader
              title="Where should these students be enrolled?"
              description="Every imported student is placed in this class and section."
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPreview(null);
                    handled.current = null;
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Choose another file
                </Button>
              }
            />
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <Field label="Academic Session" htmlFor="import-session" required>
                <Select
                  id="import-session"
                  value={sessionId}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    setClassId('');
                    setSectionId('');
                  }}
                >
                  <option value="">Select session…</option>
                  {sessions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Class" htmlFor="import-class" required>
                <Select
                  id="import-class"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setSectionId('');
                  }}
                  disabled={!sessionId}
                >
                  <option value="">Select class…</option>
                  {visibleClasses.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Section" htmlFor="import-section" required>
                <Select
                  id="import-section"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  disabled={!classId}
                >
                  <option value="">Select section…</option>
                  {visibleSections.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>

          {preview.summary.errors > 0 && (
            <Alert tone="warning" title={`${preview.summary.errors} row(s) will be skipped`} className="mb-5">
              Rows with errors are never imported. Correct them in the file and upload it again, or
              continue to import only the valid rows.
            </Alert>
          )}

          <Card>
            <CardHeader
              title={`Preview — ${preview.fileName}`}
              description="Every row is checked against the database before anything is written."
              actions={
                <Button onClick={() => setConfirmOpen(true)} disabled={!ready}>
                  <CheckCircle2 className="h-4 w-4" />
                  Import {preview.summary.importable} student
                  {preview.summary.importable === 1 ? '' : 's'}
                </Button>
              }
            />
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th align="center">Row</Th>
                    <Th align="center">Status</Th>
                    <Th>Admission No.</Th>
                    <Th>Student Name</Th>
                    <Th>Father Name</Th>
                    <Th align="center">Gender</Th>
                    <Th align="center">DOB</Th>
                    <Th align="center">Roll</Th>
                    <Th>Contact</Th>
                    <Th>Issues</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className={row.importable ? undefined : 'bg-rose-50/40'}>
                      <Td align="center" className="tabular text-slate-500">
                        {row.rowNumber}
                      </Td>
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
                      <Td className="whitespace-nowrap tabular font-medium">{row.admissionNumber || '—'}</Td>
                      <Td className="font-semibold text-navy-900">{row.fullName || '—'}</Td>
                      <Td className="text-slate-700">{row.fatherName || '—'}</Td>
                      <Td align="center" className="text-slate-600">{row.gender}</Td>
                      <Td align="center" className="tabular text-slate-600">{row.dateOfBirth || '—'}</Td>
                      <Td align="center" className="tabular text-slate-600">{row.classRollNumber || 'auto'}</Td>
                      <Td className="whitespace-nowrap tabular text-[12.5px] text-slate-600">
                        {row.parentPhone || '—'}
                      </Td>
                      <Td>
                        {row.issues.length === 0 ? (
                          <span className="text-[12px] text-slate-400">None</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {row.issues.map((issue, index) => (
                              <li
                                key={index}
                                className={`flex items-start gap-1 text-[11.5px] ${
                                  issue.level === 'ERROR' ? 'text-rose-700' : 'text-amber-700'
                                }`}
                              >
                                {issue.level === 'ERROR' ? (
                                  <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                ) : (
                                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                )}
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
            title="Confirm student import"
            confirmLabel={`Import ${preview.summary.importable}`}
            tone="primary"
            loading={committing}
            message={
              <>
                <strong>{preview.summary.importable}</strong> student(s) will be created and enrolled
                in <strong>{visibleSections.find((s) => s.id === sectionId)?.label}</strong>.
                {preview.summary.errors > 0 && (
                  <span className="mt-2 block">
                    {preview.summary.errors} row(s) with errors will be skipped.
                  </span>
                )}
              </>
            }
          />
        </>
      )}
    </>
  );
}
