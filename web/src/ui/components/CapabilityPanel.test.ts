// T-061: SCR-02 renders the copy of each state (AC-072 at unit level; the real-browser checks stay manual), the
// Download control and its progress (AC-073 at unit level), and never an error state for (c) (AC-074).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { capabilityOf, type NanoState } from '../../ai/capabilities';
import { t, type StringId, type StringParams } from '../../core/strings';
import { chipStateOf, type CapabilitiesView, type DownloadState } from '../hooks/useCapabilities';
import { CapabilityPanel, handOffFocus, watchShown, type CapabilityPanelProps } from './CapabilityPanel';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = (id: StringId, p?: StringParams) => esc(t(id, p));

interface ViewSpec {
  text?: NanoState;
  image?: NanoState;
  nanoEnabled?: boolean;
  online?: boolean;
  download?: DownloadState;
  checked?: boolean;
  chromeDesktop?: boolean;
  swReady?: boolean;
}
function view(s: ViewSpec = {}): CapabilitiesView {
  const capability = capabilityOf({
    text: s.text ?? 'no-api',
    image: s.image ?? 'no-api',
    nanoEnabled: s.nanoEnabled ?? true,
    online: s.online ?? true,
  });
  const download = s.download ?? { kind: 'idle' };
  return {
    checked: s.checked ?? true,
    capability,
    chip: chipStateOf(capability, download),
    download,
    startDownload: () => undefined,
    onPanelShown: () => undefined,
    chromeDesktop: s.chromeDesktop ?? false,
    swReady: s.swReady ?? false,
  };
}
const render = (caps: CapabilitiesView, extra: Omit<CapabilityPanelProps, 'caps'> = {}) =>
  renderToStaticMarkup(createElement(CapabilityPanel, { caps, ...extra }));
/** The data-route of the policy row for class `k`. */
const routeOf = (html: string, k: string) => {
  const row = html.split('<tr').find((r) => r.includes(`data-class="${k}"`));
  return row?.match(/data-route="([A-Z_]+)"/)?.[1];
};
const DOWNLOAD = T('ui.cap.download');
const HOWTO = T('ui.cap.howto.title');

