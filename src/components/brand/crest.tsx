import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The academy crest, drawn as inline SVG so it renders identically on screen,
 * in print and inside generated documents without depending on an uploaded
 * image file. A logo uploaded from Academy Settings takes precedence
 * (see <AcademyMark />).
 */
export function Crest({
  className,
  monogram = 'HSA',
  title = 'The Hope Science Academy',
}: {
  className?: string;
  monogram?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 132"
      className={cn('h-12 w-auto', className)}
      role="img"
      aria-label={`${title} crest`}
    >
      <defs>
        <linearGradient id="crest-navy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e368a" />
          <stop offset="100%" stopColor="#0b1c38" />
        </linearGradient>
        <linearGradient id="crest-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6cd8d" />
          <stop offset="45%" stopColor="#c8a34a" />
          <stop offset="100%" stopColor="#9a7229" />
        </linearGradient>
      </defs>

      {/* Shield */}
      <path
        d="M60 3 L112 19 V68 C112 98 89 118 60 129 C31 118 8 98 8 68 V19 Z"
        fill="url(#crest-gold)"
      />
      <path
        d="M60 9 L106 23 V68 C106 94 86 112 60 122 C34 112 14 94 14 68 V23 Z"
        fill="url(#crest-navy)"
      />

      {/* Atom — the science mark */}
      <g
        transform="translate(60 55)"
        fill="none"
        stroke="url(#crest-gold)"
        strokeWidth="2.6"
        opacity="0.95"
      >
        <ellipse rx="26" ry="10.5" />
        <ellipse rx="26" ry="10.5" transform="rotate(60)" />
        <ellipse rx="26" ry="10.5" transform="rotate(120)" />
      </g>
      <circle cx="60" cy="55" r="5.4" fill="#e6cd8d" />

      {/* Open book base */}
      <path
        d="M31 84 C42 79 51 79 60 84 C69 79 78 79 89 84 L89 98 C78 93 69 93 60 98 C51 93 42 93 31 98 Z"
        fill="#ffffff"
        opacity="0.94"
      />
      <path d="M60 84 V98" stroke="#0f2547" strokeWidth="1.6" />

      {/* Monogram */}
      <text
        x="60"
        y="115"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="14"
        fontWeight="700"
        letterSpacing="2.2"
        fill="#e6cd8d"
      >
        {monogram}
      </text>
    </svg>
  );
}

/**
 * Renders the academy's uploaded logo when one exists, otherwise the built-in
 * crest. Used by the sidebar, login screen and every document letterhead.
 */
export function AcademyMark({
  logoPath,
  className,
  monogram,
  alt = 'Academy logo',
}: {
  logoPath?: string | null;
  className?: string;
  monogram?: string;
  alt?: string;
}) {
  if (logoPath) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoPath} alt={alt} className={cn('h-12 w-auto object-contain', className)} />;
  }
  return <Crest className={className} monogram={monogram} />;
}
