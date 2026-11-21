// web/src/tier0/tier0.ts: the Tier-0 pre-screen pipeline (SPEC SCR-06 W2, ARCH §11.2; T-068). Always runs, on device,
// with or without on-device AI:
//   1. metadata: the master JPEG is re-checked clean (no APP1/APP13, no GPS; D-19). Import already did it; this is the
//      "Removing metadata" line, with its own latency, and a second look that fails closed.
//   2. faces (MediaPipe) and 3. text (Tesseract, both passes unioned) run concurrently on the master.
//   4. vault: the OCR words against the ACTIVE vault through the one matcher (D-38), then the regex flags.
// Every reader is injected (Tier0Deps), so the flow is unit-tested in Node and tier0/* never imports vault/* (R13):
// the caller binds the matcher to the active index. A reader that fails or cannot run is reported in `failed`, and
// the caller FAILS CLOSED on it (Tier-0 cannot say "no faces" or "no vault text" when it did not look; D-123).
// Findings are clues in master pixels with UNPADDED boxes (D-88); padding is applied when masks are built.
// LOCAL ONLY: the OCR words, `localText` and the matched vault kinds never leave this device and are never logged.
import type { Clue, ClueType, OcrWord, PxRect, VaultKind } from '../core/types';
import type { Span, Term } from './fuzzy';
import { regexFlags, unionRect, type RegexKind } from './regex';

export type Tier0StepId = 'metadata' | 'faces' | 'text' | 'vault';
export const TIER0_STEPS: readonly Tier0StepId[] = ['metadata', 'faces', 'text', 'vault'];

/** One progress report. `count` (faces, words, vault matches) and `ms` come with `done`; `ms` with `failed` too. */
export interface Tier0StepReport {
  step: Tier0StepId;
  status: 'running' | 'done' | 'failed';
  count?: number;
  ms?: number;
}

/** A vault hit as the matcher returns it (tier0/fuzzy WordHit): the term and the word spans to mask. */
export interface VaultWordHit { term: Pick<Term, 'vaultId' | 'kind'>; spans: readonly Span[] }

export interface Tier0Deps {
  /** D-19 check of the master JPEG; rejects if any metadata is left. */
  assertClean: (jpeg: Blob) => Promise<void>;
  /** Faces in master px at RC face_min_confidence (tier0/faces.detectFaces). Rejects if the model cannot load. */
  detectFaces: (master: HTMLCanvasElement) => Promise<readonly PxRect[]>;
  /** OCR words in master px, both passes unioned (tier0/ocr.ocrMaster). */
  ocr: (master: HTMLCanvasElement) => Promise<readonly OcrWord[]>;
  /** The active vault's matcher in image mode; null when the index is not available (fail closed). */
  matchVault: (words: readonly OcrWord[]) => Promise<readonly VaultWordHit[] | null>;
  now: () => number;
}

/** A clue plus what the local side list needs to label it. LOCAL ONLY. */
export interface Tier0Finding {
  clue: Clue;
  /** The vault kind(s) a vault-text clue matched (for copy.prescreen.vaultHit's {kind}). */
  vaultKinds?: readonly VaultKind[];
  /** Which regex flagged it (a phone has no clue type of its own: its type is 'other'). */
  regexKind?: RegexKind;
}

export interface Tier0Result {
  findings: Tier0Finding[];
  /** Counts for the progress lines. */
  faces: number;
  words: number;
  vaultMatches: number;
  /** Steps that failed or could not run. Non-empty → the caller must not let this photo go on (fail closed). */
  failed: Tier0StepId[];
}

/** The clue type of a vault-text hit, by the vault kind it matched (SPEC §17.2 kinds → the closest CLUE_TYPE). */
export function vaultClueType(kind: VaultKind): ClueType {
  switch (kind) {
    case 'plate': return 'plate';
    case 'house_number': return 'house_number';
    case 'street_name': case 'area_name': return 'street_sign';
    case 'descriptor': return 'uniform_or_lanyard';
    case 'phone': return 'other';
    default: return 'name_text';
  }
}

const REGEX_TYPE: Readonly<Record<RegexKind, ClueType>> = { plate: 'plate', house_number: 'house_number', phone: 'other' };

const baseClue = (id: string, box: PxRect): Omit<Clue, 'source' | 'type' | 'maskReason'> => ({
  id, readers: 'tier0', box, boxPrecision: 'exact', severity: 'high', removable: true, vaultHits: [], masked: true,
  userUnmasked: false,
});

/**
 * Faces, vault hits and regex flags → findings (pure). Every Tier-0 finding is masked in both modes (SPEC SCR-06
 * pre-tick table rows 1–4); core/pretick re-applies that. A vault hit is one clue per matched word span (two terms
 * on the same span share it, and a second OCR reading of the same item, same vault id with an overlapping box, joins it); a regex hit whose words all lie inside a vault span is the same text and is dropped, and
 * two regex hits of the same kind and text whose boxes overlap (two OCR readings) become one flag over both.
 */
