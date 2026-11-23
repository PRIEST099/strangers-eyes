# DESIGN.md: "Two Lanes, One Wall" (final redesign spec, Nov 23)

> Presentation-only redesign of the web PWA. It wins on the demo-video beats of Concept 1 ("Two Lanes, One Wall")
> and grafts in: the Zero Tiles, `tokens.test.ts` and the light `line-strong` fix from Concept 3; the opaque mask
> animation, the no-blur rule and the cut order from Concept 2. Every judge finding is fixed (see §6.4).
> Which doc wins: CLAUDE.md invariants > PROGRESS Decisions > SPEC > this file for visuals. Log the adoption as the
> next free D-number in PROGRESS (plus the deviation in §5.3: the "Your view" toggle is deferred).

## 1. Direction and signature elements

**Thesis.** The claim is spatial: some work runs on this device and some in the cloud, and one gate between them lets
only a redacted copy through. Today that story is a 10 px badge. Now it becomes the layout: a violet **THIS DEVICE**
lane, a blue **THE CLOUD** lane and a **Wall** with one gate between them. Judges see hybrid inference happen.
Identity comes from layout, scale and one motif (the Wall), with system fonts, inline SVG and no new dependencies.

Signature elements (each one is driven by real data and never invented):
1. **HybridLanes** (`components/HybridLanes.tsx`). The two lanes and the Wall. In `live` mode each finished Ledger
   entry is a chip in the lane of its FINAL route (`laneOf(hudRoute(e))`), so a cloud fallback always lands in the
   cloud lane. In `explainer` mode it shows static ghost chips with no route badges (Home, Welcome, About).
2. **Gate crossing.** On each finished S3 `IN_CLOUD` entry with `imagesOut > 0`, a packet holding the real sent
   thumbnail (solid black masks) crosses the gate, and the gate shows "0 faces · 0 vault items". The Wall carries
   three fixed arrows: `→ Redacted copy`, `← Guesses`, and a struck-through `→ Right or wrong: never sent`. That last
   arrow is the tagline drawn as a picture.
3. **Verdict reveal + RiskMeter.** A tinted hero band holds the level, then the RiskMeter (RED | AMBER | LOW, plus a
   hatched PARTIAL cell, every segment labelled in text). With a comparison, the After marker slides from Before.
   Then a full-width green **"Risk reduced"** banner with a glow appears. It is the only green on screen.
4. **Zero Tiles** (Ledger): two big teal `0`s for faces and vault items sent. A count above 0 turns the tile red
   with an alert icon.
5. **Mask-eye brand mark**: an eye outline whose pupil is a solid black square, echoing the solid-mask rule.
6. **Judge Mode above the fold**: thumbnail sample cards collapse to a strip, and the run scrolls into view.

## 2. Tokens (`web/src/index.css`)

Replace the `:root` and light blocks with the blocks below. Every existing `--se-*` name is kept, and changed values
are marked. Add the matching `--color-*`, `--shadow-*` lines to `@theme inline`. **Never** override Tailwind's own
`--radius-sm..xl` or `--text-xs..2xl`: untouched files must not shift.

```css
:root {
  color-scheme: dark;
  --se-canvas: #0b0b0f;   --se-surface: #14141b;  --se-surface-2: #1c1c25;
  --se-surface-3: #252530;                 /* NEW raised chips, hover fills */
  --se-line: #2c2c38;                      /* decorative dividers only */
  --se-line-strong: #6b6b7e;               /* meaningful borders, ≥3:1 */
  --se-fg: #ececf1;  --se-muted: #a3a3b2;  --se-focus: #93c5fd;
  --se-accent: #ececf1;  --se-accent-fg: #0b0b0f;
  --se-danger: #b91c1c;  --se-danger-fg: #ffffff;
  --se-danger-line: #f87171;               /* NEW quiet-danger outline + text (Burn vault) */
  /* verdict + route tokens: values UNCHANGED (red #f87171/#2a1215 … cached #e4e4e7/#a1a1aa) */
  --se-verdict-red-hero: #3a1218;  --se-verdict-amber-hero: #33260a;  --se-verdict-grey-hero: #24242c;
  --se-verdict-green-hero: #0f2e1b; --se-verdict-teal-hero: #0b2b28;  /* NEW hero tints */
  --se-route-device-fill: #a78bfa; --se-route-cloud-fill: #60a5fa;    /* NEW dots, lane rules, packet */
  --se-lane-device-bg: #17112b;    --se-lane-cloud-bg: #0c1a2e;       /* NEW lane panels */
  --se-boundary: #6b6b7e;          --se-gate-open: #93c5fd;           /* NEW Wall + gate (≥3:1, not decorative) */
  --se-mask: #000000;
  --se-overlay: rgb(0 0 0 / 0.6);
  --se-shadow-1: inset 0 1px 0 rgb(255 255 255 / 0.04), 0 8px 24px rgb(0 0 0 / 0.45);
  --se-shadow-pop: 0 16px 48px rgb(0 0 0 / 0.55), 0 0 0 1px var(--se-line-strong);
  --se-glow-device: 0 0 0 1px rgb(167 139 250 / 0.35), 0 0 24px rgb(124 58 237 / 0.22);
  --se-glow-green: 0 0 0 1px rgb(74 222 128 / 0.45), 0 0 40px rgb(34 197 94 / 0.25);
  background-color: var(--se-canvas);  color: var(--se-fg);
}
@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --se-canvas: #f6f6f8;  --se-surface: #ffffff;  --se-surface-2: #ececf1;  --se-surface-3: #e2e2ea;
    --se-line: #d4d4dc;
    --se-line-strong: #7a7a8c;             /* CHANGED from #8a8a99 (was 2.89:1 on surface-2) */
    --se-fg: #15151c;  --se-muted: #52525e;  --se-focus: #1d4ed8;
    --se-accent: #15151c;  --se-accent-fg: #ffffff;  --se-danger: #b91c1c;  --se-danger-fg: #ffffff;
    --se-danger-line: #b91c1c;
    /* verdict + route light values UNCHANGED */
    --se-verdict-red-hero: #fee2e2;  --se-verdict-amber-hero: #fef3c7;  --se-verdict-grey-hero: #f4f4f5;
    --se-verdict-green-hero: #dcfce7; --se-verdict-teal-hero: #ccfbf1;
    --se-route-device-fill: #6d28d9; --se-route-cloud-fill: #1d4ed8;
    --se-lane-device-bg: #f5f3ff;    --se-lane-cloud-bg: #eff6ff;
    --se-boundary: #7a7a8c;          --se-gate-open: #1d4ed8;
    --se-shadow-1: 0 1px 2px rgb(16 16 24 / 0.06), 0 8px 24px rgb(16 16 24 / 0.08);
    --se-shadow-pop: 0 16px 40px rgb(16 16 24 / 0.16), 0 0 0 1px var(--se-line);
    --se-glow-device: 0 0 0 1px rgb(109 40 217 / 0.25), 0 0 24px rgb(109 40 217 / 0.12);
    --se-glow-green: 0 0 0 1px rgb(22 101 52 / 0.25), 0 0 32px rgb(22 163 74 / 0.12);
  }
}
```
`@theme inline` additions: `--color-surface-3`, `--color-danger-line`, `--color-verdict-{red,amber,grey,green,teal}-hero`,
`--color-route-device-fill`, `--color-route-cloud-fill`, `--color-lane-device-bg`, `--color-lane-cloud-bg`,
`--color-boundary`, `--color-gate-open`, `--shadow-e1: var(--se-shadow-1)`, `--shadow-pop: var(--se-shadow-pop)`,
`--shadow-glow-device: var(--se-glow-device)`, `--shadow-glow-green: var(--se-glow-green)`.
`@theme` additions: radii `--radius-chip: 6px; --radius-card: 14px; --radius-stage: 20px` (new names only).
`dialog::backdrop` uses `var(--se-overlay)`. Focus: keep the existing `:focus-visible` outline and add
`box-shadow: 0 0 0 4px var(--se-canvas)`, a halo that keeps the ring visible on tints and photos.

