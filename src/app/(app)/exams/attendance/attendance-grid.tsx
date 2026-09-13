'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button, Alert, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { Table, TableWrap, Th, Td } from '@/components/ui/table';
import { saveAttendanceAction } from '@/server/actions/exams';
import { cn } from '@/lib/utils';

export type AttendanceRow = {
  studentId: string;
  rollNumber: string;
  studentName: string;
  fatherName: string;
  className: string;
  sectionName: string;
  seatNumber: string | null;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  remarks: string;
};

const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Present', icon: CheckCircle2, tone: 'bg-emerald-600 text-white', ring: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
  { value: 'ABSENT', label: 'Absent', icon: XCircle, tone: 'bg-rose-600 text-white', ring: 'border-rose-300 text-rose-700 hover:bg-rose-50' },
  { value: 'LATE', label: 'Late', icon: Clock, tone: 'bg-amber-500 text-white', ring: 'border-amber-300 text-amber-700 hover:bg-amber-50' },
] as const;

/**
 * Attendance sheet for one paper. Absentees recorded here are flagged during
 * result processing and reconciled against the marks entered.
 */
export function AttendanceGrid({
  dateSheetEntryId,
  initialRows,
  readOnly,
}: {
  dateSheetEntryId: string;
  initialRows: AttendanceRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = React.useState(initialRows);
  const [pending, setPending] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  // Reset whenever a different paper is selected.
  React.useEffect(() => {
    setRows(initialRows);
    setDirty(false);
  }, [initialRows]);

  // Warn before leaving with unsaved attendance.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const setStatus = (studentId: string, status: AttendanceRow['status']) => {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
    setDirty(true);
  };

  const setRemarks = (studentId: string, remarks: string) => {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, remarks } : r)));
    setDirty(true);
  };

  const markAll = (status: AttendanceRow['status']) => {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
    setDirty(true);
  };

  const save = async () => {
    setPending(true);
    const result = await saveAttendanceAction(
      dateSheetEntryId,
      rows.map((r) => ({ studentId: r.studentId, status: r.status, remarks: r.remarks || undefined })),
    );
    setPending(false);
    if (result.ok) {
      toast.success(result.message ?? 'Attendance saved.');
      setDirty(false);
      router.refresh();
    } else {
      toast.error('Could not save attendance', result.error);
    }
  };

  const present = rows.filter((r) => r.status === 'PRESENT').length;
  const absent = rows.filter((r) => r.status === 'ABSENT').length;
  const late = rows.filter((r) => r.status === 'LATE').length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          <span className="font-semibold text-navy-900 tabular">
            {rows.length} candidate{rows.length === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-bold tabular">{present}</span> present
          </span>
          <span className="flex items-center gap-1.5 text-rose-700">
            <XCircle className="h-4 w-4" />
            <span className="font-bold tabular">{absent}</span> absent
          </span>
          <span className="flex items-center gap-1.5 text-amber-700">
            <Clock className="h-4 w-4" />
            <span className="font-bold tabular">{late}</span> late
          </span>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => markAll('PRESENT')}>
              Mark all present
            </Button>
            <Button variant="outline" size="sm" onClick={() => markAll('ABSENT')}>
              Mark all absent
            </Button>
            <Button size="sm" onClick={save} loading={pending} disabled={!dirty}>
              {!pending && <Save className="h-4 w-4" />}
              Save Attendance
            </Button>
          </div>
        )}
      </div>

      {dirty && (
        <div className="px-5 pt-4">
          <Alert tone="warning">
            You have unsaved attendance changes. They are lost if you leave this page.
          </Alert>
        </div>
      )}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th align="center">Roll No.</Th>
              <Th>Student Name</Th>
              <Th>Father Name</Th>
              <Th>Class / Section</Th>
              <Th align="center">Seat</Th>
              <Th align="center">Attendance</Th>
              <Th>Remarks</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentId}>
                <Td align="center">
                  <span className="rounded-md bg-navy-900 px-2 py-1 text-[12px] font-bold text-gold-300 tabular">
                    {row.rollNumber}
                  </span>
                </Td>
                <Td className="font-semibold text-navy-900">{row.studentName}</Td>
                <Td className="text-slate-700">{row.fatherName}</Td>
                <Td className="whitespace-nowrap text-slate-700">
                  {row.className} — {row.sectionName}
                </Td>
                <Td align="center" className="tabular text-slate-600">
                  {row.seatNumber ?? '—'}
                </Td>
                <Td align="center">
                  <div className="inline-flex gap-1">
                    {STATUS_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = row.status === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={readOnly}
                          onClick={() => setStatus(row.studentId, option.value)}
                          aria-pressed={active}
                          title={option.label}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold transition disabled:opacity-50',
                            active ? `${option.tone} border-transparent` : `bg-white ${option.ring}`,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </Td>
                <Td>
                  <Input
                    value={row.remarks}
                    disabled={readOnly}
                    onChange={(e) => setRemarks(row.studentId, e.target.value)}
                    placeholder="—"
                    className="h-8 min-w-[140px] px-2 text-[12.5px]"
                    aria-label={`Remarks for ${row.studentName}`}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      {!readOnly && (
        <div className="flex justify-end border-t border-slate-200 px-5 py-3.5">
          <Button onClick={save} loading={pending} disabled={!dirty}>
            {!pending && <Save className="h-4 w-4" />}
            Save Attendance
          </Button>
        </div>
      )}
    </>
  );
}
