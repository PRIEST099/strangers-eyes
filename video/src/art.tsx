// Drawn cast for the plain-language explainer (D-164 video): a generic street scene, the cloud AI with an eye, the
// checkpoint wall, the 4-step strip, icons and the logo. All SVG; nothing real (no map, no address, no brand).
import type { CSSProperties, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, MONO } from './theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** Spring progress 0→1 starting at `sec` seconds into the scene. */
export const useAt = (sec: number, damping = 14, mass = 0.8) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - sec * fps, fps, config: { damping, mass } });
};
/** Linear 0→1 between two times (seconds). */
export const useLin = (a: number, b: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return interpolate(frame / fps, [a, b], [0, 1], clamp);
};
export const useSec = () => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return f / fps; };

// ---------------------------------------------------------------- the street (viewBox 800x450)
export type StreetBox = 'sign' | 'shop' | 'tower' | 'face' | 'sticker';
export const STREET_BOX: Record<StreetBox, [number, number, number, number]> = { // x0, y0, x1, y1
  sign: [66, 236, 214, 279], shop: [428, 182, 592, 212], tower: [598, 86, 722, 205], face: [337, 282, 373, 318], sticker: [340, 330, 372, 346],
};
export const STREET_LABEL: Record<StreetBox, string> = { sign: 'STREET SIGN', shop: 'SHOP NAME', tower: 'BUILDING', face: 'FACE', sticker: 'NAME TAG' };

