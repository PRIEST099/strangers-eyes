// Strangers' Eyes demo video, plain-language cut (D-164; script from the writing panel: a first-time viewer and a
// hackathon judge scored three drafts). Explainer scenes are drawn (art.tsx); proof scenes are real app footage with
// plain callouts. Honesty: the attacker's answers in the footage are the Nov 23 live recordings, replayed (CACHED
// SAMPLE); D-174: recorded in Chrome with Gemini Nano, so private steps show ON-DEVICE (top-right tag on every footage scene).
import type { ReactNode } from 'react';
import { AbsoluteFill, Freeze, Img, interpolate, OffthreadVideo, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import clips from '../public/clips.json';
import timings from '../public/timings.json';
import { Callout, Phone, PhotoCard, RingMap, type Box } from './anim';
import { HeroLoopArt } from './heroloop';
import { Chip, EyeCloud, EyeLogo, Icon, KidStreet, StepStrip, Street, useAt, useLin, useSec, Wall } from './art';
import { C, MONO } from './theme';

const S = (sec: number) => Math.round(sec * 30);
const IDX = clips as unknown as { durations: Record<string, number>; marks: Record<string, Record<string, number>> };
const mark = (clip: string, m: string, plus = 0) => (IDX.marks[clip]?.[m] ?? 0) + plus;
/** A scene's on-screen length in seconds (Root's sceneFrames: narration + 0.6 s, whole frames), so footage fills it. */
const sceneSec = (id: string) => Math.ceil(((timings as Record<string, number>)[id] + 0.6) * 30) / 30;

// ---------------------------------------------------------------- footage helpers
/** Full-frame real footage from..to (clip seconds), fitted to `sec` seconds on screen; optional push-in. */
const Full = ({ clip, from, to, sec, z0 = 1, z1 = z0, origin = '50% 50%' }: { clip: string; from: number; to?: number; sec: number; z0?: number; z1?: number; origin?: string }) => {
  const frame = useCurrentFrame();
  const end = Math.min(to ?? IDX.durations[clip], IDX.durations[clip]);
  const rate = Math.min(4, Math.max(0.6, (end - from) / sec));
  const z = interpolate(frame, [0, S(sec)], [z0, z1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#000' }}>
      <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} muted playbackRate={rate} startFrom={Math.round(from * 30)}
        style={{ width: '100%', height: '100%', transform: `scale(${z})`, transformOrigin: origin }} />
      {rate >= 1.25 ? <div style={{ position: 'absolute', right: 24, top: 74, fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.fg, background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: '3px 10px' }}>×{rate.toFixed(1)}</div> : null}
    </AbsoluteFill>
  );
};
/** The honesty tag on every footage scene. */
const RealTag = ({ text = "REAL APP · on-device AI steps: Gemini Nano in this browser · attacker answers recorded Nov 23, replayed (CACHED SAMPLE)" }: { text?: string }) => (
  <div style={{ position: 'absolute', right: 24, top: 18, maxWidth: 1100, background: 'rgba(10,11,15,0.88)', border: `1px solid ${C.line}`, borderRadius: 10,
    padding: '8px 14px', fontFamily: MONO, fontSize: 18, color: C.muted }}>{text}</div>
);
/** The 4-step chip, top-left of footage scenes. */
const StepCorner = ({ active, current }: { active: number; current?: number }) => (
  <div style={{ position: 'absolute', left: 24, top: 18, background: 'rgba(10,11,15,0.88)', borderRadius: 16, padding: 8 }}><StepStrip active={active} current={current} small /></div>
);
const Stamp = ({ text, color, at, x, y, rot = -6 }: { text: string; color: string; at: number; x: number; y: number; rot?: number }) => {
  const p = useAt(at, 9);
  return <div style={{ position: 'absolute', left: x, top: y, transform: `rotate(${rot}deg) scale(${1.6 - 0.6 * p})`, opacity: Math.min(1, p * 1.3),
    border: `5px solid ${color}`, color, background: 'rgba(10,11,15,0.9)', borderRadius: 14, padding: '12px 26px', fontSize: 44, fontWeight: 900, letterSpacing: 1 }}>{text}</div>;
};
const Title = ({ children, at = 0, size = 64, y = 60 }: { children: ReactNode; at?: number; size?: number; y?: number }) => {
  const p = useAt(at);
  return <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontSize: size, fontWeight: 800, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>{children}</div>;
};

// ---------------------------------------------------------------- 1 post
/** D-170: a Figma-generated illustration as a full-bleed, dimmed backdrop with a slow push-in. */
const Backdrop = ({ src, opacity, dim = 0.55, z0 = 1.04, z1 = 1.12 }: { src: string; opacity: number; dim?: number; z0?: number; z1?: number }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(frame, [0, durationInFrames], [z0, z1]);
  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>
      <Img src={staticFile(`img/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(11,11,15,${dim}) 0%, rgba(11,11,15,${Math.min(0.95, dim + 0.3)}) 75%)` }} />
    </AbsoluteFill>
  );
};

