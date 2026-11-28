# Devpost submission text: Strangers' Eyes

> Drafted for T-165. Nov 25 (D-172): rewritten in a plain first-person voice at the user's request, fact-checked against the earlier text, and filled into the Devpost draft by Claude (not submitted; the personal declarations, gallery and video link are the user's).
> **Field limits are [UNVERIFIED]** until the real draft form is read (T-167, RUNBOOK §7.5). Counts are Unicode code points between the `<!-- field -->` markers, measured by script.
> Three USER markers remain: the YouTube URL, the public repo URL, and the platform and category choice.
> Redeploy #7 (Nov 24, commit 7b39171) is live: the hosted verdict shows the precision level and confidence only, never the guessed place; failover code is deployed but off until RC lists backup models.

## Character counts

| Field | Characters | Limit | Status |
|---|---|---|---|
| Name | 15 | [UNVERIFIED: T-167] (Devpost usually 60) | fits the usual limit |
| Elevator pitch | 195 | [UNVERIFIED: T-167] (Devpost usually 200; SPEC §1 says ≤200) | fits |
| About the project (Markdown) | 9,651 (1,752 words) | [UNVERIFIED: T-167] (no limit known) | re-check when the draft is read |
| Testing instructions | 1,690 | [UNVERIFIED: T-167] | re-check when the draft is read |
| Built during the submission period | 593 | [UNVERIFIED: T-167] | re-check when the draft is read |

Measured Nov 24 after the submission-hardening rewrite and the writeup fixes (Ledger wording, failover, iOS pre-screen, the restored iOS Auth/Remote Config disclosure), with no fill-in markers left inside the fields. Re-measured Nov 24 after adding the "Measured: what left the device" section (D-169) and the illustrations line (D-170).

---

## Name
<!-- name -->
Strangers' Eyes
<!-- /name -->

## Elevator pitch
<!-- pitch -->
You covered your child's face. A stranger's AI can still read the name on the lunchbox and place the street behind it. Strangers' Eyes lets it try on a masked copy and never tells it if it got close.
<!-- /pitch -->

## Try it out (links)
- Live app: https://strangers-eyes.web.app
- Judge Mode deep link: https://strangers-eyes.web.app/?judge=1
- Code: https://github.com/PRIEST099/strangers-eyes

## Video
https://youtu.be/_1SQMxDQpHk

About the footage (re-cut Nov 26, D-174): the web app was recorded in Chrome with Gemini Nano switched on, so the clue scan and the guess check show ON-DEVICE with their latencies. The steps that always run as code or a small local model (metadata, faces, text, vault match, the fix plan) show BUILT-IN; RULES-ONLY appears only when an on-device AI step falls back (re-recorded Nov 27, D-179). Judge runs replay the Nov 23 recorded attacker answers, badged CACHED SAMPLE, so no photo was sent again. iOS footage is from the Simulator.

## Platforms
Web (Chrome and any modern browser) and iOS (SwiftUI, tested in the Simulator). [USER: platforms and "Best of" category, T-172]

## Built with
firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, firebase-app-check, recaptcha-enterprise, firebase-auth, firebase-remote-config, firebase-hosting, react, typescript, vite, tailwindcss, swiftui, vision, mediapipe, tesseract.js, figma, remotion, kokoro

## About the project
<!-- about -->
## Inspiration
Before posting a first-day-of-school photo, careful parents do two things: they turn location off, and they put a sticker over their child's face. I wanted to know what that leaves.

So I ran the lunchbox test. I drew a made-up child's name on a card in photos of public places and asked a cloud AI to read every word it could see. It read the name in 23 of 23. Through a light blur: 23 of 23 again. Behind a solid box: none. The same model, given photos with no location data, placed 8 of 36 within 5 km of where they were taken. The face was never the only thing in the picture.

