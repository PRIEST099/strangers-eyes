# Strangers' Eyes: see your photo the way a stalker's AI would, before you post it

[Live app](https://strangers-eyes.web.app) · [Demo video, under 3 min]([TBD: YOUTUBE_URL after T-187]) · [Apache-2.0](LICENSE) · Built for #BuildHybridAI 2026 (Web PWA, iOS in progress)

> The cloud plays the attacker. Your device holds the answers. The attacker never learns whether it guessed right.

**Value proposition:** find out what a stranger's AI could work out from your photo about where you live, where you work and what your children are called, and fix it before you post. Your secrets are never handed to any cloud.

---

## 1. Why (impact)

- Platforms strip GPS data, so people feel safe. Multimodal models now place photos from the pixels alone: street and transit signs, stop codes, shop fronts, lanyards, window views.
- Published studies report **up to** about 60% street-level (≤1 km) accuracy on social-media-like images, much lower on Street View-style images (Privacy International, "Nowhere to Hide?", Feb 2026). Accuracy also drops in less developed and sparsely populated regions (arXiv 2502.11163, EMNLP 2025).
- EXIF strippers ignore the pixels. Research prototypes send the raw photo to a cloud model and know nothing about what *you* need to hide.
- **Who it is for:** parents, marketplace sellers and creators. Highest need: domestic-violence survivors, journalists and activists. The threat and the fix are the same in every country.

**Why it has to be hybrid.** Attacking a photo needs world-scale visual knowledge, which only a large cloud model has. Judging the attack needs your secrets (home pin, workplace, children's names), which must never leave the device. The app splits the job at exactly that line.

## 2. Try it in 60 seconds (judges)

1. Open **https://strangers-eyes.web.app** in any desktop or mobile browser. No login (an anonymous session is created for you), no cost.
2. Confirm you are 18+, then choose **Open Judge Mode** (or go straight to `https://strangers-eyes.web.app/?judge=1`).
3. Pick a sample and press **Run this sample** (Autoplay is on by default). Each sample runs the whole loop: pre-screen, redacted copy, cloud attacker, verdict, fix, re-attack.
4. Watch the **Router HUD** (bottom left): every AI step says where it ran (`ON-DEVICE`, `IN_CLOUD`, `RULES-ONLY`) and how long it took. The **Cloud Ledger** counts exactly what left the device.

No on-device AI is needed. With desktop Chrome and Gemini Nano enabled, the on-device steps run on Nano instead.

> **About the Judge Mode samples (please read).** The three sample photos are **CC0 photos of public places in Ljubljana** from Wikimedia Commons (credits in [`web/public/samples/SOURCES.md`](web/public/samples/SOURCES.md)). We solid-masked people, adverts showing people and real number plates, and **drew in the props**: a "City General Hospital" staff badge and a "LUCAS" name-tag lunchbox. The vault is made up, and its two pins sit in a park and a square. The **recorded attacker answers** that ship with the samples are **stand-ins written by the team** until live recordings replace them; the app labels them `STAND-IN ANSWERS`. A live attack runs whenever the cloud model is available. [TBD: replace stand-ins with live recordings, RUNBOOK §6.2b step 5, after T-003]

## 3. How we use Firebase AI Logic hybrid inference

Every request is sorted by **what it carries**, and each class gets one inference mode. The policy is data in Remote Config (`routing_policy`), but a hard floor in code means Remote Config can never let S0 or S1 reach the cloud ([`web/src/core/routing.ts`](web/src/core/routing.ts)).

| Class | What it carries | Web (`firebase/ai`) | iOS (`FirebaseAILogic` 12.19.3) | No on-device model |
|---|---|---|---|---|
| **S0** | anything that touches the vault (referee, fix plan, vault-text match) | `ONLY_ON_DEVICE`, after a fresh availability check | on-device-only session (`FirebaseAI.SystemLanguageModel.default`, never a `HybridModel`) | deterministic code, labelled RULES-ONLY. **Never the cloud.** |
| **S1** | the original, unredacted photo (pre-screen) | `ONLY_ON_DEVICE`, after a fresh availability check | on-device-only session over Vision text | Tier-0 rules (RULES-ONLY). **Never the cloud.** |
| **S2** | public explanations of clue types | `PREFER_ON_DEVICE`, real SDK cloud fallback | `HybridModel` | cloud, badged IN_CLOUD |
| **S3** | the attacker (pass B, re-attack) | `ONLY_IN_CLOUD` | `generativeModel` (cloud only) | n/a |
| **S4** | Judge Mode samples with the fake vault | `PREFER_ON_DEVICE` | `HybridModel` (planned) | cloud, so judges without Nano see every AI step |

Why the fresh check matters: without `window.LanguageModel` (Safari, Firefox, mobile browsers), the web SDK silently sends even `ONLY_ON_DEVICE` requests to the cloud. So the gate checks `availability()` immediately before every S0/S1 call, with no cache, and runs deterministic code instead when the answer is not `'available'`.

### Jobs and call sites

Status words: **built** = in the hosted app; **verified** = seen working with the real model; **deferred** = cut for the demo path (D-141).

| Job | Class | Mode / engine | Model | Where (file) | Status |
|---|---|---|---|---|---|
| W1 Vault | local | code: AES-GCM, non-extractable key in IndexedDB | none | [`web/src/vault/vaultStore.ts`](web/src/vault/vaultStore.ts), [`web/src/vault/crypto.ts`](web/src/vault/crypto.ts) | built |
| W2 Tier-0 guard | local | MediaPipe faces, Tesseract OCR, EXIF strip by re-encode (not generative) | none | [`web/src/tier0/tier0.ts`](web/src/tier0/tier0.ts), [`web/src/tier0/faces.ts`](web/src/tier0/faces.ts), [`web/src/tier0/ocr.ts`](web/src/tier0/ocr.ts), [`web/src/tier0/exif.ts`](web/src/tier0/exif.ts) | built |
| W3a Pre-screen of the original | S1 | `ONLY_ON_DEVICE`, 768 px JPEG + JSON schema | Gemini Nano | [`web/src/ai/jobs/prescreen.ts`](web/src/ai/jobs/prescreen.ts), [`web/src/ai/jobs/prescreenClues.ts`](web/src/ai/jobs/prescreenClues.ts) | built, verified on Nano |
| W3b Vault-text match | S0 | `ONLY_ON_DEVICE` | Gemini Nano | deterministic matcher today: [`web/src/tier0/fuzzy.ts`](web/src/tier0/fuzzy.ts) | Nano job not built (T-067) |
| W4 Referee | S0 | `ONLY_ON_DEVICE`, JSON schema with per-call ID enums | Gemini Nano | [`web/src/ai/jobs/referee.ts`](web/src/ai/jobs/referee.ts); rules referee [`web/src/core/referee.ts`](web/src/core/referee.ts) | built, verified on Nano |
| W5 Fix planner | S0 | rules plan (masks every cited removable clue) | none yet | [`web/src/core/fixPlan.ts`](web/src/core/fixPlan.ts) | rules built; Nano planner not built (T-078) |
| W6 Masks and crop | local | solid fills, 15% padding | none | [`web/src/core/mask.ts`](web/src/core/mask.ts), [`web/src/core/boxes.ts`](web/src/core/boxes.ts) | built |
| W7 Egress Gate, tripwire, Ledger | all | code | n/a | [`web/src/ai/egressGate.ts`](web/src/ai/egressGate.ts), [`web/src/ai/tripwire.ts`](web/src/ai/tripwire.ts), [`web/src/core/ledger.ts`](web/src/core/ledger.ts) | built |
| W8 Clue explainer | S2 | `PREFER_ON_DEVICE` | Nano, else `gemini-3.5-flash-lite` | model factory `explainModel` in [`web/src/ai/models.ts`](web/src/ai/models.ts) | factory and gate path only; no screen yet (T-083, deferred) |
| C1 Pass A (grounded notes) | S3 | `ONLY_IN_CLOUD` + Google Search, display only | `gemini-3.5-flash-lite` (Remote Config `adversary_model`) | factory `adversaryAModel` in [`web/src/ai/models.ts`](web/src/ai/models.ts) | not wired; grounding needs the paid tier (T-070) |
| C2 Pass B (structured attack) | S3 | `ONLY_IN_CLOUD`, `responseJsonSchema` | `gemini-3.5-flash-lite` (Remote Config `adversary_model`; was `gemini-3.8-flash`, D-159) | [`web/src/ai/jobs/adversaryB.ts`](web/src/ai/jobs/adversaryB.ts), schema [`shared/prompts/advB.v1.schema.json`](shared/prompts/advB.v1.schema.json) | built; tested with a fake model only [TBD: first real run through the app] |
| C3 Re-attack and compare | S3 | as C2, on the fixed copy | as C2 | [`web/src/ui/check/fixFlow.ts`](web/src/ui/check/fixFlow.ts), [`web/src/ui/check/runSend.ts`](web/src/ui/check/runSend.ts) | built; fake model only |
| Judge Mode (S4) | S4 | `PREFER_ON_DEVICE` | Nano, else `gemini-3.5-flash-lite` | [`web/src/ui/judge/judgeFlow.ts`](web/src/ui/judge/judgeFlow.ts), [`web/src/ui/judge/judgeRun.ts`](web/src/ui/judge/judgeRun.ts) | built |
| I1 Vault (iOS) | local | Keychain, this device only | none | [`ios/StrangersEyes/Vault/VaultStore.swift`](ios/StrangersEyes/Vault/VaultStore.swift) | in progress [TBD: iOS status] |
| I2 Tier-0 (iOS) | local | Vision faces and text, ImageIO re-encode | none | [`ios/StrangersEyes/Tier0/Tier0.swift`](ios/StrangersEyes/Tier0/Tier0.swift), [`ios/StrangersEyes/Tier0/ImagePipeline.swift`](ios/StrangersEyes/Tier0/ImagePipeline.swift) | in progress [TBD: iOS status] |
| I3 FM pre-screen | S1 | on-device-only session, `@Generable` | Apple Foundation Models | not started | only if time allows (D-155) |
| I4 FM referee and rules fix | S0 | on-device-only session, `@Generable`; rules fallback | Apple Foundation Models | [`ios/StrangersEyes/AI/RefereeJob.swift`](ios/StrangersEyes/AI/RefereeJob.swift), [`ios/StrangersEyes/Core/Referee.swift`](ios/StrangersEyes/Core/Referee.swift), [`ios/StrangersEyes/Core/FixPlan.swift`](ios/StrangersEyes/Core/FixPlan.swift) | in progress [TBD: iOS status] |
| I5 Explainer | S2 | `HybridModel` | FM, else Gemini | not started | only if time allows (D-155) |
| I6 Gate, Ledger, HUD (iOS) | all | code | n/a | [`ios/StrangersEyes/AI/EgressGate.swift`](ios/StrangersEyes/AI/EgressGate.swift), [`ios/StrangersEyes/Ledger/Ledger.swift`](ios/StrangersEyes/Ledger/Ledger.swift), [`ios/StrangersEyes/UI/RouterHUD.swift`](ios/StrangersEyes/UI/RouterHUD.swift) | in progress [TBD: iOS status] |

**Where the SDK is actually called.**
- Web: [`web/src/ai/models.ts`](web/src/ai/models.ts) is the only file that calls `getGenerativeModel` (one factory per class and job). [`web/src/ai/egressGate.ts`](web/src/ai/egressGate.ts) is the only file that calls `generateContent` / `generateContentStream`. [`scripts/check-boundaries.mjs`](scripts/check-boundaries.mjs) fails the build if any other file does.
- iOS: [`ios/StrangersEyes/AI/EgressGate.swift`](ios/StrangersEyes/AI/EgressGate.swift) has `import FirebaseAILogic`, the on-device `ai.generativeModelSession(model: FirebaseAI.SystemLanguageModel.default, …)` for S0/S1 and the cloud `ai.generativeModel(…)` for pass B. No `HybridModel` call site exists yet [TBD: I5 / S4 if built].
- Model IDs, thinking levels, timeouts and prompt versions come from Remote Config ([`remoteconfig.template.json`](remoteconfig.template.json)). Prompts are versioned files in [`shared/prompts/`](shared/prompts/); Remote Config only selects a bundled version and never carries prompt text.

### The Egress Gate (one door for every AI call)

[`web/src/ai/egressGate.ts`](web/src/ai/egressGate.ts) (and its Swift mirror) handles every Firebase AI Logic call, on the device or in the cloud. For each call it:
1. checks the class the policy expects for that job, and refuses S0/S1 unless Nano (or Apple FM) reports `available` in that same call;
2. re-checks the **exact outgoing image bytes**: strict JPEG with no APP1/APP13/GPS metadata, the hash the user consented to, zero faces, zero OCR hits of vault text;
3. scans every dynamic prompt segment for vault strings and pin coordinates (an S2 payload that contains one is reclassified S0 and stays on the device);
4. runs the call, then confirms the route: a device-only call that reports `in_cloud` is treated as a breach and stops all cloud calls until reload;
5. writes exactly one Ledger entry (IDs, kinds, hashes, byte counts, route, latency; never vault text).

The Router HUD and the Cloud Ledger ("Faces sent: 0 · Vault items sent: 0", and "What the cloud saw") are drawn from those entries only.

## 4. Other Firebase products

- **App Check:** reCAPTCHA Enterprise on the hosted site; the debug provider on localhost and in the iOS Simulator.
- **Anonymous Auth:** per-user AI Logic quotas without any identity.
- **Remote Config:** routing policy, model names, prompt versions, timeouts, the daily attacker cap and a kill switch.
- **Hosting:** the web app at https://strangers-eyes.web.app.

## 5. Features

- First-run 18+ and "own photos only" confirmation.
- Private vault: home and work pins (one-shot location or manual coordinates), names, employer. Encrypted, never synced, never uploaded. Burn vault in two taps.
- Tier-0 guard on the device: face detection, OCR, vault-text matching, metadata stripping.
- Gemini Nano pre-screen of the original photo (S1), with solid masks applied before anything can leave.
- Consent sheet that shows the exact redacted image that will be sent.
- Cloud attacker (pass B) that lists the clues it used, with the confidence of each guess.
- On-device referee (S0): compares the attacker's guesses with your vault and shows **distance bands to your own pins** ("within 1 km", "same city"), never a map pin or address for the guess.
- Verdict card, one-tap fix (masks or crop), re-attack, and a before/after compare ending in **"Risk reduced"**, never "safe".
- Egress Gate, Cloud Ledger, "What the cloud saw" and the Router HUD.
- Judge Mode with autoplay and labelled recorded answers when the live attacker is unavailable.
- iOS app in progress (see §10).

## 6. Safety, privacy and dual use

**What never leaves the device:** the vault (pins, names, employer) and the original photo. The cloud only receives an EXIF-free copy with faces and vault-matched text solid-masked, after you approve the exact image shown. The attacker never learns whether it guessed right: grading happens on the device.

- Masks are solid fills, never blur. Faces are always masked, and the gate blocks any detected face.
- Photos come from local files only; there is no URL input.
- Distances are computed in code (haversine plus bands), only relative to your own pins. No map, coordinates or address are shown for the attacker's guess.
- If Gemini declines or a safety filter blocks the request, the app shows "on-device findings only" and never retries with rephrased or role-play prompts.
- Copy says "Risk reduced", never "safe", and always shows the attacker's confidence.
- **Re-attack disclosure:** when you re-attack, the cloud sees which areas you masked, but never why.
- **Honesty about dual use:** the raw attacker JSON is visible in the browser's DevTools. The added harm over the public Gemini app is close to zero, and App Check, per-user limits, the daily cap and the kill switch do not stop a determined attacker. The app is built to show you your exposure, not to locate anyone.
- **Data tier:** [TBD: final tier after T-003]. Today the hosted app uses the Gemini free tier: Google may use the redacted image to improve its products, Search grounding is off, and free-tier services may not be offered to users in the EEA, UK or Switzerland. On the paid tier, prompts are not used for training. Users must be 18+.

## 7. Prior art and what is new

- "Raising Awareness of Location Information Vulnerabilities in Social Media Photos using LLMs", ACM CHI 2025, arXiv 2503.20226, DOI 10.1145/3706598.3714074: a warn, edit and re-analyse loop, studied with 19 participants over two weeks.
- Geo-Safe-Filter (TikTok TechJam 2025): Gemini finds clues, Grounding DINO draws boxes, OpenCV blurs; cloud backend.

**What is new here:**
1. a private on-device vault that acts as ground truth;
2. an on-device referee that grades the attacker, which never sees the result;
3. an enforced Egress Gate with a ledger that shows what left the device and blocks leaks as they happen;
4. routing by data-sensitivity class, stored as data in Remote Config and visible in the HUD.

## 8. Measured results and limitations

**Benchmark (25 builder-owned photos of public places, pass B only, k = 3):** [TBD: table from `benchmark/results/summary.md` after T-152/T-153, with model, prompt versions, date, `d` vs `e`]. The benchmark harness has not run yet.

**Measured so far:**

| What | Result | Where measured |
|---|---|---|
| Referee (S0) on real Gemini Nano, through the Egress Gate | `ON_DEVICE`, ~6.1 s warm, 15.6 s cold | Chrome 157 on an Apple-silicon Mac, Nov 21 (D-154) |
| Pre-screen (S1) on real Gemini Nano, through the Egress Gate | `ON_DEVICE`, 2 clues, ~9.5 s warm, 13.0 s cold | same |
| Tier-0 OCR on a "LUCAS" tag prop, 30 placements | 14/30 with default binarisation; 30/30 with the union of four binarisation passes | Chrome 156, Nov 20 (T-037) |
| Free-tier `gemini-3.8-flash` latency in the adversary spike | 80–143 s when it answered, frequent 500/503 (server overload; 180 s server deadline) | Nov 21–23 (T-031) |
| Free-tier `gemini-3.5-flash-lite`, same attack prompt, schema and images | valid JSON in 4.6 s (LOW, 1024 px) and 10.2 s (MEDIUM, 1536 px) | Nov 23 (T-031 diagnosis) |

**Limitations (stated plainly):**
- The cloud attacker (pass B) has **not yet run end to end through the app with real quota**; it has been tested with a fake model behind the real gate. [TBD: first real run]
- The attacker is `gemini-3.5-flash-lite` (D-159): free-tier `gemini-3.8-flash` was overloaded (500/503 on every call Nov 20–23). Lite is nominally a weaker attacker, so the app may understate what a stronger model could infer; the benchmark is measured on lite. Pass B times out at 45 s.
- Judge Mode's recorded answers are team-written stand-ins (see §2).
- Grounded pass A (Search notes) and the S2 explainer are not in this build.
- Without Nano, S0/S1 run as deterministic RULES-ONLY code. Nano needs capable desktop hardware; Nano on the hosted origin is not yet verified (T-109).
- Benchmark limits, once it runs: public places are probably easier to locate than homes; one region; n = 25; builder-owned photos; pass B only. Published work shows accuracy varies a lot by region (arXiv 2502.11163).
- The Cloud Ledger lives in memory and resets on reload.

## 9. Run it yourself

### Web
Requirements: Node ≥ 24.12 (tested with 26.8.2), npm, and your own Firebase project.
1. In your Firebase project: enable Firebase AI Logic (Gemini Developer API), Anonymous Auth, App Check with reCAPTCHA Enterprise, and Remote Config. Publish [`remoteconfig.template.json`](remoteconfig.template.json).
2. Put your project's web config and reCAPTCHA Enterprise site key in [`web/src/firebase/config.ts`](web/src/firebase/config.ts) (these values are public, not secret).
3. Register an App Check debug token for localhost and put it in `web/.env.development.local` as `VITE_APPCHECK_DEBUG_TOKEN=…` (see [`web/.env.example`](web/.env.example)). Never commit that file.
4. Run:
   ```bash
   cd web
   npm ci
   npm run dev      # http://localhost:5173
   npm run check    # typecheck + boundary rules + prompt and image checks + Vitest
   npm run build    # production build + dist check
   ```
5. Deploy: `firebase deploy --only hosting,remoteconfig --project <your-project>`.

Optional: for Gemini Nano, use desktop Chrome with on-device AI enabled (`chrome://settings/ai` and `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`), then reload; the capability panel shows Nano's state.

[TBD: steps confirmed by the clean-clone test, T-169]

### iOS
- Xcode 27.2, [XcodeGen](https://github.com/yonaskolb/XcodeGen), the iOS 27.0 Simulator (iPhone 18 Pro), Apple Intelligence turned on on the Mac.
- **firebase-ios-sdk is pinned to exactly 12.19.3 because `HybridModel` was removed in 13.0.0.** 12.19.3 is the last release where Firebase AI Logic itself runs Apple Foundation Models on the device and reports the source (the iOS hybrid API is marked Experimental).
- Bring your own Firebase project: replace [`ios/StrangersEyes/Resources/GoogleService-Info.plist`](ios/StrangersEyes/Resources/GoogleService-Info.plist) with your project's file, and register your own App Check debug token, passed to the app as the `AppCheckDebugToken` environment variable.
```bash
cd ios && xcodegen generate && cd ..
xcodebuild -project ios/StrangersEyes.xcodeproj -scheme StrangersEyes -configuration Debug \
  -destination "platform=iOS Simulator,name=iPhone 18 Pro" ARCHS=arm64 build
```
On an 8 GB Mac, do not run Chrome's Gemini Nano and the Simulator's Foundation Models at the same time.

[TBD: iOS status and verified build steps, T-131 / T-169]

## 10. iOS status

A lean SwiftUI app is being built now (D-155): the vault, Vision Tier-0 with solid masks, a Swift Egress Gate with Ledger and HUD, an Apple Foundation Models referee with a rules fallback, and the cloud pass B after consent, then verdict bands, a rules fix and re-attack. The source is under [`ios/StrangersEyes/`](ios/StrangersEyes/). [TBD: iOS status: what builds, what was seen running in the Simulator, FM latency]

## 11. Repo map

```
web/                 the web PWA (Vite, React, TypeScript)
  src/ai/            Egress Gate, model factories, tripwire, the AI jobs (src/ai/jobs/)
  src/core/          routing policy, bands, verdict, referee rules, fix plan, ledger
  src/tier0/         import, EXIF strip, faces, OCR, vault-text matcher
  src/vault/         encrypted vault store, burn
  src/ui/            screens, Check flow, Judge Mode, HUD and Ledger
  public/samples/    Judge Mode samples, manifest and SOURCES.md
ios/                 SwiftUI app (XcodeGen spec in ios/project.yml)
shared/prompts/      versioned prompts and schemas (with manifest.json)
shared/strings/      UI copy (en.json)
shared/testvectors/  cross-platform test vectors (Vitest and XCTest)
scripts/             boundary, prompt, image and dist checks; sample tools
benchmark/           adversary spike harness [TBD: benchmark harness and results]
docs/                spec, architecture, API notes, runbook, tasks, progress, devlog
remoteconfig.template.json, firebase.json
```

## 12. Built during #BuildHybridAI

- New project, started Nov 19 2026. There is no pre-existing code.
- Written with **Claude Code** (an AI coding assistant), starting from the create-vite template. The team made the product and design decisions.
- Third-party libraries and their licences: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## 13. Roadmap

- Android with Gemini Nano, on the same Firebase project (cut from this entry: no device to test on).
- Grounded pass A notes with Search Suggestions, and the S2 explainer, once on the paid tier.
- A "check before you post" browser extension; non-English UI.

## 14. License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
