# Fix-loop measurement: the app's own fix loop on 8 benchmark photos

Measured on 26 Nov 2026, 07:55–08:09 UTC, with `scripts/measure-fix-loop.mjs`. This file holds aggregates only. The raw per-photo log is kept in PRIV (`raw/fixloop-*.json`). It has no coordinates, no photo titles and no attacker place names.

## Update Nov 27: three runs (pre-registered extension)

The protocol was extended before any new run: the same 8 photos, flow and made-up vault, two more independent runs (each photo once per run, fresh browser profile, no reruns), the Nov 26 run counted as run 1. Raw logs in PRIV (`raw/fixloop-2026-11-27T07-46-18.json`, `raw/fixloop-2026-11-27T08-00-17.json`).

| | Run 1 (Nov 26) | Run 2 | Run 3 | All three |
|---|---|---|---|---|
| Photos whose first attack landed within 5 km of Home | 5 | 5 | 5 | **15 photo-runs** |
| ...moved outside 5 km by the fix loop | 4 | 2 | 3 | **9 of 15** (60%, 95% interval 36–80%) |
| ...stayed within 5 km because the app found nothing it could mask | 1 | 2 | 2 | 5 |
| ...stayed within 5 km after the fix | 0 | 1 | 0 | 1 (still within 1 km after two fixes: "Still exposed") |

- **When the attacker's clues could be masked, the loop moved the guess out of 5 km in 9 of 10 photo-runs** (95% interval 60–98%). This split was made after the runs.
- In the 5 photo-runs with nothing to mask, the photo was placed from things a mask can't hide (buildings, layout), and the app said so ("crop it or don't post it") instead of claiming a fix.
- The same photo can behave differently between runs: the attacker cites different clues each time (for example, one photo had a maskable clue in run 2 and none in run 3).
- Run 2 and 3: 31 live attacker calls, all answered; 0 refusals, safety blocks or timeouts. The fix plan is deterministic code on the device (labelled BUILT-IN in the app since Nov 27).

## The question (pre-registered before any run)

Through the real app (normal Check flow, Gemini Nano on, DEV server), how many of the 8 photos that the benchmark located within 5 km end the app's own fix loop outside the 5 km band, using up to the app's 3 fix rounds?

The protocol was written into the private benchmark protocol before the run: the 8 photos the benchmark placed within 5 km (in 2 of 3 runs), each run once in id order, no reruns, never a re-attack after a refusal or block.

## Answer

**7 of 8 photos ended with the closest Home band outside 5 km. But only 4 of those 7 got there through the fix loop.**

- In 3 photos (p2, p6, p7), this run's first attack already landed outside 5 km of Home. The fix loop did nothing for them: the app found nothing it could mask.
- 5 photos started within 5 km of Home in this run. The fix loop moved 4 of them outside 5 km (p3, p4, p5, p8).
- The fifth (p1) stayed **within 1 km** of Home. Its verdict was RED, and the app found no clue it could mask, so it was never re-attacked.

| | Count (of 8) |
|---|---|
| Final closest Home band outside 5 km (coarser than "within 5 km (district)") | **7** (4 through the fix loop, 3 already outside on the first attack) |
| Final headline "Risk reduced" | **4** (p3, p4, p5, p8) |
| Final headline "Still exposed" | **0** |
| Never re-attacked, because the first fix had nothing to mask | **4** (p1, p2, p6, p7) |
| Loop ended because a later fix had nothing to mask | 2 (p3 after 1 round, p4 after 2 rounds) |
| Used all 3 fix rounds | 2 (p5, p8) |
| Live cloud attacker calls | **17** (8 first attacks + 9 re-attacks), all HTTP 200 |
| Refusals, safety blocks, cloud errors, timeouts | 0 |
| Harness errors | 0 |

## Per photo

Labels p1–p8 follow the benchmark id order. Bands are the app's code-computed distance band from the attacker's closest guess to the made-up Home pin. "Not linked" means the guess was too far away to draw a Home line at all: "same country or region", or "not located nearby".

| Photo | Fix rounds used | Level per attack | Closest Home band per attack | Final headline | How the loop ended |
|---|---|---|---|---|---|
| p1 | 0 | RED | within 1 km | (first verdict) A stranger could find you from this photo | Round 1: nothing to mask |
| p2 | 0 | LOW | not linked | (first verdict) Low exposure found | Round 1: nothing to mask |
| p3 | 1 | RED → LOW | within 1 km → same city area | Risk reduced: within 1 km (neighbourhood) → same city area | Round 2: nothing to mask |
| p4 | 2 | AMBER → LOW → LOW | within 5 km → not linked → not linked | Risk reduced: within 5 km (district) → same country or region | Round 3: nothing to mask |
| p5 | 3 | RED → AMBER → AMBER → LOW | within 1 km → within 5 km → within 5 km → same city area | Risk reduced: within 1 km (neighbourhood) → same city area | 3-round cap ("That's 3 rounds for this photo") |
| p6 | 0 | LOW | same city area | (first verdict) Low exposure found | Round 1: nothing to mask |
| p7 | 0 | LOW | same city area | (first verdict) Low exposure found | Round 1: nothing to mask |
| p8 | 3 | AMBER → LOW → LOW → LOW | within 5 km → not linked → not linked → not linked | Risk reduced: within 5 km (district) → not located nearby | 3-round cap |

