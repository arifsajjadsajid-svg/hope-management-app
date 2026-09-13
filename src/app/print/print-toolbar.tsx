'use client';

import * as React from 'react';
import { Printer, ArrowLeft, Info } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/**
 * Screen-only toolbar shown above every printable document. It disappears from
 * the printed page via the `no-print` class.
 */
export function PrintToolbar({
  title,
  subtitle,
  hint,
  landscape,
}: {
  title: string;
  subtitle?: string;
  hint?: string;
  landscape?: boolean;
}) {
  React.useEffect(() => {
    // Match the @page size to the document being shown.
    const style = document.createElement('style');
    style.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [landscape]);

  return (
    <div className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-bold text-navy-900">{title}</h1>
          {subtitle && <p className="truncate text-[12.5px] text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[210mm] px-4 pb-3">
        <p className="flex items-start gap-1.5 rounded-lg bg-royal-50 px-3 py-2 text-[12px] leading-relaxed text-royal-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {hint ??
              `Use your browser's print dialog and choose "Save as PDF". Set paper size to A4 ${
                landscape ? 'landscape' : 'portrait'
              }, margins to None and enable background graphics for the academy colours.`}
          </span>
        </p>
      </div>
    </div>
  );
}
