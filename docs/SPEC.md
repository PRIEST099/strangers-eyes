# Strangers' Eyes: Product Spec

> **Version 1.1 (final for build).** Written Thu 2026-11-19 (Day 1).
> **Deadlines:** our internal deadline is **Mon Nov 30 2026, 12:00 GMT+2**. The hard cut is **Nov 30 14:00 PT** (= 22:00 UTC = Dec 1 00:00 GMT+2).
> This file is the **product contract**. It says what the app does, how every screen behaves in every state, what the app says, and how we know a feature is done (acceptance criteria, `AC-xxx`).

**Order of authority.** Every doc uses this same rule:
1. `CLAUDE.md` invariants.
2. The Decisions log in `docs/PROGRESS.md`. On any topic, the newest entry beats any doc text. Fix the doc it contradicts in the same session.
3. **This SPEC**, for product behaviour, acceptance criteria, UI copy, product enums, verdict and matching logic, and benchmark metrics.
4. `docs/ARCHITECTURE.md`, for file paths, types, module layout, Remote Config key names and the template file, prompt text, and route paths.
5. `docs/API-NOTES.md`, for how the SDKs actually behave.
6. `docs/RUNBOOK.md`, for procedures.
7. `docs/TASKS.md`, for tasks, detailed dates, the USER sittings and **the single cut-order list**.
8. `PLAN.md` and `research/*` are history only. PLAN.md still contains instructions that have been superseded: temperature 0, iOS SDK "≥12.13 / latest", pass B reading pass A's notes, Firestore holding Judge Mode data, a Day-1 iOS tool-call spike, and filming on Nov 30. **Do not follow them.**

Once a config file exists in the repo (`firebase.json`, `firestore.rules`, `remoteconfig.template.json`), the repo file is canonical for it.

**Reading this file in a fresh session.** The file is about 120 KB, so do not read it whole.
1. Read §0.
2. Before touching any AI call, read §5–§7.
3. Then jump to your feature with `grep -n "^### SCR-06" docs/SPEC.md` or `grep -n "AC-041" docs/SPEC.md`.

---

## 0. How to use this document

### 0.1 Working rules
1. A feature is **done** when all of its P0 ACs pass, each verified the way its tag says. Record the evidence (command, result, screenshot path) in `docs/PROGRESS.md`.
2. When this file and another doc disagree about something this file owns (behaviour, ACs, copy, product enums, verdict and matching logic, metrics), this file wins. Fix the other doc in the same session and log a decision.
3. When you verify an `[UNVERIFIED]` item, update `docs/API-NOTES.md`, remove the marker here, and log it in PROGRESS.

### 0.2 Conventions
- **IDs:**
  - screens are `SCR-xx`;
  - jobs are `W1..W8` (web, on-device or code), `I1..I6` (iOS) and `C1..C3` (cloud);
  - decisions are `D-xx` (§0.4);
  - copy strings are `copy.*` (§11).
- **AC IDs are this file's three-digit `AC-xxx` only.** ACs are grouped in numbered ranges (§18.1), so new ACs slot in without renumbering.
  - Two-digit `AC-NN` references in older drafts are obsolete. §18.4 maps them to the new IDs.
- **Decision IDs:** `D-01..D-39` are defined in §0.4 and are canonical. ARCHITECTURE `AD-xx` items that duplicate a D are shown next to it, and the D wins.
  - AD items with no D alias keep their AD-ID permanently (ARCHITECTURE §2). Nothing is renumbered.
  - Every new decision takes the next free D-number, from **D-40**, in the PROGRESS Decisions log.
  - TASKS `RN-xx` IDs are retired. The `RN-xx` aliases still shown in §0.4 are only there to trace old notes (TASKS §5 maps them). Don't cite them in new text.
- **Priority:**
  - **P0:** required for the submission.
  - **P1:** should have. If we fall behind, cut in the order given in `docs/TASKS.md` § Cut order.
  - **P2:** stretch; build only if every checkpoint through Nov 28 is green.
- **Verification tags on ACs:**
  - **[unit]**: Vitest (web) or XCTest (iOS).
  - **[e2e]**: a scripted browser run against `vite preview` or the hosted URL, using Playwright or the CDP harness.
  - **[manual]**: checked by eye in the Browser pane, the user's Chrome or the Simulator. Save a screenshot to `docs/evidence/`, which is gitignored when it shows anything personal.
  - **[video]**: must be visible in the demo video.
- **Markers:**
  - **[UNVERIFIED]**: not yet confirmed at runtime. Confirm it before relying on it. The U-IDs live in API-NOTES §10.
  - **[USER]**: a step only the human can do.
  - **[DECISION D-xx]**: see §0.4.
- **Language:**
  - The UI is in English only.
  - Say "Risk reduced", never "safe".
  - Distances are shown as bands, never in metres.
  - Confidence is always shown.
- **Private data folder (PRIV)** is `/Users/mac/StrangersEyes-private/`. It sits **outside the repo** and holds real photos, `truth.csv`, raw benchmark JSON and anything with coordinates. Nothing in PRIV is ever copied into the repo (D-29).

### 0.3 Schedule anchor, Day-1 gates and cut order

TASKS holds the per-task dates. This table sets what must be true at the end of each day.

| Day | Date | Product scope that must be true at the end of the day |
|---|---|---|
| 0 | Thu Nov 19 (evening) | Docs final. Day-1 research artifacts rescued into `research/day1-artifacts/` (done, TASKS T-020). Repo and `docs/PROGRESS.md` exist. |
| 1 | Fri Nov 20 | Gates **G1, G1b and G2** recorded (below) and the Day-1 decision made (TASKS T-034). Web scaffold builds. Firebase project exists. App Check debug token registered. |
| 2 | Sat Nov 21 | **Walking-skeleton Hosting deploy** live, to shake out hosted unknowns early (AC-366). The encrypted vault store and the Tier-0 libraries (EXIF strip, faces, OCR) run in the app. Prop OCR check done. |
| 3 | Sun Nov 22 | **G3** recorded. **Vertical slice:** import → Tier-0 → consent → pass B → rules referee → bands → verdict, end to end on localhost. Tier-0 checked in Safari and Firefox (AC-066). |
| 4 | Mon Nov 23 | Egress Gate unit tests green. Nano jobs, grounded pass A, Ledger and HUD complete; the adversary and referee work on a real photo. **Hero scene pre-tested 10×** as soon as the props exist (also confirms Tesseract reads the prop tag, needed for AC-041). |
| 5 | Tue Nov 24 | Fix, re-attack, leak demo, explainer, offline queue. **Full web loop red → green works, and the egress audit passes, by Nov 24.** |
| 6 | Wed Nov 25 | App Check with reCAPTCHA Enterprise, Anonymous Auth, Remote Config policy, Judge Mode, offline PWA, Leak Atlas (P1). **Hosted URL live, with Judge Mode going red → green.** |
| 7–9 | Thu–Sat Nov 26–28 | iOS MVP (§14, D-32). Benchmark (§15) runs Nov 26–27 and is published Nov 28. A visual polish pass on every screen that appears in the video. **All beats filmed Sat Nov 28:** the web beats in the morning, the iOS beats and the voice-over in the evening (Chrome quit). |
| 10 | Sun Nov 29 | Rough cut (Claude, early) and final edit (user). README, Devpost text, repo made public after the secret scan and the user's yes. **YouTube upload (Public) by 18:00 (hard stop 23:00).** |
| 11 | Mon Nov 30 | Pre-submit checks. Tag `submission-v1`. **Submit by 12:00 GMT+2.** No pushes to the default branch after 14:00 PT. |

The weekends (Nov 21–22 and Nov 28–29) are the natural slots for the user to shoot props and film.

**Day-1 gates.** Record the results in PROGRESS.

- **G1: adversary (pivot gate).**
  - **Photos:** 10 builder-owned, people-free photos of public places, kept in PRIV.
    - 7–8 street corners, transit stops and shop fronts.
    - **2–3 doorstep-style entrances of public buildings with a printed fictional name card in frame.** The card is masked before sending, as the product would do it.
  - **Method:** run pass B (`advB.v1`) **3×** per photo through the gate. The 3rd run may be skipped when runs 1–2 already decide both classifications (D-74); the counts below are unchanged by that.
    - A photo is **refused** if at least 2 of its 3 runs are `declined` or blocked.
    - A photo is **located** if, in at least 2 of its 3 runs, the closest hypothesis **centre** (distance `d`, §15.3) is within 5 km of the truth.
  - **PASS:** at most 2 of 10 photos refused **and** at least 4 of 10 located. Report the doorstep photos' refusal rate separately.
  - A/B: run `gemini-4-hydrogen` once per photo, then choose `adversary_model` by located count, then by latency.
  - G1 uses pass B only and does not need Blaze. On the free tier, though, Google may use the spike photos for training and human review. Run it on the free tier only after the **[USER]** accepts that in chat (log it in PROGRESS). Otherwise wait for Blaze. Grounded pass A is spiked once Blaze is on.
- **G1b: is the fix effective? (informational, same day).**
  - For each located photo, apply the rules-only fix (§10.4). This masks every removable pass-B clue, with padding. Then rerun pass B once.
  - Record whether the closest band to a pin at the true location moved outward (using `e`), plus the distribution of `radius_km` and `level`.
  - Target: the fix moves at least one band on ≥50% of located photos, **and** median `radius_km` ≤ 1 on located photos.
  - **If it fails:** log a D-entry before Nov 22. Choose text-rich demo scenes, and/or amend D-10 (for example, use `d` instead of `max(d, r)` when `level ∈ {street, neighbourhood}`).
- **G2: Nano in Chrome 157 on this 8 GB M1.**
  - `LanguageModel.availability()` with text plus image `expectedInputs` must return `'available'`.
  - Through the SDK, an `ONLY_ON_DEVICE` call with image input and `responseConstraint` must return valid JSON with `inferenceSource === 'on_device'`.
  - **PASS:** ≥4/5 image runs and ≥4/5 text runs are valid, the median latency is ≤15 s, and nothing crashes or runs out of memory.
  - **Partial:** text passes but image fails. This is state (a′): S1 is RULES-ONLY and S0 uses Nano.
  - **FAIL:** the web honestly shows Tier-0 plus cloud (state c), and iOS carries the on-device footage.
- **G3: iOS (due Sun Nov 22, TASKS T-033; not part of the pivot decision).** In the iOS 27.0 Simulator with firebase-ios-sdk 12.19.3:
  - an on-device-only session returns `@Generable` output;
  - a `HybridModel` session returns text and `rawResponse.modelVersion` is readable;
  - a cloud call succeeds with the App Check debug token.
  - Tool calling is already known to fail in the Simulator, so do not plan on it.
  - **FAIL:** use Path B (13.2.0, with the fallback written in app code), disclosed in the README.

**If G1 is borderline or fails and the user has not answered yet:** stop and ask the user about pivoting to Blindfill. Never pivot unilaterally. While waiting, work only on **pivot-neutral** parts, which carry over: Egress Gate, Ledger, Router HUD, Remote Config routing, Firebase wiring, Tier-0, vault crypto, iOS shell.

