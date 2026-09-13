import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Crumb = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="no-print mb-2.5">
          <ol className="flex flex-wrap items-center gap-1 text-[12.5px] text-slate-500">
            <li className="flex items-center gap-1">
              <Link
                href="/dashboard"
                className="flex items-center gap-1 transition hover:text-royal-700"
              >
                <Home className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">Dashboard</span>
              </Link>
            </li>
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                {crumb.href && index < breadcrumbs.length - 1 ? (
                  <Link href={crumb.href} className="transition hover:text-royal-700">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-semibold text-navy-800">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-slate-600">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

/** Small labelled statistic used inside detail panels. */
export function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13.5px] font-medium text-navy-900">
        {value === null || value === undefined || value === '' ? (
          <span className="text-slate-400">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
