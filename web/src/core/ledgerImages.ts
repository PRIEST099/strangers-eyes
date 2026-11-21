// web/src/core/ledgerImages.ts: the exact redacted JPEGs handed to the gate for a cloud send, kept IN MEMORY for this
// page only so the Ledger rail can show "What the cloud saw" (SPEC SCR-15, D-148). Each blob is keyed by the sha256 of
// its OWN bytes, computed here, so a thumbnail is shown only when that hash equals a Ledger entry's `imageSha256`, the
// hash the gate computed from the bytes it checked and sent (AC-230). Nothing here is persisted or sent anywhere.
// Only consented cloud payloads (already redacted, EXIF-free, face- and vault-checked) are ever registered: never the
// original photo or the on-device nano768 copy. The newest few are kept; Burn vault and Clear history call clear().

/** Attack 1 plus a couple of re-attacks: enough for the rail (the earlier-sends selector is P1, D-33). */
export const SENT_IMAGES_MAX = 4;

export interface SentImageStore {
  /** Hashes `jpeg` and keeps it under that hash. Resolves to the hash. */
  remember(jpeg: Blob): Promise<string>;
  get(sha256: string): Blob | null;
  subscribe(listener: () => void): () => void;
  /** Bumped on every change (for useSyncExternalStore). */
  version(): number;
  clear(): void;
}

export async function sha256OfBlob(b: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function createSentImageStore(max = SENT_IMAGES_MAX, hash: (b: Blob) => Promise<string> = sha256OfBlob): SentImageStore {
  const map = new Map<string, Blob>(); // insertion order = age
  const listeners = new Set<() => void>();
  let v = 0;
  const emit = () => { v++; for (const l of [...listeners]) l(); };
  return {
    async remember(jpeg) {
      const sha = await hash(jpeg);
      map.delete(sha);
      map.set(sha, jpeg);
      while (map.size > max) map.delete(map.keys().next().value as string);
      emit();
      return sha;
    },
    get: (sha) => map.get(sha) ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    version: () => v,
    clear() {
      if (map.size === 0) return;
      map.clear();
      emit();
    },
  };
}

/** The app's store (memory only, this page). */
export const sentImages: SentImageStore = createSentImageStore();
