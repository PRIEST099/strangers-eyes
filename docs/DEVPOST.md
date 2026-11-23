# Devpost submission text: Strangers' Eyes

> Drafted for T-165. The user pastes each field into the Devpost draft (T-171) and submits (T-190). Claude never submits.
> **Field limits are [UNVERIFIED]** until someone reads the real Devpost draft form (T-167, RUNBOOK §7.5). Character counts below are measured with a script on the text between the `<!-- field -->` markers (Unicode code points, leading and trailing newline excluded).
> Only three USER markers remain (below). Each needs a value only the user has: the YouTube URL, the public repo URL, and the platform and category choice.

## Character counts

| Field | Characters | Limit | Status |
|---|---|---|---|
| Name | 15 | [UNVERIFIED: T-167] (Devpost usually 60) | fits the usual limit |
| Elevator pitch | 165 | [UNVERIFIED: T-167] (Devpost usually 200; SPEC §1 says ≤200) | fits |
| About the project (Markdown) | 11,323 (1,930 words) | [UNVERIFIED: T-167] (no limit known) | re-check when the draft is read |
| Testing instructions | 1,915 | [UNVERIFIED: T-167] | re-check when the draft is read |
| Built during the submission period | 583 | [UNVERIFIED: T-167] | re-check when the draft is read |

Measured Nov 23 after the final edit, with no fill-in markers left inside the fields.

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
- Code: [USER: REPO_URL, public after T-170]

## Video
[USER: YOUTUBE_URL after T-187]

## Platforms
Web (Chrome and any modern browser) and iOS (SwiftUI, tested in the Simulator). [USER: platforms and "Best of" category, T-172]

## Built with
firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, firebase-app-check, recaptcha-enterprise, firebase-auth, firebase-remote-config, firebase-hosting, react, typescript, vite, tailwindcss, swiftui, vision, mediapipe, tesseract.js

