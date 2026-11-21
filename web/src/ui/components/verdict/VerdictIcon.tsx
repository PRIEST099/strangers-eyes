// web/src/ui/components/verdict/VerdictIcon.tsx: the verdict card's icons (T-077). One distinct shape per tone, so
// a line is never told apart by colour alone (AC-062). Always decorative (aria-hidden): the line text says it.
import type { VerdictIconName } from './model';

const PATHS: Readonly<Record<VerdictIconName, string>> = {
  // octagon with "!" (HIGH / RED)
  alert: 'M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9Z M12 7.5v5.5 M12 16.5h.01',
  // triangle with "!" (MEDIUM / AMBER)
  warn: 'M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z M12 9v4.5 M12 17h.01',
  // circle with "i" (INFO / LOW)
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M12 11v5.5 M12 7.5h.01',
  lock: 'M6 11h12v10H6Z M8 11V7a4 4 0 1 1 8 0v4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  chip: 'M9 3v2 M15 3v2 M9 19v2 M15 19v2 M3 9h2 M3 15h2 M19 9h2 M19 15h2 M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M9 9h6v6H9Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};

export function VerdictIcon({ name, className = 'size-5' }: { name: VerdictIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-icon={name}
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
