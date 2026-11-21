// T-091, T-092, T-094: static renders (react-dom/server, no DOM) of Welcome, Settings, About, the system banners and the
// unsupported-browser page. Interaction (ticking the box, toggles, App's gate) is in welcomeSettings.test.ts.
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import pkg from '../../package.json';
import { t, type StringId } from '../core/strings';
import { PAYLOAD_CLASSES } from '../ai/capabilities';
import { AppShell } from './components/AppShell';
import { SystemBanner } from './components/SystemBanner';
import { UnsupportedPage } from './components/UnsupportedPage';
import { parseHash } from './router';
import { About, REPO_URL, commitOf, howItWorksPoints } from './screens/About';
import { Settings, showDeveloper, writeNotice, type SettingsDeps } from './screens/Settings';
import { Toggle } from './components/Toggle';
import { simulateNoNano } from './simulate';
import { capabilityOf } from '../ai/capabilities';
import type { CapabilitiesView } from './hooks/useCapabilities';
import { Welcome } from './screens/Welcome';
import { CLOUD_OFF_ORDER, INITIAL_STATUS, TRANSIENT_EVENTS, selectBanners, systemStatus, type CloudOff, type SystemStatus } from './systemStatus';

const html = <P extends object>(c: ComponentType<P>, props: P): string => renderToStaticMarkup(createElement(c, props));
/** Text as React escapes it in markup. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const has = (out: string, id: StringId, params?: Record<string, string | number>) => out.includes(esc(t(id, params)));
/** Every <input …/> tag whose attributes include `attr` (React orders attributes its own way). */
const inputs = (out: string, attr: string) => [...out.matchAll(/<input [^>]*\/>/g)].map((m) => m[0]).filter((x) => x.includes(attr));

const S = (over: Partial<SystemStatus> = {}): SystemStatus => ({ ...INITIAL_STATUS, ...over });
const ONLY: Record<CloudOff, [SystemStatus, number]> = {
  tripwire: [S({ tripwire: true }), 0],
  killSwitch: [S({ killSwitch: true }), 0],
  appCheck: [S({ appCheckFailed: true }), 0],
  auth: [S({ authFailed: true }), 0],
  dailyCap: [S({ dailyCap: 2 }), 2],
};

