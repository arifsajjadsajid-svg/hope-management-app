'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type SearchHit = {
  id: string;
  type: 'STUDENT' | 'EXAM' | 'CLASS' | 'SECTION' | 'TEACHER' | 'SUBJECT';
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_LABEL: Record<SearchHit['type'], string> = {
  STUDENT: 'Student',
  EXAM: 'Examination',
  CLASS: 'Class',
  SECTION: 'Section',
  TEACHER: 'Teacher',
  SUBJECT: 'Subject',
};

const TYPE_TONE: Record<SearchHit['type'], string> = {
  STUDENT: 'bg-royal-50 text-royal-700',
  EXAM: 'bg-amber-50 text-amber-700',
  CLASS: 'bg-emerald-50 text-emerald-700',
  SECTION: 'bg-teal-50 text-teal-700',
  TEACHER: 'bg-purple-50 text-purple-700',
  SUBJECT: 'bg-slate-100 text-slate-700',
};

/**
 * Academy-wide search across students, examinations, classes, sections,
 * subjects and teachers. Queries are debounced and aborted on each keystroke.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Search failed');
        const data = (await response.json()) as { results: SearchHit[] };
        setHits(data.results ?? []);
        setActiveIndex(0);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setHits([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      // Ctrl/Cmd + K focuses the search field from anywhere.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery('');
    router.push(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[activeIndex];
      if (hit) go(hit);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search students, exams, classes…"
          aria-label="Global search"
          className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-16 text-sm text-navy-900 transition placeholder:text-slate-400 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-200"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:block">
          Ctrl K
        </span>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-elevated animate-in">
          {loading && (
            <p className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </p>
          )}

          {!loading && hits.length === 0 && (
            <p className="px-4 py-5 text-center text-[13px] text-slate-500">
              No matches for “{query.trim()}”.
            </p>
          )}

          {!loading &&
            hits.map((hit, index) => (
              <button
                key={`${hit.type}-${hit.id}`}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => go(hit)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 transition',
                  index === activeIndex ? 'bg-royal-50' : 'hover:bg-slate-50',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    TYPE_TONE[hit.type],
                  )}
                >
                  {TYPE_LABEL[hit.type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-navy-900">
                    {hit.title}
                  </span>
                  <span className="block truncate text-[12px] text-slate-500">{hit.subtitle}</span>
                </span>
                {index === activeIndex && (
                  <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
