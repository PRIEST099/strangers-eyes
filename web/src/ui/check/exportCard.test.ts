// D-185 (SPEC SCR-12, T-081): the covered copy's filename, how it leaves the page, and when it may be offered.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { STRINGS } from '../../core/strings';
import type { DryRun } from '../../ai/preflight';
import { ExportCard, exportOk, maskKey, nearAPin } from './ExportCard';
import { canShareFile, exportFilename, shareFile } from './exportFile';

const S = STRINGS as Record<string, string>;
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const dry = (o: Partial<DryRun> = {}): DryRun => ({
  image: { jpeg: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), base64: '', sha256: 'ab', frame: { id: 'export', width: 10, height: 10, scale: 1, cropInMaster: { x: 0, y: 0, w: 10, h: 10 } } as unknown as DryRun['image']['frame'], mime: 'image/jpeg' },
  bytes: 4, masks: [], autoMasked: 0, userHits: 0, failed: [], facesVisible: 0, vaultVisible: 0, ...o,
});

describe('exportFilename (AC-262)', () => {
  it('is strangers-eyes-<6 chars>.jpg and never carries anything of the original name', () => {
    for (let i = 0; i < 50; i++) expect(exportFilename()).toMatch(/^strangers-eyes-[a-z2-9]{6}\.jpg$/);
    expect(exportFilename(() => new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe('strangers-eyes-abcdef.jpg');
    expect(exportFilename.length).toBeLessThanOrEqual(1); // takes only a random source: no original filename to leak
  });
});

describe('exportOk (AC-260)', () => {
  it('only when every check passed on the exact bytes', () => {
    expect(exportOk(dry())).toBe(true);
    expect(exportOk(dry({ failed: ['metadata'] }))).toBe(false);
    expect(exportOk(dry({ failed: ['check'] }))).toBe(false);
    expect(exportOk(dry({ facesVisible: 1 }))).toBe(false);
    expect(exportOk(dry({ vaultVisible: 1 }))).toBe(false);
  });
});

describe('maskKey', () => {
  it('changes when a mask moves or resizes or the crop changes, even with the same count', () => {
    const a = [{ x: 1, y: 2, w: 3, h: 4 }];
    expect(maskKey(a, null)).toBe(maskKey([{ x: 1, y: 2, w: 3, h: 4 }], null));
    expect(maskKey(a, null)).not.toBe(maskKey([{ x: 2, y: 2, w: 3, h: 4 }], null));
    expect(maskKey(a, null)).not.toBe(maskKey([{ x: 1, y: 2, w: 5, h: 4 }], null));
    expect(maskKey(a, null)).not.toBe(maskKey(a, { x: 0, y: 0, w: 9, h: 9 }));
  });
});

describe('nearAPin', () => {
  it('is true within 5 km of a pin (street, neighbourhood, district), never from the model', () => {
    const v = (band: string) => ({ pinBands: [{ vaultId: 'h', band, hypothesisId: null, confidence: null, effectiveKm: null }] }) as unknown as Parameters<typeof nearAPin>[0];
    expect(nearAPin(v('street'))).toBe(true);
    expect(nearAPin(v('district'))).toBe(true);
    expect(nearAPin(v('city'))).toBe(false);
    expect(nearAPin({ pinBands: [] })).toBe(false);
  });
});

describe('share or download (AC-263)', () => {
  const file = new File([new Uint8Array([1])], 'strangers-eyes-abcdef.jpg', { type: 'image/jpeg' });
  it('shares only where the browser can share files', () => {
    expect(canShareFile(undefined, file)).toBe(false);
    expect(canShareFile({}, file)).toBe(false);
    expect(canShareFile({ share: async () => {}, canShare: () => false }, file)).toBe(false);
    expect(canShareFile({ share: async () => {}, canShare: () => true }, file)).toBe(true);
    expect(canShareFile({ share: async () => {}, canShare: () => { throw new Error('x'); } }, file)).toBe(false);
  });
  it('a closed share sheet is "cancelled", a refusal "failed"', async () => {
    const abort = Object.assign(new Error('a'), { name: 'AbortError' });
    expect(await shareFile({ share: vi.fn(async () => {}) }, file)).toBe('shared');
    expect(await shareFile({ share: vi.fn(async () => { throw abort; }) }, file)).toBe('cancelled');
    expect(await shareFile({ share: vi.fn(async () => { throw new Error('no'); }) }, file)).toBe('failed');
  });
});

describe('ExportCard', () => {
  it('starts with one button and says nothing is sent; never says "safe"', () => {
    const html = renderToStaticMarkup(createElement(ExportCard, { master: null, masks: [], crop: null }));
    expect(html).toContain('data-action="export"');
    expect(html).toMatch(/data-action="export"[^>]*disabled|disabled[^>]*data-action="export"/); // no master: nothing to export
    for (const k of Object.keys(S).filter((k) => k.startsWith('ui.export.')).concat('copy.export.check', 'ui.prescreen.exportSoon')) {
      expect(S[k]).not.toMatch(/\bsafe\b/i);
    }
  });
  it('the still-near caution and the no-cloud body are shown only when asked', () => {
    const near = renderToStaticMarkup(createElement(ExportCard, { master: null, masks: [], crop: null, stillNear: true }));
    expect(near).toContain(esc(S['ui.export.stillNear']!));
    const plain = renderToStaticMarkup(createElement(ExportCard, { master: null, masks: [], crop: null }));
    expect(plain).not.toContain(esc(S['ui.export.stillNear']!));
    const noCloud = renderToStaticMarkup(createElement(ExportCard, { master: null, masks: [], crop: null, noCloud: true }));
    expect(noCloud).toContain(esc(S['ui.export.bodyNoCloud']!));
  });
});