describe('SCR-01 Welcome (static)', () => {
  const out = html(Welcome, { onContinue: () => {} });

  it('shows the tagline, the three bullets and the age box', () => {
    for (const id of ['copy.app.tagline', 'copy.welcome.b1', 'copy.welcome.b2', 'copy.welcome.b3', 'copy.welcome.age'] as const) {
      expect(has(out, id)).toBe(true);
    }
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('AC-070: the box starts unticked and Continue starts disabled', () => {
    const box = inputs(out, 'name="age"');
    expect(box).toHaveLength(1);
    expect(box[0]).toContain('type="checkbox"');
    expect(box[0]).not.toContain('checked');
    expect(out).toMatch(/<button type="submit" [^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it('the box is inside its label (the whole row is the target)', () => {
    expect(out).toMatch(/<label [^>]*min-h-11[^>]*><input type="checkbox"/);
  });
});

describe('SCR-22 unsupported browser (static)', () => {
  it('a full page with copy.err.browser and no app chrome', () => {
    const out = html(UnsupportedPage, {});
    expect(has(out, 'copy.err.browser')).toBe(true);
    expect(out).toContain('<main id="main"');
    expect(out).not.toContain('<header');
    expect(out).not.toContain('Ledger');
  });
});

describe('SCR-22 system banners (static, AC-290)', () => {
  it.each(CLOUD_OFF_ORDER)('%s shows its copy', (kind) => {
    const [s, used] = ONLY[kind];
    const out = html(SystemBanner, { banners: selectBanners(s, used), onDismiss: () => {} });
    const b = selectBanners(s, used)[0];
    expect(out).toContain(esc(t(b.copy, b.params)));
    expect(out).toContain(`data-banner="${kind}"`);
    expect(out).not.toContain(esc(t('ui.banner.dismiss'))); // state banners cannot be dismissed
  });

  it.each(TRANSIENT_EVENTS)('event %s shows its copy with a Dismiss button', (e) => {
    const out = html(SystemBanner, { banners: selectBanners(S({ events: [e] }), 0), onDismiss: () => {} });
    expect(out).toContain(esc(t(selectBanners(S({ events: [e] }), 0)[0].copy)));
    expect(out).toContain(`aria-label="${esc(t('ui.banner.dismiss'))}"`);
  });

  it('the tripwire banner is in the assertive region; the others are polite', () => {
    const trip = html(SystemBanner, { banners: selectBanners(ONLY.tripwire[0], 0) });
    expect(trip).toMatch(/<div role="alert"><div data-banner="tripwire"/);
    expect(trip).toContain('<div role="status" aria-live="polite"></div>');
    const ks = html(SystemBanner, { banners: selectBanners(ONLY.killSwitch[0], 0) });
    expect(ks).toContain('<div role="alert"></div>');
    expect(ks).toMatch(/<div role="status" aria-live="polite"><div data-banner="killSwitch"/);
  });

  it('both live regions exist even with no banner (a later banner is announced)', () => {
    const out = html(SystemBanner, { banners: [] });
    expect(out).toBe('<div data-system-banners=""><div role="alert"></div><div role="status" aria-live="polite"></div></div>');
  });

  it('never colour alone: every banner has text and an icon', () => {
    const out = html(SystemBanner, { banners: selectBanners(S({ events: [...TRANSIENT_EVENTS] }), 0) });
    expect(out.match(/<svg aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the shell shows banners and keeps the screen working (AC-290)', () => {
  afterEach(() => {
    systemStatus.set({ killSwitch: false, appCheckFailed: false, authFailed: false, dailyCap: INITIAL_STATUS.dailyCap });
    for (const e of TRANSIENT_EVENTS) systemStatus.dismiss(e);
  });

  const route = parseHash('#/', { dev: false });
  const child = createElement('p', { id: 'on-device-feature' }, 'on-device feature');
  const shell = () => renderToStaticMarkup(createElement(AppShell, { route }, child));

  it('kill switch: banner, "Cloud paused" chip, SCR-02 row 3 paused, and the screen still renders', () => {
    systemStatus.set({ killSwitch: true });
    const out = shell();
    expect(has(out, 'copy.err.killSwitch')).toBe(true);
    expect(has(out, 'ui.conn.cloudPaused')).toBe(true);
    expect(has(out, 'copy.cap.cloudPaused')).toBe(true);
    expect(out).toContain('<p id="on-device-feature">on-device feature</p>');
  });

  it('App Check failure: banner and the SCR-02 App Check line', () => {
    systemStatus.set({ appCheckFailed: true });
    const out = shell();
    expect(has(out, 'copy.err.appCheck')).toBe(true);
    expect(has(out, 'copy.cap.appCheckFail')).toBe(true);
    expect(out).toContain('on-device feature');
  });

  it('a network event shows its banner; nothing is shown once dismissed', () => {
    systemStatus.report('network');
    expect(has(shell(), 'copy.err.network')).toBe(true);
    systemStatus.dismiss('network');
    expect(has(shell(), 'copy.err.network')).toBe(false);
  });

  it('no condition: no banner, no connectivity chip, cloud ready', () => {
    const out = shell();
    expect(out).toContain('<div data-system-banners=""><div role="alert"></div><div role="status" aria-live="polite"></div></div>');
    expect(has(out, 'copy.cap.cloudReady')).toBe(true);
  });
});

describe('SCR-20 About (static, AC-276)', () => {
  const out = html(About, {});

  it('shows the version and says honestly that the commit is not recorded in a build without one', () => {
    expect(has(out, 'ui.about.versionNoCommit', { version: pkg.version })).toBe(true);
  });

  it('shows the build commit when the build records one (vite.config.ts defines VITE_GIT_SHA)', () => {
    vi.stubEnv('VITE_GIT_SHA', '062f98f');
    try {
      expect(has(html(About, {}), 'ui.about.version', { version: pkg.version, commit: '062f98f' })).toBe(true);
      vi.stubEnv('VITE_GIT_SHA', 'unknown'); // no git at build time
      expect(has(html(About, {}), 'ui.about.versionNoCommit', { version: pkg.version })).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('lists exactly the libraries of THIRD_PARTY_NOTICES, in order', () => {
    const list = /<ul data-about="libraries"[^>]*>(.*?)<\/ul>/.exec(out)?.[1] ?? '';
    const items = [...list.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
    expect(items).toEqual(
      (['ui.about.lib.mediapipe', 'ui.about.lib.tesseract', 'ui.about.lib.traineddata', 'ui.about.lib.exifr', 'ui.about.lib.idbKeyval',
        'ui.about.lib.firebase', 'ui.about.lib.react'] as const).map((id) => esc(t(id))),
    );
  });

  it('honest routing words: S2 and S4 may reach the cloud when Nano is off; the attacker only gets the approved copy', () => {
    expect(t('ui.about.leaves.S2')).toMatch(/Gemini Nano is turned off/);
    expect(t('ui.about.leaves.S4')).toMatch(/Gemini Nano is turned off/);
    expect(t('ui.about.gemini')).toMatch(/only ever gets the redacted copy you approve/);
    expect(t('ui.about.gemini')).toMatch(/Public explanations and Judge Mode samples also use Gemini/);
  });

  it('shows every SPEC item', () => {
    for (const id of [
      'copy.about.notGuarantee', 'copy.about.reattackDisclosure', 'copy.about.support', 'copy.ledger.otherTraffic',
      'ui.about.recaptcha', 'ui.about.gemini', 'ui.about.prior.e11', 'ui.about.prior.e12', 'ui.about.adults', 'ui.about.repo',
      'ui.about.notices', 'ui.about.licenses',
      'ui.about.lib.mediapipe', 'ui.about.lib.tesseract', 'ui.about.lib.traineddata', 'ui.about.lib.exifr', 'ui.about.lib.idbKeyval',
    ] as const) {
      expect(has(out, id), id).toBe(true);
    }
    for (const p of howItWorksPoints(t('copy.about.howItWorks'))) expect(out).toContain(`<li>${esc(p)}</li>`);
  });

  it('"What leaves this device": one row per payload class, S0–S4 in plain words', () => {
    for (const k of PAYLOAD_CLASSES) {
      expect(has(out, `ui.cap.policy.${k}`)).toBe(true);
      expect(has(out, `ui.about.leaves.${k}`)).toBe(true);
    }
    expect(out.match(/<th scope="row"/g)).toHaveLength(PAYLOAD_CLASSES.length);
  });

  it('links: the repo, the notices files, the prior-art DOI; external links open safely', () => {
    expect(out).toContain(`href="${REPO_URL}"`);
    expect(out).toContain('href="/vendor/third-party-notices.md"');
    expect(out).toContain('href="/third-party-licenses.md"');
    expect(out).toContain('href="https://doi.org/10.1145/3706598.3714074"');
    expect(out.match(/target="_blank"/g)?.length).toBe(out.match(/rel="noopener noreferrer"/g)?.length);
  });

  it('never claims "safe" (only copy.about.notGuarantee says it cannot promise it)', () => {
    const text = out.replace(/<[^>]+>/g, ' ');
    const safe = text.match(/\bsafe\b/gi) ?? [];
    expect(safe).toHaveLength(1);
    expect(t('copy.about.notGuarantee')).toMatch(/\bsafe\b/);
  });

  it('one <h1>, the screen name (the shell test relies on it)', () => {
    expect([...out.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1])).toEqual([t('ui.screen.about')]);
  });
});

describe('About helpers', () => {
  it('commitOf: a hex SHA (7–40), trimmed, at most 12 shown; anything else is null', () => {
    expect(commitOf('55fbad7')).toBe('55fbad7');
    expect(commitOf(' ABCDEF0123456789abcdef0123456789abcdef01 ')).toBe('abcdef012345');
    for (const v of [undefined, null, '', 'abc', 'not-a-sha', '55fbad7; rm', 42, '<script>']) expect(commitOf(v)).toBeNull();
  });

  it('howItWorksPoints splits copy.about.howItWorks on " · " into its four points', () => {
    const pts = howItWorksPoints(t('copy.about.howItWorks'));
    expect(pts).toHaveLength(4);
    expect(pts.join(' · ')).toBe(t('copy.about.howItWorks'));
  });
});

describe('SCR-20 Settings (static)', () => {
  const NONE: SettingsDeps = { clearHistory: null, receipt: null, copyText: async () => {} };

  it('P0: the Nano toggle (on), usage with the cap, capNote, Burn vault, the About link; one <h1>', () => {
    const out = html(Settings, { deps: NONE, debug: false });
    const sw = inputs(out, 'role="switch"');
    expect(sw).toHaveLength(1);
    expect(sw[0]).toContain('checked=""');
    expect(has(out, 'ui.settings.useNano')).toBe(true);
    expect(has(out, 'ui.settings.usage.today', { used: 0, cap: INITIAL_STATUS.dailyCap })).toBe(true);
    expect(has(out, 'copy.settings.capNote')).toBe(true);
    expect(has(out, 'ui.burn.action')).toBe(true);
    expect(out).toContain('href="#/about"');
    expect([...out.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1])).toEqual([t('ui.screen.settings')]);
    expect(has(out, 'ui.placeholder')).toBe(false);
  });

  it('Clear history and Copy ledger receipt appear only once their stores exist', () => {
    const none = html(Settings, { deps: NONE, debug: false });
    expect(has(none, 'ui.settings.clearHistory')).toBe(false);
    expect(has(none, 'ui.settings.receipt')).toBe(false);
    const both = html(Settings, { deps: { ...NONE, clearHistory: async () => {}, receipt: () => 'r' }, debug: false });
    expect(has(both, 'ui.settings.clearHistory')).toBe(true);
    expect(has(both, 'ui.settings.receipt')).toBe(true);
  });

  it('Developer (P1, AC-006) only with ?debug=1: two simulation switches, off', () => {
    expect(has(html(Settings, { deps: NONE, debug: false }), 'ui.settings.dev')).toBe(false);
    const out = html(Settings, { deps: NONE, debug: true });
    expect(has(out, 'ui.settings.dev.noNano')).toBe(true);
    expect(has(out, 'ui.settings.dev.offline')).toBe(true);
    const sw = inputs(out, 'role="switch"');
    expect(sw).toHaveLength(3);
    expect(sw.filter((x) => x.includes('checked=""'))).toHaveLength(1); // only "Use Gemini Nano"
  });

  it('inside the shell: the capability state and the button that opens SCR-02', () => {
    const route = parseHash('#/settings', { dev: false });
    const out = renderToStaticMarkup(createElement(AppShell, { route }, createElement(Settings, { deps: NONE, debug: false })));
    expect(has(out, 'ui.settings.device.now', { state: t('ui.cap.chip.rulesOnly') })).toBe(true);
    expect(has(out, 'ui.settings.device.details')).toBe(true);
  });

  it('helpers: writeNotice and showDeveloper', () => {
    expect(writeNotice(true)).toBeNull();
    expect(writeNotice(false)).toBe('ui.settings.notSaved');
    expect(showDeveloper(false, { noNano: false, offline: false })).toBe(false);
    expect(showDeveloper(true, { noNano: false, offline: false })).toBe(true);
    expect(showDeveloper(false, { noNano: true, offline: false })).toBe(true);
    expect(showDeveloper(false, { noNano: false, offline: true })).toBe(true);
  });
});

describe('Toggle accessibility', () => {
  it('the name is the label only; the hint is the description', () => {
    const out = html(Toggle, { label: 'Use Gemini Nano when available', hint: 'A hint.', checked: true, onChange: () => {} });
    const input = /<input [^>]*\/>/.exec(out)?.[0] ?? '';
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(input)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(input)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(labelledBy).not.toBe(describedBy);
    expect(out).toContain(`id="${labelledBy}" class="block font-medium">Use Gemini Nano when available</span>`);
    expect(out).toContain(`id="${describedBy}" class="mt-0.5 block text-sm text-muted">A hint.</span>`);
    expect(input).toContain('role="switch"');
  });

  it('without a hint there is no aria-describedby', () => {
    const out = html(Toggle, { label: 'Simulate: offline', checked: false, onChange: () => {} });
    expect(/<input [^>]*\/>/.exec(out)?.[0]).not.toContain('aria-describedby');
  });
});

describe('simulateNoNano (Settings › Developer, AC-006/AC-072)', () => {
  const real = (): CapabilitiesView => ({
    checked: true,
    capability: capabilityOf({ text: 'available', image: 'downloadable', nanoEnabled: true, online: true }),
    chip: { kind: 'nano' },
    download: { kind: 'running', pct: 40 },
    startDownload: vi.fn(),
    onPanelShown: vi.fn(),
    chromeDesktop: true,
    swReady: true,
  });

  it('turns any real state into (c) no-api: Rules-only chip, no download, no Download action', () => {
    const r = real();
    const v = simulateNoNano(r, { nanoEnabled: true, online: true });
    expect(v.capability).toEqual(capabilityOf({ text: 'no-api', image: 'no-api', nanoEnabled: true, online: true }));
    expect(v.capability).toMatchObject({ state: 'c', noNano: 'no-api', downloadIo: null });
    expect(v.chip).toEqual({ kind: 'rulesOnly' });
    expect(v.download).toEqual({ kind: 'idle' });
    v.startDownload();
    expect(r.startDownload).not.toHaveBeenCalled();
    expect(v.onPanelShown).toBe(r.onPanelShown);
    expect(v.chromeDesktop).toBe(true); // so the Chrome how-to shows, as in a real (c)
  });

  it('keeps the "Use Gemini Nano" off precedence and the offline flag', () => {
    expect(simulateNoNano(real(), { nanoEnabled: false, online: true }).capability.noNano).toBe('disabled');
    expect(simulateNoNano(real(), { nanoEnabled: true, online: false }).capability.offline).toBe(true);
  });
});
