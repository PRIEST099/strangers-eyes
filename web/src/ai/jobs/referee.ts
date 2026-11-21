// web/src/ai/jobs/referee.ts: the on-device referee (S0, nanoRef.v1; SPEC SCR-09, D-09; ARCH §10.9, §12.1; T-074).
// Compares pass B's claims with the vault ON THIS DEVICE and returns the matches the verdict is built from:
//   1. CLAIMS = refereeClaims(pass B) (inferences, then hypotheses as 'area'), at most 12; VAULT = refereeVaultItems
//      (labels and aliases only, generic pins dropped, never coordinates), at most 20. Both get short per-call aliases
//      (c1.., v1..; D-145) that are the ONLY ids in the prompt and in the runtime enums; answers map back to the local
//      ids, so an invented or attacker-chosen id can never reach the verdict.
//   2. The request goes through the Egress Gate as class S0: ONLY_ON_DEVICE with a fresh availability() check, and the
//      deterministic path is the rules referee. No Nano (or Nano off, a tripwire, a timeout, unreadable output) → the
//      gate itself answers RULES_ONLY from `deterministic`; it never sends an S0 byte to the cloud (invariant 3).
//   3. A device answer is validated strictly (parseRefereeText): unknown ids, strengths, extra keys or kind pairs that
//      SPEC §17.4 does not allow are dropped (AC-161; D-146); a root that is not {matches: [...]} is a ParseError, which
//      the gate turns into one retry and then RULES_ONLY "fallback: invalid output".
//   4. The device matches are unioned with the rules referee (mergeMatches: the stronger strength per pair, '+rules').
// If either list is empty the device call is skipped (an empty enum is an invalid schema) and the rules decide.
// Never throws: any gate failure ends in the rules result, labelled honestly (RefereeOutcome.fallback).
// LOCAL ONLY: vault labels, the prompt and the device's reasons stay in memory on this device; nothing is logged,
// persisted or sent. Never calls the SDK: the gate is the only door (invariant 4); `run` is injectable for tests.
import enums from '@prompts/enums.v1.json';
import type { AdversaryResult, ClaimKind, RefereeMatch, VaultItem, VaultKind } from '../../core/types';
import { STRENGTHS } from '../../core/types';
import {
  KIND_COMPAT, isGenericLabel, mergeMatches, refereeClaims, refereeVaultItems, rulesReferee,
  type RefereeClaim, type RefereeVaultItem,
} from '../../core/referee';
import { gate as appGate, type GateRequest, type GateResult } from '../egressGate';
import { GateError } from '../errors';
import { ParseError } from '../parse';
import { render, type PromptSegment } from '../prompts';
import { refereeSchema } from '../schemas';

export const NANO_REF_PROMPT = 'nanoRef.v1';
/** SPEC SCR-09: at most 12 claims and 20 vault items in one prompt; the schema allows at most 12 matches. */
export const MAX_CLAIMS = 12;
export const MAX_VAULT = 20;
export const MAX_MATCHES = 12;
/** A claim value is pass-B text: cut long values so the prompt fits Nano's context. */
export const MAX_CLAIM_CHARS = 160;
/** SPEC SCR-09: the referee's reason is at most 12 words (longer device text is cut, never shown whole). */
export const MAX_REASON_WORDS = 12;

const PROMPT_KIND_OF = enums.PROMPT_KIND_OF as Readonly<Record<VaultKind, string>>;
const STRENGTH_SET: ReadonlySet<string> = new Set(STRENGTHS);
const RANK: Readonly<Record<string, number>> = { exact: 3, likely: 2, possible: 1 };

/** What the prompt carries, and how its aliases map back. LOCAL ONLY. */
export interface RefereePrompt {
  claims: { id: string; kind: ClaimKind; value: string }[];
  vault: { id: string; kind: string; label: string }[];
  /** prompt claim id (c1..) → the claim (its pass-B id, kind and clue ids) */
  claimOf: ReadonlyMap<string, RefereeClaim>;
  /** prompt vault id (v1..) → the item (its LOCAL id and kind) */
  itemOf: ReadonlyMap<string, RefereeVaultItem>;
}

/**
 * The nanoRef.v1 inputs (ARCH §10.8–10.9): claims as {id, kind, value}, vault items as {id, kind, label} with the
 * prompt kind (PROMPT_KIND_OF) and the label and aliases joined with " / ". No coordinates exist in either list
 * (AC-162): pins enter as kind + label only, and hypotheses as their label. null when either list is empty.
 */
