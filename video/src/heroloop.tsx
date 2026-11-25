// The app's HeroLoop (D-171, web/src/ui/components/HeroLoop.tsx) for the video: the same Figma hero illustration and the
// same overlay geometry (image space 1536 × 864), but every effect is driven by cue times in seconds, so the scene can
// follow the narration instead of a fixed 10 s cycle. Same rules as the app: nothing marks a place (no map, pin or dot;
// the rays end at the copy), the art's masks are never blurred or covered (brackets sit outside them).
import { Img, interpolate, staticFile } from 'remotion';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** 0 → 1 over [a, b]. */
const ramp = (t: number, a: number, b: number) => interpolate(t, [a, b], [0, 1], clamp);
/** In over [a, a+fade], hold, out over [b-fade, b]. */
const win = (t: number, a: number, b: number, fade = 0.35) => Math.min(ramp(t, a, a + fade), 1 - ramp(t, b - fade, b));

const MASKS = [
  { x: 733, y: 292, w: 64, h: 30 },
  { x: 787, y: 480, w: 26, h: 20 },
] as const;
const brackets = (b: { x: number; y: number; w: number; h: number }, pad = 9, arm = 16) => {
  const l = b.x - pad, r = b.x + b.w + pad, tp = b.y - pad, bt = b.y + b.h + pad;
  return `M${l} ${tp + arm}V${tp}H${l + arm}M${r - arm} ${tp}H${r}V${tp + arm}M${r} ${bt - arm}V${bt}H${r - arm}M${l + arm} ${bt}H${l}V${bt - arm}`;
};

export interface LoopCues {
  /** Each pass of the packet from the phone through the gate to the copy: [start, end] in seconds. */
  packets: readonly (readonly [number, number])[];
  /** Windows in which brackets frame the masks. */
  brackets: readonly (readonly [number, number])[];
  /** The cloud looks: eye pulse, rays and the scan bar, [start, end]. */
  scan: readonly [number, number];
  /** The "?" leaves the cloud at [0] and is stopped at the wall at [1]. */
  q: readonly [number, number];
}

export const HeroLoopArt = ({ t, x, y, w, cues, opacity = 1 }: { t: number; x: number; y: number; w: number; cues: LoopCues; opacity?: number }) => {
  const h = (w * 864) / 1536;
  // packet: phone (330) → gate (500..524) → copy (668); the gate flashes while it passes
  let px = -1, pOp = 0, gate = 0;
  for (const [a, b] of cues.packets) {
    if (t < a || t > b + 0.4) continue;
    const p = ramp(t, a, b);
    px = interpolate(p, [0, 0.45, 0.55, 1], [330, 500, 524, 668]);
    pOp = Math.min(ramp(t, a, a + 0.25), 1 - ramp(t, b, b + 0.35));
    gate = Math.max(gate, 1 - Math.abs(p - 0.5) / 0.25);
  }
  const br = Math.max(0, ...cues.brackets.map(([a, b]) => win(t, a, b)));
  const brScale = 1.35 - 0.35 * Math.max(0, ...cues.brackets.map(([a]) => ramp(t, a, a + 0.4)));
  const [s0, s1] = cues.scan;
  const look = win(t, s0, s1, 0.5);
  const eye = look * (0.22 + 0.16 * Math.sin((t - s0) * Math.PI * 2 * 0.8));
  const scanY = interpolate(t, [s0 + 0.4, s1 - 0.4], [250, 486], clamp);
  const dash = -((t * 62) % 56);
  const [q0, q1] = cues.q;
  const qx = interpolate(t, [q0, q1], [1160, 598], { ...clamp, easing: (v) => v * v * (3 - 2 * v) });
  const qOp = Math.min(ramp(t, q0, q0 + 0.3), 1 - ramp(t, q1 + 0.1, q1 + 0.5));
  const hit = ramp(t, q1, q1 + 0.8);
  const block = win(t, q1 - 0.05, q1 + 0.9, 0.15);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 24, overflow: 'hidden', opacity, boxShadow: '0 40px 100px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <Img src={staticFile('img/art-hero.webp')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <svg viewBox="0 0 1536 864" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <filter id="hl-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="hl-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#60a5fa" stopOpacity="0" />
            <stop offset="0.5" stopColor="#93c5fd" stopOpacity="0.75" />
            <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="489" y="198" width="26" height="466" rx="6" fill="#c4b5fd" opacity={0.85 * gate} filter="url(#hl-glow)" />
        {px >= 0 ? (
          <g transform={`translate(${px} 0)`} opacity={pOp} filter="url(#hl-glow)">
            <rect x="-36" y="376" width="72" height="48" rx="10" fill="#a78bfa" />
            <rect x="-24" y="388" width="32" height="10" rx="2" fill="#0b0b0f" />
            <rect x="-6" y="405" width="20" height="8" rx="2" fill="#0b0b0f" />
          </g>
        ) : null}
        <g opacity={br} fill="none" stroke="#c4b5fd" strokeWidth="6" strokeLinecap="round" filter="url(#hl-glow)">
          {MASKS.map((m) => {
            const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
            return <path key={m.x} d={brackets(m)} transform={`translate(${cx} ${cy}) scale(${brScale}) translate(${-cx} ${-cy})`} />;
          })}
        </g>
        <ellipse cx="1258" cy="202" rx="86" ry="52" fill="#60a5fa" opacity={eye} style={{ mixBlendMode: 'screen' }} />
        <g opacity={look} stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 12" strokeDashoffset={dash} filter="url(#hl-glow)">
          <line x1="1186" y1="206" x2="826" y2="288" />
          <line x1="1186" y1="216" x2="826" y2="372" />
        </g>
        <rect x="673" y={scanY} width="150" height="40" fill="url(#hl-scan)" opacity={look} style={{ mixBlendMode: 'screen' }} />
        <g transform={`translate(${qx} 0)`} opacity={qOp} filter="url(#hl-glow)">
          <circle cx="0" cy="600" r="30" fill="#10233f" stroke="#93c5fd" strokeWidth="3" />
          <text x="0" y="614" textAnchor="middle" fontSize="40" fontWeight="800" fill="#bfdbfe" fontFamily="system-ui, sans-serif">?</text>
        </g>
        <circle cx="566" cy="600" r={34 * (0.3 + 1.5 * hit)} fill="none" stroke="#93c5fd" strokeWidth="4" opacity={hit > 0 && hit < 1 ? 1 - hit : 0} />
        <rect x="556" y="520" width="6" height="160" rx="3" fill="#93c5fd" opacity={block} filter="url(#hl-glow)" />
      </svg>
    </div>
  );
};
