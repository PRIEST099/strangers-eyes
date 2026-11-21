# Devpost submission text: Strangers' Eyes

> Drafted for T-165. The user pastes each field into the Devpost draft (T-171) and submits (T-190). Claude never submits.
> **Field limits are [UNVERIFIED]** until T-167 reads the draft (RUNBOOK §7.5). Character counts below are measured on the text between the `<!-- field -->` markers (code points, trailing newline excluded).
> Every `[TBD: …]` marker must be filled or removed before pasting.

## Character counts

| Field | Characters | Limit | Status |
|---|---|---|---|
| Name | 15 | [UNVERIFIED: T-167] (Devpost usually 60) | fits the usual limit |
| Elevator pitch | 165 | [UNVERIFIED: T-167] (Devpost usually 200; SPEC §1 says ≤200) | fits |
| About the project (Markdown) | 7,090 (1,185 words) | [UNVERIFIED: T-167] (no limit known) | re-check after T-167 |
| Testing instructions | 1,538 | [UNVERIFIED: T-167] | re-check after T-167 |
| Built during the submission period | 583 | [UNVERIFIED: T-167] | re-check after T-167 |

Counts include the `[TBD: …]` markers (measured Nov 21); re-measure after filling them.

---

## Name
<!-- name -->
Strangers' Eyes
<!-- /name -->

## Elevator pitch
<!-- pitch -->
The cloud plays the stalker; your device holds the answers. See what AI can infer from your photo and fix it before you post. The attacker never learns it was right.
<!-- /pitch -->

## Try it out (links)
- Live app: https://strangers-eyes.web.app
- Judge Mode deep link: https://strangers-eyes.web.app/?judge=1
- Code: [TBD: REPO_URL, public after T-170]

## Video
[TBD: YOUTUBE_URL after T-187]

## Platforms
Web (Chrome and any modern browser) and iOS. [TBD: confirm the platform choice and the primary "Best of" category, T-172]

## Built with
firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, firebase-app-check, recaptcha-enterprise, firebase-auth, firebase-remote-config, firebase-hosting, react, typescript, vite, tailwindcss, swiftui, vision, mediapipe, tesseract.js

## About the project
<!-- about -->
## Inspiration
Deleting GPS data no longer protects a photo. Multimodal models now place photos from the pixels alone: a bus-stop code, a street sign, a staff lanyard, the view from a window. Published studies report up to about 60% street-level accuracy on social-media-like images (Privacy International, "Nowhere to Hide?", 2026). Tools that strip EXIF ignore the pixels, and research prototypes send the raw photo to the cloud and know nothing about what you personally need to hide.

We built Strangers' Eyes for parents, marketplace sellers and creators, and above all for people who must not reveal where they live: domestic-violence survivors, journalists and activists.

## What it does
You keep a private vault on your device: your home and work pins, your employer, your children's names. Then you check a photo before posting it:

1. **Pre-screen (device).** Faces, text and metadata are found on the device. Gemini Nano looks at the original photo for location clues. Anything matching your vault (say "LUCAS" on a lunchbox) is solid-masked on the device.
2. **Consent.** You see the exact redacted, EXIF-free copy that will be sent, and approve it.
3. **Attack (cloud).** Gemini, through Firebase AI Logic, plays a stranger and tries to place the photo from that copy alone.
4. **Referee (device).** An on-device model compares the attacker's guesses with your vault. Code turns them into distance bands to your own pins ("Home: within 1 km"), never a map pin for the guess.
5. **Fix and re-attack.** One tap masks or crops the clues the attacker used; the cloud attacks the fixed copy; the verdict changes to "Risk reduced" (never "safe").

The attacker never learns whether it guessed right, because the grading happens on your device.

## How we built it with Firebase AI Logic
- **Routing by sensitivity class.** Every AI request is sorted by what it carries. S0 (anything touching the vault) and S1 (the original photo) are `ONLY_ON_DEVICE` and fail closed to deterministic code labelled RULES-ONLY, never to the cloud. S2 (public explanations) is `PREFER_ON_DEVICE` with a real cloud fallback. S3 (the attacker) is `ONLY_IN_CLOUD`. S4 (Judge Mode samples with a fake vault) is `PREFER_ON_DEVICE`, so judges without Nano still see every step. The policy lives in Remote Config; a hard floor in code means Remote Config can never let S0 or S1 reach the cloud.
- **One Egress Gate for every call.** A single wrapper is the only code allowed to call the SDK (a build-time boundary check enforces it). Before each call it checks the class, checks that Nano reports `available` in that same call (without `window.LanguageModel` the web SDK silently sends `ONLY_ON_DEVICE` to the cloud), re-checks the exact outgoing image (no metadata, zero faces, zero vault text), scans prompts for vault strings, and writes one Ledger entry. The Router HUD shows `ON-DEVICE`, `IN_CLOUD` or `RULES-ONLY` with latency for every call; the Cloud Ledger shows "Faces sent: 0 · Vault items sent: 0".
- **Web:** `firebase/ai` hybrid with Gemini Nano in Chrome (image input plus a JSON-schema `responseConstraint`) for the pre-screen and referee; `gemini-3.8-flash` with a JSON response schema for the attacker. MediaPipe and Tesseract.js do face and text detection on the device.
- **iOS (in progress):** SwiftUI with `FirebaseAILogic` pinned to exactly 12.19.3, because `HybridModel` was removed in 13.0.0. On-device-only Apple Foundation Models sessions for the referee, Vision for faces and text, a Swift Egress Gate, and the same cloud pass B after consent. [TBD: iOS status]
- **Also used:** App Check (reCAPTCHA Enterprise on the hosted site), Anonymous Auth (per-user quotas, no identity), Remote Config (routing policy, model names, prompt versions, caps, kill switch) and Hosting.

