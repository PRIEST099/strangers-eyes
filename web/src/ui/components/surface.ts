// web/src/ui/components/surface.ts: the shared class recipes (docs/DESIGN.md §4), so every screen draws a card, a
// panel or a heading the same way. Weight and tracking live here; the text tokens in index.css set size and
// line-height only. Plain strings: append layout classes with a template literal, never override padding here.

/** A content card: cards in lists, banners, small panels. */
export const CARD = 'rounded-card border border-line bg-surface shadow-e1 p-4 lg:p-5';
/** A larger stage panel: the Check step section, dialogs' bodies. */
export const PANEL = 'rounded-stage border border-line bg-surface shadow-e1 p-4 lg:p-5';
/** The screen title. The <h1> holds text only (shell.test). */
export const H1 = 'text-h1-sm font-bold tracking-[-0.025em] text-balance sm:text-h1';
/** Section headings, `#check-step-title`, the sample title. */
export const H2 = 'text-h2-sm font-bold tracking-[-0.015em] sm:text-h2';
/** Mono uppercase label: lane labels, level labels, eyebrows. The only text allowed at 12 px. */
export const EYEBROW = 'font-mono text-caption font-bold uppercase tracking-[0.12em] text-muted';
/** Intro paragraph under a title. */
export const LEAD = 'text-lead text-muted max-w-[68ch]';
