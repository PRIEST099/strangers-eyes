// web/src/ui/components/verdict/RiskMeter.tsx: the verdict level as a meter (DESIGN.md §5.3, signature element 3).
// Inline SVG, role="img" with a text label (ui.meter.*): three segments RED | AMBER | LOW plus a separate hatched PARTIAL
// cell, every cell labelled in text (ui.verdict.level.*), so the level never relies on colour. With a comparison, a
// Before marker (outlined triangle) and an After marker (solid triangle) that mounts at the Before x and slides to its
// own cell (transform 700 ms; zeroed under reduced motion by index.css). Without one, the current cell is outlined and
// the other fills are dimmed (their labels stay AA text in muted). NO GREEN here: green is only the "Risk reduced" banner (SPEC §10.6).
//
// Geometry: the viewBox is 360 wide (not 600) so the 16-unit labels stay ≥ 12 px when the SVG scales down to a 375 px
// phone (~270 px wide); it is capped at 26rem so it does not grow chunky on desktop.
import { useEffect, useId, useState } from 'react';
import { t } from '../../../core/strings';
import type { VerdictLevel } from '../../../core/types';
import { LEVEL_LABEL_IDS, type MeterView } from './model';

const W = 360;
const CELL_W = 84;
const BAR_H = 18;
const FONT = 16;
/** Mono glyph advance (0.6 em), to keep marker labels apart without measuring the DOM. */
const CHAR_W = FONT * 0.6;
const CELLS: readonly { level: VerdictLevel; x: number; fill: string }[] = [
  { level: 'RED', x: 0, fill: 'fill-verdict-red' },
  { level: 'AMBER', x: 88, fill: 'fill-verdict-amber' },
  { level: 'LOW', x: 176, fill: 'fill-verdict-grey' },
  { level: 'PARTIAL', x: 276, fill: '' },
];
const centre = (l: VerdictLevel): number => {
  const c = CELLS.find((x) => x.level === l) ?? CELLS[0];
  return c.x + CELL_W / 2;
};

/**
 * Marker x positions and label centres. Pure, so it is testable: markers sit at their cells' centres (±12 when both are
 * in one cell); labels are pushed apart when they would overlap and kept inside the viewBox.
 */
export function meterMarkers(before: VerdictLevel, after: VerdictLevel, beforeText: string, afterText: string) {
  let bx = centre(before);
  let ax = centre(after);
  if (before === after) { bx -= 14; ax += 14; }
  const wB = beforeText.length * CHAR_W;
  const wA = afterText.length * CHAR_W;
  let bl = bx;
  let al = ax;
  const gap = 14;
  if (Math.abs(ax - bx) < (wA + wB) / 2 + gap) {
    const mid = (ax + bx) / 2;
    if (bx <= ax) { bl = mid - gap / 2 - wB / 2; al = mid + gap / 2 + wA / 2; }
    else { al = mid - gap / 2 - wA / 2; bl = mid + gap / 2 + wB / 2; }
  }
  const left = Math.min(bl - wB / 2, al - wA / 2);
  const right = Math.max(bl + wB / 2, al + wA / 2);
  const shift = left < 0 ? -left : right > W ? W - right : 0;
  return { bx, ax, bl: bl + shift, al: al + shift };
}

const tri = (x: number, y: number) => `${x - 7},${y} ${x + 7},${y} ${x},${y + 11}`;

export function RiskMeter({ meter, className = '' }: { meter: MeterView; className?: string }) {
  const raw = useId();
  const hatchId = `se-hatch-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { before, after } = meter;
  const label = (l: VerdictLevel) => t(LEVEL_LABEL_IDS[l]);
  const compare = before !== null;
  const top = compare ? 34 : 4;
  const h = top + BAR_H + 32;

  // The After marker starts at the Before x and slides to its own cell once mounted (a new pair restarts it).
  const key = `${before ?? ''}>${after}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  useEffect(() => {
    if (!compare) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSettledKey(key)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [key, compare]);

  const m = compare ? meterMarkers(before, after, t('ui.meter.before'), t('ui.meter.after')) : null;
  const dx = m && settledKey !== key ? m.bx - m.ax : 0;
  const aria = compare
    ? t('ui.meter.label', { before: label(before), after: label(after) })
    : t('ui.meter.single', { level: label(after) });

  return (
    <svg
      role="img"
      aria-label={aria}
      viewBox={`0 0 ${W} ${h}`}
      className={`block h-auto w-full max-w-[26rem] ${className}`}
      data-meter=""
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="fill-surface-2" />
          <line x1="1.5" y1="0" x2="1.5" y2="6" strokeWidth="3" className="stroke-verdict-grey" />
        </pattern>
      </defs>
      {CELLS.map((c) => {
        const active = c.level === after || (compare && c.level === before);
        const current = !compare && c.level === after;
        return (
          <g key={c.level}>
            {/* Only the fills dim; every label stays AA text (fg for the shown levels, muted for the rest). */}
            <g opacity={active ? 1 : 0.4}>
              <rect
                x={c.x} y={top} width={CELL_W} height={BAR_H} rx={4}
                className={c.level === 'PARTIAL' ? '' : c.fill}
                fill={c.level === 'PARTIAL' ? `url(#${hatchId})` : undefined}
              />
              {c.level === 'PARTIAL' && (
                <rect
                  x={c.x + 0.75} y={top + 0.75} width={CELL_W - 1.5} height={BAR_H - 1.5} rx={3.5}
                  fill="none" strokeWidth="1.5" className="stroke-verdict-grey"
                />
              )}
            </g>
            {current && (
              <rect
                x={c.x + 1} y={top + 1} width={CELL_W - 2} height={BAR_H - 2} rx={3}
                fill="none" strokeWidth="2" className="stroke-fg"
              />
            )}
            <text
              x={c.x + CELL_W / 2} y={top + BAR_H + 24} textAnchor="middle" fontSize={FONT}
              className={`font-mono font-bold ${active ? 'fill-fg' : 'fill-muted'}`}
            >
              {label(c.level)}
            </text>
          </g>
        );
      })}
      {m && (
        <>
          <g data-marker="before">
            <polygon points={tri(m.bx, 20)} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-fg" />
            <text x={m.bl} y={15} textAnchor="middle" fontSize={FONT} className="fill-fg font-mono font-semibold">
              {t('ui.meter.before')}
            </text>
          </g>
          <g
            data-marker="after"
            style={{ transform: `translateX(${dx}px)`, transition: 'transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          >
            <polygon points={tri(m.ax, 20)} strokeWidth="2" strokeLinejoin="round" className="fill-fg stroke-fg" />
            <text x={m.al} y={15} textAnchor="middle" fontSize={FONT} className="fill-fg font-mono font-bold">
              {t('ui.meter.after')}
            </text>
          </g>
        </>
      )}
    </svg>
  );
}