This isn't only my worry. Privacy International's 2026 report on AI geolocation cites studies reporting street-level accuracy of up to about 60% on social-media-style photos ([Nowhere to Hide?](https://privacyinternational.org/report/5736/nowhere-hide-privacy-risks-and-policy-implications-ai-geolocation)).

I wanted a way to see a photo the way a stranger's AI would, before posting it. The catch is that you can't ask a cloud AI "is that my child's name?" or "is this near our home?" without telling it the name and the address.

## What it does
Strangers' Eyes splits the job in two.

On your device, the app strips the photo's hidden data, covers faces and the private words it can read (your child's name on a lunchbox, say) with solid black boxes, and shows you the exact copy it wants to send. Nothing goes anywhere until you approve it.

In the cloud, Gemini plays the stranger. It gets only that cleaned copy and tries to work out where it was taken.

Back on your device, the app checks that guess against a private list you keep there: your home, your child's school, your children's names, your employer. That list never leaves the device. Gemini Nano in Chrome (or Apple's model on iOS) does two jobs there: it looks over the original photo for clues before anything leaves (15–24 s, nothing sent), and it reads the stranger's free-text guess against your list (3–5 s). Plain code, not an AI, then works out how close the guess came to each of your own places and shows it as a distance band, like "School: within 1 km". It never shows the guess as a pin on a map.

If a clue can be removed, one tap covers it and the cloud tries again. The result says "Risk reduced" (never "safe") with the AI's confidence, or "Still exposed" with a suggestion to crop the photo or not post it. Then "Save a covered copy" rebuilds the photo on your device with every mask applied and no hidden data, checks it once more (no faces, none of your private words), and hands it to your share sheet: the copy to post, not the original.

The part I like most: the cloud is never told whether it guessed right. The one answer a stalker wants ("yes, that's near where they live") only ever exists on your device.

You don't have to take my word for it. In Judge Mode, switch on "Prove it offline": the stranger's first answer waits on the device, unchecked, until you turn your connection off. Only then does the device check it against the made-up family's places, with no network, and a stamp shows what the Cloud Ledger recorded while you were offline.

## Who it's for
One person, at one moment: a parent or grandparent about to post a photo of a child, on the first day of school, at a birthday, on the walk home. These are made-up examples, not real people, and no parent has tested the app yet:
- A parent posting a first-day photo. The face is covered, but the name on the bag isn't, and the street sign behind is readable. The device covers the name before anything is sent, the stranger's AI still places the street within 1 km of the school, and one tap covers the sign. Asked again, the AI only gets the city.
- A grandparent sharing a birthday photo in a family group. The check shows there's nothing in it a stranger's AI can use, and says so with its confidence, never "safe".
- Someone for whom the location itself is the danger, such as a person who has moved away from a former partner. The new address lives only in the private list. If the view from a window still gives the place away, the app says so instead of offering false comfort.

## How I built it
The one rule I stuck to: each step runs wherever is safe for the data it carries, even when another model would be faster.
- Anything that touches your private list, or the original photo, runs only on the device: Gemini Nano in Chrome, or Apple's on-device model on iOS. If there's no on-device model, it falls back to simple rules (labelled RULES-ONLY). It never falls back to the cloud.
- The attacker always runs in the cloud: `gemini-3.5-flash-lite` through Firebase AI Logic, with a JSON schema.
- In Judge Mode, where the private list is made up, the pre-screen and the guess check prefer the device. Without Nano they run in the cloud. That's the only case where those steps leave the device, and the list they carry is fake.

On the web I can tune these rules remotely with Firebase Remote Config, but there's a minimum built into the code that no remote setting can loosen.

Every AI call goes through one small piece of code I call the Egress Gate. A build check fails if anything else calls the SDK. Before each call, the gate confirms the on-device model is actually available right then. This matters because on the web, without Chrome's on-device AI, a request marked "on device only" can quietly go to the cloud. The gate also re-checks the outgoing image for metadata, faces and private text, scans the prompt for anything from your list, and logs the call in a Cloud Ledger you can open in the app. Turn on "Technical details" and every step shows where it ran (on device, in the cloud, or simple rules) and how long it took.

The web app is React and TypeScript on Firebase Hosting, with App Check, Anonymous Auth and Remote Config. Faces and text are found with MediaPipe and Tesseract.js, and distances are worked out in code. It's covered by over 3,400 automated tests.

The iOS app is SwiftUI with Firebase AI Logic. Apple's on-device model runs the pre-screen and the guess check. It only sees the text and labels that Apple's Vision framework picks out of the photo, never the image itself. A Judge Mode run of the level crossing on the iOS Simulator, replaying the recorded attacker answers, ended "Risk reduced" with every private step on the device and nothing sent. And on Nov 27 the iOS app made its first live Gemini call from the Simulator: a drawn street scene, the pre-screen on Apple's model, the attack in the cloud through Firebase AI Logic in 6.6 s.

I built this with Claude Code as my coding assistant. The illustrations in the app and the video were generated with Figma's AI image tool (credited in web/public/art/SOURCES.md). The video's other animations were drawn in code, and the narration is a text-to-speech voice (Kokoro). The app footage is the real app.

## Try it without your own photos
Judge Mode uses three openly licensed (CC0) photos of public places, two in Ljubljana and one in Berlin. I covered the people and real number plates, drew in a lunchbox labelled "LUCAS", and made up a family with a home and work nearby.

When the cloud model is available, each sample is attacked live. When it isn't (Google's free tier was often overloaded while I worked), the app replays real answers I recorded on Nov 23, clearly labelled CACHED SAMPLE. Here's what those recorded runs found:
- Station: it read the sign and named the wrong city, about 100 km off. With the sign covered, it still found the right city from the building. Still exposed.
- Level crossing: it read a street sign and a house-number plate and placed the photo within 5 km of the made-up home and work. With both covered, it could only name the city. Without Nano, the guess check runs in the cloud on the made-up list, merged with simple rules; my Nov 23 run on that path said "Risk reduced", and so do the rules alone when offline (and Apple's model on iOS). With Gemini Nano doing the guess check it goes both ways: in 10 runs it said "Still exposed" 6 times (Nano linked the made-up workplace to that city) and "Risk reduced" 4 times. The video shows a "Still exposed" run and the gallery a "Risk reduced" one. Both are honest readings of a city-level guess; the app never says "safe".
- Castle with the lunchbox: it placed the photo 0.1 km from the made-up workplace, and there was nothing a mask could remove. Crop it or don't post it.

I originally used a different second photo, a bike-share path that ended "Still exposed", and swapped it for a Berlin one so there would be a sample a fix can actually help. I tried six Berlin photos. Google's model was overloaded for most of them, and the level crossing was the one that got a complete answer.

## What I measured
**Names: the lunchbox test.** The private list exists to catch things like your child's name on a bag, so I tested that directly. I drew a made-up first name on a card in 24 fresh photos of public places. The app's own on-device text reader caught the name in 22 of 23 (the face check held one photo back) before anything would be sent. Then I asked the cloud model to transcribe all the text it could see: it read the name in all 23 with no mask, and in all 23 again through a light blur. Through a strong blur, or the app's solid box, it read none. Blur is a dial, not a wall: it only works if it's strong enough. A solid box can't be too weak, which is why the app uses one.

**Places.** I tested the attacker on 40 openly licensed photos of public places that were uploaded to Wikimedia Commons in the two weeks before the run, so the model is unlikely to have seen them. I picked them by a rule written down before I looked at any image, and the app's own face check held back 4. Each photo got the same redacted copy the app sends, three times. Free-tier Gemini placed 8 of the 36 within 5 km (95% interval 12–38%), 5 of them within 1 km, and refused none of 126 runs. Looking back at the results afterwards, almost all of them were street scenes: 7 of 16, against 0 of 14 nature, park and rural photos.

**Does covering help?** I ran those 8 placed photos through the real app three times, with Gemini Nano on and a made-up home pin near each one, and let the app's own fix loop (up to three rounds) do its work. In 15 of the 24 runs, the first guess landed within 5 km of home. The loop moved 9 of those 15 out (95% interval 36–80%). Split afterwards by what was possible: when the attacker's clues could be covered, the loop moved 9 of 10 out. In the other 5 there was nothing to cover, because the photo was placed from buildings or layout, and the app said so instead of pretending. This work also caught a bug of mine: cropping could send the remaining area sharper than before. A crop now never adds detail.

**Blur and places.** On 15 photos I hid the same clues three ways, three runs each. With the solid box or a strong blur, 2 of the 15 were still placed within 5 km. With a light blur, 4 were, and the typical guess went from 345 km away to 15 km. Fifteen photos isn't statistically firm (p = 0.15), and the light-blur runs were made a day later, but it points the same way as the names.

**How steady is the on-device AI?** I ran each of the three samples 10 times with Gemini Nano and the recorded attacker answers. Two samples ended the same way all 10 times. The level crossing ended "Still exposed" 6 times and "Risk reduced" 4 times, because Nano doesn't always link the made-up workplace to the city the attacker names. In all 30 runs every private step ran on the device, with no fallback and nothing sent. The clue scan takes 15–24 s and the guess check 3–5 s.

**Does iOS land in the same place?** I ran the same 8 photos once each through the iOS app in the Simulator, with Apple's on-device model and live Gemini (14 cloud calls, none refused). Apple's model did every pre-screen and guess check that had something to work on, on the device. 7 of 8 first landed within 5 km of the made-up home, and the iOS app's single fix round moved 5 of them out (5 of 6 when there was something to cover). On "within 5 km" it agreed with the web on 6 of the 8 photos; the other two are ones the attacker places differently from run to run anyway. One run per photo, in the Simulator, not on a phone.

**Opened offline.** I ran "Prove it offline" 15 times (5 per sample) with Gemini Nano, cutting the browser's network at the sealed answer. All 15 guess checks ran on the device, in 3–6 s after opening, the stamp counted 0 cloud calls each time, and the page didn't even try to reach a server while offline. With the network cut a cloud call couldn't have succeeded anyway, so this shows where the check runs, not what is sent when you're online (that's measured below).

The aggregates and scripts are in the repo (benchmark/bench/, docs/nano-stability.md, docs/fix-loop-measurement.md, docs/sealed-answer.md, docs/ios-parity.md).

I also measured what actually leaves the device during a full check, on a local build of the app: one of the benchmark street photos, a made-up private list, Gemini Nano on, the first attack, the fix and the re-attack. That photo had no faces or private words in it, so this shows what is sent, not how well the masks work (the name test above does that). Exactly two images left, one redacted 1536 × 1152 copy per attack (295 KB and 290 KB, no hidden photo data, the same bytes the consent screen showed). No word from the private list, no saved location and no part of the 2.1 MB original was in any request, and the Cloud Ledger matched the network to the kilobyte. The measurement also found one thing I hadn't disclosed: the face detector I use (Google's MediaPipe) sends small usage pings to Google, a few dozen bytes with the library version and timings and nothing from your photo. The app now says so. The script and the full report are in the repo.

## Misuse
A "where was this taken?" tool could help a stalker, so the app never shows the AI's guessed place: no name, no pin, no address. You only see how precise the guess was (street, city or country), its confidence, and how close it came to your own saved places. With an empty list, it tells you how exposed a photo is, not where it is. Photos come from your own files only, and you confirm you're 18+ and checking your own photos. I'll be upfront: someone determined could read the raw answer in the browser's developer tools, but they'd get little more than they would by asking Gemini directly. App Check, quotas, a daily cap and a kill switch limit how much the app can be used, not why.

## Challenges I ran into
- "On device only" isn't a guarantee on the web, so every private call is checked, and a cloud answer to a private call counts as a breach.
- The bigger free-tier Gemini model returned server errors on most calls, so I moved to flash-lite with a 45-second timeout.
- A mask can cover a sign, but not a building. And a wrong first guess can look reassuring when it shouldn't: at the station, the AI first named the wrong city, then found the right one once the sign was covered.

## What I learned
I learned that hybrid AI makes the most sense when each side needs something the other can't have. The cloud knows the world well enough to place a photo, and only the device knows the secrets that make that dangerous. Keeping those two apart turned out to be most of the work.

## Limitations
- The names were drawn cards in clean capitals on photos of public places, not real children, name tags, uniforms or handwriting, and the name reader was a separate test, not the app's attacker (which is told not to repeat names). No family photos were tested and no parent has tried the app.
- The location numbers come from 36 photos of public places on Commons, not from what people actually post. Recently uploaded makes it unlikely the model saw them, not impossible: famous places are known whatever the photo.
- It runs on Google's free tier with a lighter model, so a stronger model might find more. Google may use the redacted image to improve its products, and the consent screen says so.
- iOS runs in the Simulator only; I have no physical iPhone to test on. Its Judge Mode replays the recorded answers. The live iOS loop ran once per photo on 8 photos, in the Simulator with an App Check debug token; two more runs were cut short when cloud calls hung, which showed the iOS app needed its own 45-second time limit (now added). iOS doesn't use Anonymous Auth or Remote Config yet: it reads the bundled defaults.
- Without on-device AI, the private steps use simple rules. On a re-attack the cloud can see which areas you covered, but never why.

## What's next
Testing with parents, names in handwriting and on fabric, an Android version with Gemini Nano, iOS on a physical iPhone, a benchmark of photos people actually post (with their consent), and a browser extension that checks a photo right where you're about to post it.
<!-- /about -->

## Testing instructions
<!-- testing -->
1. Open https://strangers-eyes.web.app in any browser. There's no login and it's free.
2. Confirm you're 18+, then choose "Open Judge Mode" (or go straight to https://strangers-eyes.web.app/?judge=1) and press "Run this sample". It plays through on its own: pre-screen, consent, attack and result, then fix and attack again when a clue can be covered.
3. Turn on "Technical details" in Settings to see where each AI step ran (on device, in the cloud, or simple rules) and how long it took. The Cloud Ledger shows what left your device.
4. To see that the guess check happens on your device: switch on "Prove it offline" in Judge Mode, then run a sample. When the sealed answer appears, turn your Wi-Fi off (or DevTools › Network › Offline) and press "Open it offline". The stamp shows what the Cloud Ledger recorded while you were offline. Turn Wi-Fi back on and the run continues. Settings › "Simulate offline" doesn't count, because it doesn't cut the network.
5. These results aren't staged. In my Nov 23 runs the station ended "Still exposed" and the castle "Crop it or don't post it". The level crossing ends "Risk reduced" when the cloud or simple rules do the guess check (no Nano), and with Gemini Nano it goes both ways ("Still exposed" 6 times and "Risk reduced" 4 times in 10 runs), because Nano doesn't always link the made-up workplace to the city the AI names. A live run can differ.
6. If the cloud model is busy or unavailable, Judge Mode replays my recorded Nov 23 answers, labelled CACHED SAMPLE. The replay itself sends nothing, but the Ledger still counts anything that already left: a live attempt that timed out or hit a server error, and, if your browser has no Nano, Judge Mode's pre-screen and guess check, which run in the cloud for the made-up samples only. Your own photos and your own private list never take that route.
7. Optional: in desktop Chrome with on-device AI turned on (chrome://settings/ai and chrome://flags/#prompt-api-for-gemini-nano-multimodal-input), reload, and once Settings shows Nano as available, the private steps run on the device.
8. Optional: try a photo you took yourself, with no people in it. Even with an empty private list you'll see the clues and how precise the guess was.

No credentials are needed. The iOS app is shown in the video; build steps are in the README (you'd need your own Firebase project and an App Check debug token).
<!-- /testing -->

## Built during the submission period (summary field)
<!-- built -->
Strangers' Eyes is a new project, started on Nov 19, 2026, with no code from before the submission period. I wrote it during the hackathon with Claude Code as my coding assistant, starting from the standard Vite template, and made the product and design decisions myself. Third-party libraries (the Firebase JS and iOS SDKs, MediaPipe, Tesseract.js, exifr, idb-keyval, React, Vite, Tailwind) are listed with their licences in THIRD_PARTY_NOTICES.md. The Judge Mode photos are CC0 images from Wikimedia Commons, credited in web/public/samples/SOURCES.md, with masks and drawn props added by me.
<!-- /built -->

## Gallery (T-166; no third-party logos, no real home or school)
Files are in `docs/img/gallery/`, one caption each, in this order. Uploaded to the Devpost draft on Nov 25 in this order, with these captions (Devpost caps captions at 140 characters). D-174/D-176 (Nov 26): 02–07 retaken in Chrome with Gemini Nano and the new "Other network traffic" wording, captions 2–4 rewritten; the Devpost gallery needs those six files and captions re-uploaded [USER approval]. Retaken Nov 24 from the real flow on the plain-language screens (`scripts/shoot-gallery.mjs`; 02–04 replay the recorded answers with Simulate offline, so nothing was sent; 05 is the gate refusing on the device).

1. `01-home.png`: "Location off isn't location hidden: the home screen, with an animated illustration of how a check works."
2. `02-judge-run.png`: "Judge Mode with Gemini Nano: the clue scan ran ON-DEVICE (24 s, 0 bytes sent); the always-on checks read BUILT-IN."
3. `03-verdict.png`: "Level crossing: a street-level guess within 5 km of the made-up home and work, as distance bands, never a pin. Checked on Nano."
4. `04-reattack.png`: "Fix and re-attack: signs masked, the AI could only name the city. Nano's check said Risk reduced here; the video's run: Still exposed."
5. `05-blocked.png`: "The Egress Gate stops an attack whose copy still shows a word from the vault (LUCAS): 0 bytes sent on that call."
6. `06-about-routing.png`: "What leaves this device: never your vault (the private list) or your original photo."
7. `07-capabilities.png`: "What runs where in this browser: for private steps, Nano when available, otherwise simple rules, never the cloud."

Optional: 8. `docs/img/architecture.png` "One Egress Gate between the device and Firebase AI Logic." 9. `docs/img/routing.png` "Routing by sensitivity class, with a hard floor in code."

Thumbnail: `docs/img/thumbnail.png` (3:2).

## YouTube
- Title: Strangers' Eyes: you covered your child's face. What else does a stranger's AI see?
- Thumbnail: `video/out/thumbnail.jpg` (1280 × 720; git-ignored, regenerate with `npx remotion still` on a frame of the stranger scene or the closing card)
- Subtitles: `video/out/subtitles.en.srt` (regenerated for the D-186 cut: 49 cues, 176.4 s)
- Tags: BuildHybridAI, Firebase AI Logic, Gemini, Gemini Nano, hybrid AI, on-device AI, photo privacy, sharenting, child safety online, Apple Foundation Models. Chapters start at the rendered scene starts (D-186 cut, 2:56), each at least 10 s.

Description:

You cover your child's face before you post the first-day-of-school photo. A stranger's AI can still read the name on the lunchbox and the street sign behind. Strangers' Eyes shows you what that AI can work out, before you post, without telling it anything about you.

On your device, the app covers faces and private words with solid black boxes and strips hidden photo data. In the cloud, Google's Gemini plays the stranger and sees only that cleaned copy. Back on your device, the app checks the guess against a private list that never leaves it: how close it came to your home and work, and whether it picked up your children's names. It covers the clues and lets the AI try again, then saves a covered copy to post. The cloud never learns whether it guessed right, and "Prove it offline" lets you check that with the connection cut.

For your own photos, the private steps run on the device (Gemini Nano in Chrome, or Apple's on-device model on iOS) and the attack runs in the cloud, all through Firebase AI Logic. With no on-device AI, simple rules take over, never the cloud. The web clips were recorded in Chrome with Gemini Nano on; the offline scene cuts the network with Chrome's own offline mode. The iOS image is from the iOS Simulator. The opening photo is a drawing: no real child, name or street.

The Judge Mode answers in this video were recorded on Nov 23 and replayed, labelled as such. The photos are openly licensed pictures of public places, and the family is made up.

The test numbers come from pre-registered tests: a made-up name on a card was read 23 of 23 times through a light blur and 0 of 23 under the solid box; on 36 openly licensed photos of public places uploaded in the two weeks before the test, the AI placed 8 within 5 km with no refusals in 126 tries; when a clue could be covered, the app's fix moved 9 of 10 out. The method and the aggregates are in the repo.

Chapters
0:00 A covered face isn't a hidden child
0:21 How a check works
0:44 Judge Mode: the name covered on the device
1:02 The last checkpoint
1:12 Castle: crop it or don't post it
1:34 Level crossing: a fix helps
1:52 Prove it offline, and the copy to post
2:10 The tests: names first, then places
2:27 Hybrid AI, on the web and iOS

Try it: https://strangers-eyes.web.app
Code: https://github.com/PRIEST099/strangers-eyes

Built for #BuildHybridAI 2026.