/** A generic drawn street. `boxes` draw amber scan boxes (progress 0..1 each); `masks` stamp solid blocks (0..1 each). */
export const Street = ({ w, person = false, boxes = {}, masks = {}, style }: {
  w: number; person?: boolean; boxes?: Partial<Record<StreetBox, number>>; masks?: Partial<Record<StreetBox, number>>; style?: CSSProperties;
}) => (
  <svg width={w} height={(w * 9) / 16} viewBox="0 0 800 450" style={{ display: 'block', ...style }}>
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fb0dc" /><stop offset="1" stopColor="#bcd6ec" /></linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#sky)" />
    <circle cx="690" cy="60" r="26" fill="#fff4c9" opacity="0.9" />
    {/* tower */}
    <rect x="610" y="120" width="100" height="250" fill="#d9b48a" />
    <path d="M600 124 L660 70 L720 124 Z" fill="#7a4b3a" />
    <rect x="645" y="150" width="30" height="40" rx="15" fill="#5b4636" />
    <circle cx="660" cy="232" r="16" fill="#f2efe9" stroke="#5b4636" strokeWidth="4" />
    {/* houses */}
    <rect x="40" y="200" width="190" height="170" fill="#e8c39e" />
    <path d="M30 204 L135 140 L240 204 Z" fill="#b5523b" />
    <rect x="70" y="240" width="40" height="44" fill="#6a8bb0" /><rect x="160" y="240" width="40" height="44" fill="#6a8bb0" />
    <rect x="250" y="220" width="170" height="150" fill="#cfd8e3" />
    <path d="M242 224 L335 168 L428 224 Z" fill="#5b6b82" />
    <rect x="280" y="252" width="36" height="40" fill="#6a8bb0" />
    {/* shop */}
    <rect x="430" y="212" width="160" height="158" fill="#f2efe9" />
    <rect x="430" y="184" width="160" height="28" fill="#2f6f62" />
    <path d="M444 198 q8 -8 16 0 t16 0 t16 0 M500 198 q8 -8 16 0 t16 0 t16 0 t16 0" stroke="#e8f5f1" strokeWidth="4" fill="none" />
    {Array.from({ length: 8 }, (_, i) => <rect key={i} x={430 + i * 20} y="212" width="20" height="26" fill={i % 2 ? '#f2efe9' : '#c94a3f'} />)}
    <rect x="450" y="262" width="56" height="108" fill="#8fa9c2" /><rect x="520" y="262" width="54" height="60" fill="#8fa9c2" />
    {/* tree */}
    <rect x="232" y="290" width="12" height="80" fill="#6b4a33" />
    <circle cx="238" cy="270" r="40" fill="#4f9a5a" /><circle cx="214" cy="292" r="26" fill="#468c50" /><circle cx="262" cy="292" r="26" fill="#468c50" />
    {/* ground */}
    <rect y="370" width="800" height="22" fill="#a7adb5" />
    <rect y="392" width="800" height="58" fill="#5b616b" />
    {Array.from({ length: 7 }, (_, i) => <rect key={i} x={20 + i * 120} y="418" width="60" height="6" fill="#e6e8eb" />)}
    {/* street sign */}
    <rect x="136" y="250" width="6" height="140" fill="#6c737d" />
    <rect x="70" y="240" width="140" height="35" rx="5" fill="#2e7d46" stroke="#e8f5ec" strokeWidth="3" />
    <rect x="86" y="253" width="66" height="9" rx="4" fill="#e8f5ec" /><rect x="160" y="253" width="34" height="9" rx="4" fill="#e8f5ec" />
    {/* person with a name tag */}
    {person ? (
      <g>
        <rect x="338" y="318" width="34" height="56" rx="12" fill="#3f6fb5" />
        <circle cx="355" cy="300" r="17" fill="#c8906b" />
        <path d="M338 296 q17 -22 34 0" fill="#3a2a20" />
        <rect x="342" y="332" width="28" height="12" rx="3" fill="#fff" />
        <text x="356" y="342" textAnchor="middle" fontFamily={MONO} fontSize="9" fontWeight="800" fill="#111">LUCAS</text>
      </g>
    ) : null}
    {(Object.keys(masks) as StreetBox[]).map((k) => {
      const p = masks[k] ?? 0; if (p <= 0) return null;
      const [x0, y0, x1, y1] = STREET_BOX[k]; const s = 1.3 - 0.3 * Math.min(1, p);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, bw = (x1 - x0 + 6) * s, bh = (y1 - y0 + 6) * s;
      return <rect key={`m${k}`} x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} fill="#141414" opacity={Math.min(1, p * 1.5)} />;
    })}
    {(Object.keys(boxes) as StreetBox[]).map((k) => {
      const p = boxes[k] ?? 0; if (p <= 0) return null;
      const [x0, y0, x1, y1] = STREET_BOX[k];
      return (
        <g key={`b${k}`} opacity={Math.min(1, p * 1.4)}>
          <rect x={x0 - 4} y={y0 - 4} width={x1 - x0 + 8} height={y1 - y0 + 8} rx="6" fill="none" stroke={C.amber} strokeWidth="4" strokeDasharray="10 6"
            transform={`translate(${(x0 + x1) / 2} ${(y0 + y1) / 2}) scale(${1.08 - 0.08 * Math.min(1, p)}) translate(${-(x0 + x1) / 2} ${-(y0 + y1) / 2})`} />
          <rect x={x0 - 4} y={y0 - 30} width={STREET_LABEL[k].length * 9.6 + 14} height="22" rx="4" fill={C.amber} />
          <text x={x0 + 3} y={y0 - 14} fontFamily={MONO} fontSize="14" fontWeight="800" fill="#111">{STREET_LABEL[k]}</text>
        </g>
      );
    })}
  </svg>
);

