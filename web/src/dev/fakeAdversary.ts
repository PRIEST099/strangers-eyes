// DEV-only fake adversary (__SE_DEV_ONLY__; D-137). Loaded by App.tsx inside `if (import.meta.env.DEV)`, so it is absent
// from production builds (check-dist scans web/dist for the marker). With `?fakeAdv=<mode>` in the page URL, pass B is
// answered here instead of by the SDK; without it, nothing changes. The mode is read on every call, so it can be
// switched with history.replaceState without a reload. Only the MODEL is fake: the Egress Gate still runs every check
// (kill switch, offline, cap, consent, the image re-check, the prompt scan, the Ledger, the echo scan).
// The answers are synthetic (open-ocean test area, invented names): no real people, homes or schools (invariant 9).
// T-080 (D-144): `ok` LOOKS at the image the gate is sending: a high clue whose box is solid black is "not seen", so a
// re-attack on a fixed photo drops that clue and what it supported (the street sign's neighbourhood guess becomes a
// city-level one; the lanyard's workplace inference goes). `okStatic` always gives the full answer (a "Still exposed").
import { devSetFakeAdversary, type DevFakeReply } from '../ai/egressGate';

const OK = {
  audit_status: 'ok',
  scene_summary: 'A street corner with a blue street sign, a bus stop and a lanyard on a bench.',
  clues: [
    { id: 'c1', type: 'street_sign', box_2d: [80, 560, 220, 900], evidence: 'Blue street sign naming a harbour road.', reveals: 'street', severity: 'high', removable: true },
    { id: 'c2', type: 'uniform_or_lanyard', box_2d: [700, 300, 860, 470], evidence: 'Lanyard printed CITY GENERAL HOSPITAL with a red logo.', reveals: 'venue_or_organisation', severity: 'high', removable: true },
    { id: 'c3', type: 'architecture', box_2d: [0, 0, 600, 1000], evidence: 'Pale stone facades with narrow balconies.', reveals: 'city', severity: 'low', removable: false },
  ],
  hypotheses: [
    { id: 'h1', label: 'Harbourside, a coastal city district', level: 'neighbourhood', lat: 0.5, lng: -30.5, radius_km: 1.2, confidence: 'medium', clue_ids: ['c1', 'c3'] },
    { id: 'h2', label: 'Old Town, the same city', level: 'district', lat: 0.55, lng: -30.45, radius_km: 4, confidence: 'low', clue_ids: ['c3'] },
  ],
  inferences: [
    { id: 'i1', kind: 'workplace', value: 'City General Hospital', confidence: 'high', clue_ids: ['c2'] },
    { id: 'i2', kind: 'home_area', value: 'Harbourside neighbourhood', confidence: 'medium', clue_ids: ['c1'] },
  ],
};
/** The answer with the clues in `hidden` removed, as a re-attack on a fixed image would see it. */
export function okAnswerWithout(hidden: ReadonlySet<string>): typeof OK {
  if (hidden.size === 0) return OK;
  const clues = OK.clues.filter((c) => !hidden.has(c.id));
  const ids = new Set(clues.map((c) => c.id));
  const visible = (xs: string[]) => xs.every((id) => ids.has(id));
  const hypotheses = hidden.has('c1')
    ? [{ id: 'h1', label: 'A coastal city', level: 'city', lat: 0.6, lng: -30.3, radius_km: 25, confidence: 'low', clue_ids: ['c3'] }]
    : OK.hypotheses.filter((h) => visible(h.clue_ids));
  return {
    ...OK,
    scene_summary: 'A street corner with blacked-out areas and pale stone facades.',
    clues, hypotheses, inferences: OK.inferences.filter((i) => visible(i.clue_ids)),
  };
}

/** True when most of the box's inner area is solid black in the decoded image (a mask). */
function boxIsBlack(data: ImageData, box: readonly number[]): boolean {
  const [y0, x0, y1, x1] = box.map((v) => v / 1000) as [number, number, number, number];
  let dark = 0;
  let n = 0;
  for (let i = 1; i < 12; i++) {
    for (let j = 1; j < 12; j++) {
      const x = Math.floor((x0 + ((x1 - x0) * (0.2 + (0.6 * j) / 12))) * data.width);
      const y = Math.floor((y0 + ((y1 - y0) * (0.2 + (0.6 * i) / 12))) * data.height);
      const k = (y * data.width + x) * 4;
      n++;
      if ((data.data[k] ?? 255) < 40 && (data.data[k + 1] ?? 255) < 40 && (data.data[k + 2] ?? 255) < 40) dark++;
    }
  }
  return n > 0 && dark / n >= 0.9;
}

async function hiddenClues(imagesBase64: readonly string[]): Promise<Set<string>> {
  const b64 = imagesBase64[0];
  if (!b64) return new Set();
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  try {
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    if (!ctx) return new Set();
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return new Set(OK.clues.filter((cl) => cl.severity === 'high' && boxIsBlack(data, cl.box_2d)).map((cl) => cl.id));
  } finally {
    bmp.close();
  }
}

const empty = (status: string, extra: Record<string, string> = {}) =>
  JSON.stringify({ audit_status: status, scene_summary: 'An indoor scene with plain walls.', clues: [], hypotheses: [], inferences: [], ...extra });

export const FAKE_MODES: Readonly<Record<string, DevFakeReply>> = {
  ok: { text: JSON.stringify(OK), textFor: async (imgs) => JSON.stringify(okAnswerWithout(await hiddenClues(imgs))), delayMs: 1200 },
  okStatic: { text: JSON.stringify(OK), delayMs: 1200 },
  noSignal: { text: empty('no_location_signal'), delayMs: 800 },
  declined: { text: empty('declined', { decline_reason: 'The request looks inappropriate.' }), delayMs: 800 },
  blocked: { refuse: true, delayMs: 800 },
  truncated: { text: '{"audit_status":"ok","scene_summary":"A str', finishReason: 'MAX_TOKENS', delayMs: 800 },
  unreadable: { text: 'I would rather not describe this photo.', delayMs: 800 },
  network: { network: true, delayMs: 300 },
  server: { status: 503, delayMs: 300 },
  quota: { status: 429, delayMs: 300 },
  timeout: { hang: true },
};

export function installFakeAdversary(): void {
  devSetFakeAdversary(() => {
    const mode = new URLSearchParams(self.location.search).get('fakeAdv');
    return mode ? FAKE_MODES[mode] ?? { status: 400 } : null; // an unknown mode is a 400, never the real model
  });
}
