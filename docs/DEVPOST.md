# Devpost submission text: Strangers' Eyes

> Drafted for T-165; the user pastes each field into the Devpost draft (T-171) and submits (T-190). Claude never submits.
> **Field limits are [UNVERIFIED]** until the real draft form is read (T-167, RUNBOOK §7.5). Counts are Unicode code points between the `<!-- field -->` markers, measured by script.
> Three USER markers remain: the YouTube URL, the public repo URL, and the platform and category choice.
> Redeploy #7 (Nov 24, commit 7b39171) is live: the hosted verdict shows the precision level and confidence only, never the guessed place; failover code is deployed but off until RC lists backup models.

## Character counts

| Field | Characters | Limit | Status |
|---|---|---|---|
| Name | 15 | [UNVERIFIED: T-167] (Devpost usually 60) | fits the usual limit |
| Elevator pitch | 165 | [UNVERIFIED: T-167] (Devpost usually 200; SPEC §1 says ≤200) | fits |
| About the project (Markdown) | 9,943 (1,579 words) | [UNVERIFIED: T-167] (no limit known) | re-check when the draft is read |
| Testing instructions | 1,570 | [UNVERIFIED: T-167] | re-check when the draft is read |
| Built during the submission period | 583 | [UNVERIFIED: T-167] | re-check when the draft is read |

Measured Nov 24 after the submission-hardening rewrite and the writeup fixes (Ledger wording, failover, iOS pre-screen, the restored iOS Auth/Remote Config disclosure), with no fill-in markers left inside the fields. Re-measured Nov 24 after adding the "Measured: what left the device" section (D-169) and the illustrations line (D-170).

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

About the footage: the app was recorded in headless Chrome, which has no Gemini Nano, so private steps show RULES-ONLY. Judge runs replay the Nov 23 recorded answers, badged CACHED SAMPLE, so no photo was sent again. iOS footage is from the Simulator.

## Platforms
Web (Chrome and any modern browser) and iOS (SwiftUI, tested in the Simulator). [USER: platforms and "Best of" category, T-172]

## Built with
firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, firebase-app-check, recaptcha-enterprise, firebase-auth, firebase-remote-config, firebase-hosting, react, typescript, vite, tailwindcss, swiftui, vision, mediapipe, tesseract.js, figma, remotion, kokoro

