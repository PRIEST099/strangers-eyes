# Egress measurement: one full check with Gemini Nano on

Measured on 26 Nov 2026 with `scripts/measure-egress.mjs`. This file holds aggregates only. Raw request metadata is kept in PRIV (`raw/egress-*.json`). It has no coordinates: vault and location matches are stored as true/false.

## Findings first

1. **Neither cloud attack carried private data.** We checked both attacker requests: the first attack and the re-attack after "Fix it on this device".
   - Each one carried one redacted JPEG and the fixed attacker prompt, nothing more.
   - No vault string left the device: not "LUCAS", not "City General Hospital".
   - No vault pin coordinate left the device, at any precision from 3 to 6 decimals, and neither did the photo's true location.
   - The original file's bytes never left. No image carried EXIF, XMP, APP1, APP13 or GPS data.
   - The same holds for every other request made during the run: no vault text, no coordinates, no image data.
2. **Privacy finding: one undisclosed third-party request.** MediaPipe Tasks Vision (`@mediapipe/tasks-vision` 1.2.3, the on-device face detector) sends its own usage telemetry from the page. It goes to `odml.pa.googleapis.com/v1/log`.
   - **How it is sent:** a small protobuf (38 to 87 bytes), about 60 s after the face detector starts and then once a minute.
   - **What it holds:** we decoded one in a separate local-only run (no Send). It holds a log-source id, the library version, the task type (face detector) and counters and timing figures. It holds no image, no vault data and no page URL.
   - **Why it matters:** it carries nothing private, but it isn't disclosed. The Ledger doesn't list it, and the copy "Other network traffic: App Check, anonymous sign-in and Remote Config" leaves it out.
   - **Production too:** the repo has no Content-Security-Policy (API-NOTES §2.8 says "only if we add a CSP"), so the hosted build will send it as well.
   - **Also unlisted:** App Check's reCAPTCHA Enterprise provider loads scripts and an iframe from `www.google.com` and `www.gstatic.com`. These are plain GETs with no request body. The copy calls this "App Check".
3. **The Ledger agrees with the network for every cloud number:** images, requests, bytes, image hashes, faces and vault items.
   - One label disagrees on screen, which is not a privacy problem. The re-attack receipt says "2 on-device AI calls · 5 local checks", while the Ledger says "On-device AI calls: 3 · Local rule checks: 0".
   - The receipt counts only the referee calls, and its "local checks" is a formula, not Ledger entries.

## Set-up

| | |
|---|---|
| Browser | Chrome 158.0.8127.38, headless, fresh temporary profile |
| On-device model | Gemini Nano available (Prompt API with multimodal input; `LanguageModel.availability()` = `available` before start) |
| App | DEV server on localhost (App Check debug token); normal `#/check` flow, not Judge Mode; no simulate-offline. "Technical details" was switched on, which changes the display only (payload classes and hashes). |
| Vault (made up) | Home and Work pins typed as coordinates near the photo's place; Work named "City General Hospital"; child's name "LUCAS". The pin values existed only in memory and in the browser. |
| Photo | A benchmark street photo, openly licensed. The original was 2.1 MB, 3840 × 2880, with EXIF (no GPS). Import made a 2048 × 1536 master with its metadata removed. |
| Capture | 1. CDP Network on the page and every worker, iframe and service worker, with exact request bodies. 2. Chrome NetLog for every host the browser contacted. 3. The app's own Cloud Ledger and AI-calls HUD. |

### Photos run, and how many cloud calls were made

The script tries up to three candidate photos, each at most once, and stops at the first full check.

| Photo | What happened | Live attacker requests |
|---|---|---|
| Candidate 1 (1920 × 1080 street photo) | The verdict was amber ("This photo narrows things down"). "Fix it on this device" found no maskable clue, so it couldn't be re-attacked, and the run stopped there. | 1 (214,317 B; one 1536 × 864 JPEG, 152.9 KB, clean) |
| Candidate 2 (**the measured check**) | The verdict was red ("A stranger could find you"). The fix masked 1 more area (Rules-only fix), the re-attack ran, and the result was **Risk reduced**. | 2 |
| Candidate 3 | Not used | 0 |

That is 3 live attacker calls in total. Each POST was preceded by an OPTIONS CORS preflight with no body when the browser needed one: 2 preflights in all.

An earlier `--dry` run of candidate 1 stopped at the consent sheet and made no AI request. The vault, import and Nano pre-screen were identical, and it confirmed that the same background traffic appears with no attack at all.

## The two cloud requests of the measured check

Both requests went to `firebasevertexai.googleapis.com` as `POST …/models/gemini-3.5-flash-lite:generateContent` and returned HTTP 200.

| | Attack 1 | Re-attack |
|---|---|---|
| Request body | 408,513 B | 401,113 B |
| Inline images | 1 (image/jpeg) | 1 (image/jpeg) |
| Image size | 1536 × 1152 px, 295.2 KB (302,262 B) | 1536 × 1152 px, 289.8 KB (296,711 B) |
| JPEG segments | APP0 (JFIF), APP2 (ICC profile), SOF0 | APP0 (JFIF), APP2 (ICC profile), SOF0 |
| Metadata markers (APP1/APP13/EXIF/XMP/GPS) | none | none |
| Bytes after end of image | 0 | 0 |
| Same image the consent sheet showed | yes (1536 × 1152, 295 KB, sha256 02bc6ac8…) | yes (1536 × 1152, 290 KB, sha256 8c9f23d1…) |
| Text parts | the audit rules plus the attacker system prompt (2,337 chars; `audit-rules.v1.md` + `advB.v1.system.md`, nothing else); user prompt `advB.v1.user.md` (56 chars, exact) | identical to attack 1 |
| Other fields | `generationConfig`: responseMimeType, responseJsonSchema, maxOutputTokens, thinkingConfig. No `tools`, so no grounded search pass. | same |
| Vault strings ("LUCAS", "City General Hospital") | not found | not found |
| Pin coordinates / the photo's true coordinates | not found | not found |
| Original file bytes | not found | not found |
| Response size | 2,363 B | 4,043 B |