// ---------------------------------------------------------------- the cast
/** The cloud AI: a blue cloud with one big eye (blinks at `blinkAt` seconds; `look` -1..1 moves the iris). */
export const EyeCloud = ({ w = 300, blinkAt = -1, look = 0, question = false }: { w?: number; blinkAt?: number; look?: number; question?: boolean }) => {
  const t = useSec();
  const blink = blinkAt >= 0 && t > blinkAt && t < blinkAt + 0.25 ? 0.12 : 1;
  return (
    <svg width={w} height={w * 0.66} viewBox="0 0 200 132">
      <path d="M48 118 a42 42 0 0 1 -4 -84 a54 54 0 0 1 102 -6 a44 44 0 0 1 10 90 Z" fill="#12233d" stroke={C.cloud} strokeWidth="5" />
      <g transform={`translate(100 74) scale(1 ${blink}) translate(-100 -74)`}>
        <path d="M58 74 Q100 40 142 74 Q100 108 58 74 Z" fill="#eef4ff" />
        {question
          ? <text x="100" y="86" textAnchor="middle" fontSize="34" fontWeight="900" fill="#7a8494">?</text>
          : <><circle cx={100 + look * 14} cy="74" r="15" fill={C.cloud} /><circle cx={100 + look * 14} cy="74" r="7" fill="#0b1830" /><circle cx={104 + look * 14} cy="70" r="3" fill="#fff" /></>}
      </g>
    </svg>
  );
};

/** The checkpoint: a teal glass wall with a shield-shaped door. `flash` 0..1 turns the shield red. */
export const Wall = ({ h = 620, flash = 0, label }: { h?: number; flash?: number; label?: string }) => (
  <div style={{ position: 'relative', width: 70, height: h }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: 18, background: `linear-gradient(180deg, ${C.teal}33, ${C.teal}12)`, border: `2px solid ${C.teal}88` }} />
    <svg width="90" height="104" viewBox="0 0 90 104" style={{ position: 'absolute', left: -10, top: h / 2 - 52 }}>
      <path d="M45 4 L84 18 V50 C84 76 66 92 45 100 C24 92 6 76 6 50 V18 Z" fill={flash > 0.01 ? `rgba(248,113,113,${0.25 + 0.6 * flash})` : '#0f2b2a'} stroke={flash > 0.01 ? C.red : C.teal} strokeWidth="5" />
      <path d="M28 52 l12 12 l22 -24" stroke={flash > 0.01 ? C.red : C.teal} strokeWidth="7" fill="none" strokeLinecap="round" />
    </svg>
    {label ? <div style={{ position: 'absolute', top: h + 12, left: -110, width: 290, textAlign: 'center', fontFamily: MONO, fontSize: 20, color: C.teal, fontWeight: 700 }}>{label}</div> : null}
  </div>
);

export const Icon = ({ kind, size = 34, color = C.fg }: { kind: 'home' | 'work' | 'child' | 'car' | 'pin' | 'gear' | 'globe' | 'laptop'; size?: number; color?: string }) => {
  const p: Record<string, ReactNode> = {
    home: <path d="M4 15 L16 5 L28 15 V28 H4 Z M12 28 V19 H20 V28" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />,
    work: <g fill="none" stroke={color} strokeWidth="3"><rect x="4" y="10" width="24" height="17" rx="3" /><path d="M11 10 V6 H21 V10 M4 17 H28" /></g>,
    child: <g fill="none" stroke={color} strokeWidth="3"><circle cx="16" cy="9" r="5" /><path d="M7 29 C7 19 25 19 25 29" /></g>,
    car: <g fill="none" stroke={color} strokeWidth="3"><path d="M4 21 L7 12 H25 L28 21 V26 H4 Z" /><circle cx="10" cy="26" r="3" fill={color} /><circle cx="22" cy="26" r="3" fill={color} /></g>,
    pin: <g fill="none" stroke={color} strokeWidth="3"><path d="M16 29 C8 20 6 15 6 12 a10 10 0 0 1 20 0 c0 3 -2 8 -10 17 Z" /><circle cx="16" cy="12" r="3.5" /></g>,
    gear: <g fill="none" stroke={color} strokeWidth="3"><circle cx="16" cy="16" r="5" /><path d="M16 3 V8 M16 24 V29 M3 16 H8 M24 16 H29 M7 7 L10.5 10.5 M21.5 21.5 L25 25 M25 7 L21.5 10.5 M10.5 21.5 L7 25" /></g>,
    globe: <g fill="none" stroke={color} strokeWidth="3"><circle cx="16" cy="16" r="12" /><path d="M4 16 H28 M16 4 C9 12 9 20 16 28 C23 20 23 12 16 4" /></g>,
    laptop: <g fill="none" stroke={color} strokeWidth="3"><rect x="6" y="6" width="20" height="14" rx="2" /><path d="M2 25 H30" /></g>,
  };
  return <svg width={size} height={size} viewBox="0 0 32 32">{p[kind]}</svg>;
};

