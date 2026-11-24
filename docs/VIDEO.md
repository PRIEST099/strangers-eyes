# Demo video: script, shot list and edit decision list (T-180)

> Source rules: RUNBOOK §6.1–6.8 and §7.4, TASKS T-180–T-187, SPEC §14.6. **Total: 2:50 (170 s)**; the hard limit is 3:00.
> Fill rules: numbers on screen and in the voice-over come only from the Day-1 adversary spike (`benchmark/spike/day1-adversary.md`: 10 openly licensed photos of public places) or from a PROGRESS-logged measurement. The planned 25-photo builder-owned benchmark (T-150..T-153) was **not run**: never quote it. Verdict lines are whatever the app really produced on the take used. The only open markers are `[USER: …]` items.
> **Superseded in part (Nov 23 night, D-164): the user asked Claude to build the video in Remotion with the Kokoro voice (`af_heart`, speed 1.07, the same voice as the Aftermath video).** The build lives in `video/` (§6 below); its narration is `video/scripts/narration.json`, which replaces §3's voice-over draft and §4's ffmpeg cut. §0–§2 remain the content rules; where they name judge-02 as unfilmed or a ×4 hand edit, §6 wins.
> The voice-over draft in §3 was written for the user's own voice (T-185); it is kept as history.

## 0. Decisions this script depends on

| # | Question | Decision | Fallback |
|---|---|---|---|
| V1 | Footage source for the web beats | **Decided: Judge Mode on the CC0 samples** (D-153; live recordings kept by the user, D-161). judge-03 (castle courtyard, drawn "LUCAS" lunchbox) for Beats 1, 3, 4, 5 and the first half of 6; judge-01 (station forecourt) for the second half of Beat 6. judge-02 is not filmed (its bank, bike-share and bus branding would need boxes in every shot). Beat 2 shows the Demo profile's own vault with the same made-up labels as Judge Mode's fake vault. The staged own-photo shoot (T-010) is superseded by D-153. | none needed |
| V2 | Live attacker on camera | **Decided: live.** Pass B runs on the free tier with gemini-3.5-flash-lite (D-159): the Day-1 spike measured a median of 7.0 s, p90 9.4 s, max 10.9 s. advB times out at 45 s and is never retried (D-158). The `STAND-IN ANSWERS` chip is gone (D-161). The VO follows the answer of the take actually used; a retake is for a camera mistake, never for a nicer answer. | If the live attacker is unavailable, Judge Mode replays the Nov 23 recording with the **CACHED SAMPLE** badge and "Recorded result for this sample (…)". Keep both in frame and use the VO variant "a recorded answer from the same attacker, on November 23". |
| V3 | iOS footage | **Decided: Beat 7 cameo only** (Session A). Beat 2 is on the web, because the iOS vault takes typed `lat, lng` and has no "Pin this place" (`ios/NOTES.md`), and coordinates never go on camera. The cameo runs the DEBUG build with `-fakeAdversary`: Apple FM referees ON-DEVICE, the attacker is a labelled stand-in (the real Gemini path on iOS has not been exercised), so the caption and VO say so. | If Session A fails: a 7 s card from `ios/screenshots/ios-06-referee-running.png` and `ios-07-verdict.png` with the same caption. Never use `ios-11-risk-reduced.png` without the stand-in caption. |
| V4 | Offline pre-screen (RUNBOOK §6.6 Beat 3) | **Dropped**: the offline PWA (T-106) is deferred, so Beat 3 is filmed online. | none |
| V5 | Gate beat (Beat 4) | **Keep, if the T-182 rehearsal shows it.** The code path exists: un-ticking the "LUCAS" mask makes the consent panel warn (`copy.consent.unmasked`, Send stays enabled), and a gate block on `VAULT_TEXT_IN_IMAGE` shows "Blocked: 'LUCAS' would have left this device." as an alert in the Attack panel (the separate toast component of T-082 is not built). Seen working in a real browser on Nov 23 (dev build, Judge castle sample, Autoplay off): BLOCKED `VAULT_TEXT_IN_IMAGE`, 0 bytes, no request left the browser; gallery 05-blocked.png. | Cut Beat 4 and give its 15 s to Beat 5 (s10 +7 s, s14 +8 s); drop the VO lines at 0:55–1:04 and SRT cues 13–15. |
| V6 | Grounded notes (pass A) | **Not shown.** Search grounding is off on the free tier, and pass A is not built (T-070). | none |
| V7 | Third-party branding in judge-01 | The bus operator's wordmark is on several buses. In s16–s18, cover every legible wordmark with a solid box captioned "logo hidden for video" (`LOGO_BOXES` in the ffmpeg script, set at the cut). The app's own masks stay as they are. | none |

