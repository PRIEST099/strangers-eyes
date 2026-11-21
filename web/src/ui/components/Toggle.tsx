// web/src/ui/components/Toggle.tsx: an on/off setting (SCR-20). A native checkbox with role="switch", inside its label,
// so the whole row is the target (≥ 44 px tall) and it works by keyboard and screen reader without extra code.
import { useId } from 'react';

export interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const hintId = useId();
  return (
    <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
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
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-verdict-teal"
      />
    </label>
  );
}
