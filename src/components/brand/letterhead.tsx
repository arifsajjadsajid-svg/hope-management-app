import * as React from 'react';
import { cn } from '@/lib/utils';
import type { AcademyProfile } from '@/lib/settings';
import { AcademyMark } from './crest';

/**
 * The official letterhead printed at the top of every academy document:
 * date sheets, roll number slips, report cards, merit lists, attendance
 * sheets, seating plans and certificates.
 */
export function Letterhead({
  academy,
  documentTitle,
  subtitle,
  className,
  size = 'full',
}: {
  academy: AcademyProfile;
  documentTitle?: string;
  subtitle?: string;
  className?: string;
  /** "compact" is used inside multi-up slip grids where vertical space is tight. */
  size?: 'full' | 'compact';
}) {
  const compact = size === 'compact';

  return (
    <header className={cn('avoid-break', className)}>
      <div className={cn('flex items-center', compact ? 'gap-2.5' : 'gap-4')}>
        <AcademyMark
          logoPath={academy.logoPath}
          monogram={academy.shortName}
          className={compact ? 'h-[13mm] w-auto' : 'h-[20mm] w-auto'}
        />

        <div className="min-w-0 flex-1 text-center">
          <h1
            className="doc-title font-bold uppercase leading-tight text-[#0f2547]"
            style={{ fontSize: compact ? '12pt' : '19pt', letterSpacing: compact ? '0.02em' : '0.04em' }}
          >
            {academy.name}
          </h1>
          <p
            className="leading-snug text-[#24384f]"
            style={{ fontSize: compact ? '7pt' : '9.5pt', marginTop: compact ? '0.3mm' : '0.8mm' }}
          >
            {academy.address}
          </p>
          <p
            className="font-semibold leading-snug text-[#24384f]"
            style={{ fontSize: compact ? '7pt' : '9.5pt' }}
          >
            {academy.contactLine}
          </p>
          {academy.website && !compact && (
            <p className="leading-snug text-[#24384f]" style={{ fontSize: '8.5pt' }}>
              {academy.website}
            </p>
          )}
        </div>

        {/* Balances the crest so the academy name stays optically centred. */}
        <div className={cn('shrink-0', compact ? 'w-[13mm]' : 'w-[20mm]')} aria-hidden />
      </div>

      <div
        style={{
          height: compact ? '1.1mm' : '1.6mm',
          marginTop: compact ? '1.2mm' : '2.4mm',
          background: 'linear-gradient(90deg,#c8a34a 0%,#e6cd8d 50%,#c8a34a 100%)',
          borderRadius: '2px',
        }}
      />

      {documentTitle && (
        <div className="text-center" style={{ marginTop: compact ? '1.6mm' : '3.4mm' }}>
          <h2
            className="doc-title inline-block font-bold uppercase text-white"
            style={{
              fontSize: compact ? '8.5pt' : '12pt',
              letterSpacing: '0.08em',
              background: '#0f2547',
              padding: compact ? '1mm 5mm' : '1.8mm 9mm',
              borderRadius: '1.5mm',
            }}
          >
            {documentTitle}
          </h2>
          {subtitle && (
            <p
              className="font-semibold text-[#24384f]"
              style={{ fontSize: compact ? '7.5pt' : '10pt', marginTop: compact ? '1mm' : '1.8mm' }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * The footer line carried by every official document.
 */
export function DocumentFooter({
  academy,
  note,
  className,
}: {
  academy: AcademyProfile;
  note?: string;
  className?: string;
}) {
  return (
    <footer
      className={cn('avoid-break border-t border-[#24384f] pt-[1.6mm] text-center', className)}
      style={{ fontSize: '7.5pt', color: '#3a4a60' }}
    >
      <p className="font-semibold uppercase tracking-wide">
        {academy.name} — {academy.address} — {academy.contactLine}
      </p>
      <p style={{ marginTop: '0.6mm' }}>{note ?? academy.footerMessage}</p>
    </footer>
  );
}

/**
 * A row of signature lines. Each entry renders an optional printed name above a
 * ruled line with its designation beneath.
 */
export function SignatureRow({
  signatures,
  className,
  height = '12mm',
}: {
  signatures: { label: string; name?: string | null; imagePath?: string | null }[];
  className?: string;
  height?: string;
}) {
  return (
    <div
      className={cn('avoid-break grid gap-[6mm]', className)}
      style={{ gridTemplateColumns: `repeat(${signatures.length}, minmax(0, 1fr))` }}
    >
      {signatures.map((sig) => (
        <div key={sig.label} className="text-center">
          <div className="flex items-end justify-center" style={{ height }}>
            {sig.imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sig.imagePath}
                alt=""
                style={{ maxHeight: height, maxWidth: '100%', objectFit: 'contain' }}
              />
            ) : null}
          </div>
          <div className="sign-line">
            {sig.name ? (
              <>
                <span className="block" style={{ fontSize: '9pt' }}>
                  {sig.name}
                </span>
                <span className="block font-normal" style={{ fontSize: '7.5pt', color: '#3a4a60' }}>
                  {sig.label}
                </span>
              </>
            ) : (
              sig.label
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
