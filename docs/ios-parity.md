# iOS parity: the iOS app on the 8 fix-loop photos (Nov 27, D-184)

**Question (pre-registered in the private protocol before any run or harness code).** On the same photos as the web fix-loop measurement (`docs/fix-loop-measurement.md`), does the iOS app reach the same first result as the web app, and does its fix move the photo out of 5 km?

**Method.** `scripts/measure-ios-parity.mjs` runs the DEBUG iOS app in the iOS 27.0 Simulator with a DEBUG-only harness (`ios/StrangersEyes/Dev/BenchRunner.swift`, launch argument `-iosBench`, compiled out of Release). Each of the 8 photos ran once, in id order, with no reruns, through the app's own `AppModel` flow:
1. Vision Tier-0 and the Apple Foundation Models pre-screen.
2. The Egress Gate's check of the exact JPEG.
3. A live `gemini-3.5-flash-lite` attack through the Firebase AI Logic iOS SDK, with an App Check debug token.
4. The Apple FM guess check.
5. Verdict bands, computed in code.
6. If the app's rules fix had anything to mask or crop: apply it, check the image again, re-attack live, and compare.

The made-up vault follows the same rule as the web run: Home about 0.8 km from the true camera position, Work about 3 km away, and a child's name. It lived only in the app's memory, and a temporary manifest the Simulator read was deleted after the run. The app printed bands, levels and routes only. A dry run with the DEBUG stand-in attacker (no cloud call) checked the harness first; it is not counted.

The iOS app has one fix round; the web has up to three. "Within 5 km of Home" uses the band of the Home line the app shows, as the web script read it from the card.

## Results

| | iOS (1 run) |
|---|---|
| Live attacker calls / refusals, blocks or timeouts | 14 / **0** |
| First attack within 5 km of Home | **7 of 8** (3 within 1 km) |
| ...and the app had something to cover | 6 of 7 |
| ...moved outside 5 km by the one fix round | **5 of 7** (5 of the 6 with something to cover) |
| ...still within 5 km after the fix | 1 (within 1 km before, within 5 km after: "Risk reduced", not out) |
| ...nothing to cover (placed from the buildings) | 1, and no re-attack (the app doesn't resend an identical photo since D-183) |
| Pre-screen on Apple FM, on the device | 4 of 4 photos with text or labels to read (14–57 s in the Simulator); the other 4 had nothing to read |
| Guess check on Apple FM, on the device | 12 of 12 that had a guess to check (7–25 s); 2 re-attacks gave no place guess, so there was nothing to check |
| Attack latency (cloud) | 6.0–12.4 s |

**Agreement with the web, photo by photo.** The web's majority over its 3 runs (fixed in the protocol before the live iOS run) and the iOS run agree on "first attack within 5 km of Home" for **6 of 8 photos**. The two that differ, bench-07 and bench-21, are the ones the attacker itself treats differently from run to run. On the web, bench-07 was never placed within 5 km, and bench-21 was within 5 km in 1 of 3 runs. On iOS both were placed within 5 km, and the fix moved both out.

**The fix, on both platforms.** When the attacker's clues could be covered, iOS moved the guess out of 5 km in 5 of 6 photos. The web moved 9 of 10 photo-runs. On both, the photos with nothing to cover stay exposed, and the app says so.

## Update Nov 28: runs 2 and 3 (pre-registered extension), cut short

Two more runs of the same 8 photos were pre-registered before any new call, with the same rule: each photo once per run, and a timeout or error is reported, never retried. Neither run finished. My script gives each run 30 minutes, and on Nov 28 some steps took about 15 minutes each, while the Mac (8 GB) was swapping heavily. In run 2, one cloud attack answered only after about 16 minutes, and one Apple FM guess check on the device took about 15 minutes. In run 3, two cloud calls hung for about 15 minutes and then failed.

| | Run 2 | Run 3 |
|---|---|---|
| Photos reached before the script's 30-minute limit | 2 of 8 | 4 of 8 |
| Cloud calls / answered / no answer (hung about 15 min, then failed) | 3 / 3 / 0 (one answered after about 16 min) | 6 / 4 / 2 |
| First attack within 5 km of Home | 2 of 2 | 3 of 3 answered |
| Moved outside 5 km by the fix | 1 (the other had nothing to cover) | 1 of 1 whose re-attack was answered; 1 re-attack got no answer; 1 had nothing to cover |

No model declined. Across all three runs, 12 of the 13 first attacks that were answered landed within 5 km of Home. Where a fix was applied and the re-attack answered, it moved the photo out of 5 km 7 times out of 8.

There aren't enough completed photos to compare the platforms run by run, so the 6-of-8 agreement above stays a single-run figure.

**What the cut-short runs found (F-330).** The iOS app had no time limit of its own on the attack, so a hung request kept the user waiting for about 15 minutes. It then showed the result as "the attacker declined". The web gate has always had a deadline (45 s by default) and separate wording for a timeout. The iOS gate now has the same 45-second deadline, read from the bundled Remote Config default. A call that fails or times out now says the attacker didn't answer, not that it declined. Neither is retried automatically. Unit tests cover the deadline, including a call that ignores cancellation, and the wording. The harness now records a time limit instead of crashing.

Raw logs: private (`raw/iosparity-2026-11-27T22-48-58.json`, `raw/iosparity-2026-11-27T23-40-10.json`).

## What this does and doesn't show

It shows the iOS app doing the whole hybrid loop for real, with the same split as the web:
- the private steps on Apple's on-device model;
- the attack in the cloud through Firebase AI Logic;
- the distance bands in code;

and landing where the web lands on 6 of 8 photos.

It is one run per photo, in the Simulator on a Mac, not on a physical iPhone. It uses 8 public-place photos chosen because the benchmark had placed them, so it is not a random sample. The attacker varies between runs on both platforms, so one iOS run can't separate a platform difference from run-to-run variation.

Raw log: private (`raw/iosparity-2026-11-27T19-43-06.json`: bands, levels, routes and latencies only).