describe('SCR-02 layout (every state)', () => {
  const states: [string, ViewSpec][] = [
    ['unchecked', { checked: false }],
    ['(a)', { text: 'available', image: 'available' }],
    ["(a′)", { text: 'available', image: 'unavailable' }],
    ['(b)', { text: 'downloadable', image: 'downloadable' }],
    ['(c)', {}],
    ['(c)+(d)', { online: false }],
  ];
  it.each(states)('%s: invariant line, four rows with disclosures, S0–S4 table, three links', (_n, s) => {
    const html = render(view(s));
    expect(html).toContain(T('copy.cap.invariant'));
    // Technical details off (the default): the Tier-0 row reads in plain words and the table has no S0–S4 codes.
    for (const id of ['ui.cap.row.nano', 'ui.cap.row.tier0Plain', 'ui.cap.row.cloud', 'ui.cap.row.offline'] as const) {
      expect(html).toMatch(new RegExp(`<h3[^>]*>${T(id).replace(/[()]/g, '\\$&')}</h3>`));
      // Each "What this means" names its row for screen readers.
      expect(html).toContain(`${T('ui.cap.means')}<span class="sr-only">: ${T(id)}</span>`);
    }
    expect(html.match(/<details/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain(T('ui.cap.policy.caption'));
    for (const k of ['S0', 'S1', 'S2', 'S3', 'S4']) expect(routeOf(html, k)).toBeDefined();
    expect(html).not.toMatch(/>S[0-4]<\/span>/);
    expect(html).not.toContain('Tier-0');
    // Technical details on: the codes and "Tier-0" come back, the badges are the same.
    const techHtml = renderToStaticMarkup(createElement(CapabilityPanel, { caps: view(s), tech: true }));
    for (const k of ['S0', 'S1', 'S2', 'S3', 'S4']) {
      expect(techHtml).toContain(`>${k}</span>`);
      expect(routeOf(techHtml, k)).toBe(routeOf(html, k));
    }
    expect(techHtml).toContain(T('ui.cap.row.tier0'));
    expect(html).toContain(`href="#/vault"`);
    expect(html).toContain(`href="#/judge"`);
    expect(html).toContain(`href="#/check"`);
    expect(html).toContain(T('ui.cap.cta.vault'));
    expect(html).toContain('<p role="status" aria-live="polite" class="sr-only">');
  });
});

describe('row 1: on-device AI per state (AC-072, unit level)', () => {
  it('unchecked: "Checking…", no Download, no how-to', () => {
    const html = render(view({ checked: false, chromeDesktop: true }));
    expect(html).toContain(T('ui.cap.checking'));
    expect(html).not.toContain(DOWNLOAD);
    expect(html).not.toContain(HOWTO);
  });

  it('(a): Nano ready; S0 and S1 on the device', () => {
    const html = render(view({ text: 'available', image: 'available' }));
    expect(html).toContain(T('copy.cap.nanoReady'));
    expect(html).not.toContain(DOWNLOAD);
    expect([routeOf(html, 'S0'), routeOf(html, 'S1'), routeOf(html, 'S2'), routeOf(html, 'S3')]).toEqual(['ON_DEVICE', 'ON_DEVICE', 'ON_DEVICE', 'IN_CLOUD']);
  });

  it("(a′): text only; the image pre-screen (S1) is rules-only", () => {
    const html = render(view({ text: 'available', image: 'unavailable' }));
    expect(html).toContain(T('copy.cap.nanoTextOnly'));
    expect(html).not.toContain(DOWNLOAD);
    expect([routeOf(html, 'S0'), routeOf(html, 'S1')]).toEqual(['ON_DEVICE', 'RULES_ONLY']);
  });

  it("(a′) with a downloadable image model offers the download", () => {
    expect(render(view({ text: 'available', image: 'downloadable' }))).toContain(DOWNLOAD);
  });

  it('(b) downloadable: the copy and an active Download button; S0/S1 rules-only, S2 in the cloud', () => {
    const html = render(view({ text: 'downloadable', image: 'downloadable' }));
    expect(html).toContain(T('copy.cap.nanoDownloadable'));
    expect(html).toMatch(new RegExp(`<button type="button" class="[^"]*">${DOWNLOAD.replace(/[()]/g, '\\$&')}</button>`));
    expect(html).not.toContain('role="progressbar"');
    expect([routeOf(html, 'S0'), routeOf(html, 'S1'), routeOf(html, 'S2')]).toEqual(['RULES_ONLY', 'RULES_ONLY', 'IN_CLOUD']);
  });

  it('(b) running at 43 %: percentage, labelled progressbar, button kept (focus) but aria-disabled, 10 % announcements', () => {
    const html = render(view({ text: 'downloadable', image: 'downloadable', download: { kind: 'running', pct: 43 } }));
    expect(html).toContain(T('copy.cap.nanoDownloading', { pct: 43 }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain(`aria-label="${T('ui.cap.downloadProgress')}"`);
    expect(html).toContain('aria-valuemin="0" aria-valuemax="100" aria-valuenow="43" aria-valuetext="43%"');
    expect(html).toContain('style="width:43%"');
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Download Gemini Nano/);
    expect(html).toContain(`<p role="status" aria-live="polite" class="sr-only">${T('copy.cap.nanoDownloading', { pct: 40 })}</p>`);
  });

  it("(b) Chrome's own download: the downloading copy at 0 % and the button to attach to it", () => {
    const html = render(view({ text: 'downloading', image: 'downloading' }));
    expect(html).toContain(T('copy.cap.nanoDownloading', { pct: 0 }));
    expect(html).toContain(DOWNLOAD);
  });

  it('(b) after a failed download: a calm retry line, the button again, and an announcement', () => {
    const html = render(view({ text: 'downloadable', image: 'downloadable', download: { kind: 'failed' } }));
    expect(html).toContain(T('ui.cap.downloadFailed'));
    expect(html).toMatch(/<button type="button" class="[^"]*">Download Gemini Nano/);
    expect(html).not.toContain('role="alert"');
  });

  it('after the download: (a) without a reload, the ready copy announced', () => {
    const html = render(view({ text: 'available', image: 'available', download: { kind: 'done' } }));
    expect(html).toContain(`<p role="status" aria-live="polite" class="sr-only">${T('copy.cap.nanoReady')}</p>`);
    expect(html).not.toContain(DOWNLOAD);
  });

  it('(c) on Chrome desktop: no-Nano copy plus the how-to disclosure', () => {
    const html = render(view({ chromeDesktop: true }));
    expect(html).toContain(T('copy.cap.nanoNone'));
    expect(html).toContain(HOWTO);
    for (const id of ['ui.cap.howto.step1', 'ui.cap.howto.step2', 'ui.cap.howto.step3', 'ui.cap.howto.hardware'] as const) {
      expect(html).toContain(T(id));
    }
    expect(html).toContain('chrome://settings/ai');
    expect(html).not.toContain(DOWNLOAD);
  });

  it("(c) with the API present but 'unavailable' on Chrome also gets the how-to", () => {
    expect(render(view({ text: 'unavailable', image: 'unavailable', chromeDesktop: true }))).toContain(HOWTO);
  });

  it('(c) in Safari or Firefox: no Chrome how-to', () => {
    const html = render(view({ chromeDesktop: false }));
    expect(html).toContain(T('copy.cap.nanoNone'));
    expect(html).not.toContain(HOWTO);
  });

  it('(c) because Nano is turned off: says so, and no how-to', () => {
    const html = render(view({ text: 'available', image: 'available', nanoEnabled: false, chromeDesktop: true }));
    expect(html).toContain(T('ui.cap.nanoOff'));
    expect(html).not.toContain(T('copy.cap.nanoNone'));
    expect(html).not.toContain(HOWTO);
  });
});

describe('(c) is fully supported, never an error (AC-074)', () => {
  const cVariants: ViewSpec[] = [
    {},
    { chromeDesktop: true },
    { text: 'unavailable', image: 'unavailable', chromeDesktop: true },
    { nanoEnabled: false, text: 'available', image: 'available' },
    { online: false },
    { download: { kind: 'failed' } }, // a download that failed and left (c): no failure line either
  ];
  it.each(cVariants)('%o', (s) => {
    const html = render(view(s));
    expect(html).not.toMatch(/role="alert"|aria-invalid|danger|verdict-red|route-blocked/);
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\berror\b|\bfailed\b|didn&#x27;t finish/i);
    expect(html).not.toContain(T('ui.cap.downloadFailed'));
    expect(routeOf(html, 'S0')).toBe('RULES_ONLY');
  });
});

describe('rows 2–4', () => {
  it('cloud row: ready, paused, cap, App Check; offline (d) wins over all of them', () => {
    const v = view();
    expect(render(v)).toContain(T('copy.cap.cloudReady'));
    expect(render(v, { cloud: 'paused' })).toContain(T('copy.cap.cloudPaused'));
    expect(render(v, { cloud: 'cap' })).toContain(T('copy.cap.cloudCap'));
    expect(render(v, { cloud: 'appCheckFail' })).toContain(T('copy.cap.appCheckFail'));
    const off = render(view({ online: false }), { cloud: 'paused' });
    expect(off).toContain(T('copy.cap.offline'));
    expect(off).not.toContain(T('copy.cap.cloudPaused'));
    expect(routeOf(off, 'S3')).toBe('QUEUED');
    expect(routeOf(off, 'S2')).toBe('RULES_ONLY'); // (c)+(d): the built-in template
  });

  it('Tier-0 row: Ready, or the assets percentage', () => {
    expect(render(view())).toContain(`${T('ui.cap.row.tier0.ready')}</p>`);
    expect(render(view(), { tier0: { kind: 'loading', pct: 37.4 } })).toContain(T('copy.cap.assetsLoading', { pct: 37 }));
  });

  it('works-offline row: ready once a service worker controls the page, else the caching note', () => {
    expect(render(view({ swReady: true }))).toContain(T('copy.cap.offlineReady'));
    expect(render(view({ swReady: false }))).toContain(T('ui.cap.row.offline.pending'));
  });
});

describe("announcements (once, and true in (a′))", () => {
  it("(a′) downloading the image model: a neutral progress line, never \"built-in rules until it's ready\"", () => {
    const html = render(view({ text: 'available', image: 'downloadable', download: { kind: 'running', pct: 57 } }));
    expect(html).toContain(`<p role="status" aria-live="polite" class="sr-only">${T('ui.cap.imageDownloading', { pct: 50 })}</p>`);
    expect(html).not.toContain(T('copy.cap.nanoDownloading', { pct: 50 }));
    expect(html).toContain(T('copy.cap.nanoTextOnly')); // the row status stays true: text jobs run on the device
    expect(html).toContain('aria-valuenow="57"');
  });

  it('the focus target after the download is the row heading, not the status line (which the live region reads)', () => {
    const html = render(view({ text: 'available', image: 'available', download: { kind: 'done' } }));
    expect(html).toContain(`<h3 tabindex="-1" class="font-medium outline-offset-2">${T('ui.cap.row.nano')}</h3>`);
    expect(html).toContain(`<p class="mt-0.5 text-muted">${T('copy.cap.nanoReady')}</p>`);
    expect(html.match(/tabindex="-1"/g)?.length).toBe(1);
  });
});

describe('handOffFocus', () => {
  const body = { tag: 'body' };
  const button = { tag: 'button' };
  it.each([
    ['button just went away, focus fell to <body>', true, false, body, true],
    ['button just went away, activeElement null', true, false, null, true],
    ['button went away but focus is elsewhere', true, false, button, false],
    ['button still there', true, true, body, false],
    ['there was no button', false, false, body, false],
  ] as const)('%s', (_n, had, has, active, moved) => {
    const target = { focus: vi.fn() };
    expect(handOffFocus(had, has, { activeElement: active, body }, target)).toBe(moved);
    expect(target.focus).toHaveBeenCalledTimes(moved ? 1 : 0);
  });
  it('does nothing without a document or a target', () => {
    expect(handOffFocus(true, false, undefined, { focus: vi.fn() })).toBe(false);
    expect(handOffFocus(true, false, { activeElement: null, body }, null)).toBe(false);
  });
});

describe('watchShown (re-check when the sheet opens, D-100)', () => {
  function fakeObserver() {
    const made: { cb: (e: { isIntersecting: boolean }[]) => void; observed: unknown[]; disconnected: boolean }[] = [];
    class FakeIO {
      rec: (typeof made)[number];
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        this.rec = { cb, observed: [], disconnected: false };
        made.push(this.rec);
      }
      observe(el: unknown) {
        this.rec.observed.push(el);
      }
      disconnect() {
        this.rec.disconnected = true;
      }
    }
    return { FakeIO, made };
  }
  it('fires on each hidden → visible change only, and disconnects on cleanup', () => {
    const { FakeIO, made } = fakeObserver();
    const onShown = vi.fn();
    const el = {} as Element;
    const stop = watchShown(el, onShown, FakeIO);
    expect(made[0].observed).toEqual([el]);
    made[0].cb([{ isIntersecting: false }]); // closed sheet
    expect(onShown).not.toHaveBeenCalled();
    made[0].cb([{ isIntersecting: true }]); // opened
    made[0].cb([{ isIntersecting: true }]); // still open
    expect(onShown).toHaveBeenCalledTimes(1);
    made[0].cb([{ isIntersecting: false }]);
    made[0].cb([{ isIntersecting: true }]); // opened again
    expect(onShown).toHaveBeenCalledTimes(2);
    stop();
    expect(made[0].disconnected).toBe(true);
  });
  it('without IntersectionObserver, calls once', () => {
    const onShown = vi.fn();
    watchShown({} as Element, onShown, undefined)();
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});
