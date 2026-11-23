// web/src/ui/components/StoryReel.tsx: "The Coffee Post", a ~18 s illustrated story of the real-life risk and the fix,
// drawn in the Two Lanes, One Wall layout (docs/DESIGN.md §1, §5.1; D-162). It is an ILLUSTRATION: it makes no AI call,
// reads no vault and no Ledger (never wire it to useLedger), and every number in it is drawn, not measured. The
// permanent "Illustrated story" tag says so on every scene.
//
// Six scenes: 1 the post (location off) · 2 the cloud's AI reads the redacted copy and claims street level · 3 only the
// device grades it (rings around YOUR work, haversine in code) · 4 the device plans the fix (solid masks) · 5 asked again,
// country level, "Risk reduced" (the only green) · 6 the line: the attacker never learns whether it guessed right.
//
// Variants: `hero` (Welcome and Home) and `compact` auto-play; `strip` is the static six-frame grid (About only).
// Motion rules (DESIGN §4, D-162):
// - A small JS stepper sets the scene; each scene re-keys its elements so they replay the EXISTING one-shot keyframes
//   (wipe, cross, chip-in, mask-in, rise, pop, pulse-ring, plus the one-shot scan). No infinite CSS animation.
// - It stops after 3 loops and holds the poster frame (scene 6, the end card: no green, so the most-seen frame is not
//   the best case); Pause/Play is always visible (WCAG 2.2.2); it also stops while the tab is hidden or the reel is
//   off-screen.
// - prefers-reduced-motion: it never starts. The player shows still frames from scene 1 with manual Prev/Next (same
//   380 px stage, so Welcome's age form stays above the fold), so those readers still see the danger first.
// Hard rules kept here:
// - Invariant 5: the attacker's guess is NEVER drawn as a dot, pin, map tile or address. The cloud lane shows only its
//   claimed precision LEVEL (bars plus "street level" / "country level", never a `ui.band.*` distance: those are the
//   device's measure against the user's own places, and the cloud never learns them); the device lane shows rings
//   around the user's own place with the hit band filled. Do not add a "guess marker".
// - Invariant 6: masks are solid #000, opaque from their first frame (mask-in is scaleX); anything holding a mask
//   enters by a clip-path wipe, never an opacity fade (no rise/pop/chip-in/cross on a mask's ancestor). Never "safe";
//   confidence wherever a level shows.
// - Invariant 9: the person is a faceless silhouette and the photo is a drawing (blank sign bars, a generic tower).
// Text: captions and labels are HTML (never under 12 px); the stage is aria-hidden and a visually hidden <ol> carries
// the six captions. Copy comes from shared/strings/en.json (ui.story.*).
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t, type StringId } from '../../core/strings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ArrowGlyph, WallBar, type ArrowKind } from './HybridLanes';
import { Icon } from './Icon';
import { EYEBROW } from './surface';

export type StoryVariant = 'hero' | 'compact' | 'strip';
export type SceneNo = 1 | 2 | 3 | 4 | 5 | 6;

export interface StoryReelProps {
  variant: StoryVariant;
  className?: string;
  /** Show the headline above the reel (default true). */
  title?: boolean;
  /** Tests and the frame export: render this one scene, with the stepper off. */
  scene?: SceneNo;
}

export const SCENES: readonly SceneNo[] = [1, 2, 3, 4, 5, 6];
export const CAPTION: Record<SceneNo, StringId> = {
  1: 'ui.story.s1',
  2: 'ui.story.s2',
  3: 'ui.story.s3',
  4: 'ui.story.s4',
  5: 'ui.story.s5',
  6: 'ui.story.s6',
};
/** Scene lengths in ms (about 18 s a loop). */
export const SCENE_MS: Record<SceneNo, number> = { 1: 2600, 2: 3400, 3: 3400, 4: 2800, 5: 3600, 6: 3000 };
/** Loops before the reel stops on its poster frame. */
export const LOOPS = 3;
/** The frame held after the last loop: the end card (D-162 review: never hold the best-case green frame). */
export const POSTER: SceneNo = 6;

// ---------- the stepper (pure, testable) ----------

export interface StepState {
  scene: SceneNo;
  loop: number;
  held: boolean;
}

/** The next state after a scene ends: the next scene, the next loop, or (after LOOPS) the held poster. */
export function nextStep(s: StepState): StepState {
  if (s.held) return s;
  if (s.scene < 6) return { ...s, scene: (s.scene + 1) as SceneNo };
  if (s.loop + 1 < LOOPS) return { scene: 1, loop: s.loop + 1, held: false };
  return { scene: POSTER, loop: s.loop, held: true };
}

