// Contrast of the design tokens (docs/DESIGN.md §2, WCAG 2.x relative luminance). Parses web/src/index.css, resolves
// the dark theme (:root) and the light theme (:root overridden by the prefers-color-scheme: light block), and asserts
// every pair in the §2 table: text ≥ 4.5:1; meaningful borders (line-strong, the Wall/boundary), route fills and the
// focus ring ≥ 3:1. A token change that breaks a pair fails `npm run check`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

/** The body of the block that opens at `open` (the index of its `{`), braces balanced. */
function blockAt(css: string, open: number): string {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('tokens.test: unbalanced braces in index.css');
}

/** `--se-*` declarations whose value is a plain hex colour (shadows and rgb() overlays are not contrast pairs). */
function hexTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const noComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of noComments.matchAll(/--se-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function themes(): { dark: Record<string, string>; light: Record<string, string> } {
  const rootAt = CSS.search(/^:root\s*\{/m);
  if (rootAt < 0) throw new Error('tokens.test: no top-level :root block');
  const dark = hexTokens(blockAt(CSS, CSS.indexOf('{', rootAt)));
  const mediaAt = CSS.search(/@media\s*\(prefers-color-scheme:\s*light\)\s*\{/);
  if (mediaAt < 0) throw new Error('tokens.test: no light-theme block');
  const media = blockAt(CSS, CSS.indexOf('{', mediaAt));
  const innerAt = media.search(/:root\s*\{/);
  const light = { ...dark, ...hexTokens(blockAt(media, media.indexOf('{', innerAt))) };
  return { dark, light };
}

// WCAG 2.x constants, written as integer ratios (scripts/check-images flags long decimals as coordinate-like).
const LINEAR_KNEE = 3928 / 1e5;
const [KR, KG, KB] = [2126 / 1e4, 7152 / 1e4, 722 / 1e4];
const channel = (c: number) => {
  const s = c / 255;
  return s <= LINEAR_KNEE ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return KR * channel((n >> 16) & 255) + KG * channel((n >> 8) & 255) + KB * channel(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = 4.5;
const NON_TEXT = 3;
type Pair = readonly [fg: string, bg: string, min: number];

const VERDICTS = ['red', 'amber', 'grey', 'green', 'teal'] as const;
const ROUTES = ['device', 'cloud', 'rules', 'blocked'] as const;

/** Every pair of the DESIGN.md §2 table, plus the existing SPEC §8.3 claims (verdict on tint, route on its badge). */
const PAIRS: readonly Pair[] = [
  // fg and muted on every surface
  ...['canvas', 'surface', 'surface-2', 'surface-3'].flatMap((bg): Pair[] => [
    ['fg', bg, TEXT],
    ['muted', bg, TEXT],
  ]),
  // meaningful borders and the Wall
  ...['canvas', 'surface', 'surface-2', 'lane-device-bg', 'lane-cloud-bg'].flatMap((bg): Pair[] => [
    ['line-strong', bg, NON_TEXT],
    ['boundary', bg, NON_TEXT],
  ]),
  ['gate-open', 'canvas', NON_TEXT],
  ['gate-open', 'surface', NON_TEXT],
  // lanes
  ['route-device', 'lane-device-bg', TEXT],
  ['route-cloud', 'lane-cloud-bg', TEXT],
  ['fg', 'lane-device-bg', TEXT],
  ['muted', 'lane-device-bg', TEXT],
  ['fg', 'lane-cloud-bg', TEXT],
  ['muted', 'lane-cloud-bg', TEXT],
  ['route-device-fill', 'canvas', NON_TEXT],
  ['route-cloud-fill', 'canvas', NON_TEXT],
  ['route-device-fill', 'surface', NON_TEXT],
  ['route-cloud-fill', 'surface', NON_TEXT],
  // verdict colours on their own tint and hero; fg on every hero
  ...VERDICTS.flatMap((v): Pair[] => [
    [`verdict-${v}`, `verdict-${v}-bg`, TEXT],
    [`verdict-${v}`, `verdict-${v}-hero`, TEXT],
    ['fg', `verdict-${v}-hero`, TEXT],
  ]),
  ['muted', 'verdict-red-hero', TEXT],
  ['muted', 'verdict-green-hero', TEXT],
  // teal: protected / never sent
  ['verdict-teal', 'canvas', TEXT],
  ['verdict-teal', 'surface', TEXT],
  ['verdict-teal', 'surface-2', TEXT],
  // route badges on their own fill; the outline badges on canvas and surface
  ...ROUTES.map((r): Pair => [`route-${r}`, `route-${r}-bg`, TEXT]),
  ...['canvas', 'surface'].flatMap((bg): Pair[] => [
    ['route-queued', bg, TEXT],
    ['route-cached', bg, TEXT],
    ['route-queued-line', bg, NON_TEXT],
    ['route-cached-line', bg, NON_TEXT],
  ]),
  // buttons and danger
  ['accent-fg', 'accent', TEXT],
  ['danger-fg', 'danger', TEXT],
  ['danger-line', 'surface', TEXT],
  ['danger-line', 'canvas', TEXT],
  // focus ring
  ['focus', 'canvas', NON_TEXT],
  ['focus', 'surface', NON_TEXT],
];

describe('design tokens (docs/DESIGN.md §2)', () => {
  const t = themes();

  it('parses both themes, and the light block overrides what it should', () => {
    expect(t.dark.canvas).toBe('#0b0b0f');
    expect(t.light.canvas).toBe('#f6f6f8');
    expect(t.light['line-strong']).toBe('#7a7a8c'); // the fix for 2.89:1 on light surface-2
  });

  describe.each(['dark', 'light'] as const)('%s theme', (name) => {
    const tok = t[name];
    it.each(PAIRS.map(([fg, bg, min]) => [`${fg} on ${bg}`, fg, bg, min] as const))('%s', (_label, fg, bg, min) => {
      expect(tok[fg], `--se-${fg} is missing`).toMatch(/^#[0-9a-f]{6}$/);
      expect(tok[bg], `--se-${bg} is missing`).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(tok[fg], tok[bg])).toBeGreaterThanOrEqual(min);
    });

    it('draws the Wall in line-strong and masks in solid black', () => {
      expect(tok.boundary).toBe(tok['line-strong']);
      expect(tok.mask).toBe('#000000');
    });
  });

  it('computes WCAG contrast correctly', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

/** Every .ts/.tsx/.css file under web/src, tests excluded. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('no blur anywhere (CLAUDE.md invariant 6, docs/DESIGN.md §6.1)', () => {
  // D-175: the ONE exception is the DEV-only adversary harness, whose solid-vs-blur experiment blurs clue boxes to measure
  // what blur-based redaction still leaks (it is never a mask the app applies). It must carry the DEV-only marker, which
  // check-dist proves never reaches a production build.
  const BLUR_EXPERIMENT = join(SRC, 'dev', 'spikes', 'adversaryRun.ts');
  it('no backdrop-blur, blur-* utility or CSS blur() in web/src', () => {
    const hits = sources(SRC).filter((p) => p !== BLUR_EXPERIMENT && /\bbackdrop-blur\b|\bblur-[a-z0-9[]|\bblur\(/.test(readFileSync(p, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('the blur experiment stays DEV-only (D-175)', () => {
    const src = readFileSync(BLUR_EXPERIMENT, 'utf8');
    expect(src).toContain('__SE_DEV_ONLY__');
    expect((src.match(/\bblur\(/g) ?? []).length).toBe(1); // only blurCanvas's ctx.filter
  });
});
