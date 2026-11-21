// DEV-only fake adversary (__SE_DEV_ONLY__; D-137). Loaded by App.tsx inside `if (import.meta.env.DEV)`, so it is absent
// from production builds (check-dist scans web/dist for the marker). With `?fakeAdv=<mode>` in the page URL, pass B is
// answered here instead of by the SDK; without it, nothing changes. The mode is read on every call, so it can be
// switched with history.replaceState without a reload. Only the MODEL is fake: the Egress Gate still runs every check
// (kill switch, offline, cap, consent, the image re-check, the prompt scan, the Ledger, the echo scan).
// The answers are synthetic (open-ocean test area, invented names): no real people, homes or schools (invariant 9).
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
const empty = (status: string, extra: Record<string, string> = {}) =>
  JSON.stringify({ audit_status: status, scene_summary: 'An indoor scene with plain walls.', clues: [], hypotheses: [], inferences: [], ...extra });

export const FAKE_MODES: Readonly<Record<string, DevFakeReply>> = {
  ok: { text: JSON.stringify(OK), delayMs: 1200 },
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
