// Static-render smoke test of the T-050 shell in Node (no DOM): each screen renders inside the global layout
// with the SPEC §8.2 elements, real landmarks, and no claim of on-device AI before detection exists.
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App, { Screen } from '../App';
import { t } from '../core/strings';
import { Badge } from './components/Badge';
import { AppShell } from './components/AppShell';
import { StepperNav } from './components/StepperNav';
import { H1 } from './components/surface';
import { SCREEN_TITLE } from './layout';
import { PRODUCT_ROUTES, hrefFor, parseHash } from './router';
import { Home } from './screens/Home';
import type { Route } from '../core/types';

function html<P extends object>(c: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(createElement(c, props));
}
/** Text React escapes in markup (the apostrophe in "Strangers' Eyes", "stalker's"). */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('global layout (SPEC §8.2)', () => {
  const page = html(App, {}); // no window → Home, narrow layout, online

  it('has the landmarks and the skip control', () => {
    expect(page).toMatch(/<header[\s>]/);
    expect(page).toContain('<main id="main" tabindex="-1"');
    expect(page).toContain('<aside id="ledger-rail" aria-labelledby="ledger-rail-title"');
    expect(page).toContain('<aside aria-label="Router HUD"');
    expect(page).toContain('Skip to main content');
  });

  it('shows the header elements: name, capability chip, Ledger counters, Settings', () => {
    expect(page).toContain("Strangers&#x27; Eyes");
    expect(page).toContain('Rules-only');
    expect(page).toContain('Ledger 0 · 0');
    // WCAG 2.5.3: the accessible name starts with the visible text.
    expect(page).toContain('aria-label="Ledger 0 · 0. Faces sent: 0 · Vault items sent: 0"');
    expect(page).toContain('href="#/settings"');
  });

  it('never claims on-device AI before capability detection (T-061)', () => {
    expect(page).not.toContain('On-device: Gemini Nano');
    expect(page).not.toContain('On-device: Nano');
    expect(page).not.toContain('Downloading Nano');
  });

  it('hides the connectivity chip while online', () => {
    expect(page).toContain('<span role="status" class="inline-flex"></span>');
  });

  it('collapses the HUD to a pill, with the polite log still in the accessibility tree (AC-061)', () => {
    expect(page).toMatch(/<section id="[^"]+" aria-labelledby="[^"]+" data-state="collapsed" class="sr-only">/);
    expect(page).not.toMatch(/<section[^>]* hidden/);
    expect(page).toContain('<div role="log" aria-live="polite">');
    expect(page).toContain('aria-expanded="false"');
  });
});

describe("every product route renders App's screen for it, with one <h1> (AC-065 at unit level)", () => {
  it.each(PRODUCT_ROUTES)('%s', (name) => {
    const route = parseHash(`#/${name === 'home' ? '' : name}`, { dev: false });
    expect(route.name).toBe(name);
    const out = renderToStaticMarkup(createElement(AppShell, { route }, createElement(Screen, { route })));
    const h1s = [...out.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);
    // Home's <h1> is the tagline (SCR-03); every other screen's <h1> is its screen name.
    expect(h1s).toEqual([esc(name === 'home' ? t('copy.app.tagline') : t(SCREEN_TITLE[name]))]);
  });

  it('maps #/check/<sessionId> to the Check screen', () => {
    const route = parseHash('#/check/abc_123', { dev: false });
    expect(hrefFor(route)).toBe('#/check/abc_123');
    expect(html(Screen, { route })).toContain(`<h1 class="${H1}">${t('ui.screen.check')}</h1>`);
  });

  it('Home shows only real content (SCR-03)', () => {
    const out = html(Home, {});
    expect(out).toContain('See your photo the way a stalker&#x27;s AI would, before you post it.');
    expect(out).toContain('href="#/check"');
    expect(out).toContain('href="#/judge"');
    expect(out).toContain('href="#/vault"');
    expect(out).not.toMatch(/Vault: \d+ items/);
  });
});

describe('check stepper', () => {
  it('lists the eight steps and marks the current one', () => {
    const out = html(StepperNav, { current: 'import', reached: 'import', onSelect: () => {} });
    expect(out.match(/<li /g)?.length).toBe(8);
    expect(out).toContain('<span aria-current="step"');
    expect(out).toMatch(/aria-current="step"[^>]*>Import</);
  });

  it('makes reached steps revisitable buttons labelled as done', () => {
    const out = html(StepperNav, { current: 'verdict', reached: 'verdict', onSelect: () => {} });
    expect(out.match(/<button /g)?.length).toBe(4); // Import, Pre-screen, Send, Attack
    expect(out).toContain('Import (done)');
  });

  it('keeps the furthest step revisitable, without calling it done, while an earlier step is shown', () => {
    const out = html(StepperNav, { current: 'send', reached: 'verdict', onSelect: () => {} });
    expect(out.match(/<button /g)?.length).toBe(4); // Import, Pre-screen, Attack (done) and Verdict (reached)
    expect(out).toContain('Attack (done)');
    expect(out).not.toContain('Verdict (done)');
    expect(out).toMatch(/<button [^>]*>Verdict<\/button>/);
  });

  it('marks the current step without the focus colour', () => {
    const out = html(StepperNav, { current: 'import', reached: 'import', onSelect: () => {} });
    expect(out).not.toContain('ring-focus');
  });
});

describe('route badges (SPEC §8.3)', () => {
  it.each<[Route, string]>([
    ['ON_DEVICE', 'ON-DEVICE'],
    ['IN_CLOUD', 'IN CLOUD'],
    ['RULES_ONLY', 'RULES-ONLY'],
    ['CACHED', 'CACHED SAMPLE'],
    ['BLOCKED', 'BLOCKED'],
    ['QUEUED', 'QUEUED'],
  ])('%s → %s', (route, label) => {
    const out = html(Badge, { route });
    expect(out).toContain(`>${label}</span>`);
    expect(out).toContain(`data-route="${route}"`);
  });

  it('QUEUED is an amber outline and CACHED a dashed outline', () => {
    expect(html(Badge, { route: 'QUEUED' })).toContain('border-route-queued-line bg-transparent');
    expect(html(Badge, { route: 'CACHED' })).toContain('border-dashed');
  });
});
