// D-162: the StoryReel ("The Coffee Post") renders its text alternative, a Pause control, the reduced-motion strip and
// the loop cap; and none of its frames says "safe", uses a blur, or draws the attacker's guess as a place.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STRINGS, t } from '../../core/strings';
import { CAPTION, LOOPS, POSTER, SCENES, StoryReel, StoryScene, manualStep, nextStep, reelMode, type StepState, type StoryReelProps } from './StoryReel';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (p: StoryReelProps) => renderToStaticMarkup(createElement(StoryReel, p));
const frames = (still: boolean) => SCENES.map((scene) => renderToStaticMarkup(createElement(StoryScene, { scene, still })));

/** A minimal tree walk over renderToStaticMarkup output (well-formed; SVG shapes render as open + close tags). */
interface Node { tag: string; attrs: string; parent: Node | null; children: (Node | string)[] }
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
function parse(markup: string): Node {
  const root: Node = { tag: '#root', attrs: '', parent: null, children: [] };
  let cur = root;
  for (const m of markup.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) { cur.children.push(m[5]); continue; }
    if (m[1]) { cur = cur.parent ?? root; continue; }
    const n: Node = { tag: m[2], attrs: m[3], parent: cur, children: [] };
    cur.children.push(n);
    if (!m[4] && !VOID.has(m[2])) cur = n;
  }
  return root;
}
const walk = (n: Node, f: (n: Node) => void) => { f(n); for (const c of n.children) if (typeof c !== 'string') walk(c, f); };
const textOf = (n: Node): string => n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join(' ');

