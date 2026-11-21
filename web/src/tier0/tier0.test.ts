// tier0/tier0.ts (T-068): the Tier-0 pre-screen flow with fake readers. Progress reports, findings (faces, vault spans,
// regex flags and their de-duplication), counts, and fail-closed reporting when a reader fails or cannot run.
import { describe, expect, it, vi } from 'vitest';
import type { OcrWord, PxRect } from '../core/types';
import { makeTerm, matchWords, DEFAULT_FUZZY_THRESHOLD } from './fuzzy';
import { runTier0, tier0Findings, vaultClueType, type Tier0Deps, type Tier0StepReport, type VaultWordHit } from './tier0';

const w = (text: string, x: number, line: number, conf = 90, y = 100, h = 30): OcrWord => ({ text, conf, box: { x, y: y + line * 50, w: 60, h }, line });
const MASTER = { width: 800, height: 600 } as HTMLCanvasElement;
const JPEG = new Blob([]);

function deps(over: Partial<Tier0Deps> = {}): Tier0Deps {
  let clock = 0;
  return {
    assertClean: vi.fn(async () => {}),
    detectFaces: vi.fn(async () => [] as PxRect[]),
    ocr: vi.fn(async () => [] as OcrWord[]),
    matchVault: vi.fn(async () => [] as VaultWordHit[]),
    now: () => (clock += 10),
    ...over,
  };
}

