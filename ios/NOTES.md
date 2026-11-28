# iOS lean build: notes (Nov 21, updated Nov 24)

The lean SwiftUI app mirrors the web check in one screen, plus **Judge Mode** (the web's three CC0 samples with a fake
vault, Nov 24). The parent session owns PROGRESS, TASKS and DEVLOG; this file
records what the iOS build does, how to run it, and what is not verified.

## Flow
1. **Vault** (`Vault/VaultStore.swift`, `UI/VaultView.swift`): local only. One JSON file in Application Support written
   with `.completeFileProtection` and excluded from backup. Kinds offered: home/work pin (typed `lat, lng`; no
   CoreLocation, never geocoded), employer, child name, own name, school name, home street, plate, house number.
   Limits: 20 items, 40 characters, 5 aliases. Burn vault deletes the file. *Deviation:* ARCH §19.3 planned the Keychain.
2. **Import + Tier-0** (`Tier0/*`): PhotosPicker, a Judge Mode sample, or the DEBUG synthetic photo (only with
   `-fakeAdversary`). Orientation is baked in at decode.
   Vision finds faces (CPU compute device in the Simulator) and OCR words with word boxes. `Fuzzy.matchWords` checks the
   words against the vault. Faces and vault hits get solid black masks with 15% padding.
2b. **On-device pre-screen** (T-125, `AI/PrescreenJob.swift`, prompt `shared/prompts/fmPre.v1.user.md`): Apple FM reads
   TEXT ONLY: the OCR lines (`l1`…, 3x3 region, at most 40) and the top 10 Vision scene labels (confidence ≥ 0.3). Never
   an image (API-NOTES §3.10) and no vault labels; words Tier-0 already matched to the vault are left out. It goes
   through the gate as **S1** (fresh availability check, token budget, fail closed to RULES-ONLY with no extra findings).
   Types, regions, severities and line ids are validated in code (`@Generable FMPreScreen`). Findings show as
   "Possible identifier: … Not masked. You decide." and feed the verdict's on-device flags; they are never auto-masked.
3. **Consent + Egress Gate** (`AI/EgressGate.swift`): the consent sheet shows the exact redacted JPEG: pixels only,
   cloud frame ≤ 1536 px, its sha256, and the gate's pre-check (metadata, faces, vault matches). The gate is the only door
   to FirebaseAI (check-boundaries R16).
   - **S0/S1:** Apple FM via `ai.generativeModelSession(model: FirebaseAI.SystemLanguageModel.default)`. Availability is
     read fresh before every call. The call fails closed to RULES-ONLY when FM is unavailable, over 4,096 tokens, or
     throws.
   - **S3:** the call goes ahead only when all of these hold:
     - the prompt is exactly the static advB.v1 template (any other text is scanned and blocked);
     - the consent hash matches;
     - there is no metadata;
     - a fresh Vision pass on the outgoing bytes finds 0 faces and 0 vault OCR hits.
   - Every call writes one in-memory Ledger entry, which the Router HUD shows with its route and latency.
4. **Referee** (`AI/RefereeJob.swift`): runs nanoRef.v1 on Apple FM through the gate (class S0) with a static
   `@Generable` answer. IDs and strengths are validated in code. The answer is unioned with the rules referee. With no
   FM, the rules referee alone decides.
5. **Verdict** (`Core/Verdict.swift`): port of web `core/verdict.ts`. Bands to the user's own pins are computed in code
   (haversine). There is no map, no coordinates and no "safe", and confidence is shown on every line.
6. **Fix + re-attack** (`Core/FixPlan.swift`): port of `deterministicFix`, with solid masks and the 40%-capped crop.
   After a fix, the user consents again to the new exact image. Then the re-attack runs and `compareVerdicts` decides
   "Risk reduced".

## Judge Mode (Nov 24)
`Judge/JudgeSamples.swift`, `UI/JudgeViews.swift`; home screen card "Try Judge Mode" → "Open Judge Mode".
- **Samples:** `project.yml` references `../web/public/samples` as the `samples` folder resource (manifest.json, the three
  CC0 photos, the recorded `judge-0N.advB.v1.json` / `.advB.fixed.v1.json` and SOURCES.md). Nothing is copied into
  `ios/`. The manifest is parsed strictly (port of `parseJudgeManifest`) and each photo's sha256 is checked on load.
- **Fake vault, in memory only:** Home pin, work pin "City General Hospital", child "Lucas", plate "SE 1234"; pins = the
  sample's own `fakeVault` (judge-02) else the manifest's, rounded to 3 decimals. `AppModel.activeVault` is the fake
  vault while Judge Mode is on: Tier-0, the gate's scans, the referee, the verdict and the fix all use it, and the real
  `VaultStore` is not read. "Exit Judge Mode" (or importing your own photo) drops it.
