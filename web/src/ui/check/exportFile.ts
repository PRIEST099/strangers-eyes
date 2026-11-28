// web/src/ui/check/exportFile.ts: the covered copy's filename and how it leaves the page (SPEC SCR-12, T-081, D-185).
// The filename is `strangers-eyes-<6 random chars>.jpg` and never reuses the original filename (AC-262). The file goes
// to the system share sheet where the browser can share files (Web Share API, AC-263), else it is downloaded. Both are
// the user's own action on their own device: nothing here talks to a server.

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** `strangers-eyes-<6 chars>.jpg`, from a CSPRNG (injectable for tests). Never derived from the original name. */
export function exportFilename(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return `strangers-eyes-${s}.jpg`;
}

/** The parts of `navigator` this needs (injectable for tests). */
export interface ShareNav {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[] }) => Promise<void>;
}

/** True when this browser can hand a JPEG file to the system share sheet. */
export function canShareFile(nav: ShareNav | undefined, file: File): boolean {
  try {
    return !!nav?.share && !!nav.canShare && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Share the file; 'cancelled' when the user closed the sheet, 'failed' when the browser refused. */
export async function shareFile(nav: ShareNav, file: File): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await nav.share!({ files: [file] });
    return 'shared';
  } catch (e) {
    return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** Download the blob under `name` (a same-page object URL, revoked right after). */
export function downloadBlob(blob: Blob, name: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    doc.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** D-187: the covered copy's longest side: the attacker copy's cap (RC cloud_image_max_px), never more. */
export function coveredCopyMaxPx(cloudImageMaxPx: number | undefined, fallback = 1536): number {
  return Number.isFinite(cloudImageMaxPx) && (cloudImageMaxPx as number) > 0 ? (cloudImageMaxPx as number) : fallback;
}
