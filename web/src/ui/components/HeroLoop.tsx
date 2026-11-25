// web/src/ui/components/HeroLoop.tsx: the looping hero (D-171; replaces the D-162 StoryReel on Welcome and Home).
// The Figma-generated hero illustration (web/public/art/hero.webp, credited in SOURCES.md) with an SVG overlay drawn in
// the image's own 1536 × 864 space, on one 10 s CSS loop (keyframes `se-loop-*` in index.css):
//   1 (0–40 %)  a violet packet leaves the phone, flashes through the gate; violet brackets frame the solid masks;
//   2 (40–70 %) the cloud's eye pulses, its scan rays run and a scan bar sweeps the copy;
//   3 (70–100 %) a "?" (right or wrong?) flies back from the cloud and is stopped at the wall.
// The three captions are HTML (ui.loop.s1–s3), shown in step with the picture by the same CSS clock, so there is no JS
// timer. It is an ILLUSTRATION: no AI call, no vault, no Ledger, no measured number.
// Hard rules kept here:
// - Invariant 5: nothing marks a place: no map, pin or dot for a guess; the rays end at the copy.
// - Invariant 6: masks are the art's solid black boxes; the overlay never blurs or covers them (only brackets around).
// - WCAG 2.2.2: a Pause/Play button is always visible; paused state stops every overlay animation.
// - prefers-reduced-motion: the overlay is not drawn and the three captions show as a static, numbered list.
// The picture is decorative (aria-hidden); a visually hidden <ol> carries the three steps for assistive technology.
import { useId, useState } from 'react';
import { t, type StringId } from '../../core/strings';

const STEPS: readonly StringId[] = ['ui.loop.s1', 'ui.loop.s2', 'ui.loop.s3'];

/** The art's masked copy: the two solid masks the brackets frame (image coordinates). */
const MASKS = [
  { x: 733, y: 292, w: 64, h: 30 },
  { x: 787, y: 480, w: 26, h: 20 },
] as const;

/** Four corner brackets around a box, `pad` outside it, arms `arm` long. */
function brackets(b: { x: number; y: number; w: number; h: number }, pad = 9, arm = 16): string {
  const l = b.x - pad, r = b.x + b.w + pad, tp = b.y - pad, bt = b.y + b.h + pad;
  return [
    `M${l} ${tp + arm}V${tp}H${l + arm}`, `M${r - arm} ${tp}H${r}V${tp + arm}`,
    `M${r} ${bt - arm}V${bt}H${r - arm}`, `M${l + arm} ${bt}H${l}V${bt - arm}`,
  ].join('');
}

export interface HeroLoopProps {
  className?: string;
  /** Eager-load the picture (above the fold). */
  eager?: boolean;
}

export function HeroLoop({ className = '', eager = true }: HeroLoopProps) {
  const [paused, setPaused] = useState(false);
  const id = useId();
  const glow = `${id}-glow`;
  const scan = `${id}-scan`;
  return (
    <figure className={`se-loop flex min-w-0 flex-col overflow-hidden rounded-stage border border-line-strong bg-[#0b0b0f] ${className}`}
      data-paused={paused ? 'true' : 'false'} aria-labelledby={`${id}-cap`}>
      <div className="relative aspect-[16/9] w-full" aria-hidden="true">
        <img src="/art/hero.webp" srcSet="/art/hero-768.webp 768w, /art/hero.webp 1536w" sizes="(min-width: 1280px) 50vw, 100vw"
          width={1536} height={864} alt="" draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async"
          className="absolute inset-0 size-full object-cover" />
        <svg viewBox="0 0 1536 864" preserveAspectRatio="xMidYMid slice" className="se-loop-art absolute inset-0 size-full">
          <defs>
            <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id={scan} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#60a5fa" stopOpacity="0" />
              <stop offset="0.5" stopColor="#93c5fd" stopOpacity="0.75" />
              <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 1: the packet through the gate */}
          <rect className="se-loop-gate" x="489" y="198" width="26" height="466" rx="6" fill="#c4b5fd" filter={`url(#${glow})`} />
          <g className="se-loop-packet" filter={`url(#${glow})`}>
            <rect x="-36" y="376" width="72" height="48" rx="10" fill="#a78bfa" />
            <rect x="-24" y="388" width="32" height="10" rx="2" fill="#0b0b0f" />
            <rect x="-6" y="405" width="20" height="8" rx="2" fill="#0b0b0f" />
          </g>
          <g className="se-loop-brackets" fill="none" stroke="#c4b5fd" strokeWidth="6" strokeLinecap="round" filter={`url(#${glow})`}>
            {MASKS.map((m) => <path key={m.x} d={brackets(m)} />)}
          </g>
          {/* 2: the cloud looks */}
          <ellipse className="se-loop-eye" cx="1258" cy="202" rx="86" ry="52" fill="#60a5fa" />
          <g className="se-loop-rays" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 12" filter={`url(#${glow})`}>
            <line x1="1186" y1="206" x2="826" y2="288" />
            <line x1="1186" y1="216" x2="826" y2="372" />
          </g>
          <rect className="se-loop-scan" x="673" y="0" width="150" height="40" fill={`url(#${scan})`} />
          {/* 3: right or wrong? stopped at the wall */}
          <g className="se-loop-q" filter={`url(#${glow})`}>
            <circle cx="0" cy="600" r="30" fill="#10233f" stroke="#93c5fd" strokeWidth="3" />
            <text x="0" y="614" textAnchor="middle" fontSize="40" fontWeight="800" fill="#bfdbfe" fontFamily="system-ui, sans-serif">?</text>
          </g>
          <circle className="se-loop-burst" cx="566" cy="600" r="34" fill="none" stroke="#93c5fd" strokeWidth="4" />
          <rect className="se-loop-block" x="556" y="520" width="6" height="160" rx="3" fill="#93c5fd" filter={`url(#${glow})`} />
        </svg>
        <span className="absolute left-3 top-3 rounded-chip border border-white/25 bg-black/55 px-2 py-0.5 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">
          {t('ui.loop.tag')}
        </span>
      </div>
      <figcaption id={`${id}-cap`} className="flex min-h-[5.25rem] items-center gap-3 border-t border-white/10 bg-[#0e0f15] px-4 py-3 text-white">
        <span className="sr-only">{t('ui.loop.label')}</span>
        <ol className="sr-only">{STEPS.map((s) => <li key={s}>{t(s)}</li>)}</ol>
        <div className="se-loop-captions relative min-h-[3rem] min-w-0 flex-1" aria-hidden="true">
          {STEPS.map((s, i) => (
            <p key={s} className={`se-loop-cap se-loop-cap-${i + 1} flex items-start gap-2.5 text-body font-semibold leading-snug`}>
              <span className="se-loop-num grid size-6 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-[12px]">{i + 1}</span>
              <span className="min-w-0">{t(s)}</span>
            </p>
          ))}
        </div>
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}
          aria-label={t(paused ? 'ui.loop.play' : 'ui.loop.pause')}
          className="se-loop-toggle inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/25 text-white transition-colors duration-150 hover:bg-white/10">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
            {paused ? <path d="M8 5.5v13l11-6.5Z" /> : <path d="M7 5h3.5v14H7Z M13.5 5H17v14h-3.5Z" />}
          </svg>
        </button>
      </figcaption>
    </figure>
  );
}