describe('tier0Findings', () => {
  it('a face → a masked face clue with its unpadded box', () => {
    const [f] = tier0Findings([{ x: 1, y: 2, w: 30, h: 40 }], [], [], 600);
    expect(f.clue).toEqual({
      id: 't0-1', source: 'tier0_face', readers: 'tier0', type: 'face', box: { x: 1, y: 2, w: 30, h: 40 }, boxPrecision: 'exact',
      severity: 'high', removable: true, vaultHits: [], masked: true, userUnmasked: false, maskReason: 'face',
    });
  });

  it('a vault span → one clue over the union of its words, with the vault id, kind and LOCAL text; two terms on one span share it', () => {
    const words = [w('HELLO', 0, 0), w('LUCAS', 100, 0), w('SMITH', 200, 0)];
    const hits: VaultWordHit[] = [
      { term: { vaultId: 'v1', kind: 'child_name' }, spans: [[1, 2]] },
      { term: { vaultId: 'v2', kind: 'person_name' }, spans: [[1, 2]] },
    ];
    const out = tier0Findings([], words, hits, 600);
    expect(out).toHaveLength(1);
    expect(out[0].clue).toMatchObject({
      source: 'tier0_ocr_vault', type: 'name_text', vaultHits: ['v1', 'v2'], maskReason: 'vault_text', localText: 'LUCAS SMITH',
      box: { x: 100, y: 100, w: 160, h: 30 },
    });
    expect(out[0].vaultKinds).toEqual(['child_name', 'person_name']);
  });

  it('a regex flag inside a vault span is the same text and is dropped; one outside it stays (phone → type other)', () => {
    const words = [w('SE1234', 0, 0), w('07700', 0, 1), w('900123', 100, 1)];
    const hits: VaultWordHit[] = [{ term: { vaultId: 'vp', kind: 'plate' }, spans: [[0, 0]] }];
    const out = tier0Findings([], words, hits, 600);
    expect(out.map((f) => [f.clue.source, f.clue.type, f.regexKind])).toEqual([
      ['tier0_ocr_vault', 'plate', undefined],
      ['tier0_regex', 'other', 'phone'],
    ]);
    expect(out[1].clue).toMatchObject({ maskReason: 'regex', localText: '07700 900123', masked: true });
  });

  it('ids are t0-1, t0-2… in order faces, vault, regex; spans outside the word list are ignored', () => {
    const words = [w('12', 0, 0, 90, 100, 40)];
    const out = tier0Findings([{ x: 0, y: 0, w: 5, h: 5 }], words, [{ term: { vaultId: 'v', kind: 'child_name' }, spans: [[5, 9]] }], 600);
    expect(out.map((f) => [f.clue.id, f.clue.source])).toEqual([['t0-1', 'tier0_face'], ['t0-2', 'tier0_regex']]);
    expect(out[1].regexKind).toBe('house_number');
  });

  it('two OCR readings of the same plate (D-81 union keeps both) → ONE flag over both boxes, not two rows', () => {
    const words = [w('AB12CDE', 600, 0), { text: 'AB12CDE', conf: 88, box: { x: 610, y: 104, w: 60, h: 30 }, line: 7 }, w('AB12CDE', 0, 3)];
    const out = tier0Findings([], words, [], 600);
    expect(out.map((f) => [f.clue.id, f.clue.box])).toEqual([
      ['t0-1', { x: 600, y: 100, w: 70, h: 34 }], // the two overlapping readings, unioned
      ['t0-2', { x: 0, y: 250, w: 60, h: 30 }], // the same text elsewhere in the photo stays its own flag
    ]);
  });

  it('same plate text in two boxes that only touch: two flags (touching edges are not an overlap)', () => {
    const words = [w('AB12CDE', 0, 0), { text: 'AB12CDE', conf: 90, box: { x: 60, y: 100, w: 60, h: 30 }, line: 4 }];
    expect(tier0Findings([], words, [], 600)).toHaveLength(2);
  });

  it('two OCR readings of the same vault text → one vault clue over both (and one match), its words covered for regex', () => {
    const words = [w('LUCAS', 100, 0), { text: 'LUCAS', conf: 80, box: { x: 104, y: 102, w: 60, h: 30 }, line: 9 }];
    const hits: VaultWordHit[] = [{ term: { vaultId: 'v1', kind: 'child_name' }, spans: [[0, 0], [1, 1]] }];
    const out = tier0Findings([], words, hits, 600);
    expect(out).toHaveLength(1);
    expect(out[0].clue).toMatchObject({ vaultHits: ['v1'], box: { x: 100, y: 100, w: 64, h: 32 } });
  });

  it('vaultClueType maps every vault kind to a clue type', () => {
    expect(vaultClueType('plate')).toBe('plate');
    expect(vaultClueType('house_number')).toBe('house_number');
    expect(vaultClueType('street_name')).toBe('street_sign');
    expect(vaultClueType('area_name')).toBe('street_sign');
    expect(vaultClueType('descriptor')).toBe('uniform_or_lanyard');
    expect(vaultClueType('phone')).toBe('other');
    for (const k of ['child_name', 'self_name', 'person_name', 'employer', 'school_name', 'other_text'] as const) expect(vaultClueType(k)).toBe('name_text');
  });

  it('with the real matcher: a printed "L U C A S" tag matches the vault child name Lucas (AC-111 Tier-0 half)', () => {
    const words = [w('L', 0, 0), w('U', 20, 0), w('C', 40, 0), w('A', 60, 0), w('S', 80, 0), w('PARK', 0, 1)];
    const hits = matchWords(words, [makeTerm('v1', 'child_name', 'Lucas')], DEFAULT_FUZZY_THRESHOLD, 'image');
    const out = tier0Findings([], words, hits, 600);
    expect(out).toHaveLength(1);
    expect(out[0].clue).toMatchObject({ vaultHits: ['v1'], localText: 'L U C A S', box: { x: 0, y: 100, w: 140, h: 30 } });
  });
});

