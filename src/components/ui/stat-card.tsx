import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const TONES = {
  navy: 'bg-navy-900 text-white',
  royal: 'bg-royal-600 text-white',
  gold: 'bg-gold-gradient text-navy-950',
  emerald: 'bg-emerald-600 text-white',
  rose: 'bg-rose-600 text-white',
  amber: 'bg-amber-500 text-white',
  slate: 'bg-slate-200 text-navy-800',
} as const;

export type StatTone = keyof typeof TONES;

/**
 * Dashboard statistic tile. Renders as a link when `href` is supplied.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm',
              TONES[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none tracking-tight text-navy-900 tabular">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[12px] leading-snug text-slate-500">{hint}</p>}
    </>
  );

  const classes = cn(
    'card block p-4 transition',
    href && 'hover:-translate-y-0.5 hover:shadow-elevated',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}

/** Compact metric used inside analytics panels. */
export function MiniStat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white px-3.5 py-3', className)}>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn('mt-1 text-lg font-bold leading-none tabular text-navy-900', tone)}>
        {value}
      </p>
    </div>
  );
}