What each fix masked, all from the app's deterministic planner:

- **p3:** 1 area ("other").
- **p4:** a crest or logo, then storefront text.
- **p5:** a crest or logo, then a street sign, then a crop from the right (no new mask).
- **p8:** storefront text and a crest or logo, then a transit sign, then storefront text.

Every compare headline is measured against the photo's first verdict. That is how the app words it.

## Routes of every AI step

| Step | Route | Calls | Latency |
|---|---|---|---|
| Pre-screen (photo, S1) | ON-DEVICE (Gemini Nano) | 8 | 15.9–24.8 s |
| Attacker pass B (redacted copy, S3) | IN CLOUD (gemini-3.5-flash-lite) | 17 | 9.8–21.9 s (median 13.8 s) |
| Referee: guesses vs vault (S0) | ON-DEVICE (Gemini Nano) | 17 | 2.9–3.7 s |
| Fix plan | deterministic code (shown as RULES-ONLY on Nov 26, BUILT-IN since Nov 27, D-179; it writes no HUD/Ledger line) | 15 plans shown | – |

No step was BLOCKED. No S0 or S1 step fell back to rules, and none went to the cloud.

The network log on the page and its workers saw 17 POSTs to the AI host, plus 8 CORS preflights (OPTIONS, no body). That matches the 17 attacker lines in the HUD. Each photo's receipt agreed with its count, for example "Cloud received 4 redacted images in 4 requests · 0 faces · 0 vault items".

## Set-up

| | |
|---|---|
| Browser | Chrome 158.0.8127.38, headless. Each photo got a fresh temporary profile, deleted afterwards. The user's own profile was never touched. |
| On-device model | Gemini Nano: `LanguageModel.availability()` = `available` before each photo. The model is linked into the profile with the Prompt API multimodal flags. |
| App | DEV server on localhost:5173 (App Check debug token). Normal `#/check` flow, not Judge Mode, no simulated offline. "Technical details" was on, which changes the display only. |
| Cloud model | gemini-3.5-flash-lite through Firebase AI Logic. The app made one cloud call per attack (pass B only). |
| Vault (made up, the same rule for every photo) | Home pin about 0.8 km north of the photo's true camera position. Work pin about 3 km west. Child's name "LUCAS" (not in these photos). Both pins were typed as coordinates, with no labels. The values existed only in memory and in the browser. They were never printed or saved. |
| Driving | Import → pre-screen → consent and Send → verdict. Then, while the app offered it: "Fix it on this device" / "Fix again" → Apply fix (the app's proposed plan, unchanged) → "Re-attack the fixed photo" → consent and Send → comparison. Retry and decline paths were never clicked. |
| Before the live run | One dry run stopped at the first consent sheet (no AI request). A self-test read the DEV verdict-card gallery to check the card reader. |

## Limits

- **One run per attack.** The attacker is not deterministic, and this run's first verdicts differed from the benchmark for the same photos. 3 of the 8 "within 5 km in the benchmark" photos were outside 5 km of Home on their first attack here. A second run would probably give different bands.
- **Bands are to a made-up Home pin, not to the camera.** The pin sits about 0.8 km from the camera, so "within 1 km of Home" and "within 1 km of the camera" are not the same thing.
- **Small and narrow sample.** 8 openly licensed photos of public places, not people's own photos of their own streets.
- **The fix planner was rules-only throughout.** The app's own copy says Gemini Nano plans the fix. On the Check screen the plan comes from deterministic code (`core/fixPlan`), shown as "Rules-only fix".
- **Small UI oddities seen** (recorded, not fixed):
  - On p5's third round, the fix was a crop with no new mask. The fix panel said "0 more areas masked", while the consent sheet said "1 more areas masked since the last send".
  - That crop also sent the remaining area at a higher resolution: 1337 × 1536 px, against 1536 × 1152 before.
  - "Expected after fix: street" appeared on a plan with nothing to mask.

## Reproduce

```
SE_NANO=<folder holding an OptGuideOnDeviceModel copy> node scripts/measure-fix-loop.mjs --dry --photos <id>   # stops before Send
SE_NANO=<…> node scripts/measure-fix-loop.mjs                                                                  # live: up to 4 attacks per photo
```
