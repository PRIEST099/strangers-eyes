// T-053 (AC-100): what a drop or a paste starts. Files only; a link or text starts nothing (copy.import.noUrl).
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GpsPinLike } from '../tier0/gpsWarning';
import type { ImportedPhoto, ImportResult } from '../tier0/importPhoto';
import { t } from '../core/strings';
import { CHECK_START, checkReducer } from './checkState';
import { ImportDropzone } from './components/ImportDropzone';
import {
  IMPORT_IDLE, importAndSettle, pickFromTransfer, pickStep, refuseDragOutsideZone, resultStatus, statusLines,
  type ImportStatus, type SettleDeps,
} from './importTransfer';
import { Check } from './screens/Check';

const f = (type: string, name = 'x') => ({ type, name });

describe('pickFromTransfer', () => {
  it('a dropped or pasted image file starts the import', () => {
    const img = f('image/jpeg');
    expect(pickFromTransfer({ files: [img], types: ['Files'] })).toEqual({ kind: 'file', file: img });
  });

  it('one photo per check: the first image file wins over earlier non-images and later images', () => {
    const txt = f('text/plain', 'notes.txt');
    const a = f('image/png', 'a.png');
    const b = f('image/webp', 'b.webp');
    expect(pickFromTransfer({ files: [txt, a, b], types: ['Files'] })).toEqual({ kind: 'file', file: a });
  });

  it('a pasted screenshot (a file and nothing else) starts the import', () => {
    const png = f('image/png');
    expect(pickFromTransfer({ files: [png], types: ['Files'] })).toEqual({ kind: 'file', file: png });
  });

  it('SR-06: an image that arrives with its web address or page markup is noUrl, even though a file is attached', () => {
    const png = f('image/png');
    // "Copy image" on a website, then Ctrl/Cmd+V: Chrome hands over text/html (<img src=…>) plus the image file.
    expect(pickFromTransfer({ files: [png], types: ['text/html', 'Files'], text: '<img src="https://x.test/a.jpg">' }))
      .toEqual({ kind: 'noUrl' });
    // An image dragged from another tab: Chrome / Safari send text/uri-list (+ text/html) with the file.
    expect(pickFromTransfer({ files: [png], types: ['text/uri-list', 'text/html', 'Files'] })).toEqual({ kind: 'noUrl' });
    expect(pickFromTransfer({ files: [png], types: ['text/uri-list', 'Files'] })).toEqual({ kind: 'noUrl' });
    // Firefox's web-image drag.
    expect(pickFromTransfer({ files: [png], types: ['application/x-moz-file-promise-url', 'text/x-moz-url', 'Files'] }))
      .toEqual({ kind: 'noUrl' });
  });

  it('no image file: the first file goes to the sniffer (a HEIC with an empty type still works; a .txt is unsupported there)', () => {
    const heic = f('', 'IMG_0001.HEIC');
    expect(pickFromTransfer({ files: [heic], types: ['Files'] })).toEqual({ kind: 'file', file: heic });
    const txt = f('text/plain', 'a.txt');
    expect(pickFromTransfer({ files: [txt], types: ['Files'] })).toEqual({ kind: 'file', file: txt });
  });

  it('a pasted or dropped URL, link or text without a file → noUrl (nothing starts)', () => {
    expect(pickFromTransfer({ files: [], types: ['text/plain'], text: 'https://example.com/photo.jpg' })).toEqual({ kind: 'noUrl' });
    expect(pickFromTransfer({ files: [], types: ['text/uri-list', 'text/html'] })).toEqual({ kind: 'noUrl' });
    expect(pickFromTransfer({ files: [], types: [], text: 'hello' })).toEqual({ kind: 'noUrl' });
  });

  it('nothing at all → none (ignored)', () => {
    expect(pickFromTransfer({ files: [], types: [] })).toEqual({ kind: 'none' });
    expect(pickFromTransfer({ files: [], types: ['Files'], text: '   ' })).toEqual({ kind: 'none' });
  });
});

