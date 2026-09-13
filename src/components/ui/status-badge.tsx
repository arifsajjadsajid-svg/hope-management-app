import * as React from 'react';
import {
  EXAM_STATUS_LABELS,
  EXAM_STATUS_TONE,
  RESULT_STATUS_LABELS,
  RESULT_STATUS_TONE,
  STUDENT_STATUS_LABELS,
  SUBJECT_TYPE_LABELS,
} from '@/lib/constants';
import { gradeTone } from '@/lib/grading';
import { Badge } from './primitives';

export function ExamStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={EXAM_STATUS_TONE[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}>
      {EXAM_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function ResultStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={RESULT_STATUS_TONE[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}>
      {RESULT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function GradeBadge({ grade }: { grade: string }) {
  return (
    <Badge tone={gradeTone(grade)} className="min-w-[2.25rem] justify-center font-bold">
      {grade}
    </Badge>
  );
}

const STUDENT_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  INACTIVE: 'bg-slate-100 text-slate-600 ring-slate-200',
  WITHDRAWN: 'bg-rose-50 text-rose-700 ring-rose-200',
  TRANSFERRED: 'bg-amber-50 text-amber-700 ring-amber-200',
  GRADUATED: 'bg-royal-50 text-royal-700 ring-royal-200',
};

export function StudentStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STUDENT_TONE[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}>
      {STUDENT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const SUBJECT_TYPE_TONE: Record<string, string> = {
  COMPULSORY: 'bg-navy-100 text-navy-800 ring-navy-200',
  ELECTIVE: 'bg-royal-50 text-royal-700 ring-royal-200',
  PRACTICAL: 'bg-teal-50 text-teal-700 ring-teal-200',
  OPTIONAL: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function SubjectTypeBadge({ type }: { type: string }) {
  return (
    <Badge tone={SUBJECT_TYPE_TONE[type] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}>
      {SUBJECT_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

/** Small circular avatar showing a photo or the student's initials. */
export function StudentAvatar({
  name,
  photoPath,
  size = 36,
  className,
}: {
  name: string;
  photoPath?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  if (photoPath) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photoPath}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ring-1 ring-slate-200 ${className ?? ''}`}
      />
    );
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-navy-100 font-bold text-navy-700 ring-1 ring-navy-200 ${className ?? ''}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}