**Cut order.** `docs/TASKS.md` § Cut order holds the single authoritative cut order: planned cuts, emergency cuts (each needs the user's OK), triggers and the **never-cut** list. It is not copied here, so the two cannot drift. Log every cut as a D-entry in PROGRESS.

### 0.4 Decisions this spec makes

These are deviations from and clarifications of `research/winner-spec.md`. The PROGRESS Decisions log points here and does not copy them. New decisions there start at D-40.

| ID (aliases) | Decision | Why |
|---|---|---|
| D-01 (AD-02, RN-04) | **No `temperature`.** Repeatability comes from: a pinned model ID in RC (`adversary_model`); versioned prompts; `adversary_thinking_level` = MEDIUM; a per-session cache of pass B keyed by `sha256(image)+model+promptVersion`; and k=3 benchmark runs. | Gemini 3.x and later ignore temperature, topP and topK; presence and frequency penalties return 400. |
| D-02 (AD-03, RN-05) | **Pass A (grounded, streamed) is display-only.** Pass B (ungrounded JSON) runs **in parallel** on the same redacted JPEG and **never sees pass A**. Only pass B feeds the referee, the fix planner, the Leak Atlas and the benchmark. | The Search-grounding terms forbid analysing, modifying or reusing Grounded Results. |
| D-03 (AD-05, RN-03) | **Immediately before every S0/S1 call, the gate checks on-device availability freshly, with no cache.** If the model is not `'available'`, the SDK is never called and the deterministic fallback runs. After the call, `inferenceSource` and the network tripwire act as alarms. | Without `window.LanguageModel`, the web SDK silently routes even `ONLY_ON_DEVICE` to the cloud. |
| D-04 (RN-06) | On-device prompts put their instructions **in the user turn**. `createOptions.initialPrompts` is not used until U-44 is verified. One plain JSON Schema object serves as both `responseConstraint` (device) and `responseJsonSchema` (cloud). | The SDK drops `systemInstruction`, `generationConfig` and `tools` on the device. A Firebase `Schema` instance as `responseConstraint` is [UNVERIFIED]. |
| D-05 (AD-06, RN-09) | **iOS pins firebase-ios-sdk to exactly 12.19.3.** The fallback is Path B (13.2.0) with app-code fallback. Deployment target is iOS 27.0. | `HybridModel` was removed in 13.0.0, and only the 27.0 Simulator runtime is installed. |
| D-06 (AD-07, RN-10) | iOS on-device structured output uses `@Generable`. No on-device tool calling and no Foundation Models image input; Vision handles the pixels. | Verified in the Simulator: `@Generable` works; tools and image attachments fail. |
| D-07 (AD-01, RN-01, RN-19) | **Re-planned by D-70 (PROGRESS, Nov 20): free tier while building; the paid tier only for filming and judging.** The cloud backend is the **Gemini Developer API (`GoogleAIBackend`) on Blaze, paid tier**, which is a **[USER]** billing decision. RC `data_tier` drives the consent copy; `data_tier = free` forces grounding off and the UI says so. 18+ notice. | Grounding is unavailable on the free tier. Free-tier content may be used for training. Users in the EEA, UK and CH may only be served by paid services. Users must be 18+. |
| D-08 (RN-08) | **Models:** adversary `gemini-3.8-flash` (A/B against `gemini-4-hydrogen` in G1); thinking MEDIUM (MINIMAL returns 400). The cloud side of S2/S4 is `gemini-3.5-flash-lite` (`explain_cloud_model`). Never `gemini-2.5-*`, `3.6`, `3.7` or `-latest`. | Retirement dates and reroutes. |
| D-09 (AD-11) | The referee returns matches only (`exact`, `likely`, `possible`); `none` is dropped. Claim IDs and vault IDs are runtime `enum`s. | Saves tokens, and the model cannot invent IDs. |
| D-10 (RN-22) | **Exposure distance `e = max(haversine(pin, centre), radius)`.** A pin's band is the closest band across up to 3 hypotheses (conservative). Subject to the G1b contingency (§0.3). | "Within 1 km" should mean the attacker could actually narrow things down to 1 km. |
| D-11 (AD-08, amended by T-022 R-02, D-41) | The **Leak Atlas** records only +1 per distinct clue **type** reported by pass B in the first attack (r1), written once after that pass B returns `ok`. Re-attacks write nothing. There are **no outcome counters** of any kind (band, precision, fix or `declined`). It **never** records bands, vault matches, referee output, fix choices or anything derived from the vault. | A "fix moved the band" bit would tell Google the attacker was right. An outcome counter adds a per-session signal for no product need. The tested rules (ARCHITECTURE §14.3) deny every path except the clue counters. |
| D-12 (AD-09, RN-21) | Judge Mode samples, the fake vault and the cached pass-B fixtures ship as **static files** in `web/public/samples/` and are precached, so they work offline. Firestore holds only the Leak Atlas counters. Grounded pass A is **never** cached. | Simpler, works offline, respects the grounding terms. |
| D-13 (amended) | Enums (clue types, inference kinds, levels, regions, vault kinds) live in shared code (`shared/prompts/enums.v1.json`), **not** in Remote Config. RC may hold only **policy subsets** of them (`auto_mask_types`), validated against the enums, with unknown values dropped. There is no `clue_types` key. | They must match the JSON schemas and the Firestore rules whitelist. |
| D-14 (AD-04) | Remote Config `routing_policy` can tighten a class but **can never loosen S0 or S1**. A hard floor in code rejects any weaker mode. | Defends against misconfiguration. |
| D-15 | An S2 payload that contains a vault string is **reclassified to S0** (device model or built-in template). It is never sent, and it is not shown as a block. | Stops the explainer from becoming a side channel. |
| D-16 (AD-10, amended) | Two pre-mask modes: **Standard** (the default, P0) and **Strict** (P1). The exact pre-tick rules are in SCR-06. | Winner-spec named "strict mode" without defining a default. |
| D-17 (AD-16) | The offline queue **never sends automatically**. Consent is given at send time, once online. | Keeps "consent for every photo, with the exact outgoing image shown" literal. |
| D-18 | After a decline or a safety block, there is **no retry and no re-attack** for that photo. | The terms forbid trying to bypass safety features. |
| D-19 (RN-13) | The gate's metadata check means: no APP1 or APP13 segment, and `exifr.gps()` returns undefined. APP0 (JFIF) and APP2 (ICC) are allowed. | Chrome's canvas JPEG always contains APP0 and APP2. |
| D-20 | Every image is re-encoded as JPEG. All boxes (faces, OCR, Gemini) are computed on, or mapped to, **one oriented working image ("master", longest side ≤2048 px)**. Derived frames: Nano gets a 768 px copy, the cloud a 1536 px copy, OCR a 1600 px downscale. All keep the master's aspect ratio and are never letterboxed. | Keeps orientation and boxes consistent; Nano accepts only JPEG or PNG. |
| D-21 | The web on-device model is Chrome's **v3Nano**, already installed on this Mac. The `#gemma4-for-built-in-ai` ("Nano 4") flag is an optional experiment [UNVERIFIED]. Do it before Nov 26 or not at all, **never in the 48 h before filming**, and revert if it fails. | A Firebase answer relayed through the forum says v3Nano is acceptable through the SDK. |
| D-22 (RN-18) | The benchmark scores **pass B only**, on **public-place photos only**. Its synthetic "home" pin is the capture point. | Grounding terms; no real homes. |
| D-23 (amended by D-79) | The vault holds **at most 20 items**, each label and each alias is **at most 40 characters** (Unicode code points of the string as given, no normalisation: web `[...s].length`, iOS `unicodeScalars.count`), and an item has **at most 5 aliases**, on both platforms. | iOS on-device prompts must stay under 4,096 tokens. |
| D-24 | The re-attack image, masks included, is visible to the cloud. The cloud can see **which regions** were hidden, never **why**. Disclosed in About and in the README. | Honesty. |
| D-25 | Deterministic fallbacks are labelled **RULES-ONLY** everywhere and are never called "on-device AI". The always-on Tier-0 steps are not fallbacks: they are labelled **BUILT-IN** (D-179). | Honest badges. |
| D-26 | **Demo location disclosure [USER].** Before Judge Mode samples are recorded (T-105) and before the rehearsal, the user accepts in chat that the city or neighbourhood of the shoot becomes public, through the committed samples, the cached fixtures and the video. Shoots happen a few km or more from home, work and any school. Sample pins are rounded to 3 decimals (about 100 m). Coordinate scans allowlist only `web/public/samples/*.json`. | Judge Mode needs pins near the real scene to produce a red band. The org rule says PII is included only at the Primary Owner's request. |
| D-27 | **Hash routes** (`#/…`, §8.1). The deep link `?judge=1` redirects to `#/judge`. | Simplest with the service worker and the SPA rewrite. |
| D-28 | Pass A notes live **in memory only**, for the current session. They are never persisted, including in recent checks. | Grounding terms; simplest. Replaces the earlier "encrypted local history" wording. |
| D-29 | Private data lives in **PRIV**, outside the repo (§0.2). `benchmark/private/` stays in `.gitignore` only as a backstop. Commits use explicit pathspecs, never `git add -A`. | A `.gitignore` typo must never be able to publish real photos or true coordinates. |
| D-30 | **Thresholds aligned.** Tier-0 auto-masks faces at the gate's threshold (`minDetectionConfidence 0.3`). The consent dry run executes the exact gate checks on the exact outgoing bytes. New detections are auto-masked and the image re-encoded, up to 2 rounds, before Send is enabled. | Otherwise a face scored 0.3–0.5, or text read only at 1536 px, would block every send with no fix offered. |
| D-31 (amended by T-022 R-32, D-50) | **Burn vault deletes the key first, then all local data:** vault (`se-vault-data`), sessions and queue (`se-sessions`) and the ledger (`se-ledger`). There is no partial option. "Clear history" (sessions and ledger only) is a separate action. | Vault, sessions and queue are sealed with the vault key, so deleting the key first leaves nothing decryptable. The ledger is unsealed in its own database because it holds only IDs, kinds, hashes and numbers (AC-045), so Burn vault deletes it explicitly. |
| D-32 | **iOS MVP scope** (plan of record): Keychain vault; Vision Tier-0; FM pre-screen (I3); FM referee (I4) plus the rules fix; consent; cloud pass B; verdict; minimal gate, Ledger and HUD; I5 `HybridModel` explainer (P1, cut only after the Atlas). iOS pass A, re-attack, export/save/share, the FM fix planner and sample scenes are P1/P2 (§14.2). | 13 iOS tasks in 3 days at 18–30 s per FM call. |
| D-33 | **Web scope demotions to P1:** the persistent encrypted offline queue (the P0 queue is in memory); the share card; Strict mode; the earlier-sends selector; the toast's "Show me"; Settings toggles other than Nano on/off, Burn vault and Clear history; the developer simulation; the downloadable receipt. The P0 network protection is a simple tripwire (local lock plus permit). | 135 P0 ACs did not fit about 6 web build days. |
| D-34 | **Benchmark metrics:** centre distance `d` is primary (G1, M1, M2, M8); `e` is reported alongside. Recall is scored by clue type plus the same or an adjacent 3×3 cell. The "after" condition uses the rules-only fix. Pass B runs unattended in headless Chrome. | One definition across docs; no box labelling; the result does not depend on Nano. |
| D-35 | **Crop rule:** the minimal crop from one side that removes the targeted boxes, capped at 40% of that dimension. The rules plan suggests a crop only when every clue cited by a target is non-removable. | Two conflicting crop rules existed. |
| D-36 | **Vault kinds** are those in §17.2, which adds `self_name`. Pin labels are optional. **Generic labels** ("Home", "Work", "School", "Place", or an empty label) are display-only: never scanned and never sent to the referee. | Three conflicting kind lists existed, and the label "Home" would block every prompt containing "home". |
| D-37 | **Judge Mode never unseals the real vault.** S4 calls are guarded by the sample allowlist. S3 calls in Judge Mode are checked against the **fake** vault. | Real-vault terms (for example, filming props stored in the real vault) would otherwise block the judges' path. |
| D-38 | **One vault-matching algorithm** (SCR-06, "Vault matcher") serves Tier-0, the gate's re-check, prompt scans, echo scans and both platforms. It reads its threshold from RC `fuzzy_threshold` (0.8). Test vectors live in `shared/testvectors/`. | Drifting thresholds broke the P0 ACs. |
| D-39 | **Demo lanyard prop:** a fictional logo plus the generic printed words "HOSPITAL STAFF", never vault text. The expected verdict line is "Linked to your WORKPLACE" (`likely`), **not** "by name". | Vault text on the prop would be masked before the cloud saw it, and a logo alone cannot be identified by name. |

---

## 1. Vision

- **Name:** Strangers' Eyes
- **Tagline:** "See your photo the way a stalker's AI would, before you post it."
- **One-liner for judges:** "The cloud plays the attacker. Your device holds the answers. The attacker never learns whether it guessed right."
- **Elevator pitch (≤200 characters):** "The cloud plays the stalker; your device holds the answers. See what AI can infer from your photo and fix it before you post. The attacker never learns it was right."
- **Value proposition:** know what a stranger's AI could work out from your photo about where you live, where you work and what your children are called, and fix it before you post. Your secrets are never handed to any cloud.
- **Why it has to be hybrid:**
  - **Attacking** a photo needs world-scale visual knowledge and live Search, which only the cloud has.
  - **Judging** the attack needs your secrets (home pin, workplace, kids' names), which must never leave the device.
  - The product splits the job at exactly that line.
- **What is new compared with prior art.** Cite arXiv 2503.20226 and Geo-Safe-Filter honestly, and never lead with "AI finds and blurs location clues". The new parts are:
  1. a private on-device **vault** that acts as ground truth;
  2. an on-device **referee** that grades the attacker, which never sees the result;
  3. an enforced **Egress Gate** that proves what left the device and blocks leaks as they happen;
  4. **routing by data-sensitivity class**, stored as data and visible in a HUD.
- **What success looks like, per judging criterion:**
  - **Tech:** visible per-class hybrid routing, honest `inferenceSource` badges, and a real `PREFER_ON_DEVICE` fallback.
  - **Design:** a complete red-to-green loop that works in any browser.
  - **Impact:** named audiences and a measured benchmark.
  - **Idea:** the information-asymmetry framing.

---

## 2. Problem (sourced)

### 2.1 The shift
- Platforms strip GPS metadata, so people feel safe.
- Multimodal models now geolocate photos from the **pixels alone**: street and transit signs, stop codes, paving, school crests, lanyards, window views, reflections.
- No tool knows what *you* in particular need to hide.

### 2.2 Evidence
Personal names of victims, suspects and authors are deliberately left out.

| # | Claim | Source | On screen / in video? |
|---|---|---|---|
| E1 | The April 2025 viral trend: "reverse location search" from photos with OpenAI o3/o4-mini. TechCrunch found GPT-4o often matched o3. | TechCrunch, 2025-04-17 | Yes, cited |
| E2 | GeoSpy geolocates photos in seconds. Public users asked it for help locating specific women; public access was closed after a press inquiry. | 404 Media, 2025-01-20 | Yes, cited carefully |
| E3 | Across 25 VLMs, **up to** about 60% street-level (≤1 km) accuracy on social-media-like images, much lower on Street View-style images | Privacy International, "Nowhere to Hide?" (Feb 2026); same study as arXiv 2508.19967 | Yes, always with "up to" and the caveat |
| E4 | Gemini 2.5 Flash exposed the exact location in 46.8% of cases where context called for withholding it, and 95.6% under malicious prompting | VLM-GeoPrivacy, arXiv 2602.05023 (ICLR 2026) | **Only after re-checking the PDF** [UNVERIFIED: U-49] |
| E5 | City-level accuracy of 53.8%, but 12.5 points lower in less developed regions and 17.0 points lower in sparsely populated ones | arXiv 2502.11163 (EMNLP 2025) | Yes; sets honest expectations |
| E6 | DoxBench: 500 images; 11 models beat non-expert humans at inferring location | arXiv 2504.19373 (ICLR 2026) | Yes |
| E7 | Tokyo 2019: an attacker allegedly worked out which station a performer used from reflections in her eyes in selfies, then used street imagery to find her home. Done by hand, before modern AI. | NBC News/AP, 2019-10-11 | Yes, no names |
| E8 | Iraq 2007: geotagged photos let attackers locate newly arrived helicopters; four AH-64s were destroyed | US Army, 2012-03-08 | Yes, as "the old threat (metadata)" |
| E9 | McAfee: "AI located 87–91% of travel photos" | Vendor claim; the details conflict between sources | **No** |
| E10 | "About 5B social media users" | Not sourced | **No**, until sourced |
| E11 | Prior art: an LLM-powered location-awareness app; 19 participants over 2 weeks | arXiv 2503.20226, ACM CHI 2025, DOI 10.1145/3706598.3714074 | README and About. Implementation details [UNVERIFIED: U-49] |
| E12 | Prior art: Gemini 2.5 Flash finds the clues, Grounding DINO draws boxes, OpenCV blurs; cloud GPU backend | Geo-Safe-Filter (TikTok TechJam 2025) | README and About |

### 2.3 Why existing tools fail
- EXIF strippers ignore the pixels.
- Research prototypes send the **raw** photo to a cloud model, blur instead of solid-filling, and know nothing about *your* home, work or children's names.
- Nothing grades an adversary against the user's private ground truth without handing that ground truth over.

---

## 3. Personas

| ID | Persona (fictional) | Context | What goes in the vault | Key moment | Design implication |
|---|---|---|---|---|---|
| P1 | **Maya, parent** (hero 1) | Posts school-run and doorstep photos | Home pin, child's name, school name, car plate | "LUCAS on the backpack matches your child's name: masked on this device" | Name matching must catch partial or misread OCR; child-related lines lead the verdict |
| P2 | **Tomás, marketplace seller** (hero 2) | Photographs items in rooms with windows | Home pin, street name, house number | "Window view narrows to your neighbourhood" | Window-view and reflection clues matter; offer a crop when masking can't help |
| P3 | **Ade, creator / streamer** (hero 3) | Posts daily: desk set-ups, café stories | Home pin, work pin, employer, usual café | "Linked to your WORKPLACE (lanyard)" | Fast loop; share card for the audience (P1) |
| P4 | **R., domestic-violence survivor** (highest need) | Must not reveal their new area to an abuser | Home pin, new area name, child's name, work | Bands relative to *their* pins, never a map | Never say "safe"; Burn vault always two taps away; neutral support line in About |
| P5 | **Journalist / activist** (highest need) | Posts from sensitive places | Home and office pins, organisation name | "Office: within 5 km" | Strict mode (P1); offline pre-screen; full Ledger receipt |
| PJ | **Hackathon judge** | Chrome or Safari laptop, **probably no Nano**, about 3 minutes | Fake vault (Judge Mode) | Red to green in about 60 s, with honest badges for what ran where | Judge Mode, capability panel, Router HUD; everything works rules-only |

The audience is global: the threat and the fix are the same in every country and language. Distribution channels, for the README only: DV-support organisations, school parent groups, creator communities, and the share card.

---

## 4. Core loop and data boundary

```
 DEVICE (browser / iPhone)                                         CLOUD (Gemini via Firebase AI Logic)
 ─────────────────────────────────────────────────────────────    ──────────────────────────────────────
 1 Vault (W1/I1)            places + names, encrypted, local
 2 Import (SCR-05)          file / drag / paste; original stays local
 3 Tier-0 guard (W2/I2)     EXIF strip, faces→mask, OCR→vault match→mask, regex
 4 Pre-screen (W3/I3, S1)   Nano/FM reads the ORIGINAL for clues (or RULES-ONLY)
 5 Mask editor + consent    user sees the EXACT outgoing JPEG ───[Egress Gate]──▶ 6 Pass A (C1, S3) grounded notes, streamed
                                                                                      6 Pass B (C2, S3) JSON: hypotheses, clues, inferences
 7 Referee (W4/I4, S0)      ◀── pass B JSON only ─────────────────────────────────┘
                            Nano/FM matches claims ↔ vault LABELS (no coordinates); CODE computes distance bands
 8 Verdict (SCR-09)         red / amber lines; "the cloud never learns whether it was right"
 9 Fix plan (W5/I4, S0)     smallest mask set + explanation; masks applied in code
10 Re-attack (C3, S3)       fixed JPEG ───[Egress Gate]────────────────────────────▶ pass A + pass B again
11 Compare → "Risk reduced" (code), export cleaned photo, share card (P1, no location)
```

**Never crosses to the cloud:**
- the vault (labels, pins, kinds);
- the original photo;
- faces;
- EXIF, XMP and IPTC;
- text read on the device from masked areas;
- the referee's matches, the bands, the verdict and the fix rationale;
- anything from S0 or S1 jobs.

**Crosses to the cloud (S3), only after consent:** the redacted, EXIF-free JPEG shown in the consent sheet, plus a fixed, versioned prompt containing no user text.

**Crosses to Firestore** (opt-in, P1): `+1` counters per distinct clue type that pass B reported in the first attack (r1), and nothing else (D-11).

---

## 5. Capability model and global states

### 5.1 Signals (web)

| Signal | How it is computed | Refresh |
|---|---|---|
| `hasLM` | `'LanguageModel' in globalThis`. Only the capability module reads this global. | App start |
| `nanoText` | `LanguageModel.availability(createOptions)` using **the same text `createOptions` object the S0 models use**. Returns `available`, `downloadable`, `downloading` or `unavailable`. | The UI chip may cache it for ≤30 s and re-checks on `visibilitychange`. **The gate re-checks freshly before every S0 call (D-03).** |
| `nanoImage` | Same, with the text-plus-image `createOptions` | Same; the gate re-checks before every S1 call |
| `nanoEnabled` | The setting "Use Gemini Nano when available" (default on), AND the developer simulation (P1) is not set to "no Nano" | On change |
| `online` | `navigator.onLine`, AND the last cloud request did not fail with a network error (an `AIError` `fetch-error` with no HTTP status) | `online`/`offline` events, plus every call |
| `cloudEnabled` | `!kill_switch && dailyRemaining > 0 && appCheckOk && authOk`, where `dailyRemaining` derives from `daily_adversary_cap` | RC activation, plus every call |
| `swReady` | A service worker controls the page and the precache is complete | Service-worker events |

### 5.2 The five global states

| State | Definition | What changes globally |
|---|---|---|
| **(a) Nano available** | `nanoEnabled` and `nanoText === 'available'` | S0, S1, S2 and S4 run ON-DEVICE. **(a′) text only:** if `nanoImage !== 'available'`, the S1 image pre-screen is RULES-ONLY while the S0 text jobs use Nano. |
| **(b) Nano downloading** | `nanoText` or `nanoImage` is `downloadable` or `downloading` | S0 and S1 are RULES-ONLY until it is ready. S2 and S4 go IN_CLOUD (the SDK's PREFER fallback). The header chip shows the percentage. |
| **(c) No Nano** | `!hasLM`, `unavailable`, `nanoEnabled = false`, or simulated | S0 and S1 are RULES-ONLY. S2 and S4 go IN_CLOUD (SDK fallback). Everything still works. |
| **(d) Offline** | `!online` (independent of a–c) | S3 is QUEUED. S2 uses the device model if it is ready, otherwise a built-in template (RULES-ONLY). RC comes from the cache. Firestore writes are buffered. |
| **(e) Adversary refused** | Per photo: pass B returns `audit_status === 'declined'`, or `AIError` `response-error` (SAFETY, SPII, BLOCKLIST, PROHIBITED_CONTENT, …), or `promptFeedback.blockReason` is set | The verdict is built from on-device findings only. No retry. No re-attack for this photo (D-18). |

States (d) and (e) combine with any of (a), (b) or (c). The header shows one capability chip and one connectivity chip.

Where the definitions overlap (D-86): Nano off or no `LanguageModel` is (c); text `available` is (a), or (a′) when image is not `available`, even while the image model downloads (text jobs really run on the device, and SCR-02 offers the image download); text `downloadable`/`downloading` is (b); text `unavailable` is (c) whatever image says.

### 5.3 Job behaviour per state (web)

| Job | (a) Nano | (b) downloading | (c) no Nano | (d) offline | (e) refused |
|---|---|---|---|---|---|
| W2 Tier-0 guard | runs | runs | runs | runs (assets precached) | already ran |
| W3a pre-screen image (S1) | ON-DEVICE | RULES-ONLY | RULES-ONLY | as (a) or (c) | already ran |
| W3b vault text match (S0, P1) | ON-DEVICE + Tier-0 | Tier-0 | Tier-0 | as (a) or (c) | already ran |
| C1/C2 adversary (S3) | IN_CLOUD | IN_CLOUD | IN_CLOUD | QUEUED | stopped, never retried |
| W4 referee (S0) | ON-DEVICE | RULES-ONLY | RULES-ONLY | runs if pass B already exists | skipped (no claims) |
| W5 fix planner (S0) | BUILT-IN (code) | BUILT-IN (code) | BUILT-IN (code) | BUILT-IN (code) | BUILT-IN (code) over pre-screen clues |
| W8 explainer (S2) | ON-DEVICE | IN_CLOUD (fallback) | IN_CLOUD (fallback) | ON-DEVICE if ready, else template | allowed (public text only, SCR-16) |
| S4 Judge Mode AI steps | ON-DEVICE | IN_CLOUD | IN_CLOUD | ON-DEVICE or RULES-ONLY; adversary from the CACHED fixture | n/a |
| Leak Atlas write (P1) | if opted in | if opted in | if opted in | buffered by the Firestore cache | nothing (a declined pass B has no clue types) |
| Export | yes | yes | yes | yes | yes |

### 5.4 Acceptance criteria: capability and global
- **AC-001 (P0) [unit]** The capability module maps every combination of the signals in §5.1 to exactly one of (a), (a′), (b) or (c), plus the (d) flag, as in §5.2. The test is table-driven.
- **AC-002 (P0) [e2e]** In Safari or Firefox, or Chrome with `LanguageModel` deleted from `globalThis`:
  - the full loop completes (import → verdict → fix → re-attack → export);
  - every S0/S1 HUD entry reads RULES-ONLY;
  - **no** S0/S1 network request is made (checked in the network log).
- **AC-003 (P0) [manual]** In Chrome with Nano ready, the pre-screen and referee entries read `ON-DEVICE · Gemini Nano`, the adversary entries read `IN CLOUD`, and the Tier-0 lines and the fix plan read `BUILT-IN` (always code; D-179). No step reads RULES-ONLY.
- **AC-004 (P0) [e2e]** With the network forced offline after the first load, the app loads, the vault opens, Tier-0 and the pre-screen run, and the cloud step shows `copy.queue.queued` (nothing is queued: T-084 deferred, D-163).
- **AC-005 (P0) [unit]** When availability is `downloadable` or `downloading`, S0/S1 jobs call the deterministic fallback and never call `generateContent`.
- **AC-006 (P1) [manual]** Settings › Developer › "Simulate: no Nano / offline" can only **downgrade** capability, and the HUD shows `(simulated)` on the affected entries.
- **AC-007 (P0) [unit]** The gate re-evaluates availability right before every S0/S1 call and never reuses a cached value. Only the UI chip may cache, for up to 30 s.

---

## 6. Routing by payload class

### 6.1 Classes

The classes come from RC `routing_policy` (nested shape; ARCHITECTURE §7) and are enforced by the Egress Gate.

| Class | Covers | Web mode | iOS | If no on-device model | Cloud can see |
|---|---|---|---|---|---|
| **S0** | Anything that touches the vault: vault-text match, referee, fix plan, vault-string scans, an S2 payload reclassified by D-15 | `ONLY_ON_DEVICE`, and only after the D-03 pre-check | On-device-only session (`FirebaseAI.SystemLanguageModel.default`, never inside a `HybridModel`) | Deterministic code (RULES-ONLY). **Never the cloud.** | Nothing |
| **S1** | The original, unredacted photo (pre-screen) | `ONLY_ON_DEVICE`, after the D-03 pre-check | On-device-only session over Vision text | Tier-0 only (BUILT-IN); the Nano line shows RULES-ONLY. **Never the cloud.** | Nothing |
| **S2** | Public content: explanations of clue *types* and of clue text that came from the cloud | `PREFER_ON_DEVICE` | `HybridModel(primary: system, secondary: Gemini)` | The SDK's real automatic fallback to the cloud, shown as IN CLOUD | The clue type and 3×3 region, plus pass-B evidence text. Never text read on the device. |
| **S3** | The adversary: pass A, pass B, re-attack | `ONLY_IN_CLOUD` | Cloud-only (`generativeModel`) | n/a | The consented, redacted JPEG plus a fixed prompt |
| **S4** | Judge Mode's synthetic samples with the fake vault | `PREFER_ON_DEVICE` | `HybridModel` (used only by the P2 iOS sample scenes) | Cloud, so judges see every AI step | Sample images and the fake vault, all synthetic |

### 6.2 Job catalogue

| Job | Platform | Class | Engine | Input | Output | Prompt ID | Priority |
|---|---|---|---|---|---|---|---|
| W1 Vault | web | n/a | code | user entries, geolocation | encrypted items | n/a | P0 |
| W2 Tier-0 guard | web | n/a (local) | canvas, MediaPipe, Tesseract.js, exifr, regex | master image | faces, OCR words, vault hits, regex hits | n/a | P0 |
| W3a Nano pre-screen | web | S1 | Nano (image) | 768 px JPEG of the original, plus instructions | `{clues:[{type,text,region,severity}]}` | `nanoPre.v1` | P0 |
| W3b Nano vault-text match | web | S0 | Nano (text) | OCR lines `w1..`, pre-screen texts `p1..`, vault labels | `{hits:[{text_id,vault_id,strength}]}` | `nanoVaultText.v1` | P1 |
| W4 Referee | web | S0 | Nano (text), or rules | pass-B inferences plus hypothesis labels; vault labels (no coordinates) | `{matches:[{claim_id,vault_id,strength,reason}]}` | `nanoRef.v1` | P0 |
| W5 Fix planner | web | S0 | Nano (text), or rules | clues, matches, bands | `{mask[],crop,explanation,expected_residual}` | `nanoFix.v1` | P0 |
| W6 Mask and export | web | n/a | code | master plus boxes | cleaned JPEG | n/a | P0 |
| W7 Egress Gate, tripwire and Ledger | web | all | code | every AI Logic call and AI-host request | allow / block, plus a LedgerEntry | n/a | P0 |
| W8 Clue explainer | web | S2 | Nano, or cloud via SDK fallback | clue type plus region (pre-screen clues), or pass-B evidence | plain text, two sentences, ≤45 words | `explain.v1` | P0 |
| C1 Adversary pass A | web (P1), iOS (P2) | S3 | `adversary_model` + `googleSearch` | redacted JPEG | streamed Markdown, `groundingMetadata` | `advA.v1` | P1 (last planned cut; TASKS § Cut order) |
| C2 Adversary pass B | web, iOS | S3 | `adversary_model`, no tools | redacted JPEG | `ADV_B_SCHEMA` JSON | `advB.v1` | P0 |
| C3 Re-attack | web (P0), iOS (P2) | S3 | as C1 and C2 | fixed JPEG | as C1 and C2 | same | P0 web |
| I1–I6 | iOS | see §14 | | | | `fmPre.v1`, `nanoVaultText.v1`, `nanoRef.v1`, `nanoFix.v1`, `explain.v1` | see §14 |

The prompt text and schemas live in `shared/prompts/` (layout and text in ARCHITECTURE §3 and §10). Once those files exist, they are the source of truth. Every prompt is versioned, and its version is shown in the Ledger. RC `prompt_versions` only selects among versions bundled in the app; prompt text never comes from RC.

### 6.3 Acceptance criteria: routing
- **AC-020 (P0) [unit]** The policy loader merges the RC `routing_policy` (nested `{version, classes, jobs}` shape, ARCHITECTURE §7) over the bundled default. Any change that makes S0 or S1 reach the cloud, or that moves an S0/S1 job to another class, is rejected: the floored value is kept and the HUD logs `copy.hud.policyRejected` (D-14). A value that is not a complete, well-formed policy (invalid JSON, a missing or extra key, another `version`, an unknown enum value) is rejected as a whole: the bundled policy is used, and the HUD logs the same copy (D-84).
- **AC-021 (P0) [unit]** The gate refuses any S0/S1 SDK call unless the D-03 pre-check returns `'available'` within that same call. The refusal produces a RULES-ONLY fallback, not an error.
- **AC-022 (P0) [unit]** If an S0/S1 response ever reports `inferenceSource === 'in_cloud'`, or the tripwire fires during an S0/S1 call, then:
  - the gate marks the session **compromised** (BREACH);
  - all further S0/S1 model calls are disabled for this page session (RULES-ONLY);
  - cloud calls are disabled until the page is reloaded;
  - `copy.gate.tripwire` is shown;
  - a BLOCKED Ledger entry with reason `TRIPWIRE` is written.
- **AC-023 (P0) [unit]** An S4 call is allowed only when **all** of these hold. Otherwise it is BLOCKED (`NOT_SYNTHETIC`).
  - Judge Mode is on.
  - The sample ID is in the bundled manifest.
  - Every image's sha256 is in that sample's manifest entry.
  - The active vault is the in-memory fake vault (identity check).
- **AC-024 (P0) [unit]** If an S2 payload contains a vault string (according to the vault matcher), it is reclassified to S0 (D-15) and the HUD shows `RECLASSIFIED S2→S0`.
- **AC-025 (P0) [e2e]** The repo-wide boundary check (the script is named in ARCHITECTURE) finds:
  - **no** `generateContent` or `generateContentStream` call outside the gate module;
  - **no** `getGenerativeModel` call outside the model-factory module;
  - **no** direct `LanguageModel.prompt` or `create` call anywhere;
  - `LanguageModel.availability` only in the capability module.
  - The same rule holds on iOS for `respond`, `streamResponse` and `generateContent*`.
- **AC-026 (P0) [manual]** The HUD Policy tab shows the S0–S4 table as currently loaded, and its source (`Remote Config, fetched HH:MM`, `Cached` or `Built-in default`).

---

## 7. Egress Gate (W7): product rules

Every Firebase AI Logic call, on the device or in the cloud, goes through the single gate. There are no exceptions. ARCHITECTURE §8 has the algorithm and types.

### 7.1 Checks, in order (the first failure blocks)
1. **Class.**
   - The job's class comes from the effective policy. In Judge Mode, device jobs use S4.
   - The model spec must fit the class.
   - S0/S1 must be `ONLY_ON_DEVICE`; this is the floor.
   - Failure: `CLASS_FLOOR` or `CLASS_MISMATCH`.
2. **S0/S1 device pre-check (D-03).**
   - Web: `LanguageModel` exists AND `availability(the same createOptions)` is `'available'`, checked freshly.
   - iOS: `FirebaseAI.SystemLanguageModel.default.isAvailable`.
   - If the check fails, run the deterministic fallback, write a Ledger entry with route `RULES_ONLY`, and make no SDK call.
3. **S4 proof (AC-023).** Failure: `NOT_SYNTHETIC`.
4. **Calls that can reach the cloud (S2, S3, S4):**
   - Kill switch:
     - for S2/S4, use the device if it is ready, otherwise the deterministic or template path;
     - for S3, block with `KILL_SWITCH`.
   - Offline: `OFFLINE`. The pipeline queues S3 **before** calling the gate (SCR-18).
   - S3 daily cap: `DAILY_CAP`.
   - S3 consent token missing, expired (more than 10 min old) or from another session: `NO_CONSENT`.
   - Wait for `ensureAuth()`, up to 5 s; no UID (sign-in failed or timed out) fails the call as `CLOUD_AUTH` (`copy.err.auth`) without a request. The next call tries to sign in again (D-110).
5. **Image re-check**, for every image of a call that can reach the cloud:
   - The image must be JPEG (`BAD_MIME`).
   - No APP1 or APP13 segment, and `exifr.gps()` returns undefined (`EXIF`, D-19).
   - For S3, the image's sha256 must equal the consented hash (`NO_CONSENT`).
   - Face detection on the exact outgoing bytes, at `minDetectionConfidence 0.3`, must find **zero faces** (`FACE`).
   - OCR on the exact outgoing bytes, run through the vault matcher, must find **zero hits** (`VAULT_TEXT_IN_IMAGE`).
   - **Which vault is scanned:**
     - Outside Judge Mode: the real vault.
     - S3 in Judge Mode: the **fake** vault. The sample's "LUCAS" tag must therefore be masked (D-37).
     - S4: the vault-text check is replaced by the allowlist, because the sample originals and S4 prompts contain fake-vault text on purpose. The metadata and face checks still run.
6. **Prompt scan**, over the dynamic text segments of calls that can reach the cloud, against the vault chosen in step 5:
   - S2: a vault hit (a vault string, or a coordinate pair within 1 km of a pin) means **reclassify to S0** (D-15), not a block.
   - S3: the prompt must be exactly a registered template (`advA.v1` / `advB.v1`) with no appended text. Any vault hit gives `VAULT_TEXT_IN_PROMPT`.
   - S3: any coordinate pair within 1 km of a pin gives `PIN_IN_PROMPT`.
   - S4 uses the allowlist instead.
7. **Execute:**
   - S0/S1 calls hold the **local lock**: the tripwire refuses any request to the AI host while it is held.
   - Calls that can reach the cloud hold a **permit**.
   - Calls that may run on the device are single-flight: one Nano session at a time.
8. **Route check:** see AC-022 (BREACH).
9. **Output:**
   - Parse and validate.
   - For S3, run an **echo scan** of the returned text against the scanned vault (§7.3).
10. **Ledger:** exactly one entry per gate call, including blocked calls.

### 7.2 Block reasons and toasts

The block reasons are ARCHITECTURE's `GateBlockReason` values.

| Reason | Toast | Notes |
|---|---|---|
| `VAULT_TEXT_IN_IMAGE` | `copy.gate.blockedVaultText` (shows the OCR text as read) | The Ledger stores `{vaultItemId, kind}` only |
| `FACE` | `copy.gate.blockedFace` | |
| `EXIF`, `BAD_MIME` | `copy.gate.blockedMetadata` | |
| `CLASS_FLOOR`, `CLASS_MISMATCH`, `NOT_SYNTHETIC` | `copy.gate.blockedClass` | Also logged as a developer error |
| `VAULT_TEXT_IN_PROMPT`, `PIN_IN_PROMPT` | `copy.gate.blockedPrompt` | S3 only (S2 is reclassified instead) |
| `NO_CONSENT` | `copy.gate.blockedConsent` | |
| `KILL_SWITCH` | `copy.err.killSwitch` | banner, not a red toast |
| `DAILY_CAP` | `copy.err.dailyCap` | banner |
| `OFFLINE` | `copy.queue.queued` | the cloud step does not run; nothing is queued (T-084 deferred, D-163) |
| `TRIPWIRE` | `copy.gate.tripwire` | persistent red banner |

When a call is blocked, it is not made. A blocked call:
- records `BLOCKED` with its reason in the Ledger;
- raises the "Blocked" counter by one;
- leaves the session usable.

### 7.3 Network tripwire and response scan
- **Tripwire.** A wrapper on the global `fetch` for the AI host (`firebasevertexai.googleapis.com`). It refuses a request in any of these cases:
  - (a) while an S0/S1 call holds the local lock;
  - (b) when no gate permit is outstanding;
  - (c) when the request's **text parts** contain a term of the vault that applies to the call: the real vault for S2/S3 outside Judge Mode, the fake vault for S3 in Judge Mode, and no scan for S4, which the allowlist guards.
  - `data:` URLs and other hosts pass through untouched.
  - Base64 image data is never string-scanned.
  - The tripwire must be in place before any Firebase module can issue a request. ESM import order matters; ARCHITECTURE says how.
  - Vault-term scanning attaches once the active vault is ready: the real vault after it is unsealed, or the fake vault in Judge Mode (the real vault is then never unsealed, D-37). Until then the tripwire fails closed.
- **Response scan (S3).** Any vault string found in pass B's text fields:
  - becomes a red verdict line, `copy.verdict.echo`;
  - is masked in the display.
  - The string itself is never stored; the Ledger keeps only the vault item ID and its kind.

### 7.4 Acceptance criteria: gate
- **AC-040 (P0) [unit]** Each block reason has a unit test with a fixture that triggers exactly that reason. The test also checks that no SDK method was called (mocked).
- **AC-041 (P0) [e2e] [video] Deliberate leak demo.**
  1. In the mask editor, un-tick the mask on a vault-matched name (for example "LUCAS").
  2. Confirm the consent sheet. It shows `copy.consent.unmasked` and Send stays enabled (AC-135).
  3. Expected:
     - the gate blocks the send with `VAULT_TEXT_IN_IMAGE`;
     - toast `copy.gate.blockedVaultText` appears with the text;
     - the Ledger shows a BLOCKED entry;
     - **zero** requests reach the AI host;
     - the counters still read `Faces sent: 0 · Vault items sent: 0`.
- **AC-042 (P0) [unit]** The vault matcher catches common OCR confusions. `LUCAS`, `Lucas`, `LUCA5`, `L U C A S` and `LUCAS'S` all match the vault item "Lucas". `LOCAL`, `LUCKY` and `PARIS` do not. The vectors live in `shared/testvectors/fuzzy.json`.
- **AC-043 (P0) [unit]** A JPEG with EXIF GPS is blocked. The clean canvas output (APP0 + APP2) passes.
- **AC-044 (P0) [unit]** If the outgoing bytes differ by one byte from the consented bytes, the send is blocked with `NO_CONSENT`.
- **AC-045 (P0) [unit]** Ledger entries and exported receipts never contain a vault string, a pin coordinate or a pixel of the original photo; they contain vault item IDs and kinds only. Tested by scanning the serialised Ledger for fixture vault strings and coordinates.
- **AC-046 (P1) [unit]** The gate's checks add ≤1.5 s on a 1536 px image (M1, warm OCR worker). Measured and logged.
- **AC-047 (P0) [unit]** Tripwire:
  - a request to the AI host while the local lock is held throws, and produces BREACH (AC-022);
  - a request with no permit throws;
  - `data:` URLs and other hosts pass;
  - vault text inside `systemInstruction` or a text part throws;
  - base64 `inlineData` is not scanned.
- **AC-048 (P0) [unit]** Judge Mode scanning (D-37):
  - an S4 referee prompt containing "Lucas" from the fake vault is **not** blocked;
  - an S3 Judge Mode image with the "LUCAS" tag unmasked **is** blocked;
  - the real vault is never unsealed during either.

---

## 8. Information architecture and global layout

### 8.1 Routes (web, hash routing, D-27)

| Route | Screen |
|---|---|
| `#/` | Home |
| `#/vault` | Vault |
| `#/check` | The current check (stepper). `#/check/<sessionId>` reopens a recent check (P1). |
| `#/judge` | Judge Mode. The deep link `https://HOST/?judge=1` redirects here (after SCR-01 on a fresh profile). |
| `#/settings` | Settings, including Data (Burn vault, Clear history) |
| `#/about` | About |
| `#/atlas` | Leak Atlas detail (P1) |
| `#/dev/spike`, `#/dev/bench`, `#/dev/selftest` and any other `#/dev/*` page (e.g. `#/dev/slice`) | **Dev builds only** (`web/src/dev/`); absent from the production bundle |

The Cloud Ledger is a rail or a sheet, not a route (§8.2).

### 8.2 Global elements
- **Header**, from left to right:
  - logo and name;
  - the **capability chip**: `On-device: Gemini Nano`, `On-device: Nano (text only)`, `Downloading Nano 43%` or `Rules-only`. Tapping it opens SCR-02. In (b) the percentage shows only while a download runs; `downloadable` with nothing downloading shows `Rules-only` (D-86).
  - the **connectivity chip**, shown only when offline or when the cloud is paused: `Offline`, `Cloud paused` or `Cloud limit reached`;
  - the **Ledger button**, with live counters `0 · 0` (faces · vault items sent);
  - Settings.
- **Judge banner** across the top whenever Judge Mode is active (`copy.judge.banner`).
- **Router HUD:** floating at the bottom-left, collapsible (SCR-14).
- **Cloud Ledger:** a right rail at widths of 1024 px or more; below that, a bottom sheet opened from the header's Ledger button (SCR-13).
- **Check stepper:** `Import › Pre-screen › Send › Attack › Verdict › Fix › Re-attack` (D-185: Export is the "Save a covered copy" card under the result, not a step). The current step is highlighted. Completed steps can be revisited without re-running any calls.

```
+------------------------------------------------------------------------------------------+
| Strangers' Eyes   [On-device: Gemini Nano]  [Offline]           [Ledger 0 · 0] [Settings]|
+------------------------------------------------------------------------------------------+
| Import > Pre-screen > Send > Attack > Verdict > Fix > Re-attack > Export                 |
|                                                            |  CLOUD LEDGER               |
|  +------------------------------------------------------+  |  Faces sent: 0              |
|  | Photo viewer   [Your view | What the cloud saw]      |  |  Vault items sent: 0        |
|  |  (masks = solid black, clue boxes = outlined)        |  |  Images: 1 · Requests: 2    |
|  +------------------------------------------------------+  |  On-device AI calls: 4      |
|  Step panel (clue list / notes / verdict card / fix)       |  entries...                 |
|                                                            |                             |
| [HUD: referee > ON-DEVICE (Gemini Nano) 1.3 s  v]          |                             |
+------------------------------------------------------------------------------------------+
```

### 8.3 Visual language
- Dark theme (`#0b0b0f` background) and a light theme, both from design tokens.
- **Verdict colours:**
  - **RED**: high;
  - **AMBER**: medium;
  - **GREY**: info;
  - **GREEN**: only ever used for "Risk reduced";
  - **TEAL**: "protected on this device".
- **Route badges:**
  - ON-DEVICE: violet;
  - IN CLOUD: blue;
  - RULES-ONLY: grey;
  - BLOCKED: red;
  - QUEUED: amber outline;
  - CACHED SAMPLE: dashed outline.
- Masks are solid `#000`, never blur.
- Clue boxes are 2 px outlines, coloured by severity and labelled with their ID (`c1`).
- Approximate (grid-cell) areas are drawn dashed.

### 8.4 Acceptance criteria: shell, accessibility, performance
- **AC-060 (P0) [e2e]** At 375×812:
  - there is no horizontal scroll;
  - the Ledger is a bottom sheet;
  - the HUD collapses to a pill;
  - every step is usable.
- **AC-061 (P0) [manual]** Everything works by keyboard.
  - Sheets trap focus and return it when they close.
  - The streaming notes, the HUD and the toasts use `aria-live`: `polite` for the notes and the HUD, `assertive` for gate blocks.
- **AC-062 (P0) [manual]** Verdict lines never rely on colour alone: each has an icon and text. Text contrast meets WCAG AA.
- **AC-063 (P1) [manual]** With `prefers-reduced-motion`, the mask-fill animations and the streaming shimmer are off.
- **AC-064 (P0) [manual]** Tier-0 on a 12 MP photo (downscaled to the 2048 px master) finishes in ≤3 s on the M1 with warm workers. The time is shown on the pre-screen lines (Tier-0 makes no model call, so no HUD entry; D-179). The ARCHITECTURE budget target is 1.5 s.
- **AC-065 (P0) [e2e]** Every product route in §8.1 exists in the production build. `#/dev/*` routes and their code are absent from it.
- **AC-066 (P0) [manual]** **By Nov 22**, the Tier-0 selftest (EXIF strip, face detection on a no-face image, OCR word boxes, vault round trip) passes in current Safari and Firefox on macOS, not only Chrome. [UNVERIFIED: Safari lacks relaxed SIMD; Tesseract should fall back to the `simd` core.]
- **AC-067 (P0) [manual]** A cold Judge Mode start on the hosted URL is measured in a fresh profile with DevTools "Fast 4G" throttling, and the time to first verdict is recorded in PROGRESS. Meanwhile, row 2 of the capability panel shows asset-loading progress (`copy.cap.assetsLoading`).

---

## 9. Screens and flows

Each screen lists its purpose, layout, behaviour, states (a)–(e), copy IDs and ACs. "Same as default" means the state changes nothing visible on that screen.

### SCR-01 Welcome and 18+ (first run) · P0
- **Purpose:** set expectations, meet the Gemini API terms (18+), and get the "own photos only" commitment.
- **Layout:**
  - the tagline (`copy.app.tagline`);
  - three bullets (`copy.welcome.b1`–`b3`);
  - a checkbox (`copy.welcome.age`);
  - **Continue**, disabled until the box is ticked.
- **Behaviour:**
  - The confirmation is stored locally (localStorage, inside try/catch) and the screen is not shown again.
  - `?judge=1` still shows this screen first, then goes to `#/judge` with SCR-02 open (its "Try Judge Mode" closes it). A returning profile goes straight to `#/judge` (D-103).
- **States:** (a)–(c) same as default; (d) works offline once cached.
- **ACs**
  - **AC-070 (P0) [e2e]** Continue stays disabled until the age box is ticked. After continuing, a reload skips SCR-01.
  - **AC-071 (P0) [e2e]** `/?judge=1` on a fresh profile goes SCR-01 → SCR-02 → Judge Mode in 3 clicks or fewer.

### SCR-02 Capability panel ("What runs where on this browser") · P0
- **Purpose:** show honestly what will run on the device, in the cloud, or as rules, *on this browser*.
- **Layout:**
  - title `copy.cap.title`;
  - the line `copy.cap.invariant`, always visible;
  - four rows, each with a status icon, a one-line status and a "What this means" disclosure:
    1. **On-device AI (Gemini Nano)**;
    2. **Tier-0 guard** (faces, text, metadata): `Ready`, or `copy.cap.assetsLoading` with a progress percentage;
    3. **Cloud attacker** (Gemini via Firebase AI Logic): Ready, Offline, Paused, Limit reached, or Not verified (App Check);
    4. **Works offline**: `copy.cap.offlineReady`, or "Available after this page finishes caching (about 31 MB)";
  - a policy mini-table (S0–S4, one plain-words line each);
  - buttons: `Set up my vault` · `Try Judge Mode` · `Check a photo now`.
- **Behaviour:**
  - In state (b), show **Download Gemini Nano (about 4 GB)**.
    - The click handler itself calls `initializeDeviceModel(progress)`, because it needs a user gesture.
    - A progress bar runs from 0 to 100%.
    - On success the panel switches to state (a) without a reload.
  - When Chrome desktop is detected but `hasLM` is false, show "How to turn on on-device AI in Chrome":
    - `chrome://settings/ai` → On-device AI;
    - `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled [UNVERIFIED: whether still needed on Chrome 157, U-02];
    - restart Chrome;
    - the hardware note: macOS 13+, 22 GB free disk, and either a GPU with more than 4 GB of VRAM or 16 GB of RAM.
  - Reachable later from the header's capability chip.
- **States**
  - (a): row 1 shows `copy.cap.nanoReady`; in (a′), `copy.cap.nanoTextOnly`.
  - (b): row 1 shows `copy.cap.nanoDownloadable` or `copy.cap.nanoDownloading` with the percentage, plus the Download button.
  - (c): row 1 shows `copy.cap.nanoNone`, plus the how-to disclosure on Chrome.
  - (d): row 3 shows `copy.cap.offline`.
  - Cloud-row variants: `copy.cap.cloudReady`, `copy.cap.cloudPaused`, `copy.cap.cloudCap`, `copy.cap.appCheckFail`.
- **ACs**
  - **AC-072 (P0) [manual]** Each of (a), (a′), (b), (c) and (d) renders its matching copy. Check with real Chrome, a Chrome guest profile and Safari (and with the developer simulation, which is P1).
  - **AC-073 (P0) [manual]**
    - The Download button calls `initializeDeviceModel` only from a click.
    - Progress updates at least every 5%.
    - On completion the chip changes to `On-device: Gemini Nano` within 2 s.
  - **AC-074 (P0) [e2e]** The panel never shows an error state for (c). Rules-only is presented as fully supported.

### SCR-03 Home · P0
- **Layout:**
  - a drop zone (SCR-05);
  - a **Try Judge Mode** card;
  - a **Waiting for connection** list (SCR-18), shown when it is not empty;
  - **Recent checks on this device** (P1): up to 10, encrypted, each with a thumbnail of the **masked** image and the verdict colour;
  - **Most common giveaways this week** (SCR-21, P1);
  - a vault summary chip ("Vault: 4 items · stays on this device") linking to `#/vault`.
- **States:** in (d) the offline chip shows and the drop zone still works. Other states: same as default.
- **ACs**
  - **AC-075 (P1) [e2e]**
    - Recent checks persist across a reload, encrypted with the vault key.
    - Tapping one reopens the session at its last step with **pass B results only**, shows `copy.adv.notesNotStored` (pass A is never persisted, D-28), and makes no new AI call.
    - Sessions older than 7 days are deleted at startup.

### SCR-04 Vault · P0 (W1)
- **Purpose:** hold the private ground truth that grades the attacker.
- **Layout:**
  - the lock badge `copy.vault.lock`;
  - the explainer `copy.vault.howUsed`;
  - an item list grouped as **Places** (pins) and **Names and details** (text);
  - **Add place** and **Add detail** buttons;
  - a counter "n / 20";
  - a link to Burn vault (SCR-19).
- **Item kinds:** §17.2.
- **Add place flow:**
  1. Choose a kind: Home, Work, School or Other (`home_pin`, `work_pin`, `school_pin`, `place_pin`).
  2. Enter an optional label (≤40 characters, for example "City General Hospital"). For **Home** pins only, also an optional area name (for example the neighbourhood) (D-63).
     - The area name becomes a separate `area_name` item linked to the pin. It means "your home area" everywhere (§17.3 display HOME; `KIND_PHRASE` in `shared/prompts/enums.v1.json`), which is why only Home pins offer it.
     - An empty label, or a generic label (Home, Work, School, Place), is display-only and is never matched or sent to the referee (D-36). Show the hint `copy.vault.genericLabel`.
  3. **Pin this place** (`copy.vault.pinHelp`): `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true, timeout: 15000, maximumAge: 0`.
     - Show the accuracy.
     - If the accuracy is worse than 250 m, show `copy.vault.lowAccuracy`. Accuracy is shown rounded up to whole metres.
     - The browser's timeout starts only after permission is granted, so after 30 s with no answer (an ignored permission prompt) the read fails as timed out (D-99).
  4. Fallback link **Enter coordinates I know**: a validated "lat, lng" field (`copy.vault.manualCoords`).
     - **No map, no address search, no reverse geocoding, no tile server.** Any of these would leak the pin.
  5. Save.
- **Add detail flow:** choose the kind, then the value (≤40 characters). Show format hints for plates, phones and house numbers. The kind picker labels `area_name` and `street_name` **"Home area"** and **"Home street"**, because both mean the home everywhere (§17.3, D-63). Optional other spellings, comma-separated, up to 5 (D-92).
- **Edit and delete:** per item; deleting asks for confirmation. The kind is fixed while editing (D-92).
- **Coordinates are never shown** (D-92): a pin is described only by how it was set and its accuracy, in the list and in the form.
- **Storage:**
  - AES-GCM 256 with a **non-extractable** WebCrypto key.
  - Key and data live in separate IndexedDB databases (`se-vault-keys`, `se-vault-data`), one object store each.
  - Never use idb-keyval's default store; tesseract.js owns it.
  - A fresh 96-bit IV for every write.
  - Never synced, never written to Firestore, never in any prompt that can reach the cloud.
- **States**
  - (a)–(c): same as default; the vault is pure code.
  - (d): fully works. Geolocation may still work offline using the OS's cached Wi-Fi location.
  - Permission denied: `copy.vault.pinDenied`, plus the manual-coordinates link.
  - Geolocation unavailable or timed out: `copy.vault.pinTimeout`.
  - Judge Mode: shows the **fake** vault read-only, with the banner `copy.judge.fakeVault`. The real vault is neither unsealed nor loaded (D-37).
- **ACs**
  - **AC-080 (P0) [unit]** Writing then reading a vault item returns an equal value. The key reads back with `extractable === false`, and `exportKey('raw')` throws. CryptoKey cloning in fake-indexeddb is [UNVERIFIED]; fall back to a browser check if needed.
  - **AC-081 (P0) [unit]** Two writes of the same item use different IVs.
  - **AC-082 (P0) [e2e]** A 21st item is refused with `copy.vault.full`. Labels over 40 characters are refused inline.
  - **AC-083 (P0) [e2e]** "Pin this place" stores lat, lng and accuracy locally. A network-log check shows that no request carries the coordinates, or anything derived from them, to any host.
  - **AC-084 (P0) [e2e]** Manual coordinates accept `52.52, 13.405` and reject `95, 10` and `abc`.
  - **AC-085 (P0) [manual]** The lock badge text is exactly `copy.vault.lock`.
  - **AC-086 (P0) [unit]** An empty vault is valid, and every downstream job works with zero items (§10.5).
  - **AC-087 (P1) [unit]** Linked area names are matched by OCR and by the referee like any other text item.
  - **AC-088 (P0) [unit]** Generic or empty pin labels ("Home", "Work", "School", "Place", "") are excluded from every vault-string scan (Tier-0, gate, tripwire, echo) and from the referee's VAULT list. A prompt containing "home" is not blocked by a pin labelled "Home".

### SCR-05 Import · P0
- **Inputs:** a file picker, drag and drop, and paste (Ctrl/Cmd+V of an image).
  - **There is no URL input.** Dropped or pasted URLs and text are rejected with `copy.import.noUrl`.
- **Accepted formats:** JPEG, PNG and WebP.
  - HEIC is attempted. If `createImageBitmap` fails, show `copy.import.heic` [UNVERIFIED: U-32].
  - The format is decided from the file's bytes, never its name or MIME type (D-78). An image that arrives together with a web address or page markup (dragged from a web page, or copied with "Copy image") counts as a link: `copy.import.noUrl`.
- **Rejected:** files over 30 MB (30,000,000 bytes, as Finder shows it), images over 40 MP (read from the header before decoding), animated or video files, and malformed or truncated files (`copy.import.tooLarge`, `copy.import.unsupported`; D-78).
- **One photo per check.** Batch "check my last 20 posts" is P2.
- **On import:**
  1. Read EXIF locally with exifr: is there GPS, and what is the orientation?
  2. **P1:** if GPS is present and the vault has pins, compute the band from the EXIF point to each pin. Show `copy.import.gpsFound`, plus `copy.import.gpsNear` when the band is district or closer. This is S0 and is computed in code. Every pin at district or closer is named, closest first, one line per {KIND}; a place pin shows its label (D-78).
  3. Decode with `createImageBitmap(blob, {imageOrientation: 'from-image'})`.
  4. Downscale to the master (≤2048 px), re-encode it as JPEG at quality 0.9 (which strips EXIF), and hand it to Tier-0.
  5. The original blob stays only in memory, or is encrypted if the session is saved. It is never uploaded.
- **States:** the same in (a)–(d).
- **ACs**
  - **AC-100 (P0) [e2e]** File, drag and paste each start a session. A pasted URL string shows `copy.import.noUrl` and starts nothing.
  - **AC-101 (P0) [unit]** For a fixture with EXIF Orientation=6, the master JPEG has no APP1 or APP13 segment, `exifr.gps()` returns undefined, and the image is upright.
  - **AC-102 (P1) [unit]** A fixture with EXIF GPS 200 m from a vault home pin produces `copy.import.gpsNear` with band `street`.
  - **AC-103 (P0) [e2e]** A 35 MB file is rejected with `copy.import.tooLarge`, and a non-image with `copy.import.unsupported`.

### SCR-06 Pre-screen and mask editor · P0 (W2, W3)
- **Purpose:** catch and mask what must never leave *before* the cloud sees anything, and show what a stranger might use.
- **Progress list.** Each line carries a badge and its latency (D-179). The four Tier-0 lines carry `BUILT-IN · {engine}` (`ui.prescreen.builtin`: code, MediaPipe, Tesseract, code), never RULES-ONLY: they always run on this device, with or without Nano, and make no model call, so they are not HUD entries. A note under them (`ui.prescreen.builtinNote`) says so. The Nano line carries its route badge (ON-DEVICE, or RULES-ONLY when Nano is missing) and a HUD entry:
  - "Removing metadata"
  - "Finding faces (n)"
  - "Reading text (n words)"
  - "Checking against your vault (n matches)"
  - "Looking for clues: Gemini Nano (n clues)", or `copy.prescreen.rulesOnly`
- **Tier-0 (W2, always runs):**
  1. **Faces:** MediaPipe full-range detector on the master, CPU delegate, **`minDetectionConfidence 0.3`** (D-30). Every face becomes a **mask** box with 15% padding.
  2. **OCR:** Tesseract.js (LSTM, `PSM.SPARSE_TEXT`, `{blocks: true}` as the third argument) on a canvas downscaled from the master to `ocr_max_px` (1600). Never pass an ImageBitmap. Word boxes are mapped back to master pixels.
  3. **Vault matcher (D-38).** This one algorithm is used everywhere: Tier-0, the gate's OCR re-check, the S2/S3 prompt scans, the tripwire's text scan, the echo scan, and iOS.
     - **Normalise:**
       - NFKD, strip diacritics, lowercase;
       - delete apostrophes ("Mary's" → "marys", as in the §10.3 example "st marys"); replace all other punctuation, including periods and hyphens, with a space;
       - collapse whitespace;
       - fold synonyms: saint↔st, street↔st, avenue↔ave, road↔rd, number↔no, &↔and.
     - **Join spaced letters:** on one OCR line, a run of single-character tokens ("L U C A S") becomes one token.
     - **Fold confusables** for text kinds: 0→o, 1→i, l→i, 5→s, 8→b, applied to both sides.
     - **Similarity:** `1 − levenshtein / maxLength` ≥ RC `fuzzy_threshold` (0.8). Tokens of ≤3 characters must match exactly. With this threshold, a 4-character token needs an exact match after folding.
     - **Single-token labels:** match an OCR token by similarity.
     - **Multi-word labels** match if any of these holds:
       - (a) one **distinctive** label token matches. Distinctive means ≥4 characters and not in the generic-word list (§17.5: CITY, GENERAL, SCHOOL, PRIMARY, HOSPITAL, STREET, ROAD, …);
       - (b) two **consecutive** label tokens match two consecutive OCR words;
       - (c) the whole label matches a window of OCR words of the same length.
     - **Digit kinds** (`plate`, `house_number`, `phone`): no confusable folding. Remove spaces and dashes and compare uppercase.
       - The value may span up to 2 adjacent OCR words ("SE 1234"), or up to as many words as the value has groups (max 6).
       - Punctuation separates words here too: a value glued to a label ("Tel:07700900123", "REG:SE1234") matches (D-77).
     - **As implemented (D-77):**
       - each word is also tried with a possessive 's removed ("AVA'S" → Ava; short names can't match "avas" under the ≤3-character rule);
       - invisible format characters (soft hyphen, zero-width space) are deleted rather than spaced;
       - a pair of function words never counts for rule (b);
       - a run of ≥2 single letters is joined;
       - `shared/testvectors/fuzzy.json` `conventions` is the full contract (iOS port, AC-168).
       - Values of 1–2 characters match only a standalone token, and only in images. Prompt and echo scans skip terms shorter than 3 characters.
     - **Pins:** their coordinates are used only for `PIN_IN_PROMPT`. A pin's label and aliases are text terms like any other item's, unless the label is empty or generic, in which case the pin contributes no terms (D-36, AC-088).
     - Every Tier-0 hit becomes a **mask**.
  4. **Regex flags:**
     - **Plate-like:** 5–8 alphanumerics with ≥2 letters and ≥2 digits, OCR confidence ≥60.
     - **Phone:** 7–15 digits, allowing `+ - . space` as separators.
     - **House-number candidate:** a standalone 1–4 digits plus an optional letter, alone on its OCR line, with a box height ≥2% of the image height.
- **Nano pre-screen (W3a, S1):**
  - Input: a 768 px JPEG of the **original** (unmasked) master plus `nanoPre.v1`. Output: `{clues: [{type, text, region, severity}]}`, using 13 types and the 3×3 regions.
  - A clue with non-empty `text` is located by matching OCR words inside its region's cell with similarity ≥0.7. Their union is the box (`exact`).
  - Otherwise the clue gets the **grid cell** (one ninth of the image), drawn dashed and labelled `copy.prescreen.approximate`.
- **Nano vault-text match (W3b, S0, P1):**
  - Input: OCR lines `w1..` (at most 40), pre-screen texts `p1..` and vault labels. Output: `{hits: [{text_id, vault_id, strength}]}`.
  - `exact` and `likely` hits become **masks**.
  - A hit with no OCR box masks its whole grid cell (fail closed). The user may replace that with a tighter hand-drawn mask; removing the cell mask asks for confirmation (`copy.editor.confirmRemoveCell`).
  - "Two independent readers": a hit from Tesseract alone or from Nano alone is enough to mask.
- **Pre-tick rules (D-16):**

  | Item | Standard (default, P0) | Strict (P1) |
  |---|---|---|
  | Faces (any detection ≥0.3) | masked | masked |
  | Vault hits (Tier-0 matcher, or Nano W3b `exact`/`likely`) | masked | masked |
  | Regex plates and phones | masked | masked |
  | Regex house-number candidates | masked | masked |
  | Nano clues with severity high whose type is in RC `auto_mask_types` (default `name_text`, `house_number`, `plate`, `mail_or_document`, `screen`), located by OCR | masked | masked |
  | The same clues, **not** located by OCR (grid cell only) | flagged, dashed (`copy.prescreen.approximate`) | masked (grid cell) |
  | Other high-severity clues | flagged | masked |
  | Medium- or low-severity clues (for example a lanyard logo or a street sign) | flagged amber (`copy.prescreen.possible`) | masked |

- **Mask editor:**
  - the image with solid masks and outlined flags;
  - a side list (below the image on mobile), one row per item: icon · type · reader(s) (`Tier-0`, `Gemini Nano` or `Both`) · severity · mask toggle · "Explain" (S2, SCR-16);
  - **Add mask:** drag a rectangle; it can be deleted;
  - **Crop** (P1): drag the edges; the crop applies to everything downstream;
  - Standard/Strict switch (P1): re-applies the pre-ticks after confirmation;
  - **People notice** (P1): if faces > 0, show `copy.prescreen.people`;
  - Un-ticking a face mask or a vault-hit mask is **allowed** so that the gate can be demonstrated. It shows the inline warning `copy.editor.warnVault` or `copy.editor.warnFace`, and the gate will block the send.
- **Primary actions:**
  - **Check with the cloud attacker** opens SCR-07. When offline it is replaced by **Queue cloud check** (SCR-18).
  - **Just clean and export** (SCR-12) skips the cloud entirely.
- **States**
  - (a): the Nano line shows `ON-DEVICE · Gemini Nano`, and clues come from both readers.
  - (a′): the image pre-screen is RULES-ONLY (`copy.prescreen.textOnly`); W3b still runs on Nano.
  - (b) and (c): `copy.prescreen.rulesOnly`. Tier-0 only; the flagged list holds regex and vault hits only.
  - (d): as (a) or (c), and the primary button becomes **Queue cloud check**.
- **ACs**
  - **AC-110 (P0) [unit]** The AC-042 fixtures produce masks.
    - "CITY GENERAL" matches the label "City General Hospital" (rule b).
    - "CITY" alone does not.
    - "HOSPITAL STAFF" does not.
  - **AC-111 (P0) [e2e]** A synthetic test image with a printed "LUCAS" tag, and the vault child name "Lucas", produces a mask over the tag. In state (a), the reader column shows `Both` when Nano also read it.
  - **AC-112 (P0) [unit]** Standard pre-ticks exactly as in the table, on a fixture clue set.
  - **AC-113 (P0) [manual]** Masks render solid black with 15% padding (`mask_pad_ratio`, at least 4 px), never blur or pixelation.
  - **AC-114 (P0) [unit]** Nano pre-screen output is validated: type, region and severity are checked against their enums, and extra or invalid items are dropped. If parsing fails, the Tier-0 results are kept and the HUD shows `parse_error`.
  - **AC-115 (P1) [unit]** A W3b vault hit with no OCR box masks the whole grid cell.
  - **AC-116 (P0) [e2e]** A mask added by dragging appears in the outgoing image (checked in SCR-07).
  - **AC-117 (P0) [manual] [video]** In state (a) with Wi-Fi off (storyboard beat 3), the pre-screen shows:
    - the `ON-DEVICE · Gemini Nano` badge;
    - the vault-hit message `copy.prescreen.vaultHit`;
    - an amber flag on the lanyard.
  - **AC-118 (P0) [unit]** All boxes (faces, OCR, Nano grid cells, pass-B boxes) are in master pixel coordinates (D-20). Checked by sampling pixels on a fixture.
  - **AC-119 (P0) [unit]** A face detected at confidence 0.4 is masked by Tier-0 before consent, and the gate does not block the send (D-30).
  - **AC-120 (P1) [unit]** Strict mode pre-ticks exactly as in the table.

### SCR-07 Consent sheet · P0
- **Purpose:** the user approves the exact bytes that will leave the device.
- **Layout (modal sheet):**
  - title `copy.consent.title`;
  - the **outgoing JPEG**, rendered from the exact blob to be sent (≤1536 px), with its dimensions, size in KB, and the first 8 characters of its sha256;
  - a checklist computed by the **dry run** (below): `✓ Metadata removed` · `✓ 0 faces visible` · `✓ 0 vault matches` · `✓ n areas masked (f faces, v vault, u yours)`;
  - "What's sent": this image plus the fixed audit prompts `advA.v1`/`advB.v1`, sent to `adversary_model` through Firebase AI Logic; then the tier line, `copy.consent.tierPaid` or `copy.consent.tierFree` (from `data_tier`);
  - "Never sent": `copy.consent.never`;
  - checkbox **Include live Google Search notes**: on by default when `grounding_enabled` and `data_tier = paid`; hidden otherwise;
  - buttons **Send this image** (`copy.consent.send`) and **Keep it on this device** (`copy.consent.cancel`).
- **Dry run (D-30).** The sheet runs the gate's §7.1 step 5 checks on the exact outgoing bytes.
  - **New detections** are faces or vault-text hits that do not overlap an item the user deliberately un-ticked. They are masked automatically and the image is re-encoded, up to **2 rounds**, before Send is enabled. Line: `copy.consent.autoMasked`.
  - **Items the user deliberately un-ticked** show the red warning `copy.consent.unmasked`, and Send **stays enabled**. The gate then blocks the send through its real code path; this is the leak demo, AC-041.
  - Any other failure that persists after 2 rounds (for example metadata) disables Send and names the failing item, with a "Fix in editor" link.
  - Even if a stale UI forces a send, the gate still blocks it (SCR-10).
- **Behaviour:**
  - The re-attack opens the same sheet with a diff line: "n more areas masked since the last send".
  - In Judge Mode the sheet still shows. With autoplay on, it confirms automatically after a visible 3 s countdown (`copy.judge.autoConfirm`).
- **States**
  - (a)–(c): same as default.
  - (d): the sheet does not open; the check is queued instead (D-17).
  - (e): the sheet cannot open for a photo that was refused.
  - Kill switch, cap or App Check failure: the sheet does not open; the matching banner shows (SCR-22).
- **ACs**
  - **AC-130 (P0) [e2e] [video]** The image in the sheet and the bytes sent have the same sha256: the Ledger entry's hash equals the sheet's hash.
  - **AC-131 (P0) [unit]** The tier line follows `data_tier`. With `free`, the grounding checkbox is hidden and pass A is not run.
  - **AC-132 (P0) [e2e]** Cancel sends nothing (checked in the network log) and returns to the editor.
  - **AC-133 (P0) [e2e]** A dry-run failure that persists after auto-masking, and that the user did not cause by un-ticking, disables Send and names the item.
  - **AC-134 (P0) [unit]** A vault word visible only at 1536 px (missed at master or OCR scale) is auto-masked by the dry run, and Send then enables. After 2 rounds the dry run stops.
  - **AC-135 (P0) [e2e]** After the user un-ticks a vault-hit mask, the sheet shows `copy.consent.unmasked`, Send stays enabled, and sending is blocked by the gate (AC-041).

### SCR-08 Adversary (streaming) · P0 (C1 is P1, C2 is P0)
- **Purpose:** show what a stranger's AI works out from the redacted copy.
- **Layout:**
  - the photo viewer, defaulting to "What the cloud saw";
  - the **Investigator notes** card: pass A's Markdown, streamed and sanitised (no raw HTML; links open in a new tab with `rel="noopener noreferrer"`).
    - Directly under the notes, at **the same width**: the **Search Suggestions** chip (`groundingMetadata.searchEntryPoint.renderedContent`), injected **unmodified** into a shadow root. It shows the `webSearchQueries` as provided.
    - Then **Sources**: `groundingChunks[].web.title`, each linked directly to its `uri`.
  - **Clues the attacker found** (pass B): each with its type, the level it reveals, severity and whether it is removable ("Street sign · reveals the street · High · can be masked"), and an "Explain" button. Boxes are drawn on the image. Misuse hardening (Nov 24, user-approved): the UI **never** renders the attacker's guessed place names (hypothesis labels), inference values, clue evidence text, the scene summary or a referee's free-text reason, so the app can't be used as a free "where was this photo taken" tool. The data stays in memory where the referee and the fix planner need it (the referee compares labels with the vault on the device). Clue ids show only with Settings › Technical details.
  - **Attacker's best guess:** level and confidence for h1 only (`copy.verdict.bestGuess`). **Never** its place name, coordinates, a radius in metres, a map or a street address.
  - Status line `copy.adv.running`, and the route badges `IN CLOUD · gemini-3.8-flash + Google Search` (pass A) and `IN CLOUD · gemini-3.8-flash` (pass B).
- **Behaviour:**
  - Pass A and pass B start **together** (D-02).
  - The referee (SCR-09) starts as soon as pass B returns, whatever pass A is doing.
  - `groundingMetadata` is captured **from the stream chunks**, keeping the last value that is not undefined.
  - **Pass A rules:**
    - never parsed by code;
    - never sent to Nano;
    - kept in memory only, for this session (D-28);
    - never cached across users.
  - The Search Suggestions chip stays visible whenever the notes are visible: it sticks to the bottom of the notes card and does not collapse on its own. Taps go straight to Google's results page, with no interstitial and no click tracking.
  - **Pass B validation:**
    - IDs are unique;
    - `clue_ids` must point at clues that exist;
    - `box_2d` (`[ymin, xmin, ymax, xmax]`, 0–1000) is clamped, its corners are swapped if reversed, and zero-area boxes are dropped;
    - boxes are mapped to the master;
    - hypotheses are used only when `audit_status === 'ok'`.
  - **Transient errors** are `fetch-error` (network, 5xx), 429, `MAX_TOKENS` truncation, invalid JSON and timeouts. Per-job timeouts: pass A 90 s, pass B 60 s.
    - The gate retries them automatically with the **identical** request: 429 up to 2× (after 2 s and 6 s); network or 5xx once; truncation or a parse failure once.
    - After that, show `copy.adv.truncated` / `copy.err.rateLimit` / `copy.err.network` with a **Try again** button. The 429 button enables after 60 s.
  - HTTP 400: `copy.err.cloudFailed`, recorded in the Ledger as a bug, no retry. 401/403: `copy.err.appCheck`.
  - Pass B is cached per session, keyed by `sha256(image)+model+promptVersion`. Going back and forward never calls the cloud again.
- **States**
  - (a)–(c): same as default (S3 is cloud-only).
  - (d): not reachable; the session is queued.
  - (e) **refused:**
    - Pass B declined or blocked: the notes card shows `copy.adv.declined`, the clue list is replaced by "Clues found on this device" (the pre-screen list), and the flow continues to a partial verdict (SCR-09 state e).
    - Only pass A declined (its text starts with `DECLINED:`) while pass B is ok: the notes card shows `copy.adv.notesDeclined`, and pass B's results are used normally.
    - Any decline or block (pass A or pass B) ends cloud checks for this photo: the gate refuses every further S3 call for the same session or image (`CLOUD_REFUSED`, no request; D-129, invariant 7), so the UI must disable re-attack and "Fix and re-check" for it.
    - **No retry button** for declines or blocks (D-18).
  - Grounding off (`grounding_enabled = false`, the free tier, or the box unticked): the notes card shows pass B's `scene_summary` plus `copy.adv.notesOff`. No chip and no sources.
  - `audit_status === 'no_location_signal'`: `copy.adv.noSignal`.
- **ACs**
  - **AC-140 (P0) [e2e]** The pass A and pass B requests start within 200 ms of each other. The referee starts after pass B returns, even if pass A is still streaming.
  - **AC-141 (P1) [manual] [video]**
    - The notes stream token by token.
    - The Search Suggestions chip renders inside a shadow root at the notes' width, and its HTML is byte-identical to `renderedContent`.
    - `webSearchQueries` are visible as provided.
    - Sources are listed and link directly, with no interstitial, redirect or click tracking.
    - The chip stays visible while the notes are visible.
  - **AC-142 (P0) [unit]** The pass B validator handles reversed corners, out-of-range values, duplicate IDs, dangling `clue_ids` and truncated JSON (fixture set in `shared/prompts/fixtures/`).
  - **AC-143 (P0) [unit]** No code path passes pass A text to a parser, a prompt, a Firestore write, a persisted store or a benchmark record. Checked with a sentinel string in a mocked pass A.
  - **AC-144 (P0) [e2e]** A mocked `audit_status: 'declined'` gives `copy.adv.declined`, shows no retry button, and makes no further S3 call for this session.
  - **AC-145 (P0) [e2e]** A mocked `AIError('response-error')` behaves exactly like AC-144.
  - **AC-146 (P0) [manual]** The UI never shows a hypothesis's lat/lng or radius, a map, or a street address.
  - **AC-147 (P0) [unit]** Revisiting the Attack step does not create a new Ledger entry (cache hit).
  - **AC-148 (P1) [unit]** Pass A text is held in memory only. After a reload or on reopening a recent check it is gone (`copy.adv.notesNotStored` is shown), and it is never stored in Judge Mode or in any IndexedDB or localStorage key.
  - **AC-149 (P0) [unit]** An automatic retry resends a request with a byte-identical body. Retry counts follow the policy above. No retry path exists for declines or blocks (see also AC-303).

### SCR-09 Referee and verdict card · P0 (W4)
- **Referee:**
  - status `copy.ref.running`, with the badge `ON-DEVICE · Gemini Nano` or `RULES-ONLY` (`copy.ref.rules`). "Distances computed by code" is always shown.
  - **Input:**
    - claims: pass-B inferences `{id, kind, value}`, plus hypotheses as `{id: "h1", kind: "area", value: label}` (at most 12 claims);
    - vault items `{id, kind, label}`: labels only; pin items as kind plus label, **never coordinates**; generic or empty labels skipped (D-36); at most 20 items.
  - The output schema is built at runtime with enums of the claim IDs and vault IDs (D-09).
  - The device result is **unioned** with the rules referee (§10.3), keeping the stronger strength for each pair. The HUD tags this `+rules`.
  - The rules-only fallback is in §10.3.
  - If either the claim list or the vault list is empty, the device call is skipped, because an empty enum is invalid.
- **Verdict card layout** (an example for the Judge Mode doorstep scene; the real lines are whatever the app produces):
  ```
  RED   A stranger could find you from this photo
   [!] Linked to your WORKPLACE (City General Hospital)   likely · attacker confidence high   [Why?]
   [!] HOME: within 1 km (neighbourhood)                   attacker confidence medium          [Why?]
   [lock] CHILD'S NAME: caught and masked on this device (never sent)
   Not linked: CAR PLATE
   Attacker's best guess: neighbourhood level · attacker confidence medium
   Referee: ON-DEVICE (Gemini Nano) 1.3 s · Distances: code
   [Fix it on this device]   [Export as is]
   The cloud never learns whether it was right.
  ```
  - Vault labels appear in muted text after the kind. The Settings toggle "Show vault labels in results" (P1) can hide them; they are on by default.
  - **Why?** expands to show:
    - the supporting clue IDs, highlighted on the image;
    - the referee's reason (≤12 words);
    - an "Explain" button (SCR-16).
- **Lines and colours:** computed by code (§10).
- **States**
  - (a): Nano referee.
  - (b) and (c): rules referee (`copy.ref.rules`).
  - (d): a verdict exists only if pass B already exists. A queued session shows "Waiting for the cloud check".
  - (e): header `copy.verdict.partial`.
    - Lines come only from on-device findings: caught items as TEAL, and flagged pre-screen clues as "Found on this device: street sign, lanyard…".
    - No bands.
    - **Fix** is offered (rules over the pre-screen clues).
    - **Re-attack is hidden** (D-18).
  - Empty vault: the lines are replaced by the best-guess line plus `copy.verdict.noVault` and an "Add places" button.
- **ACs**
  - **AC-160 (P0) [unit]** The verdict engine (§10) passes `shared/testvectors/verdict.json`. It covers every band, every strength, an empty vault, refused, echo, caught, and "Risk reduced" true and false.
  - **AC-161 (P0) [unit]**
    - Referee output is validated against the runtime enums.
    - Unknown IDs or strengths are dropped.
    - Invalid output falls back to the rules referee, and the HUD shows `fallback: invalid output`.
  - **AC-162 (P0) [unit]** The referee prompt contains no coordinates. A fixture scan looks for number patterns resembling the vault's lat/lng.
  - **AC-163 (P0) [e2e] [video]** The demo verdict shows at least one RED line while the Ledger counters read `Faces sent: 0 · Vault items sent: 0`, and `copy.verdict.neverLearns` is visible.
  - **AC-164 (P0) [manual]** Every line that reports an attacker guess shows a confidence: the attacker confidence of the band's hypothesis for a pin line; strength plus the claim's attacker confidence for a match line; strength, the claim's attacker confidence and the band hypothesis's attacker confidence for a combined pin + match line; and the attacker's confidence on the best-guess line. Lines that report an on-device finding (echo, caught, found on this device) show no confidence and are labelled "found on this device" (D-127).
  - **AC-165 (P0) [unit]** The rules referee (§10.3), against the vault work label "City General Hospital":
    - an inference "hospital staff lanyard logo" (kind workplace) gives `likely`;
    - an inference value "City General" gives `exact`;
    - an inference "a primary school in the north of the city" against the school label "St. Mary's Primary" gives `possible`.
  - **AC-166 (P0) [e2e]** With an empty vault, the verdict shows the best-guess line and `copy.verdict.noVault`, with no errors.
  - **AC-167 (P0) [unit]** A `work_pin` labelled "City General Hospital" is a referee VAULT item (kind plus label, no coordinates). A `home_pin` labelled "Home" is not.
  - **AC-168 (P0) [unit]** The same `verdict.json`, `referee.json`, `fuzzy.json`, `bands.json` and `box2d.json` vectors pass in both Vitest and XCTest.

### SCR-10 Gate block toast · P0
- **Look:** a red toast with `role="alert"` that stays until dismissed (at least 6 s). The text names the item (§7.2).
- **Actions:** **Dismiss**. **Show me** (P1) highlights the offending area and opens the mask editor with that item selected.
- **Ledger:** a BLOCKED entry. The counters stay at 0 · 0 and the "Blocked" counter goes up by one.
- **States:** the same in every state. In (d) the toast can still appear for local checks such as the export check.
- **ACs**
  - **AC-180 (P0) [e2e] [video]** Covered by AC-041.
  - **AC-181 (P0) [unit]** For a vault hit, the toast shows the OCR text exactly as read, in quotes. The Ledger stores only `{vaultItemId, kind}`.
  - **AC-182 (P1) [e2e]** **Show me** selects the right item.

### SCR-11 Fix, re-attack and before/after · P0 (W5, C3)
- **Fix:**
  - **Fix it on this device** runs the fix planner (S0). As built (D-142, D-179) it is `deterministicFix`, always plain code on the device, labelled `BUILT-IN · code`; the model planner described below (input, output, explanation) is not built.
  - **Input:**
    - clues `{id, type, region, reveals, evidence, severity, removable}`: every removable clue, plus the non-removable clues cited by a match or by the closest-band hypothesis, so the planner can pick a crop side (D-64);
    - matches `{claim, what it points to (generic phrase), strength, clue_ids}`;
    - the closest band per pin, computed in code.
    - No private labels go into the planner prompt.
  - **Output:** `{mask[], crop, explanation, expected_residual}`. `mask` is a runtime enum of the removable clue IDs. If there are none, skip the call and use the rules plan.
  - **Plan card** (`copy.fix.title`):
    - the masks to add, each with its type and ID, highlighted on the image;
    - the optional crop side;
    - the explanation (≤2 sentences, ≤40 words, using generic phrases such as "your workplace", never vault labels);
    - "Expected after fix: {level}".
  - Buttons: **Apply fix** · **Adjust** (toggle individual masks) · **Cancel**.
  - The code plan (`copy.fix.rules`) is §10.4.
  - Non-removable clues cited by red or amber lines show `copy.fix.unremovable`.
- **Apply:**
  - Solid fills animate in.
  - Boxes come from pass B's `box_2d`, mapped to the master with 15% padding (`mask_pad_ratio`, at least 4 px).
  - Where a pass-B clue overlaps OCR words of the same text (IoU > 0.3), the union of the OCR boxes is used instead, because OCR boxes are tighter.
  - **Crop (D-35):** the minimal crop from the chosen side that removes every targeted box, capped at 40% of that dimension. If more would be needed, show `copy.fix.cropTooMuch`.
  - The fixed image is re-OCR'd and must have **0 vault hits**. Otherwise masks are added and the check repeats, up to 2 times, then a warning is shown.
- **Re-attack:**
  - **Re-attack the fixed photo** (`copy.fix.reattack`) opens the consent sheet (new image, with the diff line).
  - Then pass A runs (if enabled; Settings "Notes on re-attack", on by default) together with pass B, then the referee again.
- **Compare:**
  - Shows **Before** and **After** for each line, for example "HOME: within 1 km → same country".
  - The header is GREEN `copy.verdict.reduced` when the rule in §10.6 holds; otherwise `copy.verdict.still`.
  - The **receipt** line `copy.receipt.line` sits under the compare view.
- **Limits:**
  - At most `max_fix_rounds` (3) fix-and-re-attack rounds per photo.
  - Each re-attack counts toward the daily cap.
- **States**
  - (a): Nano plan.
  - (b) and (c): rules plan.
  - (d): Fix works; the re-attack is queued (SCR-18).
  - (e): Fix uses the pre-screen clues, and re-attack is hidden.
- **ACs**
  - **AC-190 (P0) [unit]** Plan validation:
    - mask IDs ⊆ removable IDs;
    - `crop` is in its enum;
    - the explanation contains no vault string (scanned; on failure, the template explanation is used);
    - `expected_residual` is in its enum, then recomputed in code (D-51) from the masks actually applied; the code value is the one shown (D-64);
    - if an exact or likely target has none of its removable clues masked, the rules masks for that target are added and the HUD shows "rules added k masks";
    - an empty plan while red lines exist is replaced by the rules plan.
  - **AC-191 (P0) [unit]** The rules plan masks exactly the removable clues cited by matched claims, or by the hypothesis that gives the closest pin band (district or closer).
  - **AC-192 (P0) [unit]** `box_2d` `[100, 250, 500, 750]` on 800×600 maps to `{x: 200, y: 60, w: 400, h: 240}` before padding. Padding and clamping are tested (`shared/testvectors/box2d.json`).
  - **AC-193 (P0) [e2e] [video]** The demo flow: Fix, Apply, Re-attack, then the compare view showing "Risk reduced" and the receipt line, with real numbers.
  - **AC-194 (P0) [unit]** "Risk reduced" appears only when §10.6 holds. A fixture with no improvement gives `copy.verdict.still`.
  - **AC-195 (P0) [e2e]** A 4th round is refused with `copy.fix.maxRounds`.
  - **AC-196 (P1) [unit]** The crop computation removes the targeted boxes and respects the 40% cap (vectors in `shared/testvectors/crop.json`, including a rules-plan case where every cited clue is non-removable).
  - **AC-197 (P0) [manual]** The explanation never contains a vault label or the word "safe".
  - **AC-198 (P0) [unit]** The fixed image passes the re-OCR check: 0 vault hits.

### SCR-12 Export and share card · P0 export, P1 share card (W6)
- **Built Nov 28 (D-185), web and iOS:** "Save a covered copy" is an inline card under the verdict, under the compare view and (as "Just clean and export", no cloud check) in the pre-screen, not a separate stepper step. Web: the export frame (master size, q 0.92) goes through the consent dry run's readers with nothing spared (every face or vault word still found is solid-masked first; a reader failure offers nothing); the exact bytes are shown, then Web Share (files) or a download. iOS: master + masks + crop, JPEG q 0.92, `EgressGate.precheck` (local Vision faces, OCR vault words, metadata); offered only when it passes; `ShareLink`. A caution shows when the latest guess is still within 5 km of a pin. D-187: the covered copy is capped at the attacker copy's size (RC cloud_image_max_px, 1536 by default; web `coveredCopyMaxPx`, iOS `ImagePipeline.cloudFrame`), so it never carries more detail than was checked. The share card (P1) is not built.
- **Export the cleaned photo (P0):**
  - The master plus all masks (and the crop), re-encoded as JPEG at quality 0.92 at master resolution (≤2048 px).
    - P2: original resolution up to 4096 px, with the masks scaled.
  - **Export check** before the download: no APP1 or APP13, no GPS, 0 faces, 0 vault OCR hits.
    - On failure, the gate toast (SCR-10) appears and nothing is exported.
    - On success, show `copy.export.check`.
  - The filename is `strangers-eyes-<6 random chars>.jpg`. The original filename is never reused.
  - Download, or the Web Share API (`navigator.share({files})`) where it is supported.
- **Share card (P1).** Drawn on a canvas as a 1080×1350 PNG with no EXIF. It uses only allowlisted template strings, numbers, band words and clue **type** names:
  - the headline: `copy.share.headlineNear` when the worst "before" band was neighbourhood or closer, otherwise `copy.share.headline`;
  - "Before: {worst band words} · After: {worst band words}";
  - "{n} clues found · {m} masked on my device";
  - icons for the clue types;
  - the footer `copy.share.footer` plus the hosted URL.
  - It **never** includes the photo, any area or place label, vault labels, clue evidence text, or coordinates.
- **States:** the same in every state. In (e), the share card uses the pre-screen counts and omits before/after.
- **ACs**
  - **AC-260 (P0) [unit]** The exported JPEG passes the gate's image checks. Fixture: the export of a masked "LUCAS" image gives 0 OCR vault hits.
  - **AC-261 (P1) [unit]** Share-card text is assembled only from the allowlist. A test injects vault labels, area labels and evidence text, and asserts that none of them appear in the rendered strings.
  - **AC-262 (P0) [e2e]** The exported filename never contains the original filename.
  - **AC-263 (P1) [manual]** Web Share works in Chrome on macOS, with a download fallback elsewhere.

### SCR-13 Cloud Ledger · P0
- **Counters**, at the top and always visible:
  - `Faces sent: {f} · Vault items sent: {v}`. These come from the gate's re-checks on payloads that were actually sent, so by construction they stay 0. The panel says "checked on every request".
  - `Images: {unique} · Requests: {n} · Bytes: {kb}`.
  - `On-device AI calls: {k} · Rules-only fallbacks: {r} · Blocked: {b}` (D-179).
- **Entries**, newest first, per session, with a session filter. Each entry shows:
  - time · job (friendly name) · class · requested mode · route badge;
  - engine or model · raw `inferenceSource` value · latency;
  - bytes out (0 for on-device and rules) · prompt version;
  - gate checks (✓ class ✓ metadata ✓ faces 0 ✓ vault OCR 0 ✓ prompt scan);
  - grounded y/n, with the count of search queries (P1);
  - outcome: ok, blocked with its reason, error code, or queued.
  - Tapping an entry that carries an image opens SCR-15 for that exact payload.
- **Receipt:**
  - **Copy receipt** (P0) puts text on the clipboard. **Download receipt** (P1) saves JSON.
  - Both are built from entries with **no vault strings, no coordinates and no images**; hashes only.
- **Also listed:** Leak Atlas increments (P1), as "Counter (Firestore) · street_sign +1 · no image, no vault".
- **Footer:** `copy.ledger.otherTraffic`.
- **Storage:**
  - Unsealed, in its own IndexedDB database `se-ledger` (ARCHITECTURE §16.3), keeping the last 500 entries. Entries hold only IDs, kinds, hashes and numbers, never vault strings, coordinates or pixels (AC-045). Never uploaded.
  - Cleared by "Clear history" and by Burn vault (D-31).
- **States:**
  - (d): QUEUED entries are shown.
  - Judge Mode: entries are tagged `S4 sample` and kept apart from real sessions.
- **ACs**
  - **AC-210 (P0) [unit]** Every gate call writes exactly one entry with all the P0 fields above.
  - **AC-211 (P0) [e2e] [video]** After the full demo loop:
    - the counters read 0 · 0;
    - Images is 2;
    - Requests is 4 (A + B, twice), or 2 with grounding off;
    - the on-device call count matches the HUD.
  - **AC-212 (P0) [unit]** The exported receipt contains no vault strings (as AC-045).
  - **AC-213 (P0) [manual]** At widths of 1024 px or more, the Ledger is visible next to the verdict without scrolling the page.

### SCR-14 Router HUD · P0
- **Collapsed:** a pill showing the last entry, for example `referee › ON-DEVICE (Gemini Nano) 1.3 s`.
- **Expanded:** two tabs.
  - **Calls:** a log (`role="log"`), newest at the bottom.
    - Line format: `{time} {job} [{class}] › {ROUTE} ({engine}) {latency} {bytes}`.
    - Event lines: `BLOCKED`, `QUEUED`, `CACHED`, `RECLASSIFIED S2→S0`, `fallback: model downloading`, `fallback: no on-device model`, `policy rejected`, `+rules`.
    - Tier-0 steps (metadata, MediaPipe faces, Tesseract text, vault match) make no model call and are not HUD entries; the pre-screen list shows them as `BUILT-IN` (D-179).
  - **Policy:** the S0–S4 table as loaded (AC-026), the capability state, and the model names and prompt versions.
- **Routes:** `ON_DEVICE`, `IN_CLOUD`, `RULES_ONLY`, `BLOCKED`, `QUEUED`, `CACHED`. For S2 and S4, the route comes from `response.inferenceSource`, not from the mode.
- **Visibility:** shown by default. It can be hidden in Settings (P1), and always stays visible in Judge Mode.
- **ACs**
  - **AC-220 (P0) [unit]** Every Ledger entry produces a HUD line. For S2 and S4, the route comes from `inferenceSource`.
  - **AC-221 (P0) [manual] [video]** In state (c), an S2 explanation shows `IN_CLOUD` with the tag `fallback: no on-device model`. In state (a), it shows `ON_DEVICE`.
  - **AC-222 (P0) [manual]** The HUD never covers the primary action buttons at 375 px. Collapsed, it is at most 40 px high.

### SCR-15 "What the cloud saw" toggle · P0
- A segmented control on the photo viewer: **Your view | What the cloud saw**.
  - It shows the exact JPEG bytes of the most recent S3 send for this session, decoded from the stored blob, never re-rendered from the masks.
  - A selector for earlier sends (Attack 1, Re-attack 1, …) is P1.
  - It shows the prompt ID and version, with the full prompt text in a disclosure, plus the model, time and byte size.
- Before anything has been sent: `copy.cloudSaw.empty`.
- It can also be opened from Ledger entries and from the consent preview.
- **ACs**
  - **AC-230 (P0) [unit]** The displayed blob's sha256 equals the Ledger entry's hash.
  - **AC-231 (P0) [manual] [video]** After the gate-block demo, the toggle still shows only the masked copy from the last successful send.

### SCR-16 Clue explainer · P0 (W8, S2)
- **Trigger:** "Explain" on any clue, from the pre-screen, the adversary or the verdict.
- **Payload rules (critical):**
  - **Pre-screen clues** (read from the original, on the device): send only the clue **type and region**. `EVIDENCE` is a template phrase built from those two, for example "a street sign in the top left of the photo". **Never** send text read on the device.
  - **Adversary clues** (pass B): send the type, pass B's `evidence` and the level it `reveals`. All of these were produced by the cloud.
  - The prompt is `explain.v1` (text in ARCHITECTURE §10.11): two sentences, ≤45 words, why this kind of detail narrows down a location plus one simple way to hide it. Instructions go in the user turn (D-04).
  - The vault-string scan runs first. A hit reclassifies the call to S0 (D-15).
- **Route:**
  - `PREFER_ON_DEVICE`: on Nano if it is available; otherwise the SDK falls back to `explain_cloud_model` in the cloud.
  - Offline and without Nano, or with the kill switch on and no Nano: the built-in sentence for the clue type (`shared/prompts/explain-fallback.v1.json`), shown as RULES-ONLY.
- **UI:** a popover with the text, a route badge and the latency. Cached per clue for the session.
- **ACs**
  - **AC-235 (P0) [unit]** For a pre-screen clue with text "123 ELM", the outgoing payload contains neither "123" nor "ELM".
  - **AC-236 (P0) [manual] [video]** The same click shows `ON-DEVICE` in state (a) and `IN CLOUD` in state (c), the SDK's real fallback.
  - **AC-237 (P0) [unit]** Offline and without Nano, the template is used and no SDK call is made.
  - **AC-238 (P0) [unit]** An evidence string that contains a vault label gives `RECLASSIFIED S2→S0`: Nano if it is available, otherwise the template. No cloud call.
  - **AC-239 (P0) [unit]** The model's explanation is shown only after it completes and passes the copy check (no "safe", no guarantee words: ARCHITECTURE §10.11). Otherwise the template is shown.

### SCR-17 Judge Mode · P0
- **Entry:** the Home card, the SCR-02 button, `#/judge`, or `?judge=1`.
- **Fake vault.** It lives in memory only. The real vault is never unsealed (D-37). Its pins come from `web/public/samples/manifest.json`, rounded to 3 decimals (D-26).
  - `home_pin` labelled "Home" (a generic label, not a vault string), at a public building near sample 1;
  - `work_pin` labelled "City General Hospital" (fictional name), at another public place;
  - `child_name` "Lucas";
  - `plate` "SE 1234".
- **Three staged scenes [USER shoots them].**
  - **Rules for every scene:**
    - people-free;
    - public places only, a few km or more from the builder's home and work (D-26);
    - fictional props;
    - no readable real third-party logos;
    - EXIF stripped before committing.
  - **Scenes:**
    1. **Doorstep-style public entrance.**
       - Props: a backpack with a fictional "LUCAS" name tag; a lanyard with a fictional logo and the generic printed words "HOSPITAL STAFF" (D-39) hung on a railing or hook; a street sign and a bus stop in the background.
       - Expected: CHILD'S NAME caught on the device (TEAL); WORKPLACE "Linked" (`likely`, RED); a HOME band.
    2. **Marketplace listing:** an item for sale in a **non-residential** interior with a window view onto a street. Expected: a window-view clue; a HOME band; a crop suggestion if the view can't be masked.
    3. **Creator:** an outdoor café table, a fictional-brand cup, a transit sign in the background. Expected: a transit-line inference; a band to the WORK or HOME pin.
  - Expected outcomes go into `samples/manifest.json` **only after 10 pre-tests per scene**, and only outcomes actually observed are written there.
- **Flow:**
  - Pick a sample (or **Run all**, P1).
  - Autoplay (default from RC `judge_autoplay_default`) advances each step with **coach marks** (`copy.judge.coach.*`) that explain what ran where.
  - **Prove it offline** (D-182; off by default; read once when a sample starts): the attacker's first answer is held, unchecked, on the Verdict step (`ui.seal.*`). "Open it offline" is enabled only while `navigator.onLine` is false; opening runs the guess check with no network (Nano if ready, else simple rules; the gate's offline path never uses the cloud) and shows a stamp of the Cloud Ledger's counts for this session while the connection was off (on-device calls, simple-rules checks, cloud AI calls). "Open it now" checks it the usual way, with no stamp. Autoplay waits at the seal, and after an offline open waits for the connection before the next step. The app's own "Simulate offline" setting does not count as offline here.
  - The consent sheet confirms automatically after 3 s in autoplay.
  - **Target:** red to green in **≤90 s per sample (goal: about 60 s)** on a judge's laptop without Nano, measured warm. For the cold start, see AC-067.
- **Routing:**
  - The pre-screen, vault-text match (if built), referee, fix and explainer on samples run as **S4** (`PREFER_ON_DEVICE`), so the cloud fallback is visible.
  - The adversary runs as **live S3**. Pass A is never cached (D-12).
  - Judge Mode **shares the daily cap counter** with real checks.
  - If the live adversary is unavailable (offline, kill switch, cap, App Check or auth failure, HTTP 400, or 429 after its retries) and `judge_cached_fallback` is true:
    - use the **cached pass-B fixture**, with the badge `CACHED SAMPLE` and `copy.judge.cached`;
    - pass A shows `copy.judge.notesNeedLive`.
- **Exit:** **Exit Judge Mode** discards the fake vault and the sample sessions (which are never persisted) and returns to Home.
- **States**
  - (a): S4 steps run ON-DEVICE.
  - (b) and (c): S4 steps run IN CLOUD, with honest badges.
  - (d): S4 steps run ON-DEVICE or RULES-ONLY, and the adversary is CACHED.
  - (e): if a sample is refused live, show the (e) UI and offer **Use recorded result** (the cached pass B, labelled). This is not a retry of the model.
- **ACs**
  - **AC-240 (P0) [e2e]** On a fresh Chrome profile with no Nano, against the hosted URL: `?judge=1` → sample 1 → the whole check (pre-screen, attack, verdict, fix and re-attack where a fix exists) reaches its final verdict in ≤90 s, with no manual input beyond starting it (autoplay). D-161 (user, Nov 23): the verdict is whatever the attacker really does; with the live recordings sample 1 ends "Still exposed", never a forced green.
  - **AC-241 (P0) [unit]** Entering Judge Mode never reads or unseals the real vault. Exiting leaves the real vault byte-identical. *(Narrowed by D-80:)* the one exception is boot, in either mode: it may read the `burn-pending` marker in `se-vault-keys` (only if that database exists; it never creates one) and, if a Burn vault the user started was interrupted, finish deleting it. It never reads the vault record or the key.
  - **AC-242 (P0) [unit]** An S4 call with a non-sample image, or with the real vault, is BLOCKED (AC-023).
  - **AC-243 (P0) [e2e]** With the network offline, Judge Mode completes using the CACHED pass B, and every cached step carries a badge.
  - **AC-244 (P0) [manual]**
    - Sample images contain no people, no real homes or schools, no readable real-brand logos, and no EXIF (an exifr check in a test).
    - Sample pins are rounded to 3 decimals.
    - The [USER] acceptance (D-26) is logged in PROGRESS.
  - **AC-245 (P0) [unit]** Pass A output is never written to `samples/*` or to any cache.
  - **AC-246 (P0) [unit]** When the daily cap is reached in Judge Mode, the adversary step uses CACHED (with `judge_cached_fallback` on) rather than an error.

### SCR-18 Offline queue and PWA · P0 (persistent queue P1)
- **PWA:**
  - vite-plugin-pwa (`generateSW`) precaches the app, the MediaPipe wasm and models, the Tesseract core and language data, and the Judge Mode samples. That is about 31 MB plus samples; `maximumFileSizeToCacheInBytes` is 32 MB.
  - The capability panel shows `copy.cap.offlineReady` once precaching completes.
- **Queue (P0, in memory):**
  - Not built (T-084 deferred, D-163): offline, the button reads `ui.prescreen.queue` ("Cloud check needs a connection") and stays disabled. The original design: when offline, **Queue cloud check** keeps the session (master, masks, redacted JPEG) in memory with status `waiting` and shows `copy.queue.queued` plus `copy.queue.keepOpen`.
  - Home shows a **Waiting for connection (n)** list: masked thumbnail · time · **Remove**.
  - The Ledger records a QUEUED entry with no bytes.
  - On reconnecting, the banner `copy.queue.backOnline` appears with **Review and send**, which opens the consent sheet for the oldest item. A **new** consent token is issued. **Nothing is sent automatically** (D-17).
- **Persistent queue (P1):**
  - Queued items are sealed with the vault key in `se-sessions` (ARCHITECTURE §16.3) and survive a reload.
  - At most 5 items (`copy.queue.full`).
  - Items older than 7 days are purged at startup.
- **Offline elsewhere:**
  - RC is served from the cache (`ensureInitialized`); the HUD Policy tab shows "Cached".
  - Firestore writes are buffered and never awaited.
- **ACs**
  - **AC-250 (P0) [e2e]** After one online visit and service-worker activation, an offline reload runs Tier-0 OCR, face detection and the vault, with no network errors in the UI.
  - **AC-251 (P0) [e2e] [video]** Offline: queue a check, then go online. The banner appears within 5 s, and no S3 request is made until **Send this image** is clicked.
  - **AC-252 (P1) [unit]** Persistent queued items are encrypted at rest, a 6th item is refused, and items older than 7 days are purged.

### SCR-19 Burn vault · P0
- **Entry:** the Vault screen (two taps away) and Settings › Data.
- **Sheet:** `copy.burn.confirm`, plus a hold-to-confirm button (1.5 s) labelled **Burn vault**. Space or Enter also holds; releasing early, or leaving the button, abandons the hold. A screen reader's or switch's activation (a click with no press) opens an explicit second step, "Burn your vault now?" with **Yes, burn my vault** and Cancel; still no checkbox (D-99).
- **Order (D-31):**
  1. Delete the key record in `se-vault-keys`.
  2. Delete the `se-vault-data` (vault), `se-sessions` (sessions and queue) and `se-ledger` (ledger) databases. There is no checkbox and no partial option (D-31).
  3. Clear in-memory session state.
  4. Show `copy.burn.done`.
- **Not deleted in time** (`BurnPendingError`, after the key is gone): a pending state with **Try again**, never `copy.burn.done`. It turns to `copy.burn.done` by itself once a later load finishes the burn (D-93).
- **Closed before the outcome** (Escape mid-burn, or a pending burn finishing later): the Vault screen shows the outcome as its status line, and the next open starts at the confirm step; a pending burn keeps its retry (D-99).
- The Tesseract cache in `keyval-store` is not touched. A new vault key is created only when the next item is added.
- **Clear history** (Settings › Data) is separate: it deletes sessions and the ledger and keeps the vault.
- **ACs**
  - **AC-270 (P0) [e2e]** After burning, `#/vault` is empty, recent and queued sessions and the ledger are gone, and a new key is created only when the next item is added.
  - **AC-271 (P0) [unit]** The key is deleted **before** the data, so an interruption leaves nothing that can be decrypted.

### SCR-20 Settings and About · P0 (most toggles P1, D-33)

**Settings (P0):**
- **On-device AI:** status and the Download button (same as SCR-02); "Use Gemini Nano when available" (on).
- **Display:** "Technical details" (**off** by default; Nov 24 judging feedback). Off, the UI uses plain words: no
  privacy-class codes (S0–S4), prompt versions, sha256 prefixes, raw model ids, gate/error codes, "Tier-0", "pass B"
  or "referee" (the HUD, Cloud Ledger, "What the cloud saw", consent meta, clue list, attack panel, lanes, verdict
  "Why?", SCR-02 table and About table). On, today's full detail. The route badge and latency show for every AI call
  either way.
- **Usage:** "Cloud checks today: {used}/{daily_adversary_cap}" with `copy.settings.capNote`.
- **Data:** Burn vault; Clear history; Copy ledger receipt.

**Settings (P1):**
- **Privacy:** pre-mask mode (Standard/Strict); "Show vault labels in results" (on); "Include live search notes" default (on); "Notes on re-attack" (on).
- **Display:** Router HUD (on); Ledger rail (on).
- **Community:** Leak Atlas opt-in (off), SCR-21.
- **Developer** (shown with `?debug=1`, and while a simulation is on so it can be turned off; D-104): "Simulate: no Nano / offline" (downgrade only, AC-006); show RC values and their source; force an RC fetch. "Simulate: no Nano" shows state (c) exactly as a browser without the Prompt API does (`copy.cap.nanoNone`, the Chrome how-to, Rules-only, no Download button); "Use Gemini Nano" off keeps its own (c) line. "Simulate: offline" shows (d). This is what AC-072's simulation check expects (D-117).

**About (P0):**
- the version and commit;
- `copy.about.notGuarantee`;
- `copy.about.howItWorks`;
- a "What leaves this device" table (S0–S4 in plain words);
- the re-attack disclosure `copy.about.reattackDisclosure` (D-24);
- third parties: App Check loads Google reCAPTCHA Enterprise; the libraries and licences (MediaPipe, Tesseract.js, traineddata, exifr, idb-keyval) as listed in THIRD_PARTY_NOTICES;
- prior art (E11, E12);
- the 18+ notice;
- `copy.about.support` (neutral, not country-specific);
- the repo link.

**ACs**
- **AC-275 (P0) [e2e]** Every implemented setting persists across a reload (localStorage, inside try/catch), and the app still works when storage throws.
- **AC-276 (P0) [manual]** About shows each of the items listed above.
- **AC-277 (P0) [unit]** With "Use Gemini Nano" off, every S0/S1 job runs RULES-ONLY, and S2/S4 run as `ONLY_IN_CLOUD`, shown as `IN_CLOUD (Nano off)`.

### SCR-21 Leak Atlas · P1
- **Opt-in:** a Settings toggle (default **off**), plus a one-time prompt after the first verdict (`copy.atlas.optIn`).
- **What is written (D-11):**
  - When pass B r1 returns `ok`: for each **distinct clue type** in it, `setDoc(doc(db, 'atlas', weekId, 'clues', clueType), {n: increment(1)}, {merge: true})`, fire-and-forget.
  - Nothing else. Re-attacks write nothing, and there are no outcome counters (band, precision, fix or `declined`).
  - `weekId` is the ISO week, `YYYY-Www`.
- **Never written:** images, coordinates, bands, outcomes of any kind (band, precision, fix or declined), referee output, fix choices, vault data, per-photo documents, or timestamps finer than the week.
- **Rules:**
  - the clue type must be in the 18-type whitelist; every other path, including `atlas/{weekId}/outcomes/*`, is denied;
  - `n` may only increase by 1;
  - no deletes;
  - reads are public;
  - writes require a signed-in user (anonymous counts).
  - The rules are tested in the emulator; the copy lives in the repo.
- **Display:** a Home card, "Most common giveaways this week", with the top 5 types and their counts. If the total is under 20, show `copy.atlas.notEnough`. Offline, show cached values.
- **ACs**
  - **AC-280 (P1) [unit]** With the opt-in off, no Firestore write happens. With it on, writes happen only for the distinct clue types of pass B r1, and a re-attack writes nothing.
  - **AC-281 (P1) [e2e]** The rules emulator suite passes: whitelist, +1 only, no extra fields, no deletes, auth required, bad week ID rejected.
  - **AC-282 (P1) [unit]** No Atlas write is derived from referee, band, fix or vault data. A static check confirms that the Atlas module imports nothing from the verdict, referee, geo or vault modules.
  - **AC-283 (P1) [unit]** The whitelist in `firestore.rules` equals `CLUE_TYPES` in `shared/prompts/enums.v1.json`, by a test.
  - **AC-284 (P1) [unit]** No outcome counter exists. The rules emulator rejects any write under `atlas/{weekId}/outcomes/`, and a re-attack (r2 or later) produces no Atlas write.

### SCR-22 System banners and error states · P0

| Condition | Banner / behaviour | Copy |
|---|---|---|
| RC `kill_switch = true` | No S3. S2 and S4 use the device or the template. Judge Mode uses CACHED. Applied in real time via `onConfigUpdate`. | `copy.err.killSwitch` |
| Daily cap reached (`daily_adversary_cap`, local counter per installation, per local day; a soft, client-side cap) | No S3 until midnight. Judge Mode uses CACHED. | `copy.err.dailyCap` |
| App Check token failure, 401 or 403 | No cloud. Everything on the device still works. | `copy.err.appCheck` |
| HTTP 429 or the per-user limit, after retries | Try again after 60 s | `copy.err.rateLimit` |
| HTTP 400 | Cloud step fails; recorded in the Ledger as a bug; no retry | `copy.err.cloudFailed` |
| Network error mid-call, after retries | Try again is offered; nothing is queued (D-163) | `copy.err.network` |
| Anonymous sign-in failed | Treated like an App Check failure for cloud calls | `copy.err.auth` |
| S0/S1 tripwire or BREACH (AC-022) | A persistent red banner; the session is RULES-ONLY; the cloud is off until reload | `copy.gate.tripwire` |
| Unsupported browser (no WebAssembly or IndexedDB) | A full-page message | `copy.err.browser` |

- **Precedence (D-105):** while the cloud is off, one banner only, the most severe: tripwire > kill switch > App Check > sign-in > daily cap. The per-call rows (429, 400, network) show only while the cloud is on and can be dismissed; the 429 banner clears itself after 60 s, and they are dropped when the cloud goes off, so they never reappear when it returns (D-117). The header chip and SCR-02 row 3 follow the same reason. The daily-cap banner and chip clear at local midnight, also with the page left open (D-117).
- **AC-290 (P0) [e2e]** Each condition, produced by a mock or an RC override, shows its copy and leaves the on-device features working.
- **AC-291 (P0) [unit]** Firebase initialises in the order `initializeApp → (debug flag, DEV only) → initializeAppCheck → getAuth → getAI`, asserted by a test. Every cloud call awaits `ensureAuth()` (bounded at 5 s, retried on the next call; no UID → `CLOUD_AUTH`, D-110).
- **AC-292 (P0) [manual]** On the hosted URL, AI Logic requests carry `X-Firebase-AppCheck` (seen in DevTools), and the console's App Check APIs tab shows AI Logic as **Enforced** [USER confirms].

---

## 10. Verdict logic (deterministic code, both platforms)

### 10.1 Distance and bands (D-10)
- For each pin vault item `p` and each hypothesis `h` (with `audit_status` ok; at most 3):
  - `d = haversine(p, h.lat/lng)`, with R = 6,371,008.8 m;
  - `e = max(d, h.radius_km × 1000)`.
- `e_p` is the minimum of `e` over all `h`. `conf_p` is the confidence of the hypothesis that gives `e_p`.
- Band thresholds come from RC `bands_m`:

| Band | e ≤ | Verdict words | Line severity |
|---|---|---|---|
| street | 250 m | "within 250 m (street level)" | HIGH (red) |
| neighbourhood | 1,000 m | "within 1 km (neighbourhood)" | HIGH (red) |
| district | 5,000 m | "within 5 km (district)" | MEDIUM (amber) |
| city | 30,000 m [placeholder, U-35] | "same city area" | INFO (grey) |
| country | 500,000 m [placeholder, U-35] | "same country or region" | NONE (not shown in risk lines) |
| none | beyond that, or no hypotheses | "not located nearby" | NONE |

The city and country thresholds are placeholders; winner-spec only said "same city/country". Confirm or adjust them after the benchmark and record a D-entry. **D-77:** the street, neighbourhood and district thresholds are locked (250 / 1,000 / 5,000 m) because the verdict words name them; RC may tune only city and country, and any other `bands_m` falls back to the defaults. The words live in `shared/strings/en.json` as `ui.band.<band>`, verbatim. "Never metres" means never a *measured* distance: the fixed thresholds in the words are allowed. On a tie in `e`, the adversary's earlier hypothesis gives `conf_p`.

### 10.2 Matches
- For each vault item, one line, using its strongest match across all claims:

| Strength | Wording | Severity |
|---|---|---|
| exact | `copy.verdict.exact` ("Identified your {KIND} by name") | HIGH |
| likely | `copy.verdict.likely` ("Linked to your {KIND}") | HIGH |
| possible | `copy.verdict.possible` ("Could point to your {KIND}") | MEDIUM |

- A pin item with both a match and a band gets one combined line ("{match wording} · {band words}"). Its severity is the higher of the two.
- **Caught:** a vault item masked before upload (by Tier-0 or Nano) gives a TEAL line, `copy.verdict.caught`. Caught lines do not count toward risk.
- **Echo:** a vault string found in pass B's free-text fields (`scene_summary`, `decline_reason`, clue `evidence`, hypothesis `label`, inference `value`; never enum values or IDs, D-65) gives a HIGH line, `copy.verdict.echo`.
- **Not linked:** text items with no match and pins in band `country` or `none` are summarised in one grey line, `copy.verdict.notLinked`.
- **Device and rules matches (D-90, D-157, D-168):** the device referee's matches and the §10.3 rules matches are merged per (claim, vault item) pair, keeping the stronger. A device match that no rules match supports is capped at `possible` (D-157). Exception (D-168): a device-only link between a place guess (claim kind `area`) and a pin (home, work, school or place pin) is **dropped**, not capped: whether a guessed place is near a pin is geometry, and the distance bands (§10.1) already show it (invariant 5). Any rules evidence for the pair keeps it, and the device may upgrade it as before. HUD notes: `device-only: capped at possible`, `device-only place × pin: dropped (bands decide)`. Vectors: `shared/testvectors/referee.json` (both platforms).
- KIND display names are in §17.3.

### 10.3 Rules-only referee
Apply the same normalisation as the vault matcher (SCR-06), on **every reading** the matcher builds for a text: spaced letters joined, each word with a possessive 's removed, and format characters read as spaces; the strongest result over the readings wins. Plate, house_number and phone use the SCR-06 digit match in image mode (a standalone 1–2 character value counts), since claims never leave the device. Then, for each claim *c* and each eligible vault item *v* (label or aliases; an item whose label is empty or generic is excluded with its aliases, and so is any generic alias) whose kinds are compatible (§17.4), take the first rule that holds:

1. **exact**
   - (a) the full normalised label (or an alias) appears as a whole-word substring of the claim; a one-token label or alias that is a generic word (for example "Hospital") never counts (D-101); or
   - (b) the claim contains a run of **≥2 consecutive label tokens** that includes at least one **non-generic** token. When every label token is generic (for example "City General Hospital"), any run of ≥2 counts. So "primary school" is not exact against "Northfield Primary School", while "City General" stays exact against "City General Hospital" (D-101).
2. **likely**
   - (a) the claim contains one **distinctive** label token (≥4 characters, not a generic word); or
   - (b) the label's acronym (≥3 letters, for example `cgh`) appears as a claim token; or
   - (c) claim and label share a **synonym class** (§17.5) **and** the claim contains an **artefact term** (the §17.5 artefact terms: logo, lanyard, badge, crest, uniform, scrubs, sign, signage, emblem, name tag).
3. **possible**
   - (a) they share a synonym class without an artefact term; or
   - (b) the kinds are compatible, the claim's confidence is high, **and** the claim shares at least one non-generic label or alias token with the item under the matcher's token rule (similarity ≥ `fuzzy_threshold`; tokens of ≤ 3 characters must be equal; generic words never count) (D-94). Without a shared token a confident claim never marks a vault item: geography is the distance bands' job. Plate, house_number and phone never reach (b) without a digit match.

Worked examples (these are the AC-165 vectors):
- "hospital staff lanyard logo" vs "City General Hospital": **likely**, via the hospital class plus the artefacts "lanyard" and "logo".
- "City General" vs the same label: **exact**, via a 2-token run.
- "a primary school in the north of the city" vs "St. Mary's Primary": **possible**, via the school class with no artefact term.
- "crest of St Mary's" vs "St. Mary's Primary": **exact**, via the 2-token run "st marys".

The generic-word list, synonym classes, artefact terms and word folds live in `shared/prompts/enums.v1.json` (`GENERIC_WORDS`, `SYNONYM_CLASSES`, `ARTEFACT_TERMS`, `WORD_FOLDS`; ARCHITECTURE §10.3), with vectors in `shared/testvectors/referee.json`.

### 10.4 Fix plan (code)
- **Targets** are:
  - every match that is exact, likely or possible;
  - for each pin whose band is district or closer, the hypothesis that gives it.
- **Mask** every removable clue cited by any target.
  - If there are no targets, mask every removable clue with severity high.
- **Crop (D-35):** `none`, unless every clue cited by some exact or likely target (or by the closest-band hypothesis) is non-removable. In that case, pick the side where the minimal crop removes all of those boxes within the 40% cap. If no side fits, use `none` and show `copy.fix.unremovable`.
- **Explanation:** from a template, using generic phrases only.
- **`expected_residual`:** the **finest** (most precise) `reveals` level among the clues left unmasked (`venue_or_organisation` counts as `street`), or `country` if none remain. nanoFix.v1 is given the same rule, and code recomputes it from the masks actually applied (D-51, D-64).

### 10.5 Overall level
- **RED** if any line is HIGH, otherwise **AMBER** if any is MEDIUM, otherwise **LOW** (`copy.verdict.low`).
- Empty vault, or a vault with no pin (no pin item that carries a pin): geography has nothing to measure against, so the level is the higher of the rule above and the **finest** level among the (at most 3) hypotheses (street or neighbourhood → RED, district → AMBER, otherwise LOW), shown with `copy.verdict.noVault` and "Add places" (D-127). A text-only vault with a street-level guess is therefore never LOW. The best-guess line still shows h1.
- Refused (state e): level **PARTIAL**, built from on-device findings only: caught lines, a found-on-device line and any echo lines (the echo scan runs on this device and covers `decline_reason`, D-115). A missing pass B, or one that is blocked, truncated or unreadable, is PARTIAL too.
- Headlines: RED `copy.verdict.red`, AMBER `copy.verdict.amber`, LOW `copy.verdict.low`, PARTIAL `copy.verdict.partial`.
- **GREEN is never an initial level.**

### 10.6 "Risk reduced" (after a re-attack)
"Risk reduced" is shown when **either** of these holds:
- after.level < before.level (ordering: RED > AMBER > LOW); **or**
- after.level == before.level, AND the worst pin band got coarser, AND the count of HIGH lines decreased.

**and** all of these hold (D-128): no vault item's worst line severity rose; the worst pin band did not get finer; both verdicts cover the same vault items (a vault changed between rounds, or emptied, is never "Risk reduced"). PARTIAL on either side is never "Risk reduced"; after a PARTIAL re-attack the header is `copy.verdict.partial`, and after a LOW result with no HIGH or MEDIUM line it is `copy.verdict.low`, never "Still exposed".

Otherwise show `copy.verdict.still`, naming the worst remaining line.
- Never show "safe".
- GREEN is used **only** for "Risk reduced".

### 10.7 Test vectors
`shared/testvectors/{bands,box2d,fuzzy,referee,verdict}.json` are the single source of truth for §10 and for the SCR-06 matcher. Vitest and XCTest both run them (AC-168).

---

## 11. UI copy catalogue (exact strings)

- All strings live in **`shared/strings/en.json`**, keyed by these IDs. The web loads it, and iOS bundles it as a folder resource.
- Placeholders use `{name}`.
- The per-type explanation fallbacks (`copy.explain.template.*`) live in `shared/prompts/explain-fallback.v1.json`.
- No user-facing string uses "safe" as a claim (AC-304).

| ID | Text |
|---|---|
| copy.app.tagline | See your photo the way a stalker's AI would, before you post it. |
| copy.app.oneLiner | The cloud plays the attacker. Your device holds the answers. The attacker never learns whether it guessed right. |
| copy.welcome.b1 | AI can work out where a photo was taken from the pixels alone, even with location data removed. |
| copy.welcome.b2 | Strangers' Eyes lets a cloud AI attack a redacted copy, then grades it on this device against what you need to hide. |
| copy.welcome.b3 | Your vault and your original photo never leave this device. |
| copy.welcome.age | I'm 18 or older, and I'll only check photos I took or own. |
| copy.cap.title | What runs where on this browser |
| copy.cap.invariant | Your vault and your original photo never leave this device, whatever this panel shows. |
| copy.cap.nanoReady | Gemini Nano is ready. Private checks run on this device. |
| copy.cap.nanoTextOnly | Gemini Nano is ready for text but not images in this browser. The photo pre-screen uses simple rules; checking the attacker's guesses uses Nano. The fix plan is always plain code. |
| copy.cap.nanoDownloadable | Gemini Nano can be downloaded (about 4 GB). Until then, private checks use simple rules. |
| copy.cap.nanoDownloading | Downloading Gemini Nano… {pct}%. Private checks use simple rules until it's ready. |
| copy.cap.nanoNone | No on-device AI in this browser. Private checks use simple rules (rules-only). Nothing private goes to the cloud instead. |
| copy.cap.assetsLoading | Loading the on-device checks (face and text readers)… {pct}% |
| copy.cap.cloudReady | Cloud attacker ready (Gemini via Firebase AI Logic). It only ever sees a redacted copy you approve. |
| copy.cap.cloudPaused | Cloud checks are paused right now. On-device checks still work. |
| copy.cap.cloudCap | You've reached today's cloud checks on this device. On-device checks still work. |
| copy.cap.appCheckFail | This copy of the app couldn't be verified, so cloud checks are off. On-device checks still work. |
| copy.cap.offline | You're offline. On-device checks work; the cloud attacker needs a connection. |
| copy.cap.offlineReady | Ready to work offline. |
| copy.vault.lock | Stays on this device. Never geocoded. Never uploaded. |
| copy.vault.howUsed | Only used on this device: to mask matching text before anything is sent, and to grade the attacker's guesses. |
| copy.vault.empty | Your vault is empty. Add the places and names a stranger shouldn't find. |
| copy.vault.genericLabel | A name like "Home" is only for display here. Add the place's real name (e.g. a workplace) if you want it matched. |
| copy.vault.pinHelp | Stand at the place and tap Pin. We read your location once, on this device, and never look up the address. |
| copy.vault.lowAccuracy | Low accuracy (about ±{m} m). Distance bands near this pin may be off. |
| copy.vault.pinDenied | Location permission was denied. Allow it in your browser settings, or enter coordinates you already know. |
| copy.vault.pinTimeout | Couldn't get a location. Try again, or enter coordinates you already know. |
| copy.vault.manualCoords | Enter coordinates as "latitude, longitude". We don't look up addresses. |
| copy.vault.full | Your vault holds up to 20 items. Remove one to add another. |
| copy.import.drop | Drop a photo, paste it, or choose a file. Photos stay on this device. |
| copy.import.noUrl | Only image files from this device. Links aren't supported, by design. |
| copy.import.heic | This browser can't open HEIC photos. Export it as JPEG and try again. |
| copy.import.tooLarge | This photo is too large (max 30 MB, 40 megapixels). |
| copy.import.unsupported | That isn't a photo this app can check (JPEG, PNG or WebP). |
| copy.import.gpsFound | This file carries GPS coordinates. They're removed before anything else happens. |
| copy.import.gpsNear | That GPS point is {band words} of your {KIND}. It has been removed. |
| copy.prescreen.rulesOnly | Rules-only pre-screen: no on-device AI in this browser. Faces, text and your vault are still checked here. |
| copy.prescreen.textOnly | On-device AI can't read images in this browser, so the photo pre-screen uses simple rules. |
| copy.prescreen.vaultHit | "{TEXT}" matches your {kind}. Masked on this device. |
| copy.prescreen.possible | Possible identifier: {type}. Not masked. You decide. |
| copy.prescreen.approximate | Approximate area: on-device AI saw a {type} here but couldn't pin it down. Draw a mask if you want it hidden. |
| copy.prescreen.people | People are in this photo. Faces are masked, but clothing and bodies stay visible. |
| copy.editor.warnVault | This matches your vault. The Egress Gate will block sending it. |
| copy.editor.warnFace | This is a face. The Egress Gate will block sending it. |
| copy.editor.confirmRemoveCell | Make sure "{TEXT}" is covered by another mask before removing this one. |
| copy.queue.queued | You're offline, so nothing was sent. The cloud check needs a connection; on-device findings still work. |
| copy.queue.keepOpen | Keep this tab open: queued checks aren't saved when you close it. |
| copy.queue.backOnline | You're back online. {n} photo(s) ready for the cloud check. |
| copy.queue.full | The queue holds 5 photos. Send or remove one first. |
| copy.consent.title | This, and only this, will be sent. |
| copy.consent.never | Never sent: your vault, your pins, the original photo, faces, or this app's verdict. |
| copy.consent.tierPaid | Analysed by Gemini through Firebase AI Logic on a paid tier: not used to train Google's models. |
| copy.consent.tierFree | Analysed by Gemini on Google's free tier: Google may use it to improve its products, and people may review it. |
| copy.consent.autoMasked | {n} more area(s) were found in the final check and masked automatically. |
| copy.consent.unmasked | {n} private item(s) you unmasked are still visible. The Egress Gate will block this send. |
| copy.consent.send | Send this image |
| copy.consent.cancel | Keep it on this device |
| copy.adv.running | The attacker is studying your redacted photo… |
| copy.adv.declined | The attacker declined; on-device findings only. We don't retry or rephrase when a model declines. |
| copy.adv.notesDeclined | The investigator declined to write notes. The structured check still ran. |
| copy.adv.notesOff | Live search notes aren't part of this version. Showing the attacker's structured findings. |
| copy.adv.notesNotStored | Live search notes aren't stored. These are the attacker's structured findings from that check. |
| copy.adv.noSignal | The attacker found no usable location clues in this photo. |
| copy.adv.truncated | The attacker's answer was cut off. Try again. |
| copy.adv.timeout | The attacker didn't answer in time. Nothing was queued; try again in a minute. On-device findings are still shown. |
| copy.ref.running | Checking the attacker's guesses against your vault… on this device |
| copy.ref.rules | Guesses checked by simple rules (no on-device AI). Your vault still stays here. |
| copy.verdict.red | A stranger could find you from this photo |
| copy.verdict.amber | This photo narrows things down |
| copy.verdict.low | Low exposure found. This isn't a guarantee. |
| copy.verdict.partial | Partial result: on-device findings only |
| copy.verdict.exact | Identified your {KIND} by name |
| copy.verdict.likely | Linked to your {KIND} |
| copy.verdict.possible | Could point to your {KIND} |
| copy.verdict.pin | {KIND}: {band words} |
| copy.verdict.caught | {KIND}: caught and masked on this device |
| copy.verdict.echo | The attacker read text matching your {KIND}. Fix it before posting. |
| copy.verdict.notLinked | Not linked: {KINDS} |
| copy.verdict.bestGuess | Attacker's best guess: {level} level · attacker confidence {confidence} |
| copy.verdict.noVault | Add your places to see how close this gets to you. |
| copy.verdict.neverLearns | The cloud never learns whether it was right. |
| copy.verdict.reduced | Risk reduced: {before} → {after} |
| copy.verdict.still | Still exposed: {line}. Try another fix, crop, or don't post this photo. |
| copy.gate.blockedVaultText | Blocked: '{TEXT}' would have left this device. |
| copy.gate.blockedFace | Blocked: a face would have left this device. Mask it first. |
| copy.gate.blockedMetadata | Blocked: photo metadata would have left this device. |
| copy.gate.blockedClass | Blocked: private data can't be sent to the cloud. |
| copy.gate.blockedPrompt | Blocked: one of your private items ({KIND}) was in a cloud request. |
| copy.gate.blockedConsent | Blocked: this isn't the image you approved. Review it again. |
| copy.gate.reclassified | Kept on this device: the request contained vault text. |
| copy.gate.tripwire | Stopped: a private step tried to reach the network. Private steps now use simple rules only, and cloud checks are off until you reload. |
| copy.fix.button | Fix it on this device |
| copy.fix.title | Smallest fix found on this device |
| copy.fix.rules | Planned by plain code on this device: masking every removable clue the attacker used. |
| copy.fix.unremovable | Some clues (like architecture or paving) can't be masked. Cropping or not posting are the remaining options. |
| copy.fix.cropTooMuch | Cropping would remove too much of this photo. Consider not posting it. |
| copy.fix.reattack | Re-attack the fixed photo |
| copy.fix.maxRounds | That's 3 rounds for this photo. Export it, crop it, or keep it private. |
| copy.receipt.line | Cloud received {images} redacted images in {requests} requests · 0 faces · 0 vault items · {k} on-device AI calls · {r} rules-only fallbacks. |
| copy.ledger.counters | Faces sent: {f} · Vault items sent: {v} |
| copy.ledger.otherTraffic | Other network traffic: App Check (with reCAPTCHA), anonymous sign-in, Remote Config, and the face detector's small usage pings to Google (library version and timings). None of it carries your photo or vault. |
| copy.cloudSaw.empty | Nothing has left this device yet. |
| copy.export.check | Checked on this device: no hidden data · 0 faces · 0 private words |
| copy.share.headline | AI found {n} location clues in my photo. I masked what I could on my own device before posting. |
| copy.share.headlineNear | AI found my neighbourhood. I reduced the risk before posting. |
| copy.share.footer | The attacker never learned it was right. · Strangers' Eyes |
| copy.burn.confirm | Burn your vault? The key is deleted first, so your places, names, recent checks, queued checks and ledger can't be recovered. This can't be undone. |
| copy.burn.done | Vault burned. |
| copy.judge.banner | Judge Mode: openly licensed sample photos of public places and a made-up vault. Nothing here is yours, so private steps may run in the cloud when this browser has no on-device AI. |
| copy.judge.fakeVault | Fake vault for Judge Mode. Your real vault isn't loaded. |
| copy.judge.autoConfirm | Sample photo: sending in {s} s… |
| copy.judge.cached | Recorded result for this sample ({date}, {model}). The live attacker isn't available right now. |
| copy.judge.notesNeedLive | Live search notes aren't part of this version. |
| copy.atlas.optIn | Help others: add anonymous counts of the clue types the attacker found (like "street sign"). No photos, places or vault data. |
| copy.atlas.notEnough | Not enough data yet this week. |
| copy.err.killSwitch | Cloud checks are paused by the operator. On-device checks still work. |
| copy.err.dailyCap | You've used today's {cap} cloud checks on this device. On-device checks still work. |
| copy.err.appCheck | This copy of the app couldn't be verified (App Check), so cloud checks are off. On-device checks still work. |
| copy.err.rateLimit | The cloud is busy. Try again in a minute. |
| copy.err.cloudFailed | The cloud check failed. On-device findings are still shown. |
| copy.err.network | The cloud attacker couldn't be reached. Nothing was queued; try again in a minute. On-device findings are still shown. |
| copy.err.auth | Couldn't start an anonymous session, so cloud checks are off. On-device checks still work. |
| copy.err.browser | This browser can't run Strangers' Eyes (it needs WebAssembly and IndexedDB). Try a current Chrome, Edge, Firefox or Safari. |
| copy.settings.capNote | The daily limit protects against misuse; it resets at midnight. |
| copy.about.notGuarantee | Strangers' Eyes reduces risk. It can't promise a photo is safe to post. |
| copy.about.howItWorks | Your private vault stays on this device and acts as the answer key. · This device grades the cloud attacker's guesses, and the attacker never sees the result. · An Egress Gate checks every request and blocks leaks before they happen. · What runs where is set by data sensitivity, and shown live. |
| copy.about.reattackDisclosure | When you re-attack, the cloud sees which areas you masked, but never why. |
| copy.about.support | If you're worried someone is tracking you, contact a local domestic-violence or victim-support service. |
| copy.hud.policyRejected | Policy update rejected: private classes must stay on this device. |
| copy.ios.fmNotReady | Apple Intelligence is still getting ready. Private checks use simple rules until then. |
| copy.ios.fmOff | Turn on Apple Intelligence in Settings to run private checks with on-device AI. Simple rules are used meanwhile. |
| copy.ios.ineligible | This device can't run Apple's on-device model. Private checks use simple rules. |
| copy.ios.slow | On-device AI is thinking… this can take up to 30 s in the Simulator. |
| copy.judge.coach.{step} | One coach mark per step: pre-screen, consent, attack, referee, verdict, fix, re-attack. Each says what ran where and why. |

The Router HUD line format is `{job} › {ROUTE} ({engine}) {latency}`, for example `pre-screen › ON-DEVICE (Gemini Nano) 2.1 s`.

---

## 12. Safety, ethics and dual use (SR rules)

| ID | Rule | Enforced by |
|---|---|---|
| SR-01 | Vault data never leaves the device: no AI call that can reach the cloud, no Firestore, no logs, no analytics. | Gate (§7), tripwire, AC-045, AC-162, AC-282 |
| SR-02 | The original photo never leaves the device. The cloud only gets the consented, redacted, EXIF-free JPEG. | Gate, AC-130 |
| SR-03 | Faces are always masked before any cloud call (threshold 0.3), and the gate blocks any detected face. Demo, sample and benchmark photos contain **no people**. Children's faces are never sent. | Gate, AC-119, AC-244 |
| SR-04 | Prompts are scene-only privacy audits commissioned by the owner. They never describe or identify people, never echo names, plates or house numbers, and never give a private home's full address. | `advA.v1`/`advB.v1` text, response scan |
| SR-05 | On a decline or block: show the on-device findings, and **never** retry, rephrase, role-play or "jailbreak". Transient errors (network, 5xx, 429, truncation, a parse failure) may be retried automatically within the SCR-08 limits, with a byte-identical request. | AC-144, AC-145, AC-149, AC-303, D-18 |
| SR-06 | **Dual use:** local files only (no URL input); no map, coordinates or address for the attacker's guess; bands relative to *your own* pins only; App Check, AI Logic per-user limits, the daily cap and the kill switch. The README says plainly that the raw JSON is visible in DevTools, that the added harm over the public Gemini app is close to zero, and that these measures don't stop a determined attacker. | SCR-05, AC-146, SCR-22, README |
| SR-07 | Claims: "Risk reduced", never "safe". Bands, never metres. Confidence always shown for attacker guesses. "Not a guarantee" in About and on LOW verdicts. | Copy catalogue, AC-164, AC-197, AC-304 |
| SR-08 | Data tier: the paid tier is planned [USER]. The UI states the tier truthfully. On the free tier, grounding is off and the README states the EEA/UK/CH limitation. | AC-131, D-07 |
| SR-09 | 18+ confirmation and "own photos only" on first run. Not marketed to minors. | SCR-01 |
| SR-10 | Grounding display: Search Suggestions are shown unmodified, at the same width, always visible alongside the notes, with queries and sources; no click tracking; never cached across users; shown only to the requesting user; never persisted. | SCR-08, AC-141, AC-148, AC-245 |
| SR-11 | Pass A isolation: never parsed by code or AI, and never fed to pass B, the referee, the Leak Atlas or the benchmark. | D-02, AC-143 |
| SR-12 | Prompt injection: text inside images is data. Runtime ID enums plus code validation contain any injected claims. Model output never changes routing. | Schemas, validators |
| SR-13 | Masks are solid fills with 15% padding. The output is re-checked (0 faces, 0 vault OCR hits) before sending and before export. | AC-113, AC-198, AC-260 |
| SR-14 | No real people, homes or schools in samples, the demo or the benchmark. No readable third-party logos in the video. Samples are shot away from the builder's home area, under the D-26 acceptance. Never commit real photos or their true coordinates (D-29). | AC-244, AC-351, AC-364 |
| SR-15 | No remote logging of content. Production console logs never print vault strings. | Lint rule or test |
| SR-16 | Burn vault is always reachable within two taps of the Vault screen. | SCR-19 |
| SR-17 | The Leak Atlas is opt-in and records only the clue types pass B reported in the first attack; there are no outcome counters (D-11). | AC-280–284 |
| SR-18 | Remote Config cannot weaken S0 or S1 (D-14). | AC-020 |
| SR-19 | The re-attack disclosure (D-24) appears in About and in the README. | AC-276, AC-302 |
| SR-20 | Chrome's built-in model and Apple Foundation Models are used under their acceptable-use terms. No medical, legal or "safety guarantee" advice. | Copy |

**Safety ACs**
- **AC-300 (P0) [e2e]** A network log over the full demo loop (including the leak attempt and the re-attack) shows:
  - requests only to Firebase and Google endpoints: AI Logic, App Check, reCAPTCHA, Auth, Remote Config, Firestore, Hosting;
  - no request body containing a vault canary string (in any letter case), the digits of a pin coordinate (to 3 or more decimals), or the original image's hash;
  - an AI-request count equal to the number of cloud Ledger entries.
- **AC-301 (P0) [unit]** The `advA.v1`/`advB.v1` prompts contain the scene-only and no-PII rules (snapshot test).
- **AC-302 (P0) [manual]** The README contains:
  - the dual-use statement (SR-06);
  - the prior-art citations;
  - the re-attack disclosure;
  - the data-tier statement (and the EEA/UK/CH note if on the free tier);
  - the benchmark's limitations;
  - the job table, W1–W8, I1–I6 and C1–C3, with modes and **file paths of the `firebase/ai` and `FirebaseAILogic` call sites**;
  - the iOS pin and its reason;
  - the iOS "bring your own Firebase project" build note.
- **AC-303 (P0) [unit]** No code path retries a declined or blocked S3 request (a static test plus a mock).
- **AC-304 (P0) [unit]** No user-facing string in `shared/strings/en.json` uses "safe" as a claim. The test checks strings only, not code comments, and allowlists `copy.about.notGuarantee`.
- **AC-305 (P0) [unit]** The prompt check passes:
  - every RC-selectable prompt version exists in the bundled `shared/prompts/manifest.json`;
  - file hashes match;
  - released prompt files are unchanged.

---

## 13. Non-goals

- **Android.** Cut: no device, and no Nano in the emulator. One roadmap line in the README.
- URL, scraping or social-network input. Posting directly to social networks.
- Map pins, coordinates or addresses for the attacker's guess. Any reverse geocoding or map tiles.
- Identifying people, face recognition, or analysing people in any way. Sending unmasked faces, especially children's.
- Any claim that a photo is "safe".
- Server-side code (Cloud Functions, a custom backend). The app is client-side plus Firebase services only.
- Accounts beyond Anonymous Auth. Syncing, backing up or exporting the vault. Multi-device use.
- Video, live camera, or batch checking (batch "last 20 posts" is P2).
- A Chrome extension "check before you post" (P2, one site only, a thin catcher with no Firebase inside). The iOS Share Extension (P2).
- A non-English UI (P2: placeholder templates translated in the cloud and filled on the device).
- Multi-turn chat with the attacker. Free-text questions to the cloud about the photo.
- Analytics or tracking SDKs. Click tracking on grounded links.
- A separate app passcode for the vault (we rely on the device or browser profile lock).
- Native macOS or Windows apps.

---

## 14. iOS app (SwiftUI)

### 14.1 Stack and setup (verified compile facts; API-NOTES §3)
- **SDK:** firebase-ios-sdk via SPM, **exactly 12.19.3** (D-05).
  - Products: `FirebaseAILogic`, `FirebaseAppCheck`, `FirebaseAuth`, `FirebaseRemoteConfig`.
  - **No Firestore on iOS:** the build is heavy, and the Leak Atlas is web-only.
- **Toolchain:** Xcode 27.2, **deployment target iOS 27.0**, build with `ARCHS=arm64`.
- **Simulator:** iPhone 18 Pro on the iOS 27.0 runtime. Apple Intelligence is on, on the macOS host.
- **Fallback (Path B):** 13.2.0 with `geminiLanguageModel(name:)` plus Apple's `LanguageModelSession`, with the fallback written in app code and no `modelVersion`. If it is used, the README must disclose that on-device calls go straight through Apple's FoundationModels.

### 14.2 Feature set (iOS MVP, D-32)

| Job | What it does | Class / route | Priority |
|---|---|---|---|
| I1 Vault | The same kinds and limits as the web (§17.2, D-23, D-36). "Pin this place" takes a one-shot CoreLocation reading (`CLLocationUpdate.liveUpdates` plus `CLServiceSession`), plus manual coordinates. Stored as one Keychain item, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, never synchronizable. Session files use `.completeFileProtection`. | code | P0 |
| I2 Tier-0 | Pixel re-encode: bake the orientation in, then a `CGImageDestination` JPEG (never `CopyImageSource`, which leaves GPS in HEIC and PNG). Vision `DetectFaceRectanglesRequest` on the **CPU compute device in the Simulator**, at the same 0.3-equivalent policy (mask every detection). `RecognizeTextRequest` (accurate, with word boxes). `ClassifyImageRequest` for scene labels. Regex and the shared vault matcher (SCR-06). | code | P0 |
| I3 FM pre-screen | **Text only.** Vision OCR lines plus the top scene labels go to an on-device-only session (`ai.generativeModelSession(model: FirebaseAI.SystemLanguageModel.default)`, never a `HybridModel`). Output: `@Generable` clues `{type, line_id, text, region, severity}`; boxes come from OCR words. **Vault labels are not in this prompt** (S1). Vault matching on iOS is the shared matcher plus I3b. | S1 · ON_DEVICE (Apple FM) or RULES_ONLY | P0 |
| I3b FM vault-text match | `nanoVaultText.v1` in an on-device-only session; IDs validated in code | S0 | P1 |
| I4a FM referee | The W4 contract, with `@Generable` output and IDs validated in code. Every prompt is checked with `tokenCount(for:)` and kept under 4,096 tokens (≤20 vault labels, ≤12 claims, no coordinates). A new session per call. Bands are computed in code. | S0 · ON_DEVICE (Apple FM) or RULES_ONLY | P0 |
| I4b Fix plan | The rules plan (§10.4) is P0. The FM planner (`nanoFix.v1`, `@Generable`) is P1. | S0 | P0 (rules) / P1 (FM) |
| I5 Explainer | `HybridModel(primary: SystemLanguageModel.default, secondary: geminiModel(explain_cloud_model))`. **Public text only, after the gate**, because it falls back on ANY primary error, guardrails included. The badge comes from `rawResponse.modelVersion` [UNVERIFIED at runtime: U-24]. | S2 · ON_DEVICE or IN_CLOUD | P1, kept: cut only after the Leak Atlas |
| C2 Pass B | `generativeModel` with a JSON `responseSchema`, mirroring `ADV_B_SCHEMA` (exact 12.19.3 initializer labels [UNVERIFIED: U-30]) | S3 · IN_CLOUD | P0 |
| C1 Pass A | `generativeModel(modelName:, tools: [.googleSearch()])`, with `renderedContent` in a `WKWebView` at the notes' width, plus sources | S3 | P2 |
| C3 Re-attack and compare | as on the web | S3 | P2 |
| I6a Masks, consent, gate, Ledger, HUD | Core Image solid fills. A consent sheet showing the exact JPEG. The same Egress Gate rules (minimal: class floor, availability pre-check, image re-check, prompt scan, Ledger), Ledger counters and Router HUD in Swift. The same RC `routing_policy` with the same floors. | all | P0 |
| I6b Export, save, share | Save to Photos (`NSPhotoLibraryAddUsageDescription`) or the share sheet, after the export check | n/a | P2 |
| Sample scenes | The Judge Mode scenes plus the fake vault, bundled. S4 via `HybridModel`. | S4 | P2 |
| App Check, Auth, RC | `AppCheckDebugProviderFactory` before `FirebaseApp.configure()` in DEBUG, with the debug token supplied by the launch environment (RUNBOOK; never committed). `Auth.auth().signInAnonymously()`. `RemoteConfig` with bundled defaults equal to the template. | n/a | P0 |

### 14.3 iOS screens
- A `TabView` with **Check · Vault · Ledger · Settings**. The Router HUD is an overlay at the bottom-left.
- **Check** is a `NavigationStack` stepper with these steps:
  - import, via `PhotosPicker(selection:matching: .images)` (the Simulator has no camera);
  - pre-screen and mask editor (tap to toggle a mask; drag to add one);
  - consent sheet;
  - attack (pass B);
  - verdict.
  - Fix, re-attack and export appear only when built.
- Copy uses the same IDs as §11. iOS-specific strings: `copy.ios.*`.

### 14.4 iOS states

| State | Detection | Behaviour |
|---|---|---|
| (a) FM available | `FirebaseAI.SystemLanguageModel.default.availability == .available` | I3/I4 run on the device; I5's primary runs on the device. Badge: `ON-DEVICE · Apple Foundation Models` |
| (b) Not ready | `.unavailable(.modelNotReady)` | S0/S1 are RULES-ONLY; I5 falls back to the cloud; `copy.ios.fmNotReady`. The app cannot start a download. |
| (c) No FM | `.deviceNotEligible`, `.appleIntelligenceNotEnabled`, or another unavailable reason | RULES-ONLY; `copy.ios.fmOff` or `copy.ios.ineligible` |
| (d) Offline | `NWPathMonitor` | No S3. No persistent queue: show `copy.cap.offline` and "Send when online", which keeps the session in memory while the app is in the foreground. I5 uses the device or the template. |
| (e) Refused | Same as the web | Same as the web: on-device findings only, no retry |

### 14.5 Web vs iOS differences

| Aspect | Web | iOS |
|---|---|---|
| On-device model | Gemini Nano (Chrome Prompt API) through `firebase/ai` hybrid | Apple Foundation Models through `FirebaseAILogic` 12.19.3 |
| Image to the on-device model | Yes (768 px JPEG) | **No.** Vision reads the pixels; FM reasons over text. |
| On-device structured output | `responseConstraint` (JSON Schema) | `@Generable` (IDs validated in code) |
| Faces / OCR / metadata | MediaPipe / Tesseract.js / canvas re-encode | Vision (CPU in the Simulator) / Vision OCR / ImageIO pixel re-encode |
| Vault storage | IndexedDB, AES-GCM, non-extractable key | Keychain `WhenUnlockedThisDeviceOnly` |
| S2 hybrid | `PREFER_ON_DEVICE`; source from `inferenceSource` | `HybridModel`; source from `rawResponse.modelVersion` [UNVERIFIED] |
| Grounded notes | P1 (shadow root) | P2 (`WKWebView`) |
| Re-attack | P0 | P2 |
| On-device token budget | 9,216 input | 4,096 total |
| Offline | Full PWA plus in-memory queue (persistent queue P1) | Foreground only; no persistent queue |
| Judge Mode | Full (P0) | Sample scenes P2 |
| Leak Atlas | P1 | Not built |
| App Check | reCAPTCHA Enterprise (hosted); debug token on localhost | Debug provider in the Simulator (App Attest unused: no device) |
| Typical on-device latency | Nano (measured Nov 21, Chrome 157, D-154): referee ~6 s warm / 16 s cold (text), pre-screen ~10 s warm / 13 s cold (image) | FM in the Simulator: 18–30 s per call (measured) |

### 14.6 iOS rules
- Never run Simulator FM while Chrome Nano is running (8 GB RAM). Shut the Simulator down when you aren't recording.
- Never put S0/S1 data in a `HybridModel` session. Never send image parts to on-device sessions.
- One new session per single-turn job, because sessions keep chat history.
- Film caption: "iOS 27 Simulator on Apple-silicon Mac · Apple Foundation Models on-device" [UNVERIFIED: whether judges accept Simulator footage; the rules are silent, U-38].

### 14.7 Acceptance criteria: iOS
- **AC-320 (P0) [manual]** The app builds and runs in the iPhone 18 Pro (iOS 27.0) Simulator with SPM `FirebaseAILogic` pinned to exactly 12.19.3. The README states the pin and the reason.
- **AC-321 (P0) [unit]** A vault round trip through the Keychain (on a Simulator app target). The item is not synchronizable and uses `WhenUnlockedThisDeviceOnly`.
- **AC-322 (P0) [unit]** The pixel re-encode removes GPS from JPEG, HEIC and PNG fixtures and keeps the image upright.
- **AC-323 (P0) [manual]** Face detection works in the Simulator (CPU device), and faces are masked before the consent sheet.
- **AC-324 (P0) [manual] [video]** In state (a), the pre-screen and referee (and the FM fix planner, if built) show `ON-DEVICE · Apple Foundation Models` with their latency in the HUD, and the verdict follows the web contract (§10).
- **AC-325 (P0) [unit]** When FM is unavailable, the I3/I4 session code is never called: RULES-ONLY is used, and no network request is made for S0/S1 (mocked availability).
- **AC-326 (P0) [unit]** Every I4 prompt, measured with `tokenCount`, stays under 4,096 tokens with 20 vault items and 12 claims (fixture). A prompt over budget is trimmed by priority, never sent.
- **AC-327 (P0) [manual]** The cloud adversary (pass B) returns valid JSON with the App Check debug token registered by the [USER], and clue boxes are drawn correctly on the image.
- **AC-328 (P1) [manual] [video]** The I5 explainer shows `ON-DEVICE` in state (a). With Apple Intelligence off, it shows `IN CLOUD`, with the source read from `rawResponse.modelVersion`.
- **AC-329 (P0) [manual]** The gate blocks a vault-text leak on iOS with the same toast copy, and the Ledger counters read 0 · 0 after a full loop.
- **AC-330 (P2) [manual]** An exported or saved photo has no GPS, 0 faces and 0 vault OCR hits.
- **AC-331 (P2) [manual]** Pass A notes and the Search Suggestions render in a `WKWebView` at the notes' width, with sources.
- **AC-332 (P0) [manual]** The UI never shows hypothesis coordinates or a map (same as AC-146).
- **AC-333 (P0) [unit]** iOS runs the shared `fuzzy.json`, `referee.json`, `bands.json`, `box2d.json` and `verdict.json` vectors (AC-168).

---

## 15. Benchmark ("measured, not claimed")

### 15.1 Photo set (D-29, D-34)
- **25 builder-owned, people-free photos of public places**, each with a known capture point. No real homes, no schools, no residential houses (invariant 8).
- **Mix:**
  - 5 transit stops or signs;
  - 5 street corners with street signs;
  - 5 shop or café fronts;
  - 5 public or commercial interiors with a window view;
  - 5 generic architecture or greenery shots with no text (the hard cases).
- The 10 G1 spike photos count toward the 25.
- **Gate test set (P1, for M6):** 10 images with prop text matching a test vault (fictional names, plates, house numbers). The [USER] shoots them by Nov 25.
- **Storage, all in PRIV:**
  - `PRIV/bench/` for the 25 photos;
  - `PRIV/bench/truth.csv`, with columns `id,lat,lng,place_type,clues`;
  - `PRIV/raw/` for raw results (`bench-<date>.json`, `spike-<date>.json`);
  - `PRIV/gate-test/` for the gate test set and its test-vault `vault.json`.
  - `clues` holds the hand labels, written `type@region` and separated by `;`. Types come from `CLUE_TYPES`; regions are the 3×3 grid.
- The repo holds the harness code, the aggregation script and **aggregate** results only. Results report counts, percentages, bands and distance percentiles, never coordinates.
- Limitations, stated in the README:
  - public places are probably easier to locate than homes;
  - the set covers one region (E5);
  - n = 25;
  - the photos are builder-owned.

### 15.2 Protocol
- **Harness:** the dev-only route `#/dev/bench` in a **dev build on localhost**, using the App Check debug token. It goes through the exact production code path and the Egress Gate, and it is absent from the production bundle.
- **Synthetic vault per photo:** a `home_pin` at the capture point. No text items for M1–M5. The test vault is used for M6.
- **Conditions:**
  - **Before:** the Tier-0 master with the Standard pre-mask (there are no faces).
  - **After:** the Before image plus the **rules-only fix** (§10.4), which is deterministic. The Nano fix is reported as a separate, secondary row if time allows.
- **Calls:** pass B only (D-22). **k = 3 runs** per photo per condition, which is 150 pass-B calls. Pin and record the model ID, prompt versions, thinking level and date. Pace calls at least 3 s apart (≤20 RPM), well under the 30 RPM per-user AI Logic quota (RUNBOOK §1.11, D-47), which leaves headroom for Judge Mode traffic (D-52).
- **Where it runs:**
  - The pass-B runs go **unattended** in headless Chrome 157, with the fixed debug token and the CDP harness. That needs neither Nano nor the user present.
  - The Nano pre-screen recall subset runs separately, in the user's Chrome, with the Simulator shut down.
- **Retries:** a transient error is rerun once for that photo only. **A decline is never rerun.**

### 15.3 Metrics

| ID | Metric | Definition |
|---|---|---|
| M1 | Located within 1 km, before vs after | **Primary:** photos where the closest hypothesis **centre** (`d`, over ≤3 hypotheses) is ≤1 km in ≥2 of 3 runs. Also report "any of 3" (worst case). **Secondary:** the same using `e` (the app's band, D-10). |
| M2 | Located within 5 km, before vs after | As M1, with 5 km |
| M3 | Refusal rate | Runs that were declined or blocked, divided by all runs |
| M4 | Clue recall per reader | Against the hand labels: a clue is found if a reader reports the **same type in the same or an adjacent 3×3 cell** (8-neighbourhood). Pass-B boxes use the cell of the box centre. Tier-0 counts only text-family types (`name_text`, `house_number`, `plate`, `street_sign`, `transit_sign`, `storefront_text`). Reported for Tier-0, the Nano pre-screen (if available) and pass B. |
| M5 | Latency p50/p95 | Per job and route, from the Ledger: Tier-0 steps, Nano calls, pass B, and FM calls (iOS, a small separate set). Pass A time to first token comes from demo sessions only, and its content is not analysed. |
| M6 | Vault-text catch rate (P1) | The share of prop vault strings masked before the consent sheet, on the gate test set. Target: 100%, with 0 gate false negatives. |
| M7 | Calls per session | On-device vs cloud calls per full loop, from the Ledger, in states (a) and (c) |
| M8 | Raw distance | The median `d` (closest of ≤3 hypothesis centres, as in M1), before and after. The median top-1 distance (h1's centre only) may be reported alongside, labelled as such, for comparison with the literature. |
| M9 | Band change | The share of photos whose closest home band (`e`) moved outward after the fix |

### 15.4 Outputs
- `PRIV/raw/bench-YYYY-MM-DD.json`: one record per run (photo ID, condition, run, audit_status, `d`, the top-1 (h1) distance, `e`, band, latency, model, prompt version).
- Committed: `benchmark/results/summary.json` and `benchmark/results/summary.md` (aggregates only), the harness and the aggregation script.
- **Publish whatever the numbers turn out to be.** The video uses only real measured numbers.

### 15.5 Acceptance criteria: benchmark
- **AC-350 (P0) [manual]** 25 photos × 2 conditions × 3 runs complete. The summary contains M1–M5, M7, M8 and M9; M6 is P1.
- **AC-351 (P0) [unit]**
  - No committed file under `benchmark/` contains coordinates, photo pixels or EXIF (a scan test).
  - The repo-wide coordinate scan (`scripts/check-images.mjs`) accepts coordinates only in `web/public/samples/*.json` (after the D-26 decision), the synthetic `shared/testvectors/*.json` and the repo's own lock files (by exact path). Anywhere else, a coordinate-like value (decimal, decimal comma, DMS with seconds or decimal minutes, XMP GPS form) passes only if its exact value is listed for that file, with a reason, in `scripts/check-images.allow.json`: synthetic open-ocean pins, public reference points or values that are not coordinates (D-106, D-119). No true coordinate is ever listed.
- **AC-352 (P0) [unit]** M1, M2 and M9 are computed with the app's own geo and band module, which has a unit test.
- **AC-353 (P0) [manual]** The README's benchmark table matches `summary.md`, and states the model, prompt versions, date, k = 3, `d` vs `e`, and the limitations (§15.1).
- **AC-354 (P1) [manual]** The M6 gate test set reaches 100%, or its misses are listed and fixed.

---

## 16. Remote Config parameters (product meaning)

- **The key names and the template are owned by ARCHITECTURE §13 / `remoteconfig.template.json`.** Once that file exists, it is the source of truth for defaults.
- This table gives the product meaning of exactly the 28 keys in ARCHITECTURE §13.2, with the same names and defaults (types, clamps and validation live there). If a default here differs from the template, the template wins; fix this table (D-40).

| Key | Type | Default | Product meaning |
|---|---|---|---|
| `kill_switch` | BOOLEAN | `false` | Disables every cloud call (S3; S2/S4 cloud fallback). Applies in real time via `onConfigUpdate`. |
| `routing_policy` | JSON | nested `{version, classes, jobs}`, ARCHITECTURE §7 | Mode per class and class per job. The S0/S1 floor is enforced in code (D-14). |
| `adversary_model` | STRING | `gemini-3.5-flash-lite` | Model for C1, C2 and C3 (flash-lite since D-159). An exact ID, never `-latest`. |
| `adversary_fallback_models` | JSON | `[]` | Pass-B failover order (D-165): up to 3 exact IDs, each tried once only after a server error (5xx) or quota error (429), each its own gate call and Ledger entry. Never after a decline, safety block, timeout or unreadable answer (invariant 7). First attack only: a re-attack goes only to the model that answered the first attack, so "Risk reduced" never comes from a model swap. `[]` = no failover (the live config has no list yet). |
| `adversary_thinking_level` | STRING | `MEDIUM` | LOW, MEDIUM or HIGH. MINIMAL is rejected (400 on 3.8 and 4.x). |
| `explain_cloud_model` | STRING | `gemini-3.5-flash-lite` | Cloud side of S2 and S4 |
| `explain_thinking_level` | STRING | `LOW` | Thinking level for the cloud side of S2 and S4: MINIMAL, LOW, MEDIUM or HIGH |
| `prompt_versions` | JSON | `{"advA":"advA.v1","advB":"advB.v1","nanoPre":"nanoPre.v1","nanoVaultText":"nanoVaultText.v1","nanoRef":"nanoRef.v1","nanoFix":"nanoFix.v1","explain":"explain.v1","fmPre":"fmPre.v1"}` | Must name versions bundled in `shared/prompts/`; unknown values fall back to the bundled default |
| `grounding_enabled` | BOOLEAN | `false` | Pass A on or off (`false` matches the live free-tier config, D-165) |
| `data_tier` | STRING | `free` | `paid` or `free`. Drives the consent copy; `free` forces grounding off. `free` matches the live config (D-165); the paid line shows only when a fetched value says `paid` (D-163). |
| `daily_adversary_cap` | NUMBER | `20` | Attack runs per installation per **local day**. One run is an A+B pair (or B alone). Re-attacks count. Judge Mode shares the counter and falls back to CACHED. Keep project-wide grounded queries well below 1,500 a day. |
| `max_fix_rounds` | NUMBER | `3` | Fix and re-attack rounds per photo |
| `bands_m` | JSON | `{"street":250,"neighbourhood":1000,"district":5000,"city":30000,"country":500000}` | Must be strictly increasing. City and country are placeholders. Street, neighbourhood and district are locked to 250 / 1,000 / 5,000 (D-77); any other table falls back to the defaults. |
| `auto_mask_types` | JSON | `["name_text","house_number","plate","mail_or_document","screen"]` | High-severity Nano clue types masked in Standard mode. Must be a subset of `CLUE_TYPES` (D-13). |
| `strict_mode_default` | BOOLEAN | `false` | Standard is the default (D-16) |
| `fuzzy_threshold` | NUMBER | `0.8` | Vault-matcher similarity, clamped to 0.6–0.98 |
| `face_min_confidence` | NUMBER | `0.3` | One face threshold: the score at which Tier-0 masks, the consent dry run re-masks **and** the gate blocks (D-30). Clamped to 0.2–0.6 |
| `mask_pad_ratio` | NUMBER | `0.15` | Total padding as a share of box size, clamped to 0–0.5 |
| `cloud_image_max_px` | NUMBER | `1536` | Longest side sent to the cloud, clamped to 768–2048 (never larger than the ≤2048 px master, D-20) |
| `nano_image_max_px` | NUMBER | `768` | Longest side sent to Nano |
| `ocr_max_px` | NUMBER | `1600` | Longest side of the OCR downscale of the master (D-20) |
| `timeouts_ms` | JSON | `{"advA":60000,"advB":45000,"explain":20000,"deviceImage":60000,"deviceText":30000}` | Per-job timeouts (ARCHITECTURE §9.2): pass A 60 s, pass B 45 s (D-159), explainer 20 s, device image jobs 60 s, device text jobs 30 s. There is no single `request_timeout_ms`. |
| `judge_mode_enabled` | BOOLEAN | `true` | Shows Judge Mode |
| `judge_cached_fallback` | BOOLEAN | `true` | Use recorded pass-B fixtures when the live adversary is unavailable |
| `judge_autoplay_default` | BOOLEAN | `true` | Judge Mode autoplay |
| `atlas_enabled` | BOOLEAN | `true` | Hides the Atlas when false |
| `extension_enabled` | BOOLEAN | `false` | Stretch |
| `adversary_seed` | NUMBER | `0` | [UNVERIFIED: U-11] a cast experiment; 0 means it is not sent |

- **What RC deliberately does not hold:**
  - **no** `temperature` (D-01);
  - **no** enum lists such as `clue_types` (D-13);
  - **no** prompt text (prompt text is bundled).
- **Timeouts are per job** (ARCHITECTURE §9.2), set by `timeouts_ms` above. There is no single `request_timeout_ms`.
- **Parsing:** values are strings and are parsed with validation. An invalid value falls back to its default and is logged in the HUD.
- **Web fetch settings:**
  - `minimumFetchIntervalMillis`: 60 s in dev, 1 h in production;
  - `fetchTimeoutMillis`: 8 s;
  - call `ensureInitialized` before any read.
- **ACs**
  - **AC-293 (P0) [unit]** Each key is parsed with validation, and invalid values fall back to their defaults, except three keys that fail safe instead: a refused `kill_switch` reads as `true`, `data_tier` as `free` and `grounding_enabled` as `false` (D-108, D-118).
  - **AC-294 (P0) [e2e]** An offline start uses the last activated values (or the defaults) with no delay.
  - **AC-295 (P0) [unit]** The bundled defaults on web and iOS deep-equal the defaults in `remoteconfig.template.json`.

---

## 17. Product enumerations and contracts

These are canonical. The code lives in `shared/prompts/enums.v1.json` and next to it.

### 17.1 Enums
- **CLUE_TYPES (18):**
  - `name_text`, `house_number`, `plate`, `street_sign`, `transit_sign`, `storefront_text`;
  - `uniform_or_lanyard`, `crest_or_logo`, `mail_or_document`, `screen`, `window_view`, `reflection`;
  - `landmark`, `architecture`, `road_or_street_furniture`, `vegetation_or_terrain`, `language_or_script`, `other`.
  - The pre-screen uses the first 13. The Leak Atlas whitelist uses all 18.
- **INFERENCE_KINDS:** `workplace`, `school`, `home_area`, `routine`, `transit_line`, `venue`, `other`.
- **CONF:** `high`, `medium`, `low`. **SEVERITY** (pre-screen): `high`, `medium`, `low`.
- **LEVELS** (the adversary's `level` and `reveals`): `street`, `neighbourhood`, `district`, `city`, `region`, `country`. `reveals` also allows `venue_or_organisation`.
- **BANDS** (computed in code): `street`, `neighbourhood`, `district`, `city`, `country`, `none`. The adversary's LEVELS and the code's BANDS are deliberately different scales.
- **REGIONS** (3×3): `top_left`, `top_center`, `top_right`, `middle_left`, `middle_center`, `middle_right`, `bottom_left`, `bottom_center`, `bottom_right`.
- **AUDIT_STATUS:** `ok`, `no_location_signal`, `declined`.
- **STRENGTH:** `exact`, `likely`, `possible`.
- **PAYLOAD_CLASS:** `S0`, `S1`, `S2`, `S3`, `S4`.
- **ROUTE:** `ON_DEVICE`, `IN_CLOUD`, `RULES_ONLY`, `BLOCKED`, `QUEUED`, `CACHED`.
- **GATE_BLOCK_REASON:** `CLASS_FLOOR`, `CLASS_MISMATCH`, `NOT_SYNTHETIC`, `KILL_SWITCH`, `DAILY_CAP`, `OFFLINE`, `NO_CONSENT`, `EXIF`, `BAD_MIME`, `FACE`, `VAULT_TEXT_IN_IMAGE`, `VAULT_TEXT_IN_PROMPT`, `PIN_IN_PROMPT`, `TRIPWIRE`.
- **CROP:** `none`, `top`, `bottom`, `left`, `right`.

### 17.2 Vault kinds (D-36)
- **Pins (they carry lat, lng and accuracy, and get bands):** `home_pin`, `work_pin`, `school_pin`, `place_pin`.
- **Text:** `self_name`, `child_name`, `person_name`, `employer`, `school_name`, `area_name`, `street_name`, `plate`, `house_number`, `phone`, `descriptor` (a uniform, lanyard or crest description), `other_text`.
- Pin labels are optional. Generic or empty labels are display-only.

### 17.3 KIND display names (verdict)

| Kinds | Display |
|---|---|
| home_pin, area_name, street_name | HOME |
| house_number | HOUSE NUMBER |
| work_pin, employer | WORKPLACE |
| school_pin, school_name | SCHOOL |
| child_name | CHILD'S NAME |
| self_name | YOUR NAME |
| person_name | NAME |
| plate | CAR PLATE |
| phone | PHONE NUMBER |
| descriptor | UNIFORM / LANYARD |
| place_pin | the user's label in capitals (for example "GYM"), or "PLACE" |
| other_text | VAULT ITEM |

### 17.4 Claim-to-vault kind compatibility (rules referee)

| Claim kind | Compatible vault kinds |
|---|---|
| workplace | work_pin, employer, descriptor |
| school | school_pin, school_name, descriptor |
| home_area | home_pin (label), area_name, street_name, house_number |
| routine, transit_line | home_pin, work_pin, school_pin, area_name, street_name |
| venue | place_pin, work_pin, school_pin, employer, school_name |
| area (hypothesis) | area_name, street_name, and labelled pins |
| other | all text kinds |

Name kinds (`self_name`, `child_name`, `person_name`) are matched by OCR, W3b and the echo scan. Claims never name people, by the pass B rules.

### 17.5 Matching word lists (initial; extended through the vectors)
- **Generic words** (never distinctive): city, general, school, primary, secondary, high, academy, college, university, hospital, clinic, medical, centre, center, street, road, avenue, lane, park, station, north, south, east, west, new, the, of, and, for, at, in, on, central, old, house, home, office, company, group, church, market, saint, a, an, with, from, near, by, to, behind, next, this, that, its, my, our, your, their, his, her.
  - D-102 added the common function words from "a" onward: they are never distinctive (rule 2(a)) and never a shared token (rule 3(b)). The matcher's separate function-word set (`the, of, and, for, at, in, on`: pairs of them never form a 2-token run, and acronyms skip them) is unchanged and lies inside this list.
- **Synonym classes:**
  - hospital ~ {hospital, hosp, clinic, medical, nurse, nursing, doctor, scrubs, health, ward};
  - school ~ {school, primary, secondary, elementary, academy, college, crest, pupil, pupils, uniform, playground};
  - university ~ {university, univ, uni, campus, college, faculty}.
- **Artefact terms:** logo, lanyard, badge, crest, uniform, scrubs, sign, signage, emblem, name tag.
- These lists, plus the SCR-06 word folds, are `GENERIC_WORDS`, `SYNONYM_CLASSES`, `ARTEFACT_TERMS` and `WORD_FOLDS` in `shared/prompts/enums.v1.json`. This section and that file must stay identical; extend both through the vectors.

### 17.6 Adversary output contract (pass B, `advB.v1`)
- `audit_status`, `decline_reason?`, `scene_summary` (≤25 words, no people).
- `hypotheses[≤3]`: `{id h1..h3, label, level, lat, lng, radius_km ≥0.1, confidence, clue_ids[]}`.
- `clues[≤12]`: `{id c1.., type, box_2d [ymin, xmin, ymax, xmax] 0–1000, evidence ≤20 words, reveals, severity, removable}`.
- `inferences[≤8]`: `{id i1.., kind, value (never a person), confidence, clue_ids[]}`.
- The full JSON Schema is `shared/prompts/advB.v1.schema.json` (ARCHITECTURE §10.6). Whether Gemini accepts it with no 400 is [UNVERIFIED: U-45].

---

## 18. Acceptance criteria index and traceability

### 18.1 Ranges

| Range | Feature | Section | Built on |
|---|---|---|---|
| AC-001–019 | Capability states | §5 | Nov 21–25 |
| AC-020–039 | Routing and policy | §6 | Nov 21–25 |
| AC-040–059 | Egress Gate and tripwire | §7 | Nov 21–24 |
| AC-060–069 | Shell, accessibility, performance, cross-browser | §8 | Nov 21–29 |
| AC-070–074 | Welcome and capability panel | SCR-01/02 | Nov 21–22 |
| AC-075–079 | Home | SCR-03 | Nov 21, Nov 29 |
| AC-080–099 | Vault | SCR-04 | Nov 21 |
| AC-100–109 | Import | SCR-05 | Nov 21 |
| AC-110–129 | Pre-screen and mask editor | SCR-06 | Nov 21–23 |
| AC-130–139 | Consent sheet | SCR-07 | Nov 22 |
| AC-140–159 | Adversary | SCR-08 | Nov 22–23 |
| AC-160–179 | Referee and verdict | SCR-09, §10 | Nov 22–24 |
| AC-180–189 | Gate toast | SCR-10 | Nov 24 |
| AC-190–209 | Fix and re-attack | SCR-11 | Nov 24 |
| AC-210–219 | Cloud Ledger | SCR-13 | Nov 22–24 |
| AC-220–229 | Router HUD | SCR-14 | Nov 22–24 |
| AC-230–234 | What the cloud saw | SCR-15 | Nov 24 |
| AC-235–239 | Explainer | SCR-16 | Nov 24 |
| AC-240–249 | Judge Mode | SCR-17 | Nov 25 |
| AC-250–259 | Offline and queue | SCR-18 | Nov 24–25 |
| AC-260–269 | Export and share card | SCR-12 | Nov 24–29 |
| AC-270–274 | Burn vault | SCR-19 | Nov 21 |
| AC-275–279 | Settings and About | SCR-20 | Nov 25, Nov 29 |
| AC-280–289 | Leak Atlas | SCR-21 | Nov 25 |
| AC-290–299 | System states, Firebase init, Remote Config | SCR-22, §16 | Nov 25 |
| AC-300–319 | Safety | §12 | throughout |
| AC-320–349 | iOS | §14 | Nov 26–28 |
| AC-350–359 | Benchmark | §15 | Nov 26–28 |
| AC-360–369 | Submission-facing product checks | §18.2 | Nov 21 (366), Nov 29–30 |

### 18.2 Submission-facing product checks
- **AC-360 (P0) [manual]** The hosted URL (`PROJECT_ID.web.app`) works for a judge with no login (Anonymous Auth), no Nano, and no cost to the judge, in Chrome **and Safari**. App Check uses reCAPTCHA Enterprise.
- **AC-361 (P0) [manual]** Firebase AI Logic is imported and **called at runtime** on both platforms: `firebase/ai` → `generateContent`/`generateContentStream`, and `FirebaseAILogic` → sessions and `generativeModel`. The README lists these call sites with file paths.
- **AC-362 (P0) [manual]** Both on-device and cloud inference are demonstrably used. The video shows both badges, on the web (Nano) and on iOS (Apple FM).
- **AC-363 (P0) [manual]** The hosted app stays within quota until **Dec 16 2026, 2:00 PM PT** (the end of judging): daily cap and per-user limits set, kill switch off, budget alerts set [USER].
- **AC-364 (P0) [manual]** Before tagging `submission-v1`, a `git grep` scan confirms the repo contains no `.env*.local` file (only the secret-free `web/.env.example` and `web/.env.e2e` are committed), no `ios/.appcheck-debug-token`, no debug-token values, service-account keys, real photos or true coordinates. Coordinates may appear only in `web/public/samples/*.json`, the synthetic `shared/testvectors/*.json`, the repo's lock files, and as the reviewed non-true values in `scripts/check-images.allow.json` (D-106, D-119). `node scripts/check-images.mjs` automates the pre-check over every file a commit could take, the staged copy included.
- **AC-365 (P0) [e2e]** `web/dist` does not contain the registered App Check debug-token **value**, nor the string `VITE_APPCHECK_DEBUG_TOKEN`. Note: the App Check SDK itself references the global name `FIREBASE_APPCHECK_DEBUG_TOKEN` (expected from its source), so grepping for that name alone is not a valid test.
- **AC-366 (P0) [e2e]** On the walking-skeleton deploy (Sat Nov 21, TASKS T-038) and again on every hosted deploy, checked with `curl -I`:
  - `/`, `/index.html`, `/sw.js` and `/manifest.webmanifest` are served with `Cache-Control: no-cache`;
  - the MediaPipe `.wasm` returns 200 with a type the browser accepts;
  - the `.tflite` models and `eng.traineddata.gz` return 200;
  - Tier-0 OCR and face detection run on the hosted origin.
  - [UNVERIFIED: U-20, U-21]

### 18.3 Demo-critical P0 set (verify these first)
AC-002, 021, 022, 025, 041, 043, 045, 047, 130, 140, 144, 146, 163, 193, 211, 221, 236, 240, 250, 290, 291, 292, 320, 324, 327, 350, 360, 361, 362, 363, 364, 365.

### 18.4 Legacy two-digit AC map (older drafts of TASKS)
- AC-01 → AC-045/162/300
- AC-02 → AC-130/300
- AC-03 → AC-005/007/021/022
- AC-04 → AC-040/043
- AC-05 → AC-024/041
- AC-06 → AC-025
- AC-07 → AC-210..213
- AC-08 → AC-220..222
- AC-09 → AC-072..074
- AC-10 → AC-080..088, AC-270/271
- AC-11 → AC-100..103
- AC-12 → AC-101, AC-110..113, AC-119
- AC-13 → AC-111..117
- AC-14 → AC-130..135
- AC-15 → AC-141/143/148
- AC-16 → AC-142/147
- AC-17 → AC-144/145/149/303
- AC-18 → AC-161/162/165/167
- AC-19 → AC-146/160
- AC-20 → AC-160/164/304
- AC-21 → AC-190..198
- AC-22 → AC-193/194
- AC-23 → AC-260..263
- AC-24 → AC-235..238
- AC-25 → AC-240..246
- AC-26 → AC-250..252
- AC-27 → AC-290..292
- AC-28 → AC-020/293..295
- AC-29 → AC-280..284
- AC-30 → AC-070/276/302/304
- AC-31 → AC-320..333
- AC-32 → AC-350..353
- AC-33 → AC-360/363

---

## 19. Open questions and UNVERIFIED register (product-relevant)

Resolve each one, then update this file and `docs/API-NOTES.md`. U-IDs refer to API-NOTES §10.

1. **Nano on this 8 GB M1** (G2, U-01): image input plus `responseConstraint` through the SDK in Chrome 157.
2. Whether `#prompt-api-for-gemini-nano-multimodal-input` is still needed on Chrome 157 (U-02), and whether hosted origins still need a Prompt API **origin-trial token** (U-10; check on the Nov 22 walking-skeleton deploy).
3. Whether `responseConstraint` accepts a Firebase `Schema` instance, and whether Chrome tolerates `nullable:false` (U-04). We pass plain JSON Schema (D-04).
4. `samplingMode` passed through `createOptions` by a cast (U-06): not planned. `initialPrompts` with role `system` (U-44): not used.
5. Grounding plus a JSON schema in one Firebase call (U-08): not used (D-02).
6. The refusal rate of `gemini-3.8-flash` / `gemini-4-*` on the audit framing (U-13, G1), including doorstep-style scenes.
7. Whether a `seed` cast is honoured (U-11): an optional Day-1 test only. Whether thinking tokens count toward `maxOutputTokens` (U-12).
8. How the AI Logic per-user rate limit identifies a "user" (U-09).
9. iOS:
   - a `HybridModel` on-device request through the 12.19.3 wrapper in the Simulator (U-23);
   - the runtime values of `rawResponse.modelVersion` (U-24);
   - the App Check token exchange (U-25);
   - whether `PhotosPicker` keeps GPS EXIF (U-26);
   - thumbnail orientation baking (U-27);
   - pass-B `responseSchema` initializer labels on 12.19.3 (U-30).
10. Whether judges accept Simulator footage for iOS (U-38).
11. Whether v3Nano is accepted against the "Gemini Nano 4" wording, which is forum-relayed only (U-40). Whether the Gemma 4 flag runs on 8 GB (U-03; D-21 timing rule).
12. Whether MediaPipe and Tesseract are acceptable alongside "all AI inference through Firebase AI Logic" (U-39). We frame them as deterministic CV/OCR privacy filters; all generative work goes through AI Logic.
13. Face-detection recall on real, small or distant faces (full-range vs short-range; whether 2×2 tiling is needed) (U-31). Test with consenting builder-owned images or public-domain images, never committed.
14. HEIC decoding in desktop Chrome (U-32).
15. How Firebase Hosting serves `.wasm`, `.tflite` and `.gz`, and the header glob (U-20, U-21; AC-366).
16. The city and country band thresholds (U-35).
17. Before any use on screen: the VLM-GeoPrivacy figures (E4), the arXiv 2503.20226 details (U-49), and the "5B users" figure (E10). McAfee stays off screen.
18. Devpost form fields (multi-platform selection, the testing-instructions box) (U-37).
19. How Edge's built-in `LanguageModel` (a non-Gemini model) appears through the SDK. If detected outside Chrome, label it "ON-DEVICE (browser model)".
20. The conflict between the free tier and EEA/UK/CH judges (forum topic unanswered). Resolved if the [USER] chooses Blaze plus the paid tier (D-07).
21. **New:** Tesseract reads the fictional "LUCAS" prop tag in the hero photo at master and at 1536 px. AC-041 depends on this; verify as soon as the props exist (target Nov 23).
22. **New:** whether the attacker produces a workplace inference from the generic "HOSPITAL STAFF" lanyard (D-39), so that the referee yields `likely`. Pre-test with the hero scene 10×.
23. **New:** Tier-0 in Safari and Firefox (AC-066), and the cold-load time of Judge Mode on a throttled network (AC-067).
24. **New:** G1b's outcome (how effective the fix is, and the median `radius_km`). It may amend D-10.