const okResult = (gps: ImportedPhoto['gpsWarning']): ImportResult => ({
  ok: true, master: {} as HTMLCanvasElement, jpeg: new Blob([]), width: 100, height: 200, sha256: '0'.repeat(64),
  format: 'jpeg', hadGps: gps !== null, orientation: null, gpsWarning: gps,
});
const NEAR_HOME: ImportedPhoto['gpsWarning'] = { near: [{ band: 'street', kind: 'home_pin', kindDisplay: 'HOME' }] };

describe('the dropzone status: a new attempt replaces the previous photo (no stale "Photo ready")', () => {
  const render = (s: ImportStatus) => statusLines(s).map((m) => t(m.id, m.params));

  it('a file pick clears the previous photo and goes busy; a link clears it and shows noUrl', () => {
    const a = f('image/jpeg', 'B.heic');
    expect(pickStep(false, { kind: 'file', file: a })).toEqual({ status: { kind: 'busy' }, clearPhoto: true, start: a });
    expect(pickStep(false, { kind: 'noUrl' }))
      .toEqual({ status: { kind: 'error', copyId: 'copy.import.noUrl' }, clearPhoto: true, start: null });
  });

  it('while one photo is being prepared, a second pick changes nothing; an empty transfer changes nothing', () => {
    const none = { status: null, clearPhoto: false, start: null };
    expect(pickStep(true, { kind: 'file', file: f('image/png') })).toEqual(none);
    expect(pickStep(true, { kind: 'noUrl' })).toEqual(none);
    expect(pickStep(false, { kind: 'none' })).toEqual(none);
  });

  it('ready carries the "Photo ready" line and the GPS warning in the one live region; a failure replaces them', () => {
    const ready = resultStatus(okResult(NEAR_HOME));
    expect(render(ready)).toEqual([
      'Photo ready: 100 × 200 px, metadata removed.',
      t('copy.import.gpsFound'),
      'That GPS point is within 250 m (street level) of your HOME. It has been removed.',
    ]);
    expect(render(resultStatus(okResult(null)))).toEqual(['Photo ready: 100 × 200 px, metadata removed.']);
    // A re-import of a HEIC the browser cannot open: only the error remains, nothing of photo A.
    const failed = resultStatus({ ok: false, code: 'heic', copyId: 'copy.import.heic' });
    expect(render(failed)).toEqual([t('copy.import.heic')]);
    expect(render(resultStatus('crash'))).toEqual([t('copy.import.unsupported')]);
    expect(render({ kind: 'busy' })).toEqual([t('ui.import.working')]);
    expect(render({ kind: 'idle' })).toEqual([]);
  });
});

