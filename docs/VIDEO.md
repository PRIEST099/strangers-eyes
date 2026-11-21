# Demo video: script, shot list and edit decision list (T-180)

> Source rules: RUNBOOK §6.1–6.8, TASKS T-180–T-187, SPEC §14.6. **Total: 2:50 (170 s)**; the hard limit is 3:00.
> Fill rules: numbers on screen and in the voice-over come from T-153 (`benchmark/results/summary.md`) or from a PROGRESS-logged measurement only. Verdict lines are whatever the app really produced on the take. Every `[TBD: …]` is filled before recording or before the cut.
> The voice-over is a draft: the user rewrites it in their own words and records it in their own voice (T-185).

## 0. Decisions this script depends on

| # | Question | Default in this script | Fallback |
|---|---|---|---|
| V1 | Footage source for the web beats | **Judge Mode** on the CC0 samples (D-153 allows them in Judge Mode). judge-02 (staff badge) for Beat 1; judge-03 ("LUCAS" lunchbox) for Beats 3–6. The vault on screen is Judge Mode's made-up vault. | A builder-owned, people-free staged photo of a public place (RUNBOOK §6.1) filmed as an own photo with the Demo profile vault. CLAUDE.md invariant 9 bars the CC0 photos from own-photo demo use. [TBD: user confirms V1] |
| V2 | Live attacker on camera | Live pass B and re-attack (needs the paid tier or quota, T-003/T-034) | If only the recorded answer runs, the `STAND-IN ANSWERS` chip and the recorded badge stay in frame and the voice-over says "a recorded stand-in answer". [TBD: live or stand-in] |
| V3 | iOS footage (Beats 2 and 7) | iOS app in the Simulator (D-155) | Beat 2 on the web Vault screen in the Demo profile; Beat 7's iOS shot replaced by a longer routing card (s19 + s20 become one 14 s card). [TBD: iOS status] |
| V4 | Offline pre-screen (RUNBOOK §6.6 Beat 3) | **Dropped**: the offline PWA (T-106) is deferred, so Beat 3 is filmed online. | Film Wi-Fi OFF only if the T-182 rehearsal shows the pre-screen working offline. |
| V5 | Gate beat (Beat 5) | The real gate path: un-tick the "LUCAS" mask, Send, blocked toast (judge-03; "Lucas" is in the made-up vault) | Cut Beat 5 and give its 15 s to Beat 4 if T-082 is not rehearsed by Nov 28. [TBD: T-082] |
| V6 | Grounded notes (pass A) | Not shown (T-070 not built; grounding needs the paid tier) | If pass A ships, its Search Suggestions chip must stay visible whenever notes are on screen (RUNBOOK §6.1). |

## 1. Recording sessions (8 GB rule: never Chrome Nano and Simulator FM together)

| Session | When (RUNBOOK §6.5) | Runtime | Before recording | Beats |
|---|---|---|---|---|
| B | Sat Nov 28 morning | Chrome + Gemini Nano; **Simulator shut down** (`xcrun simctl shutdown all && osascript -e 'quit app "Simulator"'`), Xcode quit | Demo Chrome profile (no extensions, no bookmarks bar, zoom 110–125%); Nano `available` (RUNBOOK §3.1); one warm-up run per sample; **DevTools closed**; memory pressure green; Wi-Fi on; Judge Mode Autoplay **off** (you control the pace); HUD bottom-left and Ledger rail in frame | 1, 3, 4, 5, 6 (and Beat 2 if V3 falls back to web) |
| A | Sat Nov 28 evening | iOS 27.0 Simulator (iPhone 18 Pro) with Apple FM; **Chrome quit** (no "Google Chrome Helper" in Activity Monitor) | App installed; vault empty; `xcrun simctl status_bar $UDID override --time 9:41 --batteryState charged --batteryLevel 100`; `xcrun simctl location $UDID set <public building A>` then `<public place B>` (fictional labels, public places only) | 2, 7 (iOS cameo) |
| C | Sat Nov 28 evening, after A | none | QuickTime → New Audio Recording, quiet room | voice-over |

Capture: 1920×1080, 30 fps, one clip per beat, retakes as needed. Raw clips go to `$PRIV/video/raw/` (outside the repo). Clip names below are the EDL's source names.

## 2. Script and shot list