/** The 4-step strip; `active` lights steps up to it (0 = none). `small` is the corner chip version. */
export const STEPS = [
  { n: 1, label: 'Clean', where: 'your device', color: C.device },
  { n: 2, label: 'Guess', where: 'cloud AI', color: C.cloud },
  { n: 3, label: 'Check', where: 'your device', color: C.device },
  { n: 4, label: 'Fix + try again', where: 'your device + cloud', color: C.green },
];
export const StepStrip = ({ active, small = false, current }: { active: number; small?: boolean; current?: number }) => (
  <div style={{ display: 'flex', gap: small ? 8 : 18 }}>
    {STEPS.map((s) => {
      const on = s.n <= active; const cur = (current ?? active) === s.n;
      return (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: small ? 8 : 14, padding: small ? '6px 12px' : '14px 22px', borderRadius: 14,
          background: cur ? `${s.color}2e` : 'rgba(255,255,255,0.04)', border: `2px solid ${on ? s.color : C.line}`, opacity: on ? 1 : 0.45,
          transform: cur && !small ? 'scale(1.05)' : 'none' }}>
          <div style={{ width: small ? 26 : 44, height: small ? 26 : 44, borderRadius: 99, background: on ? s.color : 'transparent', border: `2px solid ${s.color}`,
            color: '#0b0c10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: small ? 16 : 24 }}>{s.n}</div>
          <div>
            <div style={{ fontSize: small ? 18 : 30, fontWeight: 800 }}>{s.label}</div>
            {small ? null : <div style={{ fontSize: 20, color: C.muted }}>{s.where}</div>}
          </div>
        </div>
      );
    })}
  </div>
);

/** The logo: an almond eye drawn on, a phone-shaped pupil, one blink at `blinkAt`. */
export const EyeLogo = ({ size = 220, from = 0, blinkAt = -1 }: { size?: number; from?: number; blinkAt?: number }) => {
  const draw = useLin(from, from + 0.9);
  const t = useSec();
  const blink = blinkAt >= 0 && t > blinkAt && t < blinkAt + 0.22 ? 0.1 : 1;
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 200 120">
      <g transform={`translate(100 60) scale(1 ${blink}) translate(-100 -60)`}>
        <path d="M8 60 Q100 -14 192 60 Q100 134 8 60 Z" fill="none" stroke={C.teal} strokeWidth="8" strokeDasharray="520" strokeDashoffset={520 * (1 - draw)} strokeLinejoin="round" />
        <rect x="86" y="36" width="28" height="48" rx="8" fill={C.teal} opacity={draw} />
        <rect x="95" y="41" width="10" height="3" rx="1.5" fill="#0b0c10" opacity={draw} />
      </g>
    </svg>
  );
};

/** A rounded label chip. */
export const Chip = ({ children, color = C.fg, bg = 'rgba(255,255,255,0.06)', size = 26, style }: { children: ReactNode; color?: string; bg?: string; size?: number; style?: CSSProperties }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderRadius: 999, border: `2px solid ${color}`, color, background: bg,
    fontSize: size, fontWeight: 800, whiteSpace: 'nowrap', ...style }}>{children}</div>
);

/**
 * D-186 (Lunchbox re-cut): the opening photo. The drawn street (no real place) with a child in front: the face is
 * covered by a sticker (`sticker` 0..1 drops it on), but the lunchbox label (a made-up name) and the street sign
 * (a made-up street) stay readable. `boxes` frame what the stranger's AI reads; `masks` are the app's solid fills.
 */