**Computed contrast** (WCAG 2.x relative luminance, computed Nov 23; asserted by `tokens.test.ts`):

| Pair | Dark | Light |
|---|---|---|
| fg on canvas / surface / surface-2 / surface-3 | 16.7 / 15.6 / 14.4 / 12.9 | 16.8 / 18.2 / 15.4 / 14.1 |
| muted on canvas / surface / surface-2 / surface-3 | 7.9 / 7.4 / 6.8 / 6.1 | 7.1 / 7.7 / 6.5 / 6.0 |
| line-strong (=boundary) on canvas / surface / surface-2 | 3.8 / 3.5 / 3.2 | 3.9 / 4.2 / 3.6 |
| route-device text on lane-device-bg; route-cloud on lane-cloud-bg | 9.9; 9.7 | 8.2; 8.0 |
| fg / muted on lane-device-bg; on lane-cloud-bg | 15.5 / 7.3; 14.8 / 7.0 | 16.6 / 7.0; 16.7 / 7.1 |
| line-strong on lane-device-bg / lane-cloud-bg | 3.5 / 3.4 | 3.8 / 3.9 |
| device-fill / cloud-fill on canvas (non-text) | 7.2 / 7.7 | 6.6 / 6.2 |
| verdict red/amber/grey/teal/green on own hero | 5.9 / 8.8 / 6.0 / 8.1 / 8.5 | 5.3 / 6.4 / 7.0 / 4.9 / 6.5 |
| fg on any hero tint | ≥12.5 | ≥14.8 |
| muted on red-hero / green-hero | 6.6 / 5.9 | 6.3 / 7.0 |
| teal on canvas / surface / surface-2 / teal-bg | 10.6 / 9.9 / 9.1 / 8.8 | 5.1 / 5.5 / 4.7 / 5.3 |
| danger-line on surface / canvas | 6.6 / 7.1 | 6.5 / 6.0 |
| focus on canvas / surface | 10.9 / 10.2 | 6.2 / 6.7 |

Traps: **light teal text is never placed on surface-3 (4.25:1)**. Text never sits on a gradient or glow; glows are
`box-shadow` decoration behind solid panels.

## 3. Typography (system fonts only, zero network)

`@theme`: `--font-sans: system-ui, -apple-system, 'Segoe UI Variable Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;`
`--font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;`
No webfont and no OFL file. Text tokens set size and line-height only (`--text-x` plus `--text-x--line-height`);
weight and tracking come from the recipes in `components/surface.ts` (§4).

| Token (utility) | Size/LH desktop | Mobile token | Weight, tracking | Use |
|---|---|---|---|---|
| `text-display` | 56/60 | `text-display-sm` 36/40 | 800, -0.035em, `text-balance` | Welcome + Home tagline |
| `text-verdict` | 40/44 | `text-verdict-sm` 28/32 | 800, -0.03em | verdict headline, "Risk reduced" banner |
| `text-h1` | 32/38 | `text-h1-sm` 26/32 | 700, -0.025em | screen titles |
| `text-h2` | 22/28 | `text-h2-sm` 20/26 | 700, -0.015em | `#check-step-title`, sample title, sections |
| `text-title` | 17/24 | none | 600 | card titles, "What the cloud saw" |
| `text-lead` | 18/28 | none | 400, muted | intros, Home subline |
| `text-body` | 16/24 | none | 400 | default prose (replaces most `text-sm` in panels) |
| `text-small` | 14/20 | none | 400/500 | hints, meta, referee row |
| `text-caption` | 12/16 | none | 700 mono, uppercase, 0.12em | lane labels, level labels, eyebrows only |
| `text-stat` | 36/40 | `text-stat-sm` 28/32 | 700 mono `tabular-nums` | Zero Tiles, receipt tiles |
| `text-hud` | 13/18 | none | 600 mono | HUD pill and lines, lane chips |

Rules: users read text at 14 px or more (12 px only for mono caption labels). Prose blocks are `max-w-[68ch]`.
Every latency, counter and byte figure is `tabular-nums`. Weights are 400/500/600/700/800 only.

## 4. Shared components (FOUNDATION owns these)

- **`components/surface.ts` (NEW)**, class recipes every package imports, so each screen uses one recipe:
  `CARD = 'rounded-card border border-line bg-surface shadow-e1 p-4 lg:p-5'`,
  `PANEL = 'rounded-stage border border-line bg-surface shadow-e1 p-4 lg:p-5'`,
  `H1 = 'text-h1-sm font-bold tracking-[-0.025em] text-balance sm:text-h1'`,
  `H2 = 'text-h2-sm font-bold tracking-[-0.015em] sm:text-h2'`,
  `EYEBROW = 'font-mono text-caption font-bold uppercase tracking-[0.12em] text-muted'`, `LEAD = 'text-lead text-muted max-w-[68ch]'`.
- **Button.tsx**: keep BASE (`min-h-11 min-w-11`, `rounded-lg`, `text-sm`, disabled opacity) and the variants. Add:
  - size `lg`: `min-h-12 px-6 text-body font-semibold`;
  - variant `quietDanger`: `border border-danger-line text-danger-line bg-transparent hover:bg-verdict-red-bg`;
  - `transition-colors duration-150` on every variant. Primary hover changes from `hover:opacity-90` to `hover:bg-fg/90`.