export function refereePrompt(claimsIn: readonly RefereeClaim[], itemsIn: readonly RefereeVaultItem[]): RefereePrompt | null {
  const claimsAll = claimsIn.filter((c) => c.value.trim() !== '').slice(0, MAX_CLAIMS);
  // Eligibility re-checked here (as refereeVaultItems does), and only {id, kind, label, aliases} is kept: a raw item's
  // coordinates can never reach the prompt.
  const items: RefereeVaultItem[] = itemsIn
    .filter((v) => !isGenericLabel(v.label))
    .map((v) => ({ id: v.id, kind: v.kind, label: v.label, aliases: v.aliases.filter((a) => !isGenericLabel(a)) }))
    .slice(0, MAX_VAULT);
  if (claimsAll.length === 0 || items.length === 0) return null;
  const claimOf = new Map<string, RefereeClaim>();
  const itemOf = new Map<string, RefereeVaultItem>();
  const claims = claimsAll.map((c, k) => {
    const id = `c${k + 1}`;
    claimOf.set(id, c);
    return { id, kind: c.kind, value: c.value.slice(0, MAX_CLAIM_CHARS) };
  });
  const vault = items.map((v, k) => {
    const id = `v${k + 1}`;
    itemOf.set(id, v);
    return { id, kind: PROMPT_KIND_OF[v.kind] ?? 'other', label: [v.label, ...v.aliases].join(' / ') };
  });
  return { claims, vault, claimOf, itemOf };
}

/** The rendered user turn (template text static, the two JSON lists dynamic). */
export const refereeText = (p: RefereePrompt): PromptSegment[] =>
  render(NANO_REF_PROMPT, { CLAIMS_JSON: p.claims, VAULT_JSON: p.vault });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ITEM_KEYS = new Set(['claim_id', 'vault_id', 'strength', 'reason']);

/** At most MAX_REASON_WORDS words, whitespace collapsed. */
export function shortReason(s: string): string {
  return s.trim().split(/\s+/u).filter(Boolean).slice(0, MAX_REASON_WORDS).join(' ');
}

/**
 * The device answer → validated matches with LOCAL ids (AC-161). Throws ParseError only when the answer is not JSON or
 * its root is not {matches: array}; inside, every item that is not exactly {claim_id, vault_id, strength, reason} with
 * known ids, a known strength, a string reason and a kind pair SPEC §17.4 allows is dropped. One match per pair (the
 * stronger), at most MAX_MATCHES, in answer order. route is ON_DEVICE (the gate's route is re-checked by the caller).
 */
export function parseRefereeText(raw: string, p: RefereePrompt): RefereeMatch[] {
  let j: unknown;
  try { j = JSON.parse(raw); } catch { throw new ParseError('referee: not JSON'); }
  if (!isObj(j) || !Array.isArray(j.matches)) throw new ParseError('referee: expected {matches: [...]}');
  const out = new Map<string, RefereeMatch>();
  for (const m of j.matches.slice(0, MAX_MATCHES)) {
    if (!isObj(m) || Object.keys(m).some((k) => !ITEM_KEYS.has(k))) continue;
    const { claim_id: cid, vault_id: vid, strength, reason } = m;
    if (typeof cid !== 'string' || typeof vid !== 'string' || typeof strength !== 'string' || typeof reason !== 'string') continue;
    const claim = p.claimOf.get(cid);
    const item = p.itemOf.get(vid);
    if (!claim || !item || !STRENGTH_SET.has(strength)) continue;
    if (!Object.hasOwn(KIND_COMPAT, claim.kind) || !KIND_COMPAT[claim.kind].includes(item.kind)) continue; // D-146
    const key = `${claim.id}\u0000${item.id}`;
    const prev = out.get(key);
    if (prev && RANK[prev.strength] >= RANK[strength]) continue;
    out.set(key, {
      claimId: claim.id, vaultId: item.id, strength: strength as RefereeMatch['strength'], reason: shortReason(reason),
      clueIds: [...claim.clueIds], route: 'ON_DEVICE',
    });
  }
  return [...out.values()];
}

/** Why the rules decided: no call (an empty list), Nano not usable (off, absent, a tripwire), or Nano failed this time. */
export type RefereeFallback = 'skipped' | 'no_device' | 'device_failed';

