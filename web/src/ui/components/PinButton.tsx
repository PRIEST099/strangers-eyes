// web/src/ui/components/PinButton.tsx: "Pin this place" (SPEC SCR-04 step 3, API-NOTES §5.7). One read of the device
// position through vault/geolocation (high accuracy, 15 s timeout, maximumAge 0). The fix goes to the parent form and
// from there only into the sealed vault: it is never shown as coordinates (D-92) and never sent anywhere. No map, no
// geocoding. Failures show copy.vault.pinDenied / copy.vault.pinTimeout in an always-mounted polite live region; the
// parent offers "Enter coordinates I know" next to it. No console here (SR-15).
import { useEffect, useRef, useState } from 'react';
import { t } from '../../core/strings';
import type { Pin } from '../../core/types';
import { currentPin, GEO_FAILURE_COPY, GeolocationFailure, type GeoFailureReason } from '../../vault/geolocation';
import { Button } from './Button';

export interface PinButtonProps {
  /** A fresh fix (lat, lng, accuracy), for the parent to keep until Save. */
  onPin: (pin: Pin) => void;
  /** Denied, timed out or unavailable (after the message is shown). */
  onFailure?: (reason: GeoFailureReason) => void;
  /** The position read (tests inject one); defaults to the browser's geolocation. */
  locate?: () => Promise<Pin>;
  /** Extra description ids for the button (the pin help text, the field error). */
  describedBy?: string;
}

type PinState = { phase: 'idle' } | { phase: 'locating' } | { phase: 'failed'; reason: GeoFailureReason };
const IDLE: PinState = { phase: 'idle' };

/** The failure reason of whatever `locate` rejected with (anything unexpected is `unavailable`). */
export const failureReason = (e: unknown): GeoFailureReason => (e instanceof GeolocationFailure ? e.reason : 'unavailable');

export function PinButton({ onPin, onFailure, locate = currentPin, describedBy }: PinButtonProps) {
  const [state, setState] = useState<PinState>(IDLE);
  const alive = useRef(true);
  const run = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const locating = state.phase === 'locating';
  const start = () => {
    if (locating) return;
    const my = ++run.current;
    setState({ phase: 'locating' });
    locate().then(
      (pin) => {
        if (!alive.current || my !== run.current) return;
        setState(IDLE);
        onPin(pin);
      },
      (e: unknown) => {
        if (!alive.current || my !== run.current) return;
        const reason = failureReason(e);
        setState({ phase: 'failed', reason });
        onFailure?.(reason);
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        className="self-start"
        onClick={start}
        aria-disabled={locating || undefined}
        aria-busy={locating || undefined}
        aria-describedby={describedBy}
      >
        {t(locating ? 'ui.vault.pin.locating' : 'ui.vault.pin.button')}
      </Button>
      <p aria-live="polite" className={state.phase === 'failed' ? 'text-sm font-medium text-verdict-amber' : 'sr-only'}>
        {state.phase === 'failed' ? t(GEO_FAILURE_COPY[state.reason]) : ''}
      </p>
    </div>
  );
}