- **Badge.tsx**: same labels and `data-route`, and the STYLE strings stay contiguous as the tests read them. Class:
  `inline-flex h-[22px] items-center gap-1.5 rounded-chip border px-2 font-mono text-caption font-bold tracking-[0.06em]`.
  Add a leading dot `<span aria-hidden="true" class="size-1.5 rounded-full …">`: `bg-current` for solid routes,
  `border border-current` for QUEUED/CACHED. **The label text must stay the last child** (`>ON-DEVICE</span>`).
- **Toggle.tsx**: the label span keeps exactly `block font-medium` and the hint span keeps exactly
  `mt-0.5 block text-sm text-muted` (systemScreens.test). Input `accent-verdict-teal` → **`accent-fg`**: teal means
  "protected", so a toggle must not use it. Row becomes `min-h-12 py-2`.
- **Sheet.tsx**: `rounded-t-stage shadow-pop max-h-[85dvh]`, a 36×4 grab bar `bg-line-strong rounded-full mx-auto`
  (aria-hidden), and the title in `text-h2-sm font-bold`. Focus trap and close behaviour unchanged.
- **Icon.tsx**: add stroke icons `cloud`, `lock`, `arrowRight`, `alert`, `info`, `shield`. Add an exported
  `BrandMark({className})`: an eye outline (stroke currentColor) whose pupil is `<rect fill="#000">` with a 1 px
  `var(--se-line-strong)` stroke, `aria-hidden`.
- **Header.tsx**: `<header className="sticky top-0 z-20 border-b border-line bg-canvas">`. **No `backdrop-blur`
  anywhere in the app.** One row, `h-14 flex items-center gap-2 px-4 sm:px-6` (keep `flex-wrap` as a fallback for the
  connectivity chip).
  - Brand: `BrandMark size-7` plus the wordmark `text-[17px] font-bold tracking-[-0.02em]`, with `max-[479px]:sr-only`
    on the name (the markup keeps "Strangers' Eyes").
  - Capability chip: when the state is on-device, `border-route-device-fill/50 bg-route-device-bg text-route-device`;
    otherwise `border-line-strong bg-surface-2 text-fg`. Same text.
  - The connectivity wrapper stays exactly `<span role="status" class="inline-flex">`.
  - Ledger button: a `lock` icon in `text-verdict-teal`, then the unchanged `ui.ledger.button` / `buttonShort` spans in
    `font-mono tabular-nums`. The aria-label is unchanged.
  - Settings: the gear plus the label (sr-only below sm).
- **AppShell.tsx**:
  - `const wide = route.name === 'judge' || route.name === 'check'`. The inner wrapper becomes
    `mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'}`.
  - Main becomes `px-4 pt-6 pb-28 sm:px-6 lg:px-8`. pb-28 keeps the 48 px HUD clear of the last content.
  - Rail becomes `w-72 xl:w-80 bg-canvas border-l border-line p-4`; keep the `id`/`aria-labelledby` order exactly.
  - The skip button gets `focus:rounded-card`.
- **SystemBanner.tsx**: the wrapper markup stays byte-identical
  (`<div data-system-banners=""><div role="alert">…<div role="status" aria-live="polite">`). Only the inner banner
  cards are restyled: `CARD` with a 4 px left rule (`border-l-4 border-l-route-queued-line`, or `border-l-verdict-red`
  for the tripwire and kill switch), an icon and the dismiss ghost button.
- **index.css keyframes** (`@theme`, next to se-sheet-in; all are one-shot, transform/opacity only, and all are
  zeroed by the existing reduced-motion block):
  - `--animate-chip-in: se-chip-in 200ms ease-out both`: translateY 4px→0, opacity 0→1.
  - `--animate-cross: se-cross 700ms cubic-bezier(.2,.8,.2,1) both`: translateX -48px→48px. Opacity is
    0 → 1 (at 15%) → 1 (at 85%) → 0.
  - `--animate-pulse-ring: se-pulse-ring 600ms ease-out 1`: a ::after ring, scale 1→1.25, opacity .9→0.
  - `--animate-mask-in: se-mask-in 180ms cubic-bezier(.2,.8,.2,1) both`: scaleX 0→1, origin left. The element is
    opaque `bg-mask` from its first frame. **Never animate a mask's opacity.**
  - `--animate-wipe: se-wipe 350ms cubic-bezier(.2,.8,.2,1) both`: clip-path `inset(0 100% 0 0)`→`inset(0)`.
  - `--animate-pop: se-pop 250ms ease-out both`: scale .98→1, opacity 0→1.
  - `--animate-rise: se-rise 200ms ease-out both`: translateY 6px→0, opacity 0→1.
- **NEW stubs, created by FOUNDATION with final signatures**, so consumers compile before the owner fills them in:
  - `components/HybridLanes.tsx`: `export function HybridLanes(p: { mode: 'live' | 'explainer'; sessionId?: string; className?: string })`.
    The stub renders `null`.
  - `components/CloudCopy.tsx`: `export function CloudCopy(p: { variant: 'stage' | 'rail' | 'thumb' })`. The stub
    renders `null`.
  - `hud/lanes.ts`: `export type Lane = 'device' | 'cloud'; export function laneOf(r: Route): Lane`. This is final
    code, not a stub: ON_DEVICE, RULES_ONLY, BLOCKED and QUEUED (not sent yet) map to `device`; IN_CLOUD and CACHED
    map to `cloud`.
- **`ui/tokens.test.ts` (NEW)**: parses index.css and resolves both themes. It asserts every pair in the §2 table
  (text ≥4.5, line-strong/boundary/fills/focus ≥3). `npm --prefix web run check` then fails on any regression.
- **`scripts/shoot-ui.mjs`**: add `--scheme dark|light` (CDP `Emulation.setEmulatedMedia` with
  `prefers-color-scheme`) and the suffix `.<viewport>.<scheme>.png`, so every package can screenshot both themes.

## 5. Work packages

Order: **FOUNDATION lands first** (about 1.5 h; tokens, recipes, stubs and ALL new en.json keys). Then the six
packages run in parallel on disjoint files. Only FOUNDATION edits `shared/strings/en.json`. Every file appears
exactly once below. Untouched: `screens/Placeholder.tsx`, `screens/Atlas.tsx`, all of `web/src/{ai,core,vault,tier0,firebase}`,
`ui/hooks/**`, `ui/layout.ts`, `ui/check/*.ts`, `ui/judge/*.ts`, `dev/spikes/**`.

