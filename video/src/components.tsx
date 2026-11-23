import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Img, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import clips from '../public/clips.json';
import { C, MONO } from './theme';

type ClipIndex = { durations: Record<string, number>; marks: Record<string, Record<string, number>> };
const IDX = clips as unknown as ClipIndex;

export const useAppear = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200 } });
};

export const Fade = ({ delay = 0, y = 24, children, style }: { delay?: number; y?: number; children: ReactNode; style?: CSSProperties }) => {
  const p = useAppear(delay);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>;
};

/** A point in a recorded clip: seconds, or a mark the recorder logged (+ an offset in seconds). */
export type At = number | { mark: string; plus?: number };
const sec = (clip: string, at: At | undefined, fallback: number): number => {
  if (at === undefined) return fallback;
  if (typeof at === 'number') return at;
  const m = IDX.marks[clip]?.[at.mark];
  if (m === undefined) throw new Error(`clip ${clip}: no mark "${at.mark}"`);
  return Math.max(0, m + (at.plus ?? 0));
};

/**
 * Real app footage (public/clips/<clip>.mp4, recorded by scripts/record.mjs), from..to fitted to the time it has on
 * screen: sped up (at most 4x, and then labelled) or slowed (to 0.6x at most). `zoom`/`origin` push in on a region.
 */
export const Footage = ({ clip, from, to, frames, zoom = 1, origin = '50% 50%', zoomTo }: {
  clip: string; from?: At; to?: At; frames?: number; zoom?: number; origin?: string; zoomTo?: number;
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const full = IDX.durations[clip] ?? 10;
  const a = sec(clip, from, 0);
  const b = Math.min(full, sec(clip, to, full));
  const avail = (frames ?? durationInFrames) / fps;
  const rate = Math.min(4, Math.max(0.6, (b - a) / Math.max(1, avail)));
  const z = zoomTo === undefined ? zoom : interpolate(frame, [0, frames ?? durationInFrames], [zoom, zoomTo], { extrapolateRight: 'clamp' });
  const p = useAppear(2);
  return (
    <div style={{ position: 'absolute', left: 96, right: 96, top: 28, height: 972 * (1728 / 1728), borderRadius: 16, overflow: 'hidden',
      border: `1px solid ${C.line}`, boxShadow: '0 30px 80px rgba(0,0,0,0.55)', background: '#000', opacity: p }}>
      <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} muted playbackRate={rate} startFrom={Math.round(a * 30)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`, transformOrigin: origin }} />
      {rate >= 1.25 ? (
        <div style={{ position: 'absolute', right: 18, bottom: 16, fontFamily: MONO, fontSize: 24, fontWeight: 700, color: C.fg,
          background: 'rgba(0,0,0,0.72)', border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 12px' }}>×{rate.toFixed(1)}</div>
      ) : null}
    </div>
  );
};

/** The bar under the footage: what the scene shows, and the honesty line (what is real, what is replayed). */
export const Caption = ({ kicker, color = C.fg, note }: { kicker: string; color?: string; note: string }) => (
  <div style={{ position: 'absolute', left: 96, right: 96, bottom: 22, height: 60, display: 'flex', alignItems: 'center', gap: 22 }}>
    <Fade delay={4} y={10}>
      <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, letterSpacing: 2, color, border: `2px solid ${color}`, borderRadius: 999, padding: '6px 18px', whiteSpace: 'nowrap' }}>{kicker}</span>
    </Fade>
    <Fade delay={8} y={10}><span style={{ fontSize: 21, color: C.muted, whiteSpace: 'nowrap' }}>{note}</span></Fade>
  </div>
);

/** A still photo with a slow push-in (Ken Burns), optionally dimmed. */
export const Photo = ({ src, from = 1, to = 1.08, origin = '50% 50%', dim = 0 }: { src: string; from?: number; to?: number; origin?: string; dim?: number }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(frame, [0, durationInFrames], [from, to]);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img src={staticFile(`img/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`, transformOrigin: origin }} />
      {dim ? <AbsoluteFill style={{ background: `rgba(11,12,16,${dim})` }} /> : null}
    </AbsoluteFill>
  );
};

export const Pill = ({ color, children, size = 26 }: { color: string; children: ReactNode; size?: number }) => (
  <span style={{ display: 'inline-block', border: `2px solid ${color}`, color, borderRadius: 999, padding: '6px 18px', fontSize: size, fontWeight: 700,
    fontFamily: MONO, letterSpacing: 1, whiteSpace: 'nowrap' }}>{children}</span>
);

export const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 22, padding: 36, ...style }}>{children}</div>
);