export interface RefereeOutcome {
  matches: RefereeMatch[];
  /** ON_DEVICE when Nano answered (its matches unioned with the rules); RULES_ONLY otherwise. */
  route: 'ON_DEVICE' | 'RULES_ONLY';
  latencyMs: number;
  ledgerId: string | null;
  /** The gate's notes plus '+rules' when rules matches joined a device answer (Router HUD; never vault text). */
  notes: string[];
  fallback: RefereeFallback | null;
}

export interface RefereeInput {
  sessionId: string;
  adv: Pick<AdversaryResult, 'inferences' | 'hypotheses'>;
  vault: readonly VaultItem[];
  theta?: number;
  signal?: AbortSignal;
  /** May only LOWER RC timeouts_ms.referee (the gate enforces it). */
  timeoutMs?: number;
}
export interface RefereeDeps {
  run?: <T>(req: GateRequest<T>) => Promise<GateResult<T>>;
  clock?: () => number;
}

/** The one request shape the gate accepts for the referee (S0, deviceJson text, runtime enums, rules as the floor). */
export function refereeRequest(i: { sessionId: string; signal?: AbortSignal; timeoutMs?: number }, p: RefereePrompt, rules: readonly RefereeMatch[]): GateRequest<RefereeMatch[]> {
  return {
    job: 'referee', payloadClass: 'S0', sessionId: i.sessionId, judge: null,
    modelSpec: { kind: 'deviceJson', io: 'text', schema: refereeSchema([...p.claimOf.keys()], [...p.itemOf.keys()]) },
    promptId: NANO_REF_PROMPT, text: refereeText(p), images: [],
    parse: (raw) => parseRefereeText(raw, p),
    deterministic: () => rules.map((m) => ({ ...m, clueIds: [...m.clueIds] })),
    ...(i.signal ? { signal: i.signal } : {}), ...(i.timeoutMs !== undefined ? { timeoutMs: i.timeoutMs } : {}),
  };
}

/** Gate RULES_ONLY notes that mean Nano is not usable here (absent, downloading); off, simulated and tripwire have no prefix. */
const NO_DEVICE_NOTES: ReadonlySet<string> = new Set(['fallback: no on-device model', 'fallback: model downloading']);
/** A gate RULES_ONLY note that means Nano was asked and failed this time (timeout, unreadable output, an error). */
export const deviceFailedNote = (n: string): boolean => n.startsWith('fallback:') && !NO_DEVICE_NOTES.has(n);

/** Run the referee. Never throws: every failure is the rules result with `fallback` set. */
export async function referee(i: RefereeInput, deps: RefereeDeps = {}): Promise<RefereeOutcome> {
  const run = deps.run ?? appGate;
  const clock = deps.clock ?? (() => performance.now());
  const t0 = clock();
  const claims = refereeClaims(i.adv);
  const items = refereeVaultItems(i.vault);
  const rules = rulesReferee(claims, items, i.theta);
  const ms = () => Math.max(0, Math.round(clock() - t0));
  const rulesOnly = (fallback: RefereeFallback, notes: string[] = [], ledgerId: string | null = null): RefereeOutcome => ({
    matches: rules, route: 'RULES_ONLY', latencyMs: ms(), ledgerId, notes, fallback,
  });
  const p = refereePrompt(claims, items);
  if (!p) return rulesOnly('skipped');
  try {
    const r = await run(refereeRequest(i, p, rules));
    if (r.route !== 'ON_DEVICE') {
      return rulesOnly(r.notes.some(deviceFailedNote) ? 'device_failed' : 'no_device', [...r.notes], r.ledgerId);
    }
    const merged = mergeMatches(r.value, rules);
    const notes = [...r.notes, ...merged.notes.filter((n) => !r.notes.includes(n))];
    return { matches: merged.matches, route: 'ON_DEVICE', latencyMs: r.latencyMs, ledgerId: r.ledgerId, notes, fallback: null };
  } catch (e) {
    // A gate block or error on an S0 call is a bug or an abort: the rules still decide, and nothing was sent.
    const ledgerId = e instanceof GateError ? e.ledgerId ?? null : null;
    return rulesOnly('device_failed', [e instanceof GateError ? `fallback: ${e.code}` : 'fallback: INTERNAL'], ledgerId);
  }
}
