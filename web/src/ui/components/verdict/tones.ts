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
