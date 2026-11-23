// web/src/ui/components/verdict/BandRuler.tsx: the distance band of a verdict line as a 5-cell ruler, street → country
// (DESIGN.md §5.3). Bands only (SR-07, invariant 5): it gets a band NAME from the view model, never a distance,
// effectiveKm or coordinates, and draws no map, pin or address. The cells are decorative (aria-hidden); the band words
// (ui.band.*) carry the meaning, either beside the ruler or already in the line's own text (`label` null).
import type { DistanceBand } from '../../../core/types';
import type { Tone } from './model';
import { TONE_FILL } from './tones';

/** Finest first, the order the cells are drawn (left to right). 'none' lights no cell. */
const CELLS: readonly Exclude<DistanceBand, 'none'>[] = ['street', 'neighbourhood', 'district', 'city', 'country'];

export function BandRuler({ band, tone, label }: { band: DistanceBand; tone: Tone; label: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-band={band}>
      <span aria-hidden="true" className="flex shrink-0 gap-0.5">
        {CELLS.map((c) => (
          <span
            key={c}
            className={`h-1.5 w-5 rounded-[2px] ${c === band ? TONE_FILL[tone] : 'bg-line-strong/35'}`}
          />
        ))}
      </span>
      {label !== null && <span className="min-w-0 text-small text-muted">{label}</span>}
    </div>
  );
}
