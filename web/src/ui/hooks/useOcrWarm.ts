// web/src/ui/hooks/useOcrWarm.ts: keep the Tesseract worker warm while the calling screen is mounted (ARCH §18: warm it
// when the Check screen opens; tier0/ocr terminates it 5 min after nothing holds it). tier0/ocr is loaded with a
// dynamic import, so tesseract.js stays out of the initial bundle until Check is opened (T-057).
import { useEffect } from 'react';

export function useOcrWarm(): void {
  useEffect(() => {
    let release: (() => void) | null = null;
    let gone = false;
    void import('../../tier0/ocr')
      .then((m) => { if (!gone) release = m.retainOcr(); })
      .catch(() => undefined); // offline or a failed chunk load: the first real OCR call retries
    return () => {
      gone = true;
      release?.();
    };
  }, []);
}
