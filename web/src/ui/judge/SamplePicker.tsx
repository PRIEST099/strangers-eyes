// web/src/ui/judge/SamplePicker.tsx: the Judge Mode sample picker (SCR-17; docs/DESIGN.md §5.4). Presentation only.
// Full: three thumbnail cards (a row card each below sm). Compact (a sample is running): the cards collapse
// (grid-rows 1fr → 0fr with a fade, 250 ms; instant with reduced motion) and a strip of 48 px thumbnails takes their place, so the
// run sits near the top of the page. Thumbnails are the bundled same-origin `/samples/*.nano768.jpg` files (openly
// licensed, already solid-masked); no network beyond the app's own origin.
// Test hooks: every sample button keeps `data-sample` and `aria-pressed`, and its accessible name is exactly the title
// (the image is alt="", a compact title below sm is a sr-only span, never aria-label).
// `startHere` marks the suggested first pick (the level crossing, whose recording ends "Risk reduced") with a "Start
// here" chip on its card, without reordering the manifest. The chip sits OUTSIDE the button (so the button's name stays
// exactly the title) and is the button's description (aria-describedby).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { sampleUrl, type JudgeSample } from '../../vault/judgeVault';
import { t } from '../../core/strings';
import { Button } from '../components/Button';

export interface SamplePickerProps {
  samples: readonly JudgeSample[];
  /** The id of the sample running now (null: none). */
  selected: string | null;
  /** A sample is running: show the compact strip. */
  compact: boolean;
  onPick: (index: number) => void;
  /** The id of the suggested first sample (a "Start here" chip on its full card); null or absent: none. */
  startHere?: string | null;
}

/** The card: CARD without its padding (the thumbnail runs edge to edge). The selected card gets the device ring. */
const cardClass = (on: boolean) =>
  `relative rounded-card border border-line bg-surface ${on ? 'ring-2 ring-route-device-fill shadow-glow-device' : 'shadow-e1'}`;

/** The collapse transition (ms); the collapsed cards are unmounted after it, so each `data-sample` exists once. */
const COLLAPSE_MS = 250;

export function SamplePicker({ samples, selected, compact, onPick, startHere = null }: SamplePickerProps) {
  const chipId = useId();
  const [gone, setGone] = useState(compact);
  useEffect(() => {
    if (!compact) { setGone(false); return; }
    const id = setTimeout(() => setGone(true), COLLAPSE_MS + 50);
    return () => clearTimeout(id);
  }, [compact]);
  // Keyboard focus: a card picked with Enter/Space is about to go inert (and is unmounted ~300 ms later), so focus would
  // fall to <body>. Before the browser's focus fix-up runs, hand it to the same sample's strip button (which takes the
  // card's place visually); preventScroll leaves the run's own scroll (Judge.tsx) in charge.
  const cardsRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    if (!compact) return;
    const active = document.activeElement;
    if (!active || !cardsRef.current?.contains(active)) return;
    const strip = stripRef.current;
    const target = strip?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? strip?.querySelector<HTMLElement>('button');
    target?.focus({ preventScroll: true });
  }, [compact]);
  return (
    <>
      {!gone && <div
        className={`grid transition-[grid-template-rows,opacity] duration-[250ms] ease-out ${compact ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'}`}
        ref={cardsRef}
        inert={compact}
      >
        {/* The clip is only needed while the rows collapse; -m-3/p-3 leaves room for the focus ring, the selected ring and
            the 24 px device glow inside it, so the shadows never end on a hard edge. inert alone hides the collapsing
            cards from assistive tech (no aria-hidden over a subtree that may still hold focus). The fade hides the last
            few px a 0fr row still shows (its height is minus the margins) until the cards unmount. */}
        <div className={`-m-3 min-h-0 min-w-0 ${compact ? 'overflow-hidden' : ''}`}>
          <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
            {samples.map((s, i) => {
              const on = s.id === selected;
              const first = s.id === startHere;
              return (
                <li key={s.id} className={cardClass(on)}>
                  {first && (
                    <span
                      id={chipId}
                      data-start-here=""
                      className="pointer-events-none absolute top-2 left-2 z-10 rounded-chip bg-accent px-2 py-0.5 text-caption font-bold text-accent-fg shadow-e1"
                    >
                      {t('ui.judge.startHere')}
                    </span>
                  )}
                  <Button
                    variant="ghost" size="icon" data-sample={s.id} aria-pressed={on} onClick={() => onPick(i)}
                    aria-describedby={first ? chipId : undefined}
                    className="w-full overflow-hidden rounded-[13px]"
                  >
                    <span className="flex w-full items-center gap-3 p-2 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0">
                      <img
                        src={sampleUrl(s.nano768)} alt="" width={768} height={480} loading="lazy" decoding="async"
                        className="h-14 w-[88px] shrink-0 rounded-chip bg-surface-2 object-cover sm:aspect-[16/10] sm:h-auto sm:w-full sm:rounded-none"
                      />
                      <span className="line-clamp-2 min-w-0 flex-1 text-left text-small font-semibold sm:px-3 sm:py-2.5">
                        {s.title}
                      </span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>}
      {compact && (
        <ul ref={stripRef} className="flex gap-2">
          {samples.map((s, i) => {
            const on = s.id === selected;
            return (
              <li key={s.id} className={`${cardClass(on)} flex-none sm:min-w-0 sm:flex-1`}>
                <Button
                  variant="ghost" size="icon" data-sample={s.id} aria-pressed={on} onClick={() => onPick(i)}
                  className="w-full overflow-hidden rounded-[13px]"
                >
                  <span className="flex w-full min-w-0 items-center gap-2 p-1 sm:pr-3">
                    <img src={sampleUrl(s.nano768)} alt="" width={48} height={48} decoding="async" className="size-12 shrink-0 rounded-chip bg-surface-2 object-cover" />
                    <span className="sr-only sm:not-sr-only sm:min-w-0 sm:flex-1 sm:truncate sm:text-left sm:text-small sm:font-semibold">{s.title}</span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