### 5.0 FOUNDATION
**Files:** `web/src/index.css`, `ui/components/{Button,Badge,Toggle,Sheet,Icon,Header,AppShell,SystemBanner}.tsx`,
NEW `ui/components/surface.ts`, NEW stubs `ui/components/HybridLanes.tsx` and `ui/components/CloudCopy.tsx`, NEW
`ui/hud/lanes.ts`, NEW `ui/tokens.test.ts`, `shared/strings/en.json`, `scripts/shoot-ui.mjs`.
**Changes:** as §2–§4.
**New en.json keys** (exact text; add only, never edit an existing value):
- **Lanes:**
  - `ui.lanes.title` "Where each step ran"
  - `ui.lanes.titleExplainer` "Where each step runs"
  - `ui.lanes.device` "This device"
  - `ui.lanes.cloud` "The cloud"
  - `ui.lanes.gate` "Gate"
  - `ui.lanes.gateCount` "{f} faces · {v} vault items"
  - `ui.lanes.vaultTile` "Vault · stays here"
  - `ui.lanes.cloudTile` "Sees: the redacted copy"
  - `ui.lanes.out` "Redacted copy"
  - `ui.lanes.back` "Guesses"
  - `ui.lanes.never` "Right or wrong: never sent"
  - `ui.lanes.calls` "Calls: {n}"
  - `ui.lanes.more` "+{n} earlier"
  - `ui.lanes.caption` "Private steps run on this device, or as built-in rules when it has no on-device AI. Only the redacted copy you approve goes to the cloud."
- **Meter:**
  - `ui.meter.label` "Before: {before}. After: {after}."
  - `ui.meter.single` "Level: {level}."
  - `ui.meter.before` "Before"
  - `ui.meter.after` "After"
- **Tiles:**
  - `ui.tile.images` "Images sent"
  - `ui.tile.faces` "Faces sent"
  - `ui.tile.vault` "Vault items sent"
  - `ui.tile.onDevice` "On-device AI calls"
- **Other:**
  - `ui.stage.caption` "The exact copy the cloud got. Masks are solid black."
  - `ui.judge.coachLabel` "What's happening"
  - `ui.judge.fakeChip` "Fake vault"
  - `ui.welcome.eyebrow` "Before you post"
  - `ui.vault.dangerZone` "Danger zone"
**Acceptance:**
- `check` is green, including `tokens.test.ts`, the boundary self-test and the unchanged shell, systemScreens and
  Badge assertions.
- The header is one row at 390 and 1440, with no blur.
- The rail is w-72 at 1440 and noticeably quieter (bg-canvas).
- The light theme's line-strong borders are visible on surface-2.

### 5.1 HOME / WELCOME / ABOUT / UNSUPPORTED
**Files:** `ui/screens/Welcome.tsx`, `ui/screens/Home.tsx`, `ui/screens/About.tsx`, `ui/components/UnsupportedPage.tsx`.
- **Welcome:**
  - At lg, `grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center min-h-[80dvh]`.
  - Left column: `BrandMark size-16`, `EYEBROW` with `ui.welcome.eyebrow`, then the tagline in
    `text-display-sm sm:text-display font-extrabold tracking-[-0.035em] text-balance`.
  - Bullets as rows: b1 with an `info` icon in muted, b2 with a blue `cloud` icon (text-route-cloud), b3 with a teal
    `lock`, all `text-body`.
  - The age card uses `CARD`. Continue is `size="lg"`, full width below sm.
  - Right column: `<HybridLanes mode="explainer" />` (stacked at <md).
  - **Keep:** `<label …min-h-11…><input type="checkbox"` with the checkbox as the label's first child, and the
    Continue `<button type="submit" … disabled="">Continue</button>` with text only inside it.
- **Home:**
  - Hero h1 = tagline (`text-display…`; **the h1 contains text only**), then `LEAD` with the oneLiner.
  - `HybridLanes explainer` at full width, then the two cards. **At xl (D-160):** explainer left, cards stacked right
    (`grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:items-start`; AppShell `wide` includes home), so both CTAs
    sit above 900 px at 1440×900.
  - Two `CARD`s in `grid md:grid-cols-2 gap-4` (`xl:grid-cols-1`):
    - Check: a `border-l-4 border-l-route-device-fill` rule and a primary `lg` CTA.
    - Judge: a strip of 3 thumbnails, `<img src="/samples/judge-0N.nano768.jpg" alt="" class="aspect-[16/10] w-1/3 rounded-chip object-cover">`, then a secondary CTA.
  - The vault link becomes a teal-outlined row with a lock and the unchanged `ui.home.vaultChip` text, keeping
    `href="#/vault"`. The DEV link is unchanged.
- **About:**
  - Opens with `HybridLanes explainer`.
  - Prose at `text-body max-w-[68ch]`, h2 = `H2`. The "What leaves this device" table gets the route Badge per row
    (existing strings).
  - **The how-it-works `<li>` stay bare** (`<li>{point}</li>`, no class): style them from the parent with `[&>li]:…`.
- **Unsupported:** a centred `CARD` with the BrandMark. Keep `<p id="on-device-feature">`.

**Acceptance:**
- 1440 dark/light: Welcome is two columns with the diagram on the right, and the tagline is 56 px.
- Home shows the tagline, the lanes explainer and both cards above 900 px.
- 390: no horizontal scroll, the diagram is stacked, Continue is full width.

