// web/src/ui/components/verdict/tones.ts: Tailwind classes per verdict tone (T-077). Body text stays `text-fg`;
// index.css keeps each verdict colour at AA contrast on its own tint, in both themes.
import type { Tone } from './model';

/** Text colour for icons and chips; body text stays `text-fg` (AA on every tint, index.css). */
export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  red: 'text-verdict-red', amber: 'text-verdict-amber', grey: 'text-verdict-grey', teal: 'text-verdict-teal', green: 'text-verdict-green',
};
export const TONE_BG: Readonly<Record<Tone, string>> = {
  red: 'bg-verdict-red-bg', amber: 'bg-verdict-amber-bg', grey: 'bg-verdict-grey-bg', teal: 'bg-verdict-teal-bg', green: 'bg-verdict-green-bg',
};
export const TONE_BORDER: Readonly<Record<Tone, string>> = {
  red: 'border-verdict-red', amber: 'border-verdict-amber', grey: 'border-verdict-grey', teal: 'border-verdict-teal', green: 'border-verdict-green',
};
/** The verdict hero band's tint (DESIGN.md §5.3). The hero keeps its LEVEL tone; it never turns green. */
export const TONE_HERO: Readonly<Record<Tone, string>> = {
  red: 'bg-verdict-red-hero', amber: 'bg-verdict-amber-hero', grey: 'bg-verdict-grey-hero', teal: 'bg-verdict-teal-hero', green: 'bg-verdict-green-hero',
};
/** Solid fills for small decorative marks (the BandRuler's matched cell). Lines are never green, so green never renders. */
export const TONE_FILL: Readonly<Record<Tone, string>> = {
  red: 'bg-verdict-red', amber: 'bg-verdict-amber', grey: 'bg-verdict-grey', teal: 'bg-verdict-teal', green: 'bg-verdict-green',
};
