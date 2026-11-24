// Illustrated, animated building blocks for the explainer scenes (D-164 video, plain-language cut). Everything here is
// drawn: no real map, no real address. Photos are the CC0 Judge samples; scan boxes are the attacker's own recorded
// boxes (box_2d, 0..1000, [ymin, xmin, ymax, xmax]) from web/public/samples/judge-0N.advB.v1.json.
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, MONO } from './theme';

export const useSpring = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** A phone with a screen; children render inside the screen (390x844 design units, scaled by `scale`). */
export const Phone = ({ x, y, scale = 1, children, glow }: { x: number; y: number; scale?: number; children?: ReactNode; glow?: string }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: 390, height: 800, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: 60, background: '#1b1e26', border: '3px solid #3a3f4b',
      boxShadow: glow ? `0 0 80px ${glow}55, 0 40px 90px rgba(0,0,0,0.6)` : '0 40px 90px rgba(0,0,0,0.6)' }} />
    <div style={{ position: 'absolute', left: 16, top: 16, right: 16, bottom: 16, borderRadius: 46, overflow: 'hidden', background: '#0e1016' }}>
      <div style={{ position: 'absolute', left: '50%', top: 12, width: 110, height: 30, marginLeft: -55, borderRadius: 20, background: '#000', zIndex: 5 }} />
      {children}
    </div>
  </div>
);

