# Devpost submission text: Strangers' Eyes

> Drafted for T-165. Nov 25 (D-172): rewritten in a plain first-person voice at the user's request, fact-checked against the earlier text, and filled into the Devpost draft by Claude (not submitted; the personal declarations, gallery and video link are the user's).
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
Turning off location doesn't hide where a photo was taken. Strangers' Eyes lets a cloud AI try to place your photo, checks its guess on your own device, and never tells the cloud if it was right.
<!-- /pitch -->

## Try it out (links)
- Live app: https://strangers-eyes.web.app
- Judge Mode deep link: https://strangers-eyes.web.app/?judge=1
- Code: https://github.com/PRIEST099/strangers-eyes

## Video
[USER: YOUTUBE_URL after T-187]

About the footage: the app was recorded in headless Chrome, which has no Gemini Nano, so private steps show RULES-ONLY. Judge runs replay the Nov 23 recorded answers, badged CACHED SAMPLE, so no photo was sent again. iOS footage is from the Simulator.

## Platforms
Web (Chrome and any modern browser) and iOS (SwiftUI, tested in the Simulator). [USER: platforms and "Best of" category, T-172]

## Built with
firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, firebase-app-check, recaptcha-enterprise, firebase-auth, firebase-remote-config, firebase-hosting, react, typescript, vite, tailwindcss, swiftui, vision, mediapipe, tesseract.js, figma, remotion, kokoro

## About the project
<!-- about -->
## Inspiration
I kept seeing the same advice: turn off location before you post. But the location tag was never the main problem. A street sign, a shop name or the shape of a building is often enough for an AI to work out where a photo was taken. Privacy International's 2026 report on AI geolocation cites studies reporting street-level accuracy of up to about 60% on social-media-style photos ([Nowhere to Hide?](https://privacyinternational.org/report/5736/nowhere-hide-privacy-risks-and-policy-implications-ai-geolocation)).

I wanted a way to see a photo the way a stranger's AI would, before posting it. The catch is that you can't ask a cloud AI "is this near my home?" without telling it where your home is.

## What it does
Strangers' Eyes splits the job in two.

On your device, the app strips the photo's hidden data, covers faces and any of your private words (your child's name on a lunchbox, say) with solid black boxes, and shows you the exact copy it wants to send. Nothing goes anywhere until you approve it.

In the cloud, Gemini plays the stranger. It gets only that cleaned copy and tries to work out where it was taken.

Back on your device, the app checks that guess against a private list you keep there: your home and work, your children's names, your employer. That list never leaves the device. Plain code, not an AI, works out how close the guess came to each of your own places and shows it as a distance band, like "Home: within 1 km". It never shows the guess as a pin on a map.

If a clue can be removed, one tap covers it and the cloud tries again. The result says "Risk reduced" (never "safe") with the AI's confidence, or "Still exposed" with a suggestion to crop the photo or not post it.

The part I like most: the cloud never learns whether it guessed right. The one answer a stalker wants ("yes, that's near where they live") only ever exists on your device.

## Who it's for
These are made-up examples, not real people:
- A parent posting a photo from the park. The AI reads the park's name board, the device sees that's within 1 km of home, and one tap covers it. Asked again, the AI only gets the city.
- Someone who has moved to get away from an abusive partner. The new address lives only in the private list. If the view from a window still gives the place away, the app says so instead of offering false comfort.
- A seller photographing an item at home. A parcel label with their name is covered before anything is sent, and the check then shows what the room itself gives away.

## How I built it
The one rule I stuck to: each step runs wherever is safe for the data it carries, even when another model would be faster.
- Anything that touches your private list, or the original photo, runs only on the device: Gemini Nano in Chrome, or Apple's on-device model on iOS. If there's no on-device model, it falls back to plain built-in rules. It never falls back to the cloud.
- The attacker always runs in the cloud: `gemini-3.5-flash-lite` through Firebase AI Logic, with a JSON schema.
- In Judge Mode, where the private list is made up, the pre-screen and the guess check prefer the device. Without Nano they run in the cloud. That's the only case where those steps leave the device, and the list they carry is fake.

On the web I can tune these rules remotely with Firebase Remote Config, but there's a minimum built into the code that no remote setting can loosen.

