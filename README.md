# Strangers' Eyes: see your photo the way a stalker's AI would, before you post it

[Live app](https://strangers-eyes.web.app) · [Demo video, under 3 min](https://youtu.be/MED_9p9uS9g) · [Source](https://github.com/PRIEST099/strangers-eyes) · [Apache-2.0](LICENSE) · Built for #BuildHybridAI 2026: Web PWA (hosted) and iOS (SwiftUI, run in the Simulator) · [USER: platforms and "Best of" category, T-172]

- **The cloud plays the attacker.** Gemini, through Firebase AI Logic, tries to work out where your photo was taken, from a redacted copy.
- **Your device holds the answers.** It grades the guess against a private vault (home and work pins, your employer, your children's names), masks the clues the attacker used, and lets it try again.
- **The attacker never learns whether it guessed right.** The vault and the original photo never leave the device.
- **Measured on the hosted app** (Nov 24; Berlin sample photo through the normal Check flow, made-up vault of two pins and a child's name, no Gemini Nano; from the consent screen and Cloud Ledger): one redacted 1536 × 1024 JPEG of 338 KB (metadata stripped, 0 faces, 0 vault matches) plus fixed instructions, about 456 KB per request, was sent. The 734 KB original, the pins and the name were not (0 vault items, per the gate); the private pre-checks ran as local rules. All three attack attempts failed (two timeouts, one unreachable; two were retried once after a server error: five requests, 2,279 KB), so this covers the first attack only; a full run also sends the re-attack's copy. Details in [`docs/DEVPOST.md`](docs/DEVPOST.md).

![Home: the tagline and the animated hero illustration](docs/img/gallery/01-home.png)

---

## 1. Try it in 2 minutes (Judge Mode)

1. Open **https://strangers-eyes.web.app** in any browser. No login, no cost.
2. Confirm you are 18+, choose **Open Judge Mode** (or open `https://strangers-eyes.web.app/?judge=1`), pick a sample and press **Run this sample**. Autoplay runs pre-screen, consent, attack and verdict, then fix and re-attack when a mask can help.
3. Turn on **Technical details** to see where each AI step ran (`ON-DEVICE`, `IN CLOUD`, `RULES-ONLY` or `CACHED SAMPLE`) and how long it took. The **Cloud Ledger** counts what left the device.

No on-device AI is needed; with Gemini Nano in desktop Chrome, the private steps run on Nano instead of rules.

**Three outcomes: a fix that works, one that isn't enough, a photo that can't be fixed.** Live attacks through the app on Nov 23, first answer kept; a live run today may differ.

| Sample | First attack | After the fix | Verdict |
|---|---|---|---|
| 1. Station forecourt | read the station sign and named the **wrong** city, about 100 km away | sign masked; the re-attack found the right city from the building itself | Still exposed |
| 2. Level crossing by a street sign (Berlin) | street level, from the street sign and its house-number plate: within 5 km of the made-up home and work pins | both masked; the re-attack got only the city | **Risk reduced** (amber → low, confidence shown) |
| 3. Castle courtyard + drawn "LUCAS" lunchbox | 0.1 km from the made-up work pin | only clues a mask can't remove | Red: crop or don't post |

> **About the samples (please read).** The three photos are **CC0 photos of public places** from Wikimedia Commons, two in Ljubljana and one in Berlin (credits in [`web/public/samples/SOURCES.md`](web/public/samples/SOURCES.md)). We solid-masked people, adverts showing people and real number plates, and **drew in a prop** (the "LUCAS" lunchbox, which the app masks on the device before anything is sent). The vault is made up; each sample's pins sit in a park and a square near the photo. Sample 2 replaced a bike-share photo that ended "Still exposed": we tried six Berlin photos, Google's model was overloaded during most runs, and the level crossing is the one that got a complete answer. The **recorded answers** that ship with the samples are the real Nov 23 answers (`gemini-3.5-flash-lite`); they replay, labelled `CACHED SAMPLE`, only when the live attacker is unavailable (offline, quota or daily cap, kill switch, App Check failure, a timeout or a server error). A replay sends nothing itself, but the Cloud Ledger still counts what already left: a live attempt that timed out or got a server error had sent the redacted copy, and without Nano the S4 sample pre-screen and referee run in the cloud. It reads zero only when Nano ran the private steps and no live attack was tried (offline, daily cap, kill switch).

### Gallery

| | |
|---|---|
| ![Judge Mode run](docs/img/gallery/02-judge-run.png) | ![A verdict as distance bands to the made-up pins, with the Cloud Ledger](docs/img/gallery/03-verdict.png) |
| A Judge Mode run, each AI step labelled with where it ran | Level crossing, first verdict: distance bands to the made-up pins, never a map pin (recorded answer, CACHED SAMPLE) |
| ![Fix and re-attack, before and after](docs/img/gallery/04-reattack.png) | ![The Egress Gate blocks an unmasked vault match](docs/img/gallery/05-blocked.png) |
| Fix and re-attack: sign and plate masked, only the city. Risk reduced, never "safe" (CACHED SAMPLE) | The Egress Gate blocks a copy that still shows "LUCAS": 0 bytes sent |
| ![About: what leaves this device](docs/img/gallery/06-about-routing.png) | ![Settings: what runs where on this browser](docs/img/gallery/07-capabilities.png) |
| What leaves this device | What runs where on this browser |

## 2. Why it matters, and why hybrid

- Turning location off strips GPS data, not the street sign. Published studies report **up to** about 60% street-level (≤1 km) accuracy on social-media-like images, much lower on Street View-style images ([Privacy International, "Nowhere to Hide?"](https://privacyinternational.org/report/5736/nowhere-hide-privacy-risks-and-policy-implications-ai-geolocation), Feb 2026), and lower again in sparsely populated regions (arXiv 2502.11163, EMNLP 2025).
- Our small test agrees (§7): a free-tier Gemini model placed 5 of 10 GPS-free photos of public places within 5 km, two at about 200–250 m, and refused none.
- **Who it is for:** a parent posting a park photo, a survivor of domestic abuse who has moved, a seller photographing an item at home.

**Why it has to be hybrid.** Placing a photo needs world-scale visual knowledge that only a large cloud model has. Judging the attack needs your secrets, which must never leave the device. The app splits the job at exactly that line.

## 3. How we use Firebase AI Logic hybrid inference

![Architecture: device lane, Egress Gate, cloud lane](docs/img/architecture.png)

Every request is sorted by **what it carries**, and each class gets one inference mode. The policy is data in Remote Config (`routing_policy`); a hard floor in code means Remote Config can never let S0 or S1 reach the cloud ([`web/src/core/routing.ts`](web/src/core/routing.ts)).

![Routing by payload class, S0 to S4](docs/img/routing.png)

| Class | What it carries | Web (`firebase/ai`) | iOS (`FirebaseAILogic` 12.19.3) | No on-device model |
|---|---|---|---|---|
| **S0** | anything touching the vault (referee, fix plan, vault-text match) | `ONLY_ON_DEVICE`, after a fresh availability check | on-device-only session (`FirebaseAI.SystemLanguageModel.default`, never a `HybridModel`) | deterministic code, labelled RULES-ONLY. **Never the cloud.** |
| **S1** | the original photo (pre-screen) | `ONLY_ON_DEVICE`, after a fresh availability check | on-device-only session: Apple FM reads Vision's OCR text and scene labels (text only, never the image) | rules (RULES-ONLY). **Never the cloud.** |
| **S2** | public explanations of clue types | `PREFER_ON_DEVICE`, real cloud fallback | `HybridModel` planned (T-129) | cloud, labelled IN CLOUD |
| **S3** | the attacker (pass B, re-attack) | `ONLY_IN_CLOUD` | `generativeModel` (built, not yet run) | n/a |
| **S4** | Judge Mode samples with the fake vault | `PREFER_ON_DEVICE` | Judge Mode replays the recorded answers; Apple FM grades on the device | cloud, so judges without Nano see every step |

Why the fresh check matters: without `window.LanguageModel` (Safari, Firefox, mobile browsers) the web SDK silently sends even `ONLY_ON_DEVICE` requests to the cloud. So the gate checks `availability()` immediately before every S0/S1 call, with no cache, and runs deterministic code unless the answer is `'available'`.

### Jobs and call sites

**built** = in the hosted app; **verified** = seen working with the real model.

| Job | Class, mode | Model | Where | Status |
|---|---|---|---|---|
| W1 Vault | local, AES-GCM, non-extractable key | none | [`vaultStore.ts`](web/src/vault/vaultStore.ts) | built |
| W2 Tier-0 guard | local: faces, OCR, EXIF strip | MediaPipe, Tesseract | [`tier0.ts`](web/src/tier0/tier0.ts) | built |
| W3a Pre-screen of the original | S1 `ONLY_ON_DEVICE`, JSON schema | Gemini Nano | [`prescreen.ts`](web/src/ai/jobs/prescreen.ts) | verified on Nano |
| W3b Vault-text match | S0, deterministic today | (Nano planned, T-067) | [`fuzzy.ts`](web/src/tier0/fuzzy.ts) | rules built |
| W4 Referee | S0 `ONLY_ON_DEVICE`, per-call ID enums | Gemini Nano; rules fallback | [`ai/jobs/referee.ts`](web/src/ai/jobs/referee.ts), [`core/referee.ts`](web/src/core/referee.ts) | verified on Nano |
| W5 Fix planner, W6 masks | S0 rules; solid fills, 15% padding | (Nano planner T-078) | [`fixPlan.ts`](web/src/core/fixPlan.ts), [`mask.ts`](web/src/core/mask.ts) | built |
| W7 Egress Gate, tripwire, Ledger | all | n/a | [`egressGate.ts`](web/src/ai/egressGate.ts), [`tripwire.ts`](web/src/ai/tripwire.ts), [`ledger.ts`](web/src/core/ledger.ts) | built |
| W8 Clue explainer | S2 `PREFER_ON_DEVICE` | Nano, else flash-lite | `explainModel` in [`models.ts`](web/src/ai/models.ts) | factory only (deferred, T-083) |
| C1 Pass A (grounded notes) | S3 `ONLY_IN_CLOUD` + Search, display only | `adversary_model` | `adversaryAModel` in [`models.ts`](web/src/ai/models.ts) | not wired; grounding off on free tier |
| C2 Pass B (attack) | S3 `ONLY_IN_CLOUD`, JSON schema; Remote Config `adversary_fallback_models` can name backup models for a 5xx or 429, but the list ships empty (no failover today) | `gemini-3.5-flash-lite` (D-159) | [`adversaryB.ts`](web/src/ai/jobs/adversaryB.ts), [`advB.v1.schema.json`](shared/prompts/advB.v1.schema.json) | verified live on the 3 samples, Nov 23 |
| C3 Re-attack and compare | S3, on the fixed copy | as C2 | [`fixFlow.ts`](web/src/ui/check/fixFlow.ts) | verified live on samples 1 and 2 |
| Judge Mode | S4 `PREFER_ON_DEVICE` | Nano, else flash-lite | [`judgeRun.ts`](web/src/ui/judge/judgeRun.ts) | built |
| I1–I2 Vault, Tier-0 (iOS) | local: protected file; Vision masks | none | [`VaultStore.swift`](ios/StrangersEyes/Vault/VaultStore.swift), [`Tier0.swift`](ios/StrangersEyes/Tier0/Tier0.swift) | built, Simulator |
| I4 Referee and rules fix (iOS) | S0 on-device-only session, `@Generable` | Apple FM; rules floor | [`RefereeJob.swift`](ios/StrangersEyes/AI/RefereeJob.swift) | verified on Apple FM, Simulator |
| I6 Gate, Ledger, HUD (iOS) | all | n/a | [`EgressGate.swift`](ios/StrangersEyes/AI/EgressGate.swift) | built, Simulator |
| I7 Judge Mode (iOS) | S4, recorded Gemini answers graded on the device | Apple FM; rules floor | [`JudgeSamples.swift`](ios/StrangersEyes/Judge/JudgeSamples.swift), [`JudgeViews.swift`](ios/StrangersEyes/UI/JudgeViews.swift) | built, Simulator |
| I3 Pre-screen (iOS) | S1 on-device-only session, text only (OCR lines and scene labels) | Apple FM; RULES-ONLY fallback | [`PrescreenJob.swift`](ios/StrangersEyes/AI/PrescreenJob.swift) | verified on Apple FM, Simulator (Nov 24) |
| I5 Explainer (iOS) | S2 `HybridModel` | Apple FM, else cloud | — | open (T-129) |

**Where the SDK is called.**
- Web: [`egressGate.ts`](web/src/ai/egressGate.ts) is the only production file that calls `generateContent` / `generateContentStream`; [`models.ts`](web/src/ai/models.ts) is the only one that calls `getGenerativeModel` (one factory per class and job); [`init.ts`](web/src/firebase/init.ts) calls `getAI` with the `GoogleAIBackend`. [`scripts/check-boundaries.mjs`](scripts/check-boundaries.mjs) fails the build if any other file calls the SDK (the only exceptions are DEV-only Day-1 spikes in `web/src/dev/spikes/`, never in production builds).
- iOS: [`EgressGate.swift`](ios/StrangersEyes/AI/EgressGate.swift) uses `ai.generativeModelSession(model: FirebaseAI.SystemLanguageModel.default, instructions:)` for S0 and S1 (a new session per job) and `ai.generativeModel(modelName:generationConfig:systemInstruction:)` with `generateContent` for pass B. No `HybridModel` call site yet (T-129).
- Model IDs, timeouts and prompt versions come from Remote Config; prompt text lives only in [`shared/prompts/`](shared/prompts/). Pass B times out at 45 s, no retry on timeout.

### The Egress Gate (one door for every AI call)

For each call, [`egressGate.ts`](web/src/ai/egressGate.ts) (and its Swift mirror):
1. checks the class the policy expects, and refuses S0/S1 unless Nano (or Apple FM) reports `available` in that same call;
2. re-checks the **exact outgoing bytes**: strict JPEG with no APP1/APP13/GPS metadata, the hash you consented to, zero faces, zero OCR hits of vault text;
3. scans every dynamic prompt segment for vault strings and pin coordinates (an S2 payload containing one becomes S0 and stays on the device);
4. confirms the route afterwards: a device-only call that reports `in_cloud` is a breach and stops all cloud calls until reload;
5. writes one Ledger entry (IDs, hashes, byte counts, route, latency; never vault text). The Cloud Ledger and the per-step route labels are drawn from those entries only.

**Other Firebase products:** App Check (reCAPTCHA Enterprise on the hosted site, the debug provider on localhost and in the Simulator); Anonymous Auth (per-user AI quotas without identity; web only, T-120); Remote Config (routing, models, prompt versions, timeouts, daily cap, kill switch; iOS uses bundled defaults until T-120); Hosting. Firestore was cut (D-141): the app writes nothing to any database.

## 4. Safety, privacy and misuse

**Never leaves the device:** the vault and the original photo. The cloud only receives an EXIF-free copy with faces and vault-matched text solid-masked, after you approve the exact image.

- **Not a geolocation tool.** A "where was this taken" app would help stalkers. So the app never shows the attacker's guessed place (no place name, map pin or address): only how precise the guess was (street, city, country…), its confidence and the kinds of clues it used, plus **distance bands to your own pins**, computed in code (haversine). With an empty vault it tells you how exposed a photo is, not where it is.
- S0 and S1 fail closed to RULES-ONLY code. Masks are solid fills, never blur; the gate blocks any detected face. Photos come from local files only. First run asks for 18+ and "own photos only".
- If Gemini declines or a safety filter blocks the request, the app shows "on-device findings only" and never retries or re-attacks. Copy says "Risk reduced", never "safe", with confidence. Grounded pass A (display-only, never fed to code) and the S2 explainer are not in this build.
- **Honest limits:** the raw attacker answer is visible in DevTools, which adds little over asking Gemini directly; App Check, per-user limits, the daily cap and the kill switch limit volume, not intent. On a re-attack the cloud sees which areas you masked, never why.
- **Data tier:** the hosted app runs on the Gemini Developer API **free tier** (Firebase Spark, no billing). Google may use the redacted image and prompt to improve its products (the consent screen says so), and free-tier services may not be offered in the EEA, the UK or Switzerland. Search grounding is off.

## 5. How it compares

- **AI and OSINT geolocation** ([GeoSpy](https://www.404media.co/the-powerful-ai-tool-that-cops-or-stalkers-can-use-to-geolocate-photos-in-seconds/), [Bellingcat's geolocation work](https://www.bellingcat.com/tag/geolocation/)): the attacker's view. We run it as a self-test and hide the answer.
- **EXIF strippers** ([Scrambled Exif](https://f-droid.org/en/packages/com.jarsilio.android.scrambledeggsif/)): remove GPS, not the street sign in the picture.
- **Image cloaking** ([Fawkes](https://news.uchicago.edu/story/new-tool-protect-yourself-against-facial-recognition-software), UChicago SAND Lab): protects faces from recognition models, not places.
- **Before-you-post location checkers:** "Raising Awareness of Location Information Vulnerabilities in Social Media Photos using LLMs" ([ACM CHI 2025, arXiv 2503.20226](https://arxiv.org/abs/2503.20226); a warn, edit and re-analyse loop with 19 participants) and [Geo-Safe-Filter](https://awpbash.github.io/projects/geo-safe-filter) (TikTok TechJam 2025; Gemini via API finds the clues, then they are blurred). Both send the photo to a cloud model and don't know which places matter to you.

**New here:** a private on-device vault as ground truth; an on-device referee the attacker never hears from; an enforced Egress Gate with a ledger; routing by data sensitivity, stored in Remote Config.

## 6. iOS status

A lean SwiftUI app (D-155) in [`ios/StrangersEyes/`](ios/StrangersEyes/), run in the iOS 27.0 Simulator: the vault (a file with complete file protection, not the Keychain), Vision Tier-0 masks, a Swift Egress Gate with Ledger and route labels, an Apple Foundation Models referee with a rules floor, consent, verdict bands, fix and re-attack. **iOS Judge Mode** replays the same recorded Gemini answers as the web, graded by Apple FM on the device. An Apple FM **pre-screen** ([`PrescreenJob.swift`](ios/StrangersEyes/AI/PrescreenJob.swift)) reads Vision's OCR text and scene labels, never the image, as S1 on the device, falling back to RULES-ONLY. On Nov 24 a UI test ran Judge sample 2 with no stand-in attacker: pre-screen ON-DEVICE (Apple FM), the recorded attack (CACHED SAMPLE), referee ON-DEVICE (19.4 s), fix, recorded re-attack, referee ON-DEVICE (14.2 s), ending **"Risk reduced"** with 0 requests and 0 bytes sent ([`ios/NOTES.md`](ios/NOTES.md)). An earlier Nov 21 run used a clearly labelled DEBUG stand-in attacker. 32 XCTests pass (Nov 24) and share cross-platform test vectors with the web (bands, fuzzy match, referee, verdict). **Not done:** the live Gemini call on iOS (built, not run), Anonymous Auth and Remote Config (T-120), the `HybridModel` explainer (T-129).

## 7. Measured results and limitations

### The adversary test (Day-1 spike, Nov 23)

Aggregates only: [`day1-adversary.md`](benchmark/spike/day1-adversary.md). 10 openly licensed Wikimedia Commons photos of public places, re-encoded with no GPS or EXIF, faces masked; pass B only, `gemini-3.5-flash-lite`, free tier; up to 3 runs per photo (third skipped when two agreed), 20 runs; DEV-only harness [`run-spike.mjs`](benchmark/spike/run-spike.mjs), not the app.

| Measure | Result |
|---|---|
| Photos refused (≥ 2 runs declined or blocked) | **0 / 10** (0 / 20 runs) |
| Located within 5 km (≥ 2 runs) | **5 / 10** |
| Located within 1 km (≥ 2 runs) | **3 / 10**; two at about 200–250 m |
| Fix: mask the clues marked removable, re-attack | moved **3 of the 4** re-attacked located photos outward (3 / 5 counting the located photo with no removable clue) |
| G1 gate (≤ 2 refused, ≥ 4 located) / G1b (fix moves ≥ 50%) | **PASS** / **PASS** |
| Latency per call | median 7.0 s, p90 9.4 s, max 10.9 s |

**Caveats:** n = 10, one model, public places only, and the photos may be in Gemini's training data, so the located counts may be optimistic. **The planned 25-photo benchmark on builder-owned photos (T-150..T-153) was not run.**

### Other measurements

| What | Result | Where |
|---|---|---|
| Pass B through the app's Egress Gate | the three Judge samples, attacked live (§1) | local dev server, `gemini-3.5-flash-lite`, free tier, Nov 23 (D-161) |
| Referee (S0) on real Gemini Nano | `ON-DEVICE`, ~6.1 s warm, 15.6 s cold | Chrome 157, Apple-silicon Mac, Nov 21 (D-154) |
| Pre-screen (S1) on real Gemini Nano | `ON-DEVICE`, 2 clues on a drawn test image, ~9.5 s warm, 13.0 s cold | same |
| Free-tier `gemini-3.8-flash` | 80–143 s when it answered, frequent 500/503 | Nov 21–23 (T-031) |
| iOS referee on Apple FM (Firebase on-device session) | `ON-DEVICE`, 29.6 s and 13.7 s | iOS 27.0 Simulator, Nov 21 |
| Web tests | more than 3,300 Vitest tests and the boundary scan, green | `npm run check` |

### Limitations

- **One of three recorded Judge runs ends in "Risk reduced"**; the station and the castle stayed placed from things a mask can't hide. Sample 2 is a swap, disclosed in §1.
- The attacker is `gemini-3.5-flash-lite` on the free tier (D-159), nominally weaker than flash, so the app may understate what a stronger model could infer.
- iOS Judge Mode replays the recorded answers with Apple Foundation Models on the device; the live iPhone Gemini call has not run yet. The Apple FM referee sometimes over-grades a match; the verdict keeps the stronger of the FM and rules answers.
- Without Nano, S0/S1 run as RULES-ONLY code. Nano needs capable desktop hardware; Nano on the hosted origin is not yet verified (T-109).
- Public places are probably easier to locate than homes, and accuracy varies by region (arXiv 2502.11163).
- The Cloud Ledger lives in memory and resets on reload.

## 8. Run it yourself

```bash
git clone https://github.com/PRIEST099/strangers-eyes strangers-eyes
cd strangers-eyes
```

### Web
Requirements: Node ≥ 24.12 (tested with 26.8.2), npm, the Firebase CLI, and your own Firebase project.
1. In your Firebase project, enable Firebase AI Logic (Gemini Developer API), Anonymous Auth, App Check with reCAPTCHA Enterprise, and Remote Config.
2. Remote Config: check `data_tier` and `grounding_enabled` in [`remoteconfig.template.json`](remoteconfig.template.json) before publishing. **On the free tier, publish with `data_tier` = `free` and `grounding_enabled` = `false`** (the hosted app runs this way).
3. Put your project's web config and reCAPTCHA Enterprise site key in [`web/src/firebase/config.ts`](web/src/firebase/config.ts) (public values, not secrets).
4. Register an App Check debug token for localhost and put it in `web/.env.development.local` as `VITE_APPCHECK_DEBUG_TOKEN=…` (see [`web/.env.example`](web/.env.example)). Never commit that file.
5. Run:
   ```bash
   cd web
   npm ci
   npm run dev      # http://localhost:5173 (or the next free port Vite prints)
   npm run check    # typecheck + boundary rules + prompt and image checks + Vitest
   npm run build    # production build + dist check
   ```
6. Deploy from the repo root: `firebase deploy --only hosting,auth --project <your-project>`, and publish Remote Config as in step 2. Never run a bare `firebase deploy`: it would also publish the repo's Remote Config template, which may not match your tier.

Optional Gemini Nano: desktop Chrome with on-device AI enabled (`chrome://settings/ai` and `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`), then reload; Settings shows what runs where.

### iOS
Requirements: Xcode 27.2, [XcodeGen](https://github.com/yonaskolb/XcodeGen), the iOS 27.0 Simulator (tested on iPhone 18 Pro), Apple Intelligence turned on on the Mac.
- **firebase-ios-sdk is pinned to exactly 12.19.3 because `HybridModel` was removed in 13.0.0.** It is the last release where Firebase AI Logic itself runs Apple Foundation Models on the device and reports the source (the iOS hybrid API is Experimental). The pin is in [`ios/project.yml`](ios/project.yml).
- Replace [`GoogleService-Info.plist`](ios/StrangersEyes/Resources/GoogleService-Info.plist) with your project's file. DEBUG builds use the App Check debug provider: register your own token and pass it as the `AppCheckDebugToken` environment variable (for `simctl launch`, `SIMCTL_CHILD_AppCheckDebugToken`). Never commit it.

```bash
cd ios
xcodegen generate
xcodebuild -project StrangersEyes.xcodeproj -scheme StrangersEyes \
  -destination "platform=iOS Simulator,name=iPhone 18 Pro" \
  -derivedDataPath build -clonedSourcePackagesDirPath .spm ARCHS=arm64 test
xcrun simctl boot "iPhone 18 Pro"
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/StrangersEyes.app
# DEBUG demo with no cloud calls: the labelled fake attacker and a test vault
xcrun simctl launch booted dev.strangerseyes.app -fakeAdversary -seedDemoVault -acceptWelcome
xcrun simctl shutdown all   # when done
```
Leave out `-fakeAdversary` to use the real Gemini pass B (not yet run; see §6). On an 8 GB Mac, don't run Chrome's Gemini Nano and the Simulator's Foundation Models at the same time. More: [`ios/NOTES.md`](ios/NOTES.md).

## 9. Repo map

```
web/                 the web PWA (Vite, React, TypeScript)
  src/ai/            Egress Gate, model factories, tripwire, the AI jobs (src/ai/jobs/)
  src/core/          routing policy, bands, verdict, referee rules, fix plan, ledger
  src/tier0/         import, EXIF strip, faces, OCR, vault-text matcher
  src/vault/         encrypted vault store, burn
  src/ui/            screens, Check flow, Judge Mode, route labels and Ledger
  public/samples/    Judge Mode samples, recorded answers, manifest and SOURCES.md
ios/                 SwiftUI app (XcodeGen spec in ios/project.yml; status in ios/NOTES.md)
shared/prompts/      versioned prompts and schemas (with manifest.json)
shared/strings/      UI copy (en.json)
shared/testvectors/  cross-platform test vectors (Vitest and XCTest)
scripts/             boundary, prompt, image and dist checks; sample tools
benchmark/spike/     Day-1 adversary spike: harness, scorer and the aggregate report
docs/                spec, architecture, API notes, runbook, tasks, progress, devlog
docs/img/            architecture and routing diagrams, screenshot gallery
remoteconfig.template.json, firebase.json
```

## 10. Built during #BuildHybridAI, roadmap, license

- New project, started Nov 19 2026, with no pre-existing code. Written with **Claude Code** (an AI coding assistant) from the create-vite template; the team made the product and design decisions. Third-party licences: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- **Roadmap:** the 25-photo benchmark on builder-owned photos and a stronger attacker; the live Gemini call, Auth, Remote Config and the `HybridModel` explainer on iOS; Android with Gemini Nano (cut: no device to test on); grounded notes and the S2 explainer on the paid tier; a "check before you post" browser extension; non-English UI.
- **License:** Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