## About the project
<!-- about -->
## Inspiration
**Location off isn't location hidden.** Turn location off, post a coffee photo, feel covered. In our test, a cloud AI still placed 5 of 10 GPS-free photos within 5 km (two at street level, about 200–250 m) and refused none of its 20 runs. Strangers' Eyes lets that AI attack a redacted copy first. Your device, not the cloud, works out how close it got to home, masks the clues, and asks again: masking the clues it named pushed 3 of the 4 re-attacked photos back out to country distance or beyond. (Our Nov 23 test used 10 openly licensed photos of public places with gemini-3.5-flash-lite; they may be in the model's training data, so a never-published photo may fare differently.)

Deleting GPS data no longer protects a photo. Multimodal models now place photos from the pixels alone: a bus-stop code, a street sign, a staff lanyard, the view from a window. Published studies report up to about 60% street-level accuracy on social-media-like images (Privacy International, "Nowhere to Hide?", 2026). Tools that strip EXIF ignore the pixels, and research prototypes send the raw photo to the cloud and know nothing about what you personally need to hide.

We built Strangers' Eyes for parents, marketplace sellers and creators, and above all for people who must not reveal where they live: domestic-violence survivors, journalists and activists.

## What it does
You keep a private vault on your device: your home and work pins, your employer, your children's names. Then you check a photo before posting it:

1. **Pre-screen (device).** Faces, text and metadata are found on the device. Gemini Nano looks at the original photo for location clues. Anything matching your vault (say "LUCAS" on a lunchbox) is solid-masked on the device.
2. **Consent.** You see the exact redacted, EXIF-free copy that will be sent, and approve it.
3. **Attack (cloud).** Gemini, through Firebase AI Logic, plays a stranger and tries to place the photo from that copy alone.
4. **Referee (device).** An on-device model compares the attacker's guesses with your vault. Code turns them into distance bands to your own pins ("Home: within 1 km"), never a map pin for the guess.
5. **Fix and re-attack.** One tap masks or crops the clues the attacker used, and the cloud attacks the fixed copy. If its new guess lands farther from your pins, the verdict reads "Risk reduced" (never "safe"), with its confidence. If the attacker still recognises the place, it says "Still exposed" and suggests a crop or not posting.

The attacker never learns whether it guessed right, because the grading happens on your device.

## How we built it with Firebase AI Logic
- **Routing by sensitivity class.** Every AI request is sorted by what it carries. S0 (anything touching the vault) and S1 (the original photo) are `ONLY_ON_DEVICE` and fail closed to deterministic code labelled RULES-ONLY, never to the cloud. S2 (public explanations) is `PREFER_ON_DEVICE` with a real cloud fallback. S3 (the attacker) is `ONLY_IN_CLOUD`. S4 (Judge Mode samples with a fake vault) is `PREFER_ON_DEVICE`, so judges without Nano still see every step. The policy lives in Remote Config; a hard floor in code means Remote Config can never let S0 or S1 reach the cloud.
- **One Egress Gate for every call.** A single wrapper is the only code allowed to call the SDK (a build-time boundary check enforces it). Before each call it checks the class, checks that Nano reports `available` in that same call (without `window.LanguageModel` the web SDK silently sends `ONLY_ON_DEVICE` to the cloud), re-checks the exact outgoing image (no metadata, zero faces, zero vault text), scans prompts for vault strings, and writes one Ledger entry. The Router HUD shows `ON-DEVICE`, `IN CLOUD` or `RULES-ONLY` with latency for every call; the Cloud Ledger shows "Faces sent: 0 · Vault items sent: 0".
- **Web:** `firebase/ai` hybrid with Gemini Nano in Chrome (image input plus a JSON-schema `responseConstraint`) for the pre-screen and referee; `gemini-3.5-flash-lite` with a JSON response schema for the attacker, chosen in Remote Config. In our 10-photo test it answered in a median 7.0 s (p90 9.4 s, max 10.9 s). MediaPipe and Tesseract.js do face and text detection on the device. Distances and bands are plain code (haversine), not the model.
- **iOS (lean, tested in the Simulator):** SwiftUI with `FirebaseAILogic` pinned to exactly 12.19.3, because `HybridModel` was removed in 13.0.0. The vault is a local file with complete file protection. Vision finds faces and text and solid-masks them. A Swift Egress Gate writes the same Ledger and Router HUD. An Apple Foundation Models referee runs in an on-device-only session, with the rules as its floor. Consent, fix and re-attack mirror the web. 20 of 20 XCTests pass, using the same shared test vectors as the web. In the Simulator a check went red → "Risk reduced" with Apple FM answering on the device and a clearly labelled debug stand-in attacker. The real Gemini call on iOS is built but has not been run.
- **Also used:** App Check (reCAPTCHA Enterprise on the hosted site), Anonymous Auth (per-user quotas, no identity), Remote Config (routing policy, model names, prompt versions, timeouts, caps, kill switch) and Hosting.

## Judge Mode samples: please read
The three Judge Mode photos are CC0 photos of public places from Wikimedia Commons, two in Ljubljana and one in Berlin (credited in the repo). We solid-masked people, adverts showing people and real number plates, and drew in a prop: a "LUCAS" name-tag lunchbox. The vault is made up; each sample's pins sit in a park and a square near that photo. The app reads the "LUCAS" tag and masks it on the device before anything is sent.

Each sample runs a live attack when the cloud model is available. When it isn't, Judge Mode replays real attacker answers, labelled CACHED SAMPLE. We recorded them on Nov 23 through the app's own gate, keeping the first answer of each sample; we never re-ran a photo for a nicer answer. One disclosure: sample 2 was a bike-share path (recorded "Still exposed"); we replaced it with a Berlin street photo whose clues a mask can remove. Of six Berlin photos we tried, Google's model was overloaded for most (server errors, no answer), and the level crossing is the one that got a complete answer. A live run may answer differently:
- **Station forecourt.** The attacker read the station sign and named the wrong city, Maribor, about 100 km away. The fix masked that sign. The re-attack then named the right city, Ljubljana, from the building itself: **Still exposed**. A wrong guess is not safety.
- **Level crossing by a street sign (Berlin).** The attacker read the street sign and its house-number plate and named the street: within 5 km of the made-up home and work pins. The fix masked both. The re-attack could only say "Berlin": **Risk reduced**, with its confidence shown, never "safe".
- **Castle courtyard with the LUCAS lunchbox.** Named Ljubljana Castle, 0.1 km from the made-up work pin, using only clues a mask can't remove. There is nothing to fix: red, so crop or don't post.

We kept these results. Masking text clues can work; a mask can't hide a landmark, and the app says so instead of claiming "Risk reduced".

## Challenges we ran into
- `ONLY_ON_DEVICE` is not a guarantee on the web: in browsers without `window.LanguageModel` the SDK quietly uses the cloud. We added a fresh availability check before every private call, and a check after it that treats any `in_cloud` result on a private call as a breach.
- On the free tier, `gemini-3.8-flash` returned 500/503 on most calls, and when it did answer it took 80–143 s. Small probes showed the overload was on Google's side, not in our request: even a text-only call timed out. We moved the attacker to `gemini-3.5-flash-lite` in Remote Config, gave it 45 s, and stopped retrying timeouts. The server keeps working after the client gives up, so a retry only doubles the wait.
- The iOS hybrid API (`HybridModel`) was removed in firebase-ios-sdk 13.0.0, so we pinned 12.19.3.
- Gemini Nano and the Simulator's Foundation Models cannot run together on an 8 GB Mac, so we planned all work and filming around one runtime at a time.
- On-device models sometimes called a match "exact" because of a common word ("a coastal city" vs "City General Hospital"). A device match with no support from the rules is now capped at "possible", on web and iOS.
- Default OCR read our test name tag in only 14 of 30 placements; the two-pass adaptive union the app uses reads 29 of 30.
- Recording real answers for Judge Mode exposed a replay bug: a real model numbers its clues afresh each time, so matching clues by number always passed. The replay now checks that the clues the live fix masked are masked again.

## Accomplishments that we're proud of
- In our 10-photo test (openly licensed photos of public places, GPS stripped, faces masked, `gemini-3.5-flash-lite`, up to 3 runs per photo with the third skipped when the first two agreed), the attacker refused 0 of its 20 runs. It placed 5 of 10 photos within 5 km and 3 within 1 km. Masking the clues it marked removable moved 3 of the 4 re-attacked located photos outward.
- Real Gemini Nano, through the Egress Gate in Chrome 157: the referee ran on the device in about 6.1 s warm (15.6 s cold) and the pre-screen in about 9.5 s warm (13.0 s cold).
- Vault data and the original photo have no path to the cloud: private calls fail closed to rules, and the build fails if any file other than the gate calls the SDK. Over 3,300 web tests pass.
- The whole loop (pre-screen, consent, attack, verdict, fix, re-attack) runs in any browser through Judge Mode, with no login: live when the cloud attacker is available, otherwise on real attacker answers recorded on Nov 23 (labelled CACHED SAMPLE).

## What we learned
- "On-device" has to be checked on every call, not assumed from a mode name.
- Sensitivity classes are a simple way to decide what runs where, and easy to show to users.
- Distances and verdicts belong in code; the model's job is to read pixels and text.
- Masks fix text, not buildings. And a wrong first guess can look reassuring: masking a misleading sign helped the attacker find the right city.

## What's next
Android with Gemini Nano on the same Firebase project; the real cloud attacker, Auth and Remote Config on iOS; a larger benchmark of never-published photos; grounded attacker notes with Search Suggestions on the paid tier; a "check before you post" browser extension; more languages.

## Limitations (honest)
- The test set is small: 10 openly licensed photos that may be in the model's training data, so the located counts may be optimistic. A planned 25-photo benchmark of our own photos was not run.
- The attacker is `gemini-3.5-flash-lite` on the free tier (Firebase Spark, no billing), a lighter model than flash; a stronger attacker may find more. On the free tier Google may use the redacted image to improve its products, and the consent screen says so. Search grounding is off, so the grounded "attacker notes" pass is not shown on the hosted app.
- On iOS the real Gemini attacker, Anonymous Auth, Remote Config and the on-device pre-screen are not done yet; the Simulator demo uses a labelled stand-in attacker.
- Without Nano, private steps run as rules, not AI. Nano needs capable desktop hardware.
- The raw attacker JSON is visible in DevTools; these measures do not stop a determined attacker. When you re-attack, the cloud sees which areas you masked, but never why.

## Built during the submission period
New project started Nov 19 2026, written during the period with Claude Code. Details in the field below.
<!-- /about -->

## Testing instructions
<!-- testing -->
1. Open https://strangers-eyes.web.app in any browser, desktop or mobile. No login: an anonymous session is created automatically. Free.
2. Confirm you are 18+, then choose "Open Judge Mode" (or open https://strangers-eyes.web.app/?judge=1). Three samples and a made-up vault load. Press "Run this sample". Autoplay steps through pre-screen, consent, attack and verdict, then fix and re-attack when a clue can be masked, with no further input. Our target is a final verdict within 90 s; the cloud attack itself took a median 7 s in our tests.
3. Watch the Router HUD (bottom left): every AI step is labelled ON-DEVICE, IN CLOUD or RULES-ONLY, with its latency. The Cloud Ledger counts exactly what left the device.
4. Expect honest verdicts, not a guaranteed "Risk reduced". In our Nov 23 runs the level crossing ended "Risk reduced", the station "Still exposed" (its first guess was the wrong city until the fix), and the castle red with nothing to fix; a live run may answer differently.
5. About the samples: CC0 photos of public places in Ljubljana and Berlin with solid masks over people and plates, a drawn prop and a made-up vault. When the live attacker is unavailable (offline, quota or daily cap, kill switch, App Check failure, a timeout or a server error), Judge Mode replays real answers recorded on Nov 23, badged CACHED SAMPLE.
6. Optional on-device AI: desktop Chrome with on-device AI enabled (chrome://settings/ai and chrome://flags/#prompt-api-for-gemini-nano-multimodal-input), then reload. The capability panel shows whether Gemini Nano is available on that browser; when it is, private steps run ON-DEVICE.
7. Optional, your own photo: use a people-free photo you took. With an empty vault you still see the clues and the attacker's guess quality.

For users 18+. Available until the end of judging. iOS is shown in the video; build steps are in the README (it needs your own Firebase project, GoogleService-Info.plist and App Check debug token).
<!-- /testing -->

## Built during the submission period (summary field)
<!-- built -->
Strangers' Eyes is a new project, started on Nov 19 2026, with no pre-existing code. All code was written during the submission period with Claude Code, an AI coding assistant, starting from the create-vite template; the team made the product and design decisions. Third-party libraries (Firebase JS and iOS SDKs, MediaPipe, Tesseract.js, exifr, idb-keyval, React, Vite, Tailwind) are listed with their licences in THIRD_PARTY_NOTICES.md. The Judge Mode photos are CC0 Wikimedia Commons images, credited in web/public/samples/SOURCES.md, with masks and drawn props added by the team.
<!-- /built -->

## Gallery (T-166; no third-party logos, no real home or school)
One caption per image, in this order. Files are in `docs/img/gallery/`.

1. `01-home.png`: "Location off isn't location hidden. Home shows the tagline and a short illustrated story of what the app does."
2. `02-judge-run.png`: "A Judge Mode run: the device lane and the cloud lane, with every AI step badged in the Router HUD (ON-DEVICE, IN CLOUD or RULES-ONLY) and its latency."
3. `03-verdict.png`: "The first verdict: the attacker named the street, within 5 km of the made-up home and work pins, shown as distance bands, never a map pin. The Cloud Ledger still reads Faces sent: 0 · Vault items sent: 0. Shown with the recorded Nov 23 answer (CACHED SAMPLE)."
4. `04-reattack.png`: "Fix and re-attack: the fix masks the clues the attacker named, the fixed copy is attacked again, and the before/after compare shows the new verdict with the attacker's confidence. Here: the recorded Nov 23 answer (CACHED SAMPLE): masking the street sign and its number plate left only 'Berlin': risk reduced, never 'safe'."
5. `05-blocked.png`: "The Egress Gate stops a copy that still shows a vault match (the LUCAS name tag) before it can leave the device: BLOCKED, 0 bytes sent, Vault items sent: 0."
6. `06-about-routing.png`: "What leaves this device: S0 to S4 routing. The vault and the original photo never leave; the attacker runs in the cloud, and public explanations and Judge Mode samples go there only when on-device AI isn't available."
7. `07-capabilities.png`: "What runs where on this browser: Gemini Nano on the device when available, otherwise rules-only code for private steps, never the cloud."

Optional diagrams (add after the screenshots if the gallery allows):

8. `docs/img/architecture.png`: "Architecture: one Egress Gate between the device and Firebase AI Logic."
9. `docs/img/routing.png`: "Routing by sensitivity class, stored in Remote Config with a hard floor in code."

Thumbnail: `docs/img/thumbnail.png` (3:2).
