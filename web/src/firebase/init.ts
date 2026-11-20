// web/src/firebase/init.ts: Firebase boot in the mandatory order (ARCH §15.1, API-NOTES §1.2).
// @firebase/ai's AIService captures App Check and Auth ONCE when constructed: if getAI() ran first, AI requests would
// go out without X-Firebase-AppCheck / Authorization headers and the enforced App Check would reject them (AC-291).
// This is the ONLY file allowed to call initializeApp / initializeAppCheck / getAuth / getAI (check-boundaries R3).
import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { firebaseConfig, RECAPTCHA_ENTERPRISE_SITE_KEY } from './config';

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined; // not in the public typings [VERIFIED: src]
}

/**
 * DEV only: the App Check debug token from web/.env.development.local (gitignored, never in builds).
 * `?appcheck-debug=off` (DEV only) skips it, to prove that enforcement rejects calls without a valid token (T-030).
 */
const skipDebugToken = import.meta.env.DEV && new URLSearchParams(self.location.search).get('appcheck-debug') === 'off';
if (import.meta.env.DEV && !skipDebugToken) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true; // BEFORE initializeAppCheck
}

export const app = getApps()[0] ?? initializeApp(firebaseConfig); // reuses the app on hot reload
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true, // the default is FALSE
});
export const auth = getAuth(app); // after App Check, before getAI
export const authReady: Promise<string | null> = new Promise((res) => {
  const off = onAuthStateChanged(auth, (u) => {
    if (u) {
      off();
      res(u.uid);
    }
  });
  signInAnonymously(auth).catch(() => res(null)); // offline → null (copy.err.auth when online)
});
export const ai = getAI(app, { backend: new GoogleAIBackend() }); // useLimitedUseAppCheckTokens: off (latency)

/** True when this DEV session deliberately runs without the debug token (enforcement test). */
export const appCheckDebugSkipped = skipDebugToken;