Times are positions in the final cut. "×4" means the footage is sped up four times and labelled on screen.

### Beat 1: Hook (0:00–0:18, 18 s) · Session B · clip `b1_hook.mov`
- **On screen:** judge-02 full screen with the caption "This photo has no GPS data." → Judge Mode run (×4) to the red verdict card with the real lines (expected kind: a workplace line from the drawn badge) → title card.
- **Must be visible:** Router HUD; the D-153 caption.
- **VO:** "This photo has no GPS data. An AI can still work out where it was taken: from a station, a sign, a staff badge. Deleting location data doesn't protect you any more. AI reads the street."

### Beat 2: Who it is for, and the hybrid split (0:18–0:35, 17 s) · Session A · clip `b2_vault.mov`
- **On screen:** iOS Vault: "Pin this place" for Home at public building A → set location B → Work "City General Hospital" → child's name "Lucas". Close-up of the lock badge and the Ledger at 0 requests.
- **Must be visible:** the lock badge ("Stays on this device. Never geocoded. Never uploaded."); Ledger 0.
- **VO (audience and hybrid named by 0:30):** "Strangers' Eyes is for parents, sellers, creators, and anyone who must not be found. On Firebase AI Logic, Gemini in the cloud plays the attacker; the model on your device holds your secrets and judges it."

### Beat 3: On-device pre-screen (0:35–0:58, 23 s) · Session B · clip `b3_prescreen.mov`
- **Set-up:** Judge Mode, judge-03 selected, Autoplay off, Wi-Fi on (V4).
- **On screen:** run the sample → `ON-DEVICE (Gemini Nano)` badge and Tier-0 chip (×2) → "LUCAS" matches the child's name and is solid-masked on the device → other clues flagged.
- **Must be visible:** HUD lines for the pre-screen with `ON-DEVICE` and latency.
- **VO:** "First, Gemini Nano checks the photo on the device. It finds a name tag that matches the child's name in the vault, and masks it, solid, before anything can leave."

### Beat 4: Red team (0:58–1:40, 42 s) · Session B · clip `b4_attack.mov`
- **On screen:** consent sheet "This, and only this, will be sent." → approve → `IN_CLOUD` attack (waits cut with a "+N s" label, or ×4) → split card (4 s) → "Referee comparing guesses with your vault… on this device" `ON-DEVICE` → red verdict lines as produced.
- **Must be visible:** Ledger "Faces sent: 0 · Vault items sent: 0" throughout; confidence on every attacker line; no map pin anywhere.
- **VO:** "You approve the exact redacted copy. Gemini attacks it in the cloud. Then the referee on your device compares its guesses with your vault: [TBD: real verdict lines from the take]. The cloud has received zero faces and zero vault items, and it never learns whether it was right."

### Beat 5: Gate (1:40–1:55, 15 s) · Session B · clip `b5_gate.mov`
- **On screen:** un-tick the "LUCAS" mask → the consent sheet warns, Send stays enabled → Send → red toast "Blocked: 'LUCAS' would have left this device." → "What the cloud saw" shows only the earlier masked copy.
- **Must be visible:** the toast text, and the Ledger counter unchanged.
- **VO:** "Try to send the name tag anyway, and the Egress Gate blocks it. It checks every request, on the device and in the cloud."

### Beat 6: Fix and re-attack (1:55–2:20, 25 s) · Session B · clip `b6_fix.mov`
- **On screen:** Fix → plan text → solid fills appear → re-attack `IN_CLOUD` (×4 or "+N s") → real result → green **"Risk reduced"** → receipt line.
- **Must be visible:** "Risk reduced", never "safe"; confidence shown.
- **VO:** "One tap plans the smallest fix. The cloud attacks the fixed copy: [TBD: real result]. Risk reduced. Not safe, reduced, and the app says so."

