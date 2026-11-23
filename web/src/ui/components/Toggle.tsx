// web/src/ui/components/Toggle.tsx: an on/off setting (SCR-20). A native checkbox with role="switch", inside its label,
// so the whole row is the target (≥ 44 px tall) and it works by keyboard and screen reader without extra code.
// The accessible name is the label text only (aria-labelledby); the hint is the description (aria-describedby), so a
// screen reader does not read the hint twice as part of the name.
// The switch uses accent-fg, never teal: teal means "protected / never sent" (docs/DESIGN.md §6.1).
import { useId } from 'react';

export interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const labelId = useId();
  const hintId = useId();
  return (
    <label className="flex min-h-12 cursor-pointer items-start justify-between gap-4 py-2">
      <span className="min-w-0">
        <span id={labelId} className="block font-medium">
          {label}
        </span>
        {hint && (
          <span id={hintId} className="mt-0.5 block text-sm text-muted">
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-fg"
      />
    </label>
  );
}
