# PROGRESS: Strangers' Eyes

> Read this first in every session (CLAUDE.md, then this file, then `docs/TASKS.md` §1).
> Template: TASKS Appendix A.
> **Never Read a whole doc.** Grep for the task ID, AC ID or § heading, then Read with offset/limit.

## STATE (overwrite in place; never append here)
- Today: Sat Nov 21 2026 (Day 3)
- Now: batch 3 in review. Built: T-062 Egress Gate (security + policy review fix round running: TOCTOU, strict JPEG validator, export lock-down, breach halt; NOT ticked), T-076 verdict engine (reviewed, fixed, ticked), T-077 verdict card (in review), T-068 pre-screen Tier-0 half (in review), the T-090 / T-091-094 / T-101-102 fix rounds (done). RC + Auth deployed (D-126; live RC has the D-70 free-tier override). T-031 live resume runs from 10:02 (photos 04–10).
- Next:
  - T-031 scoring → gate table, advB.v1 release, T-034.
  - Land the T-062 fix round; then the check-boundaries ai/models import rule (scanner agent waits for the whitelist).
  - Then the slice: T-069 consent, T-071 pass B, T-074 referee wiring, Check → Verdict (T-086); T-063 ledger, T-064 HUD; D-80 vault generation counter (gate `vaultFresh`); Judge Mode wiring (`setSampleAllowlist`).
- Blocked: nothing (T-031 waits only for the 10:00 quota reset).
- Last green commit: see git log (batch-3 checkpoint, gate files excluded). `npm --prefix web run check` green: 58 files / 2974 tests; 165 planted boundary violations, 11 prompt cases, 167 image cases; `npm run build` + check-dist ok.
- Checkpoints: G1 in progress (3/10 photos; resume Nov 21 10:02) | G1b – | G2 – | G3 – | slice Nov 22 – | loop Nov 24 – | hosted Nov 25 – (skeleton live Nov 20)
- Adversary model: **gemini-4-hydrogen for T-031** (D-73; re-test flash in T-034 before the RC default) | iOS path: A (firebase-ios-sdk 12.19.3)
- Cuts applied: none

## WIP (exact next step if a task is half-done)
- **T-031** (Nov 20): spike code, dry run, review (24 confirmed fixes applied) and 3 of 10 photos done on gemini-4-hydrogen; raw in `PRIV/raw/spike-2026-11-20T07-56-18-live.json`. Stopped by the circuit breaker on `429 You exceeded your current quota` = free tier **20 requests/day/model** (Cloud console → Gemini API → Quotas).
  - To resume **after 10:00 GMT+2 Sat Nov 21** (free quota reset, D-74): `VITE_SPIKE=1 npm --prefix web run dev -- --port 5174 --strictPort`, then `node benchmark/spike/run-spike.mjs --mode live --primary hydrogen --models hydrogen --adaptive --photos 04,05,06,07,08,09,10` (about 17–20 calls). s01–s03 G1 classifications are final already (s03: 2 of 2 located). If quota is left, or on Sun: s03's fix rerun (`--photos 03` repeats its runs) and `--probe u12`. Then `node benchmark/spike/score-spike.mjs PRIV/raw/spike-2026-11-20T07-56-18-live.json <resume raw>` (later file wins per photo) → `benchmark/spike/day1-adversary.md`.
  - Then: PROGRESS gate table, release advB.v1 (D-62), tick T-031, T-034 decision.

## USER pending (mirror of TASKS §4: ID · due · status)
Sitting A is due tonight or Fri Nov 20 morning, in this order:
- T-007 Chrome on-device AI flag; connect Claude-in-Chrome · Fri Nov 20 · open
- T-015 (optional) Discord questions · Fri Nov 20 · open
- **New, from T-057:** cross-browser selftest. Either turn on Safari → Settings → Developer → "Allow remote automation" so Claude can run `#/dev/selftest` in Safari, or open http://localhost:5174/#/dev/selftest in Safari yourself (Claude starts the dev server). Firefox is not installed: install it, or decide to skip Firefox · Sun Nov 22 · open
- **New, from T-037:** a face or mannequin test image for the face-recall spike (U-31), kept in `PRIV/test/`, never committed. It must be a builder-owned photo of a consenting adult, a mannequin, or a synthetic face · Sat Nov 21 · open
- Copy review of the 7 `copy.judge.coach.*` texts (D-77) · before T-105 · open

Later: Sitting B (T-012, T-011) after T-025; Sitting C (T-010, T-014, T-017) Nov 21–22; the rest per TASKS §4.

