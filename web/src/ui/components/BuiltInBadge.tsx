// web/src/ui/components/BuiltInBadge.tsx: the BUILT-IN badge (D-179). For steps that ALWAYS run as code or a small
// local model on this device, with or without Gemini Nano: the Tier-0 pre-screen (metadata, MediaPipe faces, Tesseract
// text, vault match), the fix plan, distance bands, and the rules floor under a model referee. Not a Route: RULES-ONLY
// (D-25) stays for a model job that fell back. Neutral outline; text plus a dot, never colour alone (AC-062).
import { t } from '../../core/strings';

export type BuiltInEngine = 'code' | 'mediapipe' | 'tesseract';

const ENGINE = {
  code: 'ui.prescreen.engine.code',
  mediapipe: 'ui.prescreen.engine.mediapipe',
  tesseract: 'ui.prescreen.engine.tesseract',
} as const;

export function BuiltInBadge({ engine, className, dataKey }: { engine: BuiltInEngine; className?: string; dataKey?: string }) {
  return (
    <span
      data-builtin={dataKey ?? engine}
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-chip border border-line bg-transparent px-2 font-mono text-caption font-bold tracking-[0.06em] whitespace-nowrap text-muted${className ? ` ${className}` : ''}`}
    >
      <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-current" />
      {t('ui.prescreen.builtin', { engine: t(ENGINE[engine]) })}
    </span>
  );
}
