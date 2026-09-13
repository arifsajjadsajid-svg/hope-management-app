import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Horizontally scrollable shell so wide tables never break the page layout. */
export function TableWrap({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="min-w-full align-middle">{children}</div>
    </div>
  );
}

export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <table className={cn('data-table', className)}>{children}</table>;
}

export function Th({
  children,
  className,
  align = 'left',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'center' | 'right' }) {
  return (
    <th
      className={cn(
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'center' | 'right' }) {
  return (
    <td
      className={cn(
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/**
 * Link-based pagination so a page of results is fully server rendered and
 * shareable as a URL.
 */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams = {},
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== '' && key !== 'page') params.set(key, value);
    }
    if (target > 1) params.set('page', String(target));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // A compact window of page numbers around the current page.
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
      <p className="text-[13px] text-slate-600">
        Showing <span className="font-semibold text-navy-900">{from}</span>–
        <span className="font-semibold text-navy-900">{to}</span> of{' '}
        <span className="font-semibold text-navy-900">{total.toLocaleString()}</span>
      </p>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <PageLink href={buildHref(page - 1)} disabled={page <= 1} ariaLabel="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </PageLink>

        {start > 1 && (
          <>
            <PageLink href={buildHref(1)}>1</PageLink>
            {start > 2 && <span className="px-1 text-slate-400">…</span>}
          </>
        )}

        {pages.map((p) => (
          <PageLink key={p} href={buildHref(p)} active={p === page}>
            {p}
          </PageLink>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
            <PageLink href={buildHref(totalPages)}>{totalPages}</PageLink>
          </>
        )}

        <PageLink href={buildHref(page + 1)} disabled={page >= totalPages} ariaLabel="Next page">
          <ChevronRight className="h-4 w-4" />
        </PageLink>
      </nav>
    </div>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const classes = cn(
    'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-semibold transition',
    active
      ? 'bg-navy-900 text-white'
      : 'border border-slate-300 bg-white text-navy-700 hover:bg-slate-50',
    disabled && 'pointer-events-none opacity-40',
  );

  if (disabled) {
    return (
      <span className={classes} aria-disabled="true" aria-label={ariaLabel}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={classes} aria-label={ariaLabel} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