## About the project
<!-- about -->
## TL;DR
- A cloud AI (Gemini, through Firebase AI Logic) tries to work out where your photo was taken, from a redacted copy.
- Your device alone grades the guess against a private vault (home, work, children's names), masks the clues, and lets the cloud try again.
- **The attacker never learns whether it guessed right.**

## Measured: what left the device
On the hosted app (Nov 24), we checked the Berlin sample photo through the normal Check flow, not Judge Mode, with a made-up vault of two pins and a child's name, in a browser without Gemini Nano. Figures are from the consent screen and the Cloud Ledger.
- **Sent:** one redacted 1536 × 1024 JPEG of 338 KB (metadata stripped, 0 faces, 0 vault matches; the built-in house-number check masked 23 areas, mostly text-recognition false positives) plus fixed instructions: about 456 KB per request.
- **Not sent:** the 734 KB original, both pins and the name (0 vault items, per the gate). The private pre-checks (metadata, faces, text, vault match) ran as local rules, not in the cloud.
- **Scope:** all three attack attempts failed (two timed out, one could not reach the model; the gate retried two of them once after a server error): five requests, 2,279 KB in total, and no answer. So this measures the first attack only; a full run also sends a more heavily masked copy for the re-attack.

## The idea
Most privacy tools hide data from the cloud. Strangers' Eyes makes the cloud the threat and keeps the answer key on the device.

Gemini plays a stranger. It sees only an EXIF-free copy with faces and vault text solid-masked, after you approve that exact image. Your device compares its guesses with your vault, which never leaves it; code turns them into distance bands to your own places ("Home: within 1 km"). One tap masks the clues the attacker used and the cloud attacks again. The verdict reads "Risk reduced" (never "safe") with the attacker's confidence, or "Still exposed" with a crop or don't-post suggestion. The cloud never gets the one answer a stalker wants: yes, that is near where they live.

**Why hybrid:** placing a photo needs world-scale knowledge only a large cloud model has; judging the attack needs your secrets, which must stay local. The app splits the job at that line.

**Why now:** location off isn't location hidden. Privacy International reports up to about 60% street-level accuracy on social-media-like images ([Nowhere to Hide?](https://privacyinternational.org/report/5736/nowhere-hide-privacy-risks-and-policy-implications-ai-geolocation), 2026). In our 10-photo test, free-tier Gemini placed 5 GPS-free photos within 5 km (3 within 1 km) and refused none of 20 runs; masking the clues it named moved 3 of 4 re-attacked photos outward.

## Who it is for
Illustrative scenarios; no real people.
- **A parent posting a park photo.** The attacker reads the park's name board; the device sees that is within 1 km of home and masks it. The re-attack gets only the city: "Risk reduced".
- **A survivor of domestic abuse who has moved.** The new address exists only in the vault. If a window view still places the photo, the app says "Still exposed", not false comfort.
- **A seller photographing an item at home.** A parcel label with their name is masked on the device before anything is sent; the attack then shows what the room gives away.

## Misuse
A "where was this taken" tool would help stalkers. So the app never shows the attacker's guessed place (no name, pin or address): only how precise it was (street, city, country), its confidence and the clue types, plus distance bands to *your own* vault pins. With an empty vault it says how exposed a photo is, not where it is. Photos come from local files only; users confirm they are 18+ and checking their own photos. Honest limit: the raw answer is visible in DevTools, which adds little over asking Gemini directly; App Check, quotas, a daily cap and a kill switch limit volume, not intent.

## How it compares
- **AI and OSINT geolocation** ([GeoSpy](https://www.404media.co/the-powerful-ai-tool-that-cops-or-stalkers-can-use-to-geolocate-photos-in-seconds/), [Bellingcat's geolocation work](https://www.bellingcat.com/tag/geolocation/)): the attacker's view. We turn it into a self-test and hide the answer.
- **EXIF strippers** ([Scrambled Exif](https://f-droid.org/en/packages/com.jarsilio.android.scrambledeggsif/)): remove GPS, not the street sign. We strip metadata, then test the pixels.
- **Image cloaking** ([Fawkes](https://news.uchicago.edu/story/new-tool-protect-yourself-against-facial-recognition-software)): protects faces from recognition, not places.
- **Before-you-post checkers** ([CHI 2025 study](https://arxiv.org/abs/2503.20226), [Geo-Safe-Filter](https://awpbash.github.io/projects/geo-safe-filter)): closest to us, but send the photo to a cloud model and don't know which places matter to you.

New here: an on-device vault as ground truth, grading the attacker never sees, one enforced Egress Gate with a ledger, and routing by data sensitivity.

## How we built it with Firebase AI Logic
- **Routing by what a request carries.** Vault data (S0) and the original photo (S1): `ONLY_ON_DEVICE`, failing closed to rules, never the cloud. Public explanations (S2) and fake-vault Judge samples (S4): `PREFER_ON_DEVICE`. The attacker (S3): `ONLY_IN_CLOUD`. The policy lives in Remote Config, with a hard floor in code.
- **One Egress Gate.** The only code allowed to call the SDK (a build check enforces it). Before each call it confirms Nano is `available` right then (without `window.LanguageModel` the web SDK silently sends `ONLY_ON_DEVICE` to the cloud), re-checks the outgoing image (no metadata, faces or vault text), scans prompts for vault strings, and writes a Ledger entry. Technical details shows each step's route (ON-DEVICE, IN CLOUD, RULES-ONLY) and latency.
- **Web:** `firebase/ai` hybrid: Gemini Nano in Chrome for the pre-screen and referee (verified in Chrome 157, ~6–10 s warm); `gemini-3.5-flash-lite` with a JSON schema for the attacker (median 7.0 s). Remote Config can name backup models to try on a 5xx or 429 (`adversary_fallback_models`); the list ships empty, so today an overloaded attacker means Judge Mode replays its recorded answers. MediaPipe and Tesseract.js find faces and text; distances are code (haversine). Over 3,300 tests.
- **iOS (Simulator):** SwiftUI, `FirebaseAILogic` pinned to 12.19.3 (`HybridModel` was removed in 13.0.0), Vision masks, a Swift Egress Gate. Apple Foundation Models run the pre-screen (over Vision's OCR text and scene labels, never the image) and the referee on the device. iOS Judge Mode replays the same recorded Gemini answers; a Nov 24 UI test ran sample 2 to "Risk reduced" with every private step ON-DEVICE and 0 bytes sent. An earlier Simulator demo used a labelled debug stand-in attacker.
- **Also (web):** App Check, Anonymous Auth, Remote Config, Hosting. iOS uses App Check only.
- **Illustrations:** the four decorative illustrations in the app and video were generated with Figma's AI image tool for this project (no real people or places; credited in `web/public/art/SOURCES.md`). Everything else on screen is the real app.

## Judge Mode samples: please read
Three CC0 Wikimedia Commons photos of public places (two Ljubljana, one Berlin; credited in the repo). We solid-masked people, adverts showing people and real plates, and drew in a "LUCAS" name-tag lunchbox, which the app masks on the device. The vault is made up; pins sit in a park and a square near each photo.

Each sample attacks live when the cloud model is available. Otherwise it replays real answers recorded on Nov 23 through the app's gate (first answer per sample), labelled CACHED SAMPLE. The replay itself sends nothing, but the Cloud Ledger still counts what really left: a live attempt that timed out or got a server error had already sent the redacted copy, and without Nano the sample pre-screen and referee run in the cloud. It reads zero only when nothing was tried (offline, daily cap, kill switch) and Nano ran the private steps. Disclosure: sample 2 was a bike-share path (recorded "Still exposed"); we swapped in a Berlin photo whose clues a mask can remove. Of six Berlin photos tried, Google's model was overloaded for most; the level crossing got a complete answer. A live run may differ:
- **Station:** read the sign, named the wrong city ~100 km away; with the sign masked it found the right city from the building. **Still exposed.**
- **Level crossing:** street level from the sign and house-number plate, within 5 km of the pins; masked, only the city. **Risk reduced.**
- **Castle with the lunchbox:** 0.1 km from the work pin, nothing removable. Red: crop or don't post.

## Challenges and lessons
- `ONLY_ON_DEVICE` is not a guarantee on the web, so "on-device" is checked on every call, and an `in_cloud` result on a private call counts as a breach.
- Free-tier `gemini-3.8-flash` returned 500/503 on most calls (80–143 s when it answered); we moved to flash-lite with a 45 s timeout.
- Masks fix text, not buildings, and a wrong first guess can look reassuring.

**Next:** Android with Nano, the live Gemini call on iOS, a benchmark of never-published photos, a browser extension.

## Limitations (honest)
- Numbers come from our 10-photo test only (public places that may be in the model's training data); the planned 25-photo benchmark was not run.
- Free tier (Firebase Spark): `gemini-3.5-flash-lite`, so a stronger model may find more; Google may use the redacted image to improve its products (the consent screen says so); Search grounding is off.
- iOS Judge Mode replays the recorded answers with Apple Foundation Models on the device; the live iPhone Gemini call has not run yet. iOS does not use Anonymous Auth or Remote Config yet: it reads the bundled template defaults.
- Without Nano, private steps run as rules. On a re-attack the cloud sees which areas you masked, never why.
<!-- /about -->

## Testing instructions
<!-- testing -->
1. Open https://strangers-eyes.web.app in any browser. No login, free.
2. Confirm you are 18+, choose "Open Judge Mode" (or https://strangers-eyes.web.app/?judge=1) and press "Run this sample". Autoplay runs pre-screen, consent, attack and verdict, then fix and re-attack when a clue can be masked.
3. Turn on Technical details to see where each AI step ran (ON-DEVICE, IN CLOUD or RULES-ONLY) and its latency. The Cloud Ledger counts what left the device.
4. Expect honest verdicts: in our Nov 23 runs the level crossing ended "Risk reduced", the station "Still exposed", the castle red; a live run may differ.
5. Samples are CC0 public-place photos with masks over people and plates, a drawn prop and a made-up vault. If the live attacker is unavailable (offline, quota, daily cap, kill switch, App Check failure, timeout or server error), Judge Mode replays answers recorded Nov 23, badged CACHED SAMPLE. The replay sends nothing, but the Cloud Ledger counts anything that already left: a live attempt that timed out or failed, and, without Nano, the cloud pre-screen and referee.
6. Optional: desktop Chrome with on-device AI (chrome://settings/ai and chrome://flags/#prompt-api-for-gemini-nano-multimodal-input), then reload; private steps run ON-DEVICE when Settings shows Nano available.
7. Optional: a people-free photo you took. With an empty vault you still see the clues and how precise the guess was.

For users 18+, available until judging ends. iOS is in the video; build steps are in the README (needs your own Firebase project and App Check debug token).
<!-- /testing -->

## Built during the submission period (summary field)
<!-- built -->
Strangers' Eyes is a new project, started on Nov 19 2026, with no pre-existing code. All code was written during the submission period with Claude Code, an AI coding assistant, starting from the create-vite template; the team made the product and design decisions. Third-party libraries (Firebase JS and iOS SDKs, MediaPipe, Tesseract.js, exifr, idb-keyval, React, Vite, Tailwind) are listed with their licences in THIRD_PARTY_NOTICES.md. The Judge Mode photos are CC0 Wikimedia Commons images, credited in web/public/samples/SOURCES.md, with masks and drawn props added by the team.
<!-- /built -->

## Gallery (T-166; no third-party logos, no real home or school)
Files are in `docs/img/gallery/`, one caption each, in this order. Retaken Nov 24 from the real flow on the plain-language screens (`scripts/shoot-gallery.mjs`; 02–04 replay the recorded answers with Simulate offline, so nothing was sent; 05 is the gate refusing on the device).

1. `01-home.png`: "Location off isn't location hidden: the tagline and an animated illustration of how a check works."
2. `02-judge-run.png`: "A Judge Mode run: every AI step labelled ON-DEVICE, IN CLOUD or RULES-ONLY, with its latency."
3. `03-verdict.png`: "Level crossing, first verdict: a street-level guess within 5 km of the made-up pins, shown as distance bands, never a map pin. Recorded Nov 23 answer (CACHED SAMPLE)."
4. `04-reattack.png`: "Fix and re-attack: with the street sign and house-number plate masked, the attacker got only the city. Risk reduced, never 'safe'. Recorded Nov 23 answer (CACHED SAMPLE)."
5. `05-blocked.png`: "The Egress Gate blocks a copy that still shows a vault match (LUCAS): 0 bytes sent."
6. `06-about-routing.png`: "What leaves this device: never the vault or the original photo."
7. `07-capabilities.png`: "What runs where on this browser: Nano when available, otherwise rules, never the cloud, for private steps."

Optional: 8. `docs/img/architecture.png` "One Egress Gate between the device and Firebase AI Logic." 9. `docs/img/routing.png` "Routing by sensitivity class, with a hard floor in code."

Thumbnail: `docs/img/thumbnail.png` (3:2).