### Beat 7: Proof and platforms (2:20–2:42, 22 s) · edit + Session A · clip `b7_ios.mov`
- **On screen:** benchmark card with real numbers (8 s) → iOS verdict with the Apple Foundation Models badge (×4) → routing card: vault and original photo ONLY_ON_DEVICE; public explanations PREFER_ON_DEVICE with cloud fallback; attacker ONLY_IN_CLOUD.
- **Must be visible:** caption "iOS 27 Simulator on Apple-silicon Mac · Apple Foundation Models on-device".
- **VO:** "[TBD: one benchmark sentence from T-153, e.g. 'On 25 photos of public places, the attacker placed X within a kilometre before the fix, and Y after.'] The same loop runs on iPhone with Apple Foundation Models. Private data stays on the device; only the attacker runs in the cloud."
- If T-153 has no numbers by Nov 29, the card shows the measured Nano latencies instead (referee ~6.1 s warm, pre-screen ~9.5 s warm, Chrome 157, D-154) and the VO drops the benchmark sentence.

### Beat 8: Close (2:42–2:50, 8 s) · edit
- **On screen:** end card. Firebase stack as text: AI Logic (hybrid), App Check, Anonymous Auth, Remote Config, Hosting (no Firestore: cut by D-141). "Try it in any browser, no on-device AI needed: Judge Mode." URL https://strangers-eyes.web.app and the repo URL [TBD: REPO_URL].
- **Must be visible:** URL readable for at least 3 s. Text names only, no product logos.
- **VO:** "Stalkers already have this AI. Now you can see what it sees, and it never learns where you live."

Voice-over total: about 270 words over 170 s (Beat 2 is the tightest: about 35 words in 17 s).

## 3. Captions (burned in; the full VO also goes in `video/subtitles.en.srt`, T-181)

| Time | Caption |
|---|---|
| 0:00–0:04 | This photo has no GPS data. |
| 0:00–0:14 | Judge Mode · CC0 photo of a public place · drawn props · made-up vault |
| 0:04–0:14 | ×4 |
| 0:35–2:20 (every Judge Mode shot) | small corner tag: Judge Mode · CC0 public-place photo · made-up vault (bake into the `clip` overlays in T-181) |
| 0:18–0:30 | For parents, sellers, creators, survivors |
| 0:35–0:47 | ×2 |
| 1:06–1:18 | ×4, or "+N s" with the real elapsed time |
| 2:05–2:13 | ×4, or "+N s" |
| 2:28–2:36 | iOS 27 Simulator on Apple-silicon Mac · Apple Foundation Models on-device · ×4 |
| any shot with a recorded answer | Recorded stand-in answer (V2) |
| any unavoidable third-party logo | logo hidden for video (solid box, edit only) |

## 4. Edit decision list

Durations add up to **170 s** (2:50). Source in-points are set after recording [TBD: in-points]. Overlays come from `video/` (T-181).

| Seg | Final in | Dur (s) | Source | Speed | Label / overlay |
|---|---|---|---|---|---|
| s01 | 0:00 | 4 | `b1_hook.mov` | 1 | `cap_nogps.png`, `cap_judge.png` |
| s02 | 0:04 | 10 | `b1_hook.mov` | 4 | ×4, `cap_judge.png` |
| s03 | 0:14 | 4 | card `title.png` | – | STRANGERS' EYES · "See your photo the way a stalker's AI would, before you post it." |
| s04 | 0:18 | 12 | `b2_vault.mov` | 1 | `cap_audience.png` |
| s05 | 0:30 | 5 | `b2_vault.mov` | 1 | – |
| s06 | 0:35 | 12 | `b3_prescreen.mov` | 2 | ×2 |
| s07 | 0:47 | 11 | `b3_prescreen.mov` | 1 | – |
| s08 | 0:58 | 8 | `b4_attack.mov` | 1 | – |
| s09 | 1:06 | 12 | `b4_attack.mov` | 4 | ×4 (or a jump cut labelled "+N s") |
| s10 | 1:18 | 4 | card `split.png` | – | "The cloud sees masked pixels; the device holds the truth." |
| s11 | 1:22 | 8 | `b4_attack.mov` | 1 | – |
| s12 | 1:30 | 10 | `b4_attack.mov` | 1 | – |
| s13 | 1:40 | 8 | `b5_gate.mov` | 1 | – |
| s14 | 1:48 | 7 | `b5_gate.mov` | 1 | – |
| s15 | 1:55 | 10 | `b6_fix.mov` | 1 | – |
| s16 | 2:05 | 8 | `b6_fix.mov` | 4 | ×4 (or "+N s") |
| s17 | 2:13 | 7 | `b6_fix.mov` | 1 | – |
| s18 | 2:20 | 8 | card `bench.png` | – | real numbers only [TBD: T-153] |
| s19 | 2:28 | 8 | `b7_ios.mov` | 4 | ×4, `cap_ios.png` |
| s20 | 2:36 | 6 | card `routing.png` | – | routing table |
| s21 | 2:42 | 8 | card `end.png` | – | stack strip, URL, repo |