- **Attacker = the recorded real Gemini answer** (gemini-3.5-flash-lite, 2026-11-23). `RecordedReplayTransport` is passed
  to `EgressGate.cloud(..., via:)`, so the replay runs every pre-send check (static prompt, consent hash, metadata, fresh
  Vision faces/vault-text pass) and writes a Ledger entry with route **CACHED**, 0 bytes, 0 cloud requests. The answer
  goes through the same strict `AdvBParser`. The consent sheet says "The redacted image that would be sent", shows the
  CACHED SAMPLE badge and `copy.judge.cached`, and its button is "Use recorded result".
- **Re-attack:** the "fixed" recording is replayed only when the masks and crop being sent hide the first recording's
  manifest `fixMasked` clues (port of `fixedRecordingApplies`, ≥ 90% of each box, D-161); otherwise the first recording
  again. Recording boxes are mapped into a crop with `boxIntoCrop`.
- **Live on-device steps:** Tier-0, the FM pre-screen (S1) and the FM referee (S0) run for real.

## Misuse hardening and plain language (Nov 24)
- The attacker's guessed place name, inference values and clue evidence text are never rendered. The verdict shows the
  best guess as precision level + confidence only (`VerdictEngine.bestGuessDisplay`, which drops `{label}` from the
  bundled template whichever en.json is on disk), and "Clues the attacker found" as type · what it reveals · severity.
  `bestGuessText` stays the exact web port for the parity vectors and is never shown. The compare header swaps a
  best-guess line for the label-free text (`comparisonHeadlineDisplay`).
- Default UI has no payload classes, prompt ids, hashes or "Tier-0". Settings (gear) › Developer › "Show what runs
  where" turns on technical details: the consent sheet's size + sha256, Tier-0 counts, HUD class + gate note per call,
  referee notes, clue ids in the fix.
- The Router HUD is one compact line (the latest call) and expands on tap: faces/vault items sent, real cloud requests
  and bytes (a CACHED replay counts 0), on-device / rules / blocked calls, the last 6 calls.

## DEBUG-only fake attacker (no cloud calls)
`Dev/FakeAdversary.swift` (`#if DEBUG` on line 1) is selected with the launch argument `-fakeAdversary` or the env
`FAKE_ADVERSARY=1`. The gate runs all of its checks first and only then calls the fake instead of Gemini.
- **Input:** the fake decodes the exact JPEG. A canned clue whose box is at least 60% solid black counts as masked and is
  dropped, together with the hypotheses and inferences that cite it.
- **Answer:** when nothing is masked, the full canned answer. When no hypothesis is left, a coarse city-level guess.
- **Synthetic scene:** drawn in code (`SyntheticScene`).
- **Demo vault:** `-seedDemoVault` seeds pins in the open-ocean test area of `shared/testvectors`.
- **Labels:** the HUD and the consent sheet label the fake.
- Judge Mode supersedes it for demos; it stays for the synthetic scene (the "Use synthetic test photo" button only
  appears with `-fakeAdversary`) and for `GateTests.testFakeAdversaryLoopReachesRiskReduced`.

Other DEBUG argument: `-acceptWelcome`.

## Live Gemini path (your own photos)
The real S3 path, `FirebaseCloudTransport`, is compiled and is the transport for your own photos whenever the app is
launched WITHOUT `-fakeAdversary` (Judge Mode always replays). It has not been run (free-tier quota reserved). It uses
`generativeModel(modelName:generationConfig:systemInstruction:)` with `responseSchema` from `SchemaFromJSON` and our
own `InlineDataPart`.

**App Check (needed before a live call can work; [USER] step).** DEBUG builds install `AppCheckDebugProviderFactory`
before `FirebaseApp.configure()` (`App/StrangersEyesApp.swift`, API-NOTES §3.3). To register the Simulator:
1. Run the app once in the Simulator from Xcode (scheme StrangersEyes, Debug) and open the debug console, or launch it
   with `xcrun simctl launch --console booted dev.strangerseyes.app`.
2. Find the line `[AppCheckCore][I-GAC004001] App Check debug token: '…'` (Xcode: filter the console for
   `I-GAC004001`). The value between the quotes is the token. Treat it as a secret: don't paste it in chat, commits or
   screenshots.
3. Firebase console → Security → App Check → Apps → the iOS app → ⋮ → **Manage debug tokens** → Add, paste it, save.
4. The auto token changes when the app is reinstalled. For a stable one, put your own token in the git-ignored
   `ios/.appcheck-debug-token` and launch with `SIMCTL_CHILD_AppCheckDebugToken="$(cat ios/.appcheck-debug-token)"`
   (or set `AppCheckDebugToken` in a non-shared Xcode scheme); register that value instead.
