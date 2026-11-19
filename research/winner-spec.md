# Strangers' Eyes: winner spec (from the idea tournament, 2026-11-19)


## winner_full_spec

NAME: Strangers' Eyes
TAGLINE: "See your photo the way a stalker's AI would, before you post it."
ONE-LINER FOR JUDGES: The cloud plays the attacker and your device holds the answers, so the attacker never learns whether it guessed right.

1. TARGET USER
- Anyone who posts photos publicly, about 5B social media users. The threat and the fix are the same in every country and language.
- Hero personas, in demo order: parents posting home and school-run photos; marketplace sellers photographing rooms in their homes (Facebook Marketplace, Vinted, OLX, Mercari, Craigslist); creators and streamers.
- Highest-need users: domestic-violence survivors, journalists, activists.
- Distribution: DV-support organisations, school parent groups, creator communities, and a shareable "AI found my neighbourhood. I fixed it." card that never contains the location.

2. PROBLEM (verify every stat before it goes on screen)
- Stripping GPS no longer protects you. Multimodal models geolocate EXIF-free photos from the pixels alone: street signs, paving and tiles, transit-stop codes, uniforms and lanyard logos, window views, reflections.
- The April 2025 "reverse location search" trend using OpenAI o3 (TechCrunch, Tom's Hardware) made this a party trick. GeoSpy and Picarta sell it. McAfee, a vendor, claims AI located 87-91% of the travel photos it tested.
- A widely reported 2019 Tokyo case: a stalker found a singer's home using reflections in her eyes in a selfie plus street imagery.
- Platforms strip EXIF, so people feel safe. Nobody can see what an adversary could infer, and no tool knows what YOU need to hide.
- Existing defenses fall short:
  - EXIF strippers (Safe Attachment Check, GPSDetect) do nothing about pixels.
  - Research prototypes (arXiv 2503.20226; Geo-Safe-Filter, TikTok TechJam 2025) send your RAW photo to a cloud model and know nothing about your home, workplace or kids' names.
- INSIGHT: attacking a photo needs world knowledge, which only the cloud has. Judging the attack needs your secrets, which should stay on the device. Split the job exactly there.

3. CORE LOOP
Vault (device) -> pre-screen and pre-mask (device) -> red team on a REDACTED copy (cloud) -> referee (device) -> fix (device) -> re-attack (cloud) -> "Risk reduced".

4. ON-DEVICE JOBS: WEB (Chrome, Gemini Nano through the Firebase AI Logic hybrid SDK)
W1 VAULT
- navigator.geolocation "pin this place", captured while physically at home, work or school. Pins are never geocoded by a server.
- Also stores names (kids, self), car plates, house number, employer and school names, and uniform or lanyard descriptors.
- Encrypted in IndexedDB with AES-GCM and a non-extractable WebCrypto key.
- Never synced, never written to Firestore, never put in any prompt that could reach the cloud.

W2 TIER-0 GUARD (deterministic; runs in every browser with no model)
- Strip EXIF/XMP by re-encoding through canvas.
- Self-hosted MediaPipe Face Detector: every face gets a solid mask.
- Tesseract.js OCR on a downscaled image produces word boxes. These are fuzzy-matched (normalised Levenshtein) against vault strings, and matches are masked automatically.
- Regex for plates, house numbers and phone numbers visible on signs.

W3 NANO PRE-SCREEN of the ORIGINAL photo (class S1, ONLY_ON_DEVICE)
- Prompt 1: a 768 px JPEG plus a JSON schema, returning {clues:[{type: enum[name_text, house_number, plate, street_sign, transit_sign, uniform_or_lanyard, crest_or_logo, mail_or_document, screen, window_view, reflection, landmark], text, region: enum(3x3 grid), severity: enum}]}.
- Prompt 2: vault LABELS (never coordinates) plus the OCR strings, asking which visible items correspond to vault entries; returns enum matches.
- Nano and Tesseract act as two independent readers; either one is enough to trigger a mask.
- Strict mode masks every flagged clue before the cloud sees anything.
- Without Nano: Tier-0 only, labelled "rules-only pre-screen".

W4 NANO REFEREE (class S0, ONLY_ON_DEVICE, text-only JSON)
- Input: the adversary's structured inferences (up to 12) plus vault labels. Output: {matches:[{claim_id, vault_id, strength: enum[exact, likely, possible, none], reason}]}. Example: "lanyard logo: City General Hospital" matches vault "work: City General".
- Distance is NOT an LLM job. Code computes haversine distance from each cloud hypothesis (lat, lng, radius) to each vault pin and assigns a band: <=250 m street, <=1 km neighbourhood, <=5 km district, same city, same country, none.
- Without Nano: a deterministic fuzzy and synonym matcher, labelled "rules-only referee".

W5 NANO FIX PLANNER AND EXPLAINER (S0, ONLY_ON_DEVICE, 256 output tokens or fewer)
- Chooses the smallest set of clue boxes whose removal breaks the matched inferences, orders them, and explains in plain language, e.g. "The lanyard and the stop code led to your workplace; the paving alone only reveals the country."
- Without Nano: mask every clue the adversary marked as removable.

W6 MASK AND EXPORT (code)
- Solid fills, never Gaussian blur, because blurred digits can be recovered. Boxes are padded 15%. Optional crop.
- EXIF-free re-encode, then download or share.

W7 EGRESS GATE (code). Every Firebase AI Logic call goes through one wrapper, which:
- (a) refuses S0 or S1 payloads on any mode that can reach the cloud;
- (b) re-checks the outgoing bitmap: 0 faces detected, 0 OCR matches against the vault, no EXIF;
- (c) scans the prompt text for vault strings;
- (d) writes a Cloud Ledger entry: bytes, payload class, model, inferenceSource, latency.
- Any failed check blocks the call with a toast naming the item: "Blocked: 'LUCAS' would have left this device."

5. ON-DEVICE JOBS: iOS (SwiftUI, FirebaseAILogic 12.13+ via SPM, Apple Foundation Models)
Apple FM on iOS has no image input and no on-device structured output, so Vision handles the pixels and the LLM works on text.
- I1 VAULT: CoreLocation "pin this place", plus names, plates and employer. Stored in Keychain with Data Protection 'complete'. Never synced.
- I2 TIER-0
  - Re-encode with CGImageDestination without metadata.
  - VNDetectFaceRectanglesRequest feeds the face masks.
  - VNRecognizeTextRequest produces word boxes for fuzzy vault matching.
  - VNClassifyImageRequest supplies scene labels.
- I3 FM PRE-SCREEN (S1)
  - Vision text plus scene labels plus vault labels go to an ON-DEVICE-ONLY session: the system model WITHOUT HybridModel, which throws instead of falling back. Verify on Day 1.
  - Output comes through a reportClue(...) tool call if on-device function calling passes the Day-1 spike. Otherwise use a strict one-item-per-line format, validated in code with one retry.
- I4 FM REFEREE AND FIX PLANNER (S0, on-device-only session)
  - Same contract as W4/W5, with every prompt budgeted under 4,096 tokens: up to 20 short vault labels, up to 12 claims, no coordinates. Distance bands are computed in code.
- I5 EXPLAINER (S2): HybridModel(primary: SystemLanguageModel.default, secondary: Gemini) answers "why does this clue reveal location?". The content is public, so real automatic cloud fallback is allowed and shown.
- I6 Core Image solid-fill masks, save to Photos, and the same Egress Gate and Ledger in Swift. The inference-source badge reads from the response (rawResponse.modelVersion per the docs; verify on Day 1).

6. CLOUD JOBS (ONLY_IN_CLOUD via Firebase AI Logic)
Settings: a Gemini vision model named in Remote Config (e.g. gemini-3.8-flash), temperature 0, on the paid no-training tier or the Vertex AI backend (whichever supports hybrid; check on Day 1).
- C1 ADVERSARY PASS A (grounded, streamed)
  - Input: ONLY the redacted, EXIF-free copy, with faces and vault matches already masked.
  - Prompt: a privacy audit commissioned by the photo's owner. Analyse the scene, never people; list every location-revealing clue; reason toward a location.
  - Google Search grounding is on, e.g. to confirm a logo or a transit-stop code. The investigator notes stream with the required Search Suggestions chip and source links.
- C2 ADVERSARY PASS B (structured, no grounding, because grounding plus a JSON schema in one call is flaky)
  - Input: the image plus pass A's notes.
  - Output: {hypotheses:[{label, lat, lng, radius_km, confidence: enum}] (at most 3), clues:[{id, type, box_2d [ymin,xmin,ymax,xmax] 0-1000, evidence, removable: bool}], inferences:[{id, kind: enum[workplace, school, home_area, routine, transit_line, venue, other], value}]}.
- C3 RE-ATTACK: C1 and C2 run again on the fixed image; the device compares the results.
- The cloud NEVER receives the vault, any pin, any name, unmasked faces, EXIF, the original photo, or the referee's verdict. It cannot learn whether it was right.
- Why the cloud: world-scale visual knowledge plus live Search. A ~3B on-device model cannot geolocate a street.

7. ROUTING POLICY (Remote Config key routing_policy; drawn live in the Router HUD)
| Class | What it covers | Web mode | iOS mode | Fallback |
|---|---|---|---|---|
| S0 | Touches the vault (referee, fix plan, vault match) | ONLY_ON_DEVICE | On-device-only session | Deterministic code; NEVER cloud |
| S1 | Original, unredacted photo | ONLY_ON_DEVICE | On-device-only session | Tier-0; NEVER cloud |
| S2 | Redacted public pixels or public text after consent (clue explanations, optional second-opinion clue pass) | PREFER_ON_DEVICE | HybridModel | Real automatic cloud fallback, shown with an IN_CLOUD badge |
| S3 | Adversary | ONLY_IN_CLOUD | ONLY_IN_CLOUD | None |
| S4 | Synthetic sample gallery | PREFER_ON_DEVICE | PREFER_ON_DEVICE | Cloud, so judges without Nano see every AI step |
The Egress Gate enforces the class at runtime. The policy lives as data in Remote Config, not as scattered if-statements.

8. SIGNATURE DEMO MOMENT
- Split screen. Left: the photo and the verdict. Right: the Cloud Ledger, with counters "Faces sent: 0 · Vault items sent: 0".
- The red verdict appears: "Identified your WORKPLACE by name · Home: within 1 km · Child's name: caught and masked on this device". The device referee computes it while the Ledger still reads 0.
- A deliberate leak attempt (un-mask the name tag, re-send) is BLOCKED by the Egress Gate.
- One tap on Fix (on-device), then re-attack: "Country only, low confidence", and the verdict turns green: "Risk reduced".
- Closing line: "The stalker never learns it was right."

9. FEATURES
MVP (all done by Nov 28):
- Web PWA:
  - capability panel;
  - vault;
  - import by file, drag or paste (no URL input);
  - Tier-0 guard and Nano pre-screen;
  - a consent sheet showing the exact redacted image that will leave;
  - adversary C1/C2 with streaming notes and grounding chips;
  - referee with distance bands;
  - verdict card with red, amber and green lines, showing bands, never metres;
  - fix planner, masking and re-attack;
  - Cloud Ledger, Egress Gate and a "What the cloud saw" toggle;
  - Router HUD showing inferenceSource and latency for every call;
  - download of the cleaned photo, and a share card with no location;
  - Judge Mode;
  - offline mode: the PWA is cached, the vault, pre-screen and fix work with Wi-Fi off, and the cloud check waits in a queue until online.
- iOS: vault, PHPicker import, Vision Tier-0, FM pre-screen/referee/fix plan (on-device-only), HybridModel explainer, cloud adversary, masking, Ledger, and the same Remote Config policy.
- Benchmark: 25 photos (see section 14).
STRETCH (only if Day 9 is green, in this order):
1. Chrome extension "check before you post", a thin catcher for ONE site with a standard file input. A capture-phase change listener hands the file to the hosted PWA via externally_connectable messaging, and the cleaned file is swapped back with DataTransfer. No Firebase inside the extension, so no App Check problem.
2. iOS Share Extension: writes to an App Group and the main app does the analysis.
3. Any-language explanations: the cloud translates explanation TEMPLATES containing placeholders ({{WORKPLACE}}, {{HOME}}), and the device fills them in.
4. Batch "check my last 20 posts".
CUT: Android, URL or scraping input, map pins of the adversary's guess, children's faces sent to the cloud, and any "safe" claims.

10. PLATFORMS
- WEB (primary; the surface judges try; Best Web/Chrome): Vite + React + TypeScript PWA on Firebase Hosting, Firebase JS SDK firebase/ai hybrid, self-hosted MediaPipe tasks-vision and Tesseract.js.
- iOS (the on-device showcase; Best iOS; multi-platform consideration for the Grand Prize): SwiftUI, FirebaseAILogic, Vision, Core Image, CoreLocation. FM runs in the Simulator on this M1. The Simulator has no camera, so photos come in through Photos import.
- ANDROID: not built. One roadmap line notes that the same Firebase project could serve a cloud-path client.

11. FIREBASE PRODUCTS
- AI LOGIC hybrid inference:
  - the per-class modes above;
  - inferenceSource drives the badges;
  - cloud Gemini with image input and Google Search grounding;
  - AI Logic per-user rate limits.
- APP CHECK, enforced:
  - reCAPTCHA Enterprise on the hosted web app;
  - App Attest on iOS devices, and the debug provider in the Simulator;
  - it also throttles abuse of the adversary.
- ANONYMOUS AUTH: per-user quotas without collecting any identity.
- REMOTE CONFIG, cached for offline use:
  - routing_policy;
  - prompt versions (adversary A and B, referee, fix planner);
  - model names and temperature;
  - distance-band thresholds and the clue-type enum;
  - daily cap on adversary runs and feature flags (grounding, extension);
  - a global cloud kill switch.
- FIRESTORE:
  - (a) "Leak Atlas": opt-in, anonymous counters by clue TYPE plus whether the fix moved the distance band. No images, coordinates, vault data or per-photo documents. Increments are validated by security rules. Shown as "Most common giveaways this week". These counters go to Firestore, never to Gemini.
  - (b) Judge Mode sample metadata, plus cached pass-B (ungrounded) outputs for the synthetic samples only. Grounded output is never cached across users.
- HOSTING: the PWA and the sample assets.
- NOTE: AI Monitoring cannot see on-device calls, so the Ledger keeps its own local counters.

12. SAFETY AND LIMITS
- CHILDREN: faces are always masked before any cloud call, and the demo photos contain no people.
- REFUSALS: privacy-auditor framing, scene only. If Gemini declines, show "Adversary declined; on-device findings only" and keep the local result. Never retry with jailbreak phrasing.
- DUAL USE
  - Only files from the user's own device; no URL input.
  - The UI shows distance bands to YOUR pins and clue boxes only, never a map pin or address for the guess.
  - App Check, AI Logic per-user limits, and a Remote Config cap plus kill switch.
  - The README says honestly that the raw JSON is visible in DevTools and that the added harm over the public Gemini app is close to zero.
- CLAIMS: say "risk reduced", never "safe"; use bands, never metre-level precision; always show confidence.
- DATA
  - No-training tier.
  - Consent for every photo, with the exact outgoing image shown.
  - A Ledger receipt for every session.
  - A "burn vault" button.
  - Solid-fill masks; the output is re-OCR'd and must contain no vault text.
- GROUNDING TERMS: render Search Suggestions and sources with the grounded notes; never cache grounded output across users.
- TOKEN LIMITS
  - iOS prompts stay under 4,096 tokens and Nano prompts under 9,216.
  - Outputs are short.
  - The iOS app works in the foreground only.
- LANGUAGES
  - Vision OCR and Gemini are multilingual.
  - Nano accepts en/es/ja (plus de/fr where available), so on-device prompts are English templates wrapped around the extracted strings.
  - Apple FM covers more languages.
- FILMING: never the builder's real home or a real primary school. Use a fictional name tag, a prop lanyard with a logo, and a "home" pin on a public building near the shoot.

13. GRACEFUL DEGRADATION (judges without on-device AI)
- A first-run capability panel calls availability() and shows what runs where on THIS browser.
- With no Nano (Safari, Firefox, mobile, low-RAM laptops, or the model still downloading), the app runs the Tier-0 guard, the cloud adversary and the deterministic referee.
  - The full red-to-green loop still works.
  - The privacy guarantee does not change: the original photo never leaves the device.
  - Badges read "rules-only" instead of "Gemini Nano".
- JUDGE MODE: one click loads 3 synthetic scenes and a fake vault, routed as S4. Every AI step runs, lands IN_CLOUD with honest badges, and goes from red to green in about 60 s.
- TRY YOUR OWN: drop in your last Instagram post with an empty vault and you still get the clue map and the adversary's region.
- iOS: video plus build instructions. A TestFlight public link only if a paid developer account exists and review is started by Nov 26.

14. MEASURED, NOT CLAIMED (benchmark in the repo)
- Photo set: 25 builder-owned, people-free photos with known true locations.
- Measure:
  - the share of photos placed within 1 km and within 5 km, before and after the fix;
  - the refusal rate;
  - pre-screen recall for Nano vs Tier-0 vs cloud, on hand-labelled clues;
  - p50 and p95 latency for each tier;
  - on-device vs cloud call counts per session.
- Publish whatever the numbers turn out to be.

15. BUILD PLAN (deadline Dec 1 00:00 GMT+2)
D1 (Nov 19-20): go/no-go spikes.
- (a) Adversary on 10 of the builder's own photos through AI Logic (image plus grounding, then the schema pass). PASS if there are at most 2 refusals and at least 4 photos land within 5 km.
- (b) Nano with image input and a JSON schema through the Firebase hybrid SDK in Chrome 157 on this 8 GB M1 (check chrome://on-device-internals).
- (c) iOS 27 Simulator: on-device-only session, HybridModel, and a tool call.
- If (a) fails, switch to Blindfill on D2; the router, Egress Gate and Ledger code carry over.
- If (b) fails, iOS carries the on-device story and the web shows Tier-0 plus cloud honestly.
D2-D5 (Nov 21-24): web core loop.
D6 (Nov 25): App Check, Auth, Remote Config, Firestore, Judge Mode, Hosting.
D7-D9 (Nov 26-28): iOS app, plus the benchmark run.
D10 (Nov 29): polish, README, stretch features only if green. Record each beat separately and never run Simulator FM and Chrome Nano together on 8 GB.
D11 (Nov 30): edit the video, write the Devpost text, submit.

## grafted_from_runners_up

- From Blindfill (runner-up):
  - Its Cloud Ledger becomes an enforced Egress Gate. One wrapper sits around every AI Logic call and re-checks the outgoing bitmap and prompt against the vault. The demo includes a deliberate leak that the gate visibly blocks.
  - Routing by sensitivity class, stored as data in Remote Config: S0/S1 never reach the cloud, S2 uses real PREFER_ON_DEVICE fallback, S3 is cloud-only. This fixes the "two pinned pipelines" criticism and shows off the SDK's actual fallback.
  - The "two independent readers" check: deterministic Vision/Tesseract OCR alongside Nano or FM, where either reader alone can trigger a mask.
- From Asking For A Friend:
  - Tier-0 deterministic guarantee: face masks, EXIF stripping and OCR-to-vault matching run in every browser, so the privacy promise holds even with no local model ("on-device when available, private either way").
  - Its "Subpoena View" becomes a "What the cloud saw" toggle.
  - Stretch: placeholder templates ({{WORKPLACE}}) translated in the cloud and filled in on the device, so the UI works in any language without the cloud seeing the vault.
  - On iOS, an on-device-only session for sensitive steps, with HybridModel used only for public steps.
- From Utter's judge upgrade:
  - Evidence instead of claims: a 25-photo benchmark (located within 1 km before vs after the fix, refusal rate, recall per tier, p50/p95 latency) in the README and the video.
  - A persistent Router HUD logging the route and latency of every call.
  - Judge Mode with a preloaded persona and samples.
- From Denominator:
  - "Code does the math, never the LLM": haversine distance bands and box padding are deterministic.
  - A shareable result card, drawn by code, as the growth loop. It never contains a location.
  - A per-user cloud budget and a kill switch in Remote Config.
  - No cross-user caching of grounded output, to respect the Search-grounding terms.
- From Telegraph:
  - Framing each tier by where the knowledge lives: world knowledge in the cloud, the user's own ground truth on the device.
  - A verify-after-transform loop: re-attack the fixed photo to confirm the change worked.
- From Muganga (baseline):
  - The design keeps the baseline's best insight: identity stays on the device, the cloud does the heavy work without seeing it, and the system fails closed. Nothing sensitive ever goes through a PREFER_* call.
  - The token map that never leaves the device becomes the vault that never leaves the device.

## key_risks_and_mitigations

1. GEMINI REFUSES OR HEDGES on the geolocation prompt.
- Frame the prompt as a privacy audit commissioned by the photo's owner, about the scene only. Faces are masked before the call.
- Go/no-go on Day 1 using 10 of the builder's own people-free photos: pass with at most 2 refusals and at least 4 placed within 5 km.
- In the app, a refusal shows "on-device findings only" and is never retried with jailbreak phrasing.
- If the Day-1 check fails, switch to Blindfill on Day 2, reusing the router, Egress Gate and Ledger.

2. GEOLOCATION QUALITY IS UNEVEN AND NON-DETERMINISTIC. It is weaker outside well-photographed cities, and a re-attack can still guess the location from architecture.
- Temperature 0 and a pinned model through Remote Config.
- Show distance bands and confidence, never metres.
- Say "risk reduced", never "safe". Offer cropping when masking isn't enough.
- Publish honest benchmark numbers.
- Pre-test the exact demo photos 10 or more times.

3. THE PRIVACY STORY CONTRADICTS ITSELF if the cloud sees the photo.
- The cloud only ever gets a copy with faces masked, vault matches masked and EXIF stripped.
- Strict mode masks every clue flagged on-device.
- The consent sheet shows the exact outgoing image, and the Egress Gate re-checks it.
- Use a no-training paid tier or the Vertex backend.
- The claim: "the cloud sees the redacted photo you were about to publish, and 0 bytes from your vault."

4. THE HYBRID LOOKS THIN (it could look like string matching plus a distance calculation).
- Give Nano and FM real semantic work: reading leaks from the raw image, matching inferences to the vault ("lanyard logo" to "work: City General"), and the minimal fix plan with an explanation.
- Say openly that the distance math is deterministic on purpose.
- Use S2 PREFER_ON_DEVICE so the SDK's automatic fallback is visible.
- Show inferenceSource on every call.

5. CHROME NANO ON THE 8 GB M1 IS UNVERIFIED (Chrome asks for 16 GB of RAM or more than 4 GB of VRAM).
- The v3Nano weights are reportedly already downloaded on this Mac; confirm on Day 1.
- If Nano won't run, iOS FM carries the on-device footage, and the web build shows Tier-0 plus the cloud honestly.
- Never run the Simulator's FM and Chrome Nano at the same time; record each video beat separately.

6. THE EXPERIMENTAL iOS SDK (on-device-only session, on-device function calling, reading the inference source) is unverified.
- Spike all three on Day 1.
- If function calling fails, use a strict line format parsed and validated in code, with one retry.
- Any direct use of native FoundationModels is disclosed and limited to a fallback.

7. DUAL USE (someone saves a stranger's photo and runs it).
- Local files only, no URLs.
- The UI shows only bands relative to YOUR pins and clue boxes, never a map pin or address for the guess.
- App Check, AI Logic per-user limits, a Remote Config daily cap and a kill switch.
- The README states plainly that the raw JSON is visible in DevTools and that the added harm over the public Gemini app is close to zero.

8. PRIOR ART: arXiv 2503.20226 and Geo-Safe-Filter already do warn, blur, re-check.
- Cite both.
- Lead with what is new: the vault acts as private ground truth, the referee never tells the attacker, the egress gate is enforced, and routing is by sensitivity class.
- The headline line is "the stalker never learns it was right."

9. SCOPE FOR ONE AGENT IN 11 DAYS.
- Order: web loop, then Firebase hardening, then iOS, then benchmark, then stretch.
- The Chrome extension and the iOS Share Extension are stretch goals only.
- Android is cut.

10. GROUNDING ISSUES: the Search-grounding terms, and a single call that combines grounding with a JSON schema is flaky.
- Use two passes: grounded notes that render Search Suggestions and sources, then an ungrounded structured pass.
- Never cache grounded output across users.

11. THE DEMO COULD DOX THE BUILDER, or create bad optics around children.
- Never film the builder's real home or a real primary school.
- Use a fictional "LUCAS" tag, a prop lanyard with a logo, and a public building as the "home" pin.
- No people in any photo.

12. JUDGES CAN'T INSTALL THE iOS APP.
- iOS is judged mainly from the video.
- Start TestFlight review by Nov 26 only if a paid developer account exists.
- The web Judge Mode carries hands-on testing.

## storyboard

RULES FOR THE WHOLE VIDEO
- A Router HUD in the bottom-left logs every call, e.g. "pre-screen > ON-DEVICE (Gemini Nano) 2.1 s", "adversary > IN_CLOUD (Gemini + Search) 6 s", "referee > ON-DEVICE 1.3 s".
- The Cloud Ledger sits on the right with the counters "Faces sent: 0 · Vault items sent: 0".
- All photos are people-free and shot in the builder's own city. The "home" pin is a public building near the shoot. Props: a fictional "LUCAS" name tag and a lanyard with a logo but no text.
- Wi-Fi is toggled visibly in the macOS menu bar, because the Simulator has no airplane mode.
- Record each beat separately, using real measured numbers only.

BEAT 1 (0:00-0:18) HOOK
- Full-screen doorstep photo: a backpack with a name tag, a lanyard on a hook, a street sign and a bus stop behind.
- Caption: "This photo has no GPS data."
- Investigator notes stream in, sped up: "Bus stop code... street sign... lanyard logo..."
- The verdict bar turns red: "Home: within 1 km."
- VO: "Deleting location data doesn't protect you anymore. AI reads the street."
- Title card: STRANGERS' EYES, "See your photo the way a stalker's AI would, before you post it."

BEAT 2 (0:18-0:35) THE VAULT, iOS Simulator in an iPhone frame
- "Pin this place" for Home, then Work (City General), then the child's name "Lucas".
- Lock badge: "Stays on this device. Never geocoded. Never uploaded."
- The Ledger shows 0 requests.
- One caption line: parents, sellers, creators, survivors, in any country.

BEAT 3 (0:35-0:58) OFFLINE PRE-SCREEN, Chrome PWA with Wi-Fi visibly OFF
- Drop in the photo. An ON-DEVICE (Gemini Nano) badge appears, plus a Tier-0 chip.
- Flag: "LUCAS on backpack matches your child's name." The tag and the house number get solid masks.
- The lanyard logo is flagged amber: "possible identifier".
- Chip: "Deeper check queued until you're online."

BEAT 4 (0:58-1:40) RED TEAM, the centrepiece
- Wi-Fi back on. The consent sheet shows the exact masked image: "This, and only this, will be sent."
- The IN_CLOUD badge lights. Notes stream with Search source chips, and evidence boxes land on the stop code, the street sign and the lanyard logo.
- "Referee comparing guesses with your vault... on this device" (ON-DEVICE badge).
- The verdict turns red:
  - "Identified your WORKPLACE by name"
  - "Home: within 1 km"
  - "Child's name: caught and masked before upload"
- 4-second split graphic: the cloud sees masked pixels, the device holds the truth. "The cloud never learns it was right."
- The Ledger still reads 0 / 0.

BEAT 5 (1:40-1:55) THE GATE
- The user un-ticks the name-tag mask and taps re-check.
- A red toast: "Blocked: 'LUCAS' would have left this device."
- The "What the cloud saw" toggle shows only the masked copy.

BEAT 6 (1:55-2:20) FIX AND RE-ATTACK
- Tap Fix. The on-device plan reads: "Mask the lanyard and the stop code; the paving alone only reveals the country."
- Solid fills animate in. The re-attack runs IN_CLOUD and returns "Country-level, low confidence".
- The verdict turns green: "Risk reduced" (never "safe").
- Receipt: "Cloud received 2 redacted images · 0 faces · 0 vault items · 9 on-device calls."
- The share card appears, with no location.

BEAT 7 (2:20-2:42) PROOF AND PLATFORMS
- Benchmark card with the real numbers: "25 photos: located within 1 km before fix X/25, after fix Y/25; refusals Z."
- iOS cameo: the same verdict with an Apple Foundation Models badge, and Vision drawing the masks.
- Routing table overlay:
  - vault and original photo: ONLY_ON_DEVICE
  - public explanations: PREFER_ON_DEVICE, falling back to the cloud
  - attacker: ONLY_IN_CLOUD

BEAT 8 (2:42-3:00) CLOSE
- Firebase stack strip: AI Logic hybrid, App Check, Remote Config, Anonymous Auth, Firestore, Hosting.
- "Try it in any browser, no on-device AI needed: sample gallery, 60 seconds."
- VO: "Stalkers already have this AI. Now you do too, and it never learns where you live."
- URL and repo link.

## runner_up_summary

Composite score 7.98. This is a close second and the Day-2 fallback if the Strangers' Eyes adversary fails its Day-1 go/no-go.

WHAT IT IS
- Understanding a form is public knowledge; the answers are private.
- The cloud (Gemini with PDF input, long context and Search grounding) reads only BLANK official forms and their guidance notes. It turns them into "form cards" stored in a shared Firestore library (written by a Cloud Function, with sources), so the next person anywhere filling the same form makes zero LLM calls.
- The device does the private half:
  - builds a vault from passport and ID photos, using Nano image-to-JSON plus a deterministic ICAO MRZ checksum as a second reader;
  - lets the user answer in their own language and fills fields in the form's format;
  - runs cross-document consistency checks (e.g. the passport expires too soon after return);
  - shows a Cloud Ledger proving 0 personal fields were sent.
- Audience: about 304M migrants, students and visa applicants worldwide.

WHY IT LOST
- Higher raw judge average (8.1), but crowdedness 6 and feasibility risk 7: three surfaces, pdf-lib, the card pipeline, and XFA and portal forms shrinking the usable target set.
- Many existing Nano form fillers.
- It collides head-on with Google's own Chrome enhanced autofill and "Find and fill with Gemini" (US, Oct 28 2026), in front of Google judges.
- Its private vault runs ONLY_ON_DEVICE, so most judges would only see a cloud demo persona.
- Much of the on-device work (MRZ, formatting) is deterministic, which makes the AI look decorative.

IF SWITCHING TO IT
- Keep the web PWA and iOS; drop the MV3 extension.
- Choose verified AcroForm forms that are genuinely global (e.g. IRS W-8BEN plus one Schengen consulate PDF).
- Make the sensitivity router the hero: public questions use PREFER_ON_DEVICE, private ones ONLY_ON_DEVICE.
- Position it as complementary to Chrome autofill: "Autofill knows your passport number; it doesn't know what Geburtsname means or which section applies to you."
- The Egress Gate, Ledger and Remote Config routing code built for Strangers' Eyes carries over unchanged.

## red_team_findings

{
 "crowdedness": 4,
 "feasibility_risk": 6,
 "hybrid_honesty": 5,
 "fatal_flaws": [
  "THE CORE LOOP ALREADY EXISTS. arXiv 2503.20226 (Ma, Zhang et al., Mar 2025) builds the same analyze, warn, edit (blur, crop, sticker) and re-analyze loop, using GPT-4 plus OCR. Geo-Safe-Filter (TikTok TechJam 2025) uses Gemini 2.5 Flash to find location clues, Grounding DINO for boxes and OpenCV blur, with GeoCLIP to show what can be inferred. The novelty that is left is narrow: the private on-device vault as ground truth, interception at upload time, and the hybrid split. If the pitch leads with 'AI finds and blurs location clues', the judges' Quality of Idea score drops.",
  "THE PRIVACY PITCH CONTRADICTS ITSELF. The line 'the cloud sees only what would become public' is false as designed. The adversary's first call sends the UNFIXED original, with the crest, house number, the child's name and face. After the fix, that original never becomes public, but Google has already seen it. Worse, Firebase AI Logic on the free Gemini Developer API tier allows prompts and images to be used to improve Google products and to be reviewed by humans. Sending a child's photo through the free tier sinks the privacy story if a judge asks.",
  "SAFETY REFUSALS COULD BREAK THE DEMO. Prompting Gemini as a stalker or OSINT investigator to find the school and home of a child shown in a photo matches Google's prohibited uses (tracking people, harm to minors). Expect refusals, hedging, or answers that change from run to run. The demo's best moment ('Found your child's SCHOOL') depends on the least policy-safe prompt. This has not been tested.",
  "THE DUAL-USE MITIGATION IS COSMETIC. 'Only images from your own device' does not stop anyone saving a stranger's photo first. The vault comparison happens on the device, so the adversary's precise location guesses have to reach the client, where anyone can read them in network traffic. Firebase AI Logic gives no server-side point to coarsen them. App Check confirms the request comes from the app, not why it was made. In practice the tool is a free Gemini geolocator with a nice UI. The honest defense is that the Gemini app itself already offers this, so the extra harm is close to zero, but some Google judges may still be uneasy.",
  "THE HYBRID PART IS THIN, ESPECIALLY ON iOS. Foundation Models takes no image input, and on iOS the Firebase on-device path has no structured output, so the on-device LLM only classifies Vision OCR strings. The 'judge' step is mostly a distance calculation and string matching, which needs no model. The ONLY_ON_DEVICE and ONLY_IN_CLOUD design never uses the SDK's PREFER_* fallback, which is the feature judges score. Most judges will not have Nano or Apple Intelligence, so ONLY_ON_DEVICE steps will silently do nothing for them and they will see a cloud-only app.",
  "THE DEMO PROMISES MORE THAN THE MODEL CAN DO. 'Home within 180 m' from a front-door photo needs Street View-level matching that Gemini doesn't have. On ordinary residential streets (unlike the viral landmark or tourist photos) Gemini gives neighbourhood-level guesses at best, and the results vary between runs. The dramatic red verdict only works when the photo contains text clues (a school name, a crest with words, a house number), which makes the demo look staged. The builder can't stage Lisbon either. The demo has to use the builder's own city, and how well Gemini geolocates there is unknown.",
  "TOO MUCH SCOPE FOR 11 DAYS SOLO. The plan has a PWA, a Chrome extension intercepting uploads on Instagram, Facebook and Marketplace, an iOS app with a Share Extension, Vision OCR, a blur pipeline, Remote Config and Firestore. Three sub-risks: (a) App Check's reCAPTCHA Enterprise provider cannot attest a chrome-extension:// origin, so the extension needs a debug token or must route through the hosted page. (b) Intercepting uploads on React-managed file inputs on third-party sites is fragile, and those sites change. (c) Chrome Nano on an 8 GB M1 is still unverified."
 ],
 "existing_competitors": "I ran out of web searches partway through the red-team (the shared limit for this run was reached). So I could not check Devpost for past hackathon entries, Gemini's actual refusal behaviour, or redact-style products beyond what is listed here.\n\nDEFENSIVE PRIOR ART, CLOSEST FIRST:\n(1) arXiv 2503.20226 (March 2025), 'Raising Awareness of Location Information Vulnerabilities in Social Media Photos using LLMs'. It sends the photo to GPT-4 to identify the location and runs pytesseract OCR, then warns the user. The user edits with blur, crop or stickers, and the review phase re-analyzes the edited photo. This is the same warn, fix and re-check loop.\n(2) Geo-Safe-Filter (TikTok TechJam 2025, awpbash.github.io/projects/geo-safe-filter). Gemini 2.5 Flash identifies location-revealing objects (street signs, flags, landmarks, building numbers), Grounding DINO draws boxes and OpenCV blurs, mosaics or adds noise. GeoCLIP demonstrates what can be inferred. It is a React Native iOS and Android app with a FastAPI GPU backend. It has no user ground-truth vault and does not intercept uploads.\n(3) EXIF-only checkers: Safe Attachment Check (Chrome Web Store; only displays GPS data, does not strip it or block the upload), BlurIt and GPSDetect (Firefox; metadata warnings at upload), and tools.incoherency.co.uk/photo-location-privacy-checker (local EXIF only).\n(4) Redact.dev: bulk deletion of past posts. It does not scan before posting.\n\nOFFENSIVE TOOLS (what the adversary imitates): the GeoInfer Chrome extension (AI image geolocation with an API key), GeoSpy and Picarta, and ChatGPT o3 / o4-mini (the viral 'reverse location search' trend of April 2025, covered by TechCrunch, Tom's Hardware and TechSpot). TechRadar notes Gemini and Claude can do the same. McAfee, a vendor, claims AI located 87-91% of tested travel photos.\n\nGAP I FOUND: no shipped Chrome extension combines upload interception with AI visual geolocation. Nothing I found uses an on-device private vault of the user's places and names as ground truth to grade an adversary's guesses. That is the defensible novelty.\n\nCROWDING IN THIS HACKATHON: privacy is the default story for on-device AI, so expect several 'photo privacy scanner' or 'image PII redactor' entries. I would guess about 5 to 15 out of roughly 3,200 participants, not hundreds. Few will have the adversary-plus-ground-truth framing.",
 "mitigations": "REQUIRED FIXES, ROUGHLY IN PRIORITY ORDER:\n\n(A) DAY-1 GO/NO-GO CHECKS. Spend the first 4 to 6 hours on these. If two fail, switch ideas.\n- Run the adversary prompt on 10 of the builder's own residential and street photos, framed as a privacy auditor ('list every location-revealing clue with box coordinates, estimate region and coordinates with confidence'), never as a stalker, and with no people in the frame. Measure refusals and how close the guesses land.\n- Confirm Chrome 157 Nano downloads on the 8 GB M1 and accepts image input.\n- Confirm the experimental Firebase iOS HybridModel runs Foundation Models in the Simulator.\n\n(B) FIX THE PRIVACY CONTRADICTION.\n- Before ANY cloud call, run a local pass: detect faces (Vision on iOS, MediaPipe on web) and mask them, and mask OCR text that matches the vault (names, plates, house numbers). The first thing the cloud sees is then already partly redacted.\n- Use the paid Gemini Developer API tier, or the Vertex AI backend, and say so in the UI: 'not used for training'.\n- Change the claim to 'The cloud sees your photo minus faces and anything the device already caught, and 0 bytes from your vault'.\n- Never send photos of children. In the demo, use a marketplace seller's living-room photo with a window view, or an adult's doorstep or school-gate photo.\n\n(C) MAKE THE HYBRID SPLIT REAL, AS A PRIVACY-TIERED ROUTER.\n- Tier 1, vault-aware semantic match, ONLY_ON_DEVICE: on Chrome, Nano gets the image plus the vault items and answers 'does this image show any of these?', which catches fuzzy matches like 'St Mary's crest' for 'St. Mary Primary' or a work lanyard. The fallback when there is no model is deterministic matching, never the cloud.\n- Tier 2, generic clue extraction, PREFER_ON_DEVICE with cloud fallback: it is image-only and the user has consented, so falling back is fine. Show an inferenceSource badge on every result.\n- Tier 3, the adversary, ONLY_IN_CLOUD with Search grounding.\n- Make this routing table the centrepiece of the README and the video.\n- On iOS, use Vision OCR boxes for blur regions, which are more accurate than Gemini's boxes, and FM for classifying and explaining.\n\n(D) CUT SCOPE. Ship the web PWA and the iOS app (Photos picker only, no Share Extension). Build the Chrome extension only on day 9 or later, as a thin catcher: it intercepts the file input on ONE site (for example Facebook Marketplace) and opens the hosted PWA, where App Check works, instead of running Firebase inside the extension.\n\n(E) DUAL USE. State it openly in the submission. The extra harm compared with the Gemini app itself is close to zero, the UI shows only coarse results, the app has no URL or scraping input, and App Check plus a Remote Config per-user daily cap limit abuse. Don't claim the safeguards stop a determined attacker.\n\n(F) DEMO HONESTY. Use the builder's own city and real tested photos. Show the verdict as distance bands ('within 1 km of HOME' or 'identified your SCHOOL by name'), not invented 180 m precision. Mask with solid fills, not Gaussian blur, because blurred digits can be read again. Say 'risk reduced', never 'safe'. Pin the model version and seed prompts through Remote Config so the live demo is repeatable.\n\n(G) GROUNDING. Check that Search grounding, image input and JSON schema output work in a single call through Firebase AI Logic. If they don't, split it into two calls: grounded free text, then structured extraction. Display the Search Suggestions the grounding terms require.\n\nVERDICT RATIONALE: this is a global problem with a very strong demo moment and a specific audience, and it is clearly better than the baseline on the 'global' requirement. But the warn, blur and re-check loop is prior art, and the hybrid part is thin unless (C) is done. The privacy story also falls apart under questioning unless (B) is done. Without those fixes it is risky. With them, plus the day-1 checks in (A), it is a credible contender for Best Web or the Grand Prize.",
 "verdict": "viable"
}

## judge_feedback

{
 "tech": 7,
 "design": 8,
 "impact": 8,
 "idea_quality": 8.5,
 "rationale": "After ~300 summarizers, chatbots and scam detectors, this would stand out right away. It is one of the few pitches where the on-device/cloud split comes from how the problem works, not from adding an offline mode. The cloud is the attacker, because it needs world knowledge, vision and Search grounding. The device holds the secret answer and grades the attacker without telling it the result. \"The adversary never learns whether it guessed right\" is a precise, non-obvious idea that a Firebase judge would remember.\n\nIDEA QUALITY (8.5): A fresh framing of hybrid inference as an information-asymmetry game, aimed at a known threat: EXIF-free visual geolocation (GeoSpy-style tools and the 2025 trend of geolocating photos with AI). It loses points for clear prior art: research papers on VLM geolocation privacy and Geo-Safe-Filter already do the warn, blur and re-check loop. The private vault plus interception at upload time is a real difference, but an incremental one.\n\nIMPACT (8): Global, with named high-need groups (parents, survivors, creators, sellers, journalists), a well-documented harm (stalker cases where a location was worked out from reflections and landmarks), and a fix you can see working in the demo (red turns green). Two things hold it back. Run-before-every-post habits are hard to build, and the Chrome extension interception partly addresses that. Gemini's residential geolocation is inconsistent, so a staged Lisbon photo may look cherry-picked unless it comes with numbers.\n\nDESIGN (8): The demo flow is excellent. The instant offline flag, streamed adversary reasoning, red verdict, one-tap local fix, re-run, green verdict and the \"what the cloud knows: 0 bytes from your vault\" panel together feel like a product, not a proof of concept. Capturing the vault by dropping pins on-site is thoughtful. The risks are polish under time pressure: three surfaces (PWA, extension, iOS) in 11 days, and precise blur boxes.\n\nTECH (7): App Check (doubling as anti-doxxing rate limiting), Remote Config for prompt versions and thresholds, Nano image-to-JSON, Vision OCR feeding Foundation Models on iOS, Search grounding and multiple platforms are all strong. But a DevRel judge will check how much of the on-device half really needs an LLM. OCR, matching a name string and a haversine distance between the cloud's lat/lng and the vault pins are plain code. Pinning calls to ONLY_ON_DEVICE / ONLY_IN_CLOUD also skips the SDK's core feature, automatic fallback. On a judge's machine without Nano (very likely), the ONLY_ON_DEVICE path either fails or quietly drops to deterministic code, which shows that Nano was decorative. Combining Search grounding with structured bounding-box output in one call is also an integration risk to test on day 1. With good execution this is a strong 7, and 8 only if those gaps are closed.\n\nOverall: a credible Grand Prize contender if the hybrid story is tightened. It is in the top ~5% of ideas, not a lock.",
 "biggest_weakness": "The on-device half is mostly work that doesn't need an LLM (OCR, string matching, distance between coordinates), and both halves are pinned to ONLY_ON_DEVICE or ONLY_IN_CLOUD. The app is really two fixed endpoints rather than hybrid inference. On judges' machines without Gemini Nano, the 'private on-device judge' either breaks or falls back to plain code, so the headline privacy architecture looks decorative exactly when the judges try it.",
 "best_upgrade": "Make InferenceMode a visible data-sensitivity routing policy and give Nano work only an LLM can do. (a) Pre-screen calls that only see the public pixels use PREFER_ON_DEVICE, so they fall back to cloud gracefully on any judge's machine. (b) Every call that touches the vault is pinned ONLY_ON_DEVICE, with a labeled deterministic fallback. (c) The on-device model does semantic matching between the adversary's free-text inferences and the vault: 'Catholic primary near tram 28' against vault 'school: St Mary's', or 'nurse scrubs, morning commute' against 'work: hospital'. It also writes the minimal fix plan and explains it in plain language. Show an inferenceSource badge on every step ('on-device: saw your vault' / 'cloud: saw only the public image') so judges can see the hybrid split and audit it in the demo. Add a small measured benchmark: across 20-30 builder-owned photos, the share where the adversary placed home or school within 1 km before vs after Fix. That makes the Impact claim credible instead of anecdotal."
}