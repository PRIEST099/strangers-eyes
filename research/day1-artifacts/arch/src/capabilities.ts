// web/src/ai/capabilities.ts — the ONLY file that reads globalThis.LanguageModel.
import { NANO_IMAGE_IO, NANO_TEXT_IO } from './models';
export type NanoState = 'no-api' | 'unavailable' | 'downloadable' | 'downloading' | 'available';
type LM = { availability(o: object): Promise<Exclude<NanoState, 'no-api'>> };

/** Gate path: a FRESH availability() call every time (SPEC AC-007, D-03). Same createOptions the model uses. */
export async function availabilityNow(io: 'text' | 'image'): Promise<NanoState> {
  const lm = (globalThis as { LanguageModel?: LM }).LanguageModel;
  if (!lm) return 'no-api';
  try { return await lm.availability(io === 'image' ? NANO_IMAGE_IO : NANO_TEXT_IO); } catch { return 'unavailable'; }
}
export const deviceReadyNow = async (io: 'text' | 'image') => (await availabilityNow(io)) === 'available';

/** UI path only (chips, capability panel, HUD Policy tab): cached 30 s, refreshed on visibilitychange. Never used by the gate. */
let uiCache: { at: number; text: NanoState; image: NanoState } | null = null;
export async function uiCapabilities(force = false) {
  if (!force && uiCache && performance.now() - uiCache.at < 30_000) return uiCache;
  uiCache = { at: performance.now(), text: await availabilityNow('text'), image: await availabilityNow('image') };
  return uiCache;
}
