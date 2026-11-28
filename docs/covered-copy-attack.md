# The covered copy, attacked (Nov 28)

**Question (pre-registered in the private protocol before any harness code or run).** What can a stranger's AI get from the copy the app saves for posting ("Save a covered copy", D-185)?

**Method.** Two stages, so the cloud gets exactly the file a parent would post.

**Stage 1, on the device** (`scripts/measure-covered.mjs`):
- the real app, a local DEV build, in headless Chrome with Gemini Nano;
- a fresh browser profile for every photo, and no edits by hand;
- the made-up vault, import, the app's own pre-screen, then "Make the covered copy";
- the exact JPEG the app produced is saved privately, with its on-screen check line.

**Stage 2, in the cloud** (`benchmark/spike/run-spike.mjs --coverexp`):
- each saved file is sent once, byte for byte, with no re-encoding or resizing, to `gemini-3.5-flash-lite`, the app's attacker model;
- a file that fails the metadata check is not sent;
- nothing is retried after a refusal.

## Names: the lunchbox test, on the copy you would post

The 23 drawn-name photos from the text experiment. The vault holds that photo's made-up name as the child's name. The covered copy comes straight from the pre-screen ("Just clean and export", no cloud check). Stage 2 uses the same transcription prompt and the same name-matching rule as the text experiment.

| | Result |
|---|---|
| Name read by the cloud model from the **uncovered** photo (text experiment, Nov 26) | 23 of 23 |
| Name read from the **covered copy the app saved** | **0 of 22** |
| Photos where the app refused to make a copy (its final check found a face it could not cover) | 1 (nothing saved, so nothing to post) |
| Requests to any AI service during stage 1 | 0 |

- **In short:** of 23 photos with a child's name on them, the app produced 22 copies to post, and the AI read the name in none of them.
- **The final check matters.** On 3 photos the pre-screen's text reader missed the name. The covered copy's final check, which reads the full-size image again, found it and covered it before saving.
- **What it doesn't show:** these are drawn names in clean capitals on photos of public places. They are not real children, handwriting or fabric.

## Places: the 8 placed photos, through the whole flow

The 8 fix-loop photos with the fix-loop vault (made-up Home about 0.8 km from the camera, Work about 3 km away, a child's name). The app's normal flow ran: a live attack, then its own fix loop (up to 3 rounds), then the covered copy from the final screen. Stage 2 used the attacker prompt on that exact file. Distances are worked out in code.

| | Result |
|---|---|
| First attack of this run, within 5 km of Home (the band the app showed) | 6 of 8 |
| On the app's final screen, still within 5 km | 3 of 8 (all three with nothing a mask could hide: placed from buildings) |
| **Covered copy, attacked: closest guess within 5 km of Home** | **5 of 8** |
| ...of those, still within 5 km on the app's final screen, placed from buildings (the app said so) | 3 |
| ...placed within 5 km again although the app had covered or shown them as out | 2, both at 1–5 km (district) |
| Cloud calls in the whole arm / refused | 23 / 0 (15 in the app's own loop, plus one resend after a network error; 8 in stage 2) |

- **The two that came back are a real finding.**
  - On the screen, one photo had been "not linked" and the other moved from within 1 km to "not linked" after its fix.
  - Each was then placed within 5 km from the saved copy.
  - The app checks the copy it sends to the attacker, at most 1,536 px. The saved copy is the full photo, up to 2,048 px, so a stranger gets more detail than the app tested.
  - One run can't tell whether the extra resolution caused this or it's run-to-run variation; the same two photos already behaved differently between runs and platforms.
  - Either way, the app shouldn't hand out more detail than it checked (see D-187).
- **The three with nothing to cover** stayed placed, as the app had told the user ("crop it or don't post it").
- One stage-1 attack hit a network change (`ERR_NETWORK_CHANGED`). The app's gate sent one identical request, which its policy allows for network errors only.

## Places, re-tested with the size cap (run 2)

After D-187 the saved copy is capped at the size the app tests (1,536 px). The re-test was written into the private protocol before it ran. It used the same 8 photos, the same harness, vault rule, flow, prompt and scoring, so it is **a re-test on a development set, not a fresh sample**.

| | Run 1 (no cap) | Run 2 (D-187 cap) |
|---|---|---|
| Saved copy, longest side | 1,920–2,048 px | 1,152–1,536 px (1,152 where the app cropped) |
| First attack of the run, within 5 km of Home | 6 of 8 | 6 of 8 |
| Covered copies saved | 8 | 7 (1 lost to a harness timeout, see bench-40 below) |
| **Covered copy, attacked: closest guess within 5 km of Home** | **5 of 8** | **2 of 7** |
| ...the app's final screen still said within 5 km, and the save card warned | 3 | 1 |
| ...the app's final screen said "not linked" | 2 | 1 (the same photo as in run 1) |
| ...the app's loop ended with nothing left to mask (the protocol's "nothing a mask could hide") | 5 | 2 |
| Cloud calls in stage 2 / refused / resent | 8 / 0 / 0 | 7 / 0 / 0 |

- **None of the hits had anything left to mask.** In both runs, every copy that was placed came from a photo where the app's loop had ended with nothing more to cover. Either the photo was placed from its buildings or layout, or the app's own attack hadn't linked it.
- **Every file was sent as saved.** The SHA-256 of each file sent matched the file the app saved.
- **One of the two is the honest case.** The app's final screen said within 5 km, and the save card showed "still lands near one of your places".
- **The other is a miss by the app's single attack, not by the cover.** The app had nothing to mask on this photo, and its own attack said "not linked" in both runs. The attack on the saved copy placed it at 1–5 km in both runs, now at the same size the app tested. One attack is one draw, and on this photo the draws disagree.
- **We can't credit the cap alone.** Three run-1 copies moved out of 5 km. For one of them, the app's loop masked more and cropped in run 2. The other two got no different fix, and one of those went from within 1 km to "same country" with nothing changed but the size. Single attacks on the same photo swing a lot, which is also why the app says "Risk reduced", never "safe".
- **bench-40: no copy, a harness timeout.** After the app's third fix, its check on the outgoing copy switched sending off. The harness then looked for the save card under the Re-attack step, where that blocked consent sheet sits, and timed out. The card is under the Verdict step. As the protocol says, this is reported and not re-run. The harness now looks under both (F-334).

## What this does and doesn't show

It shows the last step working for the threat the product is built around: in 22 copies made to be posted, a cloud model read no names.

For places, the covered copy is only as good as what the fix could reach, and one attack is one draw.
- **Run 1:** 5 of 8 saved copies were placed within 5 km.
- **Run 2, with the size cap, on the same photos:** 2 of 7 copies (the eighth was lost to a harness timeout). The app had warned about one of them. The other is a photo its own attack had called "not linked" twice.

These are drawn names and 8 photos of public places, and the places re-test reuses its development set.

Raw logs: private.
- Names: `raw/covered-names-2026-11-28T09-35-29.json`, `raw/bench-coverexp-names-2026-11-28T10-15-04-live-p01to24.json`.
- Places run 1: `raw/covered-places-2026-11-28T09-57-44.json`, `raw/bench-coverexp-places-2026-11-28T10-21-27-live-*.json`.
- Places run 2: `raw/covered-places-2026-11-28T13-23-25.json`, `raw/bench-coverexp-places-2026-11-28T13-37-30-live-*.json`.