/** DEV only: `?reelScene=N` pins the reel to scene N for the frame export (scripts/shoot-reel.mjs). */
function devPinnedScene(): SceneNo | undefined {
  if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;
  const n = Number(new URLSearchParams(window.location.search).get('reelScene'));
  return SCENES.includes(n as SceneNo) ? (n as SceneNo) : undefined;
}

// ---------- motion helpers ----------

/** Animation class + delay, or nothing in a still frame (every keyframe's end state is the resting state). */
type Anim = (cls: string, delayMs?: number, extra?: CSSProperties) => { className: string; style?: CSSProperties };
const makeAnim = (still: boolean): Anim => (cls, delayMs = 0, extra) =>
  still ? { className: '', style: extra } : { className: cls, style: { animationDelay: `${delayMs}ms`, ...extra } };

/** SVG transforms scale from the shape itself (mask-in grows from the mask's left edge). */
const FILL_BOX: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'left' };

// ---------- drawings (aria-hidden; no text inside the SVGs) ----------

const STROKE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

type ClueBoxes = 'none' | 'all' | 'tower';

/**
 * The drawn coffee photo (160 × 100 units): a café awning, a cup, a staff badge on the table, a blank street sign, a
 * bus-stop flag and a generic tower. No face, no real name, no real place.
 */
function CoffeePhoto({
  badgeMask = false,
  clueMasks = false,
  boxes = 'none',
  scan = false,
  a,
  maskAt = 0,
  boxesAt = 0,
  scanAt = 200,
}: {
  badgeMask?: boolean;
  clueMasks?: boolean;
  boxes?: ClueBoxes;
  scan?: boolean;
  a: Anim;
  /** Delay of the newest masks (ms); masks shown as already there use no animation. */
  maskAt?: number | null;
  boxesAt?: number;
  scanAt?: number;
}) {
  const mask = (x: number, y: number, w: number, h: number, delay: number | null, key: string) => {
    const m = delay === null ? { className: '', style: FILL_BOX } : a('animate-mask-in', delay, FILL_BOX);
    return <rect key={key} x={x} y={y} width={w} height={h} rx={1.5} fill="#000" stroke="var(--se-line-strong)" strokeWidth={0.75} className={m.className} style={m.style} />;
  };
  const box = (x: number, y: number, w: number, h: number, i: number, key: string) => {
    const b = a('animate-chip-in', boxesAt + i * 350);
    return <rect key={key} x={x} y={y} width={w} height={h} rx={2} stroke="var(--se-route-cloud-fill)" strokeWidth={2} fill="none" className={b.className} style={b.style} />;
  };
  const s = a('animate-scan', scanAt);
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false" className="block h-auto w-full overflow-hidden rounded-chip">
      <rect x="0.75" y="0.75" width="158.5" height="98.5" rx="6" fill="var(--se-surface-2)" stroke="var(--se-line-strong)" strokeWidth="1.5" />
      {/* skyline and a generic tower */}
      <path d="M64 62V40h14v-8h16v30 M100 62V36h18v26 M134 62V30h20v32" fill="var(--se-surface-3)" stroke="var(--se-line-strong)" strokeWidth="1" />
      <path d="M127 64V14" stroke="var(--se-fg)" strokeWidth="2" {...STROKE} />
      <ellipse cx="127" cy="26" rx="5" ry="4" fill="var(--se-surface)" stroke="var(--se-fg)" strokeWidth="1.5" />
      {/* café awning */}
      <path d="M2 8h56l4 14H2Z" fill="var(--se-line-strong)" />
      <path d="M12 8v14 M24 8v14 M36 8v14 M48 8v14" stroke="var(--se-surface-3)" strokeWidth="5" />
      <path d="M4 22v40 M58 22v40" stroke="var(--se-line-strong)" strokeWidth="1.5" />
      {/* street sign: blank bars only */}
      <path d="M74 40v30" stroke="var(--se-fg)" strokeWidth="1.5" />
      <rect x="60" y="30" width="30" height="10" rx="1.5" fill="var(--se-surface)" stroke="var(--se-fg)" strokeWidth="1.25" />
      <path d="M64 35h14 M81 35h5" stroke="var(--se-fg)" strokeWidth="1.5" {...STROKE} />
      {/* bus-stop flag */}
      <path d="M104 48v24" stroke="var(--se-fg)" strokeWidth="1.5" />
      <rect x="98" y="34" width="13" height="14" rx="1.5" fill="var(--se-surface)" stroke="var(--se-fg)" strokeWidth="1.25" />
      <circle cx="104.5" cy="41" r="3" fill="var(--se-fg)" />
      {/* table, cup and saucer, a staff badge on its lanyard */}
      <rect x="0" y="70" width="160" height="30" fill="var(--se-surface-3)" />
      <path d="M0 70H160" stroke="var(--se-line-strong)" strokeWidth="1.5" />
      <ellipse cx="31" cy="76" rx="15" ry="3" fill="var(--se-surface)" stroke="var(--se-fg)" strokeWidth="1.25" />
      <path d="M22 58h18v12a4 4 0 0 1-4 4h-10a4 4 0 0 1-4-4Z" fill="var(--se-surface)" stroke="var(--se-fg)" strokeWidth="1.5" />
      <path d="M40 61a4 4 0 0 1 0 8" stroke="var(--se-fg)" strokeWidth="1.5" {...STROKE} />
      <path d="M27 54c-2-3 2-4 0-7 M34 54c-2-3 2-4 0-7" stroke="var(--se-muted)" strokeWidth="1.25" {...STROKE} />
      <path d="M48 96c6-10 12-14 20-14" stroke="var(--se-muted)" strokeWidth="1.25" {...STROKE} />
      <rect x="62" y="79" width="22" height="14" rx="1.5" fill="var(--se-surface)" stroke="var(--se-fg)" strokeWidth="1.25" />
      <rect x="65" y="82" width="6" height="8" fill="var(--se-line-strong)" />
      <path d="M74 84h7 M74 88h5" stroke="var(--se-fg)" strokeWidth="1.25" {...STROKE} />
      {/* solid masks (the badge is a vault match; sign and flag are the fix) */}
      {badgeMask && mask(60, 77, 26, 18, clueMasks ? null : maskAt, 'badge')}
      {clueMasks && mask(58, 28, 34, 14, maskAt, 'sign')}
      {clueMasks && mask(96, 32, 17, 18, maskAt === null ? null : maskAt + 250, 'flag')}
      {/* the attacker's clue boxes (outlines only; never a pin for its guess) */}
      {boxes === 'all' && [box(56, 26, 38, 18, 0, 'b-sign'), box(118, 9, 18, 57, 1, 'b-tower'), box(94, 30, 21, 22, 2, 'b-flag')]}
      {boxes === 'tower' && box(118, 9, 18, 57, 0, 'b-tower')}
      {scan && s.className && <rect x="0" y="2" width="2.5" height="96" fill="var(--se-route-cloud-fill)" className={s.className} style={s.style} />}
    </svg>
  );
}

