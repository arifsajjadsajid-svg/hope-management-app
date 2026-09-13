'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-navy-900 text-white hover:bg-navy-800 focus-visible:ring-navy-400 shadow-sm disabled:bg-navy-900/50',
  secondary:
    'bg-royal-600 text-white hover:bg-royal-700 focus-visible:ring-royal-300 shadow-sm disabled:bg-royal-600/50',
  outline:
    'border border-slate-300 bg-white text-navy-800 hover:bg-slate-50 hover:border-slate-400 shadow-sm',
  ghost: 'text-navy-700 hover:bg-navy-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-300 shadow-sm',
  gold: 'bg-gold-gradient text-navy-950 hover:brightness-105 shadow-crest font-bold',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 py-2 text-sm gap-2',
  lg: 'h-11 px-6 text-[15px] gap-2',
  icon: 'h-9 w-9 p-0',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60';

/** Shared button styling, so links can be made to look like buttons. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/**
 * A navigation link styled as a button. Uses next/link for internal routes and
 * a plain anchor for downloads and print views that must open in a new tab.
 */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className,
  external,
  newTab,
  download,
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  external?: boolean;
  newTab?: boolean;
  download?: boolean;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const classes = buttonClasses(variant, size, className);
  const target = newTab ? { target: '_blank', rel: 'noreferrer' } : {};

  if (external || download || newTab) {
    return (
      <a href={href} className={classes} download={download} {...target} {...props}>
        {children}
      </a>
    );
  }

  return (
    <NextLink href={href} className={classes} {...props}>
      {children}
    </NextLink>
  );
}

/* ---------------------------------------------------------------- Badge */

export function Badge({
  children,
  className,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  /** Full tailwind tone string, e.g. "bg-emerald-50 text-emerald-700 ring-emerald-200" */
  tone?: string;
}) {
  return (
    <span className={cn('badge', tone ?? 'bg-slate-100 text-slate-700 ring-slate-200', className)}>
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Card */

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card-header', className)}>
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

/* ------------------------------------------------------------- Form kit */

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-rose-600">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('field-input', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('field-input min-h-[80px]', className)} {...props} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn('field-input cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-navy-800', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-royal-600 focus:ring-royal-300"
        {...props}
      />
      {label && <span className="leading-snug">{label}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- Alert */

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'bg-royal-50 border-royal-200 text-royal-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-rose-50 border-rose-200 text-rose-900',
  } as const;

  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)} role="alert">
      {title && <p className="font-bold">{title}</p>}
      {children && <div className={cn(title && 'mt-1', 'leading-relaxed')}>{children}</div>}
    </div>
  );
}

/* ----------------------------------------------------------- Empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-navy-50 text-navy-400">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-bold text-navy-900">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- Spinner */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-royal-600', className)} aria-hidden />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-12 text-sm text-slate-500">
      <Spinner />
      {label}
    </div>
  );
}

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-200', className)} />;
}