describe('StoryReel (hero)', () => {
  const out = html({ variant: 'hero' });

  it('is a figure named by its headline, with the permanent "Illustrated story" tag', () => {
    expect(out).toMatch(/^<figure aria-labelledby="[^"]+" data-reel="hero"/);
    expect(out).toContain(`>${esc(t('ui.story.title'))}</h2>`);
    expect(out).toContain(esc(t('ui.story.tag')));
    expect(out).not.toMatch(/<h1[\s>]/);
  });

  it('carries all six captions as a visually hidden ordered list (the stage itself is aria-hidden)', () => {
    const list = out.match(/<ol aria-label="[^"]*" class="sr-only">([\s\S]*?)<\/ol>/);
    expect(list).not.toBeNull();
    const items = [...list![1].matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
    expect(items).toHaveLength(6);
    for (const n of SCENES) expect(items[n - 1]).toContain(esc(t(CAPTION[n])));
    expect(out).toMatch(/<div aria-hidden="true" class="h-\[/);
  });

  it('has a visible Pause control (WCAG 2.2.2): a real button with a text label, at least 44 px', () => {
    const btn = out.match(/<button type="button"[^>]*>/);
    expect(btn).not.toBeNull();
    expect(btn![0]).toContain(`aria-label="${t('ui.story.pause')}"`);
    expect(btn![0]).toContain('size-11');
  });

  it('reserves the caption height in line units (it scales with text zoom), three lines on phones', () => {
    expect(out).toMatch(/<p aria-hidden="true" class="[^"]*min-h-\[3lh\][^"]*sm:min-h-\[2lh\]/);
  });

  it('starts on scene 1 and plays (not paused)', () => {
    expect(out).toContain('data-scene="1"');
    expect(out).toContain('data-paused="false"');
  });
});

describe('StoryReel (strip and reduced motion)', () => {
  it('the strip (About) is six static frames with numbered, visible captions and no controls; two columns only from 48 rem', () => {
    const out = html({ variant: 'strip' });
    expect(out).toContain('data-reel="strip"');
    expect(out.match(/data-scene="\d"/g)).toHaveLength(6);
    for (const n of SCENES) expect(out).toContain(esc(t(CAPTION[n])));
    expect(out).not.toContain('<button');
    expect(out).not.toMatch(/animate-/); // still frames: every element at its end state
    expect(out).toContain('@3xl:grid-cols-2');
    expect(out).not.toMatch(/@lg:grid-cols-2/);
  });

  it('reduced motion keeps the player (same height, so Welcome/Home do not grow) but manual; a pinned scene plays', () => {
    expect(reelMode('hero', true, undefined)).toBe('manual');
    expect(reelMode('compact', true, undefined)).toBe('manual');
    expect(reelMode('hero', false, undefined)).toBe('auto');
    expect(reelMode('hero', true, 3)).toBe('auto');
    expect(reelMode('strip', false, undefined)).toBe('strip');
    expect(reelMode('strip', true, undefined)).toBe('strip');
  });

  it('Prev/Next wrap around all six scenes, starting from scene 1 (the danger first)', () => {
    expect(manualStep(1, 1)).toBe(2);
    expect(manualStep(6, 1)).toBe(1);
    expect(manualStep(1, -1)).toBe(6);
    const seen: number[] = [];
    let s = 1 as Parameters<typeof manualStep>[0];
    for (let i = 0; i < 6; i++) { seen.push(s); s = manualStep(s, 1); }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a pinned scene renders that scene with the stepper off', () => {
    const out = html({ variant: 'hero', scene: 3 });
    expect(out).toContain('data-scene="3"');
    expect(out).toContain(esc(t('ui.story.code')));
  });
});

describe('the stepper', () => {
  it(`runs 1 → 6, loops ${LOOPS} times, then holds the poster frame`, () => {
    let s: StepState = { scene: 1, loop: 0, held: false };
    const seen: string[] = [];
    for (let i = 0; i < 6 * LOOPS; i++) {
      seen.push(`${s.loop}:${s.scene}`);
      s = nextStep(s);
    }
    expect(seen).toHaveLength(18);
    expect(seen.slice(0, 7)).toEqual(['0:1', '0:2', '0:3', '0:4', '0:5', '0:6', '1:1']);
    expect(s).toEqual({ scene: POSTER, loop: LOOPS - 1, held: true });
    expect(nextStep(s)).toBe(s);
  });

  it('holds the end card, not the best-case green frame', () => {
    expect(POSTER).toBe(6);
    expect(renderToStaticMarkup(createElement(StoryScene, { scene: POSTER, still: true }))).not.toMatch(/verdict-green/);
  });
});

describe('honesty and the hard rules, in every frame', () => {
  const all = [...frames(true), ...frames(false), html({ variant: 'hero' }), html({ variant: 'strip' })].join('\n');
  const text = all.replace(/<[^>]+>/g, ' ');

  it('never says "safe" (AC-304), and its strings pass the same check', () => {
    expect(text).not.toMatch(/\bsafe\b/i);
    const storyStrings = Object.entries(STRINGS).filter(([id]) => id.startsWith('ui.story.'));
    expect(storyStrings.length).toBeGreaterThan(20);
    for (const [, s] of storyStrings) expect(s).not.toMatch(/\bsafe\b/i);
  });

  it('uses no blur and no translucent mask: masks are solid #000 and never fade', () => {
    expect(all).not.toMatch(/blur/i);
    const masks = [...all.matchAll(/<rect [^>]*fill="#000"[^>]*>/g)].map((m) => m[0]);
    expect(masks.length).toBeGreaterThan(0);
    for (const m of masks) {
      expect(m).not.toMatch(/opacity/);
      expect(m).not.toMatch(/animate-(?!mask-in)/);
    }
  });

  it('nothing holding a mask fades: no opacity animation on any ancestor of a mask (DESIGN §6.1)', () => {
    const FADES = /\banimate-(rise|pop|chip-in|cross|sheet-in|scan|pulse-ring)\b/;
    let checked = 0;
    for (const f of [...frames(false), html({ variant: 'hero' })]) {
      walk(parse(f), (n) => {
        const isMask = (n.tag === 'rect' && /fill="#000"/.test(n.attrs)) || /class="[^"]*\bbg-mask\b/.test(n.attrs);
        if (!isMask) return;
        checked++;
        for (let p = n.parent; p; p = p.parent) expect(p.attrs).not.toMatch(FADES);
      });
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('shows confidence wherever a level shows, and green only as "Risk reduced"', () => {
    for (const n of [3, 5] as const) {
      const f = renderToStaticMarkup(createElement(StoryScene, { scene: n, still: true }));
      expect(f).toContain(esc(t('ui.verdict.conf', { confidence: 'medium' })));
    }
    const greens = [...all.matchAll(/<[^>]*verdict-green[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(greens.length).toBeGreaterThan(0);
    for (const g of greens) expect(g).toMatch(/^Risk reduced/);
  });

  it('never names an address or a pin for the guess', () => {
    expect(text).not.toMatch(/\baddress\b|\bpin\b/i);
  });

  it('the cloud lane states only a precision level; distance bands (the device\'s measure) appear only in the device lane', () => {
    const bands = Object.entries(STRINGS).filter(([id]) => id.startsWith('ui.band.')).map(([, v]) => esc(v));
    let cloud = '';
    let device = '';
    for (const f of [...frames(true), ...frames(false)]) {
      walk(parse(f), (n) => {
        if (/data-lane="cloud"/.test(n.attrs)) cloud += ` ${textOf(n)}`;
        if (/data-lane="device"/.test(n.attrs)) device += ` ${textOf(n)}`;
      });
    }
    for (const b of bands) expect(cloud).not.toContain(b);
    expect(cloud).toContain(esc(t('ui.story.claim', { band: t('ui.compare.guessLevel', { level: 'street' }) })));
    expect(cloud).toContain(esc(t('ui.story.claim', { band: t('ui.compare.guessLevel', { level: 'country' }) })));
    expect(device).toContain(esc(t('ui.band.neighbourhood')));
    expect(device).toContain(esc(t('ui.band.country')));
  });
});