/** Scene 1: a faceless silhouette holding a phone that shows the drawn photo. */
function PersonWithPhone({ a }: { a: Anim }) {
  return (
    <svg viewBox="0 0 160 112" aria-hidden="true" focusable="false" className="block h-auto w-full">
      <circle cx="20" cy="30" r="14" fill="var(--se-surface-3)" stroke="var(--se-line-strong)" strokeWidth="1.5" />
      <path d="M-4 112c0-32 9-56 24-56s24 24 24 56Z" fill="var(--se-surface-3)" stroke="var(--se-line-strong)" strokeWidth="1.5" />
      <path d="M36 86c6-1 10-3 14-6" stroke="var(--se-line-strong)" strokeWidth="8" {...STROKE} />
      <rect x="46" y="2" width="112" height="108" rx="10" fill="var(--se-surface)" stroke="var(--se-fg)" strokeWidth="2" />
      <svg x="51" y="12" width="102" height="64" viewBox="0 0 160 100">
        <CoffeePhoto a={a} />
      </svg>
      <path d="M53 86h52 M53 96h34" stroke="var(--se-line-strong)" strokeWidth="3" {...STROKE} />
    </svg>
  );
}

/** Scenes 3 and 5: two rings around the user's own work (a briefcase), the inner band filled when the claim lands in it. */
function Rings({ hit, a }: { hit: boolean; a: Anim }) {
  const w = a('animate-wipe', 700);
  return (
    <svg viewBox="0 0 160 84" aria-hidden="true" focusable="false" className="block h-auto w-full">
      <circle cx="80" cy="42" r="38" stroke="var(--se-route-device-fill)" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
      {hit && <circle cx="80" cy="42" r="19" fill="var(--se-verdict-red)" fillOpacity="0.35" stroke="var(--se-verdict-red)" strokeWidth="2" className={w.className} style={w.style} />}
      <circle cx="80" cy="42" r="19" stroke="var(--se-route-device-fill)" strokeWidth="1.5" fill="none" />
      <rect x="73" y="38" width="14" height="10" rx="2" fill="var(--se-fg)" />
      <path d="M77 38v-2.5h6V38" stroke="var(--se-fg)" strokeWidth="1.5" {...STROKE} />
    </svg>
  );
}