Every AI call goes through one small piece of code I call the Egress Gate. A build check fails if anything else calls the SDK. Before each call, the gate confirms the on-device model is actually available right then. This matters because on the web, without Chrome's on-device AI, a request marked "on device only" can quietly go to the cloud. The gate also re-checks the outgoing image for metadata, faces and private text, scans the prompt for anything from your list, and logs the call in a Cloud Ledger you can open in the app. Turn on "Technical details" and every step shows where it ran (on device, in the cloud, or local rules) and how long it took.

The web app is React and TypeScript on Firebase Hosting, with App Check, Anonymous Auth and Remote Config. Faces and text are found with MediaPipe and Tesseract.js, and distances are worked out in code. It's covered by over 3,400 automated tests.

The iOS app is SwiftUI with Firebase AI Logic. Apple's on-device model runs the pre-screen and the guess check. It only sees the text and labels that Apple's Vision framework picks out of the photo, never the image itself. A Judge Mode run on the iOS Simulator, replaying the recorded attacker answers, ended "Risk reduced" with every private step on the device and nothing sent.

I built this with Claude Code as my coding assistant. The illustrations in the app and the video were generated with Figma's AI image tool (credited in web/public/art/SOURCES.md). The video's other animations were drawn in code, and the narration is a text-to-speech voice (Kokoro). The app footage is the real app.

## Try it without your own photos
Judge Mode uses three openly licensed (CC0) photos of public places, two in Ljubljana and one in Berlin. I covered the people and real number plates, drew in a lunchbox labelled "LUCAS", and made up a family with a home and work nearby.

When the cloud model is available, each sample is attacked live. When it isn't (Google's free tier was often overloaded while I worked), the app replays real answers I recorded on Nov 23, clearly labelled CACHED SAMPLE. Here's what those recorded runs found:
- Station: it read the sign and named the wrong city, about 100 km off. With the sign covered, it still found the right city from the building. Still exposed.
- Level crossing: it read a street sign and a house-number plate and placed the photo within 5 km of the made-up home and work. With both covered, it could only name the city. Risk reduced.
- Castle with the lunchbox: it placed the photo 0.1 km from the made-up workplace, and there was nothing a mask could remove. Crop it or don't post it.

I originally used a different second photo, a bike-share path that ended "Still exposed", and swapped it for a Berlin one so there would be a sample a fix can actually help. I tried six Berlin photos. Google's model was overloaded for most of them, and the level crossing was the one that got a complete answer.

## What I measured
In my 10-photo test, free-tier Gemini placed 5 photos with no GPS data within 5 km of where they were taken (3 within 1 km), and it didn't refuse once in 20 runs. Covering the clues it named pushed its guess further away for 3 of the 4 photos I re-tested.

I also checked what actually leaves the device on the live site. I ran the Berlin photo through the normal flow with a made-up private list, in a browser without Nano. The only image that left was one redacted 1536 × 1024 copy of 338 KB, about 456 KB per request with the instructions. Because of retries it went out in five requests, 2,279 KB in all. The 734 KB original, the pins and the name were not sent. All three attempts failed: two timed out and one couldn't reach the model. So this covers the first attack only. A full run also sends a more heavily masked copy for the second attack.

## Misuse
A "where was this taken?" tool could help a stalker, so the app never shows the AI's guessed place: no name, no pin, no address. You only see how precise the guess was (street, city or country), its confidence, and how close it came to your own saved places. With an empty list, it tells you how exposed a photo is, not where it is. Photos come from your own files only, and you confirm you're 18+ and checking your own photos. I'll be upfront: someone determined could read the raw answer in the browser's developer tools, but they'd get little more than they would by asking Gemini directly. App Check, quotas, a daily cap and a kill switch limit how much the app can be used, not why.

## Challenges I ran into
- "On device only" isn't a guarantee on the web, so every private call is checked, and a cloud answer to a private call counts as a breach.
- The bigger free-tier Gemini model returned server errors on most calls, so I moved to flash-lite with a 45-second timeout.
- A mask can cover a sign, but not a building. And a wrong first guess can look reassuring when it shouldn't: at the station, the AI first named the wrong city, then found the right one once the sign was covered.

## What I learned
I learned that hybrid AI makes the most sense when each side needs something the other can't have. The cloud knows the world well enough to place a photo, and only the device knows the secrets that make that dangerous. Keeping those two apart turned out to be most of the work.