// D-186 (Lunchbox re-cut): cue seconds from the narration's pauses (ffmpeg silencedetect on public/audio/post.wav).
const POST_CUE = { shot: 0.9, sticker: 3.2, post: 4.3, ask: 5.4 };
export const Post = () => {
  const t = useSec();
  const rise = useAt(0, 13);
  const flash = t > POST_CUE.shot && t < POST_CUE.shot + 0.12 ? 1 : 0;
  const sticker = useAt(POST_CUE.sticker, 11);
  const sheet = useAt(POST_CUE.sticker - 0.4, 15) - useAt(POST_CUE.post - 0.2, 15);
  const card = useAt(POST_CUE.post, 14);
  const q = useAt(POST_CUE.ask, 10);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `translateY(${(1 - rise) * 900}px)` }}>
        <Phone x={300} y={90} scale={1.0} glow={C.device}>
          <div style={{ position: 'absolute', left: 0, top: 210 }}><KidStreet w={358} sticker={sticker} /></div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', color: C.muted, fontSize: 22 }}>{t < POST_CUE.shot + 0.1 ? 'Camera' : 'First day of school'}</div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: '#fff', opacity: flash }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260, background: '#1d212b', borderRadius: '28px 28px 0 0', transform: `translateY(${(1 - sheet) * 300}px)`, padding: 28 }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>Before you post</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30, fontSize: 28 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: sticker > 0.5 ? C.teal : '#4a4f5c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#0b0d12', fontWeight: 900 }}>{sticker > 0.5 ? '✓' : ''}</span>
              Face covered
            </div>
          </div>
        </Phone>
      </div>
      <div style={{ position: 'absolute', left: 900, top: 150, width: 820, opacity: card, transform: `translate(${(1 - card) * -260}px, ${(1 - card) * 120}px) scale(${0.8 + 0.2 * card})`, transformOrigin: 'left center',
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 26, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 99, background: C.device }} />
          <div style={{ fontSize: 28, fontWeight: 800 }}>a proud parent</div>
          <div style={{ marginLeft: 'auto' }}><Chip color={C.teal} size={22}>face covered ✓</Chip></div>
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden' }}><KidStreet w={776} /></div>
        <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 28, color: C.muted }}><span style={{ color: C.red }}>♥</span> First day of school!</div>
      </div>
      <div style={{ position: 'absolute', left: 900, top: 800, fontSize: 84, fontWeight: 900, opacity: q, transform: `translateY(${(1 - q) * 30}px) rotate(${t > POST_CUE.ask + 0.4 && t < POST_CUE.ask + 1 ? Math.sin((t - POST_CUE.ask - 0.4) * 12) * 2 : 0}deg)` }}>Private, right?</div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 2 the stranger's AI reads what the sticker left