describe('runTier0', () => {
  it('reports every step running → done with counts and latency, faces and OCR concurrently, then the vault', async () => {
    const reports: Tier0StepReport[] = [];
    const words = [w('LUCAS', 0, 0), w('07700 900123', 0, 1)];
    let ocrStarted = false;
    let facesSawOcr = false;
    const d = deps({
      // faces yields once, then checks that OCR had already started: the two readers run concurrently
      detectFaces: vi.fn(async () => { await Promise.resolve(); facesSawOcr = ocrStarted; return [{ x: 1, y: 1, w: 9, h: 9 }]; }),
      ocr: vi.fn(async () => { ocrStarted = true; return words; }),
      matchVault: vi.fn(async () => [{ term: { vaultId: 'v1', kind: 'child_name' as const }, spans: [[0, 0]] as const }]),
    });
    const r = await runTier0(MASTER, JPEG, d, (x) => reports.push(x));
    expect(d.assertClean).toHaveBeenCalledWith(JPEG);
    expect(d.matchVault).toHaveBeenCalledWith(words);
    expect(reports.map((x) => `${x.step}:${x.status}`)).toEqual([
      'metadata:running', 'metadata:done', 'faces:running', 'text:running', 'text:done', 'faces:done', 'vault:running', 'vault:done',
    ]);
    expect(reports.filter((x) => x.status === 'done').map((x) => [x.step, x.count])).toEqual([['metadata', undefined], ['text', 2], ['faces', 1], ['vault', 1]]);
    expect(reports.filter((x) => x.status === 'done').every((x) => typeof x.ms === 'number' && x.ms >= 0)).toBe(true);
    expect(facesSawOcr).toBe(true);
    expect(r).toMatchObject({ faces: 1, words: 2, vaultMatches: 1, failed: [] });
    expect(r.findings.map((f) => f.clue.source)).toEqual(['tier0_face', 'tier0_ocr_vault', 'tier0_regex']);
  });

  it('a face reader that fails is reported and listed; the other steps still run (fail closed is the caller\'s)', async () => {
    const reports: Tier0StepReport[] = [];
    const r = await runTier0(MASTER, JPEG, deps({ detectFaces: vi.fn(async () => { throw new Error('model'); }) }), (x) => reports.push(x));
    expect(r.failed).toEqual(['faces']);
    expect(reports.find((x) => x.step === 'faces' && x.status === 'failed')?.ms).toBeTypeOf('number');
    expect(reports.some((x) => x.step === 'vault' && x.status === 'done')).toBe(true);
  });

  it('OCR that fails fails the vault step too: nothing was read, so nothing was checked', async () => {
    const d = deps({ ocr: vi.fn(async () => { throw new Error('worker'); }) });
    const reports: Tier0StepReport[] = [];
    const r = await runTier0(MASTER, JPEG, d, (x) => reports.push(x));
    expect(r.failed).toEqual(['text', 'vault']);
    expect(d.matchVault).not.toHaveBeenCalled();
    expect(reports.filter((x) => x.step === 'vault')).toEqual([{ step: 'vault', status: 'failed' }]);
  });

  it('a vault index that is not available (null) fails the vault step; it never reads as 0 matches', async () => {
    const reports: Tier0StepReport[] = [];
    const r = await runTier0(MASTER, JPEG, deps({ ocr: vi.fn(async () => [w('LUCAS', 0, 0)]), matchVault: vi.fn(async () => null) }), (x) => reports.push(x));
    expect(r.failed).toEqual(['vault']);
    expect(reports.filter((x) => x.step === 'vault').map((x) => x.status)).toEqual(['running', 'failed']);
    expect(r.vaultMatches).toBe(0);
  });

  it('metadata left in the master fails that step; failed steps come back in pipeline order', async () => {
    const r = await runTier0(MASTER, JPEG, deps({
      assertClean: vi.fn(async () => { throw new Error('APP1'); }),
      ocr: vi.fn(async () => { throw new Error('x'); }),
      detectFaces: vi.fn(async () => { throw new Error('y'); }),
    }));
    expect(r.failed).toEqual(['metadata', 'faces', 'text', 'vault']);
  });

  it('a superseded run (isCurrent false) starts no reader: every step fails at once (D-133)', async () => {
    let current = true;
    const d = deps({ assertClean: vi.fn(async () => { current = false; }), isCurrent: () => current });
    const r = await runTier0(MASTER, JPEG, d);
    expect(d.detectFaces).not.toHaveBeenCalled();
    expect(d.ocr).not.toHaveBeenCalled();
    expect(d.matchVault).not.toHaveBeenCalled();
    expect(r.failed).toEqual(['faces', 'text', 'vault']);
  });

  it('a listener that throws never breaks the pipeline', async () => {
    const r = await runTier0(MASTER, JPEG, deps(), () => { throw new Error('ui'); });
    expect(r.failed).toEqual([]);
  });
});