export const KidStreet = ({ w, sticker = 1, boxes = {}, masks = {}, style }: {
  w: number; sticker?: number; boxes?: Partial<Record<'name' | 'sign', number>>; masks?: Partial<Record<'name' | 'sign', number>>; style?: CSSProperties;
}) => {
  const BOX = { name: [458, 352, 548, 382], sign: [70, 240, 210, 275] } as const;
  const s = Math.min(1, Math.max(0, sticker));
  return (
    <div style={{ position: 'relative', width: w, height: (w * 9) / 16, ...style }}>
      <Street w={w} />
      <svg width={w} height={(w * 9) / 16} viewBox="0 0 800 450" style={{ position: 'absolute', left: 0, top: 0 }}>
        {/* the street sign, readable */}
        <rect x="72" y="242" width="136" height="31" rx="4" fill="#2e7d46" />
        <text x="140" y="263" textAnchor="middle" fontFamily={MONO} fontSize="15" fontWeight="800" fill="#e8f5ec">ELM HOLLOW RD</text>
        {/* the child: school uniform, backpack straps, a lunchbox with a name label */}
        <rect x="388" y="300" width="76" height="98" rx="22" fill="#2f5ea8" />
        <rect x="398" y="300" width="10" height="70" fill="#1f3f73" /><rect x="444" y="300" width="10" height="70" fill="#1f3f73" />
        <rect x="392" y="396" width="26" height="40" rx="8" fill="#28324a" /><rect x="434" y="396" width="26" height="40" rx="8" fill="#28324a" />
        <circle cx="426" cy="270" r="34" fill="#c8906b" />
        <path d="M392 262 q34 -44 68 0" fill="#3a2a20" />
        <rect x="462" y="318" width="10" height="44" rx="5" fill="#c8906b" />
        <rect x="452" y="346" width="102" height="62" rx="12" fill="#e2483d" />
        <rect x="474" y="338" width="56" height="12" rx="6" fill="none" stroke="#b8322a" strokeWidth="5" />
        <rect x="460" y="354" width="86" height="26" rx="5" fill="#fffdf6" />
        <text x="503" y="373" textAnchor="middle" fontFamily={MONO} fontSize="17" fontWeight="900" fill="#111">LUCAS</text>
        {/* the parent's sticker over the face */}
        {s > 0 ? (
          <g transform={`translate(426 270) scale(${1.6 - 0.6 * s}) rotate(${(1 - s) * -30})`} opacity={Math.min(1, s * 1.4)}>
            <circle r="40" fill="#ffd34d" stroke="#e0a800" strokeWidth="4" />
            <circle cx="-13" cy="-8" r="5" fill="#3a2a20" /><circle cx="13" cy="-8" r="5" fill="#3a2a20" />
            <path d="M-17 10 q17 16 34 0" stroke="#3a2a20" strokeWidth="5" fill="none" strokeLinecap="round" />
          </g>
        ) : null}
        {(['name', 'sign'] as const).map((k) => {
          const p = masks[k] ?? 0; if (p <= 0) return null;
          const [x0, y0, x1, y1] = BOX[k];
          return <rect key={`m${k}`} x={x0 - 4} y={y0 - 4} width={x1 - x0 + 8} height={y1 - y0 + 8} fill="#141414" opacity={Math.min(1, p * 1.5)} />;
        })}
        {(['name', 'sign'] as const).map((k) => {
          const p = boxes[k] ?? 0; if (p <= 0) return null;
          const [x0, y0, x1, y1] = BOX[k];
          return <rect key={`b${k}`} x={x0 - 7} y={y0 - 7} width={x1 - x0 + 14} height={y1 - y0 + 14} rx="6" fill="none" stroke={C.amber} strokeWidth="4" strokeDasharray="10 6" opacity={Math.min(1, p * 1.4)} />;
        })}
      </svg>
    </div>
  );
};
