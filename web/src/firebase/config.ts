// web/src/firebase/config.ts: the Firebase web config (ARCH §3.1, §15). NOT secret: Firebase web API keys identify
// the project and are protected by App Check, Auth and security rules, not by secrecy (CLAUDE.md invariant 10).
// Source: `firebase apps:sdkconfig WEB 1:320898500558:web:a71a1817cde2f1775f0d9f` (T-025, Nov 20). Only firebase/init.ts imports this.
// Secrets (App Check debug tokens) never go here: they live in web/.env.development.local (gitignored).

export const firebaseConfig = {
  apiKey: "AIzaSyD7qSjIQNZFl8XXMpZRRQr8D2Z4Z99LMhI",
  authDomain: "strangers-eyes.firebaseapp.com",
  projectId: "strangers-eyes",
  storageBucket: "strangers-eyes.firebasestorage.app",
  messagingSenderId: "320898500558",
  appId: "1:320898500558:web:a71a1817cde2f1775f0d9f",
} as const;

/** reCAPTCHA Enterprise SITE key for App Check (public). Empty until the USER creates it (T-011). */
export const RECAPTCHA_ENTERPRISE_SITE_KEY = '';
