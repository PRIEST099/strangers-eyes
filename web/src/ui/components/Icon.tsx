// web/src/ui/components/Icon.tsx: a few inline stroke icons (no icon dependency). Always decorative
// (aria-hidden): the control or line that uses one carries its own text (AC-062: never colour or icon alone).
const PATHS = {
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  ledger: 'M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2Z M9 8h6 M9 12h6',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevronRight: 'M9 6l6 6-6 6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  offline: 'M2 8.5a15 15 0 0 1 4.5-2.8 M9.6 4.9A15 15 0 0 1 22 8.5 M5 12a10 10 0 0 1 3.4-2 M15.4 10.3A10 10 0 0 1 19 12 M8.5 15.5a5 5 0 0 1 7 0 M12 19.5h.01 M3 3l18 18',
  chip: 'M9 3v2 M15 3v2 M9 19v2 M15 19v2 M3 9h2 M3 15h2 M19 9h2 M19 15h2 M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M9 9h6v6H9Z',
  lock: 'M6 11h12v10H6Z M8 11V7a4 4 0 1 1 8 0v4',
  cloud: 'M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 9.1 4.5 4.5 0 0 0 7 18Z',
  arrowRight: 'M4 12h15 M13 6l6 6-6 6',
  alert: 'M12 3.5 2.5 20h19L12 3.5Z M12 10v4.5 M12 17.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5.5 M12 7.5h.01',
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * The brand mark (docs/DESIGN.md §1.5): an eye outline whose pupil is a solid black square, echoing the solid-mask
 * rule. The pupil is #000 in both themes (like every mask) with a thin line-strong edge so it reads on dark canvas.
 * Decorative: the wordmark or the page carries the name.
 */
export function BrandMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" fill="none" className={`shrink-0 ${className}`}>
      <path
        d="M2.5 16S7.5 6.5 16 6.5 29.5 16 29.5 16 24.5 25.5 16 25.5 2.5 16 2.5 16Z"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinejoin="round"
      />
      <rect x={11} y={11} width={10} height={10} rx={1} fill="#000" stroke="var(--se-line-strong)" strokeWidth={1} />
    </svg>
  );
}
