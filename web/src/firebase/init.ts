// web/src/firebase/init.ts: Firebase boot in the mandatory order (ARCH §15.1, API-NOTES §1.2).
// @firebase/ai's AIService captures App Check and Auth ONCE when constructed: if getAI() ran first, AI requests would
// go out without X-Firebase-AppCheck / Authorization headers and the enforced App Check would reject them (AC-291).
// This is the ONLY file allowed to call initializeApp / initializeAppCheck / getAuth / getAI (check-boundaries R3).
import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { firebaseConfig, RECAPTCHA_ENTERPRISE_SITE_KEY } from './config';

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined; // not in the public typings [VERIFIED: src]
}

export const app = getApps()[0] ?? initializeApp(firebaseConfig); // reuses the app on hot reload

/**
 * DEV only: the App Check debug token from web/.env.development.local (gitignored, never in builds: `import.meta.env.DEV`
 * is a build-time false in production, so this branch and the variable are removed). Set AFTER initializeApp and BEFORE
 * initializeAppCheck (SPEC AC-291). `?appcheck-debug=off` (DEV only) skips it, to prove that enforcement rejects calls
 * without a valid token (T-030).
 */
const skipDebugToken = import.meta.env.DEV && new URLSearchParams(self.location.search).get('appcheck-debug') === 'off';
if (import.meta.env.DEV && !skipDebugToken) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true; // BEFORE initializeAppCheck
}

export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true, // the default is FALSE
});
export const auth = getAuth(app); // after App Check, before getAI

/**
 * The longest one sign-in attempt may take. Auth's own start-up waits on IndexedDB with no timeout, so a hung
 * IndexedDB would otherwise leave every later cloud call waiting on one promise that never settles (F-160).
 */
export const AUTH_TIMEOUT_MS = 5_000; // SPEC §7.1 step 4: the gate waits for Auth up to 5 s
let signingIn: Promise<string | null> | null = null;
/**
 * The anonymous UID, signing in if needed: resolves null when sign-in fails (offline, provider disabled) or takes longer
 * than AUTH_TIMEOUT_MS, and never rejects. Concurrent calls share one attempt, and a failed or timed-out attempt is
 * retried by the NEXT call, so a session that started offline can still reach the cloud once it is back online (D-110).
 * The gate awaits this before every cloud call (AC-291; null → CLOUD_AUTH, copy.err.auth). `signInAnonymously` returns
 * the persisted anonymous user instead of creating a new one (API-NOTES §2.3).
 */
export function ensureAuth(): Promise<string | null> {
  const user = auth.currentUser;
  if (user) return Promise.resolve(user.uid);
  if (!signingIn) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = signInAnonymously(auth).then((cred) => cred.user.uid, () => null);
    const timeout = new Promise<null>((res) => { timer = setTimeout(() => res(null), AUTH_TIMEOUT_MS); });
    signingIn = Promise.race([attempt, timeout]).finally(() => {
      clearTimeout(timer);
      signingIn = null;
    });
  }
  return signingIn;
}
/** The first sign-in attempt, started here so the UID is usually ready before the first cloud call. */
export const authReady: Promise<string | null> = ensureAuth();
export const ai = getAI(app, { backend: new GoogleAIBackend() }); // useLimitedUseAppCheckTokens: off (latency)

/** True when this DEV session deliberately runs without the debug token (enforcement test). */
export const appCheckDebugSkipped = skipDebugToken;
