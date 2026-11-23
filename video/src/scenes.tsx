import type { ReactNode } from 'react';
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Caption, Card, Fade, Footage, Photo, Pill, useAppear } from './components';
import { C, MONO } from './theme';

// Honesty lines under the footage (docs/VIDEO.md §0): the attacker's answers are real recordings of Nov 23, replayed
// and labelled CACHED SAMPLE; this browser has no Gemini Nano, so the private steps show RULES-ONLY.
const REPLAY = "Real app footage · the attacker's answer was recorded live on Nov 23 and is replayed (CACHED SAMPLE) · no Nano in this browser: RULES-ONLY";

const S = (n: number) => Math.round(n * 30);

// ---------------------------------------------------------------- 1 hook
export const Hook = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={S(4.6)}>
      <Photo src="judge-03.jpg" from={1.02} to={1.12} origin="55% 30%" />
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 90, background: 'linear-gradient(0deg, rgba(11,12,16,0.85) 0%, rgba(11,12,16,0) 45%)' }}>
        <Fade delay={6}><div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -1 }}>This photo has no GPS data.</div></Fade>
        <Fade delay={16}><div style={{ marginTop: 18 }}><Pill color={C.muted}>LOCATION: OFF · EXIF: NONE</Pill></div></Fade>
      </AbsoluteFill>
    </Sequence>
    <Sequence from={S(4.6)}>
      <Footage clip="castle" from={{ mark: 'verdict', plus: 0.6 }} to={{ mark: 'verdict', plus: 7.4 }} zoom={1.18} zoomTo={1.24} origin="22% 30%" />
      <Caption kicker="VERDICT" color={C.red} note={REPLAY} />
    </Sequence>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 2 the idea: who attacks what, who keeps what