export function tier0Findings(faces: readonly PxRect[], words: readonly OcrWord[], hits: readonly VaultWordHit[], imageHeight: number): Tier0Finding[] {
  const out: Tier0Finding[] = [];
  let n = 0;
  const nextId = () => `t0-${++n}`;
  for (const f of faces) {
    out.push({ clue: { ...baseClue(nextId(), { x: f.x, y: f.y, w: f.w, h: f.h }), source: 'tier0_face', type: 'face', maskReason: 'face' } });
  }
  const bySpan = new Map<string, Tier0Finding & { vaultKinds: VaultKind[] }>();
  const covered = new Set<number>();
  for (const h of hits) {
    for (const [a, b] of h.spans) {
      const idx: number[] = [];
      for (let i = Math.max(0, a); i <= Math.min(words.length - 1, b); i++) idx.push(i);
      if (idx.length === 0) continue;
      const key = `${idx[0]}-${idx[idx.length - 1]}`;
      const box = unionRect(idx.map((i) => words[i].box));
      // the same span, or another OCR reading of the same item (same vault id, overlapping box: D-81's union)
      const known = bySpan.get(key)
        ?? [...bySpan.values()].find((f) => f.clue.vaultHits.includes(h.term.vaultId) && overlaps(f.clue.box, box));
      if (known && !bySpan.has(key)) {
        known.clue.box = unionRect([known.clue.box, box]);
        for (const i of idx) covered.add(i);
      }
      if (known) {
        if (!known.clue.vaultHits.includes(h.term.vaultId)) known.clue.vaultHits.push(h.term.vaultId);
        if (!known.vaultKinds.includes(h.term.kind)) known.vaultKinds.push(h.term.kind);
        continue;
      }
      for (const i of idx) covered.add(i);
      const f = {
        clue: {
          ...baseClue(nextId(), box), source: 'tier0_ocr_vault' as const,
          type: vaultClueType(h.term.kind), maskReason: 'vault_text' as const, vaultHits: [h.term.vaultId],
          localText: idx.map((i) => words[i].text).join(' '),
        },
        vaultKinds: [h.term.kind],
      };
      bySpan.set(key, f);
      out.push(f);
    }
  }
  const regexSeen: Tier0Finding[] = [];
  for (const r of regexFlags(words, imageHeight)) {
    if (r.words.length > 0 && r.words.every((i) => covered.has(i))) continue;
    // The OCR union (D-81) can keep two readings of the same text a little apart: one flag over both, not two rows.
    const twin = regexSeen.find((f) => f.regexKind === r.kind && f.clue.localText === r.text && overlaps(f.clue.box, r.box));
    if (twin) {
      twin.clue.box = unionRect([twin.clue.box, r.box]);
      continue;
    }
    regexSeen.push({
      clue: { ...baseClue(nextId(), r.box), source: 'tier0_regex', type: REGEX_TYPE[r.kind], maskReason: 'regex', localText: r.text },
      regexKind: r.kind,
    });
  }
  out.push(...regexSeen);
  return out;
}

/** Two rects share some area (touching edges do not count). */
const overlaps = (a: PxRect, b: PxRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Run Tier-0 on the master (SPEC SCR-06 W2). Never throws: each step reports running → done (with its count and
 * latency) or failed, and the result lists the failed steps. Faces and OCR run concurrently; the vault step needs the
 * words, so it fails when OCR failed.
 */
export async function runTier0(
  master: HTMLCanvasElement, jpeg: Blob, deps: Tier0Deps, onStep: (r: Tier0StepReport) => void = () => {},
): Promise<Tier0Result> {
  const failed: Tier0StepId[] = [];
  const report = (r: Tier0StepReport) => { try { onStep(r); } catch { /* a UI listener never breaks the pipeline */ } };
  async function timed<T>(step: Tier0StepId, run: () => Promise<T>, count: (v: T) => number | undefined): Promise<T | null> {
    report({ step, status: 'running' });
    const t0 = deps.now();
    try {
      const v = await run();
      report({ step, status: 'done', count: count(v), ms: Math.max(0, Math.round(deps.now() - t0)) });
      return v;
    } catch {
      failed.push(step);
      report({ step, status: 'failed', ms: Math.max(0, Math.round(deps.now() - t0)) });
      return null;
    }
  }

  await timed('metadata', () => deps.assertClean(jpeg), () => undefined);
  const [faces, words] = await Promise.all([
    timed('faces', () => deps.detectFaces(master), (f) => f.length),
    timed('text', () => deps.ocr(master), (w) => w.length),
  ]);
  let hits: readonly VaultWordHit[] | null = null;
  if (words === null) {
    failed.push('vault'); // nothing was read, so nothing was checked against the vault: fail closed
    report({ step: 'vault', status: 'failed' });
  } else {
    hits = await timed('vault', async () => {
      const h = await deps.matchVault(words);
      if (h === null) throw new Error('vault index unavailable');
      return h;
    }, (h) => tier0Findings([], words, h ?? [], master.height).filter((f) => f.clue.source === 'tier0_ocr_vault').length);
  }
  const findings = tier0Findings(faces ?? [], words ?? [], hits ?? [], master.height);
  return {
    findings,
    faces: faces?.length ?? 0,
    words: words?.length ?? 0,
    vaultMatches: findings.filter((f) => f.clue.source === 'tier0_ocr_vault').length,
    failed: TIER0_STEPS.filter((s) => failed.includes(s)),
  };
}