## 1. Recording sessions (8 GB rule: never Chrome Nano and Simulator FM together)

| Session | When (RUNBOOK §6.5) | Runtime | Before recording | Clips |
|---|---|---|---|---|
| B | Sat Nov 28 morning | Chrome + Gemini Nano; **Simulator shut down** (`xcrun simctl shutdown all && osascript -e 'quit app "Simulator"'`), Xcode quit | Hosted app https://strangers-eyes.web.app (no debug token in the console). T-182 confirms the ON-DEVICE badge shows there (U-10 is still partial); if not, record on localhost with **DevTools closed**. Demo Chrome profile (no extensions, no bookmarks bar, zoom 110–125%); Nano `available` (RUNBOOK §3.1); one warm-up run per sample; memory pressure green; Wi-Fi on; HUD bottom-left and Ledger rail in frame. **Demo vault filled off camera** with "Enter coordinates I know": Home at a public place, Work "City General Hospital" at another public place, child's name "Lucas" (no coordinates are ever on camera). | `vault.mov`, `j03_main.mov`, `j03_gate.mov`, `j01_autoplay.mov` |
| A | Sat Nov 28 evening | iOS 27.0 Simulator (iPhone 18 Pro) with Apple FM; **Chrome quit** (no "Google Chrome Helper" in Activity Monitor) | DEBUG build installed (`ios/NOTES.md` Run), launched with `-fakeAdversary -seedDemoVault -acceptWelcome`; `xcrun simctl status_bar $UDID override --time 9:41 --batteryState charged --batteryLevel 100`; do not film the Vault screen | `ios.mov` |
| C | Sat Nov 28 evening, after A | none | QuickTime → New Audio Recording, quiet room; read §3 | `vo.m4a` |

The StoryReel clip for Beat 2 already exists (`$PRIV/video/reel/story-reel.dark.mp4`, exported Nov 23, D-162); nothing to record.

What to do in each Session B take:
- **`vault.mov`** (about 20 s): Vault screen with the three items listed, the lock badge, then the Ledger reading 0 · 0.
- **`j03_main.mov`** (one continuous take, Judge Mode, Autoplay **off**): pick judge-03 → Run → pre-screen → consent sheet → Send → attack → referee → verdict → tap "Fix it on this device" → the fix panel's message. Stop.
- **`j03_gate.mov`** (a fresh judge-03 run, Autoplay off): after the pre-screen, un-tick the "LUCAS" mask → the consent warning → Send → the blocked alert → open the Ledger. No cloud call is made.
- **`j01_autoplay.mov`** (Judge Mode, Autoplay **on**): judge-01 runs by itself: verdict → fix → re-attack → final verdict.

Capture: 1920×1080, 30 fps. Raw clips go to `$PRIV/video/raw/` (outside the repo).

## 2. Script and shot list

Times are positions in the final cut. "×4" means the footage is sped up four times and labelled on screen. Expected lines below come from the Nov 23 live recordings (D-161), with bands worked out by the app's own code; **the take decides**.

### Beat 1: Hook (0:00–0:18, 18 s) · edit + `j03_main.mov`
- **On screen:** judge-03 full screen with the caption "This photo has no GPS data." → the j03_main run from Send to the red verdict (×4) → title card.
- **Expected verdict (recording):** red; "HOME: within 1 km (neighbourhood)"; "WORKPLACE: within 1 km (neighbourhood)"; the attacker's best guess "city level · Ljubljana · high", with "Ljubljana Castle" as the venue.
- **Must be visible:** Router HUD; the Judge Mode corner tag.