const Lane = ({ color, bg, title, sub, children, delay }: { color: string; bg: string; title: string; sub: string; children: ReactNode; delay: number }) => (
  <Fade delay={delay} style={{ flex: 1 }}>
    <div style={{ background: bg, border: `2px solid ${color}55`, borderTop: `6px solid ${color}`, borderRadius: 22, padding: 36, height: 520 }}>
      <div style={{ fontFamily: MONO, color, fontSize: 28, fontWeight: 800, letterSpacing: 3 }}>{title}</div>
      <div style={{ fontSize: 30, color: C.muted, marginTop: 8 }}>{sub}</div>
      <div style={{ marginTop: 30 }}>{children}</div>
    </div>
  </Fade>
);
const Row = ({ children, delay }: { children: ReactNode; delay: number }) => (
  <Fade delay={delay} y={12}><div style={{ fontSize: 34, padding: '14px 22px', marginBottom: 14, background: 'rgba(255,255,255,0.05)', borderRadius: 14 }}>{children}</div></Fade>
);
export const Idea = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame % 90, [0, 90], [0, 1]);
  return (
    <AbsoluteFill style={{ padding: '70px 110px' }}>
      <Fade><div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>Strangers' Eyes</div></Fade>
      <Fade delay={8}><div style={{ fontSize: 38, color: C.muted, marginTop: 6 }}>See your photo the way a stalker's AI would, before you post it.</div></Fade>
      <div style={{ display: 'flex', gap: 40, marginTop: 56, alignItems: 'stretch' }}>
        <Lane color={C.cloud} bg={C.cloudBg} title="THE CLOUD · ATTACKER" sub="Gemini via Firebase AI Logic" delay={40}>
          <Row delay={70}>Gets a <b>redacted copy</b> only</Row>
          <Row delay={95}>Solid masks · no metadata · no faces</Row>
          <Row delay={120}>Guesses where it was taken</Row>
        </Lane>
        <div style={{ width: 230, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 48, fontFamily: MONO, fontSize: 24 }}>
          <Fade delay={150}><div style={{ color: C.fg, textAlign: 'center' }}>redacted copy<div style={{ fontSize: 40, transform: `translateX(${-30 + x * 30}px)` }}>◀━━━</div></div></Fade>
          <Fade delay={180}><div style={{ color: C.muted, textAlign: 'center' }}>guesses<div style={{ fontSize: 40, transform: `translateX(${x * 30 - 15}px)` }}>━━━▶</div></div></Fade>
          <Fade delay={230}><div style={{ color: C.teal, textAlign: 'center' }}>right or wrong<div style={{ fontSize: 40 }}>✕ never sent</div></div></Fade>
        </div>
        <Lane color={C.device} bg={C.deviceBg} title="YOUR DEVICE · VAULT" sub="Never uploaded, never geocoded" delay={200}>
          <Row delay={250}>🏠 Home · 🏥 Work · 🧒 Child's name</Row>
          <Row delay={290}>Compares the guesses with the vault</Row>
          <Row delay={330}>Distances by code, shown as bands</Row>
        </Lane>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 3 Judge Mode
export const Judge = () => (
  <AbsoluteFill>
    <Footage clip="judge-home" from={0} zoom={1} />
    <Caption kicker="JUDGE MODE" color={C.teal} note="Openly licensed (CC0) photos of public places · a made-up vault · nothing of yours" />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 4 on-device pre-screen
export const Prescreen = () => (
  <AbsoluteFill>
    <Footage clip="castle" from={{ mark: 'prescreen', plus: -1.5 }} to={{ mark: 'consent', plus: -0.5 }} />
    <Caption kicker="ON THIS DEVICE" color={C.device} note={REPLAY} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 5 the Egress Gate
export const Gate = () => (
  <AbsoluteFill>
    <Footage clip="gate" from={{ mark: 'mask', plus: -1 }} />
    <Caption kicker="EGRESS GATE" color={C.teal} note="Real app footage · mask un-ticked on purpose · the gate refuses on the device: nothing reaches the attacker" />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 6 the attack and the verdict
export const Attack = () => (
  <AbsoluteFill>
    <Footage clip="castle" from={{ mark: 'consent', plus: -0.5 }} to={{ mark: 'nofix', plus: -1 }} />
    <Caption kicker="CLOUD ATTACK" color={C.cloud} note={REPLAY} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 7 nothing a mask can hide
export const NoFix = () => (
  <AbsoluteFill>
    <Footage clip="castle" from={{ mark: 'nofix', plus: -0.4 }} zoom={1.12} zoomTo={1.16} origin="0% 62%" />
    <Caption kicker="NO SAFE CLAIM" color={C.red} note="Some clues can't be masked: crop it, or don't post it" />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 8 a fix that works
export const Crossing = () => (
  <AbsoluteFill>
    <Footage clip="crossing" from={{ mark: 'verdict', plus: -0.3 }} />
    <Caption kicker="FIX + RE-ATTACK" color={C.green} note={REPLAY} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 9 a fix that isn't enough
export const Station = () => (
  <AbsoluteFill>
    <Footage clip="station" from={{ mark: 'after', plus: -1.2 }} zoom={1.06} origin="0% 10%" />
    <Caption kicker="STILL EXPOSED" color={C.amber} note={REPLAY} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 10 the numbers
const Stat = ({ big, label, color, delay }: { big: string; label: string; color: string; delay: number }) => (
  <Fade delay={delay} style={{ flex: 1 }}>
    <Card style={{ height: 380, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 150, fontWeight: 800, color, letterSpacing: -4, lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 36, marginTop: 24, lineHeight: 1.25 }}>{label}</div>
    </Card>
  </Fade>
);
export const Proof = () => (
  <AbsoluteFill style={{ padding: '90px 110px' }}>
    <Fade><div style={{ fontSize: 64, fontWeight: 800 }}>A ten-photo test</div></Fade>
    <div style={{ display: 'flex', gap: 36, marginTop: 50 }}>
      <Stat big="5/10" label="placed within 5 km by the attacker" color={C.red} delay={12} />
      <Stat big="0" label="refusals" color={C.amber} delay={60} />
      <Stat big="3/4" label="re-attacked photos pushed further out by masking the clues it named" color={C.green} delay={150} />
    </div>
    <Fade delay={30}><div style={{ fontSize: 26, color: C.muted, marginTop: 40 }}>Day-1 adversary spike, re-run Nov 23: 10 openly licensed photos of public places · gemini-3.5-flash-lite · distances by code</div></Fade>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- 11 hybrid routing + iPhone
const Route = ({ what, where, color, delay }: { what: string; where: string; color: string; delay: number }) => (
  <Fade delay={delay} y={12}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '20px 26px', marginBottom: 16, background: C.card, border: `1px solid ${C.line}`, borderLeft: `6px solid ${color}`, borderRadius: 14 }}>
      <div style={{ fontSize: 32, fontWeight: 700, width: 430 }}>{what}</div>
      <div style={{ fontSize: 28, color: C.muted }}>{where}</div>
    </div>
  </Fade>
);
export const Hybrid = () => {
  const { fps } = useVideoConfig();
  const p = useAppear(fps * 7);
  return (
    <AbsoluteFill style={{ padding: '80px 110px', flexDirection: 'row', gap: 60 }}>
      <div style={{ flex: 1 }}>
        <Fade><div style={{ fontSize: 60, fontWeight: 800, marginBottom: 36 }}>Where each step runs</div></Fade>
        <Route what="Vault + original photo" where="Gemini Nano on the device · else rules · never the cloud" color={C.device} delay={10} />
        <Route what="The attacker" where="Gemini in the cloud · redacted copy only" color={C.cloud} delay={40} />
        <Route what="Plain-language explanations" where="on the device first · cloud fallback" color={C.muted} delay={70} />
        <Fade delay={100}><div style={{ fontSize: 26, color: C.muted, marginTop: 24 }}>Every call goes through one Egress Gate, and the Router HUD shows where it ran.</div></Fade>
      </div>
      <div style={{ width: 520, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
        <div style={{ borderRadius: 46, border: `10px solid #2b2f39`, overflow: 'hidden', height: 840, background: '#000' }}>
          <Img src={staticFile('img/ios-07-verdict.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        </div>
        <div style={{ fontSize: 22, color: C.muted, marginTop: 14, lineHeight: 1.3 }}>iOS Simulator · Apple Foundation Models on the device · attacker: a labelled debug stand-in (no cloud call)</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 12 close
export const Close = () => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
    <Fade><div style={{ fontSize: 40, color: C.muted }}>Stalkers already have this AI.</div></Fade>
    <Fade delay={40}><div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2, marginTop: 20 }}>Strangers' Eyes</div></Fade>
    <Fade delay={55}><div style={{ fontSize: 40, marginTop: 10 }}>See what it sees, before you post.</div></Fade>
    <Fade delay={70}><div style={{ fontFamily: MONO, fontSize: 44, color: C.teal, marginTop: 44 }}>strangers-eyes.web.app</div></Fade>
    <Fade delay={85}><div style={{ fontSize: 24, color: C.muted, marginTop: 36 }}>Firebase AI Logic · Gemini · Gemini Nano · Apple Foundation Models · #BuildHybridAI</div></Fade>
  </AbsoluteFill>
);

export const SCENES: Record<string, () => JSX.Element> = {
  hook: Hook, idea: Idea, judge: Judge, prescreen: Prescreen, gate: Gate, attack: Attack, nofix: NoFix,
  crossing: Crossing, station: Station, proof: Proof, hybrid: Hybrid, close: Close,
};