## Key values (non-secret only)
| Key | Value |
|---|---|
| PROJECT_ID | `strangers-eyes`, project number 320898500558 (created Nov 20 by Claude in the console at the user's request; Google Analytics OFF, Gemini in Firebase console assistant OFF; Spark plan until T-003) |
| WEB_APP_ID / IOS_APP_ID | web `1:320898500558:web:a71a1817cde2f1775f0d9f` (`strangers-eyes-web`) / iOS `1:320898500558:ios:a073e67f8281ab135f0d9f` (`strangers-eyes-ios`) |
| BUNDLE_ID | `dev.strangerseyes.app` (D-69) |
| RECAPTCHA_SITE_KEY | `6LdCXCkuAAAAANlqU9u7c_5qzN-HniVZn-kyN78a` (public; key `strangers-eyes-web`, score-based) |
| Firestore location | |
| HOSTED_URL | https://strangers-eyes.web.app (first deployed Nov 20, T-038, Hosting only) |
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

### T-037 prop OCR (Nov 20, Chrome 156 Browser pane; D-81)
Test image: a white "LUCAS" tag with dark letters, tilted 4°, composited in memory on people-free spike photos s01, s05 and s09 (nothing saved), at 2 positions × 5 cap heights (32, 48, 64, 96, 160 px on the 2048 px master) = 30 placements. Tesseract 7, OEM LSTM, PSM 11 (sparse text).

| Binarisation | Frame | Found | ms/pass* |
|---|---|---|---|
| global Otsu (default, `thresholding_method` 0) | 1600 | **14/30** | ~600 |
| global Otsu | 800 | 7/30 | ~230 |
| global Otsu, 2×2 tiles, 10% overlap | 4 × ~1100 | 13/30 | ~1450 |
| PSM 3 (auto) instead of 11 | 1600 | 0/30 | ~375 |
| **Leptonica adaptive Otsu (1)** | 1600 | **26/30** | ~1170 |
| Sauvola (2) | 1600 | 24/30 | ~1020 |
| Sauvola (2) | 800 | 19/30 | ~340 |
| **union of Otsu, adaptive Otsu, Sauvola, Sauvola-800** | – | **30/30** | – |

\*Hidden (throttled) pane, so pessimistic.
- A first pass on s01 alone (0° and 8° tilt, 20–96 px caps, with a blue border around the tag) read 20–36 px caps at both 1600 and 1536 px. 48–96 px was erratic, and the border made it worse ("UCAS", "——]").
- Verdict: the prop is fine. The default binarisation is the problem, so T-057 sets adaptive Otsu plus a Sauvola union pass where a miss fails open (D-81).
- Faces (step 3, U-31): not run. No face or mannequin image in `PRIV/test/` yet.

### T-053 import on real photos (Nov 20, Chrome 156 Browser pane)
- The 6 spike photos whose originals carry EXIF GPS (s02, s03, s04, s06, s08, s10) were run through `importPhoto`. In every master: segments are APP0,APP2 only, `exifr.gps` is undefined, the longest side is 2048 px, and sha256 has 64 hex characters. `hadGps` was true and the GPS warning appeared, with no pins named because the vault was empty.
- `#/dev/selftest`: ALL PASS (exif, import, vaultCrypto, geo, masks, ocr, prompts, faces_none):
  - **import (AC-101):** the Orientation=6 fixture is upright, with width and height swapped, and has no APP1/APP13 and no GPS; 35 MB → tooLarge, text → unsupported.
  - **vaultCrypto:** the stored key reads back non-extractable; raw and jwk export throw; the record holds only `{ct, iv, v}`, with a fresh 12-byte IV and no plaintext.

## Decisions log
Canonical IDs:
- **D-01..D-39** are in SPEC §0.4 (read them there).
- **AD-xx** are in ARCH §2. Where an AD duplicates a D, the D wins.
- **The next free number is D-132.** (Batch 3, Nov 21: T-062 gate D-111..114 and its fix round D-129..131, T-076 verdict D-115..116 and its fix round D-127..128, UI fixes D-117, boot fixes D-118, scanner fixes D-119..120, T-068 pre-screen D-121..123, T-077 verdict card D-124..125; D-126 is the RC/Auth deploy. Unused reserved numbers stay unused. DEVLOG F-185..F-192 are reserved for the T-062 fix round.)

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
- D-74 (user + Claude, Nov 20) **T-031 stays on the free tier; the third run is adaptive.**
  - The user chose to wait for the free quota (20 requests/day/model, reset at midnight Pacific = 10:00 GMT+2) rather than enable the paid tier early. G1 therefore finishes on Sat Nov 21 (Sun Nov 22 if needed), and T-034 moves with it.
  - To fit the budget, a photo's 3rd primary run is skipped when runs 1–2 already decide both classifications (2–0 or 0–2). The G1 counts are identical to 3 runs by construction; only informational metrics (any-of-3, spread) use fewer runs. The U-12 probe and the s03 fix rerun run only if quota remains.
  - Edited: SPEC §0.3 (G1 method), TASKS T-031.
- D-75 (Claude, Nov 20; T-093 review) **Interlock: one pre-fetch cloud permit at a time.**
  - The tripwire consumes permits in grant order. With two cloud permits outstanding, one call's fetch could take the other's permit: an S3 fetch could take an S4 `scanText:false` permit and go out without the vault-text scan, and the interlock could release a local call while a cloud call was still pending (reproduced by the T-093 reviewer). `enterCloud` now also waits for `cloudPrefetch` to be empty, so attribution is exact. The cost is a wait of the grant → fetch gap (ms); A ‖ B still run in parallel after their fetches.
  - Also recorded for T-062: `enterLocal(id)` takes an id; one FIFO queue for both kinds; no nested gate calls while holding the interlock; each cloud retry re-enters the interlock; the device timeout goes inside `deviceQueue.run(fn)`.
  - Edited: ARCH §8.5, `web/src/ai/interlock.ts`, `deviceQueue.ts`.
- D-76 (user, Nov 20) **A development log records everything that happens, including flaws and what improved.** `docs/DEVLOG.md`: a flaw ledger (`F-nn`: date, task, found by review/live/self/mistake, severity, flaw, fix), a dated narrative and lessons learned. Backfilled from Nov 19. Appending to it is now a session-end step. Public-safe: no secrets, coordinates, place names or private photos. Edited: TASKS §2, CLAUDE.md (protocol + file map).
- D-77 (Claude, Nov 20; T-052/T-087/T-058 reviews) **Bands, copy and matcher details settled in code:**
  - **Bands (T-052):**
    - The words are SPEC §10.1 verbatim as `ui.band.<band>`.
    - The street, neighbourhood and district thresholds are locked (250/1000/5000), because the words name them; RC tunes only city and country. "Never metres" means never a measured distance.
    - A tie in `e` keeps the adversary's earlier hypothesis.
  - **Copy (T-087):** the 7 `copy.judge.coach.*` texts were authored by Claude to SPEC's one-line brief and corrected after review (on-device face and text finding; recorded result when the attacker is unavailable). **They need a human copy review.** The copy audit lives in `core/strings.test.ts`.
  - **Matcher (T-058):**
    - digit values match on punctuation-separated sub-words ("Tel:…", "REG:…");
    - groups are counted on the normalised value;
    - each word is also tried with a possessive 's removed (short child names);
    - `\p{Cf}` is deleted;
    - a function-word pair never counts for rule (b);
    - spaced letters are joined from runs of 2;
    - the digit window is up to the value's group count (max 6).
    - `fuzzy.json` `conventions` is the cross-platform contract.
  - After the fix verification: a zero-width space is read both deleted and as a space (both count), and the sub-word digit view joins up to 6 sub-words.
  - Edited: SPEC SCR-06, §10.1 and the RC table; ARCH §8.4, §12.2, §13 (table and template) and §20.1; TASKS T-052 Verify and T-062.
- D-78 (Claude, Nov 20; T-053 reviews) **Photo import rules (SPEC SCR-05):**
  - **Limits:** 30 MB = 30,000,000 bytes (as Finder and the copy say), checked from `Blob.size` before reading. 40 MP = 40,000,000 px, inclusive, read from the header before any decode (JPEG SOFn, PNG IHDR, WebP VP8/VP8L/VP8X, HEIF ispe).
  - **Format:** decided by magic bytes, never the name or MIME type. Rejected as `unsupported`:
    - GIF, video, AVIF;
    - animated files (APNG acTL before IDAT, animated WebP, HEIF sequences);
    - malformed or truncated files: a JPEG without a scan, a PNG without IEND.
  - **Walk caps:** every container walk is capped: JPEG segments up to the first SOS (1024), small non-IDAT PNG chunks up to IEND (1024; 65,536 chunks in all), RIFF chunks (1024), ISO-BMFF boxes per level (1024), and every child of HEIF `meta`.
  - **exifr never sees the file.** `sniff.exifTiff` takes the EXIF TIFF from those capped walks and hands only that to exifr. That is the JPEG APP1 "Exif" before the scan, the PNG eXIf before IEND, the WebP EXIF chunk, or the HEIF Exif item found via iinf/iloc (stored plainly, one extent). exifr's own parsers walk past IEND, byte-scan some JPEG segment bodies past the SOS, and walk every HEIF box: about 1 s and hundreds of MB on crafted files (round-5 verifier). An EXIF item stored any other way gets no GPS warning; the master is stripped either way. exifr gets at most 1 MiB of that TIFF: its TIFF parser trusts value counts (about 5 ms on a crafted 1 MiB TIFF), and ImageIO can put the GPS IFD past 100 KB. At most 64 ftyp brands are read. The sniff validates every HEIF infe and iloc entry with the lookup's caps, so an accepted HEIC never loses its Exif to a cap.
  - **Local files only (SR-06):** a drop or paste that carries a web address or page markup (`text/uri-list`, `text/html`, moz-url) together with a file counts as a link → `copy.import.noUrl`.
  - **GPS warning (P1, S0):**
    - every pin at district or closer is named, closest first, one line per {KIND}; a place pin shows its label;
    - pins are awaited for up to 5 s (`pinsWhenReady`), otherwise only `copy.import.gpsFound` shows;
    - a WebP's EXIF is read from its RIFF `EXIF` chunk.
  - **Fail closed:** a master that still carries APP1/APP13/GPS is the import error `ui.import.metadataFailed`, not the gate's copy, which says "would have left this device".
  - **UI:** the import status lives with the master in Check's reducer (`ui/checkState.ts`), so revisiting Import shows the panel for the photo Check holds.
  - Edited: SPEC SCR-05; ARCH §3 and §4.2 (R9); TASKS T-068, T-089, T-121.
- D-79 (Claude, Nov 20; T-054 reviews) **Vault item rules:**
  - At most **5 aliases** per item. Labels and aliases are ≤ 40 Unicode code points of the string as given, with no normalisation (web `[...s].length`, iOS `unicodeScalars.count`).
  - Ids are `vi_` + 12 hex characters and unique, so no free text can reach the unsealed ledger. Only an `area_name` may carry `linkedPinId`, and it must name a `home_pin` in the vault. Removing that pin keeps the area and drops the link.
  - Timestamps must be finite and ≥ 0. A real vault's pin source is `geolocation` or `manual` only (`synthetic` is Judge Mode only).
  - An item may hold only the VaultItem fields, and a pin only the Pin fields; a text item may hold no pin at all. Anything else, a sparse alias array, or a field of the wrong type is `bad_item`/`bad_pin`/`pin_not_allowed`, never a TypeError. In `updateItem`, a field set to `undefined` means "no change".
  - **What is validated is what is sealed:** new and updated items go through a JSON round trip (`asSealed`) before validation, so a toJSON, getter or class instance cannot be stored as something else. A BigInt or a cycle is `bad_item`.
  - **AC-088 widened:** no empty or generic string (`GENERIC_PIN_LABELS`) is ever a vault term, whether label or alias, of any kind. A text item whose label is empty or generic is refused (`label_required`); a pin keeps D-36.
  - A present but unrecognised vault record is `VaultCorruptError`: reads and writes refuse, and nothing overwrites it.
  - **Only a vault add creates the key.** `withVaultLock` passes an unforgeable lock token, which `ensureVaultKey`, `deleteVaultKey` and `clearBurnPending` require. Future session and queue writes use `getVaultKey()` under the lock and skip the write when there is no key (AC-270).
  - Edited: SPEC D-23; ARCH §3, §8.4 and §16.4; TASKS T-055 and T-121; `shared/testvectors/fuzzy.json` (a new termsOf case).
- D-80 (Claude, Nov 20; T-054 reviews and fix verifiers) **Burn is resumable, bounded and cross-tab:**
  - **Marker:** the key delete and a `burn-pending` marker are written in one transaction. The marker is cleared only after all three databases are deleted.
  - **Timeouts:** every deletion is timed from its request: 3 s for the user's Burn vault, 250 ms for retries. A same-tab second deletion of a database still being deleted rejects at once. `BurnPendingError` means "not deleted in time", so no vault operation can hold the cross-tab lock for an unbounded time.
  - **Resume:** every load, edit and boot, Judge Mode included, finishes a pending burn first. It reads only the marker, never the record or key, skips databases `databases()` no longer lists, and creates no database (`idb.databaseExists` where `databases()` is missing). When a retry's timed-out deletions complete, the tab announces a vault change once. A failure never announces, which prevents a cross-tab retry storm.
  - **Cross-tab index:** every committed vault change is announced on `BroadcastChannel('se-vault')` with no data, and every real index blocks and reloads. Reloads are coalesced, and `refresh()` before `init()` resolves at once. `performBurn` does not wait for the reload, but the index is blocked synchronously before it rejects. The gate's generation check before each permit is T-062.
  - **AC-241 narrowed:** boot may read the marker and finish a burn the user started; it never reads the vault record or key.
  - Edited: SPEC AC-241; ARCH §8.4, §15.1 and §16.4; API-NOTES §5.4; TASKS T-055 and T-062.
- D-81 (Claude, Nov 20; T-037 finding, applies to T-057) **Tier-0 OCR uses adaptive binarisation.**
  - Tesseract's default global Otsu found the demo name tag in only 14/30 realistic placements on street photos. Making the tag bigger made it worse.
  - Tier-0 OCR therefore sets `thresholding_method: '1'` (Leptonica adaptive Otsu, 26/30) once.
  - Wherever a missed word fails open (the vault-word match, the gate's OCR of the outgoing frame, the export check), a second Sauvola pass (`'2'`) runs and the words are unioned. The 30/30 in the spike table is a four-pass union; the two-pass union as built finds **29/30** (D-83).
  - The prop design stays: plain dark letters on a light tag, no border hugging the letters.
  - Edited: API-NOTES §5.2 (verified numbers); TASKS T-037 and T-057; PROGRESS "T-037 prop OCR".

- D-82 (user + Claude, Nov 20; T-038) **Public Hosting is live; Hosting only until the RC template exists; no SPA rewrite.**
  - The user approved publishing the walking-skeleton site ("Yes, deploy it"). It is deployed `--only hosting`: Auth was deployed on Nov 20 (T-030), and Remote Config waits for `remoteconfig.template.json` (T-060/T-102).
  - The `** → /index.html` rewrite is removed. Routes are hash-based (ARCH §3.4), so it served no route; it only turned a missing file (e.g. a wrong `/vendor/…` path) into `200 text/html` with a 1-hour cache. A missing file is now a real 404, and the service worker's `navigateFallback` still covers offline navigations.
  - Edited: `firebase.json`, ARCH §15.4, RUNBOOK §4.2 and §4.6 (results), API-NOTES U-10/U-20/U-21.

- D-83 (Claude, Nov 21; T-056/T-057 and their review) **Tier-0 OCR and face details:**
  - **OCR passes:** binarisation is a per-job `recognize` option (adaptive Otsu, then Sauvola), not a worker-wide setting.
  - **Union by line:** the Sauvola pass is unioned **by line**. A line is added whole unless every word on it is a re-reading, so a sequence only one pass read in full (spaced letters, a plate, a phone) stays intact.
  - **Recall:** measured with the real code on 30 placements, **29/30** (the adaptive pass alone 26/30). The one miss is a 32 px-cap tag on the busiest background. **Prop rule for T-010:** letters at least 48 px tall on the 2048 px master, i.e. about 3% of the photo's height. Pre-screen and the gate's own OCR are further chances.
  - **OCR lifetime:** start ≤ 120 s through an `errorHandler` (tesseract.js 7 never settles a failed language load), each pass ≤ 30 s, a failed worker replaced, a drop never waiting on a pending start. An empty canvas is refused, one PNG snapshot serves both passes, and the downscale canvas is freed. RC `ocr_max_px` is clamped 800–2048.
  - **Faces:** one detector per model at the RC floor 0.2; `face_min_confidence` (clamped 0.2–0.6) is applied to the scores in code. This gives the same faces and scores; boxes may shift slightly (weighted NMS). Boxes are clamped and rounded outward.
  - **Timing:** in the Browser pane, OCR timings swung 4–5× with the app's own CPU load. AC-064's 3 s Tier-0 budget is measured in the user's Chrome at T-085.
  - Edited: ARCH §11.2, the RC table and §18; API-NOTES §5.1–5.2; TASKS T-056, T-057 and T-037.

- D-84 (Claude, Nov 21; T-060) **Routing-policy parsing is strict; the only merge is the per-entry floor** (settles AC-020's "merges" against ARCH §7 step 1):
  - **Whole bundled policy, with a warning:** a non-string RC value, more than 8 KB (checked before `JSON.parse`), invalid JSON, any missing, extra or mistyped key (`"__proto__"` included), `version` ≠ 1, or an unknown enum value. A partial policy is never merged; RC sends the full `{version, classes, jobs}` or nothing. `undefined` (no RC value yet) is the bundled policy with no warning.
  - **Per-entry floor, with a warning:** each `HARD_FLOOR` violation keeps the bundled value for that entry; every other entry comes from RC.
  - **RC can tune:** S2 and S4 in full; S3 apart from `web` (`cloud: false` switches the adversary off); `jobs.explain` S2 or S0. ARCH floors S3 only on `web`, so S3's `ios` is not floored; the iOS gate must still send S3 only to the cloud model.
  - **`warning` is a string:** `<reason>` or `<reason>: <paths>`. The paths come from the module's own key lists and never echo RC text. AppConfig's `policyWarning` carries it, and the HUD logs `copy.hud.policyRejected`.
  - Edited: SPEC AC-020; ARCH §7 ("As built"); TASKS T-060 and T-102.
- D-85 (Claude, Nov 21; T-060) **The RC template exists; the floor is code; the default is checked at import.**
  - T-060 created the repo-root `remoteconfig.template.json` as a verbatim copy of ARCH §13.3: 27 keys, equal to the §13.2 table in type and default, and `routing_policy` equal to ARCH §7. From now on the file is canonical. T-102 keeps `remoteConfig.ts`, AC-293..295 and the first `--only remoteconfig` publish.
  - `HARD_FLOOR` is hand-written in `core/routing.ts`, never read from the template, so a template edit cannot loosen S0 or S1. `DEFAULT_POLICY` is parsed and floor-checked at import, and a bad template default throws, which fails `npm run check`.
  - iOS bundles the template at the app bundle root (T-038 remainder).
  - Edited: ARCH §13.3; RUNBOOK §4.4 and §4.6; TASKS T-038, T-060 and T-102; `ios/project.yml`.

- D-88 (Claude, Nov 21; T-059) **One ImageFrame per derived frame; Gemini boxes map straight to the master; padding rounds up.**
  - `core/frames.ts` builds every derived frame (nano768, cloud, export): `deriveFrame` snaps the crop **inward** to whole master pixels and scales it with `fitWithin` (each side rounded separately); `renderFrame` draws exactly that crop into exactly that size, masks first, on a copy of the master; `buildFrameJpeg` adds JPEG and `assertCleanJpeg` and returns `{jpeg, frame}`. The frame travels with the bytes, so mapping back never drifts. Pure geometry stays in `core/boxes.ts`; `core/pipeline.ts` (later) composes these.
  - Pass-B boxes go through `box2dToMaster(box, frame)`: straight from 0..1000 to master pixels via the crop (no frame-pixel step, so the frame's anisotropic rounding cannot bias them), rounded outward once, kept inside the crop; non-finite or zero-area (judged on the 0..1000 values) → `null`. `box2dToPx` keeps its signature and AC-192 vector for existing callers.
  - `padRect` rounds the 7.5% per side **up** (it rounded to nearest, so a 110 px box got 8 px instead of 8.25), rounds the result outward and clamps the ratio 0–0.5 like RC `mask_pad_ratio`. Mapping multiplies before dividing, so float noise (0.55 × 800 = 440.00000000000006) never grows a box by a pixel and the cross-platform vectors are exact.
  - `Clue.box` stays **unpadded** (as found; T-073 draws it); `padRect` is applied when masks are built (pipeline, T-079), so a box is never padded twice.
  - Edited: ARCH §3 layout, §11.1, §11.5, §11.6, §20.1; TASKS T-059; new `shared/testvectors/box2d.json`.

- D-89 (Claude, Nov 21; T-059) **Crop side and OCR preference rules.**
  - Crops remove the **padded** boxes, the same rects a mask would cover (Gemini boxes are approximate: API-NOTES §6.1 "clamp, swap, drop zero-area, then pad").
  - `bestCrop` (rules plan, SPEC §10.4, ARCH §12.5) tries all four sides and keeps the one that removes the smallest share of the photo within the 40% cap; ties go top, bottom, left, right; none fits → `too_much` (crop `'none'`, `copy.fix.unremovable`). Exactly 40% is allowed.
  - `preferOcrBoxes`: the union of the same-text OCR words that touch the pass-B box replaces it when that union's IoU with the pass-B box is > 0.3 (per-word IoU would reject a long sign read as several words). Text matching stays with the caller (T-079).
  - Edited: ARCH §11.5; new `shared/testvectors/crop.json` (AC-196, including two rules-plan cases).
- D-86 (Claude, Nov 21; T-061) **Capability states: one precedence where SPEC §5.2 overlaps, one createOptions source, an honest (b) chip.**
  - `capabilityOf` (AC-001, tested over all 100 signal combinations): Nano off (setting or simulation) → (c); no `LanguageModel` → (c); text `available` → (a), or (a′) when image is not `available`, even while the image model downloads (the gate checks each io freshly, so text jobs really run on the device); text `downloadable`/`downloading` → (b); text `unavailable` → (c) whatever image says.
  - The Download button shows in (b), and in (a′) when the image model can be fetched. It fetches the image io when that is fetchable (it covers text), else the text io.
  - Header chip in (b): `Downloading Nano N%` only while something downloads (ours, or Chrome's own at 0 % until a click attaches a monitor). `downloadable` alone shows `Rules-only`: nothing is downloading, and private checks are rules-only until the model is ready.
  - `NANO_TEXT_IO`/`NANO_IMAGE_IO` live in `ai/capabilities.ts`, deep-frozen. `ai/models.ts` (T-065) imports them instead of defining its own, so the gate checks the very objects the SDK passes to `availability()`.
  - The gate path is stricter than ARCH §9.5's snippet: `availability()` gets a 5 s timeout, and any answer outside the four known values is `unavailable` (fail closed).
  - Edited: SPEC §5.2 and §8.2; ARCH §9.3 and §9.5; TASKS T-061.
- D-87 (Claude, Nov 21; T-061) **"Download Gemini Nano": the SDK's initializer once T-065 provides one; until then the SDK's own create-with-monitor call, with the session destroyed.**
  - `enableDeviceModel(io, onProgress, initialize?)` must be called synchronously from the click handler. **The direct path** (no initializer) reaches `create()` in the click's own task, so the user activation holds.
  - **With `initialize`** (the SDK's `initializeDeviceModel`, bound to an on-device model from `ai/models.ts`), the SDK downloads, as SPEC SCR-02 and AC-073 say. "Same task" does **not** hold there: the SDK awaits `availability()` before its `create()`, so it relies on Chrome's transient activation (about 5 s) surviving that one await (API-NOTES §1.6; T-061 review). This needs T-065 (R2 keeps `getGenerativeModel` in models.ts) and AppShell passing a per-io factory to `useCapabilities({ initializeDeviceModel })` (D-100).
  - Until then: `LanguageModel.create({...io, monitor})`, the same call the SDK makes internally (API-NOTES §1.6), then `destroy()` at once. It never prompts, so it is not feature inference (API-NOTES §8). The SDK's own download never destroys its session [VERIFIED: src], which keeps the model resident on 8 GB.
  - The UI snapshot is re-taken on `visibilitychange`, every 2 s while Chrome reports a download, and as soon as a download ends, so the chip turns to `On-device: Gemini Nano` within 2 s (AC-073).
  - Edited: ARCH §9.5; API-NOTES §1.6; TASKS T-061.

- D-92 (Claude, Nov 21; T-055) **The Vault UI never shows a pin's coordinates; details take optional other spellings; refusals are mapped per field.**
  - **No coordinates on screen:** a pin is shown only by its source ("Coordinates entered by hand") and accuracy ("Accuracy about ±35 m", plus `copy.vault.lowAccuracy` above 250 m). The list, the pin status and the edit form never echo lat/lng; editing keeps the stored pin unless the user pins again or types new coordinates. SPEC asks only for the accuracy, and a vault on screen is easy to film or shoulder-surf.
  - **Manual "lat, lng":** two decimal numbers separated by a comma or whitespace (a Unicode minus counts), |lat| ≤ 90, |lng| ≤ 180. Decimal commas, exponents, hemisphere letters and anything over 64 characters are refused, never guessed. A manual pin has accuracy 0 (core/types).
  - **Other spellings (aliases)** are offered for text details only, comma-separated, up to 5. Pins do not offer them: a pin with a generic label contributes no terms at all (D-36), so an alias there would silently do nothing. A pin's existing aliases are kept on edit.
  - **Refusals:** the store stays the authority. The form checks lengths first (code points, like the store) only so the message lands on the right field; every `VaultValidationCode` has copy (a typed Record, so a new code fails the typecheck), the codes the form cannot cause share `ui.vault.error.invalid`, and `VaultCorruptError` points at Burn vault. A label over 40 characters is refused inline as it is typed (no `maxLength`, so a pasted name is never silently cut).
  - The kind is fixed while editing (delete and add again to change it); `place_pin` reads "Other place".
  - Edited: SPEC SCR-04; ARCH §3 layout (`vault/geolocation.ts`); TASKS T-055.

- D-93 (Claude, Nov 21; T-055) **Burn vault: a pending burn shows a retry and turns to done by itself.**
  - `BurnPendingError` comes only after the key is deleted (it is deleted first, AC-271), so the pending copy says the vault can no longer be read and that some stored data is still being deleted. It never shows `copy.burn.done` and never blames other tabs alone.
  - While pending, the dialog checks once and then on every vault change: a `loadVault()` that resolves means the burn has finished (a load finishes an interrupted burn first and rejects while it cannot), so the state turns to `copy.burn.done`. "Try again" runs `performBurn()` again; while this tab's deletion is still queued it fails at once with the same pending state, so it never piles up waits.
  - Hold to confirm: a pure state machine (`holdStep`). Pointer and Space/Enter both hold; key auto-repeat never restarts the hold; release before 1.5 s, blur or pointer cancel abandons it; a release at or after 1.5 s fires even if the timer ran late. A finished or failed burn starts over at the next open; a pending one keeps its retry.
  - Edited: SPEC SCR-19; TASKS T-055.

- D-90 (Claude, Nov 21; T-075) **The rules referee lives in `core/referee.ts` over the one matcher; the merge keeps the device's route; `+rules` when rules contribute.**
  - **Placement:** ARCH §8.4's sketch put `rulesStrength`/`KIND_COMPAT` in `tier0/fuzzy.ts`, but T-058 shipped fuzzy.ts without them. They live in `core/referee.ts`, built only from fuzzy.ts exports (normalisation, folds, `tokens`, `tokenSim`, `isDistinctive`, `isGeneric`, the word lists, the digit match); `KIND_COMPAT` comes from enums.v1.json. There is no second normaliser or similarity (AD-21 holds).
  - **Rule details SPEC §10.3 leaves open, pinned in `shared/testvectors/referee.json`:** label tokens compare by token similarity ≥ θ (a misspelt name is still exact); synonym-class words and artefact terms compare as whole tokens (no similarity, so no plurals: "badges" is not "badge"); a pair of function words is never a 2-token run, and a one-token generic label under 4 characters never matches (as in the matcher); plate / house_number / phone use the SCR-06 digit match for exact and skip the text rules (no "likely" from part of a number); the acronym takes first letters, skips function words, needs ≥ 3 letters and must equal a claim token. Reasons are the ARCH §12.1 templates; the artefact named is the first in `ARTEFACT_TERMS` order, and a class is named by its first word.
  - **Eligibility:** a pin with an empty or generic label has no referee strings at all, aliases included (AC-167); other generic strings are skipped one by one. `rulesStrength` re-checks this, so raw `VaultItem[]` are safe. `refereeVaultItems()` drops coordinates; `refereeClaims()` = inferences, then hypotheses as `area`. T-074 can reuse both.
  - **`mergeMatches` returns `{matches, notes}`.** When the device found a pair, `route` is the device match's own route (`ON_DEVICE`, or `IN_CLOUD` when an S4 Judge Mode device job fell back to the cloud), even when the rules strength is kept; otherwise `RULES_ONLY`. ARCH said `ON_DEVICE`, which would mislabel that S4 case in the HUD. `notes` is `['+rules']` when at least one valid rules match entered the union (ARCH said "if both did"; SPEC SCR-09 tags the union). Invalid strengths are dropped.
  - Edited: ARCH §3, §8.4 and §12.1; TASKS T-075; `shared/testvectors/referee.json` (new).
  - **Amended later the same day:** D-94 (3(b) needs a shared token), D-101 (1(b) generic pairs; one-token generic strings), D-102 (function words generic), F-121 (every claim reading), F-124 (image-mode digit match; generic-label items dropped). The details above that those change are superseded.
- D-91 (Claude, Nov 21; T-065) **Model factories take a `CloudParams` object with a timeout; pass B gets 16,384 output tokens; the download initializer is per io.**
  - **Signatures:** `deviceJsonModel(ai, io, schema)`, `deviceTextModel(ai)`, `judgeJsonModel(ai, io, schema, cloud)`, `explainModel(ai, cloud, mode)`, `adversaryAModel(ai, system, cloud)`, `adversaryBModel(ai, system, cloud, schema)`. `io` is `'text' | 'image'` and resolves to capabilities.ts's frozen `NANO_*_IO` objects (D-86). `cloud = {model, thinkingLevel, timeoutMs, seed?}` comes from `cloudParamsFor(cfg, job)` over the AppConfig fields (ARCH §13.4), following ARCH §9.2.
  - **Timeouts:** cloud-capable factories pass `{ timeout }` as getGenerativeModel's RequestOptions (the SDK default is 180 s). Device-only factories pass none: the timeout never reaches the device, and the gate uses `Promise.race`.
  - **Checked before building:** exact model id (lowercase, no spaces, never `-latest`), allowed thinking level (MINIMAL refused for the adversary), integer timeout of 1 s–10 min, integer seed. `adversary_seed` is cast in only when non-zero (U-11). `explainModel` accepts only PREFER_ON_DEVICE or ONLY_IN_CLOUD (AC-277).
  - **Output caps:** judge 2048, explain 512, pass A 4096 (as ARCH), **pass B 16384** (ARCH had 8192). U-12 is open, and 16384 is the only pass-B cap ever exercised (T-031); a cap costs nothing unless used, while truncation fails the check. Revisit all four once U-12 is measured.
  - **Download (D-87):** `initializeDeviceModelFor(ai, io)` returns a `DeviceModelInitializer` (the SDK's `initializeDeviceModel` on an ONLY_ON_DEVICE model with `ioOptions(io)`). The SDK downloads for that model's createOptions, so the initializer must match the io being downloaded; `useCapabilities` currently takes one initializer for both (open item for the hook's owner). The SDK keeps the created session resident (API-NOTES §1.6).
  - Edited: ARCH §3 and §9.3; API-NOTES §1.11; TASKS T-065.

- D-94 (orchestrator, Nov 21; settles F-98 from T-075) **Rules referee 3(b) needs a shared non-generic token.**
  - SPEC §10.3 rule 3(b) ("possible" via compatible kind + high confidence) now also requires that the claim shares at least one NON-generic label/alias token with the item under the matcher's token rule: `tokenSim` ≥ RC `fuzzy_threshold`, tokens of ≤ 3 characters equal, `GENERIC_WORDS` (and their folds) never count.
  - Without a shared token a confident claim never marks a vault item: one high-confidence `other` claim or an area hypothesis must not turn every name, plate, phone or pin amber. Geography is handled by the distance bands in code, never by the referee.
  - Digit kinds (plate, house_number, phone) never reach 3(b) without a digit match (which is already exact).
  - In practice 3(b) now fires on a shared short (≤ 3 characters) non-generic token, because a shared token of ≥ 4 characters that is not generic is already 2(a) "likely".
  - Built in `core/referee.ts` (`sharedToken`); `shared/testvectors/referee.json` gains six D-94 rows (no shared token vs a child name, vs a labelled pin, generic words only, a short shared token → possible, a high-confidence off-by-one plate) and its old "compatible kind only → possible" row is now none. 8 mutations of the new rule, all killed.
  - Edited: SPEC §10.3; ARCH §12.1; TASKS T-075; DEVLOG F-98.

- D-95 (Claude, Nov 21; T-060 review) **The routing policy is deep-readonly in type as well as frozen at runtime.**
  - In `core/types.ts`, every `ClassPolicy` field is `readonly`, and `RoutingPolicy` has `readonly version` plus `Readonly<Record<…>>` for `classes` and `jobs`. This is a pure readonly wrapper; nothing else wrote to these types, and everything compiles.
  - `DEFAULT_POLICY`, `EffectivePolicy.policy` and `AppConfig.routingPolicy` therefore cannot be written at compile time. `routing.test.ts` pins this with `@ts-expect-error` lines.
  - Edited: ARCH §6 types block and §7.
- D-96 (Claude, Nov 21; T-060 review) **`shared/testvectors/rc.json` holds the routing-policy cases for web and iOS.**
  - Its `routingPolicy` section has `default`, `maxChars` (8192), `hardFloor`, `judgeDeviceJobs` and 136 cases (9 accepted, 52 floor, 75 rejected). Each case has a small input form (`absent`, `notString`, `raw`, `edits`, `padTo`, `repeat`) and an exact expected warning and policy. The conventions are in the file.
  - `routing.test.ts` runs every case and checks that the file covers all 50 single floor violations and every warning reason. Web-only robustness checks stay in TypeScript: deep nesting, a bigint, a symbol or a function, freezing, and the seeded fuzz.
  - T-102 adds one sibling section per other RC key. The iOS `RemoteConfigService` runs every case except `notString`.
  - Edited: ARCH §7 and §19.3; TASKS T-102 and T-060.

- D-99 (Claude, Nov 21; T-055 review, F-113–F-116) **Burn vault and pin fixes: slide-off cancels, outcomes while closed, an assistive-technology confirm step, a pin watchdog.** Amends D-92 and D-93.
  - **Slide-off:** the hold button keeps pointer capture and cancels the hold on any move outside its box; coming back does not resume it.
  - **Outcome while closed** (Escape mid-burn, or a pending burn finishing later): the Vault screen shows it as its status line (`copy.burn.done`, `ui.burn.pending` or `ui.burn.failed`), and the sheet's next open is the confirm step with its hold button. A pending burn keeps its pending state and retry. Every vault change clears the Vault screen's status line, so "Added…" never survives a burn.
  - **Focus after the hold** goes to the status text, never to Close or Try again, so a Space/Enter still held cannot activate them.
  - **Assistive technology:** a click with no pointer or key press of ours before it (screen-reader browse mode, switch access) opens an explicit second step, "Burn your vault now?" with "Yes, burn my vault" and Cancel. It is a deliberate confirmation with no checkbox and no partial option (SPEC SCR-19, D-31). Pointer clicks follow their own press and are ignored; our Space/Enter handling prevents the browser's click.
  - **Pin watchdog:** the browser's 15 s timeout only starts after permission is granted, so `currentPin()` fails as `timeout` after 30 s without an answer (`copy.vault.pinTimeout`); a late answer is ignored.
  - **Display and parsing (amends D-92):** accuracy rounds UP to whole metres. A manual number needs digits on both sides of a decimal point (`52 .5`, `52. 52` and `.5` are refused). A Home pin plus its area refused as `full` shows `ui.vault.error.fullWithArea` on the area field.
  - Edited: SPEC SCR-04 and SCR-19; TASKS T-055.

- D-97 (Claude, Nov 21; T-059 review, F-109) **Masks, crops and frame mappings fail closed on malformed input.**
  - `assertRect` (boxes.ts): a rect with a non-finite, missing or non-number field, or a negative w or h, **throws**. It is never zeroed, clamped into shape or skipped. `fillSolid`, `padRect`, `minimalCrop`/`bestCrop`, `frameToMaster`, `masterToFrame`, `masterToBox2d`, `preferOcrBoxes`, `snapCrop` and `applyMasks`' crop all use it. A zero-area rect is valid and does nothing. `box2dToMaster` keeps returning `null` for bad Gemini boxes (its documented contract; parse already drops them).
  - `renderFrame` (so `buildFrameJpeg`) and `applyMasks` also require **every mask to paint**: `fillSolid`'s count must equal the number of masks, so a mask wholly outside the master or of zero area is an error, never a silent no-op. They free every canvas they made on every path. `renderFrame` draws the output only from the masked copy and requires a valid, whole-pixel frame inside the master (`assertFrame` also pins crop x, y ≥ 0 and finite values).
  - `deriveFrame`: only `crop: undefined` means "no crop"; `null` throws.
  - Edited: ARCH §11.1, §11.5, §11.6, §20.1; `shared/testvectors/{box2d,crop,frames}.json`.

- D-98 (Claude, Nov 21; T-059 review, F-111) **`clampMaxPx`: derived-frame sizes are whole numbers in a fixed range.**
  - `clampMaxPx(id, raw)` floors (RC 1536.6 → 1536, so a frame is never wider than intended) and clamps: **cloud 768–2048** (ARCH §13.2), **nano768 256–768** (never above the size Nano was verified with; new, code-side), **export 1–4096** (SPEC SCR-12 P2). Missing or non-finite → 1536 / 768 / master size. `deriveFrame` and `buildFrameJpeg` always apply it, so a raw RC value can be passed straight in.
  - ARCH §13.2's `nano_image_max_px` row has no clamp yet; the RC owner (T-102) should add "clamped 256–768 in code (D-98)" there and in the template description when it next touches them.
  - Edited: ARCH §11.1; `shared/testvectors/frames.json`.
- D-100 (Claude, Nov 21; T-061 review, F-117..F-120) **The capability UI: a tested controller, a ≤30 s snapshot, a per-io initializer, one completion announcement, and a boundary rule.**
  - **Controller:** all of `useCapabilities`' timing lives in `createCapabilitiesController(deps)` (injected `uiCapabilities`, `enableDeviceModel`, clock, timers, document, service worker). It is unit-tested with fake timers. The hook only starts and stops it, and reads it with `useSyncExternalStore`.
  - **Snapshot life (SPEC §5.1 ≤30 s):**
    - Re-checks are unforced at start, when the snapshot expires (30 s after it was **taken**) while visible, and when the panel becomes visible (IntersectionObserver).
    - They are forced on `visibilitychange` to visible, every 2 s while a download runs, and right after our download ends.
    - A rejected check is retried after 30 s, so one bad first check never pins (c). The service worker is re-read when the controller starts.
  - **Initializer:** `useCapabilities({ initializeDeviceModel?: (io) => DeviceModelInitializer })` builds the initializer inside the click for the io being fetched, matching `models.initializeDeviceModelFor(ai, io)` (D-91). The direct `create()` path stays the default (D-87) until AppShell is wired after Firebase boot (TASKS T-101).
  - **Announcements:**
    - In (a′), image-support progress uses `ui.cap.imageDownloading`: `copy.cap.nanoDownloading` says private checks wait, which is false in (a′).
    - When the Download button goes away, focus moves to row 1's **heading**, not the status line, so the live region announces the end once.
  - **R23 (check-boundaries):** `uiCapabilities` / `peekUiCapabilities` may appear only under `web/src/ui/**` (and in `ai/capabilities.ts` and tests), so the gate can never decide with the cached snapshot (AC-007).
  - Edited: ARCH §4.2 (R23, 113 planted) and §9.5; TASKS T-061, T-062 and T-101.

- D-101 (orchestrator + Claude, Nov 21; T-075 review, F-122) **Rules referee 1(b) needs a non-generic token; a one-token generic label never fires 1(a).**
  - SPEC §10.3 rule 1(b) (≥ 2 consecutive label tokens → exact): the pair counts only if it holds at least one NON-generic token. When EVERY label token is generic, any pair counts. This keeps AC-165's "City General" vs "City General Hospital" exact (all three tokens are generic). The orchestrator's note said "then only 1(a) whole-label applies", which would have made that row fail; I followed its examples. Pairs of function words still never count (the matcher's rule).
  - Results: "a primary school in the north of the city" vs "Northfield Primary School" → possible (3(a)); "a high school uniform" vs "Hillcrest High School" → likely (2(c)); "the old town square" vs "The Old Mill" → none.
  - Rule 1(a): a one-token label or alias that is a generic word ("Hospital") never matches, whatever its length (before: only under 4 characters). Generic strings are not terms (D-79). Such an alias can still share a synonym class (2(c)/3(a)).
  - Edited: SPEC §10.3; ARCH §12.1; `shared/testvectors/referee.json`; TASKS T-075.
- D-102 (orchestrator, Nov 21; T-075 review, F-123) **Common English function words are generic.**
  - `GENERIC_WORDS` (enums.v1.json and SPEC §17.5, together) gains: a, an, with, from, near, by, to, behind, next, this, that, its, my, our, your, their, his, her. They are never distinctive (rule 2(a)) and never a shared token (rule 3(b)). The matcher's separate `FUNCTION_WORDS` set in `tier0/fuzzy.ts` (the, of, and, for, at, in, on: pairs of them never form a run, and acronyms skip them) is unchanged; it lies inside `GENERIC_WORDS`, so there is still one generic list.
  - Matcher effect: these words can no longer be the "one distinctive token" of a multi-word vault label, and a one-token vault string made of one of them (under 4 characters) never matches. `fuzzy.json`, the matcher tests and vaultScan tests pass unchanged (311 tests). The enums.v1.json hash in `shared/prompts/manifest.json` was refreshed (all prompts are drafts, D-62).
  - Edited: SPEC §17.5; `shared/prompts/enums.v1.json` + manifest hash; `shared/testvectors/referee.json`.

- D-103 (Claude, Nov 21; T-091, F-129) **Before any route: unsupported page, then Welcome; the judge deep link opens SCR-02 after Welcome.**
  - `App` shows, in order: the unsupported-browser page (no WebAssembly or no IndexedDB), SCR-01 Welcome until `se.ack18.v1` exists, then the shell (`ui/gate.ts` `topScreen`). DEV pages (`#/dev/*`) skip both, so unattended spike runs never stop at Welcome.
  - A Welcome finished on `#/judge` (the `?judge=1` deep link after main.tsx's redirect, or `#/judge` typed on a fresh profile) mounts AppShell with SCR-02 open; its "Try Judge Mode" is the third click (AC-071). A returning profile with `?judge=1` goes straight to `#/judge`, as SPEC D-27 says.
  - AppShell: a link inside SCR-02 to the route already shown (no hash change, so no route change) closes the sheet and moves focus to main. Before this, "Try Judge Mode" on `#/judge` did nothing (F-129).
  - The flag is set before the acknowledgement is stored, so AppShell mounts with it even if React did not batch the two updates. When storage refuses the acknowledgement, the session continues and a reload asks again.
  - Static renders (tests, no DOM) treat the acknowledgement and browser support as given (`useSyncExternalStore` server snapshots), so `ui/shell.test.ts` still renders the shell; the gate itself is tested in `ui/gate.test.ts` and `ui/welcomeSettings.test.ts`.
  - Edited: ARCH §3.1, §3.4.

- D-104 (Claude, Nov 21; T-092) **`core/localPrefs`: a per-tab cache is the session's truth; Settings P0 only; About details.**
  - Storage: every access is in try/catch, including reading `window.localStorage` itself. A per-tab cache holds what was last read or written; a write that fails still applies for the visit, and that key's session value wins over the stale stored one until a write succeeds. Other tabs' changes arrive through the `storage` event (our `se.*` keys only). The cap counter (`se.cap.<local day>`) is always read fresh, so another tab's runs count, and each increment drops earlier days' keys. Exports for the gate match ARCH §8.2: `prefs.nanoEnabled()`, `prefs.simulateNoNano()`, `prefs.simulateOffline()`, `caps.usedToday()`, `caps.increment()`.
  - Settings shows only P0 items (D-33) plus the P1 Developer simulations. Developer appears with `?debug=1` **or while a simulation is on**, so a persisted simulation can always be turned off. Simulations (`se.dev.simulateNoNano`, `se.dev.simulateOffline`) only downgrade: they feed `nanoEnabled` and `online` in AppShell, never the reverse. A refused write shows `ui.settings.notSaved`.
  - Settings reads the shell's single capability view through `ui/shellContext.ts` (no second `useCapabilities` instance). Clear history and Copy ledger receipt render only when `SettingsDeps.clearHistory` / `.receipt` exist; no store function exists yet (T-063, T-096).
  - About: the version comes from `web/package.json`; the commit from `VITE_GIT_SHA` when the build sets it, otherwise "commit not recorded in this build". The E12 prior art is described without its project name in the app, because AC-304's audit forbids "safe" in any string (F-127); the README can name it.
  - Edited: ARCH §3.1, §16.3; SPEC SCR-20.

- D-105 (Claude, Nov 21; T-094) **System banners: one cloud-off banner by precedence; per-call events are dismissible; a store the cloud side feeds.**
  - `ui/systemStatus.ts`: while the cloud is off, exactly one banner, the most severe reason: tripwire > kill switch > App Check > sign-in > daily cap (used ≥ `daily_adversary_cap`). Each of those already says cloud checks are off and on-device checks still work. Per-call events (429 `copy.err.rateLimit`, network `copy.err.network`, 400 `copy.err.cloudFailed`) show only while the cloud is on, in that order, and can be dismissed. A 429 banner clears itself after 60 s.
  - The tripwire banner is red, in a `role="alert"` region, and can only be turned on, by `markTripwire()`: `set()` cannot touch it and `dismiss()` cannot clear it (AD-31). Every other banner is polite.
  - The same reason drives the header chip ("Cloud paused" for tripwire, kill switch, App Check and sign-in; "Cloud limit reached" for the cap) and SCR-02 row 3.
  - Feeders: T-103 `systemStatus.set({ killSwitch, dailyCap })` from `cfg()`/`onConfigUpdate` and `caps.increment()`; T-101 `set({ appCheckFailed, authFailed })`; T-062 `markTripwire()` and `report(...)`. Until RC feeds it, `dailyCap` is the RC template default (read from the template, AD-28).
  - HTTP 400 → `copy.err.cloudFailed` follows SPEC SCR-22; ARCH §17 still says `copy.adv.truncated` for `CLOUD_BAD_REQUEST` (F-128, for T-062 to align).
  - Edited: SPEC SCR-22; ARCH §3.1.

- D-108 (Claude, Nov 21; T-102, F-137, F-140) **Remote Config parsing: a pure parser, strict grammar, invalid → default, clamps reported, two keys fail safe.**
  - `web/src/firebase/rcParse.ts` (no SDK import) parses every key; `firebase/remoteConfig.ts` only feeds it `getValue().asString()` (never `asNumber`/`asBoolean`, which turn junk into 0/false, F-137). `routing_policy` stays with `core/routing.ts` `effectivePolicy` (D-84) and reports through `policyWarning`.
  - **Grammar:** booleans `true`/`false` and the enums (thinking levels, `data_tier`) are ASCII case-insensitive and accept only ASCII letters (so `hıgh` or `falſe` never fold into a valid word); numbers must be JSON numbers and finite; only ASCII space/tab/CR/LF around a value is ignored; model IDs are never trimmed (`isExactModelId`). Length caps before parsing: boolean 16, number 32, string 64, JSON 4096.
  - **Outcomes:** a refused value → its default with warning `invalid`; a number outside its §13.2 clamp → moved into range (floored for the cap and the frame sizes, rounded for OCR, as the consumers' helpers do; a parity test sweeps all six) with warning `clamped`; a JSON object with bad entries keeps the good ones (`prompt_versions` per family, `timeouts_ms` per job, unknown keys ignored) with warning `partial`; `auto_mask_types` and `bands_m` are all or nothing. `max_fix_rounds` (1–10) and `adversary_seed` (int32) are refused, never moved.
  - **Fail safe instead of default:** a refused `kill_switch` reads as `true` (cloud off) and a refused `data_tier` as `free` (the conservative consent copy, grounding off). AC-293 says "default"; for these two keys the default is the less safe value, and the console's typed parameters make a refused value an operator error anyway.
  - `AppConfig` gains `warnings: {key, reason}[]` (ARCH §13.4 had no carrier for "logs a HUD warning", F-140); warnings never contain the value. `groundingEnabled` is the effective value (`&& dataTier === 'paid'`). `source` = `remote` only after a fetch or real-time activation in this page load (`lastFetchStatus` persists across loads). Every template default is parsed at import and must pass cleanly, so a bad template edit fails `npm run check`.
  - `shared/testvectors/rc.json` gains one section per key (512 cases), `keyConventions` and `effectiveConfig`; the iOS RemoteConfigService runs the same file.
  - D-98's nano clamp is now in the §13.2 row and the template description ("Clamped 256-768 in code"); `routing.test.ts`'s clamp count goes from 6 to 7.
  - Edited: ARCH §3 layout, §13.2 (rows + Validation note), §13.3 (mirrors the template), §13.4 (As built), §20.1; API-NOTES §2.4; `remoteconfig.template.json`; TASKS T-102.
- D-109 (Claude, Nov 21; T-101/T-102, F-138) **Boot never blocks the render; the debug flag follows AC-291's literal order.**
  - `web/src/boot.ts` runs ARCH §15.1 steps 3–5: `loadConfig()` → `vaultScan.setFuzzyThreshold(cfg().fuzzyThreshold)` (kept in sync through `subscribeConfig`) → `vaultScan.init({ judge })` → render. Each await is bounded by `BOOT_STEP_TIMEOUT_MS` (3 s) and `loadConfig` waits for `ensureInitialized` at most 2 s and never for the fetch, so an offline, lie-fi or broken-IndexedDB start renders at once (AC-294). A vault step that fails or hangs still renders: `vaultScan` blocks every AI request synchronously before its first await, so the gate and the tripwire fail closed until the index exists.
  - The boot route is Judge Mode for `?judge=1` or `#/judge` (`isJudgeBoot`, read before the redirect). `boot()` runs once per page load.
  - `firebase/init.ts` now sets the DEV debug flag right AFTER `initializeApp` (still before `initializeAppCheck`), the order AC-291 and API-NOTES §1.2 state; ARCH §15.1's sketch had it first (F-138). Both orders satisfy the real constraint (flag before App Check).
  - Real-time updates activate all keys, as ARCH §13.4 sketched; the gate reads `cfg()` per call, so one call never mixes two configs.
  - Firebase (app, App Check, Auth, AI, Remote Config) is now in the main chunk (657 KB minified, over Vite's 500 KB warning): ARCH §15.1 requires it to evaluate before the first render.
  - Edited: ARCH §3 layout and §15.1; `web/src/main.tsx` (R15 kept).
- D-110 (Claude, Nov 21; T-101, F-136) **`ensureAuth()`: anonymous sign-in is retried; the gate awaits it before every cloud call.**
  - ARCH's `authReady` promise resolved `null` for the whole session when the first sign-in failed (offline start), so a check queued offline (ARCH §5.3) could never be sent after reconnecting. `ensureAuth()` returns the current UID, or signs in (sharing one in-flight attempt) and resolves `null` on failure without rejecting; the next call tries again. `authReady = ensureAuth()` is kept for the dev spikes.
  - T-062's gate must call `await ensureAuth()` (not `authReady`) before every cloud call and map `null` to `CLOUD_AUTH` / `copy.err.auth` (AC-291's second sentence).
  - Edited: ARCH §15.1; API-NOTES §2.3; TASKS T-101.
- D-106 (Claude, Nov 21; T-090, F-134, F-135) **`check-images.mjs`: every committable file, a token-anchored coordinate scan with a reviewed value allowlist, and fail-closed media rules.**
  - Scope: `git ls-files --cached --others --exclude-standard` (tracked plus untracked-not-ignored: anything a `git add` could commit). A file on a secret path is reported without being read; ignored files are never listed.
  - C1 (coordinates): the TASKS regex `-?[0-9]{1,3}\.[0-9]{4,}` matched inside arXiv IDs, version strings, DOIs and float noise (47 hits, almost none a coordinate), and missed `N52.…`-style prefixes. Now a decimal counts only as its own token (not after a digit, letter or dot; a hemisphere letter may prefix it), with an integer part of 0–180 and 4+ significant fraction digits, where a run of six 0s or 9s ends the significant part. A DOI prefix (`10.` + digits + `/`) is skipped.
  - The AC-351 path allowlist is unchanged (`web/public/samples/*.json`, `shared/testvectors/*.json`, lock files). Every other hit fails unless its **exact value** is listed for **that file** in `scripts/check-images.allow.json` with a reason (synthetic open-ocean test pins, the public Berlin–Paris vector, probe latencies and pixel boxes, a scale factor, two non-coordinates in `benchmark/spike/score-spike.mjs`). A value gone from its file only warns. This deviates from AC-351's "allowlists only …" wording for reviewed non-coordinate and synthetic values; SPEC's intent (no true coordinates committed) is unchanged.
  - Images: JPEG (APP1, APP13, and APP11 because a C2PA manifest can copy EXIF GPS; metadata signatures anywhere; anything after EOI), PNG (eXIf/tEXt/iTXt/zTXt/caBX; anything after IEND) and WebP (EXIF/XMP/C2PA) are parsed; every other image or video container fails closed (I4). `benchmark/` may hold no image and no base64 pixels (B1).
  - AC-364 pre-check, automated: PRIV paths and `truth*.csv` (P1); `.env*` except `web/.env.example` and `web/.env.e2e`, `*.local`, the debug-token file, `Secrets.xcconfig`, `*.secret*`, key stores, service-account JSON (S1); the committed `.gitignore` still ignores the secret paths (S2, `git check-ignore` with the global excludes off); private keys, service-account JSON, OAuth secrets, a UUID assigned to a `*debug*token*` name or any UUID in a committed `.env` file, GitHub/AWS/Slack/Stripe/Anthropic tokens (S3); symlinks out of the tree (L1). Real photos and true-coordinate review stay manual (RUNBOOK §7).
  - Finding: `web/src/ui/vaultUi.test.ts` (T-055) uses a synthetic GPS pin that lies on land in southern England. It is allowlisted with that note; its owner should move it to the open-ocean test area used by the other tests.
  - Edited: ARCH §3, §3.3, §20.1; RUNBOOK §2.2, §7; TASKS T-090.
- D-107 (Claude, Nov 21; T-090, F-131, F-132, F-133) **Boundary checker: R19 is an allowlist parser, escapes are decoded, new R24; check-prompts proves itself.**
  - R19: every `import.meta.glob` (whitespace or a line break around the dots, `globEager`, anything) goes through a parser that accepts only what Vite accepts: literal patterns and one literal options object. Whatever it cannot consume fails. Patterns start with `./` or `../` and resolve wholly inside `web/src` (no `..` after a wildcard, no climbing above the root), or are `@prompts/`, `@strings/` or `@vectors/` with no `..` segment (also inside braces); `node_modules` is checked before the alias exemption; `@root` and bare or root-absolute patterns fail; no backslash anywhere in the call; option keys only `eager`, `import`, `query`, `as` (Vite 8 also has `base`, which moves the pattern root, and `exhaustive`). Outside `web/src/dev`, a pattern may not reach `dev/` or `vault/` directly, by case (macOS) or through a wildcard or brace directory directly under `web/src` (the old check missed `./*/x.ts` from `App.tsx`).
  - Escapes: the line rules (R1–R10, R17, R21, R23) and R22 also run on a copy with every `\x`/`\u` escape decoded (same line numbers); R24 flags any `\u`/`\x` escape outside string, template and regex literals (tests exempt).
  - `check-prompts.mjs` gained `--root` and a planted self-test (7 violations plus a refused `--write`), as T-090's Verify asks; the default run is unchanged.
  - Open: the SR-15 log-scrub test (a web/src Vitest file) is not built.
  - Edited: ARCH §4.2 (R19, R24, 149 planted), §20.1; TASKS T-090.

- D-117 (Claude, Nov 21; T-091/T-092/T-094 review, F-153..F-158) **Review follow-ups: the service worker never answers real files with the app shell; the simulation reaches the gate and looks like real (c); focus is never left on <body>; the cap clears at midnight; About shows the commit.** Amends D-103..D-105.
  - **Service worker:** `navigateFallbackDenylist` is `[/^\/__\//, /\.md$/, /^\/vendor\//, /^\/models\//]` (`vite.config.ts` `NAVIGATE_FALLBACK_DENYLIST`). Before, once the worker controlled the page, About's licence links (`/vendor/third-party-notices.md`, `/third-party-licenses.md`) opened the app (F-153). `scripts/check-dist.mjs` fails the build when the built `sw.js` denylist lacks `/\.md$/` or `/^\/__\//`.
  - **`prefs.nanoEnabled()`** is `useNano && !simulateNoNano`, so a gate path that checks it alone also honours the simulation (downgrade only). The gate checks `simulateNoNano()` first to pick the note `simulated` over `Nano off`.
  - **"Simulate: no Nano"** shows state (c) as a browser without the Prompt API does (`ui/simulate.ts`: `copy.cap.nanoNone`, the Chrome how-to, Rules-only chip, no Download), which is what AC-072's simulation check expects. "Use Gemini Nano" off keeps its own (c) line ("turned off in Settings"), as in `capabilityOf`.
  - **Browser support:** `detectBrowserSupport()` never throws, and requires `typeof indexedDB.deleteDatabase === 'function'`: a throwing `indexedDB` getter, `indexedDB === null` (Firefox with IndexedDB disabled) or none at all mean the unsupported page, never a crash.
  - **Focus:** straight after Welcome the shell focuses main (unless SCR-02 opened and holds focus); when a sheet closes and focus fell back to `<body>` (its opener is gone, e.g. SCR-02 opened on mount), main takes it; dismissing a banner moves focus to main. A Toggle's accessible name is its label only (`aria-labelledby`), the hint stays its description.
  - **Daily cap at midnight:** `core/localPrefs` notifies subscribers when the local day turns over: a timer to one second past the next local midnight, plus a re-check on `visibilitychange` (a timer can fire late after sleep). So the cap banner and chip clear at midnight without a write.
  - **Stale events:** AppShell calls `systemStatus.clearEvents()` whenever a cloud-off reason appears, so a per-call event (429, network, 400) never reappears when the cloud returns.
  - **About:** the commit comes from a Vite `define` (`VITE_GIT_SHA` from the environment, else `git rev-parse --short HEAD`, else `unknown` → "commit not recorded"). `ui.about.leaves.S4` says S4 may reach the cloud when Nano is off too, and `ui.about.gemini` says only the attacker is limited to the approved redacted copy (public explanations and Judge samples also use Gemini when on-device AI is unavailable or off).
  - Edited: ARCH §8.2 (prefs note), §16.1; SPEC SCR-20, SCR-22; TASKS T-092, T-094.

- D-118 (Claude, Nov 21; T-101/T-102 review, F-159..F-162) **Review follow-ups: real-time activation makes values readable, sign-in is bounded at 5 s, grounding fails safe, boot steps 3 and 4 run together.** Amends D-108, D-109 and D-110.
  - **Remote Config (F-159):** a successful fetch or real-time activation now makes values readable by itself. Before, after a failed `ensureInitialized` (broken IndexedDB) and an offline first fetch, a later real-time `kill_switch: true` was activated but `cfg()` stayed false all session. The `initialized` flag is gone: `refresh()` is called only where values are readable, which the hung-IndexedDB test pins (its old guard was unreachable, so deleting it could never be caught).
  - **`ensureAuth()` (F-160, amends D-110):** each attempt races `AUTH_TIMEOUT_MS` = 5 s (SPEC §7.1 step 4 already says "up to 5 s"); on timeout it resolves `null` and clears the in-flight attempt, so the next call retries. Auth's own start-up awaits IndexedDB with no timeout, so a hung IndexedDB used to leave every later cloud call waiting on one promise forever. The gate needs no second timeout. ARCH §8.2, SPEC §7.1 and AC-291, TASKS RN-02/T-062/T-101, API-NOTES §1.14/§2.3 and RUNBOOK §8 now say `ensureAuth()` (null → `CLOUD_AUTH`, `copy.err.auth`, no request) instead of `authReady`.
  - **`grounding_enabled` (F-161, amends D-108):** a refused value reads as `false`, like `data_tier` → `free`; three keys now fail safe (`kill_switch` → true). SPEC AC-293 states the three exceptions.
  - **Boot (F-162, amends D-109):** steps 3 (`loadConfig`, ≤ 2 s) and 4 (`vaultScan.init`, ≤ 3 s) start together and are both awaited, so a hung IndexedDB costs 3 s of blank page instead of 5 s. The threshold subscription is set up first, so the cached `fuzzy_threshold` reaches the scanner before the render. ARCH §15.1 updated.
  - **Nits:** the parser's default values are deep-frozen (parseKey's fallbacks were shared-mutable); `minFetchIntervalMs(dev)` makes the production interval (1 h) testable; `scripts/check-dist.mjs` fails on any assignment to `FIREBASE_APPCHECK_DEBUG_TOKEN` in the build (the SDK only reads it).
  - Edited: ARCH §8.2, §13.2, §15.1, §15.2; SPEC §7.1, AC-291, AC-293; TASKS RN-02, T-062, T-101; API-NOTES §1.14, §2.3; RUNBOOK §8; `shared/testvectors/rc.json`; `scripts/check-dist.mjs`.

- D-115 (Claude, Nov 21; T-076, F-149, F-150, F-151) **Verdict engine: the readings SPEC §10 leaves open, pinned in `shared/testvectors/verdict.json`.**
  - **API:** `core/verdict.ts` `buildVerdict({adv, matches, vault, caught?, echoedVaultIds?, prescreenFlags?, bands?, refused?, phase?})` → `Verdict` (types.ts). `adv` is the validated pass B (`ParsedAdvB` or `AdversaryResult`) or null; `matches` is `rulesReferee(...)` or `mergeMatches(...).matches`; `caught` is `{vaultId, route}[]`; `prescreenFlags` is `{types, route}`. Copy helpers: `lineText`, `headlineCopyId`, `bestGuessCopy`, `notLinkedCopy`, `scrubNumbers`.
  - **PARTIAL** when `refused`, when there is no pass B, or when its status is not `ok` / `no_location_signal` (blocked, truncated, unreadable would otherwise read LOW: F-150). Its lines: echo lines (the response scan is an on-device finding, and §10.2 scans `decline_reason`, which only a decline has: F-149), one `found_on_device` line (`ui.verdict.foundOnDevice`, new: SPEC gives the text but no ID; the distinct clue types as their enum words, underscores as spaces) and caught lines. No bands, matches, Not linked or best guess. `no_location_signal` uses no hypotheses and no claims.
  - **Lines:** per vault item in vault order, `pin_match` when a match meets a shown band (street..city; a match on a pin in band country/none is a plain `match` line), else `match`, else `pin`; then echo, then caught (caught never hides a match or band). Stable sort HIGH, MEDIUM, INFO, CAUGHT. Ids `<kind>:<vaultId>`. Items with no line are Not linked (its KINDS: display names in vault order, a repeated name once).
  - **Ties:** per item the strongest match, then the higher attacker confidence, then the earlier claim (inferences, then hypotheses), so the matches order never matters. A repeated (claim, item) pair keeps the stronger, the first on a tie. Matches with an unknown claim, unknown item or invalid strength are dropped (AC-161).
  - **Confidence (AC-164):** `pin` carries the band hypothesis's confidence; `match` the strength plus the claim's confidence; `pin_match` both, with the new optional `VerdictLine.bandConfidence`. Echo, caught and found-on-device lines state facts found by code, not attacker guesses, so they carry no confidence; T-077 labels them as found on this device (AC-164 amended to say so: D-127). New optional `VerdictLine.reason` carries the referee reason for "Why?".
  - **Empty vault** = no items at all: no lines, `noVault`. (The level rule here, first hypothesis, was superseded by D-127: the finest of the up-to-3 hypotheses, for empty and pinless vaults.)
  - **No coordinates in the view model (F-151):** `pinBands[].effectiveKm` is always null, and free text that enters it is scrubbed: attacker text (best-guess label, referee reasons) loses every number with its unit or degree marks (`scrubAttackerText`, D-127); the user's own place label in KIND loses decimals and degree expressions (`scrubNumbers`).
  - Edited: ARCH §8 types restatement, §12.3; SPEC §10.5; TASKS T-076; `web/src/core/types.ts` (two optional fields); `shared/strings/en.json` (`ui.verdict.foundOnDevice`).
- D-116 (Claude, Nov 21; T-076) **"Risk reduced" header and the worst remaining line.**
  - `compareVerdicts` follows SPEC §10.6 / ARCH §12.4 exactly (PARTIAL on either side is false). `worstRemainingLineId` = the first most severe line of `after` (HIGH > MEDIUM > INFO; caught lines never count).
  - `comparisonHeadline`: `copy.verdict.reduced` with `{before}`/`{after}` as band words when the worst pin band got coarser, otherwise as the level names (RED, AMBER, LOW); `copy.verdict.still` with `{line}` = the worst remaining line's text, else the best-guess text, else the after level name. Never "safe".
  - Edited: ARCH §12.4.
- D-126 (user approved the deploy; Claude, Nov 21) **Remote Config and Auth deployed; the live config carries the D-70 free-tier override.**
  - `firebase deploy --only remoteconfig,auth` (firebase-tools 15.37.0) worked on this project: anonymous sign-in is on, and RC version 1 matched `remoteconfig.template.json` exactly (27 keys). U-17 VERIFIED.
  - D-70 says that until Blaze (T-003), the live values are `data_tier=free` and `grounding_enabled=false`. The repo template ships the paid-tier product defaults (`paid` / `true`, pinned against ARCH §13.3), so it stays unchanged. Version 2 (09:05 GMT+2) was published from a scratch copy that differs in those two keys only, via `--config <scratch>/firebase.json --project strangers-eyes`.
  - **At T-003 (Blaze plus the paid Gemini tier):** run `firebase deploy --only remoteconfig` from the repo, so the live config is the template again. Until then, a deploy of the repo template must re-apply the override (RUNBOOK §4.4).

- D-124 (Claude, Nov 21; T-077) **The verdict card's display rules.** `web/src/ui/components/VerdictCard.tsx` renders a `Verdict` through a pure view model (`verdict/model.ts`, unit-tested over every `verdict.json` case).
  - **Tones and icons (AC-062):** HIGH red (octagon "!"), MEDIUM amber (triangle "!"), INFO grey (circle "i"), CAUGHT teal (lock), echo red (eye), found-on-device grey (chip). Level RED/AMBER/LOW/PARTIAL shows its level word plus the headline; LOW and PARTIAL are both grey but differ in icon and text. GREEN is only the "Risk reduced" compare header.
  - **Confidence (AC-164):** match → `{strength} · attacker confidence {c}`; pin → `attacker confidence {c}`; pin_match → the match form, plus `· distance: attacker confidence {bandConfidence}` only when the band's confidence differs. Echo and caught lines are labelled "Found on this device"; a found_on_device line shows no extra label (its text already starts with it). Caught lines end with "(never sent)" (SCR-09 layout).
  - **New `ui.*` keys:** taken from the SCR-09 layout text (`Why?`, `Explain`, `Add places`, `Referee:`, `Distances: code`, `(never sent)`, `attacker confidence {c}`, the level words, `{n} s`). Two are **composed from SPEC fragments, not verbatim**: `ui.verdict.pinMatchConf` and `ui.verdict.clues` ("Clues: {ids}"), plus `ui.verdict.onDevice` (from `ui.verdict.foundOnDevice`).
  - **Muted vault labels:** shown after the KIND when Settings `showVaultLabels` is on (default on; the card reads `localPrefs`, a prop can override). Not shown for place pins (the KIND is already the label), for a label equal to the KIND ("Home"), or for an empty label. Labels go through `scrubNumbers`.
  - **Structure:** a `<section>` labelled by the headline heading (h3 by default, because Check has h1 and h2); the lines are a `<ul>`; "Why?" is a single-open disclosure (`aria-expanded`/`aria-controls`/`aria-describedby`) showing the reason, the clue IDs, the deciding route badge and an optional Explain button (SCR-16). `onFocusClues(ids|null)` lets the Check screen highlight clues on the image. A polite live region announces the compare header and the headline about 100 ms after the card mounts. Referee row: route badge and seconds when given; "Distances: code" always. An `actions` slot sits above `copy.verdict.neverLearns`, which is always visible.
  - **DEV gallery:** `#/dev/verdicts` (`web/src/dev/verdicts/VerdictGallery.tsx`, lazy behind `import.meta.env.DEV` in App.tsx) shows ten vector cases.
- D-125 (Claude, Nov 21; T-077) **Integration with the verdict.ts review round, and the labels toggle.**
  - The compare header shows only for `copy.verdict.reduced` / `copy.verdict.still`. It is dropped when the after-verdict is PARTIAL, or when `comparisonHeadline` returns null or a level headline (partial, or LOW with no risk line left), because that would repeat the card's own headline.
  - `noPins` gets the same `copy.verdict.noVault` + "Add places" prompt as `noVault`.
  - Tests compare the card with the engine's output, not with the vector `expect`; `verdict.test.ts` keeps the engine equal to the vectors.
  - The Settings toggle "Show vault labels in results" is P1 (D-33) and Settings belongs to T-092. The pref (`se.settings.v1` `showVaultLabels`) already exists and the card honours it. Adding the toggle in T-092 also needs `welcomeSettings.test.ts` updated, because it indexes toggles by position.

- D-119 (Claude, Nov 21; T-090 review, F-163..F-169) **`check-images.mjs` fix round: the staged blob is scanned too, unknown binaries and hidden images fail closed, chunk allowlists, more coordinate and secret forms.** Amends D-106.
  - **Index (F-163):** one `git ls-files -s --cached --others --exclude-standard` gives every path and its index entry. P1/S1 run on the path before anything is opened (an S1 path is never read in either form). The work-tree file is scanned, and so is the staged blob whenever its oid is not the work file's own blob hash (read with one `git cat-file --batch`); a path staged and then deleted from disk is scanned from the index; a staged symlink is checked for L1.
  - **Binaries and hidden images (F-164, F-166):** a NUL anywhere makes a file binary (UTF-16 with a BOM is decoded as text). I6: a binary that is not a parsed JPEG/PNG/WebP and not `.tflite/.wasm/.woff/.woff2` fails (the repo tracks only .tflite and .png binaries). I7: every binary is searched for Exif/XMP/Photoshop signatures and for embedded JPEG/PNG at any offset (parsed; only metadata counts there); in text, `data:image/…;base64` URIs and base64 runs starting `/9j/`, `iVBORw0KGgo`, `UklGR` are decoded and parsed the same way (tiny or non-image payloads in tests stay clean). B1: any binary under `benchmark/` fails.
  - **Allowlists (F-165):** JPEG keeps only APP0 JFIF/JFXX, APP2 ICC_PROFILE and APP14 Adobe (every other APPn and COM fail); PNG only IHDR/PLTE/IDAT/IEND, tRNS/cHRM/gAMA/iCCP/sBIT/sRGB/cICP/mDCV/cLLI/bKGD/hIST/pHYs/sPLT and APNG chunks; WebP only VP8/VP8L/VP8X/ALPH/ANIM/ANMF/ICCP. `.jp2`, `.psd` and `.xmp` sidecars fail by extension (I4).
  - **C1 (F-167):** a leading zero is allowed in the integer part (zero-padded longitude); decimal commas, DMS with seconds or decimal minutes (coarse `52°31'N` is ~1.8 km and passes) and the XMP `DDD,MM.mmk` form are flagged; trailing zeros are not significant; SVG `d`/`points`/`viewBox`/`transform` values are blanked before the scan. The lock-file exemption names the repo's five real lock files by exact path. No allowlist entry became stale or newly needed. Accepted limits: E7 integers, a decimal split across lines, an identifier-prefixed value (`lat52.52…`), 3-decimal values (~110 m), plus codes and geohashes; compressed containers fail closed through I6 instead of being unpacked.
  - **Secrets (F-168):** S3 adds PGP private keys, `ya29.`, `sk-proj-`, `npm_`, Slack webhooks, JWTs, `.npmrc` auth tokens, a UUID within ~100 characters after a "debug token" name (unless the gap names `simctl`, `-destination` or `udid`: a simulator UDID, as in TASKS' launch line), and any `AIza…` key other than the apiKey / API_KEY value of `web/src/firebase/config.ts` and `ios/StrangersEyes/Resources/GoogleService-Info.plist` (read from the work tree, never printed). S1 adds `.envrc`, `.env-…`/`.env_…`, `secrets.{json,yml,yaml,toml,plist}` and any name matching `/debug[-_.]?token/i`. S2 uses `git check-ignore -v`: the rule must come from a committed `.gitignore` (not `.git/info/exclude`) and must not be a negation.
  - **Allowlist file:** exactly one entry per file; `why` ≥ 20 characters.
  - **Self-test (F-169):** 169 planted cases (was 78), including the four index cases in the temp repo, every branch the review listed, message checks where a rule has several triggers, an assertion that nothing but S1 fires on a secret path, a symlink to the in-tree token that is never followed, git failing outside a work tree and a failing `git check-ignore`. Runtime ~6 s (was 2.5 s). Mutation check (scratch copy): 98 of 98 mutants killed (the staged-blob path, every new rule and allowlist, and the reviewer's 37 old-rule mutants that still apply).
  - Edited: ARCH §3; SPEC AC-351, AC-364; `scripts/check-images.allow.json` (about text); RUNBOOK §7 checklist line.
- D-120 (Claude, Nov 21; T-090 review, F-169, F-170) **Boundary checker: a fully decoded copy closes the line-continuation and regex-desync evasions; run-time-built names are an accepted limit; check-prompts asserts its findings.** Amends D-107.
  - The line rules and R22 now run on the raw line and on a copy where every `\x`/`\u` escape is decoded whatever the literal state (so a `/` after `}` read as a regex can no longer hide `generat\u0065Content`) and every line continuation is joined, with empty lines after the joined line so later line numbers hold. The mode-aware decoder remains only to find escapes in code (R24). Escapes that decode to a quote, a backslash or a line terminator are kept as written in both.
  - **Accepted limits:** names built at run time (`'generate' + 'Content'`, a template `${}` splitting a name, `String.fromCharCode`, keys read from data or another module) are not caught: catching them needs data-flow analysis, and any computed-member ban would flag ordinary code. That is deliberate evasion, not a slip; code review and the gate's ledger cover it (ARCH §4.2). The reviewer's open R19 probes (optional chaining, an `import.meta` alias, destructuring, bracket access to `glob`) were out of this round's scope and stay open for T-090's next pass.
  - R9 also bans `console` in `core/verdict.ts` (vault item IDs and pin bands), every file in `ui/check/` and `ui/components/verdict/`, `tier0/tier0.ts`, and `ui/components/ClueList.tsx`, `PhotoStage.tsx`, `PrescreenPanel.tsx`, `VerdictCard.tsx` (pre-screen vault text, verdict vault labels; orchestrator requests). None of them used `console`.
  - New planted cases (165 in all): LF and CRLF line continuations (R1, R22), the `{} /` desync, an escape decoding to a line break and a continuation before an escaped name (both with the reported line checked), a broad `**` glob, options nested two deep, R9 in each newly covered file or folder. Mutation check: 20 of 22 killed; the 2 survivors (computed-key and spread checks removed in the glob options parser) are equivalent, as the generic "malformed options object" error still fails the same input. check-prompts: each planted case must print its finding (a crash also exits 1), plus two git-HEAD guard cases in a temp repo and a clean released-at-HEAD tree (11 planted); 11 of 11 mutants killed, including "a crash counts as caught" and the three HEAD-guard mutants.
  - Edited: ARCH §4.2 (intro, R9 row).

- D-127 (Claude, Nov 21; T-076 review round, F-181, F-182, F-184) **Attacker text loses every number; a vault without pins falls back to the attacker's precision; AC-164 amended.**
  - `scrubAttackerText` (new export) for the best-guess label and referee reasons: every digit run (any `\p{Nd}`, superscript and subscript digits) with its sign, internal separators (`. , · ‧ ٫ ٬ ， ．`, an exponent `e±n`) and a following unit (m, km, mi, ft, d, not followed by a letter) or degree / minute / second mark becomes "…"; ellipses separated only by spaces, commas or semicolons collapse. "near 22 Acacia Avenue, within 300 m" → "near … Acacia Avenue, within …". SCR-09, AC-146 and invariant 5 forbid a street address or a radius in metres, which the decimal-only `scrubNumbers` let through (F-181). The user's own label in KIND keeps `scrubNumbers`. 24 `fn: "scrub"` vectors.
  - `noPins` (new optional `Verdict` field, always set by `buildVerdict`): no item of a pin kind carries a pin (an empty vault included). Then the level = max(line rule, finest level among the ≤3 ok hypotheses: street/neighbourhood RED, district AMBER, else LOW); the UI shows `copy.verdict.noVault` / "Add places". A text-only vault with a street-level guess read LOW while an empty vault read RED (F-182). The finest hypothesis, not h1, because the fallback now covers more vaults and pinBand is conservative the same way; the best-guess line still shows h1. SPEC §10.5 edited.
  - AC-164 now reads "Every line that reports an attacker guess shows a confidence … on-device findings (echo, caught, found on this device) show no confidence and are labelled 'found on this device'"; SR-07 "Confidence always shown for attacker guesses".
  - Edited: SPEC §10.5, AC-164, SR-07; ARCH §8 types restatement, §12.3; `web/src/core/types.ts` (`Verdict.noPins?`).
- D-128 (Claude, Nov 21; T-076 review round, F-183) **"Risk reduced" is stricter; the compare header never shows a raw level name.**
  - SPEC §10.6 amended: besides the original either/or, riskReduced needs no vault item's worst line severity to rise, the worst pin band not to get finer, and the same vault item ids on both sides (which also means the same noVault). Before: RED (employer exact + HOME city band) → AMBER (HOME district band) read "Risk reduced", as did trading two HIGH matches for a new CHILD'S NAME exact, or emptying the vault.
  - `comparisonHeadline`: after PARTIAL → `copy.verdict.partial` (non-null, so the return type is unchanged); reduced in level terms → the two level headlines' text ("A stranger could find you from this photo → This photo narrows things down"; SPEC gives no shorter level words); not reduced with after LOW and no HIGH or MEDIUM line → `copy.verdict.low`, never "Still exposed"; otherwise still, naming the worst remaining line, else the best guess.
  - Edited: SPEC §10.6; ARCH §12.4.

- D-111 (Claude, Nov 21; T-062) **Egress Gate: one injectable gate, one Ledger entry per call, and what an error records.**
  - `web/src/ai/egressGate.ts` exports `createEgressGate(deps)` (every collaborator injected, so the unit tests run the real gate, tripwire, interlock, device queue, vault index, prompts and floor on fakes) and the app's `gate()` / `gateState()`. It is the only R1 call site.
  - Contract additions to ARCH §8.1: `GateRequest.isDeclined?`, `ParseMeta.inferenceSource`, `GateResult.payloadClass` and `checksMs`. Notices (toast, banner, queue, note) go out on `gateNotices`; `{TEXT}`/`{KIND}`/`{cap}` stay in memory.
  - Outcomes: a block → `BLOCKED` + reason; a deterministic fallback → `RULES_ONLY` (+ `error` after a failure); an S3 failure → the route it tried (`IN_CLOUD`, real `bytesOut`, often 0) + `error`, thrown as `GateError`. A pending entry reads `BLOCKED`, 0 B. The "Blocked" counter therefore counts gate refusals only, not sign-in or network failures.
  - `web/src/core/ledger.ts` did not exist: it now holds the `Ledger` interface and an in-memory implementation (newest 500). T-063 makes it persistent behind the same interface.
  - The gate feeds `ui/systemStatus`: `markTripwire()` on BREACH, `report(…)` after the last retry, `authFailed` from each `ensureAuth()`, `appCheckFailed` set by a 401/403 and cleared by a cloud success.
  - Edited: ARCH §8.2 (As built), §8.6; TASKS T-062.
- D-112 (Claude, Nov 21; T-062, F-128, F-142) **Gate error codes and copy.**
  - `ai/errors.ts` adds four codes to ARCH §17: `VAULT_UNAVAILABLE` (the active index was reloading or unreadable; nothing sent; never a leak or a BREACH; one retry after the index is ready), `TEMPLATE_CANARY` (a device-only prompt's text reached a cloud body; Ledger `blocked: CLASS_MISMATCH` + `error: TEMPLATE_CANARY`), `CHECK_FAILED` (face model, OCR, decode or hash could not run: fail closed, not as `FACE`) and `INTERNAL`. They give the T-058/T-093 "own Ledger reasons" without a new `GateBlockReason`.
  - HTTP 400 shows `copy.err.cloudFailed` (SPEC SCR-22 wins over ARCH §17's `copy.adv.truncated`; F-128 closed). `CLOUD_AUTH` from sign-in shows `copy.err.auth`, from 401/403 `copy.err.appCheck`.
  - Retries: one budget per family (busy, parse/truncated/device-failed, quota, network/server/cloud timeout), at most 3; none once a streamed chunk was shown; never for refusal, decline, auth, 400, BREACH, device unavailable.
  - Edited: ARCH §17 (As built, 400 row); API-NOTES §1.10.
- D-113 (Claude, Nov 21; T-062, F-145, F-146) **Gate policy edges.**
  - S3 with `cloud: false` → `KILL_SWITCH` (TASKS T-062 (a) left the choice). S2/S4 `cloud: false` → device-only with a fresh check, else RULES_ONLY. RC `PREFER_IN_CLOUD` for S2/S4 runs as `ONLY_IN_CLOUD` (no factory supports it; the data is public).
  - `LOCAL_LOCK` during ANY device-only call (S2/S4 downgraded to the device hold the lock too) is a BREACH, as is any device-only answer reporting `in_cloud`. A trip is attributed only when `lastTrip()` is newer than the attempt and its `tripwire:<REASON>` text is in that attempt's error; a cloud fetch refused because another call held the lock is a retryable `CLOUD_NETWORK`.
  - A request whose Judge flag disagrees with `vaultScan.mode()` is refused (non-Judge while the fake vault is active → `CLASS_MISMATCH`; Judge without it → `NOT_SYNTHETIC` / `CLASS_MISMATCH`), re-checked after every wait. Pass A while `groundingEnabled` is false → `CLASS_MISMATCH`.
  - `models.judgeJsonModel` gained an optional `mode` (default PREFER_ON_DEVICE, unchanged for callers), so Nano off (AC-277) really sends S4 to the cloud.
  - Edited: ARCH §8.2 (As built), §8.7 `KILL_SWITCH` row; `web/src/ai/models.ts`.
- D-114 (Claude, Nov 21; T-062, F-143, F-144) **Gate integrity rules.**
  - The image re-check runs on the bytes decoded from `base64` (what the SDK sends); they must equal the `jpeg` Blob ("What the cloud saw") and hash to `sha256`, else S3 `NO_CONSENT` / S4 `NOT_SYNTHETIC`. Consent also needs `issuedAt` not in the future (5 s skew) and the request's session.
  - The user turn must be exactly `render(promptId, …)`'s structure (static text verbatim), the prompt id of the job's family, and S3's system instruction and pass-B schema the registered template's. The prompt scan reads every dynamic segment and any "static" segment that is not template text.
  - After a safety refusal or any S3 decline the session gets no further S3 call (`CLOUD_REFUSED`, no request; invariant 7). After a cloud network error, cloud-capable calls take the offline path for 15 s.
  - `caps.increment()` once pass B reached the cloud (success, decline, or a refusal after bytes left). Judge Mode must call `setSampleAllowlist(manifest.samples)`; until then every S4 call is `NOT_SYNTHETIC`.
  - The D-80 generation check is the gate's `vaultFresh()` hook (before every permit; a stale index is refreshed and the checks re-run). It is not wired: the vault store keeps no generation counter yet (open).
  - Edited: ARCH §8.2 (As built); TASKS T-062.

- D-121 (Claude, Nov 21; T-068, F-171) **The Check stepper is honest, and a new photo resets every later step.**
  - `ui/checkState.ts` holds the whole Check state: the stepper, the import status and the pre-screen. `selectStep` only revisits a step already reached. Import → Pre-screen is the `continue` action ("Continue to pre-screen"), allowed only while Check holds a photo (`ready`). Any new import attempt (busy, error, ready) resets the stepper to Import and drops the pre-screen, so masks drawn on one photo can never be applied to, or sent with, another. This amends T-053's "a step change never touches the import status": that still holds, and the converse is new.
  - `BUILT_STEPS` = Import and Pre-screen. StepperNav shows the other steps as plain text (never buttons), in italics, read as "(not available yet)" (`ui.stepper.unavailable`); a step that exists but has not been reached reads "(not reached yet)" (`ui.stepper.upcoming`). Add each step to `BUILT_STEPS` when its task lands (T-069 Send, …).
  - Pre-screen state: `idle → running(run, sha256, lines) → done(run, sha256, lines, failed, editor)`. Every report carries a run number; a report from another run (a photo replaced mid-run) is ignored. `retry` drops a failed pre-screen only. Revisiting the step never re-runs Tier-0.
  - **New `ui.*` keys.** Verbatim from SPEC SCR-06: the progress-line texts ("Removing metadata", "Finding faces (n)", "Reading text (n words)", "Checking against your vault (n matches)") and the action names ("Check with the cloud attacker", "Queue cloud check", "Just clean and export"). Builder-authored (no SPEC text exists): `ui.check.continue`, `ui.stepper.upcoming` / `unavailable`, `ui.prescreen.{busy,lineFailed,ms,progress,nanoPending,failed,retry,nextSoon}`, `ui.editor.*` (side-list and stage labels, the keyboard hint) and the display names `ui.clue.<type>` (18 CLUE_TYPES, plus `face` and `phone`). None says "safe".
- D-122 (Claude, Nov 21; T-068, F-173, F-174) **The mask editor and the masked frame candidate.**
  - **Detected items** (faces, vault text, regex flags; later T-066's Nano clues) keep their unpadded box (D-88) and are toggled, never moved. Un-ticking a face or a vault hit is allowed (the gate demo) and sets `userUnmasked`; an unmasked face or vault hit always shows `copy.editor.warnFace` / `warnVault`. A masked grid-cell box asks for a confirmation before removal (`copy.editor.confirmRemoveCell`). `copy.prescreen.vaultHit` shows only while the hit is masked (it says "Masked on this device").
  - **User masks** ("Add mask": a drag on the photo or the button) can be moved, resized (bottom-right handle) and deleted, by pointer or keyboard: Tab to a mask (it is selected on focus), arrows move it by 1% of the longer side, Shift+arrows resize it, Alt makes the step 1 px, Delete/Backspace removes it and focus returns to "Add mask". At least 8 px a side (`MIN_MASK_PX`), whole pixels, inside the image; a click without a drag adds nothing.
  - **User masks are painted exactly as drawn, without `mask_pad_ratio` padding.** The padding is a margin for imprecise detector boxes; the user drew the area they meant, and the stage shows the exact pixels. AC-113's 15% padding applies to every detected box.
  - **The candidate.** `checkState.maskedCandidate(state, heldSha256)` returns a `MaskedFrameCandidate` (`ui/check/editor.ts`) or null: `masterSha256`, `width`/`height`, `masks` (exactly what `frames.renderFrame` paints, in master px: detected boxes padded, then user masks as drawn), `clues` (detected, then user masks as `source: 'manual'`, `readers: 'user'`, `maskReason: 'user'`), `unmaskedPrivate {faces, vault}` (for `copy.consent.unmasked`), `blockedBy` (failed Tier-0 steps) and `route` (`RULES_ONLY`). It is null with no finished pre-screen, or when the pre-screen belongs to another photo. **T-069 must build the cloud JPEG from `candidate.masks`** (do not re-pad `candidate.clues`: that would pad the user masks), and must refuse to send or export while `blockedBy` is non-empty.
  - **The stage shows the cloud frame's own pixels:** `renderFrame(master, deriveFrame('cloud', W, H), masks)`, i.e. the outgoing image minus the JPEG step. A render that throws shows solid black, never the unmasked photo. While a user mask is dragged, the picture is re-rendered without it and the dragged mask is drawn as a solid overlay.
  - Files: `web/src/ui/check/editor.ts`, `web/src/ui/components/{PhotoStage,ClueList,PrescreenPanel}.tsx`. TASKS named a separate `ManualMaskTool.tsx`; add-by-drag lives in PhotoStage instead (one pointer surface for draw, move and resize).
- D-123 (Claude, Nov 21; T-068, F-172, F-175, F-176) **Tier-0 pre-screen: what runs, what fails closed, and the seam for T-066.**
  - `web/src/tier0/tier0.ts` `runTier0(master, jpeg, deps, onStep)` (ARCH §11.2 named it `runTier0(master, terms, cfg)`; the matcher is injected instead of the terms, so tier0/* still never sees vault/*, R13). Steps: metadata (`assertCleanJpeg` again: the "Removing metadata" line, with its own latency), then faces and OCR concurrently, then the vault match and the regex flags. `ui/check/runPrescreen.ts` binds it to `detectFaces` at RC `face_min_confidence`, `ocrMaster` at RC `ocr_max_px` (both passes), the ACTIVE vault index (`vaultScan.matchWords`, image mode), RC `mask_pad_ratio` / `auto_mask_types` and the pre-mask mode (`settings.premask ?? strict_mode_default`). The readers load by dynamic import.
  - **Fail closed:** a reader that throws, OCR that failed (so the vault step fails too: nothing was checked), or a vault index that is not built within 5 s (`unset` fails at once) marks its step failed. The step shows "{name}: didn't finish", the panel shows `ui.prescreen.failed` with Try again, and the candidate carries `blockedBy`. A step that never reported done is failed, whatever the outcome says. Tier-0 never reports "0 matches" without having looked.
  - **Clue mapping:** every finding has an unpadded box and `masked: true` (pre-tick rows 1–4). A vault span becomes `tier0_ocr_vault` with its vault id(s) and LOCAL `localText`; its type comes from the vault kind (plate, house_number, street_name/area_name → street_sign, descriptor → uniform_or_lanyard, phone → other, otherwise name_text). A regex phone is type `other` with `regexKind: 'phone'` (there is no phone clue type), shown as "Phone number". Regex flags inside a vault span are dropped. Two OCR readings of the same item that D-81's union keeps a little apart become one finding over both boxes (same regex kind and text, or same vault id, with overlapping boxes).
  - **Pre-tick rules** are `core/pretick.ts` `preTickOf` / `applyPreTick` (SPEC SCR-06 table, AC-112), already covering `nano_prescreen` and `nano_vault_text` clues (grid cell → dashed/approximate, Strict → `strict`).
  - **The Nano line until T-066:** RULES-ONLY, with copy by capability state: (a′) `copy.prescreen.textOnly`; (b), (c) and unknown `copy.prescreen.rulesOnly`; (a) `ui.prescreen.nanoPending`, because `copy.prescreen.rulesOnly` would claim the browser has no on-device AI. **T-066 seam:** run the Nano pre-screen inside `runPrescreen` (S1 through the gate, fail closed), add its localised clues to `findings`, and set the line and the candidate's route to ON_DEVICE.
  - Not done here: the Router HUD entries (T-064 has no store yet), the Strict switch (P1), "Explain" (SCR-16), crop (P1), and the actions, which stay disabled until T-069/T-079. The new files hold vault text, so they belong in check-boundaries R9's no-console list (`ui/check/*`, `tier0/tier0.ts`, `ui/components/{ClueList,PhotoStage,PrescreenPanel}.tsx`); that script is owned by another agent this session, so the orchestrator adds them.
  - Edited: ARCH §3 layout and §11.2; TASKS T-068.

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

### 2026-11-20 (cont.): D-74, T-027, T-051, T-093
- **D-74:** the user chose to wait for the free quota. T-031 resumes after 10:00 GMT+2 Sat Nov 21 with `--adaptive` (the 3rd run only when it can change the classification); the command is in WIP.
- **T-027 iOS skeleton:** XcodeGen project (iOS 27.0, `dev.strangerseyes.app`, firebase-ios-sdk exactly 12.19.3: AILogic, AppCheck, Auth, RemoteConfig; no Firestore). App Check debug factory set before `configure()`. Shared prompts and strings bundled; `Strings.t`. BUILD SUCCEEDED (first build 72 s including the SPM resolve, incremental 12 s); `xcodebuild test` 2/2. The generated .xcodeproj is committed. Simulator shut down afterwards.
  - Gotcha: XcodeGen `optional: true` still adds a dangling file reference, so `remoteconfig.template.json` and `shared/testvectors` are added by T-038 and T-052.
- **T-051 + T-093 via workflow wf_6f443127-476** (builder + skeptic per task):
  - T-051 needed no change.
  - T-093 added the interlock, the device queue and tests. The skeptic reproduced a permit-attribution flaw (an S3 fetch could take an S4 `scanText:false` permit), fixed by D-75 (one pre-fetch cloud permit at a time) with an integration test.
- **Next:** resume T-031 tomorrow after 10:00 GMT+2; today T-052 (bands + first testvectors), T-087, T-058.

### 2026-11-20 (afternoon): D-76 devlog; T-052, T-087, T-058
- **D-76:** `docs/DEVLOG.md` (flaw ledger F-01 to F-35, narrative, lessons), now part of the session-end protocol.
- **T-052, T-087, T-058:** built in parallel by workflow wf_1b4a803c-24f, each with a skeptic. T-058 failed review on one major finding (digits glued to labels), which was fixed together with the minor findings. A fix-verifier (wf_192cfaaa-008) passed all 11 fixes and found one regression (zero-width space), also fixed. D-77 settles the bands, copy and matcher details. check: 438 tests.
- **Human follow-up:** copy review of the 7 `copy.judge.coach.*` texts.
- **Next:** resume T-031 tomorrow after 10:00 GMT+2.

### 2026-11-20 (evening): T-053, T-054, T-037 (OCR half); D-78..D-81
- **T-053 import + EXIF strip and T-054 vault store:**
  - Built by a workflow: one builder per task and two adversarial reviewers each, then fix rounds 2–4, each with its own verifier (wf_1ad9d726-1ee, wf_8b0f6516-78d, wf_0697d92c-600, wf_a187abcf-c96).
  - Rounds 5–6 were applied by hand and verified independently (wf_0660c067-fab, wf_6a8e7fe5-09a).
  - DEVLOG F-36 to F-69. The major ones:
    - another tab kept a burned vault in memory;
    - a fix combination could hang every vault operation while holding the cross-tab lock;
    - a sparse alias list blocked the vault;
    - the EXIF library walked unbounded structure (it now gets only the EXIF TIFF).
  - My own mistakes: fix prompts truncated the findings at 14,000 characters, dropping 6 (F-55; caught by reconciliation and fixed); one browser re-check read a stale page (F-69); one mutation restore undid a fix (F-73). Each was caught before any conclusion was drawn.
  - Rounds 5–7 were applied by hand. Each was verified by an independent agent, and the import path took three of them (F-63, F-66, F-70): every fix moved the cost to the next parser that was not bounded.
- **Browser (Chrome 156):**
  - selftest ALL PASS (import AC-101, vaultCrypto);
  - all 10 PRIV spike photos import clean, with GPS found on exactly the 6 that carry it;
  - exifr now sees 0.6–1.5 KB, not the ~1 MB file;
  - check: 657 tests, 106 planted boundary violations.
  - Follow-ups, minor, to T-090:
    - R19 as an allowlist (alias tricks, escapes inside glob strings, globs the regex misses);
    - identifier escapes defeating the name-based rules.
- **T-037 steps 1–2:** default Tesseract binarisation reads the demo tag in only 14/30 placements; adaptive Otsu + Sauvola reads 30/30 → D-81 for T-057. Step 3 (faces) needs a test image from the user.
- **Decisions:**
  - D-78: import rules;
  - D-79: vault item rules (5 aliases, code points, AC-088 any kind);
  - D-80: resumable, bounded, cross-tab burn; AC-241 narrowed;
  - D-81: OCR binarisation.
- **Docs edited:** SPEC D-23, SCR-05 and AC-241; ARCH §3, §4.2 (R9, R19, R21, R22), §8.4, §15.1 and §16.4; API-NOTES §5.2, §5.3 and §5.4; TASKS T-037, T-055, T-057, T-062, T-068, T-089 and T-121.
- **Next:** T-031 resumes after 10:00 GMT+2. Meanwhile T-057 (OCR with D-81), T-056, T-060, T-061.

### 2026-11-20 (night): T-038 walking-skeleton deploy (user-approved); D-82
- **Deployed:** `deploy --only hosting` → https://strangers-eyes.web.app (commit 701ed29, then a redeploy without the SPA rewrite).
- **Checks** (details in RUNBOOK §4.6):
  - headers and MIME are correct;
  - the debug token cannot reach a production build;
  - the shell loads (110 KB JS);
  - a hosted import works (3000×2000 → 2048 master) with zero network requests;
  - a dropped link is refused;
  - the layout works at 375 px;
  - `LanguageModel` exists without an origin-trial token (unavailable in the Browser pane, which has no model).
- **Found live:** a missing file returned `200 text/html` → rewrite removed (D-82, DEVLOG F-75).
- **Open within T-038:** Remote Config deploy (T-060), hosted AI call (T-011), Nano in the user's Chrome (T-007), cold Tier-0 load (T-056/T-057).

### 2026-11-21 (after midnight): T-057 OCR and T-056 faces; D-83
- **T-057:**
  - `tier0/ocr.ts` rewritten: `ocrMaster`, two passes per D-81 as per-job options, line union, serialised jobs, warm while Check is open (`useOcrWarm`, a dynamic import, so tesseract.js stays out of the initial bundle), 5 min idle drop, and start/pass timeouts.
  - `tier0/ocrMerge.ts` added.
  - Selftest `ocrMaster` step: LUCAS 42 is found, and its box is in master pixels.
  - Real-photo matrix: 29/30.
- **T-056:** `tier0/faces.ts`: detector at the floor, threshold in code, clamped outward boxes, retry after a failed load.
- **Review:** one independent reviewer found 2 majors (DEVLOG F-76 line-union loss, F-77 createWorker hang) and minors. All are fixed, with mutation-checked tests.
- check: 682 tests; build ok (the OCR chunk is lazy, 18 KB).
- **Open:**
  - T-057 cross-browser selftest (Safari needs remote automation or the user; Firefox is not installed).
  - T-056 recall needs a face or mannequin image (U-31).
  - AC-064 timing in the user's Chrome (T-085).

### 2026-11-21 (night, batch 1): T-055, T-059, T-060, T-061, T-065, T-075 in parallel; D-84..D-102
- **How:** the user asked to stop following the schedule and build as much as possible. Five builder agents ran in parallel on disjoint files. Each task then had an independent adversarial reviewer, and the findings went back to the original builder for a fix round, mutation-checked.
- **Done:**
  - T-060: routing policy as data with a hard floor, and `remoteconfig.template.json` (pinned to ARCH §13.2/13.3); the iOS bundle includes it.
  - T-059: frames, box mapping, fail-closed masks, crop.
  - T-061: capability detection and the panel, mounted in AppShell (R23 keeps the UI cache away from the gate).
  - T-075: the rules referee (D-94, D-101, D-102 narrow SPEC §10.3/§17.5).
  - T-065: model factories (fail closed without an on-device adapter).
  - T-055: vault UI (browser-checked: 0 requests while editing, parser, hold-to-burn, slide-off, screen-reader confirm, AC-270).
- **Reviews:** they found majors in T-055 (2), T-075 (3 + F-98), the OCR earlier (2), and none in T-059/T-060/T-061/T-065. All are fixed.
- **Browser (Chrome 156 pane):** selftest ALL PASS including the new `frames` step; capability panel honest (Rules-only); Vault flow checked.
- check: 1381 tests, 113 planted boundary violations.
- **Open for the user:** Safari/Firefox selftest; a face image for U-31; "Pin this place" with a Sensors override; a screen-reader pass; AC-064 timing in Chrome.


### 2026-11-21 (morning, batch 3): T-062, T-068, T-076, T-077 + fix rounds; RC/Auth deploy; D-111..D-131
- **Built in parallel by agents on disjoint files, each independently reviewed:**
  - T-062 Egress Gate (247 tests). The security review found 4 majors (TOCTOU between check and send, a bypassable JPEG metadata walk, exports that skip the gate, BREACH not halting queued calls) and the policy review 3 (an unhandled stream `response` promise, a Nano failure reported as "queued", the kill switch not re-read on retries). Fix round running (D-129..131, F-185..192); the gate files stay out of the checkpoint commit.
  - T-076 verdict engine, then its review fix round (attacker text loses every digit run and unit; a pinless vault no longer reads LOW; a stricter "Risk reduced"; AC-164/SR-07 amended). D-115/116, D-127/128.
  - T-077 verdict card with a DEV gallery at `#/dev/verdicts` (D-124/125); T-068 pre-screen, Tier-0 half: Import → Continue → faces/OCR/vault/regex on device → solid masks → editor; unbuilt steps are no longer clickable (D-121..123). Both are in review.
  - Fix rounds: T-090 scanner (it scans the staged blob; hidden images, segment and chunk allowlists, more secret and coordinate forms; D-119/120), UI screens (D-117), boot/RC (D-118).
- **Deploy (user-approved):** `deploy --only remoteconfig,auth`; v2 carries the D-70 free-tier override (D-126; U-17 verified).
- **Browser:** focus lands in main after Welcome; "Simulate: no Nano" shows state (c); the SW licence-link check waits for T-106 (no SW registration yet).
- **User feedback:** "can not proceed to check the photo": only Import existed. T-068 now adds Pre-screen; Send → Verdict needs T-069/T-071 after the gate fix round.
- check: 58 files / 2974 tests; 165 planted boundary, 11 prompt, 167 image cases.