const STRANGER_CUE = { scan: 1.3, name: 4.3, sign: 6.1, leak: 7.7, title: 9.5 };
export const Stranger = () => {
  const t = useSec();
  const inP = useAt(0, 14);
  const beam = useLin(STRANGER_CUE.scan, STRANGER_CUE.scan + 1.4);
  const title = useAt(STRANGER_CUE.title, 14);
  const gone = useAt(STRANGER_CUE.title - 0.3, 16);
  const boxes = { name: useAt(STRANGER_CUE.name, 12), sign: useAt(STRANGER_CUE.sign, 12) };
  const found = [
    { at: STRANGER_CUE.name + 0.3, k: "a child's name", v: 'LUCAS', c: C.red },
    { at: STRANGER_CUE.sign + 0.3, k: 'a street', v: 'Elm Hollow Rd', c: C.red },
  ];
  const leak = useAt(STRANGER_CUE.leak, 12);
  return (
    <AbsoluteFill>
      <div style={{ opacity: 1 - gone }}>
        <div style={{ position: 'absolute', left: 110, top: 190, transform: `scale(${0.92 + 0.08 * inP})`, transformOrigin: 'top left' }}>
          <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
            <KidStreet w={1060} boxes={boxes} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${beam * 100 - 12}%`, height: '12%', background: `linear-gradient(180deg, transparent, ${C.cloud}55, transparent)`, opacity: beam > 0 && beam < 1 ? 1 : 0 }} />
          </div>
        </div>
        <div style={{ position: 'absolute', left: 1500, top: 40, opacity: inP }}>
          <EyeCloud w={300} look={Math.sin(t * 2) * 0.8} />
          <div style={{ textAlign: 'center', fontSize: 28, fontWeight: 800, color: C.cloud }}>the stranger's AI</div>
        </div>
        <div style={{ position: 'absolute', left: 1240, top: 380, width: 600 }}>
          {found.map((f) => {
            const p = useAt(f.at, 14);
            return <div key={f.k} style={{ opacity: p, transform: `translateX(${(1 - p) * 60}px)`, marginBottom: 22, borderRadius: 16, border: `2px solid ${f.c}`, background: `${f.c}22`, padding: '16px 22px' }}>
              <div style={{ fontSize: 26, color: C.muted, fontWeight: 700 }}>it read {f.k}</div>
              <div style={{ fontFamily: MONO, fontSize: 44, fontWeight: 900, color: C.fg }}>{f.v}</div>
            </div>;
          })}
          <div style={{ opacity: leak, transform: `scale(${1.15 - 0.15 * leak})`, transformOrigin: 'left center', fontSize: 44, fontWeight: 900, color: C.amber, marginTop: 12 }}>The face was never the leak.</div>
        </div>
      </div>
      <Backdrop src="art-hero.webp" opacity={title} dim={0.6} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: title }}>
        <div style={{ transform: `scale(${0.9 + 0.1 * title})`, textAlign: 'center', marginTop: -80 }}>
          <EyeLogo size={260} from={STRANGER_CUE.title} blinkAt={STRANGER_CUE.title + 2} />
          <div style={{ fontSize: 120, fontWeight: 900, letterSpacing: -3, marginTop: 10 }}>Strangers' Eyes</div>
          <div style={{ fontSize: 42, color: C.muted, marginTop: 8 }}>See what a stranger's AI sees, before you post.</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 3 how it works, in four steps
export const How = () => {
  // D-171: the app's hero loop (Figma art + overlay), cued to the narration: 1 clean (masks framed), 2 the copy crosses
  // the gate and the cloud's AI scans it, 3 the private list stays on the device, distance bands, and the "right or
  // wrong?" stops at the wall, 4 fix and attack again.
  const t = useSec();
  const step = t < 6.1 ? 1 : t < 11.6 ? 2 : t < 20.8 ? 3 : 4;
  const show = useAt(0.1, 16);
  const blocksNote = useAt(1.6, 14) - useAt(5.8, 16);
  const bubble = useLin(8.6, 10.6);
  const gets = useAt(9.2, 14) - useAt(18.0, 16);
  const vault = useAt(11.8, 14) - useAt(15.4, 16);
  const bands = useAt(15.6, 15) - useAt(18.6, 16);
  const never = useAt(19.4, 12);
  const again = useAt(21.0, 12);
  const guess = 'My guess: a city… a street…';
  return (
    <AbsoluteFill>
      <HeroLoopArt t={t} x={160} y={140} w={1600} opacity={show}
        cues={{ packets: [[6.2, 8.2], [21.0, 22.4]], brackets: [[1.6, 6.0], [20.9, 23.2]], scan: [8.0, 11.8], q: [18.4, 19.7] }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 30, display: 'flex', justifyContent: 'center' }}><StepStrip active={step} current={step} /></div>
      {/* 1: on the device */}
      <div style={{ position: 'absolute', left: 760, top: 720, opacity: blocksNote, transform: `translateY(${(1 - Math.max(0, blocksNote)) * 16}px)` }}>
        <Chip color={C.device} bg="rgba(11,11,15,0.88)" size={28}>solid blocks, never blur · hidden photo data removed</Chip>
      </div>
      {/* 2: the cloud guesses from the copy only */}
      {bubble > 0 && t < 18.4 ? <div style={{ position: 'absolute', left: 1180, top: 470, background: '#fff', color: '#111', borderRadius: 18, padding: '12px 20px', fontSize: 28, fontWeight: 800, fontFamily: MONO }}>
        {guess.slice(0, Math.round(bubble * guess.length))}</div> : null}
      <div style={{ position: 'absolute', left: 1180, top: 560, width: 640, fontSize: 26, lineHeight: 1.4, padding: '14px 20px', borderRadius: 16, background: 'rgba(11,11,15,0.88)', border: `1px solid ${C.line}`, opacity: Math.max(0, gets) }}>
        <div><span style={{ color: C.green, fontWeight: 900 }}>Gets:</span> the cleaned copy only</div>
        <div><span style={{ color: C.red, fontWeight: 900 }}>Never gets:</span> your private list or your original photo</div>
      </div>
      {/* 3: the private list and the distance bands stay on the device */}
      <div style={{ position: 'absolute', left: 200, top: 300, width: 430, opacity: Math.max(0, vault), transform: `scale(${0.92 + 0.08 * Math.max(0, vault)})` }}>
        <div style={{ borderRadius: 24, overflow: 'hidden', boxShadow: `0 0 60px ${C.device}55`, border: `2px solid ${C.device}` }}>
          <Img src={staticFile('img/art-vault.webp')} style={{ width: 430, height: 330, objectFit: 'cover', display: 'block' }} />
        </div>
        <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(11,11,15,0.9)', border: `1px solid ${C.device}`, fontSize: 24 }}>
          <div style={{ display: 'flex', gap: 18, color: C.fg, fontWeight: 700 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}><Icon kind="home" size={26} /> Home</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}><Icon kind="work" size={26} /> Work</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}><Icon kind="child" size={26} /> Child's name</span>
          </div>
          <div style={{ color: C.device, fontWeight: 800, marginTop: 6 }}>never leaves your device</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 185, top: 260, opacity: Math.max(0, bands), transform: `scale(${0.92 + 0.08 * Math.max(0, bands)})` }}>
        <RingMap w={420} h={420} from={S(15.9)} rings={[{ r: 70, label: '1 km', color: C.red }, { r: 132, label: '5 km', color: C.amber }, { r: 192, label: 'city', color: C.muted }]} />
        <div style={{ marginTop: 10, width: 420, boxSizing: 'border-box', textAlign: 'center', fontSize: 22, color: C.fg, background: 'rgba(11,11,15,0.88)', borderRadius: 12, padding: '6px 10px' }}>distance bands, worked out on the device · never a map pin</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 900, textAlign: 'center', fontSize: 42, fontWeight: 900, color: C.teal, opacity: never * (t < 21 ? 1 : 0), textShadow: '0 4px 24px rgba(0,0,0,0.9)' }}>The cloud never learns if it was right.</div>
      {again > 0.01 ? <div style={{ position: 'absolute', left: 760, top: 720, opacity: again, display: 'flex', alignItems: 'center', gap: 14, fontSize: 38, fontWeight: 900, color: C.green, background: 'rgba(11,11,15,0.88)', padding: '8px 18px', borderRadius: 14 }}>
        <span style={{ display: 'inline-block', transform: `rotate(${again * 360}deg)` }}>⟳</span> fix, then attack again</div> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 4 Judge Mode
export const Judge = () => {
  const card = useAt(1.5, 14);
  const rows = [['home', 'Home'], ['work', 'Work: City General Hospital'], ['child', 'Child: Lucas'], ['car', 'Car plate: SE 1234']] as const;
  return (
    <AbsoluteFill>
      <Full clip="judge-home" from={0} sec={sceneSec("judge")} z0={1} z1={1.05} origin="30% 40%" />
      <RealTag text="REAL APP · Judge Mode: openly licensed photos of public places, made-up data" />
      <div style={{ position: 'absolute', left: 30, top: 18 }}><Chip color={C.teal} bg="rgba(10,11,15,0.9)">REAL APP</Chip></div>
      <div style={{ position: 'absolute', right: 60, top: 200, width: 620, opacity: card, transform: `translateX(${(1 - card) * 120}px)`, background: 'rgba(21,23,29,0.96)', borderTop: `6px solid ${C.device}`, borderRadius: 22, padding: 30, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 12 }}>A made-up family</div>
        {rows.map(([k, l], i) => {
          const p = useAt(1.9 + i * 0.27, 14);
          return <div key={k} style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 30, padding: '12px 0', opacity: p, transform: `translateX(${(1 - p) * 40}px)`,
            borderBottom: k === 'child' ? `3px solid ${C.teal}` : `1px solid ${C.line}` }}><Icon kind={k} />{l}</div>;
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 5 the device covers the name
export const Prescreen = () => (
  <AbsoluteFill>
    <Full clip="castle" from={mark('castle', 'prescreen', -1.5)} to={mark('castle', 'consent', -0.8)} sec={sceneSec('prescreen')} />
    <RealTag />
    <StepCorner active={1} />
    <Sequence from={S(3.0)} durationInFrames={S(3.4)}><Callout x={1150} y={640} tx={930} ty={540} w={620} text="Child's name found → covered on your device" color={C.device} /></Sequence>
    {/* D-177: the app is set to Offline here (top bar), yet Nano's clue scan still runs: the on-device steps need no network. */}
    <Sequence from={S(6.6)}><div style={{ position: 'absolute', left: 120, top: 880 }}><Chip color={C.device} bg="rgba(10,11,15,0.92)" size={28}>App set to offline: the on-device steps still run</Chip></div></Sequence>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 6 the checkpoint stops it
export const Gate = () => (
  <AbsoluteFill>
    <Series>
      <Series.Sequence durationInFrames={S(3.9)}>
        <Full clip="gate" from={mark('gate', 'unticked', -0.38)} to={mark('gate', 'unticked', 3.47)} sec={3.9} />
        <Sequence from={S(2.6)}><Callout x={1120} y={640} tx={870} ty={530} w={560} text="Cover removed on purpose" color={C.amber} /></Sequence>
      </Series.Sequence>
      <Series.Sequence durationInFrames={S(1.4)}><Full clip="gate" from={mark('gate', 'blocked', -1.38)} to={mark('gate', 'blocked', 0.02)} sec={1.4} /></Series.Sequence>
      <Series.Sequence durationInFrames={S(5.2)}>
        <Full clip="gate" from={mark('gate', 'blocked', 2.02)} to={mark('gate', 'blocked', 7.02)} sec={5.2} z0={1} z1={1.12} origin="54% 70%" />
        <Stamp text="BLOCKED · never reached the attacker" color={C.red} at={0.8} x={300} y={880} rot={-3} />
      </Series.Sequence>
    </Series>
    <RealTag text="REAL APP · the cover was removed on purpose · the checkpoint refuses on the device" />
    <StepCorner active={2} current={2} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 7 the castle: real answer, red, nothing to fix
export const Castle = () => {
  const split = useAt(8.9, 16);
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={S(8.9)}>
        <Full clip="castle" from={mark('castle', 'consent', -0.8)} to={mark('castle', 'verdict', 2.94)} sec={8.9} z0={1} z1={1.1} origin="30% 45%" />
        <Sequence from={S(3.4)}><div style={{ position: 'absolute', left: 560, top: 110 }}><Chip color={C.cloud} bg="rgba(10,11,15,0.92)" size={30}>Real Gemini answer · recorded Nov 23 · replayed</Chip></div></Sequence>
      </Sequence>
      <Sequence from={S(8.9)} durationInFrames={S(7.3)}>
        <AbsoluteFill style={{ background: C.bg }}>
          <div style={{ position: 'absolute', left: 40, top: 120, width: 1060, height: 600, borderRadius: 18, overflow: 'hidden', transform: `scale(${1 - 0.0 * split})` }}>
            <Freeze frame={0}><div style={{ width: 1920, height: 1080, transform: 'scale(0.75)', transformOrigin: 'top left', marginLeft: -60 }}><Full clip="castle" from={mark('castle', 'verdict', 2.54)} to={mark('castle', 'verdict', 3.54)} sec={1} /></div></Freeze>
          </div>
          <div style={{ position: 'absolute', left: 1160, top: 130 }}>
            <RingMap w={680} h={460} rings={[{ r: 70, label: '1 km', color: C.red }, { r: 150, label: '5 km', color: C.amber }]} highlight={0} />
            <div style={{ display: 'flex', gap: 14, marginTop: 18 }}><Chip color={C.red}>Home: within 1 km</Chip><Chip color={C.red}>Work: within 1 km</Chip></div>
            <div style={{ fontSize: 22, color: C.muted, marginTop: 12 }}>rings around your own places · worked out on your device</div>
            <div style={{ marginTop: 22, opacity: useAt(11.0) }}><Chip color={C.muted} size={26}>Where the AI thinks you are: never shown</Chip></div>
          </div>
          <div style={{ position: 'absolute', left: 40, top: 40 }}><StepStrip active={3} current={3} small /></div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={S(16.2)}>
        <Full clip="castle" from={mark('castle', 'nofix', -0.78)} to={mark('castle', 'nofix', 4.92)} sec={5.0} z0={1.08} z1={1.14} origin="0% 62%" />
        <Stamp text="Crop it, or don't post it" color={C.red} at={0.6} x={980} y={840} rot={-4} />
      </Sequence>
      <RealTag />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 8 the level crossing: a fix that helps, not enough (D-174: Nano's guess check)
const C1: Box = [415, 230, 560, 629];
const C3: Box = [553, 373, 598, 472];
export const Crossing = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={S(2.9)}>
      <AbsoluteFill style={{ background: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <PhotoCard src="judge-02.jpg" w={1500} h={1000} boxes={[C1, C3]} scanFrom={S(0.5)} labels={['STREET SIGN', 'HOUSE NUMBER']} />
      </AbsoluteFill>
    </Sequence>
    <Sequence from={S(2.9)} durationInFrames={S(4.5)}>
      <Full clip="crossing" from={mark('crossing', 'verdictShown', -0.2)} to={mark('crossing', 'verdictShown', 4.3)} sec={4.5} z0={1.05} z1={1.12} origin="20% 25%" />
      <Sequence from={S(0.8)}><div style={{ position: 'absolute', left: 120, top: 760 }}><Chip color={C.amber} bg="rgba(10,11,15,0.92)" size={32}>Found the street · within 5 km of home and work</Chip></div></Sequence>
    </Sequence>
    <Sequence from={S(7.4)} durationInFrames={S(1.9)}>
      <Full clip="crossing" from={mark('crossing', 'fix', 0.3)} to={mark('crossing', 'applied', 0.3)} sec={1.9} />
    </Sequence>
    <Sequence from={S(9.3)} durationInFrames={S(1.5)}>
      <Freeze frame={0}><Full clip="crossing" from={mark('crossing', 'applied', 0.35)} to={mark('crossing', 'applied', 1.35)} sec={1} /></Freeze>
      <Callout x={1120} y={640} tx={500} ty={510} w={600} text="Sign + house number covered, on your device" color={C.green} />
    </Sequence>
    <Sequence from={S(10.8)}>
      <Full clip="crossing" from={mark('crossing', 'after', -0.3)} sec={7.1} />
      <Sequence from={S(0.9)}><div style={{ position: 'absolute', left: 150, top: 920 }}><Chip color={C.green} bg="rgba(10,11,15,0.92)" size={32}>Attacked again: city level only</Chip></div></Sequence>
      <Stamp text="Still exposed · your work is in that city" color={C.amber} at={4.9} x={900} y={150} rot={-3} />
    </Sequence>
    <RealTag />
    <StepCorner active={4} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 9 the station: a fix that wasn't enough
export const Station = () => {
  const card = useAt(0, 14) - useAt(1.1, 16);
  return (
    <AbsoluteFill>
      <Sequence from={S(1.2)}>
        <Full clip="station" from={mark('station', 'after', -1.2)} sec={7.3} z0={1.04} z1={1.08} origin="20% 10%" />
        <Sequence from={S(2.6)}><Callout x={1100} y={600} tx={640} ty={270} w={600} text="The building itself gave it away" color={C.amber} /></Sequence>
        <RealTag />
      </Sequence>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: C.bg, opacity: Math.max(0, card) }}>
        <div style={{ fontSize: 72, fontWeight: 900 }}>A fix that wasn't enough</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 9a the sealed answer, opened offline (D-182)
export const Sealed = () => {
  const sec = sceneSec('sealed');
  const card = useAt(0, 14) - useAt(1.3, 16);
  // sealed card (2.6 s) → network cut (≈3 s) → opened → the stamp
  const a = mark('sealed', 'sealed', -0.4), b = mark('sealed', 'off', -0.6), c = mark('sealed', 'stamp', -0.2);
  const t1 = 4.4, t2 = 7.0; // on-screen seconds where each part starts (narration pauses in sealed.wav)
  return (
    <AbsoluteFill>
      <Sequence from={S(1.3)} durationInFrames={S(t1 - 1.3)}><Full clip="sealed" from={a} to={a + 3.1} sec={t1 - 1.3} z0={1.02} z1={1.06} origin="30% 40%" /><RealTag /></Sequence>
      <Sequence from={S(t1)} durationInFrames={S(t2 - t1)}>
        <Full clip="sealed" from={b} to={mark('sealed', 'open', 0.4)} sec={t2 - t1} z0={1.04} z1={1.08} origin="30% 45%" />
        <Sequence from={S(0.5)}><Callout x={1150} y={760} tx={270} ty={672} w={620} text="Network cut: the page sees no connection" color={C.amber} /></Sequence>
        <RealTag text="REAL APP · network cut with Chrome's own offline mode · guess checked by Gemini Nano in this browser" />
      </Sequence>
      <Sequence from={S(t2)}>
        <Full clip="sealed" from={c} sec={Math.max(1, sec - t2)} z0={1.0} z1={1.06} origin="30% 25%" />
        <Sequence from={S(2.2)}><Stamp text="0 cloud calls" color={C.teal} at={0} x={1180} y={760} /></Sequence>
        <RealTag text="REAL APP · the stamp counts the Cloud Ledger while the connection was off" />
      </Sequence>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: C.bg, opacity: Math.max(0, card) }}>
        <div style={{ fontSize: 72, fontWeight: 900 }}>Prove it offline</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 9b the covered copy (D-185)
export const Export = () => {
  const sec = sceneSec('export');
  const card = useAt(0, 14) - useAt(0.8, 16);
  const a = mark('export', 'card', -0.3), b = mark('export', 'ready', -0.3);
  const t1 = 2.5;
  return (
    <AbsoluteFill>
      <Sequence from={S(0.8)} durationInFrames={S(t1 - 0.8)}><Full clip="export" from={a} to={a + 2.4} sec={t1 - 0.8} z0={1.02} z1={1.05} origin="30% 30%" /><RealTag /></Sequence>
      <Sequence from={S(t1)}>
        <Full clip="export" from={b} sec={Math.max(1, sec - t1)} z0={1.02} z1={1.08} origin="30% 30%" />
        <Sequence from={S(0.8)}><Callout x={1180} y={780} tx={420} ty={950} w={620} text="Re-checked: no hidden data, 0 faces, 0 private words" color={C.teal} /></Sequence>
        <RealTag text="REAL APP · made on this device, nothing is sent · about 10 s of checking cut" />
      </Sequence>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: C.bg, opacity: Math.max(0, card) }}>
        <div style={{ fontSize: 72, fontWeight: 900 }}>The copy to post</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 10 the held-out test (D-174; numbers from benchmark/bench/results.json)
const BENCH = { scored: 36, located5: 8, refusedRuns: 0, runs: 126, ci5: '12–38%', textN: 23, readBlur: 23, readSolid: 0, deviceCaught: 22 } as const;
/** A drawn name card (the text experiment's stimulus): plain, lightly blurred, or the app's solid fill. */
const NameCard = ({ mode, w = 360 }: { mode: 'blur' | 'solid'; w?: number }) => (
  <div style={{ width: w, height: w * 0.34, borderRadius: 10, background: mode === 'solid' ? '#000' : '#F4F2EC', border: `3px solid ${mode === 'solid' ? '#6B7280' : '#9A968C'}`, boxShadow: mode === 'solid' ? '0 0 0 6px rgba(244,242,236,0.12)' : 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {mode === 'blur' ? <span style={{ fontSize: w * 0.2, fontWeight: 900, color: '#1E2A3A', letterSpacing: 2, filter: 'blur(2.2px)' }}>MAYA</span> : null}
  </div>
);
// D-186: names first (the lunchbox test), then places, then the fix. Cues from the narration's pauses (results.wav).
const RES_CUE = { names: 0.2, blur: 3.0, solid: 7.9, grid: 8.7, count: 9.6, fix: 12.6 };
const FIXLOOP = { maskable: 10, movedMaskable: 9 } as const; // docs/fix-loop-measurement.md (3 runs)
export const Results = () => {
  const t = useSec();
  const namesIn = useAt(RES_CUE.names, 14);
  const blurRead = useAt(RES_CUE.blur, 12);
  const solid = useAt(RES_CUE.solid, 12);
  const device = useAt(RES_CUE.solid, 12);
  const grid = useAt(RES_CUE.grid, 15);
  const count = Math.min(BENCH.located5, Math.floor(interpolate(t, [RES_CUE.count, RES_CUE.count + 2.2], [0, BENCH.located5 + 0.99], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
  const fix = useAt(RES_CUE.fix, 12);
  const RED = [2, 7, 11, 16, 20, 25, 29, 33];
  // Hooks run on every frame (never inside a conditional block): one entrance per tile.
  const tileP = Array.from({ length: BENCH.scored }, (_, k) => useAt(RES_CUE.grid + 0.1 + k * 0.02, 14));
  return (
    <AbsoluteFill style={{ padding: '70px 120px' }}>
      {grid < 0.99 ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: namesIn * (1 - grid) }}>
          <Title y={70}>{`The lunchbox test: a made-up name in ${BENCH.textN} photos`}</Title>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', gap: 160, justifyContent: 'center', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
              <NameCard mode="blur" w={440} />
              <div style={{ fontSize: 32, color: C.muted }}>light blur</div>
              <div style={{ fontSize: 50, fontWeight: 900, color: C.red, opacity: blurRead }}>{`AI read it ${BENCH.readBlur} of ${BENCH.textN}`}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, opacity: Math.max(0.25, solid) }}>
              <NameCard mode="solid" w={440} />
              <div style={{ fontSize: 32, color: C.muted }}>the app's solid box</div>
              <div style={{ fontSize: 50, fontWeight: 900, color: C.green, opacity: solid }}>{`AI read it ${BENCH.readSolid} of ${BENCH.textN}`}</div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 820, textAlign: 'center', fontSize: 30, color: C.device, opacity: device }}>{`Your device's own text reader caught the name first in ${BENCH.deviceCaught} of ${BENCH.textN} · drawn names, not real children`}</div>
        </div>
      ) : null}
      {grid > 0.01 ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: grid }}>
          <Title y={40}>{`Places: ${BENCH.scored} new photos of public places`}</Title>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 128, textAlign: 'center', fontSize: 22, color: C.muted }}>uploaded Nov 13–26, so unlikely to be in the AI's training · rule written before looking · distances by code, not the AI</div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 190, display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 92px)', gap: 14 }}>
              {Array.from({ length: BENCH.scored }, (_, k) => {
                const p = tileP[k] ?? 1;
                const order = RED.indexOf(k);
                const red = order >= 0 && t > RES_CUE.count + order * 0.25;
                return <div key={k} style={{ width: 92, height: 92, borderRadius: 12, opacity: p, background: red ? `${C.red}33` : C.card, border: `3px solid ${red ? C.red : C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="48" height="48" viewBox="0 0 70 70"><circle cx="35" cy="35" r="26" fill="none" stroke={red ? C.red : '#3a3f4b'} strokeWidth="5" /><circle cx="35" cy="35" r="12" fill="none" stroke={red ? C.red : '#3a3f4b'} strokeWidth="5" /></svg>
                </div>;
              })}
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 560, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 36 }}>
            <div style={{ fontSize: 60, fontWeight: 900, color: C.red }}>{count} of {BENCH.scored} <span style={{ fontSize: 38, color: C.fg }}>placed within 5 km</span></div>
            <Chip color={C.amber} size={32}>{`${BENCH.refusedRuns} refusals in ${BENCH.runs} tries`}</Chip>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 650, textAlign: 'center', fontSize: 24, color: C.muted }}>{`95% interval ${BENCH.ci5} · mostly street scenes (looked at afterwards)`}</div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 740, display: 'flex', justifyContent: 'center', opacity: fix, transform: `scale(${1.15 - 0.15 * fix})` }}>
            <div style={{ border: `3px solid ${C.green}`, background: `${C.green}18`, borderRadius: 18, padding: '18px 34px', fontSize: 44, fontWeight: 900 }}>
              {`When a clue could be covered, the fix moved ${FIXLOOP.movedMaskable} of ${FIXLOOP.maskable} out of 5 km`}
            </div>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 11 hybrid AI
export const Hybrid = () => {
  const t = useSec();
  const split = useAt(5.4, 15);
  const noAI = useAt(12.6, 14);
  const crash = interpolate(t, [13.2, 14.0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fire = useAt(16.2, 14);
  return (
    <AbsoluteFill>
      <Title y={40}>Hybrid AI</Title>
      <div style={{ position: 'absolute', left: 1240, top: 170, textAlign: 'center', opacity: useAt(0.3) }}>
        <EyeCloud w={340} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', fontSize: 30, fontWeight: 800, color: C.cloud }}><Icon kind="globe" color={C.cloud} /> world knowledge</div>
        <div style={{ fontSize: 26, color: C.muted }}>Gemini in the cloud</div>
      </div>
      <div style={{ position: 'absolute', left: 1080, top: 200 }}><Wall h={560} flash={crash > 0.5 && crash < 1 ? 1 : 0} /></div>
      <div style={{ position: 'absolute', left: 120, top: 170, width: 880, opacity: useAt(1.4) }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: C.device }}>🔒 your secrets stay on your device</div>
        <div style={{ display: 'flex', gap: 40, marginTop: 30 }}>
          <div style={{ opacity: split, transform: `translateY(${(1 - split) * 40}px)`, textAlign: 'center' }}>
            <div style={{ width: 380, height: 250, borderRadius: 16, border: `8px solid #2b2f39`, background: '#10141c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon kind="laptop" size={120} color={C.device} /></div>
            <div style={{ marginTop: 14 }}><Chip color={C.device}>Gemini Nano in Chrome</Chip></div>
          </div>
          <div style={{ opacity: split, transform: `translateY(${(1 - split) * 40}px)`, textAlign: 'center' }}>
            <div style={{ width: 240, height: 440, borderRadius: 36, border: `8px solid #2b2f39`, overflow: 'hidden', background: '#000', margin: '0 auto' }}>
              <Img src={staticFile('img/ios-judge-10-compare.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 40%' }} />
            </div>
            <div style={{ marginTop: 14 }}><Chip color={C.device}>Apple's model on iOS</Chip></div>
            <div style={{ fontSize: 18, color: C.muted, marginTop: 8, width: 380 }}>iOS Simulator · Apple's model on the device · recorded attacker answer</div>
          </div>
        </div>
      </div>
      {noAI > 0.01 ? (
        <div style={{ position: 'absolute', left: 120, top: 820, display: 'flex', alignItems: 'center', gap: 30, opacity: noAI }}>
          <Chip color={C.muted} size={30}>No on-device AI?</Chip>
          <div style={{ position: 'relative', width: 420, height: 40 }}>
            <div style={{ position: 'absolute', left: 0, top: 18, width: 420 * Math.min(1, crash * 1.4), height: 4, background: C.red, opacity: 1 - Math.max(0, crash - 0.75) * 4 }} />
            {crash > 0.7 ? <div style={{ position: 'absolute', left: 400, top: -14, fontSize: 52, color: C.red, fontWeight: 900 }}>✕</div> : null}
          </div>
          {crash > 0.8 ? <Chip color={C.teal} size={30}><Icon kind="gear" color={C.teal} /> simple rules · never the cloud</Chip> : null}
        </div>
      ) : null}
      {fire > 0.01 ? <div style={{ position: 'absolute', left: 1180, top: 600, opacity: fire, transform: `scale(${0.9 + 0.1 * fire})`, transformOrigin: 'left center' }}>
        <Chip color={C.amber} size={40} bg="rgba(251,191,36,0.08)">Built on Firebase AI Logic</Chip></div> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 12 design
/** The architecture diagram (docs/img/architecture.png, 3200 × 2000), shown in "display units" of 2000 × 1250. A camera
 *  box {cx, cy, w} (16:9) moves in the narration's pauses: whole page → the device lane → the Egress Gate → "Right or
 *  wrong? Never sent" with the closing line. Cue times come from the clip's silences (2.3–2.7, 4.5–5.0, 7.4–7.8 s). */
const CAM = [
  // whole page framed high enough that the diagram's closing line clears the burned-in subtitle
  { t: 0, cx: 1000, cy: 680, w: 2500 },
  { t: 2.25, cx: 1000, cy: 680, w: 2500 }, { t: 2.95, cx: 685, cy: 630, w: 1671 },
  { t: 4.45, cx: 685, cy: 630, w: 1671 }, { t: 5.15, cx: 1480, cy: 410, w: 900 },
  { t: 7.35, cx: 1480, cy: 410, w: 900 }, { t: 8.05, cx: 1215, cy: 990, w: 1480 },
] as const;
const ease = (v: number) => v * v * (3 - 2 * v);
const camAt = (t: number) => {
  let i = 0;
  while (i < CAM.length - 1 && t >= CAM[i + 1].t) i++;
  const a = CAM[i], b = CAM[Math.min(i + 1, CAM.length - 1)];
  const p = b.t > a.t ? ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))) : 0;
  return { cx: a.cx + (b.cx - a.cx) * p, cy: a.cy + (b.cy - a.cy) * p, w: Math.exp(Math.log(a.w) + (Math.log(b.w) - Math.log(a.w)) * p) };
};
export const Design = () => {
  const t = useSec();
  const { cx, cy, w } = camAt(t);
  const s = 1920 / w;
  const lane = Math.min(ramp01(t, 2.9, 3.3), 1 - ramp01(t, 4.4, 4.8));
  const gate = Math.min(ramp01(t, 5.1, 5.5), 1 - ramp01(t, 7.3, 7.7));
  const never = ramp01(t, 8.0, 8.4);
  const pulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 0.9);
  return (
    <AbsoluteFill style={{ background: '#0b0b0f', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 960 - cx * s, top: 540 - cy * s, width: 2000 * s, height: 1250 * s }}>
        <Img src={staticFile('img/architecture.png')} style={{ width: '100%', height: '100%' }} />
        <svg viewBox="0 0 2000 1250" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect x="52" y="162" width="1260" height="937" rx="26" fill="none" stroke={C.device} strokeWidth="5" opacity={lane * pulse} />
          <rect x="1166" y="214" width="338" height="434" rx="26" fill="none" stroke={C.teal} strokeWidth="6" opacity={gate * pulse} />
          <circle cx="1337" cy="987" r={34 + 10 * pulse} fill="none" stroke={C.red} strokeWidth="5" opacity={never * pulse} />
        </svg>
      </div>
      <div style={{ position: 'absolute', right: 24, top: 18, background: 'rgba(10,11,15,0.88)', border: `1px solid ${C.line}`, borderRadius: 10,
        padding: '8px 14px', fontFamily: MONO, fontSize: 18, color: C.muted, opacity: useAt(0.2) * (1 - ramp01(t, 2.0, 2.4)) }}>THE ARCHITECTURE · docs/img/architecture.png in the repo</div>
    </AbsoluteFill>
  );
};
const ramp01 = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// ---------------------------------------------------------------- 13 close
export const Close = () => {
  const off = useAt(0.2, 14);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <Backdrop src="art-gate.webp" opacity={off} dim={0.7} />
      <div style={{ marginTop: -40, position: 'relative' }}>
        <EyeLogo size={200} from={0.4} blinkAt={2.6} />
        <div style={{ fontSize: 52, fontWeight: 800, color: C.muted, marginTop: 10, opacity: off }}>A covered face isn't a hidden child.</div>
        <div style={{ fontSize: 112, fontWeight: 900, letterSpacing: -3, marginTop: 8, opacity: useAt(2.2), transform: `scale(${0.92 + 0.08 * useAt(2.2)})` }}>Strangers' Eyes</div>
        <div style={{ fontSize: 40, marginTop: 4, opacity: useAt(2.6) }}>See what a stranger's AI sees, before you post.</div>
      </div>
    </AbsoluteFill>
  );
};

export const SCENES: Record<string, () => JSX.Element> = {
  post: Post, stranger: Stranger, how: How, judge: Judge, prescreen: Prescreen, gate: Gate, castle: Castle,
  crossing: Crossing, station: Station, sealed: Sealed, export: Export, results: Results, hybrid: Hybrid, design: Design, close: Close,
};