/** The attacker's own claimed precision as 1–4 bars (country … street). A level, never a place. */
function PrecisionBars({ lit, a, at }: { lit: number; a: Anim; at: number }) {
  return (
    <svg viewBox="0 0 34 16" aria-hidden="true" focusable="false" className="h-4 w-[34px] shrink-0">
      {[0, 1, 2, 3].map((i) => {
        const on = i < lit;
        const m = on ? a('animate-rise', at + i * 220) : { className: '', style: undefined };
        return (
          <rect key={i} x={i * 9} y={12 - i * 4} width="6" height={4 + i * 4} rx="1"
            fill={on ? 'var(--se-route-cloud-fill)' : 'var(--se-line-strong)'} className={m.className} style={m.style} />
        );
      })}
    </svg>
  );
}

// ---------- small HTML pieces ----------

const LANE_LABEL = 'font-mono text-caption font-bold uppercase tracking-[0.12em]';
const NOTE = 'text-small leading-5 text-fg';
const TAG = 'font-mono text-caption';

function LaneHead({ lane, dim }: { lane: 'device' | 'cloud'; dim?: boolean }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${LANE_LABEL} ${dim ? 'text-muted' : lane === 'device' ? 'text-route-device' : 'text-route-cloud'}`}>
      <Icon name={lane === 'device' ? 'chip' : 'cloud'} className="size-4 shrink-0" />
      <span className="truncate">{t(lane === 'device' ? 'ui.lanes.device' : 'ui.lanes.cloud')}</span>
    </span>
  );
}

const LEVEL_TONE = {
  RED: 'border-verdict-red bg-verdict-red-bg',
  AMBER: 'border-verdict-amber bg-verdict-amber-bg',
  LOW: 'border-verdict-grey bg-verdict-grey-bg',
} as const;
type Level = keyof typeof LEVEL_TONE;

/** RED | AMBER | LOW, every cell labelled in text; LOW is grey, never green. */
function MiniMeter({ level, a, at }: { level: Level; a: Anim; at: number }) {
  const m = a('animate-rise', at);
  return (
    <div className={`grid grid-cols-3 gap-1 ${m.className}`} style={m.style}>
      {(['RED', 'AMBER', 'LOW'] as const).map((l) => (
        <span
          key={l}
          className={`min-w-0 truncate rounded-[4px] border px-0.5 py-0.5 text-center ${TAG} font-bold ${l === level ? `${LEVEL_TONE[l]} text-fg` : 'border-line text-muted'}`}
        >
          {t(`ui.verdict.level.${l}`)}
        </span>
      ))}
    </div>
  );
}

function Conf({ a, at }: { a: Anim; at: number }) {
  const m = a('animate-rise', at);
  return (
    <p className={`${TAG} text-muted ${m.className}`} style={m.style}>
      {t('ui.verdict.conf', { confidence: 'medium' })}
    </p>
  );
}

function Rise({ as = 'p', at, a, className = '', children }: { as?: 'p' | 'div'; at: number; a: Anim; className?: string; children: ReactNode }) {
  const m = a('animate-rise', at);
  const Tag = as;
  return (
    <Tag className={`${className} ${m.className}`} style={m.style}>
      {children}
    </Tag>
  );
}

// ---------- the Wall ----------

const ARROW_AT: Record<ArrowKind, string> = { out: '25%', back: '50%', never: '75%' };

function Wall({ scene, a }: { scene: SceneNo; a: Anim }) {
  const out = scene === 2 || scene === 4;
  const back = scene === 2 || scene === 5;
  const outAt = scene === 2 ? 500 : 1300;
  const backAt = scene === 2 ? 2700 : 2000;
  const pkt = a('animate-cross', outAt);
  const ret = a('animate-cross', backAt, { animationDirection: 'reverse' });
  const ring = a('animate-pulse-ring', 900);
  return (
    <div className="relative bg-surface">
      <WallBar open={out} />
      {(['out', 'back', 'never'] as const).map((k) => (
        <ArrowGlyph key={k} kind={k} className="absolute left-1/2 h-3 w-10 -translate-x-1/2 -translate-y-1/2" style={{ top: ARROW_AT[k] }} />
      ))}
      {scene === 3 && (
        <span
          className="pointer-events-none absolute left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-verdict-teal"
          style={{ top: ARROW_AT.never }}
        />
      )}
      {/* The pulse is a second ring at opacity 0 at rest: the token has no fill-mode, so the animation shows only
          while it runs (no full ring before its delay, no snap back after). */}
      {scene === 3 && ring.className && (
        <span
          className={`pointer-events-none absolute left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-verdict-teal opacity-0 ${ring.className}`}
          style={{ top: ARROW_AT.never, ...ring.style }}
        />
      )}
      {/* The packet fades as it crosses, so it carries no mask glyph (a mask never fades, DESIGN §6.1). */}
      {out && pkt.className && (
        <span
          className={`pointer-events-none absolute top-1/4 left-1/2 z-10 -mt-3 -ml-6 block h-6 w-12 rounded-chip border border-route-cloud-fill bg-surface-2 shadow-pop ${pkt.className}`}
          style={pkt.style}
        />
      )}
      {back && ret.className && (
        <span
          className={`pointer-events-none absolute top-1/2 left-1/2 z-10 -mt-2.5 -ml-6 block h-5 w-12 rounded-chip border border-dashed border-line-strong bg-surface ${ret.className}`}
          style={ret.style}
        />
      )}
    </div>
  );
}

// ---------- one scene ----------

const LANE_BG = {
  device: 'bg-lane-device-bg border-t-4 border-t-route-device-fill',
  cloud: 'bg-lane-cloud-bg border-t-4 border-t-route-cloud-fill',
  dim: 'bg-surface border-t-4 border-t-line',
} as const;
const LANE_PAD = 'flex min-w-0 flex-col gap-2 overflow-hidden p-2.5 sm:p-3';

function DeviceLane({ scene, a }: { scene: SceneNo; a: Anim }) {
  switch (scene) {
    case 1:
      return (
        <>
          <Rise as="div" at={0} a={a} className="w-full max-w-[220px]">
            <PersonWithPhone a={a} />
          </Rise>
          <div className="flex flex-wrap items-center gap-1.5">
            <Rise at={500} a={a} className={`inline-flex items-center gap-1 rounded-chip border border-line-strong bg-surface px-1.5 py-0.5 ${TAG} text-fg`}>
              <Icon name="offline" className="size-3.5" />
              {t('ui.story.locationOff')}
            </Rise>
            <span className="relative inline-flex">
              <span className={`rounded-full border-2 border-route-device-fill px-2.5 py-0.5 ${TAG} font-bold text-fg`}>{t('ui.story.post')}</span>
              {(() => {
                const p = a('animate-pulse-ring', 1500);
                // opacity-0 at rest: visible only while the one-shot pulse runs (see Wall).
                return p.className ? <span className={`pointer-events-none absolute inset-0 rounded-full border-2 border-route-device-fill opacity-0 ${p.className}`} style={p.style} /> : null;
              })()}
            </span>
          </div>
        </>
      );
    case 2:
      return (
        <>
          <div className="w-full max-w-[220px]">
            <CoffeePhoto badgeMask a={a} maskAt={150} />
          </div>
          <Rise at={300} a={a} className={`inline-flex items-start gap-1 ${NOTE}`}>
            <Icon name="lock" className="mt-0.5 size-4 text-verdict-teal" />
            <span>{t('ui.story.vaultMasked')}</span>
          </Rise>
        </>
      );
    case 3:
      return (
        <>
          <p className={`inline-flex items-center gap-1 ${TAG} text-fg`}>
            <Icon name="lock" className="size-3.5 text-verdict-teal" />
            {t('ui.story.vault')}
          </p>
          <div className="w-full max-w-[150px] self-center sm:max-w-[200px]">
            <Rings hit a={a} />
          </div>
          <Rise at={1100} a={a} className={NOTE}>
            {t('ui.story.hit', { band: t('ui.band.neighbourhood') })}
          </Rise>
          <Rise at={1300} a={a} className={`self-start rounded-[4px] bg-route-device-bg px-1.5 py-0.5 ${TAG} text-route-device`}>
            {t('ui.story.code')}
          </Rise>
          <MiniMeter level="RED" a={a} at={1700} />
          <Conf a={a} at={1900} />
        </>
      );
    case 4:
      return (
        <>
          <div className="w-full max-w-[220px]">
            <CoffeePhoto badgeMask clueMasks a={a} maskAt={300} />
          </div>
          <Rise at={800} a={a} className={`${NOTE} font-medium text-route-device`}>
            {t('ui.story.fixed')}
          </Rise>
        </>
      );
    case 5: {
      const b = a('animate-pop', 2600);
      return (
        <>
          <div className="w-full max-w-[150px] self-center sm:max-w-[200px]">
            <Rings hit={false} a={a} />
          </div>
          <Rise at={1800} a={a} className={NOTE}>
            {t('ui.story.after', { band: t('ui.band.country') })}
          </Rise>
          <MiniMeter level="LOW" a={a} at={2200} />
          <p
            className={`rounded-chip border border-verdict-green bg-verdict-green-bg px-2 py-1 text-small font-bold text-verdict-green shadow-glow-green ${b.className}`}
            style={b.style}
          >
            {t('copy.verdict.reduced', { before: t('ui.verdict.level.RED'), after: t('ui.verdict.level.LOW') })}
          </p>
          <Conf a={a} at={2800} />
        </>
      );
    }
    default:
      return null;
  }
}

/** A photo holding masks enters by the clip-path wipe, never an opacity fade (DESIGN §6.1). */
function WipeIn({ at, a, children }: { at: number; a: Anim; children: ReactNode }) {
  const w = a('animate-wipe', at);
  return (
    <div className={`w-full max-w-[220px] ${w.className}`} style={w.style}>
      {children}
    </div>
  );
}

/**
 * The attacker's claim, as a precision LEVEL ("street level"), the app's own wording for a guess (ui.compare.guessLevel).
 * Never a `ui.band.*` distance: that is the device's measure against the user's places, which the cloud never learns.
 */
const claim = (level: 'street' | 'country') => t('ui.story.claim', { band: t('ui.compare.guessLevel', { level }) });

function CloudLane({ scene, a }: { scene: SceneNo; a: Anim }) {
  switch (scene) {
    case 1:
      return <p className={`${NOTE} text-muted`}>{t('ui.story.waiting')}</p>;
    case 2:
      return (
        <>
          <WipeIn at={900} a={a}>
            <CoffeePhoto badgeMask scan scanAt={1000} boxes="all" boxesAt={1500} maskAt={null} a={a} />
          </WipeIn>
          <Rise at={2000} a={a} className={NOTE}>
            {t('ui.story.clues')}
          </Rise>
          <div className="flex items-start gap-2">
            <PrecisionBars lit={4} a={a} at={2200} />
            <Rise at={2700} a={a} className={`${NOTE} font-medium`}>
              {claim('street')}
            </Rise>
          </div>
        </>
      );
    case 3:
      return (
        <>
          <div className="flex items-start gap-2">
            <PrecisionBars lit={4} a={makeAnim(true)} at={0} />
            <p className={NOTE}>{claim('street')}</p>
          </div>
          <Rise at={900} a={a} className={`inline-flex items-start gap-1 ${NOTE} text-muted`}>
            <Icon name="close" className="mt-0.5 size-4" />
            <span>{t('ui.story.notTold')}</span>
          </Rise>
        </>
      );
    case 4:
      return (
        <>
          <WipeIn at={1900} a={a}>
            <CoffeePhoto badgeMask clueMasks maskAt={null} a={a} />
          </WipeIn>
          <Rise at={2100} a={a} className={NOTE}>
            {t('ui.story.reattack')}
          </Rise>
        </>
      );
    case 5:
      return (
        <>
          <div className="w-full max-w-[220px]">
            <CoffeePhoto badgeMask clueMasks scan boxes="tower" boxesAt={900} maskAt={null} a={a} />
          </div>
          <Rise at={1200} a={a} className={NOTE}>
            {t('ui.story.cluesAfter')}
          </Rise>
          <div className="flex items-start gap-2">
            <PrecisionBars lit={1} a={a} at={1400} />
            <Rise at={1600} a={a} className={`${NOTE} font-medium`}>
              {claim('country')}
            </Rise>
          </div>
        </>
      );
    default:
      return null;
  }
}

/** Scene 6: the lanes fall back to panel colour; the Wall's three arrows and the line, centred. */
function EndCard({ a, big }: { a: Anim; big: boolean }) {
  const row = 'flex items-center gap-2 text-small text-muted';
  return (
    <div className="col-span-3 flex flex-col items-center justify-center gap-3 border-t-4 border-t-line bg-surface p-4 text-center">
      <ul className="flex flex-col items-start gap-1.5">
        <li className={row}>
          <ArrowGlyph kind="out" className="h-3 w-10 shrink-0" />
          {t('ui.lanes.out')}
        </li>
        <li className={row}>
          <ArrowGlyph kind="back" className="h-3 w-10 shrink-0" />
          {t('ui.lanes.back')}
        </li>
        <li className={`${row} font-semibold text-fg`}>
          <ArrowGlyph kind="never" className="h-3 w-10 shrink-0" />
          <Icon name="lock" className="size-4 text-verdict-teal" />
          {t('ui.lanes.never')}
        </li>
      </ul>
      <Rise at={300} a={a} className={`max-w-[26ch] font-bold tracking-[-0.015em] text-balance ${big ? 'text-title sm:text-h2-sm lg:text-h2' : 'text-title'}`}>
        {t('ui.story.s6')}
      </Rise>
    </div>
  );
}

/** One frame of the story. `still` renders every element at its resting (end) state with no animation. */
export function StoryScene({ scene, still, big = false, className = '' }: { scene: SceneNo; still: boolean; big?: boolean; className?: string }) {
  const a = makeAnim(still);
  const wipe = a('animate-wipe');
  const grid = `grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] ${big ? 'sm:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)]' : ''}`;
  return (
    <div data-scene={scene} className={`${grid} overflow-hidden rounded-stage border border-line ${wipe.className} ${className}`} style={wipe.style}>
      {scene === 6 ? (
        <EndCard a={a} big={big} />
      ) : (
        <>
          <div data-lane="device" className={`${LANE_PAD} ${LANE_BG.device}`}>
            <LaneHead lane="device" />
            <DeviceLane scene={scene} a={a} />
          </div>
          <Wall scene={scene} a={a} />
          <div data-lane="cloud" className={`${LANE_PAD} ${scene === 1 || scene === 3 ? LANE_BG.dim : LANE_BG.cloud}`}>
            <LaneHead lane="cloud" dim={scene === 1 || scene === 3} />
            <CloudLane scene={scene} a={a} />
          </div>
        </>
      )}
      <GateRow pulse={!still && (scene === 2 || scene === 4)} />
    </div>
  );
}

/** The gate counter under the lanes. Always true of the drawn photo: no face, and the vault match is masked first. */
function GateRow({ pulse }: { pulse: boolean }) {
  const m = makeAnim(!pulse)('animate-rise');
  return (
    <div className="col-span-3 flex flex-wrap items-center justify-center gap-x-2 border-t border-line bg-surface px-2 py-1.5">
      <span className={EYEBROW}>{t('ui.lanes.gate')}</span>
      <Icon name="lock" className="size-4 text-verdict-teal" />
      <span className={`font-mono text-hud text-fg tabular-nums ${m.className}`} style={m.style}>
        {t('ui.lanes.gateCount', { f: 0, v: 0 })}
      </span>
    </div>
  );
}

// ---------- the reel ----------

function Header({ id, title }: { id: string; title: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      {title ? (
        <h2 id={id} className="min-w-0 text-title font-semibold text-balance">
          {t('ui.story.title')}
        </h2>
      ) : (
        <span id={id} className="sr-only">{t('ui.story.title')}</span>
      )}
      <span className={`${EYEBROW} rounded-chip border border-line-strong px-1.5 py-0.5`}>{t('ui.story.tag')}</span>
    </div>
  );
}

function Strip({ className = '', title = true }: { className?: string; title?: boolean }) {
  const id = useId();
  return (
    <figure aria-labelledby={id} data-reel="strip" className={`@container flex min-w-0 flex-col gap-3 ${className}`}>
      <Header id={id} title={title} />
      {/* Two columns only from a 48 rem container (each frame at least about 370 px), so lane labels and the meter fit. */}
      <ol aria-label={t('ui.story.stripLabel')} className="grid gap-4 @3xl:grid-cols-2">
        {SCENES.map((n) => (
          <li key={n} className="flex min-w-0 flex-col gap-2">
            {/* Frames in one row share a height, so their captions line up. */}
            <div aria-hidden="true" className="flex-1">
              <StoryScene scene={n} still className="h-full grid-rows-[minmax(0,1fr)_auto]" />
            </div>
            <p className="flex min-h-10 gap-2 text-small">
              <span className="font-mono font-bold text-muted tabular-nums">{n}</span>
              <span>{n === 6 ? `${t(CAPTION[n])} ${t('ui.story.ask')}` : t(CAPTION[n])}</span>
            </p>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const ROUND_BTN =
  'grid size-11 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-fg transition-colors duration-150 hover:bg-surface-3';

function Player({
  variant,
  className = '',
  title = true,
  pinned,
  manual = false,
}: {
  variant: 'hero' | 'compact';
  className?: string;
  title?: boolean;
  pinned?: SceneNo;
  /** Reduced motion: still frames, stepped by Prev/Next only (no autoplay, so no Pause is needed). */
  manual?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState<StepState>({ scene: pinned ?? 1, loop: 0, held: false });
  const [userPaused, setUserPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabHidden, setTabHidden] = useState(false);
  const running = !manual && pinned === undefined && !step.held && !userPaused && onScreen && !tabHidden;

  // Time already spent in the current scene, so Pause/Play resumes where it stopped.
  const key = `${step.loop}-${step.scene}`;
  const spent = useRef<{ key: string; ms: number }>({ key, ms: 0 });
  useEffect(() => {
    if (!running) return;
    if (spent.current.key !== key) spent.current = { key, ms: 0 };
    const started = performance.now();
    const h = window.setTimeout(() => {
      spent.current = { key: '', ms: 0 };
      setStep(nextStep);
    }, Math.max(0, SCENE_MS[step.scene] - spent.current.ms));
    return () => {
      window.clearTimeout(h);
      if (spent.current.key === key) spent.current.ms += performance.now() - started;
    };
  }, [running, key, step.scene]);

  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    const el = ref.current;
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.2 });
      io.observe(el);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
    };
  }, []);

  const toggle = useCallback(() => {
    if (step.held) {
      spent.current = { key: '', ms: 0 };
      setStep({ scene: 1, loop: 0, held: false });
      setUserPaused(false);
      return;
    }
    setUserPaused((p) => !p);
  }, [step.held]);
  const go = useCallback((d: 1 | -1) => setStep((s) => ({ scene: manualStep(s.scene, d), loop: 0, held: false })), []);

  const big = variant === 'hero';
  const still = manual || step.held;
  const playing = !step.held && !userPaused;
  const label = step.held ? t('ui.story.replay') : userPaused ? t('ui.story.play') : t('ui.story.pause');
  return (
    <figure
      ref={ref}
      aria-labelledby={id}
      data-reel={variant}
      data-mode={manual ? 'manual' : 'auto'}
      data-paused={running || pinned !== undefined ? 'false' : 'true'}
      className={`se-reel flex min-w-0 flex-col gap-2 ${className}`}
    >
      <Header id={id} title={title} />
      <div aria-hidden="true" className={big ? 'h-[380px] sm:h-[340px]' : 'h-[380px]'}>
        <StoryScene key={key} scene={step.scene} still={still} big={big} className="h-full grid-rows-[minmax(0,1fr)_auto]" />
      </div>
      {/* Counter left, control(s) right; the caption between them from sm, and on its own full-width row on phones.
          Its height is reserved in line units (it scales with text zoom), so the page never shifts as captions change.
          Scene 6's stage already shows the line, so its caption asks the reader's own question. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <span aria-hidden="true" className="col-start-1 row-start-1 shrink-0 font-mono text-caption text-muted tabular-nums">
          {t('ui.story.sceneOf', { n: step.scene, total: SCENES.length })}
        </span>
        <p
          aria-hidden="true"
          key={key}
          className={`col-span-3 row-start-2 flex min-h-[3lh] min-w-0 items-start sm:col-span-1 sm:items-center sm:col-start-2 sm:row-start-1 sm:min-h-[2lh] ${big ? 'text-body sm:text-lead' : 'text-body'} font-medium ${still ? '' : 'animate-rise'}`}
        >
          {t(step.scene === 6 ? 'ui.story.ask' : CAPTION[step.scene])}
        </p>
        <div className="col-start-3 row-start-1 flex items-center gap-2">
          {manual ? (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={t('ui.story.prev')} title={t('ui.story.prev')} className={ROUND_BTN}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
                  <path d="M15.5 5.5v13L5 12Z" />
                </svg>
              </button>
              <button type="button" onClick={() => go(1)} aria-label={t('ui.story.next')} title={t('ui.story.next')} className={ROUND_BTN}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
                  <path d="M8.5 5.5v13L19 12Z" />
                </svg>
              </button>
            </>
          ) : (
            <button type="button" onClick={toggle} aria-label={label} title={label} className={ROUND_BTN}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
                {playing ? <path d="M7 5h3.5v14H7Z M13.5 5H17v14h-3.5Z" /> : <path d="M8 5.5v13l11-6.5Z" />}
              </svg>
            </button>
          )}
        </div>
      </div>
      <ol aria-label={t('ui.story.listLabel')} className="sr-only">
        {SCENES.map((n) => (
          <li key={n}>{n === 6 ? `${t(CAPTION[n])} ${t('ui.story.ask')}` : t(CAPTION[n])}</li>
        ))}
      </ol>
    </figure>
  );
}

/** Prev/Next in the reduced-motion player: wraps 6 → 1 and 1 → 6. */
export function manualStep(scene: SceneNo, d: 1 | -1): SceneNo {
  return (((scene - 1 + d + SCENES.length) % SCENES.length) + 1) as SceneNo;
}

export type ReelMode = 'strip' | 'auto' | 'manual';

/**
 * How the reel renders: the strip only when asked for (About); otherwise the player, which under reduced motion is
 * manual (still frames from scene 1, Prev/Next) so it keeps the player's height on Welcome and Home. A pinned scene
 * (tests, the frame export) always plays.
 */
export function reelMode(variant: StoryVariant, reducedMotion: boolean, pinned: SceneNo | undefined): ReelMode {
  if (variant === 'strip') return 'strip';
  return reducedMotion && pinned === undefined ? 'manual' : 'auto';
}

export function StoryReel({ variant, className, title = true, scene }: StoryReelProps) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const pinned = scene ?? devPinnedScene();
  const mode = reelMode(variant, reduced, pinned);
  if (mode === 'strip' || variant === 'strip') return <Strip className={className} title={title} />;
  return <Player variant={variant} className={className} title={title} pinned={pinned} manual={mode === 'manual'} />;
}