The scan covered the URL, every header value and the whole body text, with the base64 image data set aside. The script fails before starting if any detector misses its own positive control.

The re-attack image differs from the first only by the extra fix mask. The cloud can see where a mask is, which the About screen discloses.

## Everything else that left the device during the measured check

Request bodies were scanned in memory only and never stored.

| Host | Requests | Bytes sent | What it is | When |
|---|---|---|---|---|
| identitytoolkit.googleapis.com | 5 | 1,744 | Anonymous sign-in (signUp, lookup) and preflights | start-up, vault |
| firebaseremoteconfig.googleapis.com | 2 | 485 | Remote Config fetch | start-up |
| firebaseremoteconfigrealtime.googleapis.com | 4 | 361 | Remote Config realtime | start-up, vault |
| firebaseinstallations.googleapis.com | 2 | 131 | Installation id for Remote Config | start-up |
| content-firebaseappcheck.googleapis.com | 2 | 54 | App Check token exchange | start-up |
| www.google.com, www.gstatic.com | 4 + 6 | 0 (GET) | reCAPTCHA Enterprise script, styles and anchor iframe (App Check provider) | start-up, vault |
| **odml.pa.googleapis.com** | 2 | 87 | **MediaPipe usage telemetry** (see the findings) | 60 s after the pre-screen started |

- **No other traffic:** no Firestore, no analytics, and no CDN. Tesseract's worker loaded its files from the local server.
- **WebSocket:** 2 small frames (30 B), Vite's dev-server channel on localhost.
- **No vault strings, coordinates or image data** appeared in any of these requests.

Chrome also made its own background requests, seen only in the NetLog. Each was started by the browser, not the page. They appeared in the dry run too:
- update.googleapis.com (15)
- edgedl.me.gvt1.com (13)
- optimizationguide-pa.googleapis.com (11)
- content-autofill.googleapis.com (4)
- clients2.google.com, clientservices.googleapis.com and accounts.google.com (1 each)

The NetLog was recorded in Default mode, so their bodies weren't recorded.

## Ledger vs network (measured check)

| | Cloud Ledger (UI) | Network | Agree? |
|---|---|---|---|
| Images | 2 | 2 distinct image sha256 | yes |
| Requests | 2 | 2 POSTs (plus 1 body-less CORS preflight, which the Ledger doesn't count) | yes |
| Bytes | 791 KB (entries 399 KB + 392 KB) | 809,626 B = 790.6 KB (408,513 + 401,113) | yes |
| Image hashes | 02bc6ac8…, 8c9f23d1… | 02bc6ac8…, 8c9f23d1… | yes |
| Faces sent | 0 | 0. The pre-screen found no faces in this photo, so this run doesn't test face masking. | yes |
| Vault items sent | 0 | 0 (no vault string or coordinate in any request) | yes |
| On-device AI calls | 3 | 0 network requests from them | yes |

Candidate 1 also agreed: Ledger "Images 1 · Requests 1 · Bytes 209 KB" against one 214,317 B POST (209.3 KB).

## Where each AI step ran (AI-calls HUD, measured check)

| Step | Class | Route | Latency | Bytes out |
|---|---|---|---|---|
| Pre-screen (clue scan of the original) | S1 | ON-DEVICE (Gemini Nano) | 22.3 s | 0 B |
| Attacker, first attack | S3 | IN CLOUD (gemini-3.5-flash-lite) | 10.9 s | 399 KB |
| Referee (guesses vs vault) | S0 | ON-DEVICE (Gemini Nano) | 3.4 s | 0 B |
| Fix plan | none | no AI call: deterministic code on this device ("Rules-only fix"), so no HUD line | none | 0 B |
| Attacker, re-attack | S3 | IN CLOUD (gemini-3.5-flash-lite) | 10.7 s | 392 KB |
| Referee, after the fix | S0 | ON-DEVICE (Gemini Nano) | 4.2 s | 0 B |

There were no RULES-ONLY or BLOCKED entries.

## Conclusion

In this run the app did what it claims:
- **Two cloud requests:** the cloud received only the two redacted 1536 × 1152 JPEGs the user approved on the consent sheet, with the fixed attacker prompt and schema.
- **Nothing private in them:** no vault text, no pin or true coordinates, no metadata, and none of the original file's bytes.
- **Private steps on the device:** both Nano steps (the S1 pre-screen and the S0 referee) ran on the device and sent nothing.
- **An honest Ledger:** its image, request and byte counts match the network to the kilobyte.

The one gap is disclosure. The bundled MediaPipe face detector reports anonymous usage counters to Google (`odml.pa.googleapis.com`) about once a minute. The Ledger and the "Other network traffic" line don't mention it. The reCAPTCHA calls are App Check's own.

This is one live check of one photo, and it had no faces and no vault text in the picture. It shows what leaves the device on this path; it doesn't prove the masks work on photos that contain those things.

## Reproduce

```
SE_NANO=<folder holding an OptGuideOnDeviceModel copy> node scripts/measure-egress.mjs            # live: sends real attacks
SE_NANO=<…> node scripts/measure-egress.mjs --dry --photos <id>                                    # stops before Send
```

The script needs the DEV server on localhost:5173 and PRIV `bench/truth.csv`. It writes `PRIV/raw/egress-<time>-<photo>.json` and prints the tables above. Each live run sends real attacks, so don't rerun a photo to get a different answer.