## Limitations
- The numbers come from a small test of 10 public-place photos, which may be in the model's training data. A benchmark of never-published photos is still to do.
- It runs on Google's free tier with a lighter model, so a stronger model might find more. Google may use the redacted image to improve its products, and the consent screen says so.
- On iOS (tested in the Simulator), Judge Mode replays the recorded answers. The live Gemini call from the iOS app hasn't run yet, and iOS doesn't use Anonymous Auth or Remote Config yet: it reads the bundled defaults.
- Without on-device AI, the private steps use built-in rules. On a re-attack the cloud can see which areas you covered, but never why.

## What's next
An Android version with Gemini Nano, the live Gemini call on iOS, a benchmark of never-published photos, and a browser extension that checks a photo right where you're about to post it.
<!-- /about -->

## Testing instructions
<!-- testing -->
1. Open https://strangers-eyes.web.app in any browser. There's no login and it's free.
2. Confirm you're 18+, then choose "Open Judge Mode" (or go straight to https://strangers-eyes.web.app/?judge=1) and press "Run this sample". It plays through on its own: pre-screen, consent, attack and result, then fix and attack again when a clue can be covered.
3. Turn on "Technical details" in Settings to see where each AI step ran (on device, in the cloud, or local rules) and how long it took. The Cloud Ledger shows what left your device.
4. These results aren't staged. In my Nov 23 runs the level crossing ended "Risk reduced", the station "Still exposed" and the castle "Crop it or don't post it". A live run can differ.
5. If the cloud model is busy or unavailable, Judge Mode replays my recorded Nov 23 answers, labelled CACHED SAMPLE. The replay itself sends nothing, but the Ledger still counts anything that already left: a live attempt that timed out or hit a server error, and, if your browser has no Nano, Judge Mode's pre-screen and guess check, which run in the cloud for the made-up samples only. Your own photos and your own private list never take that route.
6. Optional: in desktop Chrome with on-device AI turned on (chrome://settings/ai and chrome://flags/#prompt-api-for-gemini-nano-multimodal-input), reload, and once Settings shows Nano as available, the private steps run on the device.
7. Optional: try a photo you took yourself, with no people in it. Even with an empty private list you'll see the clues and how precise the guess was.

The iOS app is shown in the video. Build steps are in the README; you'd need your own Firebase project and an App Check debug token.
<!-- /testing -->

## Built during the submission period (summary field)
<!-- built -->
Strangers' Eyes is a new project, started on Nov 19, 2026, with no code from before the submission period. I wrote it during the hackathon with Claude Code as my coding assistant, starting from the standard Vite template, and made the product and design decisions myself. Third-party libraries (the Firebase JS and iOS SDKs, MediaPipe, Tesseract.js, exifr, idb-keyval, React, Vite, Tailwind) are listed with their licences in THIRD_PARTY_NOTICES.md. The Judge Mode photos are CC0 images from Wikimedia Commons, credited in web/public/samples/SOURCES.md, with masks and drawn props added by me.
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

## YouTube
- Title: Strangers' Eyes: see where a stranger's AI thinks your photo was taken, before you post
- Thumbnail: `video/out/thumbnail.jpg` (1280 × 720, the closing card; git-ignored, regenerate with `npx remotion still` at the last frame)
- Subtitles: `video/out/subtitles.en.srt`

Description:

You turned location off before posting. A stranger's AI can still read the street sign in your photo. Strangers' Eyes shows you what that AI can work out, before you post, without telling it anything about you.

On your device, the app covers faces and private words with solid black boxes and strips hidden photo data. In the cloud, Google's Gemini plays the stranger and sees only that cleaned copy. Back on your device, the app checks the guess against a private list that never leaves it: how close it came to your home and work, and whether it picked up your children's names. It then covers the clues and lets the AI try again. The cloud never learns whether it guessed right.

For your own photos, the private steps run on the device (Gemini Nano in Chrome, or Apple's on-device model on iOS) and the attack runs in the cloud, all through Firebase AI Logic. With no on-device AI, simple built-in rules take over, never the cloud. The browser I recorded in had no Gemini Nano, so the web clips show those steps as RULES-ONLY. The iOS clips are from the iOS Simulator.

The Judge Mode answers in this video were recorded on Nov 23 and replayed, labelled as such. The photos are openly licensed pictures of public places, and the family is made up.

Try it: https://strangers-eyes.web.app
Code: https://github.com/PRIEST099/strangers-eyes

Built for #BuildHybridAI 2026.