Check: 4+10+4+12+5+12+11+8+12+4+8+10+8+7+10+8+7+8+8+6+8 = 170.

### ffmpeg script (Claude runs it in T-186; outputs stay in PRIV)

```bash
#!/usr/bin/env bash
# Rough cut from the EDL above. Set PRIV to the private folder named in CLAUDE.md; run from the repo root.
set -euo pipefail
: "${PRIV:?set PRIV}"
IN="$PRIV/video/raw"; OUT="$PRIV/video/cut"; OV="video"
FONT=/System/Library/Fonts/Helvetica.ttc
mkdir -p "$OUT"
BASE="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30"

# clip SEG SRC IN DUR SPEED [LABEL] [OVERLAY_PNG]
# DUR is the length in the final cut; it reads DUR*SPEED seconds of source from IN.
clip() {
  local seg=$1 src=$2 in=$3 dur=$4 speed=$5 label=${6:-} ov=${7:-}
  local raw; raw=$(echo "$dur*$speed" | bc -l)
  local f="[0:v]setpts=PTS/$speed,$BASE"
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

# In-points (hh:mm:ss.s) [TBD: set after recording]
I01=0; I02=0; I04=0; I05=0; I06=0; I07=0; I08=0; I09=0; I11=0; I12=0; I13=0; I14=0; I15=0; I16=0; I17=0; I19=0

clip s01 b1_hook.mov      "$I01" 4  1 ""   cap_nogps.png   # cap_judge.png: burn both into one PNG in T-181
clip s02 b1_hook.mov      "$I02" 10 4 "×4" cap_judge.png
card s03 title.png 4
clip s04 b2_vault.mov     "$I04" 12 1 ""   cap_audience.png
clip s05 b2_vault.mov     "$I05" 5  1
clip s06 b3_prescreen.mov "$I06" 12 2 "×2"
clip s07 b3_prescreen.mov "$I07" 11 1
clip s08 b4_attack.mov    "$I08" 8  1
clip s09 b4_attack.mov    "$I09" 12 4 "×4"
card s10 split.png 4
clip s11 b4_attack.mov    "$I11" 8  1
clip s12 b4_attack.mov    "$I12" 10 1
clip s13 b5_gate.mov      "$I13" 8  1
clip s14 b5_gate.mov      "$I14" 7  1
clip s15 b6_fix.mov       "$I15" 10 1
clip s16 b6_fix.mov       "$I16" 8  4 "×4"
clip s17 b6_fix.mov       "$I17" 7  1
card s18 bench.png 8
clip s19 b7_ios.mov       "$I19" 8  4 "×4" cap_ios.png
card s20 routing.png 6
card s21 end.png 8

for s in $(seq -w 1 21); do echo "file '$OUT/s$s.mp4'"; done > "$OUT/edl.txt"
ffmpeg -y -v error -f concat -safe 0 -i "$OUT/edl.txt" -c:v libx264 -crf 18 -pix_fmt yuv420p "$OUT/silent.mp4"
# apad + shortest: the picture is never cut if the voice-over runs short
ffmpeg -y -v error -i "$OUT/silent.mp4" -i "$PRIV/video/vo.m4a" -map 0:v -map 1:a -c:v copy -c:a aac -af apad -shortest "$OUT/final.mp4"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT/final.mp4"   # must be ≤ 170 (hard limit 180)
```

For a jump cut instead of a speed-up (s09, s16): split the segment into two `clip` calls at speed 1 with the label "+N s" on the second, keeping the total duration the same.

## 5. Frame check before upload (T-186, T-194)
- No people, no real home or school, no third-party logo, no DevTools, no debug token, no billing page.
- Every number on screen matches T-153 or a PROGRESS-logged measurement; every speed-up is labelled.
- Verdict lines match the take; any recorded answer shows its stand-in badge.
- The iOS caption is on every Simulator shot; the D-153 caption is on the Judge Mode shots.
- `ffprobe` duration ≤ 170 s.