export type Box = [number, number, number, number]; // [ymin, xmin, ymax, xmax], 0..1000
/** A photo with optional animated scan boxes (the attacker's view) and solid masks (the fix). */
export const PhotoCard = ({ src, w, h, boxes = [], scanFrom = 0, masks = [], maskFrom = 0, labels = [], style }: {
  src: string; w: number; h: number; boxes?: Box[]; scanFrom?: number; masks?: Box[]; maskFrom?: number; labels?: string[]; style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,0.55)', ...style }}>
      <Img src={staticFile(`img/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {boxes.map((b, i) => {
        const p = interpolate(frame, [scanFrom + i * 14, scanFrom + i * 14 + 12], [0, 1], clamp);
        const [y0, x0, y1, x1] = b.map((v) => v / 1000);
        return (
          <div key={`b${i}`} style={{ position: 'absolute', left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%`,
            border: `4px solid ${C.amber}`, borderRadius: 8, opacity: p, transform: `scale(${1.25 - 0.25 * p})`, boxShadow: `0 0 24px ${C.amber}88` }}>
            {labels[i] ? <div style={{ position: 'absolute', left: -4, top: -46, background: C.amber, color: '#111', fontFamily: MONO, fontWeight: 800, fontSize: 22,
              padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>{labels[i]}</div> : null}
          </div>
        );
      })}
      {masks.map((b, i) => {
        const p = interpolate(frame, [maskFrom + i * 10, maskFrom + i * 10 + 10], [0, 1], clamp);
        const [y0, x0, y1, x1] = b.map((v) => v / 1000);
        return <div key={`m${i}`} style={{ position: 'absolute', left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100 * p}%`,
          height: `${(y1 - y0) * 100}%`, background: '#1f1f1f' }} />;
      })}
    </div>
  );
};

/** A drawn neighbourhood: grid streets, a home icon, and distance rings that grow in (no real map, no address). */
export const RingMap = ({ w, h, rings, home = true, from = 0, highlight }: {
  w: number; h: number; rings: { r: number; label: string; color: string }[]; home?: boolean; from?: number; highlight?: number;
}) => {
  const frame = useCurrentFrame();
  const cx = w / 2, cy = h / 2;
  return (
    <svg width={w} height={h} style={{ borderRadius: 24, background: '#10141c', border: `1px solid ${C.line}` }}>
      {Array.from({ length: 14 }, (_, i) => <line key={`v${i}`} x1={(i + 0.5) * (w / 14)} y1={0} x2={(i + 0.5) * (w / 14) + (i % 3) * 8} y2={h} stroke="#1d2431" strokeWidth={i % 4 === 0 ? 7 : 3} />)}
      {Array.from({ length: 10 }, (_, i) => <line key={`h${i}`} x1={0} y1={(i + 0.5) * (h / 10)} x2={w} y2={(i + 0.5) * (h / 10) - (i % 2) * 10} stroke="#1d2431" strokeWidth={i % 3 === 0 ? 7 : 3} />)}
      {rings.map((g, i) => {
        const p = interpolate(frame, [from + i * 18, from + i * 18 + 20], [0, 1], clamp);
        const on = highlight === i;
        return (
          <g key={i} opacity={p}>
            <circle cx={cx} cy={cy} r={g.r * p} fill={on ? `${g.color}22` : 'none'} stroke={g.color} strokeWidth={on ? 6 : 3} strokeDasharray={on ? undefined : '14 10'} />
            <text x={cx + g.r * 0.72 * p} y={cy - g.r * 0.72 * p} fill={g.color} fontFamily={MONO} fontSize={26} fontWeight={800}>{g.label}</text>
          </g>
        );
      })}
      {home ? (
        <g transform={`translate(${cx - 34},${cy - 34})`}>
          <rect x={0} y={0} width={68} height={68} rx={16} fill={C.device} />
          <path d="M14 36 L34 18 L54 36 L54 54 L14 54 Z" fill="#160f2b" />
        </g>
      ) : null}
    </svg>
  );
};

/** A padlock (closed), drawn. */
export const Lock = ({ size = 120, color = C.device }: { size?: number; color?: string }) => (
  <svg width={size} height={size * 1.15} viewBox="0 0 100 115">
    <path d="M25 50 V32 a25 25 0 0 1 50 0 V50" fill="none" stroke={color} strokeWidth={10} />
    <rect x={10} y={48} width={80} height={62} rx={14} fill={color} />
    <circle cx={50} cy={76} r={9} fill="#160f2b" /><rect x={46} y={78} width={8} height={18} rx={3} fill="#160f2b" />
  </svg>
);

/** A cloud, drawn. */
export const Cloud = ({ w = 260, color = C.cloud }: { w?: number; color?: string }) => (
  <svg width={w} height={w * 0.62} viewBox="0 0 200 124">
    <path d="M50 110 a40 40 0 0 1 -4 -80 a52 52 0 0 1 98 -4 a42 42 0 0 1 10 84 Z" fill={`${color}26`} stroke={color} strokeWidth={6} />
  </svg>
);

/** A labelled arrow callout over footage: a box with text and a line to a target point (all in 1920x1080 frame px). */
export const Callout = ({ x, y, tx, ty, text, color = C.amber, delay = 0, w = 520 }: { x: number; y: number; tx: number; ty: number; text: string; color?: string; delay?: number; w?: number }) => {
  const p = useSpring(delay);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: p }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={x + w / 2} y1={y + 40} x2={x + w / 2 + (tx - x - w / 2) * p} y2={y + 40 + (ty - y - 40) * p} stroke={color} strokeWidth={5} />
        <circle cx={tx} cy={ty} r={14 * p} fill="none" stroke={color} strokeWidth={5} />
      </svg>
      <div style={{ position: 'absolute', left: x, top: y, width: w, background: 'rgba(10,11,15,0.92)', border: `3px solid ${color}`, borderRadius: 16,
        padding: '16px 22px', fontSize: 34, fontWeight: 800, color: C.fg, lineHeight: 1.2, transform: `translateY(${(1 - p) * 16}px)` }}>{text}</div>
    </AbsoluteFill>
  );
};

/** Burned-in captions: the scene's narration split into sentences, each shown for its share of the voice. */
export const Subtitles = ({ text, seconds }: { text: string; seconds: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = text.match(/[^.?!:;]+[.?!:;]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const total = parts.reduce((a, s) => a + s.length, 0);
  let t = 0;
  const now = frame / fps;
  let cur = parts[parts.length - 1];
  for (const s of parts) { const d = seconds * (s.length / total); if (now < t + d) { cur = s; break; } t += d; }
  if (now > seconds + 0.3) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ maxWidth: 1500, background: 'rgba(0,0,0,0.78)', borderRadius: 14, padding: '12px 26px', fontSize: 40, fontWeight: 700, lineHeight: 1.25,
        textAlign: 'center', color: '#fff' }}>{cur}</div>
    </div>
  );
};
