'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Button, Select } from './primitives';

export type FilterOption = { value: string; label: string };

export type FilterField =
  | { type: 'search'; name: string; placeholder?: string; className?: string }
  | { type: 'select'; name: string; label: string; options: FilterOption[]; className?: string }
  | { type: 'date'; name: string; label: string; className?: string };

/**
 * URL-driven filter bar. Every filter lives in the query string so a filtered
 * view is bookmarkable, shareable and survives a page refresh.
 */
export function FilterBar({
  fields,
  children,
  autoSubmit = true,
}: {
  fields: FilterField[];
  children?: React.ReactNode;
  /** Selects apply immediately; the search box always waits for Enter/submit. */
  autoSubmit?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const current = React.useCallback(
    (name: string) => searchParams.get(name) ?? '',
    [searchParams],
  );

  const apply = React.useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete('page'); // any filter change returns to the first page
      const qs = params.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [pathname, router, searchParams],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const updates: Record<string, string> = {};
    for (const field of fields) updates[field.name] = String(data.get(field.name) ?? '');
    apply(updates);
  };

  const activeCount = fields.filter((f) => current(f.name)).length;

  return (
    <form
      onSubmit={onSubmit}
      className="no-print flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4"
    >
      {fields.map((field) => {
        if (field.type === 'search') {
          return (
            <div key={field.name} className={field.className ?? 'min-w-[220px] flex-1'}>
              <label className="field-label" htmlFor={`filter-${field.name}`}>
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id={`filter-${field.name}`}
                  name={field.name}
                  defaultValue={current(field.name)}
                  placeholder={field.placeholder ?? 'Search…'}
                  className="field-input pl-9"
                  type="search"
                />
              </div>
            </div>
          );
        }

        if (field.type === 'date') {
          return (
            <div key={field.name} className={field.className ?? 'w-[170px]'}>
              <label className="field-label" htmlFor={`filter-${field.name}`}>
                {field.label}
              </label>
              <input
                id={`filter-${field.name}`}
                name={field.name}
                type="date"
                defaultValue={current(field.name)}
                className="field-input"
                onChange={(e) => autoSubmit && apply({ [field.name]: e.target.value })}
              />
            </div>
          );
        }

        return (
          <div key={field.name} className={field.className ?? 'w-[190px]'}>
            <label className="field-label" htmlFor={`filter-${field.name}`}>
              {field.label}
            </label>
            <Select
              id={`filter-${field.name}`}
              name={field.name}
              defaultValue={current(field.name)}
              onChange={(e) => autoSubmit && apply({ [field.name]: e.target.value })}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary" loading={pending}>
          <SlidersHorizontal className="h-4 w-4" />
          Apply
        </Button>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => startTransition(() => router.push(pathname))}
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {children}
    </form>
  );
}
