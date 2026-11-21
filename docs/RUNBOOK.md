# RUNBOOK: Strangers' Eyes operations manual

> Covers setup, local development, on-device model checks, deploys, the benchmark, filming, submission and troubleshooting.
> **Edition:** final version, written Thu 2026-11-19 (Day 0 evening; SPEC §0.3 numbering). Sources: `PLAN.md`, `research/winner-spec.md`, the six verified research reports, and the cross-doc review.
> **Keep it current.** When a step gets verified or changes, edit it here in the same session and add one line to `docs/PROGRESS.md`.
> **Read only the section you need** (see the map below). The full doc set is roughly 130k tokens. A session that reads all of it at start-up will hit compaction before it writes any code.

### Read map
| You are about to... | Read |
|---|---|
| Remind the human of a step, or do one | §1.0, then the § it points to |
| Start the very first coding session | §2.1 (Day-1 research artifacts, rescued Nov 19), §2.2 |
| Scaffold or run the web app, or run tests | §2.3–§2.6 |
| Build or run the iOS app | §2.7–§2.10 |
| Check Gemini Nano or Apple Foundation Models | §3 |
| Deploy anything to Firebase | §4 |
| Run the Day-1 go/no-go spike or the benchmark | §5 |
| Prepare or record the demo video | §6 |
| Write the README, Devpost text, or submit | §7 |
| Something is broken | §8 |

---

## How to use this file

### Tags
- **[USER]**: only the human can do this. That covers console sign-ins, billing, tokens, Chrome and macOS settings, photos, voice, YouTube and Devpost. Claude reminds the user, gives the exact steps, and works on something unblocked in the meantime. Claude never types passwords or secrets into web forms.
- **[CLAUDE]**: the coding agent does this, usually from the terminal.
- **[UNVERIFIED]**: comes from docs, typings or reasoning, but nobody has run it on this machine yet. Verify it, remove the tag, and log the result in `docs/PROGRESS.md`. Where API-NOTES has an ID for the item, it is given (for example U-10).
- **[DECISION]**: needs the user's yes in chat. Record the outcome in the PROGRESS Decisions log. Use the next free D-number (D-40 or later). Never reuse or renumber SPEC `D-xx` or ARCH `AD-xx` IDs.

### Placeholders
`PROJECT_ID`, `WEB_APP_ID`, `IOS_APP_ID`, `BUNDLE_ID`, `SITE_KEY`, `HOSTED_URL`, `REPO_URL`, `YOUTUBE_URL`. Real values go in the **Key values** table in `docs/PROGRESS.md`, and only non-secret values may go there.

### Shorthands (the same as `docs/TASKS.md`)
| Shorthand | Meaning |
|---|---|
| `ROOT` | `/Users/mac/Documents/firebase buildathon` |
| `$FB` | `npx -y firebase-tools@15.37.0` (pinned; no global install) |
| `$FB13` | `npx -y firebase-tools@13.35.1`, for **emulators only** (CLI 15.x refuses Java 17) |
| `PRIV` | `/Users/mac/StrangersEyes-private/`. It sits **outside the repo** and holds real photos, `truth.csv`, labels, raw results and raw video clips |
| `SIM` | iPhone 18 Pro, iOS 27.0 runtime, UDID `E950C8A0-185D-40BF-8A62-C113655C0557` |
| `.scratch/` | Project-local, gitignored temp folder for screenshots, Remote Config dumps and headless Chrome profiles |

Shell variables do **not** persist between Claude's Bash calls. Begin each command with its definitions, for example `FB="npx -y firebase-tools@15.37.0"; $FB projects:list`, or write the command out in full.

### Which doc wins
1. `CLAUDE.md` invariants.
2. The Decisions log in `docs/PROGRESS.md` (a logged decision beats doc text until the affected doc is edited in the same session).
3. `docs/SPEC.md`: product behaviour and acceptance criteria (AC-xxx, three digits).
4. `docs/ARCHITECTURE.md`: file paths, types, prompts, Remote Config key names, and config file bodies. Once a config file exists in the repo (`firebase.json`, `firestore.rules`, `remoteconfig.template.json`), **the repo file is canonical** and the docs point to it.
5. `docs/API-NOTES.md`: how the SDKs really behave.
6. This RUNBOOK: procedures, meaning who does what, in what order, and with which command.
7. `docs/TASKS.md`: plan, order and due dates.

SDK facts live in `docs/API-NOTES.md`. Task IDs and checkboxes live in `docs/TASKS.md`. Status and history live in `docs/PROGRESS.md`. If this file names a path or key differently from ARCH, ARCH is right; fix this file.

`PLAN.md` and `research/winner-spec.md` are **background only**. Several of their instructions are superseded:
- "temperature 0";
- iOS SDK "≥12.13 / latest";
- pass B reading pass A's notes;
- Firestore holding Judge Mode metadata;
- a Day-1 iOS tool-call spike;
- filming on Nov 30.

### Operating rules that matter most (the full list is in `CLAUDE.md`)
1. Vault data and the original photo never leave the device. S0 and S1 never reach the cloud, even when no on-device model is present.
2. Every Firebase AI Logic call goes through the one Egress Gate, which writes a Ledger entry.
3. Never commit secrets: App Check debug tokens, `.env*.local`, `ios/.appcheck-debug-token`, service-account JSON, or the Firebase CLI token. The Firebase web config and `GoogleService-Info.plist` are not secret.
4. Real photos, truth files, raw results and anything with true coordinates stay in **PRIV, outside the repo**. Never `git add -A` or `git add .`. Add explicit paths and run the pre-commit checks in §2.2.
5. Never commit or film people, a real home, a real school, or real third-party logos.
6. **8 GB rule:** never run Chrome Gemini Nano and the Simulator's Foundation Models at the same time (§2.10, §3.2).
7. Never re-prompt after a refusal. Never pivot the product without the user's yes in chat.
8. Claude never clicks Devpost **Submit** and never accepts terms on the user's behalf.

---

## 0. At a glance