### 5.2 CHECK FLOW
**Files:** `ui/screens/Check.tsx` (returned JSX and classNames ONLY; no hook, effect, reducer or handler edits),
`ui/components/{StepperNav,PhotoStage,ClueList,PrescreenPanel,ConsentPanel,AttackPanel,ImportDropzone}.tsx`,
`ui/check/FixPanel.tsx`, and `ui/shell.test.ts` (**only** line 73's expected h1 class: import `H1` from `surface.ts`).
- **Check layout**, in order:
  1. Title: judge → `<h2 class={H2}>` sample title; otherwise `<h1 class={H1}>`.
  2. `<HybridLanes mode="live" sessionId={session.current.id} />`.
  3. StepperNav.
  4. The stage.
  - Stage: on steps attack, verdict, fix and reattack, at lg it is
    `grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start`. The left column is
    `<CloudCopy variant="stage" />` with `lg:sticky lg:top-4`; the right column is the step `<section>`.
  - Other steps stay single column: import and prescreen need the full width for the editor, and send already shows
    the exact image.
  - The section becomes `PANEL`, and `#check-step-title` uses `H2`.
- **StepperNav:** `ol` = `grid grid-cols-4 gap-1 md:grid-cols-8`. Each `li` is
  `flex flex-col gap-1 rounded-lg min-w-0`.
  - **First an aria-hidden marker div**, OUTSIDE the button/span: a 3 px bar (done `bg-fg`, current
    `bg-accent shadow-glow-device`, reached `bg-line-strong`, upcoming `bg-line`) plus a mono "01"…"08" in
    `text-caption`.
  - **Then the unchanged button or span.** It keeps the exact inner text structure:
    - the current span's first text is the name;
    - the `reached` button contains only the name;
    - the done button keeps its icon, sr-only and aria-hidden spans;
    - upcoming keeps its sr-only text and the italic for unavailable steps.
  - Chevrons are removed. The done icon is `text-fg`, never teal. `min-h-11` is kept.
- **PhotoStage:**
  - The frame is `rounded-card ring-1 ring-line bg-mask`, with a caption row below: `EYEBROW` plus the
    `ui.stage.caption` text and an IN CLOUD-styled note. **No change to `paintPreview` or `renderFrame`.**
  - New user-mask buttons get `animate-mask-in` on mount (opaque `bg-mask`).
  - Clue boxes stay 2 px solid (dashed when approximate), with the ID label chip `rounded-chip bg-surface-3 font-mono text-caption`.
  - `max-h-[70vh]` is kept.
- **ConsentPanel:**
  - The exact image at full panel width, `ring-2 ring-route-cloud-fill rounded-card`.
  - The check rows become tick rows (teal `check` icon + text; a failure uses the red `alert` icon + text).
  - Send is `primary lg`. Keep `data-testid="consent-diff"` (it lives in Check).
- **AttackPanel:** the streaming notes card is `rounded-card bg-lane-cloud-bg border border-route-cloud-fill/40 p-4`
  with an IN CLOUD Badge and the model in mono. The existing shimmer stays only on this card. The decline state is a
  grey card with "on-device findings only" and no retry styling.
- **PrescreenPanel/ClueList:** dense rows (tone icon, label, confidence pill
  `rounded-full border border-line px-2 text-small`), and a teal "masked" chip only for caught items.
- **FixPanel:** each fix is a row with a violet dot plus `text-body`. Apply is `primary lg`.
- **ImportDropzone:** a dashed `rounded-stage border-2 border-dashed border-line-strong bg-surface p-8` drop target
  with an icon and `text-body`. The URL rule (R8) is untouched.
- **Compare block** (keep `data-testid="compare"`):
  - Round counter as an `EYEBROW` chip, then the VerdictCard.
  - Then `ui.compare.title` as `text-title`. `compare-rows` keeps the identical `li` text; style it with
    `[&>li]:rounded-lg [&>li]:bg-surface-2 [&>li]:px-3 [&>li]:py-2 text-body`.
  - Then 4 aria-hidden tiles in `grid grid-cols-2 sm:grid-cols-4 gap-2`: `text-stat-sm sm:text-stat` plus the
    `ui.tile.*` labels. Images uses a blue rule; Faces and Vault are teal with a lock; On-device is violet. Values come
    from `receiptParams(...)` (the images and k already in scope; faces and vault are the literal 0 that the receipt
    copy asserts).
  - Then the receipt `<p data-testid="receipt">` verbatim on a `border-t border-dashed border-line-strong pt-3`.
    This is the final frame of the video.
- **Dev lines** stay dashed mono.

**Acceptance:**
- 1440×900, judge verdict step: the lanes, the stepper, and the cloud copy (left) plus the verdict hero (right) are
  visible without scrolling once the run is in view.
- 390: the stepper is a clean 4×2 grid, the panels are single column, no horizontal scroll.
- Light: the cloud ring and the lane tints are readable.

### 5.3 VERDICT
**Files:** `ui/components/VerdictCard.tsx`, `ui/components/verdict/{VerdictLineItem,VerdictIcon,tones,model}.ts(x)`,
NEW `ui/components/verdict/RiskMeter.tsx`, NEW `ui/components/verdict/BandRuler.tsx`,
`web/src/dev/verdicts/VerdictGallery.tsx`, and `ui/verdictCard.test.ts` (add assertions only).
- **tones.ts**: add `TONE_HERO` (`bg-verdict-*-hero`). LEVEL_TONE is unchanged: LOW and PARTIAL are grey.
- **model.ts**, presentation fields only:
  - `LineView.band: DistanceBand | null` (from `line.band`, otherwise null).
  - `VerdictView.meter: { before: VerdictLevel | null; after: VerdictLevel }`.
  - **Never** add effectiveKm, lat, lng or coordinates. Add a test that `Object.keys(lineView)` contains none of those.
- **Card:** `rounded-stage border border-line bg-surface shadow-e1 overflow-hidden`, keeping `data-level`, the polite
  sr-only status, and the heading levels and `isHeadline` logic.
  - **Compare banner** (keeps `data-compare` and `data-tone`), full width at the top:
    - reduced: `bg-verdict-green-hero shadow-glow-green animate-pop px-5 py-5`, `check` icon `size-8 text-verdict-green`,
      text in `text-verdict-sm sm:text-verdict font-extrabold text-fg`;
    - still exposed: `bg-verdict-red-hero` with the `alert` icon, no glow.
  - **Hero band:** `${TONE_HERO[tone]} border-l-[6px] ${TONE_BORDER[tone]} px-5 py-5 animate-wipe`.
    - The level label is `text-caption font-mono font-bold ${TONE_TEXT}` and stays aria-hidden.
    - The icon is size-8.
    - The headline heading uses `text-verdict…` in text-fg. With a comparison, the headline is the AFTER level as
      today.
    - **The hero always keeps its level tone; it never turns green.**
  - **RiskMeter** under the hero, `px-5 pt-4`:
    - Inline SVG `viewBox="0 0 600 72"`, `role="img"`, aria-label from `ui.meter.label` or `ui.meter.single`.
    - Three segments RED | AMBER | LOW filled with `verdict-red/amber/grey` (all ≥3:1 on surface), plus a separate
      PARTIAL cell with a grey diagonal hatch (an SVG `<pattern>`).
    - Every cell carries its `ui.verdict.level.*` text below it in `fill: var(--se-fg)`.
    - With a comparison: a Before marker (outlined fg triangle + `ui.meter.before`) and an After marker (solid fg
      triangle + `ui.meter.after`). The After marker mounts at the Before x and transitions `transform 700ms`.
    - Without a comparison: the current cell gets a 2 px fg outline and the others are 40 % opacity fills.
    - **No green in the meter.**
  - **Lines:** each `li` is `rounded-lg border-l-4 ${TONE_BORDER} bg-surface-2 p-3`, with the icon size-5 (still
    `<svg aria-hidden data-icon>`), text `text-body`, and the muted vault label unchanged.
    - Confidence is a pill `rounded-full border border-line px-2 text-small`, always visible.
    - "Why?" is a ghost button on the right.
    - For lines with a band: `BandRuler` shows 5 cells (street → country), 20×6 px each and aria-hidden, with the
      matched cell in the tone colour. The matched `ui.band.*` text sits beside it. Bands only: no number, map or
      address.
  - **Not linked / best guess:** two rows with a grey icon and the existing texts. The best guess stays a band string.
  - **Referee row:** `text-small` with the Badge and latency in `tabular-nums`. Keep `data-testid="referee-note"`.
  - **Actions:** the primary Fix at `size="lg"`.
  - **Footer:** `<p data-never-learns>` becomes `bg-verdict-teal-bg px-5 py-3 text-body font-medium text-fg`
    with the teal lock. It is always visible.
- **VerdictGallery:** renders every variant, plus one "reduced" and one "still" comparison, for the screenshot review.

**Acceptance:**
- Gallery in both themes: every hero is legible, green appears only in the reduced banner, every line has an icon,
  text and a confidence pill, and the meter labels are readable at 390 (the SVG scales to 100 % width).

### 5.4 JUDGE
**Files:** `ui/screens/Judge.tsx`, `ui/components/JudgeModeBanner.tsx`, `ui/judge/JudgeCoach.tsx`, NEW `ui/judge/SamplePicker.tsx`.
- **Banner:** one row, `flex flex-wrap items-center gap-3 rounded-card border border-dashed border-route-cached-line bg-surface px-4 py-2.5`.
  - Contents: a `ui.judge.fakeChip` mono chip, the banner text (`text-small`, `lg:line-clamp-2`), the fake-vault note
    in muted, and Exit as a compact secondary button pushed right with `ml-auto`. Below sm, Exit wraps under the text.
- **Title block:**
  - `<h1 class={H1}>` with text only.
  - The intro in `LEAD`.
  - The placeholder note, **still visible**, as `text-small text-muted` with an `info` icon (keep
    `data-testid="judge-placeholder-note"`; no closed `<details>`).
- **SamplePicker** `({ samples, selected, compact, onPick })`:
  - `ul grid grid-cols-3 gap-3`. Each `li` is a `CARD` with `p-0 overflow-hidden`. Inside it:
    - the **`<Button data-sample={id} aria-pressed={selected}>`**, containing `<img src={'/samples/'+id+'.nano768.jpg'} alt="" class="aspect-[16/10] w-full object-cover">`
      plus the title span (`text-small font-semibold line-clamp-2`). **The accessible name stays exactly the title.**
    - the STAND-IN chip **outside the button** (sibling, dashed mono).
  - Selected: `ring-2 ring-route-device-fill shadow-glow-device`.
  - Below sm: one column of horizontal row cards (an 88×56 thumb plus the title).
  - `compact` (during a run): `flex gap-2`, each button a 48 px thumbnail. The title is visible and truncated at sm
    and up, and in a `sr-only` span below sm (never `aria-label`).
  - Toolbar: Run all (keep `data-action="run-all"`; primary before a run, secondary during one), the runningAll
    status, and the Autoplay Toggle with `ml-auto`.
- **Run container:** `<div id="judge-run" ref={runRef} className="scroll-mt-4">` wraps `<Check judge>`.
  - A presentation effect on `[run?.index, run?.nonce]` calls
    `runRef.current?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })`, with
    `reduced = useMediaQuery('(prefers-reduced-motion: reduce)')`. Main is the scroll container at lg, and
    scrollIntoView handles it.
  - The picker collapses with a `grid-rows-[1fr]→[0fr]` transition of 250 ms.
- **JudgeCoach** (keep `data-testid="judge-coach"`, `judge-cached` and `data-action="use-recorded"`):
  - Coach marks become one **neutral** callout: `rounded-card border-l-4 border-l-line-strong bg-surface-2 p-3`, an
    `EYEBROW` with `ui.judge.coachLabel`, then `text-body`. It is not lane-tinted, because in Judge Mode without Nano
    the private steps may run in the cloud.
  - The countdown keeps its text in `text-lead` plus an aria-hidden 3-segment bar (each segment fills over 1 s with
    scaleX).
  - CACHED keeps its dashed outline and Badge.

**Acceptance:**
- 1440×900 dark/light: the picker shows three thumbnail cards above the fold. After a click, the page scrolls so the
  sample title, the lanes and the stepper are at the top, and the run is visible.
- 390×844: three row cards, then a 48 px strip during a run, with no horizontal scroll even with the HUD expanded.

### 5.5 VAULT / SETTINGS
**Files:** `ui/screens/Vault.tsx`, `ui/components/VaultItemForm.tsx`, `ui/screens/Settings.tsx`,
`ui/components/BurnVaultDialog.tsx`, `ui/components/CapabilityPanel.tsx`, `ui/components/PinButton.tsx`.
- **Vault:**
  - `H1`, then a teal plaque `rounded-card border-l-4 border-l-verdict-teal bg-verdict-teal-bg p-4` holding the lock
    and `copy.vault.lock` in fg, followed by the muted explainer.
  - Toolbar: Add place (primary) and Add detail (secondary), with the counter as a mono chip on the right.
  - Item rows use `CARD`: a kind icon in a 32 px `bg-surface-2` tile, the label in `text-title`, the kind as an
    `EYEBROW`, and the edit/delete ghost buttons with their aria-labels kept.
  - Empty state: an inline-SVG locked box (stroke line-strong) plus the existing copy.
  - Burn vault moves to a bottom `CARD` with an `EYEBROW` reading `ui.vault.dangerZone` and the `quietDanger`
    button (same label; the dialog is unchanged). `<p tabindex="-1" role="status"` is kept.
- **VaultItemForm/PinButton:** inputs are `min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-body`
  with the focus ring. Pin status is text only: no coordinates and no map.
- **BurnVaultDialog:** `rounded-stage shadow-pop`, keeping the hold-to-confirm logic.
- **Settings:** `max-w-[42rem]`. The existing sections (device, usage, data, dev) become `CARD`s with `H2` headings
  and `divide-y divide-line` rows. Dev simulations keep their dashed border and a mono "DEV" eyebrow.
- **CapabilityPanel:** each row is a `CARD` row with a status icon and the route Badge. Keep
  `ui.cap.means<span class="sr-only">`, `<p role="status" aria-live="polite" class="sr-only">`, and the download
  button with text only inside.

**Acceptance:**
- In both themes, teal appears only on the vault plaque and locks.
- The Burn button is a red outline with ≥4.5:1 text.
- No coordinates are visible.
- 390: no horizontal scroll in the form.

### 5.6 HUD / LEDGER
**Files:** `ui/components/RouterHUD.tsx`, `ui/components/LedgerPanel.tsx`, `ui/components/HybridLanes.tsx`
(replaces the stub), `ui/components/CloudCopy.tsx` (replaces the stub), NEW `ui/hud/lanes.test.ts`.
- **HybridLanes `live`:**
  - Layout: `figure aria-labelledby` with a visible `text-title` caption (`ui.lanes.title`), then
    `grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] rounded-stage border border-line overflow-hidden`.
  - Lanes:
    - device: `bg-lane-device-bg border-t-4 border-t-route-device-fill`, with a `text-caption text-route-device`
      header;
    - cloud: `bg-lane-cloud-bg border-t-4 border-t-route-cloud-fill`.
  - Entries: from `useLedgerEntries()`, filtered `e.sessionId === sessionId && e.status === 'done'`, memoised. Each
    entry is placed by `laneOf(hudRoute(e))`. Pending entries are not placed (the HUD shows "running…").
  - Lists: one `ol` per lane showing the newest 4, plus `ui.lanes.more`. Each chip is
    `animate-chip-in rounded-chip bg-surface-3 px-2 py-1 font-mono text-hud` holding `jobName`, `<Badge>` and
    `latencyText`.
  - Cached chips: CACHED chips get `border border-dashed border-route-cached-line`.
  - Permanent tiles:
    - device: a teal lock with `ui.lanes.vaultTile`. No count and no values; it imports nothing from `vault/`.
    - cloud: `<CloudCopy variant="thumb" />` with `ui.lanes.cloudTile`.
  - **Wall column:** a `--se-boundary` 2 px bar drawn in inline SVG (viewBox `0 0 56 200`,
    `preserveAspectRatio="none"`), with a gate notch (rounded rect, stroke boundary, `--se-gate-open` while
    crossing). The gate counter `ui.lanes.gateCount` comes from `useLedgerCounters()` in mono.
  - Three fixed arrows at 25 %, 50 % and 75 % height, all aria-hidden: out →, back ← (dashed), and a third → struck
    through with an ✕.
  - Legend: the matching text appears once, as a real-text row under the grid: `ui.lanes.out`, `ui.lanes.back`,
    `ui.lanes.never` with the teal lock.
  - Packet: when the newest S3 `IN_CLOUD` done entry with `imagesOut > 0` changes id, render
    `<div key={id} class="animate-cross absolute …">` holding a 40×28 `CloudCopy thumb` plus "0 · 0". CACHED entries
    never animate a packet, because nothing was sent.
  - **Below md:** one 72 px row, `grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]`. Each lane shows its label,
    `ui.lanes.calls`, and the latest Badge; the middle shows the gate with "0 · 0". The full chip lists are hidden
    (the HUD has them).
  - Not a live region; the HUD already is.
- **HybridLanes `explainer`:**
  - Same grid, stacked below md with a separate horizontal-Wall SVG (no CSS rotate).
  - Ghost chips with dashed outlines and no Badges: device lane `ui.job.preScreen`, `ui.job.referee`,
    `ui.job.fixPlan`; cloud lane `ui.job.adversaryB`.
  - Caption `ui.lanes.titleExplainer` plus the visible `ui.lanes.caption` paragraph.
- **CloudCopy:** owns the object-URL logic moved out of LedgerPanel's CloudSaw, and keeps
  `data-cloud-saw`, `data-sha-prefix`, `ui.cloudSaw.*` and `copy.cloudSaw.empty`. It shows ONLY the last
  `useSentImages()` bytes, never the original.
  - `stage`: `ring-2 ring-route-cloud-fill rounded-card`, `max-h-[60vh] object-contain`, the IN CLOUD Badge, the
    `ui.stage.caption` text and the sha/model dl.
  - `rail`: the current block, in a `ring-1 ring-route-cloud-fill` frame.
  - `thumb`: 64 px, `alt=""`.
  - Only the rail variant renders `data-cloud-saw`, so tests see it once.
- **LedgerPanel:**
  - Zero Tiles first, `grid grid-cols-2 gap-2`, aria-hidden. Each tile shows a `text-stat-sm` mono numeral and a
    `ui.tile.faces` / `ui.tile.vault` label. Value 0: `bg-verdict-teal-bg text-verdict-teal` with a lock. Above 0:
    `bg-verdict-red-bg text-verdict-red` with the `alert` icon.
  - **Then the unchanged `copy.ledger.counters` `<p>`** (visible, `text-small font-semibold`), `checkedNote`, and the
    `data-counter` paragraphs as a compact `text-small` block.
  - Then `CloudCopy rail`, then the entries: each row has a 6 px lane dot plus the Badge, and IN CLOUD rows get
    `border-l-2 border-l-route-cloud-fill pl-2`.
  - `otherTraffic` stays as the footer.
- **RouterHUD:**
  - Pill: `h-12 rounded-full border border-line-strong bg-surface-3 px-4 font-mono text-hud shadow-pop`.
    - A leading 10 px aria-hidden route dot coloured from the last done entry's `hudRoute`: device-fill, cloud-fill,
      `bg-route-rules`, or `bg-route-blocked`; QUEUED and CACHED get an outline ring.
    - A `key={lastId}` `animate-pulse-ring` span in that colour.
    - The text is exactly `hudPill(entries)`.
  - Expanded: `w-[min(32rem,calc(100vw-1.5rem))] rounded-stage shadow-pop`, lines at `text-hud`, each with a lane dot.
  - **Keep exactly:**
    - the collapsed `class="sr-only"` on the section;
    - `<div role="log" aria-live="polite">` with no class when collapsed;
    - `aria-label="Router HUD"`;
    - the bottom-left position.
- **lanes.test.ts:**
  - `laneOf` maps every Route.
  - An IN_CLOUD S4 fallback entry (`inferenceSource: 'in_cloud'`) lands in `cloud`.
  - QUEUED lands in `device`.

**Acceptance:**
- During a judge run at 1440, chips appear in the right lanes, the packet crosses once per send, and the gate reads
  "0 faces · 0 vault items".
- In rules-only, referee chips sit in the device lane with RULES-ONLY.
- 390: the lanes are one 72 px row.
- The HUD pill is 48 px, legible in a 1080p capture, and truncates within 358 px.

## 6. Guardrails (read before you touch a file)

### 6.1 Invariants
- Masks are solid `#000` (`bg-mask`) in both themes. They are never blurred, never semi-transparent, and never
  animated in opacity. The mask animation is scaleX on an opaque element and ends solid. The canvas render path
  (`paintPreview`, `renderFrame`, `frames.*`) is not touched. **No `backdrop-blur` or `blur-*` anywhere.**
- Copy says "Risk reduced", never "safe". Confidence is visible on every verdict line.
- Colour semantics:
  - **GREEN** appears only in the reduced compare banner and its icon.
  - **TEAL** appears only on things protected or never sent: the vault, locks, caught lines, Zero Tiles at 0 and
    the never-learns footer. It is never used for toggles, done-steps or success ticks elsewhere (the consent tick
    rows are the one exception: they mean "never sent").
  - RED high, AMBER medium, GREY info.
  - Route colours: violet ON-DEVICE, blue IN CLOUD, grey RULES-ONLY, red BLOCKED, amber outline QUEUED, dashed
    CACHED SAMPLE.
- Route honesty:
  - Lane placement and dots come only from `hudRoute(e)` via `laneOf`, never from payload class, step or intent.
  - Explainer diagrams never show route Badges.
  - Coach callouts are neutral.
- Bands only: never `effectiveKm`, coordinates, a map, a pin or an address for the attacker's guess.
- The cloud thumbnail comes only from `useSentImages()`, never from the original. HybridLanes and the tiles read no
  vault values and import nothing from `vault/`.
- Every AI call stays visible in the HUD with its route and latency. Verdict lines carry an icon plus text, never
  colour alone.

### 6.2 Tests and hooks (these break silently; check each one)
- Strings:
  - Never change an existing en.json value. Add keys only, and only FOUNDATION edits en.json.
  - The Ledger tiles duplicate the counters sentence, so they are `aria-hidden` and the original `<p>` stays.
- Markup:
  - Each route has exactly one `<h1>` containing **text only**.
  - Badges end with `>{LABEL}</span>`.
  - Stepper markers sit **outside** the `aria-current` span and the step buttons (`aria-current="step"[^>]*>Import<`,
    `<button [^>]*>Verdict</button>`).
  - The About how-it-works `<li>` are bare.
  - Toggle's label and hint classes are byte-identical.
  - The SystemBanner wrapper and `<span role="status" class="inline-flex">` are byte-identical.
  - The Welcome label/checkbox and submit structure are unchanged.
  - The CapabilityPanel sr-only status `<p>` is unchanged.
- Hooks: keep `data-sample`, `data-action` (run-all, continue, use-recorded) and these `data-testid` values:
  judge-placeholder-note, judge-coach, judge-cached, compare, compare-rows, receipt, consent-diff and referee-note.
  Also keep `data-never-learns`, `data-level`, `data-compare`, `data-tone`, `data-route`, `data-hud-line`,
  `data-cloud-saw`, `data-sha-prefix`, `data-counter`, `aria-current="step"`, `role="log"`, the sr-only collapsed
  HUD, the VerdictCard heading level and polite status, `#check-step-title`, `LEDGER_RAIL_ID` and the skip button.
- `scrollIntoView` is optional-chained (jsdom).
- Sample buttons keep their accessible name equal to the title: chips go outside the button, and compact titles go
  in a sr-only span.
- Process:
  - Only `shell.test.ts:73` may change (CHECK FLOW, to `H1`). Any other failing assertion means the markup is wrong.
    Fix the markup, never the test.
  - Logic files (`ai/ core/ vault/ tier0/ firebase/`) are untouched. In Check.tsx only the returned JSX changes.
  - Never weaken `scripts/check-boundaries.mjs`. R9 (no console) covers PhotoStage, ClueList, PrescreenPanel,
    VerdictCard, `verdict/*`, the Vault files and Check.

### 6.3 Platform rules
- No external network requests: no fonts, CDNs or remote images. Thumbnails are same-origin `/samples/*.nano768.jpg`
  (already shipped and openly licensed, with masks). The Ledger's "other traffic" claim and `check-dist.mjs` stay
  true. No new npm dependencies; inline SVG only.
- WCAG AA in dark and light (`tokens.test.ts`). The focus ring is visible everywhere. Keyboard order equals visual
  order. Every animation is one-shot and zeroed by the reduced-motion block. Nothing loops at rest except the
  existing attack shimmer, which is off under reduced motion.
- At 375 and 390 there is no horizontal scroll (AC-060): use `minmax(0,1fr)` and `min-w-0` in grids, and
  `break-all` on sha and model values. The Ledger is a right rail at ≥1024 and a bottom sheet below.
- Performance: memoise the chip lists. The packet uses transform/opacity only, to keep 60 fps capture on the 8 GB M1.

### 6.4 Judge findings → fixes
| Finding | Fix |
|---|---|
| Header blur | §4 Header: solid `bg-canvas`, and the blur ban in §6.1 |
| Wall below 3:1 | `--se-boundary` = line-strong, 3.2–4.2:1 |
| Light line-strong 2.89 on surface-2 | changed to #7a7a8c (3.57) |
| QUEUED drawn in the cloud lane | `laneOf(QUEUED)='device'`, tested |
| Arrow labels missing from en.json | `ui.lanes.out/back/never` |
| Lanes push the stage below the fold | live lanes capped at 4 chips per lane; stage two-column with the cloud copy; scroll-to-run; 72 px row at <md |
| Arrows needing DOM measurement | fixed-geometry SVG inside the Wall, plus a text legend |
| `band` added to model.ts | presentation field plus a no-coordinates key test |
| Stepper and h1 test regexes | markers outside the controls; the h1 text-only rule; the single test edit |
| Agent F overload, no cut order | 7 packages as above, plus the cut order below |
| Teal toggles and done-steps (C2/C3) | `accent-fg` toggles; fg done ticks |
| Green crossfade on the level hero (C3) | the hero keeps its level tone; green only in the banner |
| Translucent mask animation (C3) | scaleX on an opaque mask |
| Quiet-danger at 2.86:1 (C3) | `--se-danger-line`, 6.5–7.1:1 |
| Route badges hard-coded in the diagram (C2) | explainer has no badges; live mode uses `hudRoute` |

### 6.5 Cut order (if short on time) and never-cut
Cut first:
1. BandRuler.
2. Mask-in animation and the pulse ring.
3. About and Settings polish.
4. The Welcome two-column hero (fall back to a single column).
5. The animated RiskMeter marker (render it static).

**Never cut:**
- Judge above the fold (picker collapse plus scroll).
- HybridLanes live with route-honest placement.
- The gate counter.
- The verdict hero plus the "Risk reduced" banner.
- Zero Tiles.
- The HUD pill.
- The no-blur rule and `tokens.test.ts`.

### 6.6 Verify before ticking
1. `npm --prefix web run check` is green after FOUNDATION and after each package merge.
2. `npm --prefix web run build` is green (check-dist).
3. `node scripts/shoot-ui.mjs --out <dir> --scheme dark` and `--scheme light` at desktop (1440×900) and mobile
   (390×844). Compare against `before/`.
4. A manual pass at 375×812 for horizontal scroll, keyboard and reduced motion.
5. Record the D-number and DEVLOG entry per TASKS §2.
