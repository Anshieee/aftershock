import type { ReactNode } from 'react';

/**
 * Aftershock. brand mark.
 *
 * A point of origin and three concentric arcs travelling outwards — the
 * propagation of a single event through everything that depends on it. The
 * arcs are drawn with a growing radius and a fading weight so the silhouette
 * reads as a ripple rather than a target.
 */
export function AftershockMark({
  size = 26,
  className = '',
  tone = 'ink',
}: {
  size?: number;
  className?: string;
  tone?: 'ink' | 'inverse' | 'brand';
}) {
  const stroke = tone === 'inverse' ? 'rgb(var(--c-ink-inverse))' : tone === 'brand' ? 'rgb(var(--c-brand))' : 'rgb(var(--c-ink))';
  const accent = tone === 'inverse' ? 'rgb(var(--c-brand-line))' : 'rgb(var(--c-brand))';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* the origin */}
      <circle cx="14" cy="14" r="2.9" fill={stroke} />
      {/* the ripples it sends out */}
      <circle cx="14" cy="14" r="6.4" stroke={accent} strokeWidth="1.5" fill="none" opacity="0.85" />
      <circle cx="14" cy="14" r="9.9" stroke={accent} strokeWidth="1.35" fill="none" opacity="0.55" />
      <circle cx="14" cy="14" r="13.1" stroke={stroke} strokeWidth="1.15" fill="none" opacity="0.28" />
    </svg>
  );
}

/**
 * The wordmark. "Aftershock." keeps its final period — it is part of the
 * name, not punctuation.
 */
export function Wordmark({
  size = 'md',
  tone = 'ink',
  showMark = true,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'ink' | 'inverse';
  showMark?: boolean;
  className?: string;
}) {
  const textSize =
    size === 'lg' ? 'text-[2rem] leading-none' : size === 'md' ? 'text-[1.0625rem] leading-none' : 'text-[0.9375rem] leading-none';
  const markSize = size === 'lg' ? 34 : size === 'md' ? 26 : 21;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {showMark ? <AftershockMark size={markSize} tone={tone} /> : null}
      <span
        className={`font-display font-semibold tracking-[-0.022em] ${textSize} ${
          tone === 'inverse' ? 'text-ink-inverse' : 'text-ink'
        }`}
        style={{ fontVariationSettings: "'SOFT' 0, 'WONK' 1, 'opsz' 40" }}
      >
        Aftershock
        <span className={tone === 'inverse' ? 'text-brand-line' : 'text-brand'}>.</span>
      </span>
    </span>
  );
}

/**
 * A decorative ripple used sparingly — behind the homepage masthead and as
 * the acknowledgement of the upload moment.
 */
export function RippleGlyph({
  className = '',
  size = 220,
  children,
}: {
  className?: string;
  size?: number;
  children?: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {[26, 44, 62, 80, 98].map((radius, index) => (
        <circle
          key={radius}
          cx="100"
          cy="100"
          r={radius}
          stroke="rgb(var(--c-brand))"
          strokeWidth="1"
          opacity={0.34 - index * 0.055}
        />
      ))}
      {children}
    </svg>
  );
}
