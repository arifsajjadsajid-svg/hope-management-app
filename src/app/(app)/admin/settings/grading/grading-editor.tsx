'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2, Scale } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Badge,
} from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { saveGradingSchemeAction, deleteGradingSchemeAction } from '@/server/actions/admin';
import { gradeTone } from '@/lib/grading';

export type BandRow = {
  grade: string;
  minPercent: string;
  maxPercent: string;
  gpa: string;
  remarks: string;
  isFail: boolean;
};

export type SchemeValues = {
  id: string | null;
  name: string;
  description: string;
  useGpa: boolean;
  isDefault: boolean;
  bands: BandRow[];
  examCount: number;
};

const BLANK_BAND: BandRow = {
  grade: '',
  minPercent: '',
  maxPercent: '',
  gpa: '0',
  remarks: '',
  isFail: false,
};

/**
 * Editor for one grading scheme and its bands. Bands are validated on the
 * server for overlaps; the preview here shows the operator what a percentage
 * would grade as before saving.
 */
export function GradingSchemeEditor({ scheme }: { scheme: SchemeValues }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(scheme.name);
  const [description, setDescription] = React.useState(scheme.description);
  const [useGpa, setUseGpa] = React.useState(scheme.useGpa);
  const [isDefault, setIsDefault] = React.useState(scheme.isDefault);
  const [bands, setBands] = React.useState<BandRow[]>(
    scheme.bands.length ? scheme.bands : [{ ...BLANK_BAND }],
  );
  const [pending, setPending] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const update = (index: number, patch: Partial<BandRow>) =>
    setBands((prev) => prev.map((band, i) => (i === index ? { ...band, ...patch } : band)));

  const overlap = React.useMemo(() => {
    const sorted = [...bands]
      .map((b) => ({ ...b, min: Number(b.minPercent), max: Number(b.maxPercent) }))
      .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max))
      .sort((a, b) => a.min - b.min);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.min <= sorted[i - 1]!.max) {
        return `"${sorted[i - 1]!.grade || '?'}" (up to ${sorted[i - 1]!.max}%) overlaps "${sorted[i]!.grade || '?'}" (from ${sorted[i]!.min}%)`;
      }
    }
    return null;
  }, [bands]);

  const save = async () => {
    setPending(true);
    const result = await saveGradingSchemeAction(scheme.id, {
      name,
      description,
      useGpa,
      isDefault,
      bands: bands.map((band) => ({
        grade: band.grade.trim(),
        minPercent: Number(band.minPercent),
        maxPercent: Number(band.maxPercent),
        gpa: Number(band.gpa) || 0,
        remarks: band.remarks,
        isFail: band.isFail,
      })),
    });
    setPending(false);

    if (result.ok) {
      toast.success(result.message ?? 'Grading scheme saved.');
      router.refresh();
    } else {
      toast.error('Could not save the scheme', result.error);
    }
  };

  const remove = async () => {
    if (!scheme.id) return;
    setPending(true);
    const result = await deleteGradingSchemeAction(scheme.id);
    setPending(false);
    setDeleteOpen(false);
    if (result.ok) {
      toast.success(result.message ?? 'Scheme deleted.');
      router.refresh();
    } else {
      toast.error('Could not delete', result.error);
    }
  };

  const valid =
    name.trim().length > 0 &&
    !overlap &&
    bands.every(
      (b) =>
        b.grade.trim() &&
        Number.isFinite(Number(b.minPercent)) &&
        Number.isFinite(Number(b.maxPercent)) &&
        Number(b.maxPercent) >= Number(b.minPercent),
    );

  return (
    <Card>
      <CardHeader
        title={scheme.id ? `Grading scheme — ${scheme.name}` : 'New grading scheme'}
        description={
          scheme.id
            ? `Used by ${scheme.examCount} examination(s). Changing bands affects only results processed after the change.`
            : 'Define the percentage bands, grades and GPA values.'
        }
        actions={
          <>
            {scheme.isDefault && (
              <Badge tone="bg-navy-900 text-gold-300 ring-navy-800">Academy default</Badge>
            )}
            {scheme.id && scheme.examCount === 0 && !scheme.isDefault && (
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button size="sm" onClick={save} loading={pending} disabled={!valid}>
              {!pending && <Save className="h-4 w-4" />}
              Save Scheme
            </Button>
          </>
        }
      />

      <CardBody className="space-y-4">
        {overlap && (
          <Alert tone="danger" title="Grade bands overlap">
            {overlap}. Adjust the ranges so each percentage falls in exactly one band.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Scheme Name" htmlFor={`name-${scheme.id ?? 'new'}`} required>
            <Input
              id={`name-${scheme.id ?? 'new'}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Academy Standard Grading"
            />
          </Field>
          <Field label="Description" htmlFor={`desc-${scheme.id ?? 'new'}`}>
            <Input
              id={`desc-${scheme.id ?? 'new'}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-5 rounded-lg bg-slate-50 p-3.5">
          <Checkbox
            checked={useGpa}
            onChange={(e) => setUseGpa(e.target.checked)}
            label="Show GPA on report cards"
          />
          <Checkbox
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            label="Use as the academy default"
          />
        </div>
      </CardBody>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th align="center">Preview</Th>
              <Th>Grade</Th>
              <Th align="center">From %</Th>
              <Th align="center">To %</Th>
              <Th align="center">GPA</Th>
              <Th>Remarks</Th>
              <Th align="center">Fail Grade</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {bands.map((band, index) => (
              <tr key={index}>
                <Td align="center">
                  <span
                    className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${gradeTone(band.grade)}`}
                  >
                    {band.grade || '—'}
                  </span>
                </Td>
                <Td>
                  <Input
                    value={band.grade}
                    onChange={(e) => update(index, { grade: e.target.value })}
                    className="h-8 w-[80px] px-2 text-center text-[13px] font-bold"
                    placeholder="A+"
                    aria-label={`Grade ${index + 1}`}
                  />
                </Td>
                <Td align="center">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={band.minPercent}
                    onChange={(e) => update(index, { minPercent: e.target.value })}
                    className="no-spinner h-8 w-[84px] px-2 text-center text-[13px] tabular"
                    aria-label={`Minimum percent for band ${index + 1}`}
                  />
                </Td>
                <Td align="center">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={band.maxPercent}
                    onChange={(e) => update(index, { maxPercent: e.target.value })}
                    className="no-spinner h-8 w-[84px] px-2 text-center text-[13px] tabular"
                    aria-label={`Maximum percent for band ${index + 1}`}
                  />
                </Td>
                <Td align="center">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={10}
                    value={band.gpa}
                    onChange={(e) => update(index, { gpa: e.target.value })}
                    className="no-spinner h-8 w-[70px] px-2 text-center text-[13px] tabular"
                    aria-label={`GPA for band ${index + 1}`}
                  />
                </Td>
                <Td>
                  <Input
                    value={band.remarks}
                    onChange={(e) => update(index, { remarks: e.target.value })}
                    className="h-8 min-w-[150px] px-2 text-[13px]"
                    placeholder="Outstanding"
                    aria-label={`Remarks for band ${index + 1}`}
                  />
                </Td>
                <Td align="center">
                  <input
                    type="checkbox"
                    checked={band.isFail}
                    onChange={(e) => update(index, { isFail: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-300"
                    aria-label={`Fail grade for band ${index + 1}`}
                  />
                </Td>
                <Td align="right">
                  {bands.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBands((prev) => prev.filter((_, i) => i !== index))}
                      className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                      aria-label="Remove band"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBands((prev) => [...prev, { ...BLANK_BAND }])}
        >
          <Plus className="h-4 w-4" />
          Add Band
        </Button>
        <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
          <Scale className="h-3.5 w-3.5" />
          Bands are inclusive of both bounds and must not overlap.
        </p>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        title="Delete grading scheme"
        confirmLabel="Delete Scheme"
        loading={pending}
        message={
          <>
            Delete <strong>{scheme.name}</strong>? Only schemes not used by any examination can be
            deleted.
          </>
        }
      />
    </Card>
  );
}

/** Reveals a blank editor for creating an additional scheme. */
export function NewSchemeButton() {
  const [open, setOpen] = React.useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New Grading Scheme
      </Button>
    );
  }

  return (
    <div className="w-full">
      <GradingSchemeEditor
        scheme={{
          id: null,
          name: '',
          description: '',
          useGpa: false,
          isDefault: false,
          examCount: 0,
          bands: [
            { grade: 'A+', minPercent: '90', maxPercent: '100', gpa: '4', remarks: 'Outstanding', isFail: false },
            { grade: 'A', minPercent: '80', maxPercent: '89.99', gpa: '3.7', remarks: 'Excellent', isFail: false },
            { grade: 'B', minPercent: '70', maxPercent: '79.99', gpa: '3', remarks: 'Very Good', isFail: false },
            { grade: 'C', minPercent: '60', maxPercent: '69.99', gpa: '2.5', remarks: 'Good', isFail: false },
            { grade: 'D', minPercent: '50', maxPercent: '59.99', gpa: '2', remarks: 'Satisfactory', isFail: false },
            { grade: 'F', minPercent: '0', maxPercent: '49.99', gpa: '0', remarks: 'Needs Improvement', isFail: true },
          ],
        }}
      />
    </div>
  );
}
