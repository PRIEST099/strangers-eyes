// D-182: the sealed answer card and stamp, rendered to static markup.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '../../core/strings';
import { SealedAnswer, SealStamp } from './SealedAnswer';

const S = STRINGS as Record<string, string>;
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const card = (online: boolean) => renderToStaticMarkup(createElement(SealedAnswer, { online, onOpen: () => {} }));

describe('SealedAnswer (D-182)', () => {
  it('online: says the connection is on and keeps "Open it offline" disabled; "Open it now" stays available', () => {
    const html = card(true);
    expect(html).toContain('data-connection="on"');
    expect(html).toContain(esc(S['ui.seal.connOn']));
    expect(html).toMatch(/<button[^>]*data-action="open-offline"[^>]*disabled/);
    expect(html).not.toMatch(/<button[^>]*data-action="open-now"[^>]*disabled/);
  });

  it('online: the disabled button says why (a rendered description), and "Simulate offline" is called out as not counting', () => {
    const html = renderToStaticMarkup(createElement(SealedAnswer, { online: true, simulated: true, onOpen: () => {} }));
    expect(html).toMatch(/data-action="open-offline"[^>]*aria-describedby="seal-offline-why"|aria-describedby="seal-offline-why"[^>]*data-action="open-offline"/);
    expect(html).toContain('id="seal-offline-why"');
    expect(html).toContain('data-testid="seal-simulated"');
    expect(card(false)).not.toContain('aria-describedby="seal-offline-why"'); // no dangling reference when enabled
    expect(renderToStaticMarkup(createElement(SealedAnswer, { online: false, simulated: true, onOpen: () => {} }))).not.toContain('seal-simulated');
  });

  it('offline: says the connection is off and enables "Open it offline"', () => {
    const html = card(false);
    expect(html).toContain('data-connection="off"');
    expect(html).toContain(esc(S['ui.seal.connOff']));
    expect(html).not.toMatch(/<button[^>]*data-action="open-offline"[^>]*disabled/);
  });

  it('never claims more than the Ledger counts: the stamp shows the three counts and its scope', () => {
    const html = renderToStaticMarkup(createElement(SealStamp, { counts: { onDevice: 1, rules: 0, cloud: 0 }, backOnline: false }));
    expect(html).toContain(esc(S['ui.seal.stampCounts'].replace('{onDevice}', '1').replace('{rules}', '0').replace('{cloud}', '0')));
    expect(html).toContain(esc(S['ui.seal.stampScope']));
    expect(html).toContain('data-cloud="0"');
    const back = renderToStaticMarkup(createElement(SealStamp, { counts: { onDevice: 1, rules: 0, cloud: 0 }, backOnline: true }));
    expect(back).toContain(esc(S['ui.seal.stampScopeBack']));
    for (const k of ['ui.seal.body', 'ui.seal.note', 'ui.seal.stampScope', 'ui.seal.stampTitle', 'ui.judge.sealHint']) {
      expect(S[k]).not.toMatch(/\bsafe\b|cannot learn|physically/i);
    }
  });
});