## Judge Mode samples: please read
The three Judge Mode photos are CC0 photos of public places in Ljubljana from Wikimedia Commons (credited in the repo). We solid-masked people, adverts showing people and real number plates, and drew in the props (a "City General Hospital" staff badge and a "LUCAS" name-tag lunchbox). The vault is made up, with pins in a park and a square. The recorded attacker answers shipped with the samples are stand-ins written by the team until live recordings replace them, and the app labels them as such. A live attack runs whenever the cloud model is available. [TBD: remove the stand-in sentence once live recordings ship]

## Challenges we ran into
- `ONLY_ON_DEVICE` is not a guarantee on the web: in browsers without `window.LanguageModel` the SDK quietly uses the cloud. We added a fresh availability check before every private call, and a check after it that treats any `in_cloud` result on a private call as a breach.
- The iOS hybrid API (`HybridModel`) was removed in firebase-ios-sdk 13.0.0, so we pinned 12.19.3.
- Gemini Nano and the Simulator's Foundation Models cannot run together on an 8 GB Mac, so we planned all work and filming around one runtime at a time.
- Default OCR read our test name tag in only 14 of 30 placements; a union of four binarisation passes read all 30.
- Free-tier cloud latency (80–143 s, with frequent 503s) was beyond our 60 s attacker timeout. [TBD: outcome of the paid-tier decision, T-034]

## Accomplishments that we're proud of
- Real Gemini Nano, through the Egress Gate in Chrome 157: the referee ran on the device in about 6.1 s warm (15.6 s cold) and the pre-screen in about 9.5 s warm (13.0 s cold).
- Vault data and the original photo have no path to the cloud: private calls fail closed to rules, and the build fails if any file other than the gate calls the SDK.
- A full red-to-green loop that works in any browser through Judge Mode.
- [TBD: benchmark result, e.g. "located within 1 km: X/25 before the fix, Y/25 after", from T-153]

## What we learned
- "On-device" has to be checked on every call, not assumed from a mode name.
- Sensitivity classes are a simple way to decide what runs where, and easy to show to users.
- Distances and verdicts belong in code; the model's job is to read pixels and text.

## What's next
Android with Gemini Nano on the same Firebase project, grounded attacker notes with Search Suggestions on the paid tier, a "check before you post" browser extension, and more languages.

## Limitations (honest)
- The cloud attacker has not yet run end to end through the app with real quota; it was tested with a fake model behind the real gate. [TBD: first real run]
- The benchmark (25 builder-owned photos of public places) is not finished. [TBD: numbers and limits from T-153]
- On the free tier the attacker may exceed the 60 s timeout; the paid-tier decision is pending. [TBD: T-034]
- Without Nano, private steps run as rules, not AI. Nano needs capable desktop hardware.
- The raw attacker JSON is visible in DevTools; these measures do not stop a determined attacker. When you re-attack, the cloud sees which areas you masked, but never why.

## Built during the submission period
New project started Nov 19 2026, written during the period with Claude Code. Details in the field below.
<!-- /about -->

## Testing instructions
<!-- testing -->
1. Open https://strangers-eyes.web.app in any browser, desktop or mobile. No login: an anonymous session is created automatically. Free.
2. Confirm you are 18+, then choose "Open Judge Mode" (or open https://strangers-eyes.web.app/?judge=1). Three samples and a made-up vault load. Press "Run this sample". Autoplay steps through pre-screen, consent, attack, verdict, fix and re-attack. [TBD: measured red-to-green time on the hosted site]
3. Watch the Router HUD (bottom left): every AI step is labelled ON-DEVICE, IN_CLOUD or RULES-ONLY, with its latency. The Cloud Ledger counts exactly what left the device.
4. About the samples: CC0 photos of public places in Ljubljana with solid masks over people and plates, drawn props and a made-up vault. Their recorded attacker answers are team-written stand-ins, labelled in the app. When the live attacker is unavailable (offline, quota, network), Judge Mode can replay the recorded answer, badged as recorded.
5. Optional on-device AI: desktop Chrome with on-device AI enabled (chrome://settings/ai and chrome://flags/#prompt-api-for-gemini-nano-multimodal-input), then reload. The capability panel shows Gemini Nano, and private steps run ON-DEVICE.
6. Optional, your own photo: use a people-free photo you took. With an empty vault you still see the clues and the attacker's guess quality.

For users 18+. Available until the end of judging. iOS is shown in the video; build steps are in the README (it needs your own Firebase project, GoogleService-Info.plist and App Check debug token).
<!-- /testing -->

## Built during the submission period (summary field)
<!-- built -->
Strangers' Eyes is a new project, started on Nov 19 2026, with no pre-existing code. All code was written during the submission period with Claude Code, an AI coding assistant, starting from the create-vite template; the team made the product and design decisions. Third-party libraries (Firebase JS and iOS SDKs, MediaPipe, Tesseract.js, exifr, idb-keyval, React, Vite, Tailwind) are listed with their licences in THIRD_PARTY_NOTICES.md. The Judge Mode photos are CC0 Wikimedia Commons images, credited in web/public/samples/SOURCES.md, with masks and drawn props added by the team.
<!-- /built -->

## Gallery (T-166; no third-party logos, no real home or school)
1. Hero shot. 2. Capability panel. 3. Red verdict with the Ledger reading "Faces sent: 0 · Vault items sent: 0". 4. Blocked-leak toast. 5. Green "Risk reduced". 6. S0–S4 routing diagram. 7. Benchmark table [TBD: T-153]. 8. iOS screen with the Apple FM badge [TBD: iOS status].
Thumbnail: `docs/img/thumbnail.png`, 3:2 [TBD: T-166].
