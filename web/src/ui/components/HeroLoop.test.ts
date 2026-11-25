// HeroLoop (D-171): the looping hero's guarantees, checked on its static markup.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { t } from '../../core/strings';
import { HeroLoop } from './HeroLoop';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const html = renderToStaticMarkup(createElement(HeroLoop));

describe('HeroLoop (D-171)', () => {
  it('carries the three steps as text for assistive technology, and once more as the visible captions', () => {
    for (const id of ['ui.loop.s1', 'ui.loop.s2', 'ui.loop.s3'] as const) {
      expect(html.split(esc(t(id))).length - 1).toBe(2);
    }
    expect(html).toMatch(/<ol class="sr-only">/);
    expect(html).toContain(esc(t('ui.loop.tag')));
  });

  it('starts playing with a Pause control that is always present (WCAG 2.2.2)', () => {
    expect(html).toContain('data-paused="false"');
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*aria-label="${esc(t('ui.loop.pause'))}"`));
  });

  it('is decoration: the picture is hidden from assistive technology and uses only same-origin art', () => {
    expect(html).toMatch(/<div class="relative aspect-\[16\/9\] w-full" aria-hidden="true">/);
    expect(html).toContain('alt=""');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('never marks a place (invariant 5) and never blurs a mask (invariant 6)', () => {
    expect(html).not.toMatch(/\bpin\b|map|marker|address/i);
    // the only blur is the glow filter, applied to light effects (gate, packet, brackets, rays, "?"), never to a mask
    expect(html.match(/<feGaussianBlur/g)).toHaveLength(1);
    expect(html).not.toMatch(/class="[^"]*mask[^"]*"[^>]*filter=/);
  });
});
