# PROGRESS: Strangers' Eyes

> Read this first in every session (CLAUDE.md, then this file, then `docs/TASKS.md` §1).
> Template: TASKS Appendix A.
> **Never Read a whole doc.** Grep for the task ID, AC ID or § heading, then Read with offset/limit.

## STATE (overwrite in place; never append here)
- Today: Fri Nov 20 2026 (Day 2)
- Now: **T-031 (started 08:20 GMT+2), paused**: free-tier daily quota for the adversary model is used up (see WIP).
- Next: finish T-031 (needs the user's choice: paid tier now, or resume after the free quota resets), then T-034. Unblocked meanwhile: T-027 iOS skeleton, T-051, T-087, T-093, T-058.
- Blocked: T-031 on the gemini-4-hydrogen free quota (20 requests/day/model); gemini-3.8-flash unusable today (503 timeouts).
- Last green commit: see git log (T-031 WIP commit). `npm --prefix web run check` green: 169 tests, 45 boundary cases, prompt hashes (all drafts).
- Checkpoints: G1 in progress (3/10 photos) | G1b – | G2 – | G3 – | slice Nov 22 – | loop Nov 24 – | hosted Nov 25 –
- Adversary model: **gemini-4-hydrogen for T-031** (D-73; flash unusable on Nov 20; re-test flash before the RC default) | iOS path: A (firebase-ios-sdk 12.19.3)
- Cuts applied: none

## WIP (exact next step if a task is half-done)
- **T-031** (Nov 20): spike code, dry run, review (24 confirmed fixes applied) and 3 of 10 photos done on gemini-4-hydrogen; raw in `PRIV/raw/spike-2026-11-20T07-56-18-live.json`. Stopped by the circuit breaker on `429 You exceeded your current quota` = free tier **20 requests/day/model** (Cloud console → Gemini API → Quotas).
  - To resume: `VITE_SPIKE=1 npm --prefix web run dev -- --port 5174 --strictPort`, then `node benchmark/spike/run-spike.mjs --mode live --primary hydrogen --models hydrogen --photos 03,04,05,06,07,08,09,10 --probe u12` (03 again: its run 3 and fix rerun failed on quota). Then `node benchmark/spike/score-spike.mjs <first raw> <resume raw>` (later file wins per photo) → `benchmark/spike/day1-adversary.md`.
  - Then: PROGRESS gate table, release advB.v1 (D-62), tick T-031, T-034 decision.

## USER pending (mirror of TASKS §4: ID · due · status)
Sitting A is due tonight or Fri Nov 20 morning, in this order:
- T-007 Chrome on-device AI flag; connect Claude-in-Chrome · Fri Nov 20 · open
- T-015 (optional) Discord questions · Fri Nov 20 · open

Later: Sitting B (T-012, T-011) after T-025; Sitting C (T-010, T-014, T-017) Nov 21–22; the rest per TASKS §4.

## Key values (non-secret only)
| Key | Value |
|---|---|
| PROJECT_ID | `strangers-eyes`, project number 320898500558 (created Nov 20 by Claude in the console at the user's request; Google Analytics OFF, Gemini in Firebase console assistant OFF; Spark plan until T-003) |
| WEB_APP_ID / IOS_APP_ID | web `1:320898500558:web:a71a1817cde2f1775f0d9f` (`strangers-eyes-web`) / iOS `1:320898500558:ios:a073e67f8281ab135f0d9f` (`strangers-eyes-ios`) |
| BUNDLE_ID | `dev.strangerseyes.app` (D-69) |
| RECAPTCHA_SITE_KEY | `6LdCXCkuAAAAANlqU9u7c_5qzN-HniVZn-kyN78a` (public; key `strangers-eyes-web`, score-based) |
| Firestore location | |
| HOSTED_URL | |
| REPO_URL | https://github.com/PRIEST099/strangers-eyes (PRIVATE until T-170, Nov 29) |
| YOUTUBE_URL | |
| Devpost draft URL | |
| submission-v1 SHA | |

Never record here: debug tokens, the CLI token, passwords, billing details, real coordinates.

## Day-1 gate results
| Gate | Metric | Result | Evidence |
|---|---|---|---|
| G1 | refused / 10; located (d ≤5 km, ≥2 of 3) / 10; doorstep subset refusals | | |
| G1b | band moved after fix / located; median radius_km | | |
| G2 | availability; valid on_device JSON image/text (x/5); median latency; memory | | |
| G3 | @Generable on-device; HybridModel modelVersion; cloud via debug token; latency | | |

Pre-gate facts already verified on Nov 19:
- Chrome v3Nano is downloaded on this Mac.
- `@Generable` works on-device in the iOS 27.0 Simulator.
- The firebase-ios-sdk 12.19.3 probe builds.
- The `firebase/ai` snippet passes `tsc --strict`.
- The Firestore rules emulator run passes 20/20.
- **Tier-0 in the app (T-023):** EXIF/GPS strip, MediaPipe faces, Tesseract OCR, vault crypto and solid masks all pass in Chrome 156 (Browser pane).

## Decisions log
Canonical IDs:
- **D-01..D-39** are in SPEC §0.4 (read them there).
- **AD-xx** are in ARCH §2. Where an AD duplicates a D, the D wins.
- **The next free number is D-74.**

- D-00 (Nov 19) Idea: **Strangers' Eyes**, chosen by a 29-agent tournament (score 8.18) and approved by the user. **Blindfill** is the Day-1 fallback, *only* with the user's OK if G1 fails (TASKS T-034). Health/Rwanda "Muganga" was rejected (the user wants a global idea).
- D-00a (Nov 19) Platforms: Web PWA (primary) + iOS. **Android cut**: no physical device, and the emulator has no Nano.
- D-00b (Nov 19) Docs produced by the verify → draft → critique → revise workflow (18 agents). Raw notes: `research/workflow-planning/`.
- D-00c (Nov 19) SPEC §0.4 already uses D-26..D-39, so new decisions start at D-40.
- D-40 (R-01) **Remote Config:** ARCH §13.2/§13.3 (then the root `remoteconfig.template.json`) is the only key list, 27 keys. There is no `clue_types`, no `temperature` and no `request_timeout_ms` (`timeouts_ms` per job). `ocr_max_px` 1600; `auto_mask_types` is SPEC SCR-06's 5 types; `daily_adversary_cap` is 20 per local day (an A+B pair = 1). Defaults are read from the template itself.
- D-41 (R-02) **Leak Atlas** = +1 counters per distinct pass-B clue type of the first attack only. No outcome, band, precision or fix counters (this amends SPEC D-11). Rules = `research/day1-artifacts/firestore-tests/` (20/20).
- D-42 (R-08) **Paths:**
  - assets in `web/public/vendor/{mediapipe-1.2.3/wasm, tesseract-7.0.0/{worker.min.js,core,lang}}` (gitignored, versioned);
  - models in `web/public/models/blaze_face_{full,short}_range.tflite`;
  - rules tests in root `tests/rules/` (own firebase.json, port 8181);
  - DEV code in `web/src/dev/{spikes,selftest,slice,bench}`; only `spikes/` may call the SDK directly.
- D-43 (R-17) **BREACH** (AC-022): a LOCAL_LOCK trip, or an S0/S1 response reporting in_cloud, marks the page session compromised. S0/S1 then run RULES_ONLY, cloud calls are off until reload, S3 is BLOCKED (TRIPWIRE), and a persistent banner shows. Other trips refuse only that request.
- D-44 (R-18) **One cut order:** TASKS § Cut order (planned 1–6, emergency 7–11 with the user's OK).
- D-45 (R-19) **Schedule:** film every beat Sat Nov 28; Public YouTube upload Sun Nov 29 by 18:00; repo public Nov 29 after the scan and the user's yes; submit Mon Nov 30 12:00 GMT+2. Needs T-018a.
- D-46 (R-21) All private data lives in PRIV, outside the repo; explicit pathspecs only. *Folder list superseded by D-53.*
- D-47 (R-23) **Per-user quota:** AI Logic per-user Generate-content quota is 30 RPM (USER sets it in T-111).
- D-48 (R-26) **Prompt IDs** follow ARCH §3/§10.2. explain.v1 = `explain.v1.rules.md` + `explain.v1.user.md` (no system file) + `explain-fallback.v1.json`. Output ≤2 sentences and ≤45 words.
- D-49 (R-29) **Decision IDs:** SPEC D-01..D-39 canonical; AD-xx never renumbered; RN-xx retired (alias table in TASKS §5); new decisions D-40+.
- D-50 (R-32) **Ledger:** unsealed, own IndexedDB `se-ledger/entries` (newest 500), holding IDs/kinds/hashes/numbers only. Burn vault still deletes it (D-31).
- D-51 (X-08) **Fix plan `expected_residual`** = the finest `reveals` level among clues left unmasked (venue_or_organisation counts as street), or country if none remain.
- D-52 (X-11) **Benchmark pacing:** cloud calls ≥3 s apart (≤20 RPM), leaving headroom under the 30 RPM quota for judges.
- D-53 (X-12) **PRIV layout** (flat): `/Users/mac/StrangersEyes-private/{spike,bench,scenes,gate-test,test,raw,video}/`. Raw run JSON goes in `raw/` (`spike-<date>.json`, `bench-<date>.json`). Folders created Nov 19.
- D-54 (T-023 review boundary-fp-1) **The pass-A notes UI component is `NotesView`** (`ui/components/NotesView.tsx`, matching iOS `NotesView.swift`). `AdversaryNotes` remains the type name only. Edited: ARCH §3.1, §4.1, §4.2.
- D-55 (T-023 review privacy-correctness-1/2/7) **Vault concurrency:**
  - every vault add/update/remove, every sealed write and Burn run under `withVaultLock()` (a tab queue plus `navigator.locks` `se-vault`);
  - `ensureVaultKey()` is single-flight and add-if-absent;
  - `seal(value, key)` never creates a key;
  - stores use `vault/idb.ts` `closableStore`, so `deleteDatabase` is immediate;
  - `addItems()` writes a pin and its area item atomically.
  - Edited: ARCH §3.1, §16.4.
- D-56 (T-023 review privacy-correctness-4/12 + rejected-but-cheap hardening) **Tripwire:**
  - `isAiHost()` (case-insensitive, regional prefixes);
  - new TripReason `UNSCANNABLE_BODY` (non-string or `Request` bodies);
  - every string value in the body is scanned except `inlineData.data`;
  - `observe()` unsubscribe is idempotent;
  - R-14 `Permit {id, scanText}` adopted.
  - ARCH §8.5 now mirrors `web/src/ai/tripwire.ts`.
- D-57 (T-023 review boundary-evasion-1..6, fp-2/3) **check-boundaries R1–R20** (ARCH §4.2):
  - R1 bans the identifiers generateContent*, startChat, sendMessage*, countTokens, in any form;
  - R2 covers all model factories;
  - R17 bans raw egress (sendBeacon/XHR/WebSocket/EventSource/googleapis.com);
  - R18 requires literal dynamic imports;
  - R19 restricts import.meta.glob;
  - R14 accepts only DEV-guarded forms in App.tsx;
  - R20 requires a DEV marker, checked in `web/dist` by `scripts/check-dist.mjs` (web `postbuild`);
  - iOS Dev/ spikes must start with `#if DEBUG`.
  - Edited: ARCH §3, §3.3, §4.2.
- D-58 (T-023 review build-config-1/2/3) **PWA and licenses:**
  - Workbox `skipWaiting` + `clientsClaim` (otherwise autoUpdate stalls with `injectRegister:false`);
  - `build.license` emits `dist/third-party-licenses.md`;
  - `THIRD_PARTY_NOTICES.md` lists the runtime Workbox/Tailwind code and the libraries statically linked into the wasm, and ships as `/vendor/third-party-notices.md`.
  - Edited: ARCH §16.1. Follow-up: link both from About (T-092).
- D-59 (T-018d, user, Nov 19) **Commits:** the user answered "Yes, commit": Claude makes local commits as it works (explicit pathspecs, task-ID messages).
- D-60 (T-018d, user, Nov 20) **Pushes:** the user asked to "push on a new repo". Claude created the PRIVATE repo `strangers-eyes` (T-026) and pushes routine commits to `origin/main`. Making it **public** still needs the §7.2 scan and the user's explicit yes (T-170, Nov 29).
- D-61 (T-024) `WORD_FOLDS` in `enums.v1.json` gained `"&": "and"`, to equal SPEC SCR-06's fold list (SPEC wins on product enums). Edited: ARCH §10.3.
- D-62 (T-024 review code-2) **Prompts are drafts until their first recorded run.**
  - `manifest.json` gives every prompt `"released": true|false`.
  - `check-prompts --write` re-hashes drafts only and refuses changes to released files.
  - A git-HEAD guard stops released→draft flips and edits to files locked at HEAD.
  - The release tasks are T-031 (advB), T-039 (advA), T-032/T-066 (Nano), T-033 (fmPre) and T-083 (explain).
  - This replaces ARCH §10.1's "committed with fixtures = released", because these drafts have never met a real model (U-13/U-45). Edited: ARCH §10.1/§10.2, README, TASKS.
- D-63 (T-024 review fidelity-6) The area name is offered for **Home pins only**. The Add-detail kinds are labelled "Home area" / "Home street". The school phrase is neutral: "a school on your list". Edited: SPEC SCR-04, enums `KIND_PHRASE`.
- D-64 (T-024 review) **Draft prompt and schema changes before the first commit:**
  - advA forbids coordinates, plus codes, map links and numbered addresses (SR-06);
  - advB orders clues before hypotheses (rules 7/8 and schema key order), and hypotheses list every clue they rely on;
  - the advB schema keeps bounds in descriptions only and drops the clue_ids maxItems (U-45 grammar size); the parser enforces the bounds;
  - nanoVaultText: "likely" needs a distinctive part of the name, and a shared common word is at most "possible";
  - nanoFix gets region and reveals plus the cited non-removable clues; the crop uses regions; the residual follows D-51 and code recomputes it;
  - explain forbids "safe" and guarantees, its label is "What was noticed:", and AC-239 checks the output before display;
  - nanoPre and nanoFix gain the data-not-instructions line;
  - the device schemas use additionalProperties:false;
  - the nanoFix ok fixture masks c1, c2, c3 (residual "city").
  - Edited: ARCH §10.x/§12.5/§19.4, SPEC SCR-11/SCR-16/AC-190/AC-239.
- D-65 (T-024 review code-1 + verification) **Tripwire and echo scanning:**
  - skip string values that exactly equal `prompts.nonContentStrings()` (the cloud schemas' strings plus SDK protocol values);
  - strip `staticSegments()` of the cloud-scanned families (advA, advB, explain; derived from the manifest, so a v2 is included);
  - non-cloud template text in a cloud body is a canary hit (T-058);
  - the pass-B echo scan reads free-text fields only;
  - explain's enum-valued variables may reclassify S2 calls; this is accepted.
  - Edited: ARCH §8.2/§8.4, SPEC §10 echo line, TASKS T-058.
- D-66 (T-018a, user, Nov 20) **Filming dates confirmed:** web beats Sat Nov 28 morning; iOS beats and voice-over Sat Nov 28 evening; Public YouTube upload by Sun Nov 29 18:00 (hard stop 23:00); submit Mon Nov 30 by 12:00 GMT+2. This confirms D-45 / R-19.
- D-67 (T-018b, user, Nov 20) **Free-tier consent for the Day-1 spike:**
  - If the paid Gemini tier is not active when T-031 is ready, the 10 EXIF-stripped, people-free spike photos may be sent under free-tier terms. The user accepted that Google may use them and human reviewers may read them.
  - Applies to the T-031 spike photos only. Every other cloud call, and anything shown to judges, follows D-07 (paid tier).
  - Grounding (pass A, T-039) still needs the paid tier.
- D-68 (T-018c, user, Nov 20) **Demo location disclosure accepted (D-26):** the Judge Mode samples, their cached pass-B results (pins rounded to 3 decimals, about 100 m) and the video may reveal the city or neighbourhood of the shoot. Shoot at public places several km or more from home, work and any school.
- D-69 (T-019, user, Nov 20) **iOS bundle ID** = `dev.strangerseyes.app`. It is Simulator-only, so no Apple Developer team or App Store record is needed (TestFlight T-132 is cut by default).
- D-70 (user, Nov 20) **Free first; paid only where it matters.**
  - Build entirely on the free Spark plan and Gemini's free tier, and pay for nothing unnecessary.
  - Before filming and judging, the user activates Blaze + the paid Gemini tier (T-003, **by Thu Nov 26**). The paid tier is needed for grounding (pass A) and to serve EEA/UK/CH users lawfully.
  - Until then:
    - `data_tier = free`;
    - grounded pass A is off (T-039 deferred);
    - the consent copy discloses free-tier terms (Google may use the redacted image to improve products);
    - spikes may use free-tier calls (D-67).
  - Re-plans SPEC D-07.
  - Also chosen as free/minimal: Gemini in Firebase console assistant OFF, AI monitoring OFF, Google Analytics OFF.
- D-71 (user, Nov 20) **Openly licensed spike and benchmark photos allowed.**
  - At the user's request, Claude may use free-to-use internet photos: CC0, PD, CC BY or CC BY-SA, of public places, with no identifiable people, no homes or schools, and no readable plates.
  - They are stored only in PRIV with `SOURCES.md` attribution, and are never used as Judge or demo samples (those stay builder-owned).
  - Caveat: well-known open images may be in model training data, so such results are reported with that caveat.
  - Edited: CLAUDE.md invariant 9, TASKS T-008/T-031.
- D-72 (Claude, Nov 20) **`parseAdvB` repairs duplicate ids instead of rejecting the attack.** For a duplicate id inside clues, hypotheses or inferences, the first item is kept and later ones are dropped (recorded in `repairs`). Missing fields or bad enum values still raise `ParseError` (state `unreadable`). Why: ARCH §10.6 said both "IDs are unique" and "any failure raises ParseError", while the `bad_ids` fixture README expects the parser to keep going and drop dangling `clue_ids`; discarding a whole attack for one repeated id would show the user nothing. Edited: ARCH §10.6, TASKS T-071.
- D-73 (Nov 20; schema change by Claude, model switch approved by the user: "keep going, use hydrogen if flash stays down") **Pass-B schema without array caps; gemini-4-hydrogen is the T-031 adversary.**
  - The first live calls showed `advB.v1.schema.json` is rejected by both models: `400 "too many states for serving"` (U-45). Text-only probes found the minimal fix: drop `maxItems` from the clues/hypotheses/inferences arrays (box_2d keeps 4/4). The caps (12/3/8) are enforced in `parseAdvB`. advB.v1 was still a draft, so the file changed in place (D-62).
  - gemini-3.8-flash was unusable on Nov 20: 503 "Deadline expired" after 180 s with any schema (even a one-field one) and 131 s with none. So T-031 runs pass B 3× per photo on **gemini-4-hydrogen** (primary), G1b reruns on hydrogen, and no flash A/B. Re-test flash later (T-034) before choosing the RC default.
  - Edited: shared/prompts/advB.v1.schema.json + manifest, ARCH §10.6, API-NOTES §1.7/§1.12/§6.3/§10 (U-45), TASKS T-031.

### Reconciliation items (T-022, done Nov 19)
How T-022 ran:
- Workflow wf_a7c14f46-79f: 6 analysts, 5 per-doc editors, 2 verification rounds and 1 fix round.
- 529 + 30 edits applied. One was skipped on purpose (X-12 vs R-21; resolved as D-53).
- Verifier round 2 left 11 one-line residuals (V2-01..V2-11). The orchestrator applied all 11 by hand.
- Full analysis: the workflow output (session scratchpad, not kept).

- R-01 → D-40; edited: API-NOTES, ARCH, RUNBOOK, SPEC, TASKS (27 edits). ARCH §13.2/§13.3 (then the repo-root remoteconfig.template.json) is the only RC key list: 27 keys.
- R-02 → D-41; edited: API-NOTES, RUNBOOK, SPEC, TASKS (23 edits). The Leak Atlas holds only +1 counters at /atlas/{weekId}/clues/{clueType}, one per distinct clue type that pass B reported in the first attack (r1), written on…
- R-03; edited: ARCH (2 edits). Verdict = SPEC §10 verbatim: levels RED/AMBER/LOW/PARTIAL;
- R-04; edited: ARCH (7 edits). Vault kinds are exactly SPEC §17.2 (4 pin kinds + 12 text kinds, including self_name, D-36).
- R-05; edited: SPEC, TASKS (3 edits). Pins reach on-device prompts (referee VAULT, vault-text VAULT) only as {id, kind, label}, never coordinates.
- R-06; edited: ARCH, TASKS (4 edits). Standard is the default pre-mask mode (D-16, RC strict_mode_default=false);
- R-07; edited: API-NOTES, ARCH, SPEC (9 edits). One oriented, EXIF-free working image ('master'), longest side ≤2048 px (D-20).
- R-08 → D-42; edited: API-NOTES, ARCH, RUNBOOK, TASKS (52 edits). ARCH §3 is the canonical path list, with these R-08 changes.
- R-09; edited: ARCH, SPEC, TASKS (7 edits). SPEC D-27 settles this, and SPEC §8.1 is the route table.
- R-10: consistent
- R-11; edited: API-NOTES, TASKS (5 edits). The gate never caches on-device availability: every S0/S1 gate call (and every device-readiness check inside the gate, e.g.
- R-12; edited: API-NOTES (1 edits). Pass A notes live in memory only, for the current session (SPEC D-28, AC-148;
- R-13; edited: ARCH, TASKS (3 edits). Judge Mode targets red → green in ≤90 s per sample (goal about 60 s) on a laptop without Nano.
- R-14; edited: API-NOTES, ARCH, RUNBOOK, SPEC, TASKS (35 edits). Judge Mode never unseals or loads the real vault (D-37, AC-241).
- R-15; edited: ARCH, SPEC, TASKS (24 edits). One vault matcher (D-38) = SPEC SCR-06 step 3 + §10.3.
- R-16; edited: ARCH, RUNBOOK, SPEC, TASKS (18 edits). One face threshold, face_min_confidence 0.3, for Tier-0 auto-masking, the consent dry run and the gate re-check (D-30).
- R-17 → D-43; edited: ARCH, TASKS (9 edits). BREACH = SPEC AC-022: a tripwire LOCAL_LOCK trip or an S0/S1 response reporting in_cloud sets page-lifetime gateState.compromised;
- R-18 → D-44; edited: ARCH, SPEC, TASKS (5 edits). TASKS § Cut order is the only cut order: planned cuts 1–6, emergency cuts 7–11 (each needs the user's OK), the triggers and the never-cut list, which now names…
- R-19 → D-45; edited: ARCH, RUNBOOK, SPEC, TASKS (20 edits). TASKS §3 is the schedule of record (the user still has to confirm it in T-018a): every beat is filmed Sat Nov 28 (web in the morning;
- R-20; edited: ARCH, RUNBOOK, SPEC, TASKS (6 edits). SPEC §15.3 is the only definition of the benchmark metrics (D-34).
- R-21 → D-46; edited: ARCH, RUNBOOK, SPEC, TASKS (12 edits). All private data lives in PRIV outside the repo (D-29); folder list superseded by D-53 (flat layout).
- R-22; edited: API-NOTES, ARCH, RUNBOOK, SPEC, TASKS (14 edits). The web App Check debug token lives only in web/.env.development.local, which Vite loads in dev only and the *.local rule gitignores.
- R-23 → D-47; edited: API-NOTES, ARCH, RUNBOOK, SPEC, TASKS (7 edits). The Firebase AI Logic per-user quota (Generate content requests) is set from 100 to 30 RPM.
- R-24; edited: ARCH, SPEC, TASKS (15 edits). explain() takes ExplainInput (ARCH §9.1): a pre-screen clue {kind:'prescreen', type, region} (never device-read text) or a pass-B clue {kind:'adversary', clue,…
- R-25; edited: ARCH, TASKS (12 edits). Route = ON_DEVICE | IN_CLOUD | RULES_ONLY | BLOCKED | QUEUED | CACHED (SPEC §17.1;
- R-26 → D-48; edited: API-NOTES, ARCH, TASKS (7 edits). Prompt files and IDs follow ARCH §3/§10.2.
- R-27; edited: RUNBOOK, TASKS (4 edits). shared/strings/en.json holds every SPEC §11 copy ID, keyed by ID, and serves both platforms.
- R-28; edited: API-NOTES, RUNBOOK, TASKS (8 edits). The fetch tripwire is installed by the side-effect module web/src/ai/tripwire-install.ts, imported as LINE 1 of main.tsx (`import './ai/tripwire-install';`), b…
- R-29 → D-49; edited: API-NOTES, ARCH, RUNBOOK, SPEC, TASKS (9 edits). Decision IDs: SPEC D-01..D-39 are canonical.
- R-30: consistent
- R-31; edited: API-NOTES, ARCH, RUNBOOK (3 edits). RC routing_policy S4 has ios = HYBRID_MODEL (not NONE): iOS Judge Mode sample scenes (P2, SPEC §14.2, D-32) run S4 through HybridModel over synthetic sample te…
- R-32 → D-50; edited: API-NOTES, ARCH, SPEC, TASKS (14 edits). The ledger is unsealed, in its own IndexedDB database se-ledger/entries, keeping the newest 500 entries.
- R-SP; edited: API-NOTES, ARCH, RUNBOOK, TASKS (36 edits). The Day-1 scratchpad rescue is done (TASKS T-020, Nov 19).
- X-00: consistent
- X-01; edited: API-NOTES, ARCH, RUNBOOK, TASKS (19 edits). The current Day-1 reference artifacts are research/day1-artifacts/arch/ (copied from arch2: src/*.ts, remoteconfig.template.json, gen.mjs, advB.v1.schema.json)…
- X-02; edited: API-NOTES, RUNBOOK, TASKS (6 edits). Remote Config client defaults come from remoteconfig.template.json itself (ARCH AD-28, §13.4).
- X-03; edited: API-NOTES, ARCH, RUNBOOK (4 edits). AC-365 (SPEC wins): web/dist must contain neither the registered debug-token value nor the string VITE_APPCHECK_DEBUG_TOKEN.
- X-04; edited: RUNBOOK, TASKS (3 edits). Demo lanyard prop = SPEC D-39: a fictional logo plus the generic printed words "HOSPITAL STAFF", no vault text and no real logo.
- X-05; edited: ARCH, RUNBOOK, TASKS (12 edits). SPEC D-33 web demotions apply in the tasks.
- X-06; edited: TASKS (6 edits). iOS task priorities follow SPEC D-32 and §14.2.
- X-07; edited: ARCH, SPEC, TASKS (6 edits). Crop rule = SPEC D-35 and §10.4. A plan crops minimally from one side, capped at 40%.
- X-08 → D-51; edited: ARCH, SPEC (3 edits). The fix plan's expected_residual is the finest (most precise) reveals level among the clues left unmasked (venue_or_organisation counts as street), or country …
- X-09; edited: API-NOTES, ARCH, SPEC, TASKS (35 edits). Every § cross-reference points at the current heading.
- X-10; edited: ARCH, RUNBOOK (2 edits). Every doc states the same authority chain: CLAUDE.md invariants > PROGRESS Decisions log (until the affected doc is edited in the same session) > SPEC > ARCHIT…
- X-11 → D-52; edited: API-NOTES, SPEC, TASKS (3 edits). Benchmark cloud calls are paced at least 3 s apart (≤20 RPM).
- X-12 → D-53; edited: ARCH, RUNBOOK, SPEC, TASKS (10 edits). PRIV (outside the repo, D-29/AD-25) has one sub-layout: PRIV/{spike,bench,scenes,gate-test,test,raw,video}/.
- X-13; edited: ARCH, RUNBOOK, SPEC, TASKS (12 edits). TASKS owns dates and the USER sittings. Other docs follow TASKS §3–§4.
- X-14; edited: ARCH (2 edits). [UNVERIFIED] tags stay honest. API-NOTES closed U-42 (the iOS 12.19.3 grounding path) by a source read (§3.7, [VERIFIED: src 12.19.3]), so ARCH must not list i…
- X-15; edited: ARCH, TASKS (6 edits). ARCH §3 lists three repo scripts: check-boundaries.mjs, check-prompts.mjs and check-images.mjs.
- V2-01..V2-11: applied by hand. They fixed:
  - the API-NOTES 21/21 → 20/20 rules count;
  - the coordinate-scan allowlist wording (SPEC AC-351, RUNBOOK §1.14);
  - stale § pointers inside T-022;
  - RUNBOOK sitting names A/B/C;
  - the iOS debug-token timing;
  - the ARCH precedence line;
  - AC-283 marked as defined, not proposed.

## Session log (newest last; keep ~15, move older to docs/progress-archive.md)

### 2026-11-19 evening: planning session (no app code yet)
- **Done:**
  - Idea tournament; PLAN.md v2; CLAUDE.md.
  - Verification + docs workflow: the five docs.
  - **T-020** artifacts rescued (77 files).
  - PROGRESS.md created.
  - TASKS decision numbering fixed (D-40+).
  - CLAUDE.md protocols point to TASKS §1/§2.
  - PLAN.md banner added.
- **Verified:** 77 artifact files; no personal data or keys in docs/research (grep); iOS build-log summaries show 12.19.3 and 13.2.0 SUCCEEDED.
- **Next:** T-021.

### 2026-11-19 late: repo, scaffold, reconciliation, review
- **Done:**
  - **T-021** (all but the commit): git init, `.gitignore`, Apache LICENSE (via gh), NOTICE, README stub, root package.json, PRIV folders.
  - **T-023** web scaffold: Vite 8.3.8 + React 19.3.1 + TS 7.0.2 + Tailwind 4.3.5 + vite-plugin-pwa 2.0.0 + vitest 5.1.1, exact pins.
  - Ported into ARCH paths: `tier0/{decode,exif,faces,ocr}`, `core/{types,geo,boxes,mask}`, `vault/{idb,crypto,vaultStore}` and `ai/{tripwire,tripwire-install}`. Also the DEV selftest, `scripts/check-boundaries.mjs`, `scripts/check-dist.mjs`, PWA icons, THIRD_PARTY_NOTICES.md and `.claude/launch.json`.
  - **T-022** reconciliation: the workflow plus 11 manual residuals. PROGRESS decisions are D-40..D-58.
  - Independent 3-lens review of the scaffold (workflow wf_80c7f7b1-2ef): 18 confirmed findings, **all fixed** (D-54..D-58); 6 rejected by the skeptics.
- **Verified:**
  - `npm ci && npm run build && npm run check` exit 0:
    - check-boundaries self-test 45/45, repo ok;
    - Vitest 56/56;
    - check-dist ok;
    - precache 19 entries / 30.6 MB;
    - `dist/sw.js` has skipWaiting() and clientsClaim().
  - DEV selftest `#/dev/selftest` ALL PASS in Chrome 156 (Browser pane):
    - exif: APP0+APP2 only, no GPS, orientation 6 → 100×200;
    - faces_none: 0/0;
    - ocr: CITY/GENERAL/Ella/4B at 95–96%;
    - vaultCrypto: non-extractable, export blocked, fresh IV;
    - masks: solid #000;
    - geo: 877 km.
  - The reviewers' own race repros now pass: Burn race always ends `[] key=false`; concurrent first adds keep both items. Their evasion fixture gives 0 → 8 violations.
  - Tailwind 4.3.5 with Vite 8: verified by build. The TASKS/API-NOTES `[UNVERIFIED]` note can flip.
- **Waiting on USER:** Sitting A, especially **T-018d** (commits) and T-002/T-005 (Firebase). gh is already signed in.
- **Decisions:** D-40..D-58 (docs edited in the same session).
- **WIP:** none, but nothing is committed (see WIP for the first-commit pathspecs).
- **Next:** **T-024** prompts/schemas/fixtures (ARCH §10 is now reconciled).

### 2026-11-19 late (cont.): first commits
- **Done:** T-018d answered (D-59). **T-021** ticked. Three commits, all with explicit pathspecs:
  - `e567fd0` T-021: bootstrap files, CLAUDE.md, PLAN.md, notices, launch.json.
  - `01ac7d9` T-020/T-022: docs and research (89 files).
  - `3e07f4b` T-023: web scaffold and scripts.
- **Verified before committing:**
  - The coordinate-like scan over all 140 files found only version numbers, DOIs, timings, pixel boxes and the public Berlin→Paris test vector.
  - The PNG icons carry only IHDR/IDAT/IEND chunks.
  - No keys or personal data in the files.
  - `research/_vendor-docs/`, `web/public/vendor/`, `web/dist/` and `node_modules` are ignored.
- **Next:** **T-024**.

### 2026-11-20: GitHub repo (T-026)
- **Done:**
  - **T-026**: `gh repo create strangers-eyes --private --source . --remote origin --push`, with the RUNBOOK §1.15 description.
  - **T-006** ticked: gh was already signed in.
  - D-60 logged: pushes approved; public needs T-170.
- **Verified:**
  - `gh repo view` shows visibility PRIVATE and licenseInfo apache-2.0, detected immediately.
  - The remote commit list equals the local log (4 commits; HEAD f4368e2 before this entry).
  - Topics and homepage are deferred to Nov 29 (RUNBOOK §1.15).
- **Next:** **T-024**.

### 2026-11-20: T-024 prompts, schemas and fixtures
- **Done:**
  - **T-024**. `shared/prompts/` holds 15 prompt and schema files extracted verbatim from ARCH §10, the full 18-entry `explain-fallback.v1.json` and 12 fixtures (one shared synthetic scenario), with a README and a sha256 `manifest.json`.
  - `web/src/ai/prompts.ts`: `render`, `systemText`, `staticSegments`, `nonContentStrings`, `verifyFiles`, `verifyManifest`.
  - `web/src/ai/schemas.ts`: static schemas `satisfies` the firebase/ai types; runtime builders throw `EmptyEnumError`; `assertSchemaShape`.
  - `scripts/check-prompts.mjs` is wired into `check`: the draft/released lock and the git-HEAD guard.
  - The DEV selftest gained a prompts step.
- **Reviews:**
  - Independent 3-lens review: 16 confirmed findings (2 medium), all fixed before the first commit (D-61..D-65).
  - A follow-up independent verification: 14/16 resolved, 1 partial and 12 new (mostly doc) items. All addressed:
    - echo scan restricted to free-text fields;
    - cloud prompt families derived from the manifest;
    - canary specified for T-058;
    - release steps added to TASKS;
    - stale quotes and API-NOTES pointer fixed;
    - Add-detail labels;
    - truncated fixture reordered;
    - git-HEAD guard against released→draft flips;
    - AC-239;
    - iOS propertyOrdering note.
- **Verified:**
  - `npm --prefix web run check` and the build are green.
  - The ARCH §10 blocks are byte-identical to the files (17/17, verifier).
  - `check-prompts` refuses edits to released files and released→draft flips (tested in a scratch git repo).
  - The selftest prompts step finds 0 mismatches in Chrome 156.
- **Not done here:** nothing has met a real model yet, so every prompt stays a draft (D-62). Runtime acceptance of the schemas is checked in T-031 (U-45) and T-032 (U-04).
- **Next:** **T-050**.

### 2026-11-20: T-018 decisions and the Firebase project
- **Done:**
  - **T-018** a–c answered via the question card (D-66 filming, D-67 free-tier spike consent, D-68 demo location). T-018 is complete.
  - **T-002**: Claude created the Firebase project `strangers-eyes` in the browser pane, which is signed in to the user's Google account, at the user's request. Google Analytics is OFF and the Gemini in Firebase console assistant is OFF.
- **Found:**
  - The Firebase CLI had **no** saved login: `~/.config/configstore/firebase-tools.json` held only `motd`. The CLI isn't installed globally (we use pinned `npx`), so a bare `firebase login` likely never ran.
  - Started `npx -y firebase-tools@15.37.0 login` in the Terminal panel for the user to finish (T-005).
- **Next:**
  - USER: finish the CLI login.
  - USER: T-003 Blaze + paid tier; T-004 AI Logic "Get started" (Claude can open the page); T-019 bundle ID; T-007 Chrome flags; T-008 photos.
  - CLAUDE: T-050 app shell (no Firebase needed), and T-025 once T-005/T-019 are done.

### 2026-11-20: CLI login and T-025 (web side)
- **Done:**
  - **T-005**: the user finished `npx -y firebase-tools@15.37.0 login` in the Terminal panel, declining Gemini and usage collection. `projects:list --json` shows `strangers-eyes` (project number 320898500558).
  - **T-025, web part**:
    - `.firebaserc` (default `strangers-eyes`);
    - `apps:create WEB strangers-eyes-web` → `1:320898500558:web:a71a1817cde2f1775f0d9f`;
    - `apps:sdkconfig` → `web/src/firebase/config.ts`, committed; not secret per invariant 10. `RECAPTCHA_ENTERPRISE_SITE_KEY` stays empty until T-011;
    - root `firebase.json`, verbatim ARCH §15.4, no emulators block.
  - The Hosting site `strangers-eyes` already exists (created with the project).
- **Verified:**
  - `apps:list` shows the web app.
  - `firebase use` resolves `strangers-eyes`, so the CLI parses `firebase.json` and `.firebaserc`.
  - `npm run check` (92 tests) and the build are green.
- **Remaining in T-025:** iOS app registration (`apps:create IOS … --bundle-id`), once the USER picks the bundle ID (T-019).
- **Note:** `firebase.json` references `firestore.rules`, `firestore.indexes.json` and `remoteconfig.template.json`, which arrive in T-104/T-102. Until then, deploy only `--only hosting`.
- **Next:**
  - USER: T-019 bundle ID, T-003 Blaze + paid tier, T-004 AI Logic "Get started", T-012 web debug token, T-007 Chrome flags, T-008 photos.
  - CLAUDE: **T-050**.

### 2026-11-20: T-019 and T-025 complete
- **Done:**
  - **T-019**: bundle ID `dev.strangerseyes.app` (D-69).
  - **T-025** finished: `apps:create IOS strangers-eyes-ios --bundle-id dev.strangerseyes.app` → `1:320898500558:ios:a073e67f8281ab135f0d9f`, and `apps:sdkconfig IOS … --out ios/StrangersEyes/Resources/GoogleService-Info.plist`, committed; not secret.
- **Verified:**
  - `apps:list` shows both apps.
  - `plutil -lint` OK; BUNDLE_ID, PROJECT_ID and GOOGLE_APP_ID are correct; IS_ANALYTICS_ENABLED and IS_ADS_ENABLED are false.
  - The CLI flags (`--bundle-id`, `--out`) are confirmed via `--help`; TASKS and RUNBOOK are updated.
- **Next:** CLAUDE **T-050** app shell. T-027 iOS skeleton waits only for T-013 (approve `brew install xcodegen`).

### 2026-11-20: free-first, AI Logic, App Check (console work by Claude)
- **User direction:**
  - Free stuff first; pay for nothing unnecessary (D-70: free while building, paid tier for judging).
  - xcodegen installed by the user (T-013).
  - Claude may drive T-004, the App Check debug token, T-007 and finding about 10 free photos.
- **Done, in the browser pane:**
  - **T-004**: AI Logic → Gemini Developer API (free; accepted the Gemini API Additional Terms). AI monitoring is OFF. App Check APIs tab: Firebase AI Logic is **Basic – Enforced**.
  - **T-011**: reCAPTCHA Enterprise (Fraud Defense) API enabled (free 10k/month). Web key `strangers-eyes-web` created; web app **Registered** in App Check. The site key is in `config.ts`.
  - **T-012 (web)**: debug token `local-dev-mac` generated and registered. Moving its value into `web/.env.development.local` needs the USER: the permission classifier blocked Claude from reading the secret (correctly). The template file exists, mode 600, gitignored.
- **T-007** cannot be automated:
  - Chrome extensions can't change `chrome://settings` or `chrome://flags`, and Claude in Chrome is not connected.
  - Local State shows no flags enabled. The 4.0 GB v3Nano model is present.
  - The USER does the two toggles.
- **Background workflow `wf_60df8863-f2f`** (running): T-050 app shell (implement → review → fix) and 10 openly licensed spike photos (find → verify → replace).
- **Next:** review the workflow results, then T-050 screenshots, T-027 iOS skeleton (xcodegen ready) and T-030 Spike A once the debug token is pasted.

### 2026-11-20: T-050 app shell and T-008 spike photos (workflow wf_60df8863-f2f)
- **T-050 app shell:**
  - Built by an implementer agent, independently reviewed (12 findings: 10 fixed, 2 needed no change), then verified by Claude in the Browser pane.
  - Added the hash router (SPEC §8.1; `?judge=1` → `#/judge`), light/dark tokens, the Header (brand, capability chip failing closed to "Rules-only", Ledger counters, Settings), the Ledger rail at ≥1024 px / native modal bottom sheet below, the HUD bottom-left, the check stepper, and the Badge/Button/Sheet components.
  - Screens: Home plus placeholders. `shared/strings/en.json` and `core/strings.ts` hold the copy (T-087 completes them).
- **T-008 spike photos:** 10 openly licensed Commons photos in `PRIV/spike/` with `truth.csv` and `SOURCES.md`. An independent verifier passed all 10 (D-71).
- **Verified:**
  - `npm run check`: boundaries 45/45, prompt hashes, **154 tests**. The build and check-dist are green; oxlint is clean.
  - Browser pane:
    - 1440 px dark/light and 375 px light/dark render correctly; no horizontal scroll at 375 px;
    - the Ledger sheet is a native `:modal` dialog: focus goes to Close, Escape returns focus to the Ledger button;
    - the last element clears the HUD when scrolled (716 vs 760 px);
    - `?judge=1` → `#/judge`; the selftest still passes;
    - **no console errors**.
- **Next:**
  - USER: paste the debug token; T-007 Chrome toggles.
  - CLAUDE: T-027 iOS skeleton (xcodegen ready), T-051, T-087, T-093. T-030 once the token is in place.

### 2026-11-20: T-030 Spike A PASS (Firebase plumbing)
- **Done:**
  - Anonymous Auth enabled as code: `firebase deploy --only auth`, "Auth providers enabled: anonymous".
  - reCAPTCHA key domains corrected: **localhost removed**. Only strangers-eyes.web.app and strangers-eyes.firebaseapp.com remain, so local dev relies on the debug token, per ARCH.
  - `web/src/firebase/init.ts`: ARCH §15.1 order, plus a DEV-only `?appcheck-debug=off` switch for the enforcement test.
  - `web/src/dev/spikes/PlumbingSpike.tsx`, route `#/dev/spike`, DEV-only. It goes through the tripwire with per-call permits.
- **Evidence:**
  - App Check token obtained via `exchangeDebugToken`.
  - Anonymous UID present (`accounts:signUp`).
  - `gemini-3.8-flash` → "pong" in_cloud, 38.8 s. `gemini-4-hydrogen` → "pong" in_cloud, 14.9 s. Both work on the **free tier**.
  - Request header names: `authorization` (scheme `Firebase`), `x-firebase-appcheck`, `x-firebase-appid`, `x-goog-api-key`, `x-goog-api-client`.
  - Without the debug token (cache cleared): reCAPTCHA error on localhost, and both calls **401 "Firebase App Check token is invalid"**. Enforcement is proven.
  - Leak check: neither the token value nor `VITE_APPCHECK_DEBUG_TOKEN` is in `web/dist`.
  - check (154 tests), build and check-dist are green.
- **Notes:**
  - The Browser-pane network tool did not capture these requests; `performance` resource entries did.
  - Vite's first load after adding firebase deps triggers a dep-optimisation full reload.
  - The SDK printed one auto-generated (never registered) debug token in the console. It logs only self-generated tokens (API-NOTES §2.2), so the user's token was never printed.
  - Latency: 38.8 s for a trivial prompt on gemini-3.8-flash (thinking MEDIUM by default) is high. Watch it in T-031 against pass B's 60 s timeout.
- **Next:** **T-031** (pass-B go/no-go, G1/G1b; photos are in PRIV), T-027 iOS skeleton, T-051, T-087.

### 2026-11-20: T-031 Spike B (adversary G1/G1b): built, reviewed, partly run
- **Built:**
  - `web/src/ai/parse.ts` (`parseAdvB` + 15 tests, D-72).
  - DEV-only `#/dev/adversary` (`web/src/dev/spikes/adversaryRun.ts`, `AdversarySpike.tsx`).
  - Headless CDP runner `benchmark/spike/run-spike.mjs`; scorer `benchmark/spike/score-spike.mjs` (independent haversine cross-check against core/geo, self-test, coordinate guard).
  - Vite spike mode serves only `PRIV/spike`, with HMR and the websocket off.
- **Dry run:** all 10 cloud frames APP0+APP2 only, no GPS (6 sources had GPS, all stripped); 2 false-positive faces masked and re-checked to 0; contact sheet checked by eye.
- **Review workflow** (4 lenses + skeptics, wf_6b8875f3-030): 35 findings, 24 confirmed, all fixed. Most important: a reload or HMR could restart a live run and repeat cloud calls (now: autorun stripped from the URL, a sessionStorage one-shot flag, a globalThis guard, and the runner kills Chrome on a second navigation). Also: no resend after a timeout or after a response; 1 resend max; partial saved on every call; never overwrite raw files; failed G1b reruns never count as "moved"; G1b headline vs the median before-band.
- **Live findings:**
  - U-45: the original schema got `400 too many states` on both models; dropping the object-array `maxItems` fixed it (D-73).
  - gemini-3.8-flash was unusable (503 "Deadline expired" at 180 s with any schema).
  - Free tier = **20 requests/day/model** for gemini-4-hydrogen and the 3.x flash models; 500/day for the flash-lite models.
  - Hydrogen pass B took 88–179 s per call with an image; about 3k prompt, 0.6–1.2k output and 1.2–3k thinking tokens.
- **Partial result (3 of 10 photos, hydrogen):** 0 refused; 2 located (s02 shopfront and s03 doorstep entrance, both at street level), 1 not located (s01). The s02 fix (6 masks) moved the band from street to country; the s03 fix rerun failed on quota.
- **Next:** the user chooses: paid tier now, or resume after the quota reset (see WIP).