### Beat 2: Who it is for, and the hybrid split (0:18–0:35, 17 s) · StoryReel + `vault.mov`
- **On screen:** StoryReel scenes 1–3 (the post with location off → the cloud's AI reads the redacted copy → the device grades it), captioned as an illustration → the web Vault: Home, City General Hospital, Lucas, the lock badge, Ledger 0 · 0.
- **Must be visible:** "Stays on this device. Never geocoded. Never uploaded."; the audience caption by 0:22; Firebase AI Logic said by 0:25.

### Beat 3: On-device pre-screen (0:35–0:55, 20 s) · `j03_main.mov`
- **On screen:** the pre-screen with the `ON-DEVICE` badge (×2) → '"LUCAS" matches your child's name. Masked on this device.' → the solid mask on the lunchbox tag → other clues listed.
- **Must be visible:** HUD lines for the pre-screen with `ON-DEVICE` and latency. If the HUD shows `IN CLOUD` or `RULES-ONLY` (no Nano that day), Judge Mode is allowed to do that with its fake vault, but then drop "Gemini Nano, in Chrome" from the VO.

### Beat 4: Gate (0:55–1:10, 15 s) · `j03_gate.mov` (V5)
- **On screen:** un-tick the "LUCAS" mask → the consent panel warns "1 private item(s) you unmasked are still visible. The Egress Gate will block this send." → Send → "Blocked: 'LUCAS' would have left this device." → the Ledger.
- **Must be visible:** the blocked text; Faces sent 0 · Vault items sent 0 unchanged (the gate logs the block as a Ledger entry; nothing is sent).

### Beat 5: Red team (1:10–1:50, 40 s) · `j03_main.mov`
- **On screen:** consent sheet "This, and only this, will be sent." with the free-tier line → Send → `IN CLOUD` attack (×2) → split card (4 s) → referee `ON-DEVICE` (×2) → the red verdict lines as produced.
- **Must be visible:** "Analysed by Gemini on Google's free tier: Google may use it…"; the Ledger "Faces sent: 0 · Vault items sent: 0" throughout; confidence on every attacker line; no map pin anywhere; the CACHED SAMPLE badge if V2's fallback happened.

### Beat 6: The fix, honestly (1:50–2:20, 30 s) · `j03_main.mov` + `j01_autoplay.mov`
- **On screen, judge-03:** "Fix it on this device" → "Some clues (like architecture or paving) can't be masked. Cropping or not posting are the remaining options." No re-attack (the recording had only non-removable clues).
- **On screen, judge-01 (×4, then ×2, then 1×; logo boxes, V7):** the first verdict → the fix masks the station sign → re-attack `IN CLOUD` → the final verdict.
- **Expected (recording):** first answer "Maribor", the wrong city (verdict Low: "same country or region"); after the sign is masked, the re-attack names Ljubljana from the station building → "Still exposed: HOME: within 1 km (neighbourhood). Try another fix, crop, or don't post this photo."
- **Must be visible:** "Still exposed", never "safe"; confidence shown.
- **VO variants:** use the one that matches the take (§3).

### Beat 7: Proof and platforms (2:20–2:42, 22 s) · edit + `ios.mov`
- **On screen:** benchmark card (10 s) → iOS referee running and its verdict with the Apple Foundation Models badge (×4) → routing card.
- **Must be visible:** caption "iOS 27 Simulator on Apple-silicon Mac · Apple Foundation Models on-device · attacker: labelled debug stand-in (no cloud call)".

### Beat 8: Close (2:42–2:50, 8 s) · edit
- **On screen:** end card (§4.1).
- **Must be visible:** URL readable for at least 3 s. Text names only, no product logos.

## 3. Voice-over, ready to read (about 360 words over 170 s, a little over 2 words a second)

Read it in your own words if you like; keep every number and every verdict word as it is, or as the take shows.

```text
[0:00]  This photo has no GPS data.
[0:03]  A cloud AI still named the castle, and put it within a kilometre of this family's home and their work.
[0:10]  Turning location off doesn't hide where you are.
[0:14]  AI reads the street.

[0:18]  Strangers' Eyes is for parents, sellers, creators: anyone who must not be found.
[0:22]  It's built on Firebase AI Logic hybrid inference.
[0:25]  Gemini in the cloud attacks a redacted copy.
[0:28]  The AI on your device keeps your secrets, and grades the attack.

[0:35]  First, the device checks the photo.
[0:38]  Text recognition finds a name tag that matches the child's name in the vault,
[0:44]  and masks it, solid, before anything can leave.
[0:50]  Gemini Nano, in Chrome, flags the other clues.

[0:55]  Un-tick that mask and try to send it anyway.
[0:59]  The Egress Gate, which every AI call goes through, re-reads the exact image,
[1:04]  finds the name, and blocks it. Nothing leaves.

[1:10]  With the mask on, you approve the exact redacted copy.
[1:14]  On the free tier, Google may use it, and the app says so.
[1:18]  Gemini attacks it in the cloud and answers in seconds: Ljubljana Castle.
[1:26]  The cloud only ever sees masked pixels.
[1:30]  The referee on your device compares its guesses with the vault:
[1:36]  home within a kilometre, work within a kilometre.
[1:41]  Zero faces and zero vault items were sent, and the cloud never learns whether it guessed right.

[1:50]  Can the app fix this one? No.
[1:53]  A castle can't be masked, and the app says so: crop it, or don't post it.
[1:58]  A mask isn't always enough either.
[2:01]  On this station photo, the attacker first guessed the wrong city, from the sign.
[2:06]  Mask the sign, attack again, and it names the right city from the building itself.
[2:13]  Still exposed.
[2:16]  The app never calls a photo safe.

[2:20]  In a ten-photo test, the attacker placed five within five kilometres, and refused none.
[2:25]  Masking the clues it named pushed three of the four re-attacked photos further out.
[2:30]  On iPhone, Apple Foundation Models grades the attack on the device.
[2:34]  In this clip, the attacker is a labelled stand-in.
[2:37]  Your private data stays on the device.

[2:42]  Stalkers already have this AI.
[2:45]  Now you can see what it sees, before you post.
```

Variants (swap in the line that matches the take):
- **0:03 / 1:18 / 1:36**, if the live judge-03 answer differs: say its best guess and its verdict lines as they appear on screen (for example "…named the city, and put it within five kilometres of…").
- **2:01–2:13, if judge-01's first live answer already names Ljubljana:** "On this station photo, the attacker knew the city straight away, from the building. Masking the sign didn't change that. Still exposed."
- **2:01–2:16, if judge-01 reaches "Risk reduced" live:** "On this station photo, masking the sign was enough: risk reduced, with its confidence shown. Reduced, never safe."
- **V2 fallback (CACHED SAMPLE on screen):** 1:18 becomes "This is a recorded answer from the same attacker, on November 23: Ljubljana Castle."
- **V5 cut:** drop 0:55–1:04, and shift Beat 5's lines 15 s earlier.

## 4. Edit decision list

Durations add up to **170 s** (2:50). Source in-points are set at the cut (T-186), except the StoryReel's (0: scene 1 starts the clip).

| Seg | Final in | Dur (s) | Source | Speed | Label / overlay |
|---|---|---|---|---|---|
| s01 | 0:00 | 4 | card `hook.png` | – | judge-03 with "This photo has no GPS data." + Judge tag |
| s02 | 0:04 | 10 | `j03_main.mov` (Send → red verdict) | 4 | ×4, `cap_judge.png` |
| s03 | 0:14 | 4 | card `title.png` | – | title |
| s04 | 0:18 | 10 | `../reel/story-reel.dark.mp4` (scenes 1–3) | 1 | `cap_reel.png` |
| s05 | 0:28 | 7 | `vault.mov` | 1 | `cap_vault.png` |
| s06 | 0:35 | 10 | `j03_main.mov` (pre-screen) | 2 | ×2, `cap_judge.png` |
| s07 | 0:45 | 10 | `j03_main.mov` (LUCAS masked, clue list) | 1 | `cap_judge.png` |
| s08 | 0:55 | 8 | `j03_gate.mov` (un-tick, warning) | 1 | `cap_judge.png` |
| s09 | 1:03 | 7 | `j03_gate.mov` (Send, blocked, Ledger) | 1 | `cap_judge.png` |
| s10 | 1:10 | 8 | `j03_main.mov` (consent sheet) | 1 | `cap_judge.png` |
| s11 | 1:18 | 8 | `j03_main.mov` (IN CLOUD attack) | 2 | ×2, `cap_judge.png` |
| s12 | 1:26 | 4 | card `split.png` | – | split graphic |
| s13 | 1:30 | 6 | `j03_main.mov` (referee ON-DEVICE) | 2 | ×2, `cap_judge.png` |
| s14 | 1:36 | 14 | `j03_main.mov` (red verdict lines) | 1 | `cap_judge.png` |
| s15 | 1:50 | 7 | `j03_main.mov` (Fix: can't be masked) | 1 | `cap_judge.png` |
| s16 | 1:57 | 7 | `j01_autoplay.mov` (run → first verdict) | 4 | ×4 (or "+N s"), `cap_judge.png`, logo boxes |
| s17 | 2:04 | 8 | `j01_autoplay.mov` (fix → re-attack) | 2 | ×2, `cap_judge.png`, logo boxes |
| s18 | 2:12 | 8 | `j01_autoplay.mov` (Still exposed) | 1 | `cap_judge.png`, logo boxes |
| s19 | 2:20 | 10 | card `bench.png` | – | Day-1 spike numbers |
| s20 | 2:30 | 7 | `ios.mov` | 4 | ×4, `cap_ios.png` |
| s21 | 2:37 | 5 | card `routing.png` | – | routing table |
| s22 | 2:42 | 8 | card `end.png` | – | stack, URL, repo |

Check: 4+10+4+10+7+10+10+8+7+8+8+4+6+14+7+7+8+8+10+7+5+8 = 170.

### 4.1 Card and overlay text (T-181 draws these into `video/`)

| File | Text |
|---|---|
| `hook.png` | `web/public/samples/judge-03.jpg`, letterboxed on black. Caption: "This photo has no GPS data." Corner tag as `cap_judge.png`. |
| `title.png` | STRANGERS' EYES · "See your photo the way a stalker's AI would, before you post it." |
| `cap_judge.png` | Corner tag: "Judge Mode · CC0 photo of a public place · drawn props · made-up vault" |
| `cap_reel.png` | "Illustration from the app's Home screen" · lower third, 0:18–0:24: "For parents, sellers, creators, survivors" |
| `cap_vault.png` | "Made-up vault for this video" |
| `split.png` | "The cloud sees masked pixels. The device holds the truth." |
| `bench.png` | Title: "Day-1 test of the attacker". Line 1: "10 openly licensed photos of public places · GPS removed · faces masked". Line 2: "gemini-3.5-flash-lite, free tier · up to 3 runs per photo (20 runs)". Line 3: "Placed within 5 km: **5 of 10** · within 1 km: **3 of 10** · refused: **0 of 20 runs**". Line 4: "Masking the clues it marked removable moved **3 of the 4** re-attacked photos further out". Line 5: "Attack time: median 7.0 s · p90 9.4 s". Footnote: "Small test. These photos may be in the model's training data, so the located counts may be optimistic." |
| `cap_ios.png` | "iOS 27 Simulator on Apple-silicon Mac · Apple Foundation Models on-device · attacker: labelled debug stand-in (no cloud call; its HUD badge reads CACHED SAMPLE)" |
| `routing.png` | "Vault and original photo: ONLY_ON_DEVICE (no on-device AI → built-in rules, never the cloud)" · "Attacker: ONLY_IN_CLOUD, on the redacted copy only" · "Judge Mode samples: PREFER_ON_DEVICE" · "Every AI call goes through one Egress Gate." |
| `end.png` | "Firebase AI Logic (hybrid: Gemini Nano in Chrome + Gemini in the cloud) · App Check · Anonymous Auth · Remote Config · Hosting" · "Try it in any browser, no on-device AI needed: Judge Mode." · https://strangers-eyes.web.app · [USER: REPO_URL, public after T-170] |
| logo box caption | "logo hidden for video" |
| CACHED caption (only if V2's fallback was filmed) | "Recorded answer: gemini-3.5-flash-lite, Nov 23. The live attacker was unavailable." |

### 4.2 Subtitles draft (`video/subtitles.en.srt`; the final file is cut after recording to match the VO as spoken)

```srt
1
00:00:00,000 --> 00:00:03,000
This photo has no GPS data.

2
00:00:03,000 --> 00:00:10,000
A cloud AI still named the castle, and put it
within a kilometre of this family's home and their work.

3
00:00:10,000 --> 00:00:14,000
Turning location off doesn't hide where you are.

4
00:00:14,000 --> 00:00:18,000
AI reads the street.

5
00:00:18,000 --> 00:00:22,000
Strangers' Eyes is for parents, sellers, creators:
anyone who must not be found.

6
00:00:22,000 --> 00:00:25,000
It's built on Firebase AI Logic hybrid inference.

7
00:00:25,000 --> 00:00:28,000
Gemini in the cloud attacks a redacted copy.

8
00:00:28,000 --> 00:00:35,000
The AI on your device keeps your secrets,
and grades the attack.

9
00:00:35,000 --> 00:00:38,000
First, the device checks the photo.

10
00:00:38,000 --> 00:00:44,000
Text recognition finds a name tag
that matches the child's name in the vault,

11
00:00:44,000 --> 00:00:50,000
and masks it, solid, before anything can leave.

12
00:00:50,000 --> 00:00:55,000
Gemini Nano, in Chrome, flags the other clues.

13
00:00:55,000 --> 00:00:59,000
Un-tick that mask and try to send it anyway.

14
00:00:59,000 --> 00:01:04,000
The Egress Gate, which every AI call goes through,
re-reads the exact image,

15
00:01:04,000 --> 00:01:10,000
finds the name, and blocks it. Nothing leaves.

16
00:01:10,000 --> 00:01:14,000
With the mask on, you approve the exact redacted copy.

17
00:01:14,000 --> 00:01:18,000
On the free tier, Google may use it, and the app says so.

18
00:01:18,000 --> 00:01:26,000
Gemini attacks it in the cloud and answers in seconds:
Ljubljana Castle.

19
00:01:26,000 --> 00:01:30,000
The cloud only ever sees masked pixels.

20
00:01:30,000 --> 00:01:36,000
The referee on your device compares its guesses with the vault:

21
00:01:36,000 --> 00:01:41,000
home within a kilometre, work within a kilometre.

22
00:01:41,000 --> 00:01:50,000
Zero faces and zero vault items were sent,
and the cloud never learns whether it guessed right.

23
00:01:50,000 --> 00:01:53,000
Can the app fix this one? No.

24
00:01:53,000 --> 00:01:58,000
A castle can't be masked, and the app says so:
crop it, or don't post it.

25
00:01:58,000 --> 00:02:01,000
A mask isn't always enough either.

26
00:02:01,000 --> 00:02:06,000
On this station photo, the attacker
first guessed the wrong city, from the sign.

27
00:02:06,000 --> 00:02:13,000
Mask the sign, attack again, and it names
the right city from the building itself.

28
00:02:13,000 --> 00:02:16,000
Still exposed.

29
00:02:16,000 --> 00:02:20,000
The app never calls a photo safe.

30
00:02:20,000 --> 00:02:25,000
In a ten-photo test, the attacker placed
five within five kilometres, and refused none.

31
00:02:25,000 --> 00:02:30,000
Masking the clues it named pushed three
of the four re-attacked photos further out.

32
00:02:30,000 --> 00:02:34,000
On iPhone, Apple Foundation Models
grades the attack on the device.

33
00:02:34,000 --> 00:02:37,000
In this clip, the attacker is a labelled stand-in.

34
00:02:37,000 --> 00:02:42,000
Your private data stays on the device.

35
00:02:42,000 --> 00:02:45,000
Stalkers already have this AI.

36
00:02:45,000 --> 00:02:50,000
Now you can see what it sees, before you post.
```

### 4.3 ffmpeg script (Claude runs it in T-186; outputs stay in PRIV)

```bash
#!/usr/bin/env bash
# Rough cut from the EDL above. Set PRIV to the private folder named in CLAUDE.md; run from the repo root.
set -euo pipefail
: "${PRIV:?set PRIV}"
IN="$PRIV/video/raw"; OUT="$PRIV/video/cut"; OV="video"
FONT=/System/Library/Fonts/Helvetica.ttc
mkdir -p "$OUT"
BASE="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30"

# clip SEG SRC IN DUR SPEED [LABEL] [OVERLAY_PNG] [EXTRA_VF]
# DUR is the length in the final cut; it reads DUR*SPEED seconds of source from IN.
# EXTRA_VF runs after scaling to 1920x1080 (used for the V7 logo boxes).
clip() {
  local seg=$1 src=$2 in=$3 dur=$4 speed=$5 label=${6:-} ov=${7:-} extra=${8:-}
  local raw; raw=$(echo "$dur*$speed" | bc -l)
  local f="[0:v]setpts=PTS/$speed,$BASE"
  [ -n "$extra" ] && f="$f,$extra"
  [ -n "$label" ] && f="$f,drawtext=fontfile=$FONT:text='$label':x=w-tw-40:y=40:fontsize=44:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12"
  if [ -n "$ov" ]; then
    ffmpeg -y -v error -ss "$in" -t "$raw" -i "$IN/$src" -i "$OV/$ov" \
      -filter_complex "$f[b];[b][1:v]overlay=0:0,format=yuv420p[v]" -map "[v]" -an -c:v libx264 -crf 18 -r 30 "$OUT/$seg.mp4"
  else
    ffmpeg -y -v error -ss "$in" -t "$raw" -i "$IN/$src" \
      -filter_complex "$f,format=yuv420p[v]" -map "[v]" -an -c:v libx264 -crf 18 -r 30 "$OUT/$seg.mp4"
  fi
}
# card SEG PNG DUR
card() { ffmpeg -y -v error -loop 1 -t "$3" -i "$OV/$2" -vf "$BASE,format=yuv420p" -an -c:v libx264 -crf 18 -r 30 "$OUT/$1.mp4"; }

# In-points (hh:mm:ss.s): set at the cut (T-186). I04 is the StoryReel's start (scene 1).
I02=0; I04=0; I05=0; I06=0; I07=0; I08=0; I09=0; I10=0; I11=0; I13=0; I14=0; I15=0; I16=0; I17=0; I18=0; I20=0
# V7: one drawbox per legible bus wordmark, in 1920x1080 frame coordinates, read from a frame of j01_autoplay.mov at the cut, e.g.
# LOGO_BOXES="drawbox=x=…:y=…:w=…:h=…:color=black:t=fill,drawtext=fontfile=$FONT:text='logo hidden for video':x=…:y=…:fontsize=28:fontcolor=white"
LOGO_BOXES="null"

card s01 hook.png 4
clip s02 j03_main.mov       "$I02" 10 4 "×4" cap_judge.png
card s03 title.png 4
clip s04 ../reel/story-reel.dark.mp4 "$I04" 10 1 "" cap_reel.png
clip s05 vault.mov          "$I05" 7  1 ""   cap_vault.png
clip s06 j03_main.mov       "$I06" 10 2 "×2" cap_judge.png
clip s07 j03_main.mov       "$I07" 10 1 ""   cap_judge.png
clip s08 j03_gate.mov       "$I08" 8  1 ""   cap_judge.png
clip s09 j03_gate.mov       "$I09" 7  1 ""   cap_judge.png
clip s10 j03_main.mov       "$I10" 8  1 ""   cap_judge.png
clip s11 j03_main.mov       "$I11" 8  2 "×2" cap_judge.png
card s12 split.png 4
clip s13 j03_main.mov       "$I13" 6  2 "×2" cap_judge.png
clip s14 j03_main.mov       "$I14" 14 1 ""   cap_judge.png
clip s15 j03_main.mov       "$I15" 7  1 ""   cap_judge.png
clip s16 j01_autoplay.mov   "$I16" 7  4 "×4" cap_judge.png "$LOGO_BOXES"
clip s17 j01_autoplay.mov   "$I17" 8  2 "×2" cap_judge.png "$LOGO_BOXES"
clip s18 j01_autoplay.mov   "$I18" 8  1 ""   cap_judge.png "$LOGO_BOXES"
card s19 bench.png 10
clip s20 ios.mov            "$I20" 7  4 "×4" cap_ios.png
card s21 routing.png 5
card s22 end.png 8

for s in $(seq -w 1 22); do echo "file '$OUT/s$s.mp4'"; done > "$OUT/edl.txt"
ffmpeg -y -v error -f concat -safe 0 -i "$OUT/edl.txt" -c:v libx264 -crf 18 -pix_fmt yuv420p "$OUT/silent.mp4"
# apad + shortest: the picture is never cut if the voice-over runs short
ffmpeg -y -v error -i "$OUT/silent.mp4" -i "$PRIV/video/vo.m4a" -map 0:v -map 1:a -c:v copy -c:a aac -af apad -shortest "$OUT/final.mp4"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT/final.mp4"   # must be ≤ 170 (hard limit 180)
```

For a jump cut instead of a speed-up (s02, s16): split the segment into two `clip` calls at speed 1 with the label "+N s" (the real elapsed time) on the second, keeping the total duration the same.

## 5. Frame check before upload (T-186, T-194)
- No people, no real home or school, no legible third-party logo (V7 boxes on s16–s18), no DevTools, no debug token, no billing page, no coordinates.
- Every number on screen matches `benchmark/spike/day1-adversary.md` or a PROGRESS-logged measurement; nothing quotes the unrun 25-photo benchmark; every speed-up is labelled.
- The verdict lines and the VO match the take used; "Still exposed" / "Risk reduced" exactly as the app says, never "safe"; if CACHED SAMPLE appears, its caption is on screen.
- The Judge Mode tag is on every Judge shot; the iOS caption (with the stand-in note) is on every Simulator shot; the StoryReel shot says "Illustration".
- `ffprobe` duration ≤ 170 s. After upload (Public, English captions from `video/subtitles.en.srt`): [USER: YOUTUBE_URL after T-187].

## 6. The Remotion build (D-164; supersedes §3–§4 for the cut)

- **Where:** `video/` (Remotion 4.0.532, kokoro-js 1.2.1; packages are linked from the Aftermath video's install; `.gitignore` keeps packages, voice audio, clips, stills and renders out of git).
- **Voice:** Kokoro `af_heart` at speed 1.07 (`npm run tts`, from `scripts/narration.json`; per-scene WAVs and `public/timings.json`). No music.
- **Footage:** `node scripts/record.mjs` drives headless Chrome over CDP against the DEV server (`npm --prefix web run dev`), 1280×720 CSS at 1.5× = 1920×1080, 30 fps. No fake seams. Judge runs that reach the attacker turn on the app's own Simulate offline, so Judge Mode replays the Nov 23 live recordings, **badged CACHED SAMPLE on screen**, and no photo is sent to the attacker again. The gate clip runs online but the gate refuses on the device (pass B BLOCKED `VAULT_TEXT_IN_IMAGE`; the only request is the sample's S4 pre-screen). Headless Chrome has no Gemini Nano, so private steps show **RULES-ONLY**, and the narration says so instead of claiming Nano on screen. Every footage scene carries a caption line saying what is real and what is replayed; footage sped up more than 1.25× shows its speed.
- **Scenes (12, plain-language cut, Nov 24; user: "make sure even someone who does not understand the project can understand it" and "the animation graphic is not good"):** written by a panel (3 drafts scored by a first-time viewer and a hackathon judge, then synthesized; the judges' honesty catches applied: "house number", not "number plate"; no "safe"; the gate stopped the copy to the attacker, the sample pre-screen did go out). post (drawn: photo near home, location off, posted) · stranger (the stranger's AI boxes a street sign, a shop name, a building; world → street funnel; title) · how (four drawn steps: Clean on the device, Guess in the cloud on the cleaned copy only, Check against the private list on the device with distance bands, the "right or wrong" token bouncing off the checkpoint, Fix + try again) · judge (footage + the made-up family) · prescreen (LUCAS covered) · gate (cover removed on purpose → BLOCKED) · castle (real answer replayed, red, rings around home and work, crop or don't post) · crossing (scan boxes on the real photo, amber, masks, "only Berlin", Risk reduced) · station (still exposed) · results (10-photo test, animated) · hybrid (cloud world knowledge vs device secrets; Nano in Chrome, Apple's model on iPhone; rules, never the cloud; Firebase AI Logic) · close. Captions are burned into the picture (and `out/subtitles.en.srt` for YouTube). Drawn cast in `src/art.tsx` and `src/anim.tsx`; nothing drawn is a real map or address.
- **Commands (in `video/`):** `node scripts/assets.mjs` (stills) · `node scripts/record.mjs [clip…]` · `npm run tts` · `npm run studio` · `npm run render` → `out/strangers-eyes.mp4`.
- **Still open for the user:** a take with Gemini Nano on camera (the user's own Chrome; ON-DEVICE badges) can replace the pre-screen and referee footage; upload (Public, English captions) stays [USER].