Then import your own photo (not Judge Mode) and send it; the HUD shows IN CLOUD for that call. **Verified Nov 27 (U-25):** a token generated into the git-ignored file was registered by the owner (Firebase console, App Check, the iOS app's ⋮ › Manage debug tokens; the app itself is not registered with an attestation provider), the app launched with `SIMCTL_CHILD_AppCheckDebugToken`, a drawn made-up street scene added with `xcrun simctl addmedia` and checked through the own-photo flow: pre-screen ON-DEVICE (Apple FM, 82.7 s cold), consent, attack IN CLOUD (`gemini-3.5-flash-lite`, 6.6 s), LOW verdict, referee BUILT-IN · code (nothing to link). The fix had nothing to mask; the fix card no longer offers a re-attack of the identical photo in that case.

**Measurement harness (DEBUG only, D-184).** `Dev/BenchRunner.swift` runs a list of photos through `AppModel` with an in-memory made-up vault when launched with `-iosBench` and `IOS_BENCH_MANIFEST=<json>`; `scripts/measure-ios-parity.mjs` builds the manifest from PRIV, launches with the debug token and collects the `IOSBENCH` lines (bands, levels, routes only). Results: `docs/ios-parity.md`.

## Run
```bash
cd ios && xcodegen generate
xcodebuild -project StrangersEyes.xcodeproj -scheme StrangersEyes -destination 'platform=iOS Simulator,id=E950C8A0-185D-40BF-8A62-C113655C0557' -derivedDataPath build -clonedSourcePackagesDirPath .spm ARCHS=arm64 test
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/StrangersEyes.app
xcrun simctl launch booted dev.strangerseyes.app -fakeAdversary -seedDemoVault -acceptWelcome
xcrun simctl shutdown all   # when done (8 GB: never with Chrome Nano)
```

UI demo run (real taps through Judge Mode on judge-02, no `-fakeAdversary`; writes `ios/screenshots/ios-judge-01…12`;
the older `ios-01…12` files are the Nov 21 fake-attacker run, still referenced by `video/scripts/assets.mjs`):
```bash
TEST_RUNNER_SCREENSHOT_DIR="$PWD/screenshots" xcodebuild -project StrangersEyes.xcodeproj -scheme StrangersEyesDemo -destination 'platform=iOS Simulator,id=E950C8A0-185D-40BF-8A62-C113655C0557' -derivedDataPath build -clonedSourcePackagesDirPath .spm ARCHS=arm64 test
python3 -I tools/strip-png.py screenshots/*.png   # Simulator PNGs carry eXIf/iTXt chunks; check-images I2 rejects them
```

## Results (Nov 24)
- `StrangersEyes` scheme: **32 XCTests pass** (`** TEST SUCCEEDED **`): BundleResources 2, CoreParity 4 (against the
  on-disk shared vectors, every case), Gate 14, Judge 12 (manifest + hashes + recordings, manifest defects, fake vault,
  D-161 recording choice, CACHED replay through the gate with 0 bytes / 0 requests and the checks still blocking,
  judge-02 → "Risk reduced" with the rules referee and no guessed place name in any shown text, label-free best guess,
  the D-168 area × pin referee rule, pre-screen lines/validation/fail-closed).
- `StrangersEyesDemo` scheme: **1 UI test passes** (129.8 s, final run after D-168 and the run-generation guard),
  iPhone 18 Pro Simulator, iOS 27, no `-fakeAdversary`: home → Judge Mode → judge-02 → Tier-0 → Pre-screen ON-DEVICE
  (Apple FM) → consent ("Use recorded result") → Attack CACHED SAMPLE (gemini-3.5-flash-lite, recorded) → referee
  ON-DEVICE (Apple FM) 19.4 s → AMBER, HOME and WORKPLACE within 5 km (district), best guess "street level · attacker
  confidence high" → fix masks the street sign and the number plate → Re-attack CACHED SAMPLE (the after-fix recording)
  → referee ON-DEVICE 14.2 s → **"Risk reduced: within 5 km (district) → same city area"**, LOW. HUD: requests 0 ·
  bytes 0. Screenshots `screenshots/ios-judge-01…12` (no 05: the referee finished before the "running" shot), PNG
  metadata stripped.
- History: the first Nov 24 UI run ended "Still exposed: Could point to your WORKPLACE · same city area" because Apple
  FM linked the city guess "Berlin, Germany" to the work pin "City General Hospital". An iOS-only filter was added,
  reverted for parity, then replaced by **D-168** on both platforms (see Known issues).
- `xcrun simctl shutdown all` run afterwards.

## Results (Nov 21)
- `StrangersEyes` scheme: 20 XCTests pass.
  - `CoreParityTests` runs every case of `shared/testvectors` bands.json (61), fuzzy.json (99), referee.json (64) and
    verdict.json (93).
  - `GateTests` has 14 tests.
  - `BundleResourcesTests` has 2 tests.
- `StrangersEyesDemo` scheme: 1 UI test passes. The run in the iOS 27 Simulator reached verdict RED, then the fix,
  the re-attack, and "Risk reduced: within 1 km (neighbourhood) → same city area".
  - The referee ran **ON-DEVICE (Apple FM via Firebase's on-device session)**: 29.6 s and 13.7 s.
  - The attacker was the DEBUG fake, which the HUD shows as CACHED SAMPLE.
  - The Ledger read 0 · 0.

## Known issues / not verified
- **D-168 (Nov 24): a device-only place guess × pin link is dropped, on both platforms.** An iOS-only filter
  (`RefereeJob.groundedDeviceMatches`, no D-number) was first added, then reverted for web parity, which made the
  judge-02 walk end "Still exposed". The rule now lives in `Referee.mergeMatches(_:_:geo:)` (web `mergeMatches(…, geo)`):
  with no rules match for the pair, a match between a claim of kind `area` and a pin item is dropped (nearness to a pin
  is geometry, which the distance bands compute in code, invariant 5); other device-only matches stay capped at
  `possible` (D-157). Shared vectors: 4 `merge` cases with `geo` in `shared/testvectors/referee.json`.
  `JudgeTests.testDeviceOnlyAreaToPinLinkIsDroppedOthersCapped` covers the iOS call shape.
- **Fixed (Nov 24, fixer): stale async steps across runs.** `AppModel` now keeps a run generation (`runGen`, bumped by
  `reset()`, so by every import, `startJudge` and `exitJudge`). `runImport`, `prepareConsent` and `sendConsented` drop
  their result after any `await` if the generation changed, and `sendConsented` snapshots `judge` and `activeVault` at
  its start instead of re-reading them. Exiting Judge Mode mid-referee no longer builds a verdict against the real
  vault, and a live reply that lands after a Judge sample was opened is no longer stored as `firstRecording`. Not
  covered by a unit test (no AppModel test seam yet); the Exit and Judge controls stay enabled during `.working`.
- **Apple FM referee over-grades.** It answered `exact` for "A hospital (staff lanyard)" vs work pin "City General
  Hospital"; the rules referee said `likely`. On the re-attack it answered `exact` for the hypothesis "A coastal city"
  vs that pin (they share only the generic word "city"; the rules referee says no match).
  - The union keeps the stronger strength (D-90), so the after-verdict stays RED with "Identified your WORKPLACE by name".
  - D-128 still reports "Risk reduced" (coarser worst band and fewer HIGH lines).
  - Policy decision for the parent session: for example, cap device-only strength, or require a shared non-generic token
    for a device `exact`.
- `FirebaseCloudTransport` (the real Gemini pass B) has not been run. Not yet checked at runtime:
  - the `SchemaFromJSON` output and its `propertyOrdering` heuristic (first occurrence of each key in the raw file);
  - the decline mapping (`finishReason` safety / prohibitedContent);
  - the App Check token exchange.
- No anonymous Auth or Remote Config fetch: the adversary model comes from the bundled template default.
- No HybridModel explainer (T-129), no CoreLocation pin. The FM pre-screen (T-125) runs but is slow in the Simulator
  (158.5 s in the first Nov 24 run, 47.2 s in the second; the referee took 17.6–27.2 s).
- New copy is not possible from `ios/` (shared/strings is owned elsewhere), so the iOS UI reuses existing keys: the
  Developer toggle is labelled "Show what runs where" (`ui.settings.device.details`) under "Developer"; the Judge
  consent title is `ui.consent.imageAlt`. `copy.judge.cached` ends "The live attacker isn't available right now", which
  is true on iOS (Judge Mode never calls Gemini) but a dedicated iOS line would read better.
- The vault uses a file with `.completeFileProtection`, not the Keychain as ARCH §19.3 planned.
- `Ledger.finish` writes facesSent = vaultItemsSent = 0. This holds because the gate only reaches the transport after
  proving 0 faces and 0 vault hits on the exact bytes. The counters are asserted by the gate, not measured afterwards.
- If `tokenCount` fails (nil), the 4,096-token budget check is skipped. The call stays on device either way.
