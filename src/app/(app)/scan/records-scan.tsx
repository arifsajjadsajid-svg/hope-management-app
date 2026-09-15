'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Hash, RotateCcw, Save } from 'lucide-react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import type { RowIssue } from '@/lib/scan/marks';
import {
  ENQUIRY_LABELS,
  enquiryRowsFromPages,
  numberBlankAdmissions,
  reviewEnquiries,
  reviewStudents,
  studentRowsFromPages,
  type EnquiryFields,
  type EnquiryScanRow,
  type RowReview,
  type StudentScanRow,
} from '@/lib/scan/records';
import type { StudentFields } from '@/lib/import-rules';
import type { AdmissionFormReading, StudentListReading } from '@/lib/scan/schemas';
import { commitEnquiryScanAction, commitStudentScanAction } from '@/server/actions/scan';
import {
  IssueList,
  Notices,
  SourceButton,
  SourceViewer,
  UploadStep,
  cellTone,
  releaseFiles,
  type SourceFile,
} from './scan-shared';

/* --------------------------------------------------------- editable grid */

type GridRow<F> = { key: string; source: number; include: boolean; fields: F; unclear: string[]; note: string };

type GridColumn<F> = { field: keyof F & string; label: string; width: string; always?: boolean };

function RecordGrid<F extends Record<string, string>>({
  rows,
  columns,
  review,
  files,
  onChange,
}: {
  rows: GridRow<F>[];
  columns: GridColumn<F>[];
  review: RowReview;
  files: SourceFile[];
  onChange: (rows: GridRow<F>[]) => void;
}) {
  const [viewing, setViewing] = React.useState<SourceFile | null>(null);

  // Only columns the pages actually filled in, plus the ones every record needs.
  const shown = columns.filter((c) => c.always || rows.some((r) => r.fields[c.field]?.trim()));

  const update = (key: string, change: (row: GridRow<F>) => GridRow<F>) =>
    onChange(rows.map((row) => (row.key === key ? change(row) : row)));

  return (
    <>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th align="center">Use</Th>
              {shown.map((column) => (
                <Th key={column.field} className="whitespace-nowrap">
                  {column.label}
                </Th>
              ))}
              <Th align="center">Page</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const issues: RowIssue[] = review.issues[row.key] ?? [];
              const showChecks = row.include && (issues.length > 0 || row.note);
              return (
                <React.Fragment key={row.key}>
                <tr className={cn(!row.include && 'opacity-50', showChecks && '[&>td]:border-b-0')}>
                  <Td align="center">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) => update(row.key, (r) => ({ ...r, include: e.target.checked }))}
                      aria-label="Include this row"
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </Td>
                  {shown.map((column) => (
                    <Td key={column.field}>
                      <input
                        value={row.fields[column.field] ?? ''}
                        onChange={(e) =>
                          update(row.key, (r) => ({
                            ...r,
                            fields: { ...r.fields, [column.field]: e.target.value },
                            unclear: r.unclear.filter((f) => f !== column.field),
                          }))
                        }
                        className={cn('field-input h-8 px-2 text-[13px]', column.width, cellTone(column.field, issues, row.unclear))}
                        aria-label={column.label}
                      />
                    </Td>
                  ))}
                  <Td align="center">
                    <SourceButton file={files[row.source]} onOpen={() => setViewing(files[row.source] ?? null)} />
                  </Td>
                </tr>
                {showChecks && (
                  <tr>
                    <td colSpan={shown.length + 2} className="!pb-3 !pl-14 !pt-0">
                      <div className="sticky left-14 max-w-[720px]">
                        <IssueList
                          issues={issues}
                          onConfirm={(field) =>
                            update(row.key, (r) => ({ ...r, unclear: r.unclear.filter((f) => f !== field) }))
                          }
                        />
                        {row.note && <p className="mt-1 text-[11.5px] italic text-slate-500">Reader’s note: “{row.note}”</p>}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      <SourceViewer file={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function ReviewStats({ review, readyLabel }: { review: RowReview; readyLabel: string }) {
  const { summary } = review;
  return (
    <section className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <StatCard label="Rows Read" value={summary.rows} tone="navy" hint={`${summary.included} included`} />
      <StatCard label={readyLabel} value={summary.ready} tone="emerald" />
      <StatCard label="To Check" value={summary.toCheck} tone={summary.toCheck ? 'amber' : 'slate'} hint="hard-to-read values" />
      <StatCard label="Problems" value={summary.blocked} tone={summary.blocked ? 'rose' : 'slate'} />
    </section>
  );
}

/* ------------------------------------------------------------- students */

export type Option = { id: string; label: string; parentId?: string };

const STUDENT_COLUMNS: GridColumn<StudentFields>[] = [
  { field: 'admissionNumber', label: 'Admission No.', width: 'w-28', always: true },
  { field: 'fullName', label: 'Student Name', width: 'w-44', always: true },
  { field: 'fatherName', label: 'Father Name', width: 'w-44', always: true },
  { field: 'motherName', label: 'Mother Name', width: 'w-40' },
  { field: 'dateOfBirth', label: 'Date of Birth', width: 'w-28', always: true },
  { field: 'gender', label: 'Gender', width: 'w-20', always: true },
  { field: 'bformCnic', label: 'B-Form / CNIC', width: 'w-36' },
  { field: 'parentPhone', label: 'Parent Phone', width: 'w-32', always: true },
  { field: 'whatsappNumber', label: 'WhatsApp', width: 'w-32' },
  { field: 'studentPhone', label: 'Student Phone', width: 'w-32' },
  { field: 'email', label: 'Email', width: 'w-44' },
  { field: 'address', label: 'Address', width: 'w-56' },
  { field: 'previousSchool', label: 'Previous School', width: 'w-40' },
  { field: 'registrationNo', label: 'Registration No.', width: 'w-28' },
  { field: 'classRollNumber', label: 'Class Roll', width: 'w-16' },
];

export function StudentsScan({
  sessions,
  classes,
  sections,
  defaultSessionId,
  context,
}: {
  sessions: Option[];
  classes: Option[];
  sections: Option[];
  defaultSessionId?: string;
  context: { existingAdmissions: string[]; existingRegistrations: string[] };
}) {
  const router = useRouter();
  const toast = useToast();

  const [files, setFiles] = React.useState<SourceFile[]>([]);
  const [notices, setNotices] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<StudentScanRow[] | null>(null);
  const [sessionId, setSessionId] = React.useState(defaultSessionId ?? '');
  const [classId, setClassId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [startNumber, setStartNumber] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);

  const review = React.useMemo(() => (rows ? reviewStudents(rows, context) : null), [rows, context]);

  const visibleClasses = classes.filter((c) => c.parentId === sessionId);
  const visibleSections = sections.filter((s) => s.parentId === classId);

  const reset = () => {
    releaseFiles(files);
    setFiles([]);
    setNotices([]);
    setRows(null);
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    const result = await commitStudentScanAction({
      sessionId,
      classId,
      sectionId,
      fileNames: files.map((f) => f.name),
      rows,
    });
    setSaving(false);
    setConfirmOpen(false);
    if (result.ok) {
      toast.success(result.message ?? 'Students added.');
      setSaved(result.message ?? 'Students added.');
      reset();
      router.refresh();
    } else {
      toast.error('Nothing was saved', result.error);
    }
  };

  if (!rows || !review) {
    return (
      <>
        {saved && (
          <Alert tone="success" title={saved} className="mb-5">
            See them under <Link href="/students" className="font-semibold underline">All Students</Link>.
          </Alert>
        )}
        <UploadStep<StudentListReading>
          kind="students"
          title="Scan a student list or register"
          description="Photos or a PDF of a class list, admission register or roster from another school system."
          hint="Every student needs an admission number, name and father’s name. Blank admission numbers can be numbered for you on the next step."
          fields={{}}
          onRead={({ pages, files: read, notices: found }) => {
            setSaved(null);
            setFiles(read);
            setNotices(found);
            setRows(studentRowsFromPages(pages));
          }}
        />
      </>
    );
  }

  const canSave = Boolean(sessionId && classId && sectionId) && review.summary.blocked === 0 && review.summary.toCheck === 0 && review.summary.ready > 0;
  const blanks = rows.filter((r) => r.include && !r.fields.admissionNumber.trim()).length;

  return (
    <>
      <Notices notices={notices} />
      <ReviewStats review={review} readyLabel="Ready to Add" />

      <Card className="mb-5">
        <CardHeader title="Where should these students be enrolled?" description="Every student added is placed in this class and section." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Academic Session" htmlFor="scan-session" required>
            <Select
              id="scan-session"
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setClassId('');
                setSectionId('');
              }}
            >
              <option value="">Select session…</option>
              {sessions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Class" htmlFor="scan-class" required>
            <Select
              id="scan-class"
              value={classId}
              disabled={!sessionId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId('');
              }}
            >
              <option value="">Select class…</option>
              {visibleClasses.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Section" htmlFor="scan-section" required>
            <Select id="scan-section" value={sectionId} disabled={!classId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Select section…</option>
              {visibleSections.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {blanks > 0 && (
        <Card className="mb-5">
          <CardBody className="flex flex-wrap items-end gap-3">
            <Field
              label={`${blanks} row(s) have no admission number`}
              htmlFor="scan-start-number"
              hint="Enter the first number to use, such as HSA-0141. Numbers already taken are skipped."
              className="min-w-[260px] flex-1"
            >
              <Input
                id="scan-start-number"
                value={startNumber}
                onChange={(e) => setStartNumber(e.target.value)}
                placeholder="HSA-0141"
              />
            </Field>
            <Button
              variant="outline"
              onClick={() => {
                const numbered = numberBlankAdmissions(rows, startNumber, context.existingAdmissions);
                if (numbered) setRows(numbered);
                else toast.error('Cannot number from that', 'The starting number must end in digits, such as HSA-0141.');
              }}
              disabled={!startNumber.trim()}
            >
              <Hash className="h-4 w-4" />
              Number the blanks
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Check every row against the paper"
          description="Amber cells were hard to read — correct them, or press “Looks right”. Red problems must be fixed. Untick a row to leave it out."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Start again
              </Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!canSave}>
                <Save className="h-4 w-4" />
                Add {review.summary.ready} student{review.summary.ready === 1 ? '' : 's'}
              </Button>
            </>
          }
        />
        {!sectionId && (
          <div className="border-b border-slate-200 px-5 py-2.5 text-[12.5px] text-amber-800">
            Choose the session, class and section above before saving.
          </div>
        )}
        <RecordGrid
          rows={rows}
          columns={STUDENT_COLUMNS}
          review={review}
          files={files}
          onChange={(next) => setRows(next as StudentScanRow[])}
        />
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={save}
        tone="primary"
        title="Add these students"
        confirmLabel={`Add ${review.summary.ready}`}
        loading={saving}
        message={
          <>
            <strong>{review.summary.ready}</strong> student record(s) will be created and enrolled in{' '}
            <strong>{visibleSections.find((s) => s.id === sectionId)?.label}</strong>.
          </>
        }
      />
    </>
  );
}

/* ------------------------------------------------------------ enquiries */

const ENQUIRY_COLUMNS: GridColumn<EnquiryFields>[] = [
  { field: 'studentName', label: 'Child’s Name', width: 'w-44', always: true },
  { field: 'fatherName', label: 'Father Name', width: 'w-44', always: true },
  { field: 'dateOfBirth', label: 'Date of Birth', width: 'w-28', always: true },
  { field: 'gender', label: 'Gender', width: 'w-20', always: true },
  { field: 'classApplyingFor', label: 'Class', width: 'w-24', always: true },
  { field: 'contactPhone', label: 'Contact No.', width: 'w-32', always: true },
  { field: 'whatsappNumber', label: 'WhatsApp', width: 'w-32' },
  { field: 'email', label: 'Email', width: 'w-44' },
  { field: 'previousSchool', label: 'Previous School', width: 'w-40' },
  { field: 'address', label: 'Address', width: 'w-56' },
  { field: 'notes', label: ENQUIRY_LABELS.notes!.replace(/^./, (c) => c.toUpperCase()), width: 'w-56' },
];

export function EnquiriesScan({ context }: { context: { recent: { name: string; dialNumber: string; reference: string }[] } }) {
  const router = useRouter();
  const toast = useToast();

  const [files, setFiles] = React.useState<SourceFile[]>([]);
  const [notices, setNotices] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<EnquiryScanRow[] | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);

  const review = React.useMemo(() => (rows ? reviewEnquiries(rows, context) : null), [rows, context]);

  const reset = () => {
    releaseFiles(files);
    setFiles([]);
    setNotices([]);
    setRows(null);
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    const result = await commitEnquiryScanAction({ fileNames: files.map((f) => f.name), rows });
    setSaving(false);
    setConfirmOpen(false);
    if (result.ok) {
      const references = result.data?.references ?? [];
      const message = `${result.message ?? 'Enquiries added.'}${references.length ? ` References: ${references.join(', ')}.` : ''}`;
      toast.success(result.message ?? 'Enquiries added.');
      setSaved(message);
      reset();
      router.refresh();
    } else {
      toast.error('Nothing was saved', result.error);
    }
  };

  if (!rows || !review) {
    return (
      <>
        {saved && (
          <Alert tone="success" title={saved} className="mb-5">
            Follow them up under <Link href="/admissions" className="font-semibold underline">Admissions</Link>.
          </Alert>
        )}
        <UploadStep<AdmissionFormReading>
          kind="admissions"
          title="Scan paper admission forms"
          description="Photos or a PDF of filled-in admission forms. Each child becomes an enquiry in Admissions."
          hint="A contact number is needed for every form. Admit a child from their enquiry once the office has spoken to the family."
          fields={{}}
          onRead={({ pages, files: read, notices: found }) => {
            setSaved(null);
            setFiles(read);
            setNotices(found);
            setRows(enquiryRowsFromPages(pages));
          }}
        />
      </>
    );
  }

  const canSave = review.summary.blocked === 0 && review.summary.toCheck === 0 && review.summary.ready > 0;

  return (
    <>
      <Notices notices={notices} />
      <ReviewStats review={review} readyLabel="Ready to Add" />

      <Card>
        <CardHeader
          title="Check every form against the paper"
          description="Amber cells were hard to read — correct them, or press “Looks right”. Red problems must be fixed. Untick a form to leave it out."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Start again
              </Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!canSave}>
                <Save className="h-4 w-4" />
                Add {review.summary.ready} enquir{review.summary.ready === 1 ? 'y' : 'ies'}
              </Button>
            </>
          }
        />
        <RecordGrid
          rows={rows}
          columns={ENQUIRY_COLUMNS}
          review={review}
          files={files}
          onChange={(next) => setRows(next as EnquiryScanRow[])}
        />
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={save}
        tone="primary"
        title="Add these enquiries"
        confirmLabel={`Add ${review.summary.ready}`}
        loading={saving}
        message={
          <>
            <strong>{review.summary.ready}</strong> enquir{review.summary.ready === 1 ? 'y' : 'ies'} will be added to
            Admissions as <strong>New</strong>, each with its own reference number.
          </>
        }
      />
    </>
  );
}