### 0.1 Dates (2026, times GMT+2 unless marked)
| Date | Day | What |
|---|---|---|
| Thu Nov 19 | Day 0 (evening) | Docs final; Day-1 artifacts rescued (done, TASKS T-020; §2.1); repo and PROGRESS; **USER Sitting A (1)** (§1.0) |
| Fri Nov 20 | Day 1 | USER Sitting B (2); web scaffold; spikes G1 (adversary) and G2 (Nano); decision gate (TASKS T-034) |
| Sat Nov 21 | weekend | Props printed; prop-OCR check; walking-skeleton Hosting deploy live (TASKS T-038) |
| Sun Nov 22 | weekend | Scenes shot; Devpost draft created; G3 (iOS) recorded; vertical slice green |
| Tue Nov 24 | | **Gate: full red-to-green web loop works and the egress audit passes** |
| Wed Nov 25 | | **Hosted URL live.** 25 benchmark photos and the gate-test set due. (Google Account Quota Sprint 3 request deadline is 10:00 PT. We don't need it.) |
| Thu–Fri Nov 26–27 | | iOS, benchmark, storyboard-screen polish (Nov 27) |
| Sat Nov 28 | weekend | Filming: web beats in the morning, iOS beats and voice-over in the evening |
| Sun Nov 29 | weekend | Rough cut; **YouTube Public by 18:00 (latest 23:00)**; repo public; Devpost text pasted |
| Mon Nov 30 | | **Submit by 12:00 GMT+2** (internal). Hard deadline is 14:00 PT = 22:00 UTC = Dec 1 00:00 GMT+2 |
| Dec 1–16 | | Freeze: no pushes, no hosting deploys. Site up, free and unrestricted until **Dec 16, 14:00 PT** (end of judging; judging starts Dec 10, 09:00 PT) |
| about Dec 21 | | Winners announced, 12:00 PT |

Pushes made after the deadline are **not evaluated**. Tag the submitted commit and push nothing more to the default branch.

### 0.2 Pins
The canonical pin table is **`docs/API-NOTES.md` §11**. The pins this runbook's commands depend on:
- `firebase` JS **13.4.0** (bundles `@firebase/ai` 3.1.0). `VertexAIBackend` no longer exists; we use `GoogleAIBackend`.
- `firebase-tools` **15.37.0** for deploys, **13.35.1** for emulators (works on Java 17).
- firebase-ios-sdk **exact 12.19.3** (Path A; `HybridModel` was removed in 13.0.0). Path B is 13.2.0.
- Xcode 27.2; iOS deployment target **27.0** (only the 27.0 Simulator runtime is installed).
- Chrome 157.0.8103.79 with v3Nano 2025.06.30.1229.
- Cloud model names come from Remote Config: adversary `gemini-3.8-flash` (A/B candidate `gemini-4-hydrogen`), hybrid cloud side `gemini-3.5-flash-lite`. Avoid `gemini-2.5-*`, `3.6-flash` and `3.7-flash`.
- Vitest is pinned at 5.1.1 (supports Vite 8; verified Nov 19). Playwright: pin the exact version at T-089 [UNVERIFIED].

### 0.3 Machine facts
- Apple M1, **8 GB RAM**, macOS 26.6.2.
- About 135 GB free disk on Nov 19. Chrome needs **≥22 GB free** for Nano and deletes the model below 10 GB. Keep ≥30 GB free.
- Node v26.8.2, Java 17 (Homebrew openjdk@17), `gh` and `ffmpeg` installed.
- **Not installed:** Firebase CLI (use `$FB`), xcodegen, exiftool, iMovie.
- As of Nov 19 the project folder holds only `CLAUDE.md`, `PLAN.md`, `research/` and `docs/SPEC.md`. It is **not a git repo yet**.
- Simulator: SIM (iPhone 18 Pro, iOS 27.0, UDID above).
- The Day-1 research scratchpad was rescued into `research/day1-artifacts/` on Nov 19 (§2.1, TASKS T-020). Cite only those repo paths. The old scratchpad is no longer referenced.

### 0.4 Where things live
| What | Where | In git? |
|---|---|---|
| Real photos (spike, benchmark, scenes, gate-test, prop shots), `truth.csv`, labels, raw benchmark JSON, raw video clips | `PRIV/{spike,bench,scenes,gate-test,test,raw,video}` | **never** |
| Web App Check debug token | `web/.env.development.local` (holds only that variable) | no |
| iOS App Check debug token | `ios/.appcheck-debug-token` | no |
| Firebase CLI login token | `~/.config/configstore/firebase-tools.json` (never print it) | never |
| Temp files (screenshots, RC dumps, headless profiles) | `ROOT/.scratch/` | no |
| Research evidence rescued from the scratchpad | `research/day1-artifacts/` | yes |
| Copies of third-party docs | `research/_vendor-docs/` | no |
| Judge Mode samples (people-free, EXIF-free; their coordinates accepted by the §1.14 decision) | `web/public/samples/` | yes |
| Non-secret values (project ID, app IDs, bundle ID, site key, URLs) | PROGRESS **Key values** table | yes |
| `benchmark/private/` | only a gitignore backstop; nothing should live there | no |

### 0.5 Glossary
| Term | Meaning |
|---|---|
| S0 / S1 / S2 / S3 / S4 | Payload classes: vault-touching / original photo / public content / adversary / synthetic Judge Mode |
| Egress Gate | The one wrapper around every Firebase AI Logic call. It enforces the class, re-checks the outgoing bitmap and prompt, and writes the Ledger |
| Ledger | Local log of every AI call (bytes, class, model, `inferenceSource`, latency). It feeds the counters "Faces sent: 0 · Vault items sent: 0" |
| Router HUD | Bottom-left log of each call's route (ON_DEVICE / IN_CLOUD / RULES_ONLY / BLOCKED / QUEUED / CACHED) and latency |
| Tier-0 | Deterministic guard: EXIF strip, MediaPipe faces, Tesseract OCR matched against the vault, regex |
| Pass A / Pass B | C1 is grounded, streamed and **display-only**. C2 is ungrounded JSON and feeds the referee. **Pass B never reads pass A.** They run in parallel on the same redacted JPEG |
| W1–W8, I1–I6, C1–C3 | Web, iOS and cloud jobs (SPEC §6.2) |
| G1 / G2 / G3 | Day-1 go/no-go gates: adversary, Chrome Nano, iOS (SPEC §0.3) |

---

## 1. One-time USER actions

### 1.0 USER sittings (do these in order; the user never blocks Claude for long)
Status lives in the TASKS checkboxes and in PROGRESS. This table is the procedure, not the tracker. Sittings 1, 2 and 3–4 here are TASKS §4's Sittings A, B and C (TASKS owns the sitting names and dates).

| Sitting | When (GMT+2) | USER does | TASKS IDs | Then Claude can |
|---|---|---|---|---|
| **1** | **Tonight, Thu Nov 19, about 45 min** | (a) Create the Firebase project and paste its ID (§1.2). (b) Run `firebase login` and `gh auth login` (§1.1). (c) Blaze, budget alert and Gemini paid tier, **or** say "free tier for now" and answer the spike-photo question (§1.3). (d) AI Logic **Get started** with the Gemini Developer API (§1.4). (e) Choose the iOS **bundle ID** (§1.6). (f) Say yes or no to: `brew install xcodegen` (§2.7), and Claude creating a **private** GitHub repo (§1.15). (g) Chrome: On-device AI on, multimodal flag on, relaunch. Connect the Claude-in-Chrome extension to that profile if it's available (§1.13). (h) Photos: at least 10 spike photos into `PRIV/spike/` (§1.14), ideally all 25 now. (i) Confirm Apple Intelligence is still on (§1.12). (j) Answer the Day-1 decisions in chat (TASKS T-018 a–d: filming dates, free-tier spike consent, demo-location exposure, routine commits). (k) Optional: post the Discord questions (§1.16). | T-002, T-005, T-006, T-018, T-019, T-003, T-004, T-013, T-007, T-015 (optional), T-008 (T-009) | Register the web and iOS apps, scaffold, wire Firebase, check Nano |
| **2** | Fri Nov 20 morning, about 15 min, after Claude says "apps registered" | (a) Generate and save the web debug token (§1.7b), and the iOS debug token (§1.7c) once T-027 builds (Sat Nov 21). (b) reCAPTCHA Enterprise key and App Check web registration (§1.7a). Recommended now, latest Nov 25; it does **not** block localhost. (c) Optional now, due by Tue Nov 24 (TASKS T-017, Sitting C): create the Firestore database (§1.9). | T-012, T-011 | Spikes G1–G3, Firestore rules deploy |
| 3 | Sat Nov 21, about 15 min | Print the props (§1.14). Take 2 phone shots of the printed LUCAS tag, people-free, into `PRIV/test/`. | (T-010) | Prop-OCR check, which the forced-leak beat depends on |
| 4 | Sun Nov 22, 1–2 h | Shoot the hero doorstep scene and the 3 Judge Mode scenes (§1.14, §6.2). Answer the **location-disclosure decision** (§1.14). Click Devpost **"Start project"** to create a draft (§7.1). | T-010, T-014 | Judge Mode, 10× pre-tests, read the Devpost fields |
| 5 | By Wed Nov 25, 20:00 | Bring the benchmark set to 25 and shoot the 10-image gate-test set (§1.14). Do the AI Logic hardening when Claude asks (§1.11). Do reCAPTCHA (§1.7a) if not done yet. | T-009, T-111 | Hosted deploy, benchmark |
| 6 | Sat Nov 28 | Morning: record the web beats (Chrome only). Evening: quit Chrome, record the iOS beats, then the voice-over (§6.5). | T-183, T-184, T-185 | Rough cut |
| 7 | Sun Nov 29 | Review Claude's rough cut and request changes or trim it yourself. Upload **Public** to YouTube by 18:00 (latest 23:00). Paste the Devpost text and gallery, but **don't submit**. Approve making the repo public after Claude's scan. | T-186, T-187, T-171, T-170 | Pre-submit checks |
| 8 | Mon Nov 30, by 12:00 | Final review, then **Submit** on Devpost. Tell Claude. | T-190 | Post-submission record |
| — | Dec 1–16 | Keep billing active, watch the budget emails, don't delete or rename the project or keys. | T-192 | Remote Config-only adjustments |

> Console menu names below are the November 2026 layout as the research found it (for example "AI Services > AI Logic", "Security > App Check"). If a label has moved, type the product name into the console search bar.

### 1.1 CLI sign-in [USER]
1. **Firebase CLI.** Run this in your own terminal:
   ```bash
   cd "/Users/mac/Documents/firebase buildathon" && npx -y firebase-tools@15.37.0 login
   ```
   - A browser opens; sign in with the Google account that will own the project.
   - Answer **No** to usage-collection, Gemini-in-CLI and "install agent skills / AI tools" prompts.
   - The token is stored in `~/.config/configstore/firebase-tools.json`. Never print it, paste it into chat, or commit it.
2. **GitHub CLI.** If `gh auth status` says you're not logged in, run `gh auth login` (GitHub.com → HTTPS → browser).
3. Tell Claude "logged in". Claude checks with `npx -y firebase-tools@15.37.0 projects:list` and `gh auth status`.

> **CLI convention for Claude.** Never run interactive `firebase init` or `firebase use --add`.
> - Both prompt for input. `init` may offer to install agent skills, and `init aitools` **edits CLAUDE.md**.
> - Write `.firebaserc` and `firebase.json` by hand instead (§4.1–4.2).

### 1.2 Create the Firebase project [USER]
1. Go to https://console.firebase.google.com and click **Create a project**.
2. Name it `strangers-eyes` and note the generated **Project ID**.
3. **Turn Google Analytics off.**
4. Click **Create project**, then **paste the Project ID to Claude**.

CLI alternative after §1.1: `$FB projects:create PROJECT_ID --display-name "Strangers' Eyes"` [UNVERIFIED on this account].

### 1.3 Blaze plan, Gemini paid tier, budget [USER] [DECISION]
**Why Blaze plus the paid tier:**
- Google Search grounding is "Not available" on the free tier for every Gemini 3+ and 4 model.
- On the free tier, prompts and images may be used to improve Google's products and may be read by human reviewers. That breaks the privacy pitch.
- Users in the EEA, UK and Switzerland may only be served by paid services.

**Steps:**
1. Firebase console → project → plan badge ("Spark", bottom of the left nav) → **Upgrade** → **Blaze**. Link or create a Cloud Billing account and confirm.
   - The $300 trial credits **cannot** be used for the Gemini Developer API.
2. **Budget alert.** Google Cloud console → Billing → **Budgets & alerts** → Create budget, scoped to this project. Set **$25/month** with alerts at 50%, 90% and 100%. Budgets alert you; they do **not** cap spend.
3. **Gemini paid tier** [UNVERIFIED exact UI]:
   - https://aistudio.google.com → Projects → **Import projects** → select this project. Check that it shows the paid tier.
   - If AI Studio asks for a **prepayment**, follow its billing prompt. The research found one is usually required.
   - If AI Studio offers a per-project spend cap, set about $20 [UNVERIFIED].
4. **Paste to Claude:** "Blaze on, paid tier confirmed", or describe what you saw. Claude records it in Decisions.

**Rough costs:**
- 5,000 grounded search queries a month are free across Gemini 3+, then $14 per 1,000.
- Default grounding limit is 1,500 per day per project.
- `gemini-3.8-flash` costs $0.75 per 1M input tokens and $3.75 per 1M output tokens until Dec 31 2026.
- The whole benchmark (about 150–200 ungrounded calls) should cost under $2 [estimate].

**Spike-photo question, asked only if Blaze isn't active when G1 runs (§5.1).** Claude asks in chat:

> "May the 10 redacted, EXIF-free, people-free spike photos be sent on the **free tier**, where Google may use them to improve its products and people may review them?"

Only the user's own yes in chat counts. Without a yes, G1 waits for Blaze. Pass A (grounding) waits for Blaze either way.

**If the user declines Blaze entirely:**
- Set `data_tier=free` and `grounding_enabled=false` in Remote Config. Pass B only runs, and no grounding chips appear.
- The app's consent sheet and the README must state the free-tier terms. Do not market to users in the EEA, UK or CH.
- Log it as a decision. It weakens the Impact and Privacy story.

### 1.4 Enable Firebase AI Logic [USER]
1. Firebase console → **AI Services > AI Logic** → **Get started** → **Gemini Developer API**.
2. Follow the guided workflow. It does three things:
   - enables `generativelanguage.googleapis.com` and `firebasevertexai.googleapis.com`;
   - provisions a Google-managed service account;
   - **auto-enforces App Check for AI Logic**.
3. **Do not create, copy or paste any Gemini API key.** AI Logic stopped using them in July 2026. An old key named "Gemini Developer API key (auto created by Firebase)" can be deleted.
4. **Paste to Claude:** "AI Logic enabled, Developer API".

CLI alternative: `$FB init ailogic` [UNVERIFIED that it replaces the console onboarding, U-16; it is interactive, so the user would run it].

### 1.5 Register the web app [CLAUDE preferred, USER fallback]
**CLI, by Claude after §1.1:**
```bash
FB="npx -y firebase-tools@15.37.0"
$FB apps:create WEB strangers-eyes-web --project PROJECT_ID
$FB apps:sdkconfig WEB WEB_APP_ID --project PROJECT_ID      # → web/src/firebase/config.ts (committed; not secret)
```
**Console fallback:**
1. Project Overview → **+ Add app** → Web. Nickname `strangers-eyes-web`.
2. Leave "Also set up Firebase Hosting" **unchecked**.
3. Click **Register**, copy the `firebaseConfig` object, and paste it to Claude. Skip the SDK steps.

GitHub secret scanning may flag the `AIza…` apiKey. That is expected for Firebase web keys. Optional key restrictions are in §8.7.

### 1.6 Bundle ID and iOS app registration (Day 1; G3 needs it) [DECISION, then CLAUDE or USER]
1. **[DECISION, Sitting A]** Choose the bundle ID. The proposal is **`dev.strangerseyes.app`**.
   - It is fixed once registered, because `GoogleService-Info.plist` is bound to it.
   - Record it in the PROGRESS Key values table.
   - Every command here uses `BUNDLE_ID`.
2. **Register the iOS app:**
   - **CLI (Claude)** [UNVERIFIED flags; run `--help` first]:
     ```bash
     FB="npx -y firebase-tools@15.37.0"
     $FB apps:create IOS strangers-eyes-ios --bundle-id BUNDLE_ID --project PROJECT_ID
     $FB apps:sdkconfig IOS IOS_APP_ID --out ios/StrangersEyes/Resources/GoogleService-Info.plist --project PROJECT_ID
     ```
   - **Console (USER):** Project settings → **Your apps** → **Add app** → **iOS+**. Enter `BUNDLE_ID` and nickname `strangers-eyes-ios`, then **Register**. **Download `GoogleService-Info.plist`** and tell Claude where it landed. Skip the SDK steps.
3. Claude places the plist at **`ios/StrangersEyes/Resources/GoogleService-Info.plist`** (ARCH §19.2). It is committed; it is not secret.

### 1.7 App Check
**1.7a reCAPTCHA Enterprise key for the hosted site [USER].** Recommended in Sitting B. Latest: Nov 25, before the first hosted AI test.
- It only needs the project ID and the registered web app.
- It is **not** needed on localhost, which uses the debug token.
- Until it exists, Claude builds the provider with a placeholder site key in DEV. Whether debug mode tolerates a placeholder key is [UNVERIFIED]. If it errors, do this step first.

Steps:
1. Google Cloud console → **Security → reCAPTCHA** (https://console.cloud.google.com/security/recaptcha; the page may be titled "Fraud Defense"). Select the project and enable the API if asked.
2. **+ Create key**: name `strangers-eyes-web`, type **Web**.
3. Domains: `PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com`.
   - **Never add `localhost`.**
   - Add Hosting preview-channel domains only if you test App Check there (§4.7).
4. Make sure **"Use checkbox challenge" is NOT selected.** App Check needs a score-based key.
5. **Create**, then copy the **key ID**. This is the public site key.
6. Firebase console → **Security > App Check > Apps** → web app → **reCAPTCHA Enterprise** → paste the site key. Leave the default TTL (1 h) and **Save**.
7. **Paste the site key to Claude.** It goes in `web/src/firebase/config.ts` and is committed.

Free quota is 10,000 assessments a month. Keep the default score threshold. The Spark-tier threshold list is disputed (U-47) and moot on Blaze.

**1.7b Web debug token for localhost [USER].** Use a **stable token**: one value that works in every Chrome profile and in Claude's headless test Chrome.
1. **Security > App Check > Apps** (click **Get started** if asked).
2. Web app row ⋮ → **Manage debug tokens** → **Add debug token** → **Generate token**. Name it `mac-dev`, then **Save**.
3. Copy the value. **Don't paste it into chat.** In your own terminal at `ROOT`, run:
   ```bash
   printf 'VITE_APPCHECK_DEBUG_TOKEN=%s\n' "$(pbpaste)" > web/.env.development.local
   ```
   - The `.development.local` suffix means Vite loads it in `dev` only, never in `vite build`.
   - The file is gitignored and holds only this variable.
   - If `web/` doesn't exist yet, run `mkdir -p web` first, or wait until Claude scaffolds it.
4. Tell Claude "web debug token saved". The token is **secret**: never commit it, ship it, or film DevTools while it is visible.

Alternative: auto tokens. With `FIREBASE_APPCHECK_DEBUG_TOKEN = true`, DevTools prints `Firebase App Check debug token: <uuid>`, and the user registers that value. The downside is that every new profile and every cleared site data produces a new token that must be registered again.

**1.7c iOS debug token [USER].** Do this once T-027 builds (Sat Nov 21, a Sitting B follow-up; TASKS §4), because G3 needs it.
1. **Security > App Check > Apps** → iOS app ⋮ → **Manage debug tokens** → **Generate token**. Name it `sim-dev`, then Save.
2. In your terminal: `pbpaste > ios/.appcheck-debug-token` (gitignored; run `mkdir -p ios` first if needed).
3. Claude launches the app with `SIMCTL_CHILD_AppCheckDebugToken="$(cat ios/.appcheck-debug-token)"` (§2.8).
   - Optional, for Xcode GUI runs: a **non-shared** scheme env var `AppCheckDebugToken` (it lives in gitignored `xcuserdata`).
   - Without either, the SDK logs `[AppCheckCore][I-GAC004001] App Check debug token: '…'`, and a reinstall creates a new token.

### 1.8 Anonymous Auth [CLAUDE as code, USER fallback]
- **As code:** `firebase.json` has `"auth": { "providers": { "anonymous": true } }`. Run `$FB deploy --only auth` (VERIFIED Nov 21, U-17, D-126).
- **Console fallback:** **Security > Authentication** → Get started → **Sign-in method** → **Anonymous** → Enable → Save.
- Firebase limits new anonymous sign-ups per IP. The SDK reuses the persisted anonymous user.

### 1.9 Firestore database [USER, by Tue Nov 24; TASKS T-017, Sitting C]
1. Firebase console → **Databases & Storage > Firestore** → **Create database**.
2. Edition **Standard**, database ID **(default)**.
3. Location: pick one near you, for example `europe-west1` or multi-region `eur3`. **It cannot be changed later.**
4. Choose **Start in production mode** (deny all). Claude deploys the real rules (§4.3).
5. **Paste the location to Claude.**

CLI alternative: `$FB firestore:databases:create "(default)" --location europe-west1 --project PROJECT_ID` [UNVERIFIED ID syntax, U-18].

### 1.10 Remote Config first publish [CLAUDE, USER fallback]
- Claude publishes `remoteconfig.template.json` with `$FB deploy --only remoteconfig` (§4.4) (VERIFIED Nov 21, U-17). Until T-003 the live config carries the D-70 free-tier override (§4.4, D-126).
- **Fallback [USER]:** **DevOps & Engagement > Remote Config** → create the first configuration → use the ⋮ menu's publish-from-file option [UNVERIFIED label], or enter the parameters by hand from the template.

### 1.11 AI Logic hardening (Day 6, Nov 25, when Claude asks) [USER]
1. **Check enforcement.** **Security > App Check > APIs** tab: the **Firebase AI Logic** row must say **Enforced**. It has been auto-enforced since 2026-11-02.
   - If not: click the row → Set up → Baseline protection **Enforced**, Replay protection **Disabled**.
   - Allow up to 15 minutes to take effect.
2. **Authenticated-users mode (optional):** **AI Services > AI Logic > Settings** → "Enforce authenticated-users mode".
   - Only do this after Claude confirms web and iOS both sign in anonymously before their first AI call. Otherwise calls fail with 401.
   - Anonymous users count as authenticated. On-device calls are never blocked.
3. **Per-user rate limit → 30 RPM.**
   - Path: Cloud console → **APIs & Services → Firebase AI Logic API → Manage → Quotas & System Limits** → filter "Generate content requests" → **Edit quota** → 30 (default 100).
   - Why 30:
     - The benchmark paces cloud calls at ≥3 s apart, which is ≤20 RPM.
     - A Judge Mode "Run all" peaks at about 8–12 requests a minute (pass A+B, re-attack A+B, and S4 cloud fallbacks for pre-screen, referee and fix).
     - 30 leaves headroom. 10 would cause 429s.
   - The quota is counted per region. How it identifies a "user" (App Check token, Auth UID or IP) is [UNVERIFIED, U-09].
4. **Firestore App Check enforcement (optional).** Only after the APIs tab shows web and iOS requests as verified: same tab → **Cloud Firestore** → Enforce.

### 1.12 Apple Intelligence on the Mac [USER]
- **System Settings → Apple Intelligence & Siri** → on, and wait until the model download finishes.
- Verified on Nov 19: the iOS 27.0 Simulator reports `.available`, variant "AFM 3 Core".

### 1.13 Chrome on-device AI [USER]
1. `chrome://settings/ai` → **On-device AI** on. The exact toggle label is [UNVERIFIED].
2. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → **Relaunch**.
   - Whether this flag is still needed on Chrome 157 is [UNVERIFIED, U-02]; enable it anyway.
   - As of Nov 19, no flags were enabled.
3. Leave `#gemma4-for-built-in-ai` **off** until the optional experiment in §3.3.
4. Keep ≥30 GB free disk (Chrome deletes the model below 10 GB).
5. **Optional, recommended:** if the Claude-in-Chrome extension is installed, connect it to **this** profile. Claude can then run the Nano checks itself (§3.0) instead of asking you to paste snippets.
6. **Only if the web "Pin this place" will use real geolocation:** System Settings → Privacy & Security → Location Services → allow Chrome. The demo and tests use manual coordinates or DevTools → Sensors instead, so this is usually unnecessary.

### 1.14 Photos, props and scenes [USER]
**Rules for every photo:**
- No people, including reflections, passers-by and photos on screens.
- **Never** your real home or a real school.
- No readable car plates or house numbers of homes.
- No real third-party logos where avoidable.
- Builder-owned photos only.
- Everything goes into **PRIV**, never into the repo.

**[DECISION] Location disclosure, before the Nov 22 shoot.** The Judge Mode samples are committed and served publicly. Their fake home and work pins sit near the shoot location, and so do the recorded pass-B JSON, the grounded notes in the video and the demo vault pins. **The shoot city and neighbourhood therefore become public.**
- Shoot at public places **at least a few km from your home, work and any school you're linked to.**
- The sample pins are rounded to 3 decimals (about 100 m).
- Confirm in chat: "I accept that the shoot area becomes public." Claude records it in PROGRESS and adds `web/public/samples/*.json` to the coordinate-scan allowlist (§2.2, §7.2; the only other entries are the synthetic `shared/testvectors/*.json` and lock files, ARCH §3).

**Sets**

| Set | Due | What | Where |
|---|---|---|---|
| Spike | Nov 20, 12:00 | 10 photos. 7–8 of them: street corners, transit stops, shop fronts, public buildings. **2–3 of them: doorstep-style entrances of public buildings**, so the spike also tests refusals on home-like framing. Camera **location ON**: the EXIF GPS is the ground truth, read locally and stripped before any upload. | `PRIV/spike/` (+ `truth.csv` if there is no GPS) |
| Benchmark | Nov 25, 20:00 | 25 photos (spike photos count if they fit the mix): 5 transit stops or signs, 5 street corners with street signs, 5 shop or café fronts, 5 **public or commercial** interiors with a window view, 5 generic architecture or greenery with no text. **No residential housing.** | `PRIV/bench/` + `truth.csv` (§5.2) |
| Gate-test | Nov 25, 20:00 | 10 people-free images at public places with **prop text matching a test vault**: fictional name tags, a printed fictional plate card, fictional house-number cards (SPEC M6). | `PRIV/gate-test/` + `vault.json` (test labels) |
| Prop shots | Nov 21 | 2 phone shots of the printed LUCAS tag, for the OCR check | `PRIV/test/` |
| Scenes | Nov 22 | Hero doorstep scene and the 3 Judge Mode scenes (below) | `PRIV/scenes/` + `truth.csv` |

**Props (print on Sat Nov 21):**
- **"LUCAS" name tag** on a backpack. Bold black sans-serif on white matte paper, letters about 3–4 cm high on a tag of about 10×6 cm. That size should stay readable at 1536 px when the backpack fills about a third of the frame (rule of thumb [UNVERIFIED], hence the Nov 21 OCR check).
- **Lanyard card** with a **fictional logo** (for example a green or blue plus sign) and the generic printed words **"HOSPITAL STAFF"** (SPEC D-39), and no other text and no real logo.
  - **Not a red cross on white**: that is a legally protected emblem.
  - It deliberately carries **no vault text**, so Tier-0 doesn't mask it ("HOSPITAL" is on the SPEC §17.5 generic-word list, so it never counts as a vault match). The attacker can then infer "hospital staff", and the referee rates that **likely** against the vault work label "City General Hospital". The expected verdict line is **"Linked to your WORKPLACE"**, not "Identified … by name".
- **Fictional house-number card.**

**Scenes (Sun Nov 22):** SPEC SCR-17 has the details.
1. **Hero / doorstep-style public entrance:** backpack with the LUCAS tag, lanyard on a hook, a street sign and a bus stop in view. Avoid transit-operator logos.
2. **Marketplace:** an item for sale in a **non-residential** interior with a window view onto a street.
3. **Creator:** an outdoor café table with a blank or fictional-brand cup and a transit sign in the background.

Record in `PRIV/scenes/truth.csv`: fake **home** pin = public building A; fake **work** pin = public place B.

**Fallback if props or scenes are late:** Claude composites a canvas-drawn LUCAS tag and lanyard graphic onto people-free spike photos, labelled synthetic. This is only good enough for development and Judge Mode, not for the hero shot.

### 1.15 GitHub repo [DECISION, then CLAUDE]
Creating the repo is publishing. Claude waits for an explicit yes (Sitting A). The repo is **private now** and goes **public on Sun Nov 29**, after the secret and PII scan (§7.2) and the user's second yes.
```bash
gh repo create strangers-eyes --private --source . --remote origin --push \
  --description "See your photo the way a stalker's AI would, before you post it. Firebase AI Logic hybrid (Web + iOS)."
gh repo view --json licenseInfo,visibility        # right away: licenseInfo should become apache-2.0 (detection may lag)
# Nov 29, after the §7.2 scan AND the user's yes:
gh repo edit --visibility public --accept-visibility-change-consequences
gh repo edit --homepage HOSTED_URL --add-topic firebase --add-topic gemini --add-topic gemini-nano \
  --add-topic apple-foundation-models --add-topic privacy --add-topic hackathon
gh repo view --json licenseInfo,visibility        # must show apache-2.0 and PUBLIC
```

### 1.16 Optional [USER]
- **Discord, by Fri Nov 20 (TASKS T-015).** Ask in #hackathon-help with the #BuildHybridAI tag:
  1. Is iOS **Simulator** footage acceptable?
  2. Are local, non-generative CV/OCR libraries (MediaPipe face detection, Tesseract OCR) fine alongside Firebase AI Logic?

  A "no" to question 2 would affect Tier-0, so ask early. Both are currently assumed yes [UNVERIFIED, U-38/U-39].
- **Firebase Agent Skills plugin for Claude Code.** It changes Claude's configuration, so the user runs it, and it loads in the **next** session:
  ```bash
  claude plugin marketplace add firebase/agent-skills
  claude plugin install firebase@firebase
  ```
  Add only one "firebase" marketplace.
- **Video editor.** iMovie or DaVinci Resolve, both free, if you want to edit yourself. Claude can assemble the cut with `ffmpeg` (§6.8).
- **Prompt API origin trial.** Only if §3.4 finds that Nano is missing on the hosted origin.
- **Google Account Quota (Sprint 3).** Not needed on Blaze, and it expires before judging.

### 1.17 What to paste back to Claude, and what never to paste
| Paste to Claude | Where Claude puts it |
|---|---|
| Project ID | `.firebaserc`, PROGRESS Key values |
| Web `firebaseConfig` (console path only) | `web/src/firebase/config.ts` (committed) |
| reCAPTCHA Enterprise **site key** | `web/src/firebase/config.ts` (committed; public) |
| Bundle ID; downloaded plist path (console path only) | PROGRESS; `ios/StrangersEyes/Resources/GoogleService-Info.plist` (committed) |
| "Debug token saved" (web, iOS) | PROGRESS (the fact only) |
| Blaze and paid-tier status; free-tier spike yes/no; Firestore location | PROGRESS Decisions / Key values |
| "AI Logic Enforced", "auth mode on", new RPM value | PROGRESS |
| Location-disclosure yes | PROGRESS Decisions |
| Repo URL, hosted URL, YouTube URL, Devpost draft URL | PROGRESS Key values, README |

**Never paste** into chat, commits, or web forms Claude fills:
- passwords and one-time codes;
- billing details;
- the App Check **debug token** values (save them to the gitignored files yourself);
- service-account JSON;
- the Firebase CLI token;
- your real home, work or school coordinates.

---

## 2. Local development

### 2.1 Day-1 research artifacts (rescued Nov 19, TASKS T-020) [CLAUDE]
The rescue is done (77 files). On Nov 19 the verified Day-1 reference code was copied out of that session's scratchpad into `research/day1-artifacts/` (committed), and the third-party docs into `research/_vendor-docs/` (gitignored). The old scratchpad is no longer referenced. Cite and port only the repo paths below, and don't import from them. `research/day1-artifacts/README.md` says where each item came from and what it proves.

| Folder (`research/day1-artifacts/…`) | Came from | Use |
|---|---|---|
| `arch/` | `arch2` | **Current** [compiled] ARCH modules and vectors; `remoteconfig.template.json` (generated by `gen.mjs`; history only. It differs from the repo template in the `ocr_max_px` and `auto_mask_types` defaults and in the descriptions of those two keys, `bands_m` and `daily_adversary_cap`; the repo file wins, §4.4); `advB.v1.schema.json` |
| `firestore-tests/` | `rulestest3` | **Current** Leak Atlas rules and test, no `outcomes` block, 20/20 (§2.6 item 2, §4.3) |
| `web-ref/` (+ `tscheck/`) | `app`, `tscheck` | Reference PWA: `src/lib/*.ts`, the selftest, `scripts/copy-assets.mjs` (§2.3), the BlazeFace models |
| `ios-ref/` | `spm12`, `spm13`, `probe` | iOS 12.19.3 and 13.2.0 probes; FM, Vision and metadata probe outputs |
| `harness/` | `harness` | Headless-Chrome CDP harness (§2.6 item 3, §5.3) |
| `arch-ref/`, `firestore-tests-v1/`, `firestore-tests-v2/` | `archcheck`, `rulestest`, `rulestest2` | History only |

Check: `ls research/day1-artifacts` shows these folders and `README.md`.

### 2.2 Repo bootstrap and commit hygiene [CLAUDE]
```bash
cd "/Users/mac/Documents/firebase buildathon"
git init -b main
gh api /licenses/apache-2.0 --jq .body > LICENSE      # unmodified Apache-2.0 text (GitHub license detection)
head -3 LICENSE                                       # "Apache License / Version 2.0, January 2004"
mkdir -p .scratch /Users/mac/StrangersEyes-private/{spike,bench,scenes,gate-test,test,raw,video}
```
If `gh api` fails, use `curl -fsSL https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE`.

Write `.gitignore` **before the first `git add`**:
```
# dependencies and builds
node_modules/
web/dist/
web/public/vendor/
.firebase/
*-debug.log
.DS_Store
# secrets (never commit)
.env
.env.*
!.env.example
!.env.e2e
*.local
.env*.local
ios/.appcheck-debug-token
ios/Config/Secrets.xcconfig
*.secret*
# private-data backstop (real data lives in PRIV, outside the repo)
benchmark/private/
# scratch and third-party copies
.scratch/
research/_vendor-docs/
# iOS
ios/build/
ios/.spm/
DerivedData/
**/xcuserdata/
*.xcuserstate
```
`web/.env.example` and `web/.env.e2e` **are** committed; they hold no secrets. Verify the ignores with:
```bash
git check-ignore -v web/.env.development.local ios/.appcheck-debug-token .scratch/x research/_vendor-docs/x
```

**Commit hygiene (every commit):**
```bash
git status --short
git add <explicit paths>                     # NEVER `git add -A` or `git add .`
git diff --cached --name-only                # read the list
node scripts/check-images.mjs                # (also in `npm --prefix web run check`) image metadata, coordinates, PRIV paths, secrets (D-106)
git diff --cached -U0 | grep -nE '^\+.*-?[0-9]{1,3}\.[0-9]{4,}' || true   # review every coordinate-like hit
git commit -m "T-0xx: <summary>"
```
- Allowed coordinate hits:
  - `web/public/samples/*.json`, only after the §1.14 decision;
  - synthetic or public-city test vectors in `shared/testvectors/`.
- Anything else gets investigated before committing.
- Write `THIRD_PARTY_NOTICES.md` (§7.2) no later than the commit that adds the first third-party binary (the BlazeFace models).
- First commit example: `git add LICENSE .gitignore CLAUDE.md PLAN.md docs research`.

### 2.3 Web scaffold, dependencies and self-hosted assets [CLAUDE]
```bash
cd "/Users/mac/Documents/firebase buildathon"
npx -y create-vite@9.3.4 web --template react-ts --no-immediate --no-interactive   # verified Nov 19 (T-023)
cd web
npm i --save-exact firebase@13.4.0 @mediapipe/tasks-vision@1.2.3 tesseract.js@7.0.0 exifr@7.1.3 idb-keyval@6.3.0
npm i -D --save-exact vite-plugin-pwa@2.0.0 @tesseract.js-data/eng@1.0.0 tailwindcss@4.3.5 @tailwindcss/vite@4.3.5 \
  fake-indexeddb@<current>
npm view vitest version peerDependencies; npm view @playwright/test version   # pick versions that support vite ^8, then:
npm i -D --save-exact vitest@<that> @playwright/test@<that>
```
- `@firebase/rules-unit-testing@6.0.0` (with `firebase-tools@15.37.0` and `firebase@13.4.0`) is a devDependency of the **root** `package.json` (TASKS T-021, ARCH §3), not of `web/`. The rules tests live in the root `tests/rules/` (§2.6).
- **No zod and no react-markdown.** ARCH AD-12 uses hand-written validators and a minimal escaped-Markdown renderer.
- Don't install `tesseract.js-core` separately; tesseract.js 7 pulls in 7.0.0.

**Self-hosted assets** go in **`web/public/vendor/`** (gitignored; versioned folders so the files can be cached as immutable):
- Port `research/day1-artifacts/web-ref/scripts/copy-assets.mjs` to `web/scripts/copy-assets.mjs`. Change only its output folders:
  - `public/mediapipe/wasm` → `public/vendor/mediapipe-1.2.3/wasm`;
  - `public/tesseract/{worker.min.js,core/,lang/}` → `public/vendor/tesseract-7.0.0/{worker.min.js,core/,lang/}`.
- It copies the 2 MediaPipe files, the Tesseract worker, the **3** `*-lstm.wasm.js` cores (v7 loads `relaxedsimd` in Chrome) and `eng.traineddata.gz` (4.0.0_best_int).
- Run it as `predev` and `prebuild`.
- Loaders use `FilesetResolver.forVisionTasks('/vendor/mediapipe-1.2.3/wasm')` (no trailing slash) and Tesseract `corePath: '/vendor/tesseract-7.0.0/core'` (a **directory**).

**Face models** (Apache-2.0, small, **committed**; ARCH names):
```bash
mkdir -p public/models
curl -fsSLo public/models/blaze_face_full_range.tflite https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite
curl -fsSLo public/models/blaze_face_short_range.tflite https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
wc -c public/models/*.tflite     # 1,083,786 and 229,746 bytes
```
Full-range is for street photos; short-range is a fallback only. The same two files are also in `research/day1-artifacts/web-ref/models/`.

**Config:**
- `vite.config.ts`: the canonical shape is ARCH §16, from the verified reference plus `@tailwindcss/vite`. Key gotchas:
  - `globPatterns` is set explicitly. It replaces the defaults and must include js, css and html, plus wasm, tflite, gz, jpg and json. **Do not** add `webmanifest`.
  - `maximumFileSizeToCacheInBytes: 32*1024*1024`.
  - `navigateFallback: 'index.html'`.
  - `runtimeCaching: []`. Never cache googleapis or AI responses.
- `tsconfig.app.json`: add `"vite-plugin-pwa/react"` to `compilerOptions.types`, next to `"vite/client"`.

### 2.4 Config files, env files, init order
| File | Committed? | Contents |
|---|---|---|
| `web/src/firebase/config.ts` | yes | `firebaseConfig` and the reCAPTCHA Enterprise site key (both public) |
| `web/.env.example` | yes | `VITE_APPCHECK_DEBUG_TOKEN=` (empty; documents the variable) |
| `web/.env.e2e` | yes | `VITE_FAKE_AI=1` (only used with `--mode e2e`) |
| `web/.env.development.local` | **no** | `VITE_APPCHECK_DEBUG_TOKEN=<uuid>`, written by the user (§1.7b) |

**Init order is mandatory** (ARCH §15.1). Otherwise AI requests go out without the App Check and Auth headers.
1. `initializeApp`.
2. Set `self.FIREBASE_APPCHECK_DEBUG_TOKEN` (DEV only).
3. `initializeAppCheck({ provider: new ReCaptchaEnterpriseProvider(SITE_KEY), isTokenAutoRefreshEnabled: true })`.
4. `getAuth` + `signInAnonymously`.
5. `getAI(app, { backend: new GoogleAIBackend() })`.
6. Then Remote Config. Firestore is lazy and initialised once (watch out for HMR).

`vite preview` is a production build (`DEV` is false), so it has **no debug token**, and AI calls there fail App Check. That is expected. Test production builds against the hosted site (§4.6).

### 2.5 Web: daily commands [CLAUDE]
Script names follow ARCH §3.1. `check` = typecheck + boundaries + unit tests.
```bash
cd "/Users/mac/Documents/firebase buildathon/web"
npm run dev          # http://localhost:5173 (predev copies vendor assets)
npm run check        # tsc -b && node ../scripts/check-boundaries.mjs && vitest run
npm run build        # tsc -b && vite build -> web/dist (~31 MB precached + samples)
npm run preview      # http://localhost:4173, production build + service worker (no debug token: AI calls fail here)
npm run test:e2e     # Playwright on `vite build --mode e2e` + preview, fake AI transport behind the gate
npm --prefix .. run test:rules   # ROOT package.json script: Firestore rules in the emulator (§2.6)
```
For the Browser pane tools, create `.claude/launch.json` (no secrets; may be committed):
```json
{ "version": "0.0.1", "configurations": [
  { "name": "web-dev", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "web", "run", "dev"], "port": 5173 },
  { "name": "web-preview", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "web", "run", "preview"], "port": 4173 }
] }
```
**Where Nano actually runs:** Claude's Browser pane, Playwright and headless Chrome have **no Nano model**. That makes them good tests of the judges' no-Nano path. Nano checks happen in the **user's own Chrome** (§3.0).

### 2.6 Web: tests
1. **Unit (Vitest, inside `npm run check`).** The Egress Gate must have tests that reject:
   - S0/S1 on any mode that can reach the cloud;
   - S0/S1 without `LanguageModel` or with availability ≠ `'available'` (expected result: RULES_ONLY, and the SDK is never called);
   - vault strings in prompts;
   - images with APP1/APP13, GPS, faces or vault OCR hits;
   - S4 without a sample allowlist match.

   `check-boundaries.mjs` fails on any `generateContent`, `getGenerativeModel`, `getAI` or `LanguageModel` call outside its allowed file.
2. **Firestore rules (emulator; Java 17 works with CLI 13.35.1, and its jar is cached in `~/.cache/firebase/emulators`).** These live in the root **`tests/rules/`** (ARCH §3, §14.4), with their **own** `firebase.json`, so the old CLI never reads the root config (which has `auth` and `remoteconfig` keys the old CLI may reject [UNVERIFIED]).
   - Port from `research/day1-artifacts/firestore-tests/` (the current rules and test: no `outcomes` block, 20/20; `firestore-tests-v2/` is history only):
     - `test.mjs` → `tests/rules/atlas.rules.test.mjs`. Read the rules with `resolve(import.meta.dirname, '../../firestore.rules')`, set `projectId: 'demo-strangers-eyes'`, and **keep** its outcome-rejection cases ('outcomes collection create rejected', 'band outcome doc rejected', 'band type as clue rejected': `outcomes/*`, `outcomes/band_moved`, `clues/fix_moved_band`; §4.3).
   - `tests/rules/firebase.json`:
     ```json
     { "firestore": { "rules": "../../firestore.rules" }, "emulators": { "firestore": { "port": 8181 }, "ui": { "enabled": false } } }
     ```
     A rules path with `../` is [UNVERIFIED]. The test loads the rules itself, so if the CLI rejects the path, drop the `firestore` key or copy the rules file next to the config first.
   - Root `package.json` script (TASKS T-021): `"test:rules": "cd tests/rules && npx -y firebase-tools@13.35.1 emulators:exec --only firestore --project demo-strangers-eyes \"node atlas.rules.test.mjs\""`. Run it with `npm run test:rules` at ROOT.
   - Expected: every case PASS.
     - A create via `setDoc(merge)+increment(1)` is evaluated as `n==1`.
     - `increment(1)` updates pass.
     - These are rejected: `increment(2)`, `increment(-1)`, a literal `n:99`, extra fields, a non-whitelisted type, a bad week ID, an unauthenticated write, a delete, and any other collection, including any `atlas/{weekId}/outcomes/*` document.
     - Public read is OK.
3. **No-Nano smoke (the judges' path).** Headless Chrome 157 against `npm run dev` (which has the debug token), driven through `research/day1-artifacts/harness/` (CDP):
   ```bash
   mkdir -p .scratch/chrome-test
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 \
     --user-data-dir="/Users/mac/Documents/firebase buildathon/.scratch/chrome-test" http://localhost:5173/#/judge
   ```
   Expected: the capability panel says rules-only/cloud, and Judge Mode goes red to green.
4. **E2E (Playwright).**
   - Prefer `channel: 'chrome'`, which uses the installed Chrome with no download [UNVERIFIED on this Mac]. Fallback: `npx playwright install chromium`.
   - Smoke and offline specs per ARCH §20.2. The fake transport only exists with `--mode e2e`.
5. **Offline.** Load once and wait for "Ready to work offline". Then go offline (DevTools → Network → Offline, or CDP `Network.emulateNetworkConditions`) and reload. Expected:
   - the vault, Tier-0, pre-screen and fix work;
   - the cloud step says "Deeper check queued until you're online".
6. **Egress audit** (TASKS T-085; file under `web/tests/e2e/` per ARCH §3.1).
   - Assertions: no canary vault string or pin digits in any request; every outgoing image is a clean JPEG whose hash differs from the original's; the AI request count equals the Ledger's cloud entries; the forced leak makes **zero** requests.

### 2.7 iOS project generation [DECISION]
No `.xcodeproj` exists and xcodegen is not installed. Options, in order of preference:
- **A. XcodeGen (recommended).** The user approves `brew install xcodegen` (a system change). Claude writes `ios/project.yml` and runs `cd ios && xcodegen generate`. The project is regenerated from YAML, so hand-edits to `.pbxproj` never conflict.
- **B. The user creates the project in Xcode** (about 1 minute):
  1. File > New > Project > iOS App, product name `StrangersEyes`, SwiftUI, bundle ID `BUNDLE_ID`, saved in `ios/`.
  2. File > Add Package Dependencies > `https://github.com/firebase/firebase-ios-sdk`, **Exact Version 12.19.3**, with the products below.
- **C. Claude hand-writes a minimal `.pbxproj`**, or uses the Firebase `xcode-project-setup` skill. This is the most fragile option.

`ios/project.yml` sketch for option A [UNVERIFIED, not run]. The file list is canonical in ARCH §19.2.
```yaml
name: StrangersEyes
options:
  deploymentTarget: { iOS: "27.0" }
packages:
  Firebase:
    url: https://github.com/firebase/firebase-ios-sdk
    exactVersion: 12.19.3
targets:
  StrangersEyes:
    type: application
    platform: iOS
    sources:
      - StrangersEyes
      - path: ../shared/prompts
        type: folder
        buildPhase: resources
      - path: ../shared/strings
        type: folder
        buildPhase: resources
      - path: ../remoteconfig.template.json
        buildPhase: resources
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: BUNDLE_ID
        GENERATE_INFOPLIST_FILE: YES
        INFOPLIST_KEY_NSLocationWhenInUseUsageDescription: "Pin a place in your private vault. Coordinates never leave this device."
        INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription: "Save the cleaned photo to your library."
    dependencies:
      - { package: Firebase, product: FirebaseAILogic }
      - { package: Firebase, product: FirebaseAppCheck }
      - { package: Firebase, product: FirebaseAuth }
      - { package: Firebase, product: FirebaseRemoteConfig }
  StrangersEyesTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - StrangersEyesTests
      - path: ../shared/testvectors
        type: folder
        buildPhase: resources
    dependencies: [{ target: StrangersEyes }]
```
- **Do not add FirebaseFirestore on iOS.** It pulls in heavy abseil and grpc builds, and the Leak Atlas is web-only.
- `import FirebaseCore` comes in through FirebaseAILogic.
- Always `import FirebaseAILogic`.

### 2.8 iOS: build and run in the Simulator [CLAUDE]
Quit Chrome first (§2.10).
```bash
cd "/Users/mac/Documents/firebase buildathon"
UDID=E950C8A0-185D-40BF-8A62-C113655C0557; BUNDLE_ID=<from PROGRESS Key values>
xcodebuild -project ios/StrangersEyes.xcodeproj -scheme StrangersEyes -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath ios/build \
  -clonedSourcePackagesDirPath ios/.spm ARCHS=arm64 build
xcrun simctl boot $UDID 2>/dev/null; open -a Simulator
xcrun simctl install $UDID ios/build/Build/Products/Debug-iphonesimulator/StrangersEyes.app
xcrun simctl privacy $UDID grant location $BUNDLE_ID
SIMCTL_CHILD_AppCheckDebugToken="$(cat ios/.appcheck-debug-token)" \
  xcrun simctl launch --terminate-running-process $UDID $BUNDLE_ID
```
- Passing the token as `SIMCTL_CHILD_*` env is [UNVERIFIED] for App Check. If it isn't picked up, read the auto token from the logs (§2.9) and have the user register it.
- The first SPM resolve and build is slow and takes about 1 GB of DerivedData. `ARCHS=arm64` halves the time.
- If this session has the iOS Simulator tools, call `attach` before building, then `launch` with the `.app` path.
- App code must call `AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())` under `#if DEBUG` **before** `FirebaseApp.configure()`.

### 2.9 iOS: tests, logs, photos, location
```bash
xcodebuild test -project ios/StrangersEyes.xcodeproj -scheme StrangersEyes \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath ios/build ARCHS=arm64
xcrun simctl spawn $UDID log stream --level info --style compact --predicate 'process == "StrangersEyes"'
xcrun simctl addmedia $UDID web/public/samples/judge-01.jpg      # no camera in the Simulator; import via Photos
xcrun simctl location $UDID set <lat>,<lng>                       # PUBLIC building coordinates only, never your home
xcrun simctl io $UDID screenshot ".scratch/sim.png"
xcrun simctl uninstall $UDID $BUNDLE_ID                          # resets the Keychain vault and the auto debug token
xcrun simctl shutdown all && osascript -e 'quit app "Simulator"' # ALWAYS when done (8 GB)
```
Simulator facts, verified by research:
- Foundation Models:
  - text works;
  - `@Generable` works;
  - `tokenCount(for:)` works;
  - **tool calling fails** (`UnifiedAssetFramework Code=5000`);
  - **image attachments fail** (`ModelManagerError 1001`);
  - `contextSize` reports 0;
  - each call takes 18–30 s.
- Vision `DetectFaceRectanglesRequest` needs the **CPU compute device** in the Simulator.

### 2.10 Memory and disk hygiene
- **Chrome Nano and Simulator FM never run together.**
  - Before booting the Simulator, quit Chrome fully (Cmd+Q).
  - Before Nano work, run `xcrun simctl shutdown all`.
  - §3.2 may relax this rule after a measurement; until then it stands.
- Close Xcode during Chrome Nano work, and don't run `xcodebuild` while Nano is answering.
- Check disk with `df -h /`. Keep ≥30 GB free.

---

## 3. Verifying on-device models

### 3.0 Who can drive which Chrome
- **The user's own Chrome (Nano-enabled profile)** is the only place Nano runs.
  - If the Claude-in-Chrome extension is connected to that profile, Claude runs the snippets below with its JavaScript tool. Whether the extension can see `LanguageModel` on that profile is [UNVERIFIED]; record it on Day 1.
  - Otherwise the user pastes the snippets into DevTools and pastes back the results.
- **Claude's Browser pane, Playwright and headless Chrome** have no Nano. Use them for the no-Nano path.

### 3.1 Chrome Gemini Nano check (Day 1 = G2; again before every demo session)
Run with the Simulator shut down.
1. **Settings and flag** (§1.13), then relaunch.
2. **`chrome://on-device-internals`:**
   - The **Broker State** tab shows no errors.
   - The model is v3Nano 2025.06.30.1229 and ready, with the performance class and VRAM shown.
   - Screenshot it for PROGRESS.
   - `chrome://components` → "Optimization Guide On Device Model" shows the component version.
3. **DevTools console** on `http://localhost:5173`. It must be a top-level page, not an iframe or worker.
   ```js
   'LanguageModel' in self   // must be true
   await LanguageModel.availability({ expectedInputs: [{type:'text',languages:['en']},{type:'image'}],
                                      expectedOutputs: [{type:'text',languages:['en']}] })
   // 'available' = ready
   // 'downloadable' / 'downloading' = click the app's "Enable on-device AI" button (initializeDeviceModel needs a user gesture)
   // 'unavailable' = see §8.2
   ```
   This is a **diagnostic only**. App features call Nano through Firebase AI Logic and never through `LanguageModel` directly. The capability panel and the gate may call `availability()`.
4. **Through Firebase (the real G2).** The DEV-only Nano spike page (TASKS T-032) makes an `ONLY_ON_DEVICE` call:
   - input: a 768 px JPEG plus a plain-JSON-Schema `responseConstraint` (`JSON.parse(JSON.stringify(schema))`; whether Chrome accepts a `Schema` instance is [UNVERIFIED, U-04]);
   - pass: the result validates **and** `response.inferenceSource === 'on_device'`;
   - also run 5 text-only referee calls.
   - **Remember:** without `window.LanguageModel`, the SDK silently sends `ONLY_ON_DEVICE` to the cloud. The gate checks availability **before** S0/S1 calls. A Ledger entry showing `in_cloud` on an S0/S1 job is a stop-the-line bug (§8.6).
5. **Measure** first-call latency (model load), warm latency, and Activity Monitor memory pressure, which must stay green.
6. **G2 PASS:** availability is `'available'`; ≥4/5 image runs and ≥4/5 text runs are valid and on-device; median latency ≤15 s; no tab crash or OOM.
   - Text-only pass: Nano does S0, and S1 pre-screen becomes rules-only.
   - FAIL: the web shows Tier-0 plus cloud honestly, and iOS carries the on-device story.
   - Log the result as a decision.

### 3.2 Memory measurement for the 8 GB rule (Day 1, right after §3.1)
1. After a Nano call, leave the tab idle for 5 minutes.
2. Record Chrome's total memory (Activity Monitor) and the model state in `chrome://on-device-internals`.
3. Close all app tabs (Chrome still running) and record again.
4. If the model unloads when no page uses it, propose relaxing the rule to *"no concurrent Nano and FM inference; close every app tab before FM work"*. That is [DECISION]: log it, then update `CLAUDE.md` invariant 10 and §2.10.
5. Until then the strict rule (quit Chrome) stands. Chrome probably loads the 4 GB model only while a page uses it [UNVERIFIED].

### 3.3 Gemma 4 ("Gemini Nano 4") experiment [USER, optional; after G2, by Sun Nov 22 (TASKS T-040)]
- The hackathon says "Gemini Nano 4". The FAQ says to enable **`chrome://flags/#gemma4-for-built-in-ai`** ("Gemma 4 for Built-in AI"), which switches built-in AI to a separate `gemma4_component`.
- v3Nano is acceptable according to a Firebase answer relayed second-hand in forum topic 45895 [UNVERIFIED officially, U-40].
- **Run it only after G2 passes, by Sun Nov 22 (TASKS T-040; SPEC D-21: never after Nov 25).** It starts a new multi-GB download that may not fit in 8 GB.
  1. Enable the flag and relaunch.
  2. Watch `chrome://on-device-internals`.
  3. Repeat §3.1 steps 3–5.
- **If it fails, is slow, or memory pressure goes red:** set the flag back to **Default**, relaunch, and confirm v3Nano still passes §3.1.
- If it hasn't run by Nov 24, mark it CUT. The README then says "Gemini Nano via Chrome's built-in AI (v3Nano)".
- Never try it in the days before filming.

### 3.4 Nano on the hosted origin (Day 6) [UNVERIFIED, U-10]
- Open `https://PROJECT_ID.web.app` in the user's Chrome and repeat §3.1 step 3.
- Firebase's hybrid page mentions a Prompt API origin-trial token for end users. Chrome's page lists the web Prompt API as shipped in 148; its only trial covers sampling parameters.
- If `LanguageModel` exists on localhost but not on the hosted origin, the USER registers an origin trial at developer.chrome.com/origintrials. Claude then adds `<meta http-equiv="origin-trial" content="TOKEN">` or an `Origin-Trial` header in `firebase.json`.
- Otherwise, film the Nano beats on localhost.

### 3.5 Apple Foundation Models in the Simulator (G3 = TASKS T-033, by Sun Nov 22; iOS build days from Wed Nov 25 evening)
1. Apple Intelligence on (§1.12). **Chrome quit.** Boot SIM and open the app's DEV spike screen (TASKS T-033).
2. Check:
   - **Availability:** `FirebaseAI.SystemLanguageModel.default.availability == .available` (Path A).
   - **Device-only session (no HybridModel):** `ai.generativeModelSession(model: systemModel, instructions: …)` → `respond(to:generating:)` with a `@Generable` type returns a value. When the model is unavailable, it must **throw** `assetsUnavailable` and make no network call.
   - **HybridModel (S2 public text only):** `HybridModel(primary: systemModel, secondary: ai.geminiModel(name: …))` answers. Record the `rawResponse.modelVersion` strings [UNVERIFIED, U-23/U-24]; the expected on-device value is `"apple-foundation-models-system-language-model"`. To see a fallback, send a public prompt over 4,096 tokens. It falls back on *any* primary error.
   - **Cloud-only session** with the debug token returns text (U-25).
   - Tools and image attachments are already known to fail in the Simulator. Don't spike them again.
3. **G3 PASS:** the device-only `@Generable` call, the HybridModel text call and the cloud call all succeed. If Path A won't build or run, switch to **Path B (13.2.0)**: an Apple `LanguageModelSession` on device, `ai.geminiLanguageModel(name:)` for the cloud, and fallback in app code. Log it as a decision and add a README note.
4. Run `xcrun simctl shutdown all` afterwards.

### 3.6 What to record in PROGRESS after each verification
- Chrome version, model name and version, flags, `availability()` result, first and warm latency, memory pressure, and whether Claude-in-Chrome could drive it.
- iOS runtime, `availability`, the `modelVersion` strings seen, latency.
- What failed, and the decision taken.

---

## 4. Deploy

### 4.0 Conventions
- Deploy with `$FB` (15.37.0). Deploys do not need Java.
- Claude writes config by hand and never runs interactive `init` (§1.1).
- Every deploy gets a message: `-m "<what changed>"`.

### 4.1 Bind the CLI to the project [CLAUDE]
Write `.firebaserc` (committed):
```json
{ "projects": { "default": "PROJECT_ID" } }
```
Check with `$FB projects:list`; the active project is marked.

### 4.2 `firebase.json` [CLAUDE]
- **The body is canonical in ARCH §15.4** until the file exists; after that, `ROOT/firebase.json` is canonical. Don't copy it here.
- Operational notes:
  - `hosting.public` is `web/dist`. Build before deploying; a `predeploy` hook is optional.
  - Header matching runs **before** rewrites and uses the request URL.
  - **There is no SPA rewrite** (T-038, D-82). Routes are hash-based (ARCH §3.4), so the old `** → /index.html` rewrite served no route. It only turned a missing file (a wrong `/vendor/…` path) into `200 text/html` with a 1-hour cache, which MediaPipe or Tesseract would then try to parse. A missing file is now a real 404. The service worker's `navigateFallback` still covers offline navigations.
  - `/assets/**` and `/vendor/**` are immutable: Vite hashes the asset names, and the vendor folder names carry the package versions. `/models/**` keeps Hosting's default cache because its file names are unversioned (ARCH §15.4). `/`, `index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest` are `no-cache`. The `/@(…)` glob is [UNVERIFIED, U-20]; if `curl -I` shows it doesn't match, use one header entry per file.
  - Each deploy clears the CDN.
  - The root file doesn't need an `emulators` block, because the rules tests use their own config (§2.6).
  - **Never send COEP `require-corp`**; it would probably break reCAPTCHA.
  - Only add a CSP after testing. The allow-list is in API-NOTES §2.8. Search Suggestions need inline styles.
  - If §3.4 finds an origin trial is needed, add an `Origin-Trial` header here.

### 4.3 Firestore rules and indexes [CLAUDE]
**Constraint (SPEC D-11, invariant 1):**
- The only writable documents are `/atlas/{weekId}/clues/{clueType}`;
- `clueType` must be one of the **18 `CLUE_TYPES`** (`shared/prompts/enums.v1.json`);
- `n` may only increase by 1; no deletes; public read;
- **no outcome, band or "fix moved the band" documents.** Bands come from the user's vault pins, so writing them would tell Google whether the attacker was right.

**Source:** ARCH §14.3, which equals `research/day1-artifacts/firestore-tests/firestore.rules` (18 types, no `outcomes` block, emulator-tested 20/20, `run.log`). `firestore-tests-v2/` is history only. Outcome counters are dropped for good (T-022 R-02, D-41, SPEC D-11 as amended): never add an `outcomes` block.

**Steps:**
1. Write `firestore.rules`.
2. Write `firestore.indexes.json` as `{ "indexes": [], "fieldOverrides": [] }`.
3. Run `npm run test:rules` at ROOT (root `tests/rules/`, §2.6); every case must PASS.
4. `$FB deploy --only firestore` (rules + indexes).

**Client rules:**
- `void setDoc(doc(db,'atlas',weekId,'clues',type), { n: increment(1) }, { merge: true })`. **Never await it while offline.**
- Writes happen only after opt-in, one per distinct **pass-B** clue type of the first attack (r1). Re-attacks write nothing.
- Never write images, coordinates, vault data or per-photo documents.
- Judge Mode sample metadata and recorded **pass-B** outputs ship as static files in `web/public/samples/`, not in Firestore. **Pass A is never cached anywhere.**

### 4.4 Remote Config [CLAUDE]
- **Key names, types and defaults are canonical in ARCH §13** and then in the repo file `remoteconfig.template.json` (27 keys, D-40). T-060 created that file on Nov 21 by copying ARCH §13.3 verbatim (D-85); it is now the canonical copy. Don't seed anything from `research/day1-artifacts/arch-ref/` (old keys and values; history only, and it has no `json/` folder). `research/day1-artifacts/arch/remoteconfig.template.json` is the generated copy (from `arch/gen.mjs`). It differs from the repo template in the `ocr_max_px` and `auto_mask_types` defaults and in four descriptions: those two keys, `bands_m` (the D-77 lock note) and `daily_adversary_cap` (its clamp). The repo file wins; never seed anything from either research copy.
- Client defaults are read from the template itself: the web imports it and iOS bundles it (ARCH AD-28, §13.4). A Vitest test (AC-295) checks they deep-equal the template.
- If a key below is named differently in the template, the template wins; fix this list.
- Rules:
  - **There is no `temperature` key.** Gemini 3.x+ ignores it.
  - The client hard-codes a floor: S0/S1 can never be cloud, whatever `routing_policy` says.
  - Prompt text never comes from Remote Config; `prompt_versions` only selects among bundled versions.
  - Values are strings, booleans are `"true"`/`"false"`, and JSON is stringified.

**Operational knobs** (the ones you'll touch during development and judging):
| Key | Use |
|---|---|
| `kill_switch` | `true` blocks every cloud-capable AI call. Device and rules paths keep working; Judge Mode falls back to CACHED pass B. Applies in real time via `onConfigUpdate` |
| `daily_adversary_cap` | Attack runs per installation per **local** day, client-side. An A+B pair (or B alone) counts as 1 run, and re-attacks count. Default 20 (ARCH §13.2). Keep project-wide grounded queries well under 1,500/day |
| `grounding_enabled` | `false` = pass B only (cut-order step for pass A; free-tier mode) |
| `data_tier` | `paid` (default) or `free`. Drives the consent copy; `free` forces grounding off |
| `adversary_model`, `explain_cloud_model`, `adversary_thinking_level` | Exact model IDs (never `-latest`). Thinking LOW, MEDIUM or HIGH (MINIMAL is a 400 on 3.8/4.x) |
| `judge_mode_enabled`, `judge_cached_fallback`, `atlas_enabled` | Feature switches |

**Commands** (`rollback` flags [UNVERIFIED]; check `--help`):
```bash
FB="npx -y firebase-tools@15.37.0"
$FB deploy --only remoteconfig                      # VERIFIED Nov 21 (U-17, D-126); BUT see the free-tier note below
$FB remoteconfig:get -v <VERSION> -o .scratch/rc-live.json   # without -v, 15.37.0 fetched (HTTP 200) but wrote no file on Nov 21
$FB remoteconfig:versions:list
$FB remoteconfig:rollback -v <VERSION>
```
**Free-tier override until T-003 (D-70, D-126):** the live config must have `data_tier=free` and `grounding_enabled=false`, while the repo template keeps the paid defaults. So until Blaze, never deploy the repo template as it is. Write a scratch copy with those two values changed plus a scratch `firebase.json` (`{"remoteconfig":{"template":"remoteconfig.template.json"}}`), and run `$FB deploy --only remoteconfig --project strangers-eyes --config <scratch>/firebase.json`. Then check that the live config differs from the template in those two keys only. After T-003, deploy the repo template as it is.
**Kill switch (only for real abuse; judges must keep access until Dec 16, 14:00 PT):**
1. Console → Remote Config → `kill_switch` = `true` → **Publish changes**.
2. Check in the app that no S3 calls are made.
3. Set it back to `false` when the problem is over.

To raise caps during judging, change `daily_adversary_cap` in Remote Config. **No code deploys after the freeze.**

### 4.5 Auth as code
`$FB deploy --only auth` (VERIFIED Nov 21, U-17). If it errors, enable Anonymous in the console (§1.8).

### 4.6 Hosting deploy and post-deploy checks
**Deploy early.** Do the first hosting deploy as soon as the web scaffold builds (about Nov 21–22), even before reCAPTCHA exists. MIME types, headers, service-worker caching and cold load (U-20/U-21) are unverified and should surface early, not on Nov 25. Before reCAPTCHA is registered, AI calls on the hosted site fail App Check; that is expected.
```bash
cd "/Users/mac/Documents/firebase buildathon"
FB="npx -y firebase-tools@15.37.0"
npm --prefix web run check && npm --prefix web run build
$FB deploy --only hosting -m "<what changed>"
# Day 6 full deploy:
$FB deploy --only hosting,firestore,auth,remoteconfig -m "Day 6: first full hosted build"
```
**Checklist after every hosted deploy** (results go in PROGRESS):
1. **Headers and MIME** [UNVERIFIED until run]:
   ```bash
   H=https://PROJECT_ID.web.app
   curl -sI $H/sw.js | grep -i cache-control                                                   # no-cache
   curl -sI $H/index.html | grep -i cache-control                                              # no-cache
   curl -sI $H/vendor/mediapipe-1.2.3/wasm/vision_wasm_internal.wasm | grep -iE 'content-type|cache-control'   # application/wasm, immutable
   curl -sI $H/vendor/tesseract-7.0.0/core/tesseract-core-relaxedsimd-lstm.wasm.js | head -1                 # 200
   curl -sI $H/vendor/tesseract-7.0.0/lang/eng.traineddata.gz | head -1                                      # 200 (gzip or plain both work)
   curl -sI $H/models/blaze_face_full_range.tflite | head -1                                                 # 200
   ```
2. **Debug-token leak check, by value** (the variable name alone would never catch a leak):
   ```bash
   T=$(sed -n 's/^VITE_APPCHECK_DEBUG_TOKEN=//p' web/.env.development.local)
   [ -n "$T" ] && { grep -rqF "$T" web/dist && echo "LEAK in dist" || echo "dist clean"; }
   grep -rlF "VITE_APPCHECK_DEBUG_TOKEN" web/dist && echo "LEAK: env var name in dist" || echo "env var name absent"   # FIREBASE_APPCHECK_DEBUG_TOKEN is inside the App Check SDK itself; not a leak signal (SPEC AC-365)
   ```
3. **Judges' path:** a browser **without Nano** (Chrome guest profile, headless Chrome or Safari).
   - The capability panel is honest.
   - Judge Mode runs red to green in **≤90 s (goal about 60 s)** with IN_CLOUD/RULES_ONLY badges.
   - The Ledger and HUD fill in.
4. **App Check:** in DevTools → Network, requests to `firebasevertexai.googleapis.com` carry `X-Firebase-AppCheck` and return 200 (not 401 or 403). In the App Check console APIs tab, verified requests rise and unverified stay near 0.
5. **Grounded pass A:** the Search Suggestions chip is unmodified, the same width as the notes, and always visible with them; `webSearchQueries` and the source links are shown.
6. **Offline:** load, wait for "Ready to work offline", go offline, reload. The app works and the cloud step is queued.
7. **Cold first visit:** fresh profile with DevTools throttling "Fast 4G". Record the seconds until Tier-0 is ready (about 22 MB of wasm and models must load).
8. **Layout** works at 375 px wide.
9. **Nano on the hosted origin** (§3.4).
10. **Kill switch** tested once (§4.4).

**First hosted deploy: T-038, Nov 20** (`deploy --only hosting`, commit 701ed29 plus the no-rewrite fix, https://strangers-eyes.web.app):

| Check | Result |
|---|---|
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | 200, `Cache-Control: no-cache`; one entry per file works (U-20 moot) |
| `/vendor/mediapipe-1.2.3/wasm/vision_wasm_internal.wasm` | 200, `application/wasm`, `public, max-age=31536000, immutable`, 14.67 MB |
| `/vendor/tesseract-7.0.0/core/tesseract-core-relaxedsimd-lstm.wasm.js` | 200, `text/javascript`, immutable, 3.91 MB |
| `/vendor/tesseract-7.0.0/lang/eng.traineddata.gz` | 200, `application/gzip`, no `Content-Encoding` (served raw), immutable, 2.95 MB |
| `/models/blaze_face_full_range.tflite` | 200, `application/octet-stream`, `max-age=3600` (as designed), 1.08 MB |
| Every response | `Permissions-Policy: geolocation=(self), camera=(), microphone=()`, `X-Content-Type-Options: nosniff` |
| A missing file | Before the fix: **200 `text/html`** (the SPA rewrite). After removing the rewrite (D-82): 404. A 404 under `/vendor/**` also carries the `immutable` header, because header rules match the request URL; harmless, since vendor folder names are versioned |
| Debug-token leak | The token lives only in `web/.env.development.local`, which a production build never loads. It is referenced only under `import.meta.env.DEV`. Neither the variable name nor the `appcheck-debug` switch appears in `web/dist`. The by-value grep (step 2) is the user's to run, because Claude never reads the token |
| Shell load (Browser pane, Chromium 156, no throttling) | DOMContentLoaded 2.7 s. JS 110 KB and CSS 5 KB transferred. No Tier-0 assets on first load |
| Import on the hosted origin | A 3000×2000 JPEG dropped on Check → "Photo ready: 2048 × 1365 px, metadata removed". A dropped link → `copy.import.noUrl`. **Zero network requests** besides the app's own assets |
| Layout at 375 px | Home and Check render correctly |
| Nano (U-10) | `LanguageModel` is present without an origin-trial token; `availability()` = `unavailable` in the Browser pane (no model). The user's Chrome is still to check (T-007) |
| Service worker | Not registered yet: `injectRegister: false`, and `useRegisterSW()` arrives with T-106 |
| Not yet possible | Hosted AI call (needs T-011); `--only remoteconfig` (the template exists since Nov 21, T-060; the first publish is T-038 step 1 / T-102); cold "Tier-0 ready" under Fast 4G (Tier-0 is not wired into Check until T-056/T-057). Estimate: about 22.6 MB of wasm, traineddata and model, ≈ 20 s at 9 Mbit/s plus latency. Measure it in T-107/T-108 |

**Hosted verification matrix** (TASKS T-108; fill on Day 6 and again before submission):
| Browser | Nano | Capability panel honest | Tier-0 faces + OCR work | Judge Mode red→green (s) | App Check 200 | Cold first visit (s) | Notes |
|---|---|---|---|---|---|---|---|
| Chrome 157, this Mac (Nano profile) | | | | | | | |
| Chrome guest profile (no Nano) | | | | | | | |
| Safari macOS (Tesseract falls back to the simd core; MediaPipe needs WebGL) | | | | | | | |
| Firefox | | | | | | | |
| iOS Safari in SIM | | | | | | | |

### 4.7 Preview channels
```bash
$FB hosting:channel:deploy preview --expires 7d
```
- Preview domains (`PROJECT_ID--preview-<hash>.web.app`) are **not** on the reCAPTCHA key, so AI calls fail App Check there.
- Either add the domain to the key (§1.7a) or use preview channels for UI checks only [UNVERIFIED].

### 4.8 Freeze, tag, and the judging window
- **Mon Nov 30, by 10:00 GMT+2:**
  1. Run the final `$FB deploy --only hosting` from the commit you'll tag.
  2. Then:
     ```bash
     git tag -a submission-v1 -m "#BuildHybridAI submission"
     git push origin main --tags
     git ls-remote --tags origin        # tag present
     ```
  3. Record the SHA in PROGRESS and `docs/DEVPOST.md`.
- **After the tag:** no pushes to `main` and no hosting deploys until Dec 16. Further work goes in a separate clone or repo.
- **Judging window (Dec 10–16, 14:00 PT):**
  - keep Blaze active and watch the budget alerts;
  - do not delete or rename the project, the App Check registrations or the reCAPTCHA key;
  - do not lower quotas below what judges need;
  - only Remote Config changes are allowed (caps, kill switch for real abuse);
  - spot-check App Check metrics and grounded-query counts every couple of days.

---

## 5. Benchmark procedure

### 5.1 Day-1 adversary spike (G1, the pivot gate) [CLAUDE builds; USER supplies photos]
**Preconditions:** §1.2, §1.4, §1.5, §1.7b. The tier question (§1.3): on free tier only after the user's explicit yes. Pass A runs only on Blaze.

**Tool:** the DEV-only spike page (TASKS T-031, `web/src/dev/spikes/`, allowlisted by `check-boundaries.mjs`).
- It loads `PRIV/spike/*` through a DEV-only `server.fs.allow` + `/@fs/` entry, gated by `VITE_SPIKE=1`. This is never in a production config. It lets the run go unattended in headless Chrome with the fixed debug token.
- Steps per photo:
  1. Read the truth locally from EXIF or `truth.csv` (memory only).
  2. `reencodeClean` (longest side 2048 px JPEG). Assert no APP1/APP13 and `exifr.gps()` undefined.
  3. MediaPipe face check: skip the photo if any face is found.
  4. **Pass B** (advB.v1, `responseJsonSchema`, thinking MEDIUM): **×3** on `gemini-3.8-flash` and **×1** on `gemini-4-hydrogen`.
  5. **Pass A** (advA.v1, grounded) **×1**, rendered with Search Suggestions. **Store only metadata**: status, latency and query count, never its text (grounding terms).
  6. Code computes distances: the closest of up to 3 hypothesis **centres** (`d`) and the top-1 distance.

**Definitions:**
- A photo is **refused** if ≥2 of its 3 pass-B runs are `declined` or blocked (`AIError response-error`).
- A photo is **located** if ≥2 of its 3 runs have their closest centre within 5 km.

**PASS = ≤2 of 10 refused AND ≥4 of 10 located.** Also report: top-1 placement, within-1 km counts, stability across runs, latency, and refusals on the 2–3 doorstep-style photos specifically.

**Informational checks (not part of pass/fail):**
- **Does fixing work (G1b)?** For each located photo, apply the deterministic fix (mask every removable clue that pass B cites, solid fill, padded 15%) and run pass B ×1 again. Record whether the closest band moved outward. If location comes mostly from non-removable clues (architecture, vegetation), the "Risk reduced" story is at risk. Tell the user on Day 1, not Nov 24.
- **Radius:** how often `radius_km ≤ 1` and `≤ 5` appear. Under SPEC D-10 (`e = max(d, r)`), a red "within 1 km" line needs `r ≤ 1 km`.
- Optional: a cast `seed` [UNVERIFIED, U-11]; text-before-image vs image-first (U-14).

**Outputs:**
- Raw JSON goes to `PRIV/raw/spike-<date>.json` (TASKS T-031, ARCH §21).
- Aggregates only (counts, no coordinates, no place names) go to `benchmark/spike/day1-adversary.md`.
- In PROGRESS: model IDs, prompt versions, results, and the adversary model chosen for the Remote Config default.

**If it fails or is borderline:** stop and ask the user (TASKS T-034). **Never pivot without the user's yes.** While waiting, keep building pieces that carry over to any fallback: the gate, Ledger, HUD, Tier-0, vault crypto and Firebase plumbing.

### 5.2 Photo sets and ground truth (privacy first)
- **Benchmark:** 25 photos in `PRIV/bench/`, with the §1.14 mix. No residential housing.
  - `PRIV/bench/truth.csv` columns: `id,lat,lng,place_type,clues`.
  - `lat,lng` come from the original EXIF GPS or are entered by hand.
  - `clues` = hand labels as `type@region` separated by `;`, for example `street_sign@top_left;transit_sign@middle_right`. Types come from `CLUE_TYPES`; regions from the 3×3 `REGIONS`.
  - Claude can draft the labels by viewing each photo (TASKS T-150); the user spot-checks 5.
- **Gate-test set:** 10 images in `PRIV/gate-test/` plus `PRIV/gate-test/vault.json` (fictional labels matching the props).
- **Bench vault:** synthetic and private. For each photo, one `home_pin` at the true location; text items only for the gate-test set.
- **Committed:** only aggregates, under IDs `p01`–`p25`. Never coordinates, place names or images.

### 5.3 Harness and runs [CLAUDE]
The DEV-only route `#/dev/bench` (`web/src/dev/bench/`, ARCH §21) runs **through the Egress Gate**, so the measured path is the production code path. It loads PRIV files with the same DEV-only, env-gated `/@fs/` mechanism as the spike. **Pass A is never used for metrics** (grounding terms forbid analysing grounded results).

- **Run 1: cloud metrics, unattended (Nov 26, overnight or during the Swift ports).**
  - Headless Chrome with the CDP harness and the fixed debug token, against `npm run dev`. No Nano needed; pre-screen runs RULES_ONLY.
  - Per photo:
    1. Tier-0.
    2. **Pass B ×3** on the redacted image ("before").
    3. **Deterministic rules fix** (SPEC §10.4) using the bench vault.
    4. **Pass B ×3** on the fixed image ("after").
  - Pace cloud calls **≥3 s apart** (≤20 RPM).
- **Run 2: Nano pre-screen recall and on-device latency (user's Chrome, Simulator shut down).**
  - 25 Nano pre-screen calls on the original images (S1, no cloud calls).
  - A few referee and fix calls for latency.
  - Optional: the Nano fix plan as a secondary "after" row.
- **Run 3 (optional): iOS latency mini-benchmark.** FM pre-screen and referee on 5 photos in SIM, with Chrome quit → `benchmark/results/ios-latency.md`.
- **Gate-test (M6):** run the gate-test set through Tier-0 + Nano vault-text matching. Record the share of prop vault strings masked before the consent sheet (target 100%).

The harness downloads raw JSON into `PRIV/raw/` (`bench-<date>.json`). `benchmark/aggregate.mjs` (pure, unit-tested) writes the committed aggregates (`benchmark/results/summary.{json,md}`).

### 5.4 Metric definitions
**SPEC §15.3 is the only definition of the metrics (G1, M1–M9; D-34). This section does not restate them.** When running and reporting:
- `d` = the distance from the truth to the **closest** of up to 3 hypothesis centres. It is the headline for G1, M1, M2 and M8. Rows for `e = max(d, radius)` (D-10) are reported alongside, and M9 uses `e`.
- Every located count is reported as **majority of 3** and **any of 3**, before and after.
- "After" means the deterministic rules fix. The Nano fix is an optional secondary row.
- Clue recall (M4): same type in the same or an adjacent 3×3 cell. Tier-0 counts text-type clues only.

### 5.5 Run protocol
1. Pin Remote Config (model, prompt versions, thinking level) and write it into the results file.
2. Run 1 needs no Nano. For Run 2: close Xcode and the Simulator, warm Nano with one throwaway call, and check memory pressure is green.
3. On a transient error (network, 5xx, 429, truncation), rerun only that call, once, with the identical prompt. **Never re-run a decline or block.**
4. Record the Chrome and model versions, the date, and the estimated cost in PROGRESS.
5. If the benchmark hasn't run by Nov 28, run it on the 10 spike photos and report n=10 honestly.

### 5.6 Outputs and publishing
- **Committed:**
  - `benchmark/README.md` (method, privacy rules, how to run);
  - `benchmark/results/summary.json` and `summary.md` (aggregates only);
  - `benchmark/aggregate.mjs` and its unit test;
  - the harness code.
- **Before committing:** `git diff --cached benchmark/` must show no lat/lng, place names or image files.
- **Publish whatever the numbers are**, in the README "Measured results" section and on the video's benchmark card. Never round favourably.
- `summary.md` template:
  ```
  | Metric | Before fix | After fix |
  |---|---|---|
  | Located ≤1 km, centre d (majority of 3 / any of 3) | X/25 / x/25 | Y/25 / y/25 |
  | Located ≤1 km, effective e (majority / any) | … | … |
  | Located ≤5 km (same four rows as needed) | … | … |
  | Refusals (pass B) | Z / N calls | |
  | Clue recall: Tier-0 / Nano / Cloud | … / … / … | |
  | Vault-text catch rate (gate-test set) | …/… | |
  | Latency p50/p95: pre-screen Nano · adversary cloud · referee Nano | … | |
  | Calls per session: on-device / cloud (Nano / no Nano) | … | |
  Model gemini-3.8-flash, prompts advB.v1, thinking MEDIUM, Chrome 157 v3Nano, k=3, date.
  Limits: n=25, one region, public places only (homes are probably harder), builder-owned, pass B only. Accuracy is known to be lower in sparse and less-developed regions (arXiv 2502.11163).
  ```

---

## 6. Demo filming

### 6.1 Safety rules (non-negotiable)
- **No people** anywhere, including reflections, passers-by and photos on screens.
- **No real home and no real school.** The "home" pin is a **public building**. The work label is the fictional "City General Hospital". Shoot per the location-disclosure decision (§1.14).
- **No real third-party logos or trademarks:** no shop brands, transit-operator logos, employer lanyards or social-network logos.
  - Frame the shot to avoid them.
  - If one is unavoidable in the raw photo, cover it in the *video edit* with a solid box captioned "logo hidden for video". The app's own masks stay solid fills.
- **Vault content on screen is fictional only.** The UI shows bands, never coordinates.
- **DevTools stays closed while recording on localhost**, because the debug token is printed to the console. Never show the debug-token dialog, billing pages or the CLI token.
- **Numbers on screen are real and measured.** Speed-ups are labelled (for example "×4").
- **Verdict lines are what the app actually produced.** With the "HOSPITAL STAFF" lanyard (D-39) the expected line is "Linked to your WORKPLACE" (likely), not "by name". Film the true output.
- The vault never syncs. If web and iOS vaults both appear, caption "Each device keeps its own vault".
- **Grounding display rule:** whenever pass-A notes are on screen, their Search Suggestions chip is visible too. Never crop or cut it.

### 6.2 Demo data and Chrome profiles
- **"Demo" Chrome profile** for the own-photo beats:
  - no extensions shown, no bookmarks bar, page zoom 110–125%;
  - Nano must be `available` in this profile; whether profiles share the model component is [UNVERIFIED];
  - the PWA was loaded online beforehand, so the service worker is active and Remote Config is cached;
  - pre-mask mode **Standard** (the default). **Strict would mask the lanyard before the attacker sees it, and the workplace line would disappear.**
  - Real vault in this profile, all fictional, entered through **manual coordinates** (no real geolocation):
    - `home_pin` "Home" at public building A;
    - `work_pin` "City General Hospital" at public place B;
    - `child_name` "Lucas".
- **Judge Mode** can be filmed in the Demo profile. It never unseals or loads the real vault (SPEC D-37): S4 calls are guarded by the sample allowlist, and S3 calls in Judge Mode are checked against the fake vault only. The Demo vault's matching fictional labels therefore don't block it, and no vault burn is needed first.
  - Optional: film Judge Mode in a separate profile (for example "Judge") to show a judge's first-run view without Nano; whether profiles share the Nano component is [UNVERIFIED].
- **iOS vault:** the same fictional entries, pinned with `xcrun simctl location … set` at public building A, then B.
- **Rehearsal (TASKS T-182, Sat Nov 28; the ≥10× pre-tests are TASKS T-097, Mon Nov 23):**
  - Run pass B ≥10× on the hero photo and each Judge scene. Record the red-before / green-after rates and film the most stable photo.
  - Write reset scripts that burn the vault and clear the Ledger.

### 6.2a Replacing the Judge Mode placeholder samples with the T-010 photos [CLAUDE, after USER shoots them]
The repo ships three SYNTHETIC PLACEHOLDER samples (drawn scenes with a PLACEHOLDER watermark, authored pass-B answers; D-150). Swapping in the real staged photos is a data-only change: no code changes.
1. **Photos.** From the T-010 shoot (people-free, D-26 rules, SPEC SCR-17), export each scene as a JPEG, about 1600 px on the long side. Strip all metadata: re-encode through the app's own import (any canvas re-encode writes JFIF only), never commit an original.
2. **nano768.** Make the 768 px pre-screen input from the SAME stripped JPEG (long side 768, JPEG quality about 0.85, JFIF only). `scripts/make-judge-samples.mjs --hash` rejects any APP1/APP13/ICC/COM segment.
3. **Record pass B once per photo (real cloud, USER-approved quota):** with the fake vault active in `#/judge`, run the sample live; save the validated pass-B JSON (ungrounded pass B only, never pass A: invariant 8, AC-245) as `judge-0N.advB.v1.json`. Apply the default fix (autoplay), re-attack live, and save that answer as `judge-0N.advB.fixed.v1.json`. Keep only synthetic or rounded public coordinates; the files are public.
4. **Manifest.** Overwrite the files in `web/public/samples/` keeping the names (or edit `image`/`nano768`/`cachedAdvB*` in `manifest.json`), set `title`, `recordedAt`, `model`, `placeholder: false` per sample and at the top, and the fake-vault pins (public places, 3 decimals; USER approves before commit). Write `expected` only from the T-097 observations.
5. **Hashes:** `node scripts/make-judge-samples.mjs --hash` (re-checks the JPEGs and the JSON, rewrites `imageSha256` / `nano768Sha256`). Do NOT run it without `--hash`: that redraws the placeholders.
6. **Checks:** `node scripts/check-images.mjs`, `npm --prefix web run check` (`ui/judge/judgeMode.test.ts` checks the hashes, clean JPEGs, valid pass B; its open-ocean coordinate assertion must be relaxed to the approved pins), then a browser run of each sample (live, then offline for the CACHED badge).

### 6.2b Judge Mode samples from openly licensed photos (D-153; replaces §6.2a's shoot)
The shipped samples are three CC0 Wikimedia Commons photos of public places in Ljubljana (`web/public/samples/SOURCES.md`).
1. **Pick** CC0/public-domain photos of public places only (no homes, no schools), with no identifiable people, never from the PRIV spike/benchmark set. Download a 2048 px rendition into the scratchpad, never into the repo.
2. **Compose:** write a spec (per sample: `masks` over people, adverts showing people and real plates; optional `badge` / `tag` props), then `swiftc -O -o compose scripts/compose-judge-photos.swift && ./compose spec.json <srcDir> <outDir>`. Check every mask at zoom (sample 3 needed two passes, F-229).
3. **Strip and hash:** copy the outputs over `web/public/samples/judge-0N{,.nano768}.jpg`, run `node scripts/strip-jpeg.mjs web/public/samples/judge-0*.jpg` (ImageIO adds EXIF/APP13), then `node scripts/make-judge-samples.mjs --hash`.
4. **Pass B:** until live recordings exist, the `*.advB*.v1.json` files are authored stand-ins (`model: "authored stand-in (live recording pending)"`, `placeholder: true`). Each first-pass street-level hypothesis cites every clue so the default fix masks all removable clues; the "after" file drops only removable clues (the coverage check in `judgeFlow.fixedRecordingApplies` otherwise replays the first answer, F-230).
5. **Record for real (after T-003, quota approved):** run each sample live in `#/judge`, save the validated pass B (never pass A) over the stand-ins, set `model`, `recordedAt`, `placeholder: false`, re-run `--hash`, and drop the stand-in wording from `ui.judge.placeholderNote`.
6. **Check:** `npm --prefix web run check`, then `#/judge?fakeAdv=network` (CACHED path): each sample red → "Risk reduced", the badge header and "LUCAS" masked on the device.

### 6.3 Recording setup [USER, with Claude preparing app state]
- **Capture:** 1920×1080 at 30 fps. Keep the Router HUD (bottom-left) and the Cloud Ledger (right) in frame.
- **macOS:**
  - Focus / Do Not Disturb on; desktop icons hidden.
  - The menu-bar **Wi-Fi icon** visible for the offline beat. The Simulator has no airplane mode, so toggle the Mac's Wi-Fi.
- **Recorders:**
  - macOS screen: Cmd+Shift+5 → Record Selected Portion.
  - Simulator: `xcrun simctl io $UDID recordVideo --codec=h264 PRIV-path/beat2.mp4` (Ctrl+C to stop; no bezel), or screen-record the Simulator window.
  - Clean status bar: `xcrun simctl status_bar $UDID override --time 9:41 --batteryState charged --batteryLevel 100`.
- **Raw clips** go to `PRIV/video/`, outside the repo. Only overlays and subtitles go in `video/` (committed).
- **Voice:** the user's own voice (QuickTime → New Audio Recording). Whether AI voices are allowed is unanswered on the forum.

### 6.4 8 GB memory protocol
1. **Never run Chrome Nano and Simulator FM at the same time** (unless §3.2 relaxed the rule). Record in sessions grouped by runtime.
2. Before an iOS session: Cmd+Q Chrome, confirm no "Google Chrome Helper" processes in Activity Monitor, and close Xcode after installing the build.
3. Before a Chrome session: `xcrun simctl shutdown all && osascript -e 'quit app "Simulator"'`, and quit Xcode.
4. Restart the Mac on filming morning. Close Slack, mail and extra tabs. Keep Claude Code idle (no builds, no subagents) during takes.
5. Do one throwaway run before each take to warm the model. Memory pressure must be **green** before you press record.
6. Record only the needed region at 1080p.
7. Simulator FM takes 18–30 s per call. Record in real time and speed up in the edit, labelled "×4".

### 6.5 Schedule
| When | Who | What |
|---|---|---|
| Fri Nov 27 | CLAUDE | Polish the storyboard screens (in a Chrome-only block, TASKS T-173). Write `docs/VIDEO.md`: script, shot list, and an **edit decision list** (clip, in/out points, speed, overlay) (TASKS T-180). |
| Sat Nov 28 (before the morning session) | CLAUDE | Rehearsal and reset scripts (§6.2, TASKS T-182); overlays in `video/` (TASKS T-181). |
| Sat Nov 28 morning | USER | **Session B, Chrome only:** Beats 3, 4, 5, 6, then the Beat 1 visuals (reuse a Beat-4 take). |
| Sat Nov 28 evening | USER | **Session A, Simulator only (Chrome quit):** Beat 2 and the Beat 7 iOS cameo. Then **Session C:** voice-over. |
| Sun Nov 29 morning | CLAUDE | Rough cut with `ffmpeg` from the edit decision list, plus overlays and `video/subtitles.en.srt` (§6.8). |
| Sun Nov 29 | USER | Review the cut and ask for changes, or trim yourself. Export, then upload **Public** by 18:00 (hard latest 23:00). |

Design polish (TASKS T-160) on Nov 29 covers only screens that aren't in the video.

### 6.6 Shot list (target ≤2:50)
The FAQ says the first 30 s must cover who it's for, the problem, and how Firebase AI Logic hybrid makes it work.

| Beat | Time | Surface / runtime | Set up before recording | Actions on screen | Must be visible | Notes |
|---|---|---|---|---|---|---|
| 1 Hook | 0:00–0:18 | Chrome + Nano; Simulator off | Hero doorstep photo; Demo profile vault (§6.2); one warm-up run | Full-screen photo, caption "This photo has no GPS data." Notes stream (labelled ×4). Verdict bar turns red with real lines (for example "Home: within 1 km" if that is what it produced). Title card. | Search chip with the notes; Router HUD | Title card: STRANGERS' EYES, "See your photo the way a stalker's AI would, before you post it." |
| 2 Vault (who and how) | 0:18–0:35 | iOS Simulator (FM); **Chrome quit** | App installed; vault empty; `simctl location` at public building A, later B; status bar override | "Pin this place": Home (A) → set location B → Work "City General Hospital" → child's name "Lucas" | Lock badge "Stays on this device. Never geocoded. Never uploaded."; Ledger shows 0 requests | VO names the audience and the Firebase AI Logic split by 0:30. Caption: parents, sellers, creators, survivors |
| 3 Offline pre-screen | 0:35–0:58 | Chrome PWA + Nano; **Simulator shut down**; **Wi-Fi OFF** | Demo profile; PWA cached; Nano `available`; pre-mask **Standard** | Drop photo → ON-DEVICE (Gemini Nano) badge + Tier-0 chip → "'LUCAS' matches your child's name. Masked on this device." → solid masks on the tag and house-number card → lanyard flagged amber "Possible identifier" → chip "Deeper check queued until you're online" | Wi-Fi off in the menu bar; HUD ON_DEVICE lines | If Nano isn't available that day, film honestly with RULES_ONLY or use the iOS take, and adjust the VO |
| 4 Red team | 0:58–1:40 | Chrome; Wi-Fi ON | Continues from Beat 3 | Consent sheet "This, and only this, will be sent." → approve → IN_CLOUD badge → notes stream with Search chip and sources → evidence boxes (stop code, sign, lanyard) → "Referee comparing guesses with your vault… on this device" (ON-DEVICE) → red verdict lines as produced (expected: "Linked to your WORKPLACE", a home band) | Ledger "Faces sent: 0 · Vault items sent: 0" throughout | Insert a 4-second split graphic in the edit: "The cloud sees masked pixels; the device holds the truth." |
| 5 Gate | 1:40–1:55 | Chrome | Same state | Untick the name-tag mask → re-check → consent sheet warns `copy.consent.unmasked`, Send stays enabled → Send → red toast "Blocked: 'LUCAS' would have left this device." → "What the cloud saw" shows only the earlier masked copy | Toast text | Must be the real gate code path. Depends on Tesseract reading the tag at 1536 px (checked Nov 21) |
| 6 Fix and re-attack | 1:55–2:20 | Chrome | Same state | Tap Fix → on-device plan text → solid fills animate → re-attack IN_CLOUD → real result → green **"Risk reduced"** → receipt line → (only if T-081's P1 share card shipped) share card with no location | "Risk reduced", never "safe"; confidence shown | Pre-tested ≥10× (§6.2); film what it really does |
| 7 Proof and platforms | 2:20–2:42 | Edit + iOS cameo from Session A | `benchmark/results/summary.md` final | Benchmark card with real numbers; iOS verdict with the Apple Foundation Models badge and Vision masks (×4); routing-table overlay | Caption "iOS 27 Simulator on Apple-silicon Mac · Apple Foundation Models on-device" | Routing table: vault and original photo ONLY_ON_DEVICE; public explanations PREFER_ON_DEVICE with cloud fallback; attacker ONLY_IN_CLOUD |
| 8 Close | 2:42–2:50 | Edit | — | Firebase stack strip as text (AI Logic hybrid, App Check, Remote Config, Anonymous Auth, Firestore if the Atlas shipped, Hosting). "Try it in any browser, no on-device AI needed: Judge Mode, about 60 seconds." URL and repo. | URL readable for ≥3 s | Text names, not product logos |

### 6.7 Voice-over draft (about 300 words)
The user rewrites this in their own words. Bracketed parts are filled from real results.
- **0:00** "This photo has no GPS data. An AI found the neighbourhood anyway, from a bus-stop code, a street sign and a staff lanyard. Deleting location data doesn't protect you any more. AI reads the street."
- **0:18** "Strangers' Eyes lets parents, sellers and creators see a photo the way a stalker's AI would, before they post it. It's built on Firebase AI Logic. Gemini in the cloud plays the attacker. The model on your device holds your secrets and judges the attack. Your vault, your home, your work, your child's name, stays on this phone. Never uploaded."
- **0:35** "Offline, Gemini Nano pre-screens the original photo on the device. It spots 'LUCAS' on the backpack, your child's name, and masks it before anything can leave."
- **0:58** "Online, you approve the exact redacted copy. Gemini, grounded with Google Search, attacks it. Then the referee on your device compares its guesses with your vault: [real verdict lines]. And the cloud has received zero faces and zero vault items."
- **1:40** "Try to send the name tag anyway, and the egress gate blocks it."
- **1:55** "One tap, and the on-device planner picks the smallest fix. Re-attack: [real result]. Risk reduced."
- **2:20** "Measured on 25 of my own photos of public places: [X] within a kilometre before the fix, [Y] after. The same loop runs on iPhone with Apple Foundation Models."
- **2:42** "Stalkers already have this AI. Now you do too, and it never learns where you live."

### 6.8 Edit, export, YouTube
**ffmpeg recipes** (Claude runs these on clips in `PRIV/video/`; outputs also go to `PRIV/video/`):
```bash
ffmpeg -i in.mov -vf "scale=1920:-2,fps=30" -c:v libx264 -crf 18 -pix_fmt yuv420p -an clip.mp4      # normalise
ffmpeg -i clip.mp4 -filter:v "setpts=PTS/4" -an clip_x4.mp4                                          # ×4 speed-up
ffmpeg -ss 00:00:05 -to 00:00:23 -i in.mov -c:v libx264 -crf 18 -an cut.mp4                           # trim
ffmpeg -i clip.mp4 -i overlay.png -filter_complex "overlay=0:0" -c:v libx264 -crf 18 clip_ov.mp4      # overlay a card
ffmpeg -f concat -safe 0 -i edl.txt -c:v libx264 -crf 18 -pix_fmt yuv420p silent.mp4                  # join clips listed in edl.txt
ffmpeg -i silent.mp4 -i vo.m4a -map 0:v -map 1:a -c:v copy -c:a aac -shortest final.mp4               # add voice-over
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 final.mp4                        # must be ≤ 180 (aim ≤ 170)
```
Claude samples frames from `final.mp4` to check the numbers, captions, absence of logos, and that no DevTools or token is visible.

**YouTube settings [USER]:**
- Title: "Strangers' Eyes: see your photo the way a stalker's AI would (Firebase AI Logic hybrid, #BuildHybridAI)".
- Description: hosted URL, repo URL, and one paragraph on the hybrid split.
- Visibility **Public**. Unlisted is a risk; the rules say "publicly visible".
- Audience: **"No, it's not made for kids"** (the Gemini terms require users to be 18+).
- Upload `video/subtitles.en.srt` as English captions.
- **No music** unless the rights are clear (the YouTube Audio Library is fine).
- Paste `YOUTUBE_URL` to Claude. Claude checks it plays while logged out and is ≤3:00.

---

## 7. Submission

### 7.1 Timeline
| When (GMT+2) | What | Who |
|---|---|---|
| Sun Nov 22 | Devpost **"Start project"** (creates an editable, deletable draft). Then Claude reads the custom questions, character limits and whether platforms can be multi-selected, **read-only**, and records them here in §7.5. | USER creates; CLAUDE reads |
| Sun Nov 29 | Claude finishes the README and `docs/DEVPOST.md`, runs the secret and PII scan (§7.2) and a clean-clone test. User approves **public** → Claude flips visibility. User pastes the Devpost text and gallery (no submit). Video Public by 18:00. | both |
| Mon Nov 30, 09:00 | Pre-submit verification against the TASKS Definition of Done. Final deploy. Tag by 10:00 (§4.8). | CLAUDE |
| Mon Nov 30, by 12:00 | **Submit** on Devpost. | USER |
| Mon Nov 30, 14:00 PT | Hard deadline; freeze | — |

### 7.2 Repo checklist
- [ ] `LICENSE` holds the unmodified Apache-2.0 text. `gh repo view --json licenseInfo` shows `apache-2.0`, and About shows "Apache-2.0 license".
- [ ] About has a description, website = hosted URL, and topics (§1.15).
- [ ] README has every section in §7.6, including run instructions for **web and iOS**, the **value proposition**, the **re-attack disclosure**, the **data-tier statement**, and benchmark limitations.
- [ ] README lists the **actual runtime call sites** with file paths, so automated or AI review finds them:
  - `import … from "firebase/ai"` with `generateContent` / `generateContentStream` in the Egress Gate file;
  - `getGenerativeModel` configs;
  - iOS `import FirebaseAILogic`, `HybridModel` and `generativeModelSession` sites.
  - Use the real paths from ARCH §3.
- [ ] `THIRD_PARTY_NOTICES.md` lists:
  - firebase JS SDK and firebase-ios-sdk (Apache-2.0);
  - @mediapipe/tasks-vision and the BlazeFace models (Apache-2.0);
  - tesseract.js and tesseract.js-core (Apache-2.0);
  - @tesseract.js-data/eng (check its licence field);
  - exifr (MIT) and idb-keyval (Apache-2.0);
  - React, Vite and Tailwind (MIT).
  - Verify against each `node_modules/*/package.json` `license` field.
- [ ] README states iOS is pinned to exact 12.19.3 because `HybridModel` was removed in 13.0.0.
- [ ] Git history starts on or after Nov 19 (new project).
- [ ] **Secret, PII and coordinate scan** (review every hit; Firebase `AIza…` web/iOS keys are expected):
  ```bash
  git grep -nIE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' -- ':!**/package-lock.json'
  git grep -nIE 'private_key|BEGIN [A-Z ]*PRIVATE KEY|client_secret|refresh_token'
  git grep -nE '[0-9]{1,3}\.[0-9]{4,}' -- ':!web/public/samples/*.json' ':!**/package-lock.json'
  git log --all --name-only --format='' | sort -u | grep -Ei '(^|/)\.env|service-?account|\.appcheck|benchmark/private|StrangersEyes-private'
  git ls-files | grep -Ei '\.(jpe?g|png|heic|webp|mov|mp4)$'      # each must be synthetic/staged, people-free, logo-free
  T=$(sed -n 's/^VITE_APPCHECK_DEBUG_TOKEN=//p' web/.env.development.local); [ -n "$T" ] && git log -p --all | grep -qF "$T" && echo "TOKEN IN HISTORY"
  I=$(cat ios/.appcheck-debug-token 2>/dev/null); [ -n "$I" ] && git log -p --all | grep -qF "$I" && echo "iOS TOKEN IN HISTORY"
  ```
- [ ] `node scripts/check-images.mjs` passes (D-106, D-119; it scans the staged copy too, so run it after `git add`): committed images keep only allowlisted JPEG segments and PNG/WebP chunks; no other image or video format, no unknown binary, no image hidden in another file or as base64; no coordinate-like value outside the allowlisted paths and the reviewed values in `scripts/check-images.allow.json` (re-read that file: every value must still be synthetic or a non-coordinate); no PRIV path, `truth*.csv`, `.env*.local`, debug-token file, key file or secret content; the secret paths are still git-ignored. It cannot judge whether a photo shows people or a real home: the image review above stays manual.
- [ ] No real vault, pins, names or coordinates in fixtures or tests. Use the fictional "Lucas" and "City General Hospital"; coordinates only in the allowlisted sample files.
- [ ] No files over 10 MB in git.
- [ ] Clean-clone test passes (web build and check; iOS `xcodegen generate` + build) by following the README literally.

### 7.3 App checklist
- [ ] Hosted URL works with no login (anonymous auth), at no cost to the judge, **in a browser without Nano**. Judge Mode goes red to green in ≤90 s.
- [ ] App Check is Enforced for AI Logic. The hosted site uses reCAPTCHA Enterprise.
- [ ] Both inference sides are demonstrably used. `inferenceSource` badges and the Ledger are visible.
- [ ] Grounded notes render Search Suggestions and sources, and are never cached across users.
- [ ] 18+ notice and "own photos only" checkbox on first run.
- [ ] The consent sheet shows the exact outgoing image. Burn vault works.
- [ ] Pre-mask default is **Standard**.
- [ ] Kill switch tested. `daily_adversary_cap` is set, and Judge Mode falls back to CACHED pass B when the cap or quota hits, so judges are never locked out.
- [ ] UI is in English. Refusals show "Adversary declined; on-device findings only".
- [ ] Budget alerts on. The site stays up until Dec 16, 14:00 PT.

### 7.4 Video checklist
- [ ] ≤3:00 (aim ≤2:50), **Public** on YouTube, English voice plus captions.
- [ ] The first 30 s cover who it is for, the problem, and how Firebase AI Logic hybrid makes it work.
- [ ] Web in Chrome with Nano **and** iOS with Apple FM, with inference badges on screen.
- [ ] No people, no real home or school, no third-party logos, no debug token or DevTools on screen.
- [ ] Real numbers only. Speed-ups labelled. Simulator footage captioned.

### 7.5 Devpost form fields [USER fills; Claude drafts the text in `docs/DEVPOST.md`]
**Confirmed by the rules and FAQ:**
1. **Platform(s):** Web/Chrome and iOS, if multi-select is allowed [UNVERIFIED until the draft exists, U-37].
2. **Text description** covering:
   1. how Firebase AI Logic is used;
   2. features and functionality;
   3. the value proposition.
3. **Public repo URL.**
4. **YouTube URL** (public, ≤3:00, English).
5. **Summary of what was built during the submission period**, disclosing tools (Claude Code, the create-vite template) and any pre-existing code (none).
6. **Testing instructions and hosted URL.** No secrets or PII.
7. Team (solo is fine). Everything in English.

**Standard fields,** [UNVERIFIED] until read from the draft:
- name, elevator pitch, thumbnail, "About the project" (Markdown), built-with tags, "Try it out" links, image gallery, video link;
- hackathon-specific questions, the rules checkbox, and **Submit**.

Claude records the real fields and limits here after Nov 22.

**Values:**
- **Name:** Strangers' Eyes
- **Elevator pitch** (165 characters, measured; Devpost usually allows 200): "The cloud plays the stalker; your device holds the answers. See what AI can infer from your photo and fix it before you post. The attacker never learns it was right."
- **Built with:** firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, firebase-app-check, firebase-remote-config, cloud-firestore (only if the Atlas shipped), firebase-auth, firebase-hosting, react, typescript, vite, tailwindcss, swiftui, vision, mediapipe, tesseract.js
- **Try it out:** hosted URL, repo URL
- **Thumbnail:** `docs/img/thumbnail.png`, 3:2, no third-party logos.
- **Gallery** (no third-party logos, no real home or school):
  1. hero shot;
  2. capability panel;
  3. red verdict with the Ledger reading "Faces sent: 0 · Vault items sent: 0";
  4. blocked-leak toast;
  5. green "Risk reduced";
  6. S0–S4 routing/architecture diagram;
  7. benchmark table;
  8. iOS screen with the Apple FM badge.

**Testing-instructions template:**
```
1. Open HOSTED_URL in any browser (desktop or mobile). No login: an anonymous session is created automatically. Free.
2. Click "Judge Mode": 3 synthetic, people-free scenes and a fictional vault load. Press Run. The full loop runs red→green in about 60–90 s.
3. Watch the Router HUD (bottom-left): every step is labelled ON-DEVICE, IN_CLOUD or RULES-ONLY, with latency.
   The Cloud Ledger (right) counts exactly what left the device.
4. Optional on-device AI: Chrome desktop with on-device AI enabled (chrome://settings/ai and
   chrome://flags/#prompt-api-for-gemini-nano-multimodal-input), then reload. The capability panel shows Gemini Nano.
5. Try your own photo: drop in a people-free photo. An empty vault still shows the clue map and the attacker's precision.
Notes: for users 18+. Available until the end of judging. iOS is shown in the video; build steps are in the README
(needs your own Firebase project, your own GoogleService-Info.plist and an App Check debug token).
```

### 7.6 README skeleton (Claude writes it on Nov 29 from real results)
```markdown
# Strangers' Eyes: see your photo the way a stalker's AI would, before you post it
[Live app](HOSTED_URL) · [3-min demo](YOUTUBE_URL) · Apache-2.0 · Built for #BuildHybridAI 2026 (Web + iOS)

> The cloud plays the attacker. Your device holds the answers. The attacker never learns whether it guessed right.

## Why (Potential Impact)
- Platforms strip GPS, yet multimodal AI geolocates photos from pixels alone (signs, stop codes, logos, window views).
- No tool knows what *you* must hide: your home, your workplace, your child's name.
- Who: parents, marketplace sellers, creators. Highest need: domestic-violence survivors, journalists, activists. Global by construction.
- Value proposition: <one line>.

## Try it in 60 seconds (judges)
Hosted URL, no login, free. Judge Mode. Works without on-device AI; with Chrome + Gemini Nano it also runs on-device.

## How we use Firebase AI Logic hybrid inference (Technological Implementation)
| Job | Class | Web (`firebase/ai`) | iOS (`FirebaseAILogic`) | Model | If no on-device model | Call site |
|---|---|---|---|---|---|---|
| Tier-0 guard (W2/I2) | local | MediaPipe faces, Tesseract OCR, EXIF strip (deterministic, not generative) | Vision, ImageIO | — | always local | path |
| Pre-screen original photo (W3a/I3) | S1 | ONLY_ON_DEVICE, image + responseConstraint | device-only session over Vision text, @Generable | Nano / Apple FM | Tier-0 rules, never cloud | path |
| Vault text match (W3b) | S0 | ONLY_ON_DEVICE | device-only session | Nano / Apple FM | deterministic fuzzy match | path |
| Referee (W4/I4) | S0 | ONLY_ON_DEVICE | device-only session | Nano / Apple FM | deterministic matcher | path |
| Fix planner (W5/I4) | S0 | ONLY_ON_DEVICE | device-only session | Nano / Apple FM | mask every cited removable clue | path |
| Clue explainer (W8/I5) | S2 | PREFER_ON_DEVICE | HybridModel | Nano/FM → gemini-3.5-flash-lite | real SDK cloud fallback (badged) | path |
| Adversary notes (C1) | S3 | ONLY_IN_CLOUD + googleSearch, streamed | generativeModel + googleSearch | gemini-3.8-flash | — | path |
| Adversary JSON (C2) / re-attack (C3) | S3 | ONLY_IN_CLOUD, responseJsonSchema | generativeModel + responseSchema | gemini-3.8-flash | — | path |
| Judge Mode samples | S4 | PREFER_ON_DEVICE | HybridModel (P2 sample scenes, if shipped) | Nano/FM → gemini-3.5-flash-lite | cloud | path |
- Egress Gate (W7/I6): every call goes through `<path>`. It refuses S0/S1 on cloud-reachable modes, checks on-device availability before S0/S1 (without `window.LanguageModel` the SDK silently uses the cloud), re-checks the outgoing bitmap (0 faces, 0 vault OCR hits, no EXIF), scans prompts for vault strings, and logs `inferenceSource` to the Ledger.
- Architecture diagram (S0–S4).

## Other Firebase products
App Check (reCAPTCHA Enterprise; debug provider in the iOS Simulator) · Anonymous Auth (per-user quotas, no identity) · Remote Config (routing policy, model names, prompt versions, caps, kill switch; cached offline) · Firestore (opt-in anonymous Leak Atlas: counts of attacker-reported clue types only; rules-validated +1 increments). Drop this item if the Atlas was cut. · Hosting (PWA).

## Features (Design)
Capability panel · vault (encrypted, never synced) · Tier-0 guard · Nano pre-screen · consent sheet · grounded red team with Search Suggestions · on-device referee with distance bands · verdict card · one-tap fix · re-attack · "Risk reduced" · Egress Gate + Ledger + "What the cloud saw" · Router HUD · offline PWA · share card without location · burn vault · iOS app.

## Safety, privacy and dual use (Quality of Idea)
What never leaves the device; faces always masked; solid masks, never blur; local files only (no URL input); distance bands to *your* pins only, never a map pin for the guess; refusals never retried; grounded output never cached across users.
Data tier: <paid tier: not used to train Google's models | free tier: may be used to improve Google's products; not offered to EEA/UK/CH users>. 18+.
When you re-attack, the cloud sees which areas you masked, but never why.
The raw JSON is visible in DevTools, and the added harm over the public Gemini app is close to zero (stated honestly).

## Prior art and what is new
(see the citations list)

## Measured results
(table from benchmark/results/summary.md + method + limits: n=25, k=3, one region, public places only, builder-owned photos, pass B only)

## Run it yourself
Web: Node ≥24.12 (tested 26.8.2); `cd web && npm ci && npm run dev`; your own Firebase project; App Check debug token in `web/.env.development.local` (never commit).
iOS: Xcode 27, iOS 27 Simulator, Apple Intelligence on; replace `ios/StrangersEyes/Resources/GoogleService-Info.plist` with your own project's; register your own App Check debug token (`AppCheckDebugToken` env var); firebase-ios-sdk **exact 12.19.3** (HybridModel was removed in 13.0.0).
Deploy: `firebase deploy --only hosting,firestore,auth,remoteconfig`.

## Repo map
## Built during #BuildHybridAI (Nov 19–30 2026)
New project; written with Claude Code (AI coding assistant); create-vite template; third-party libraries in THIRD_PARTY_NOTICES.md.
## Limitations and roadmap
iOS hybrid SDK is Experimental; Simulator gaps (no on-device tools or vision); Chrome's on-device model needs capable hardware; Android planned (Gemini Nano 4, same Firebase project).
## License
Apache-2.0
```

### 7.7 Devpost "About the project" skeleton
```markdown
## Inspiration
Deleting GPS data no longer protects a photo: AI reads the street. <incident + stat, cited>. Parents, sellers, creators, survivors.

## What it does
Vault (device) → pre-screen and pre-mask (device) → red team on a redacted copy (cloud) → referee (device) → fix (device) → re-attack (cloud) → "Risk reduced". The attacker never learns whether it guessed right.

## How we built it with Firebase AI Logic
- Routing by sensitivity class, stored in Remote Config and enforced by one Egress Gate: S0/S1 ONLY_ON_DEVICE (no cloud fallback; deterministic code instead), S2 PREFER_ON_DEVICE with a visible cloud fallback, S3 ONLY_IN_CLOUD with Google Search grounding, S4 PREFER_ON_DEVICE for judges.
- Web: firebase/ai hybrid (Gemini Nano in Chrome: image + JSON schema; inferenceSource badges). iOS: FirebaseAILogic HybridModel and on-device-only sessions with Apple Foundation Models; Vision for pixels.
- Two adversary passes: grounded notes (display only, with Search Suggestions) and an independent ungrounded JSON pass that feeds the on-device referee.
- App Check, Anonymous Auth, Remote Config, Firestore (if shipped), Hosting.
## Challenges we ran into
(e.g. ONLY_ON_DEVICE silently uses the cloud without window.LanguageModel → gate pre-checks; HybridModel removed in iOS SDK 13 → pinned 12.19.3; Simulator FM has no tools or vision → @Generable over Vision text; 8 GB RAM)
## Accomplishments that we're proud of
(benchmark numbers; "Faces sent: 0 · Vault items sent: 0")
## What we learned
## What's next
Android (Gemini Nano 4), a "check before you post" extension, any-language templates.
## Built during the submission period
New project started Nov 19 2026; all code written during the period with Claude Code; libraries in THIRD_PARTY_NOTICES.md.
## Testing instructions
(§7.5 template)
```

### 7.8 Prior art and citations
Re-verify every figure before it goes on screen. Cite by title, venue and DOI or arXiv ID. Do not name private individuals.

| Item | Use | Status |
|---|---|---|
| arXiv 2503.20226, "Raising Awareness of Location Information Vulnerabilities in Social Media Photos using LLMs", ACM CHI 2025, DOI 10.1145/3706598.3714074 | Closest prior art (warn, edit, re-analyse loop; 19-participant, 2-week study) | Abstract read. Implementation details (GPT-4, pytesseract, blur/crop/sticker) **[UNVERIFIED]**: check the PDF before citing them (U-49) |
| Geo-Safe-Filter, TikTok TechJam 2025 (awpbash.github.io/projects/geo-safe-filter) | Prior art (Gemini 2.5 Flash + Grounding DINO + blur, GeoCLIP) | Page read |
| GeoSpy (404 Media, Jan 20 2025) | Offensive tool that already exists | Article read |
| o3 "reverse location search" trend (TechCrunch, Apr 17 2025) | Problem framing | Article read |
| DoxBench, arXiv 2504.19373 (ICLR 2026) | Research context | Cited by researcher |
| VLM-GeoPrivacy, arXiv 2602.05023 (ICLR 2026): Gemini 2.5 Flash exposed the exact location in 46.8% of cases where it should have withheld it (95.6% under malicious prompting) | Stat | **Re-check in the PDF** (came from an HTML summary) |
| Privacy International, "Nowhere to Hide?" (Feb 2026): "up to" about 60% street-level (1 km) accuracy on social-media-like images; much lower on Street View-style images | Stat | Always use "up to" plus the caveat |
| arXiv 2502.11163 (EMNLP 2025): city-level 53.8%; lower in less developed and sparse regions | Sets honest expectations | Cited by researcher |
| Tokyo 2019 stalking case (NBC News/AP, Oct 11 2019; pupil reflections plus street imagery) | Incident | Done by hand, before modern AI; say so |
| US Army 2012 geotagging article (Iraq 2007 helicopter attack) | The "old" EXIF threat | — |
| McAfee 87–91% claim | **Keep off screen** (vendor claim; details unclear) | [UNVERIFIED] |

**What is new (lead with this):**
1. The private on-device vault as ground truth.
2. A referee the attacker never sees.
3. An enforced egress gate with a ledger.
4. Routing by sensitivity class in Remote Config.

### 7.9 Final submit steps [USER]
1. Open the Devpost draft and fill every field from `docs/DEVPOST.md`.
2. Paste the URLs: hosted, repo, YouTube.
3. Check that the video plays in a private window and the repo opens while logged out.
4. Accept the rules, then **Submit** by 12:00 GMT+2 on Nov 30. Screenshot the confirmation.
5. Tell Claude "submitted". Claude logs the time, links and tag SHA in PROGRESS and adds the judging-window checklist (§4.8).

Claude never clicks Submit and never accepts terms on the user's behalf.

---

## 8. Troubleshooting

### 8.1 App Check, 401 and 403
| Symptom | Likely cause | Fix |
|---|---|---|
| AI calls fail with `AIError fetch-error`, status 401/403, "App Check token invalid/missing"; Network shows no `X-Firebase-AppCheck` header | `getAI()` ran before `initializeAppCheck()`/`getAuth()` (AIService captures them once) | Fix the init order (§2.4) and hard-reload |
| Fails on localhost only | Debug token not registered; flag set **after** `initializeAppCheck`; env file not loaded (it must be `web/.env.development.local`, and only under `npm run dev`); new profile or cleared site data with auto tokens | Register or save the token (§1.7b). Set the flag first. Restart `npm run dev` after env changes |
| Fails under `vite preview` | Production build: `DEV` is false, so there is no debug token | Expected. Test production builds on the hosted site |
| Fails on the hosted URL only | reCAPTCHA domains miss `PROJECT_ID.web.app`/`.firebaseapp.com`; checkbox-type key; site key in code ≠ App Check registration; preview-channel domain | Fix the key (§1.7a), redeploy, wait up to 15 min |
| App Check errors `appCheck/recaptcha-error`, `fetch-status-error`, `throttled` | After a 403 on the token exchange, the SDK backs off (reportedly 1 day, held in memory) [UNVERIFIED; check `node_modules/@firebase/app-check`] | Fix the cause, then hard-reload or open a new tab |
| 401 after enabling authenticated-users mode | AI call made before anonymous sign-in finished | Await sign-in before any cloud call: web `ensureAuth()` (D-110; retried after a failure), iOS the equivalent |
| 403 PERMISSION_DENIED mentioning `firebasevertexai.googleapis.com` disabled | AI Logic onboarding not done | §1.4 |
| iOS cloud calls rejected | `setAppCheckProviderFactory` not called before `configure()`; token not registered; reinstall made a new auto token; `SIMCTL_CHILD_AppCheckDebugToken` not picked up | Fix the order. Register the token. Fall back to reading the auto token from the logs (§2.9) |
| reCAPTCHA domain warnings on localhost | Expected; the provider still loads `enterprise.js` in debug mode | Ignore |

### 8.2 Nano not available
| Symptom | Likely cause | Fix |
|---|---|---|
| `'LanguageModel' in self` is false | Not Chrome desktop; a worker or cross-origin iframe (needs `allow="language-model"`); On-device AI off in `chrome://settings/ai`; Chrome not relaunched; (hosted) origin trial question | §1.13, §3.1; §3.4 for hosted |
| Claude-in-Chrome can't see `LanguageModel` | Extension attached to a different profile, or the page is not top-level | Attach it to the Nano profile, or have the user paste the snippet |
| `availability()` = `unavailable` | Hardware gate (8 GB is below the 16 GB CPU path, so it relies on the GPU path; Chrome reported vram_mb 5461); free disk <22 GB; multimodal flag off | `df -h /`; enable the flag; check `chrome://on-device-internals` → Broker State. Last resort: iOS carries the on-device story, and the web shows Tier-0 plus cloud honestly. Log it as a decision |
| `downloadable` / `downloading` | Model not ready for these options | `initializeDeviceModel()` **from a click handler**, with progress. Until it finishes, PREFER mode quietly uses the cloud and S0/S1 run RULES_ONLY |
| `AIError api-not-enabled` or `unsupported` with ONLY_ON_DEVICE | Model unavailable | The gate should have pre-checked. The S0/S1 fallback is **deterministic code**, never the cloud |
| Image prompt goes to the cloud in PREFER mode | WebP/HEIC or another non-JPEG/PNG part | Always re-encode to JPEG |
| Structured output ignored or invalid | `Schema` instance passed to Chrome [UNVERIFIED, U-04]; schema too complex | Plain JSON Schema; keep it small; validate in code |
| Instructions ignored on device | `systemInstruction`, `generationConfig` and `tools` never reach the device | Put instructions in the user turn; schema in `promptOptions.responseConstraint` |
| Very slow, or the Mac swaps | Simulator or Xcode running; first call loads the model | §2.10, §6.4; warm up first |
| Prompt too long | Over the 9,216-token on-device input limit; `countTokens` doesn't work on device | Trim: ≤12 claims, ≤20 short vault labels, 768 px image |
| Gemma 4 flag broke things | The new component doesn't fit in 8 GB | Set the flag to Default, relaunch, re-check v3Nano (§3.3) |

### 8.3 Apple FM and iOS
| Symptom | Fix |
|---|---|
| `.unavailable(.appleIntelligenceNotEnabled / .modelNotReady)` | Turn Apple Intelligence on for the Mac and wait for the download (§1.12); restart the Simulator |
| App won't install ("requires newer iOS") | Deployment target must be **27.0**; only the 27.0 runtime is installed |
| Tool call fails (`Code=5000`) | Known Simulator gap. Use `@Generable` guided generation |
| Image `Attachment` fails (`ModelManagerError 1001`) | Known gap. Vision handles the pixels; FM gets text |
| Vision faces fail with `internalError("Could not create inference context")` | Set the CPU compute device under `#if targetEnvironment(simulator)` |
| An S0/S1 prompt reached the cloud | It was put in a `HybridModel` session, which falls back on **any** error. Use the device-only session for S0/S1 |
| GPS still present in exported HEIC or PNG | `CGImageDestinationCopyImageSource` doesn't strip it. Decode and re-encode the pixels to JPEG (bake the orientation first) and verify there is no GPS dictionary |
| `contextSize` reports 0 | Simulator bug. Budget with `tokenCount(for:)` and stay under 4,096 tokens |
| Path A won't compile or run | Path B 13.2.0 (§3.5). Log it as a decision |
| SPM resolve or build very slow | `-clonedSourcePackagesDirPath ios/.spm`, `ARCHS=arm64`; no FirebaseFirestore |

### 8.4 Refusals and blocked responses
| Symptom | Handling |
|---|---|
| `response.text()` throws `AIError response-error` (SAFETY, SPII, PROHIBITED_CONTENT, BLOCKLIST, or `promptFeedback.blockReason`) | State `blocked`. Show "Adversary declined; on-device findings only". **Never re-prompt or reword** |
| Pass B `audit_status: "declined"`, or pass A starts with `DECLINED:` | Same as above |
| `finishReason` is `MAX_TOKENS` and the JSON is truncated | Treat it as a failure (`truncated`). Retrying the identical request once is fine; this is not a refusal. Don't set `maxOutputTokens` low (whether thinking tokens count toward it is [UNVERIFIED, U-12]) |
| High refusal rate in the spike | Check that faces are masked, that no names, plates or addresses are in the prompt, and that the advA/advB v1 framing ("owner-commissioned audit, scene only") is used. A **global** model change through Remote Config after measuring is a product decision. **Per-request model hopping or reframing to get past a refusal is not allowed.** If G1 still fails, ask the user (§5.1) |
| Cloud returned vault text | The gate's response scan flags it. The UI masks it and logs `{vaultItemId, kind}` only |

### 8.5 Quota, 429 and billing
| Symptom | Cause / fix |
|---|---|
| `fetch-error` status 429 | Per-user AI Logic RPM (ours 30), Gemini RPM/RPD/TPM, or grounding RPD (default 1,500 per project). Back off with jitter; respect `daily_adversary_cap`. Judge Mode falls back to CACHED pass B. Check Cloud console → APIs & Services → Firebase AI Logic API → Quotas |
| Grounding errors or "not available" | Project not on the paid tier: §1.3, or `grounding_enabled=false` |
| HTTP 400 | `presencePenalty`/`frequencyPenalty` set; thinking MINIMAL on 3.8/4.x; `thinkingBudget` on 4.x; both `thinkingLevel` and `thinkingBudget`; both `responseSchema` and `responseJsonSchema`; schema too large or deep (U-45); retired model name |
| Spend higher than expected | Budget alerts and grounded-query counts (billed per search query after 5,000 free a month). Lower `daily_adversary_cap`; kill switch only for abuse |
| Paid tier stops working (prepayment used up?) | [UNVERIFIED] behaviour. USER checks billing in AI Studio |
| Anonymous sign-in rate-limited | Per-IP limit on new anonymous users. The SDK reuses the persisted user, so don't clear storage in loops |

### 8.6 Egress Gate, tripwire and Judge Mode
| Symptom | Cause / fix |
|---|---|
| Ledger shows `in_cloud` for an S0/S1 job, or BREACH / tripwire `LOCAL_LOCK` | **Stop the line.** The gate pre-check or interlock failed. Fix it, add a unit test, and note in PROGRESS that test data may have left |
| Tripwire `NO_PERMIT` | An AI request was issued outside the gate (bypass) or before the gate granted a permit. Find the call site; `check-boundaries.mjs` should have caught it. If AI requests escape the tripwire at startup, check that `import './ai/tripwire-install';` is line 1 of `main.tsx` (ARCH §8.5, §15.1): static ESM imports are evaluated before `main.tsx`'s body, so an `installTripwire()` statement in the body runs too late. Under `vite preview`, confirm the bundle keeps that order (U-54) |
| Judge Mode S4 calls BLOCKED with vault text in image or prompt | S4 must use the sample-allowlist exception (SPEC §7.1); the sample "LUCAS" and fake labels are expected. Judge Mode never loads the real vault (D-37), so a block naming a real-vault item is a bug: check that the gate, preflight and tripwire use `vaultScan`'s active (JUDGE_VAULT) index (ARCH AD-17, §8.4) |
| Gate blocks FACE but the editor showed no face mask | Should not happen: Tier-0, the consent dry run and the gate all use `face_min_confidence` 0.3 (D-30), and the dry run auto-masks new faces on the exact outgoing bytes (≤ 2 rounds). Check: (1) the HUD shows the same RC value for Tier-0 and the gate; (2) the face overlaps a mask the user un-ticked (expected: the leak demo); (3) the dry run hit its 2-round limit (Send should then be disabled). Add a manual mask and note the case in PROGRESS |
| Gate blocks VAULT_TEXT that the editor didn't flag | Should be rare: Tier-0 OCRs the 1600 px downscale (`ocr_max_px`), and the consent dry run OCRs the exact outgoing ≤1536 px JPEG and auto-masks new vault hits (≤2 rounds) before Send is enabled (D-30, ARCH §8.3, SPEC AC-134). Check: (1) the hit overlaps a mask the user un-ticked (expected: the leak demo, AC-135); (2) the dry run hit its 2-round limit (Send should then be disabled, AC-133). Otherwise it is a preflight bug: add a unit test and note it in PROGRESS |
| Judge Mode autoplay stalls | Usually one of the gate blocks above. Check the HUD's BLOCKED line and its reason code |
| Forced-leak beat doesn't block | Tesseract can't read the tag at 1536 px. Larger, bolder, matte, high-contrast tag (§1.14), or move the camera closer |

### 8.7 Build, PWA, Hosting, Remote Config, Firestore
| Symptom | Fix |
|---|---|
| `vite build` errors on a precache file over 2 MiB | `maximumFileSizeToCacheInBytes: 32 MiB` |
| `non-precached-url index.html` | `globPatterns` must include js, css and html (setting it replaces the defaults) |
| Users stuck on an old version | `sw.js` and `index.html` need `no-cache` (§4.2); `registerType: 'autoUpdate'` |
| Tesseract "Error attempting to read image" | It rejects `ImageBitmap`. Pass a canvas, OffscreenCanvas or Blob |
| Tesseract returns no word boxes | Pass `{ blocks: true }` as the **third** argument of `recognize` |
| Tesseract core 404 | `corePath` must be the **directory** `/vendor/tesseract-7.0.0/core` holding the three `*-lstm.wasm.js` files |
| MediaPipe `INFO: Created TensorFlow Lite XNNPACK delegate` via `console.error` | Harmless |
| MediaPipe first `detect()` takes 5 s | Use `delegate: 'CPU'` for still images |
| MediaPipe wasm 404 | `FilesetResolver.forVisionTasks('/vendor/mediapipe-1.2.3/wasm')`, no trailing slash, and copy-assets ran |
| HEIC upload fails in Chrome | `createImageBitmap` can't decode it. Show "convert to JPEG" |
| Gate says "metadata present" on a clean JPEG | Chrome's canvas JPEG always has APP0 (JFIF) and APP2 (ICC). Gate only on APP1/APP13 and GPS |
| Remote Config values stale, or defaults only | Read after `ensureInitialized`; set the fetch interval in code (default 12 h); `fetchTimeoutMillis` 8 s; `onConfigUpdate` for real time |
| Firestore `initializeFirestore` throws on HMR | Initialise once, in a module singleton |
| Firestore writes "hang" offline | Expected (they resolve on server ack). Use `void setDoc(...)` |
| Emulator refuses Java 17 | Use `$FB13` for emulators (§2.6), or Java 21 with the user's approval (`brew install openjdk@21` is a system change) |
| Old CLI rejects the root `firebase.json` during rules tests | Run the rules tests from the root `tests/rules/` with its own `firebase.json` (§2.6) |
| `firebase deploy` hits the wrong project, or "not logged in" | Check `.firebaserc`; the USER reruns `login` |
| Search Suggestions unstyled or broken | Render `renderedContent` unmodified in a shadow root. A CSP may be blocking its inline styles |
| GitHub secret-scanning alert for `AIza…` | Expected for Firebase keys. Optional hardening [UNVERIFIED that AI Logic keeps working; re-test afterwards]: Cloud console → APIs & Services → Credentials → browser key → website restrictions for the hosted domains plus `localhost:5173`/`4173` |

### 8.8 Contingency triggers (always ask the user, then log a decision)
| Trigger | Planned response |
|---|---|
| G1 fails (>2 refused or <4 located) or is borderline | Ask the user (TASKS T-034). Recommended fallback is **Blindfill** on Nov 21; the router, Egress Gate, Ledger, Tier-0 and vault carry over. **No pivot without a yes**; keep building carry-over pieces while waiting |
| G1b shows fixes rarely move the band | Tell the user on Day 1. Consider text-rich scenes, crop suggestions, and honest framing ("Partly reduced") |
| G2 fails (Chrome Nano can't do image + JSON) | iOS carries the on-device footage. The web shows Tier-0 plus cloud honestly; S2 stays PREFER for a visible fallback |
| G3 fails (iOS Path A) | Path B 13.2.0 with an app-code fallback, disclosed in the README |
| Behind schedule | Apply the **cut order in TASKS** (the single canonical list); log each cut |
| Blaze declined | Free-tier mode (§1.3), with disclosure |
| Discord says MediaPipe/Tesseract aren't acceptable | Stop and decide with the user. Tier-0 is core to the privacy promise |

---

## Appendix A. Open [UNVERIFIED] items to close (tick here, flip the tag in API-NOTES, log in PROGRESS)
- [ ] `chrome://settings/ai` toggle label; whether the multimodal flag is still needed on Chrome 157 (U-02)
- [ ] Nano `available` for text+image on this 8 GB M1 through the SDK (U-01, G2)
- [ ] Nano on the hosted origin without an origin trial (U-10, §3.4)
- [ ] Gemma 4 flag on 8 GB (U-03, §3.3)
- [ ] Chrome accepts a Firebase `Schema` instance as `responseConstraint`, and `nullable:false` (U-04)
- [ ] Chrome unloads the Nano model when no page uses it (§3.2; decides invariant 10)
- [ ] Claude-in-Chrome extension can see `LanguageModel` on the user's Nano profile (§3.0)
- [ ] Debug mode works with a placeholder reCAPTCHA site key (§1.7a)
- [x] `create-vite@9.3.4` non-interactive invocation (§2.3): verified Nov 19 (T-023)
- [ ] Playwright `channel: 'chrome'` on this Mac; Vitest/Playwright support Vite 8 (§2.6)
- [ ] `firebase init ailogic` (U-16). Done Nov 21: `deploy --only auth` and `--only remoteconfig` on a fresh project (U-17, D-126)
- [ ] `firestore:databases:create` ID syntax for `(default)` (U-18)
- [x] `apps:create IOS --bundle-id` and `apps:sdkconfig --out` flags (§1.6): verified Nov 20 (T-025). Still open: `remoteconfig:rollback` flags (§4.4)
- [ ] Rules-test `firebase.json` with a `../` rules path under CLI 13.35.1 (§2.6)
- [ ] `SIMCTL_CHILD_AppCheckDebugToken` reaches the App Check SDK (§2.8)
- [ ] XcodeGen `project.yml` (§2.7) generates and builds
- [ ] Per-user AI Logic quota identity: App Check token, UID or IP (U-09)
- [ ] Hosting MIME and encoding for `.wasm`, `.tflite`, `.gz`; `/@(…)` header glob (U-20, U-21)
- [ ] Cast `seed` honoured by gemini-3.8/4.x (U-11); thinking tokens vs `maxOutputTokens` (U-12)
- [ ] `ADV_B_SCHEMA` accepted without a 400 (U-45)
- [ ] HybridModel on-device inside the Simulator through the Firebase wrapper; runtime `modelVersion` strings (U-23, U-24); iOS App Check token exchange (U-25)
- [ ] `PhotosPicker` keeps GPS EXIF (U-26); `CGImageSourceCreateThumbnailAtIndex` with transform bakes orientation (U-27)
- [ ] Face detection recall, full-range vs short-range, on real demo photos (U-31)
- [ ] Tesseract reads the printed LUCAS tag at 1536 px (Nov 21 check)
- [ ] Nano model shared between Chrome profiles ("Demo" and "Judge" profiles, §6.2)
- [ ] Devpost custom questions, multi-platform selection, character limits (U-37)
- [ ] Simulator footage acceptable for iOS judging (U-38)
- [ ] MediaPipe and Tesseract vs "all AI inference through Firebase AI Logic" (U-39)
- [ ] v3Nano accepted as "Gemini Nano 4" (U-40)
- [ ] App Check web throttle behaviour after a 403 (§8.1)
- [ ] VLM-GeoPrivacy figures and arXiv 2503.20226 details, from the PDFs (U-49)

## Appendix B. Session hand-off reminders
- After any setup step or verification:
  - update the PROGRESS Key values and Decisions log;
  - remove the matching [UNVERIFIED] tag here and in API-NOTES.
- When a USER action is pending:
  - it is already listed in TASKS §4 and in §1.0 here;
  - remind the user at the start of the next session with the exact steps;
  - then work on something unblocked.
- Never leave the Simulator running at the end of a session: `xcrun simctl shutdown all`. Stop any dev servers you started.
- Never commit with `git add -A`. Run the §2.2 pre-commit checks every time.