describe('the import status survives a step round-trip (fix round 2: Check owns it, next to the master)', () => {
  // Static render in Node (no DOM): what a freshly MOUNTED dropzone shows for the status its parent hands it.
  const mount = (status: ImportStatus) => renderToStaticMarkup(createElement(ImportDropzone, {
    getPins: async () => [], status, onStatus: () => {}, onPhoto: () => {},
  }));
  const liveRegion = (html: string) => html.match(/<div [^>]*role="status"[^>]*>.*?<\/div>/)?.[0] ?? '';
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  it('Import → ready with a GPS warning → another step (dropzone unmounted) → Import again: the same panel, not idle', () => {
    // Check's state across the round trip (its real reducer; checkState.test.ts pins Check's wiring of it). The
    // dropzone reports the settled import through onStatus…
    let s = checkReducer(CHECK_START, { type: 'importStatus', status: resultStatus(okResult(NEAR_HOME)) });
    const before = liveRegion(mount(s.importStatus));
    // …the user opens another step (the dropzone unmounts; Check keeps the status and the master) and comes back.
    s = checkReducer(s, { type: 'selectStep', step: 'prescreen' });
    s = checkReducer(s, { type: 'selectStep', step: 'import' });
    const after = liveRegion(mount(s.importStatus));
    expect(after).toBe(before);
    expect(after).toContain('data-state="ready"');
    expect(after).toContain(esc('Photo ready: 100 × 200 px, metadata removed.'));
    expect(after).toContain(esc(t('copy.import.gpsFound')));
    expect(after).toContain(esc('That GPS point is within 250 m (street level) of your HOME. It has been removed.'));
    // An error and a busy import come back the same way (busy: the remounted step still refuses a second photo).
    expect(liveRegion(mount({ kind: 'error', copyId: 'copy.import.heic' }))).toContain(esc(t('copy.import.heic')));
    expect(mount({ kind: 'busy' })).toContain('aria-busy="true"');
    // Only a Check that never imported (or a new attempt) shows the idle dropzone.
    expect(liveRegion(mount(IMPORT_IDLE))).toMatch(/data-state="idle"[^>]*><\/div>$/);
  });

  it('Check renders the dropzone from its own status: one live region, idle at first', () => {
    const html = renderToStaticMarkup(createElement(Check));
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(liveRegion(html)).toContain('data-state="idle"');
  });

  const dz = readFileSync(new URL('./components/ImportDropzone.tsx', import.meta.url), 'utf8');
  const check = readFileSync(new URL('./screens/Check.tsx', import.meta.url), 'utf8');
  /** The source without comments (good enough for these two files: no "//" or "/*" inside their strings). */
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('the status lives in Check (its reducer, next to the master ref), never in the dropzone', () => {
    expect(check).toContain('useReducer(checkReducer, CHECK_START)');
    expect(check).toMatch(/<ImportDropzone [^>]*status=\{state\.importStatus\} onStatus=\{onImportStatus\}/);
    expect(dz).not.toMatch(/useState<ImportStatus>|useReducer/);
    expect(dz).toContain("pickStep(busy.current || status.kind === 'busy', pick)");
  });

  it('fix round 3: run() hands the parent callbacks to importAndSettle unwrapped (no "still mounted?" guard in run)', () => {
    // The whole body of run, pinned: importAndSettle (tested below) is the only settle path, with Check's callbacks as is.
    // A source pin cannot see a guard hidden elsewhere (a renamed prop, say): checkState.test.ts drives the component
    // itself through an unmount mid-import and checks that the parent still gets the settled status.
    const run = code(dz).match(/const run = useCallback\(async \(file: File\) => \{([\s\S]*?)\}, \[getPins, onPhoto, onStatus\]\);/)?.[1];
    expect(run?.replace(/\s+/g, ' ').trim())
      .toBe('busy.current = true; try { await importAndSettle(file, { getPins, importFn: importPhoto, onPhoto, onStatus }); } finally { busy.current = false; }');
    // The only other calls of the parent's callbacks: a pick's status and clearing the replaced photo (in handle).
    expect(code(dz).match(/\bonStatus\s*\(/g)).toEqual(['onStatus(']);
    expect(code(dz)).toContain('if (step.status) onStatus(step.status);');
    expect(code(dz).match(/\bonPhoto\s*\(/g)).toEqual(['onPhoto(']);
    expect(code(dz)).toContain('if (step.clearPhoto) onPhoto(null);');
  });
});

describe('importAndSettle: the parent always receives the settled status (fix round 3)', () => {
  const PIN: GpsPinLike = { kind: 'home_pin', lat: 10, lng: 20 };
  const file = f('image/jpeg', 'a.jpg');
  type Call = ['photo', ImportedPhoto | null] | ['status', ImportStatus];
  function harness(o: { getPins?: SettleDeps<typeof file>['getPins']; importFn?: SettleDeps<typeof file>['importFn'] } = {}) {
    const calls: Call[] = [];
    const imported: Array<[typeof file, readonly GpsPinLike[]]> = [];
    const importFn = o.importFn ?? (async () => okResult(NEAR_HOME));
    const deps: SettleDeps<typeof file> = {
      getPins: o.getPins ?? (async () => [PIN]),
      importFn: (x, opts) => { imported.push([x, opts.pins]); return importFn(x, opts); },
      onPhoto: (p) => { calls.push(['photo', p]); },
      onStatus: (st) => { calls.push(['status', st]); },
    };
    return { deps, calls, imported };
  }

  it('success: onPhoto(photo), THEN onStatus(ready); the file and the vault pins reach importFn', async () => {
    const photo = okResult(NEAR_HOME);
    const { deps, calls, imported } = harness({ importFn: async () => photo });
    const st = await importAndSettle(file, deps);
    expect(st).toEqual(resultStatus(photo));
    expect(st.kind).toBe('ready');
    expect(calls).toEqual([['photo', photo], ['status', st]]);
    expect(imported).toEqual([[file, [PIN]]]);
  });

  it('a typed error: onStatus(error) and never onPhoto', async () => {
    const { deps, calls } = harness({ importFn: async () => ({ ok: false, code: 'heic', copyId: 'copy.import.heic' }) });
    expect(await importAndSettle(file, deps)).toEqual({ kind: 'error', copyId: 'copy.import.heic' });
    expect(calls).toEqual([['status', { kind: 'error', copyId: 'copy.import.heic' }]]);
  });

  it('importFn throws (sync or async): still settled, as unsupported', async () => {
    const boom = new Error('boom');
    for (const importFn of [async () => { throw boom; }, () => { throw boom; }] as Array<SettleDeps<typeof file>['importFn']>) {
      const { deps, calls } = harness({ importFn });
      expect(await importAndSettle(file, deps)).toEqual({ kind: 'error', copyId: 'copy.import.unsupported' });
      expect(calls).toEqual([['status', { kind: 'error', copyId: 'copy.import.unsupported' }]]);
    }
  });

  it('getPins rejects or throws: the photo is imported with no pins (gpsFound only) and still settles ready', async () => {
    for (const getPins of [async () => { throw new Error('vault locked'); }, () => { throw new Error('no vault'); }] as Array<SettleDeps<typeof file>['getPins']>) {
      const { deps, calls, imported } = harness({ getPins });
      const st = await importAndSettle(file, deps);
      expect(st.kind).toBe('ready');
      expect(imported).toEqual([[file, []]]);
      expect(calls.map((c) => c[0])).toEqual(['photo', 'status']);
    }
  });
});

describe('refuseDragOutsideZone: the page outside the drop zone is not a drop target', () => {
  const ev = (defaultPrevented: boolean) => {
    const e = { defaultPrevented, prevented: false, dataTransfer: { dropEffect: 'copy' }, preventDefault() { this.prevented = true; } };
    return e;
  };
  it('outside the zone: cancelled with dropEffect none (no copy cursor, no navigation to the file or link)', () => {
    const e = ev(false);
    refuseDragOutsideZone(e);
    expect(e.prevented).toBe(true);
    expect(e.dataTransfer.dropEffect).toBe('none');
  });
  it('over the zone (its handler already accepted the drag): left alone, so the zone keeps its copy cursor', () => {
    const e = ev(true);
    refuseDragOutsideZone(e);
    expect(e.prevented).toBe(false);
    expect(e.dataTransfer.dropEffect).toBe('copy');
  });
});

describe('ImportDropzone source (R8 and SCR-05)', () => {
  const src = readFileSync(new URL('./components/ImportDropzone.tsx', import.meta.url), 'utf8');
  it('has no URL input and never parses a URL', () => {
    expect(src).not.toMatch(/type\s*=\s*["']url["']/);
    expect(src).not.toMatch(/\bnew URL\s*\(/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });
  it('accepts exactly JPEG, PNG, WebP and HEIC/HEIF in the file picker', () => {
    expect(src).toContain('accept="image/jpeg,image/png,image/webp,image/heic,image/heif"');
  });
  it('one always-mounted live region; the window dragover refuses drops outside the zone; picks go through pickStep', () => {
    expect(src.match(/role="status"/g)).toHaveLength(1);
    expect(src).toContain("window.addEventListener('dragover', onWindowDragOver)");
    expect(src).toContain('refuseDragOutsideZone(e)');
    expect(src).toContain("pickStep(busy.current || status.kind === 'busy', pick)");
    expect(src).toContain('onPhoto(null)');
  });

  const check = readFileSync(new URL('./screens/Check.tsx', import.meta.url), 'utf8');
  it('Check awaits the vault index for the GPS warning, clears the master on a new attempt, and has no second status', () => {
    expect(check).toContain('pinsWhenReady(vaultScan)');
    expect(check).toMatch(/master\.current = p \? .* : null/);
    expect(check).not.toMatch(/role="status"/);
  });
});
