# iOS lean build: notes (Nov 21)

The lean SwiftUI app mirrors the web check in one screen. The parent session owns PROGRESS, TASKS and DEVLOG; this file
records what the iOS build does, how to run it, and what is not verified.

## Flow
1. **Vault** (`Vault/VaultStore.swift`, `UI/VaultView.swift`): local only. One JSON file in Application Support written
   with `.completeFileProtection` and excluded from backup. Kinds offered: home/work pin (typed `lat, lng`; no
   CoreLocation, never geocoded), employer, child name, own name, school name, home street, plate, house number.
   Limits: 20 items, 40 characters, 5 aliases. Burn vault deletes the file. *Deviation:* ARCH §19.3 planned the Keychain.
2. **Import + Tier-0** (`Tier0/*`): PhotosPicker (or the DEBUG synthetic photo). Orientation is baked in at decode.
   Vision finds faces (CPU compute device in the Simulator) and OCR words with word boxes. `Fuzzy.matchWords` checks the
   words against the vault. Faces and vault hits get solid black masks with 15% padding.
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

## DEBUG-only fake attacker (no cloud calls)
`Dev/FakeAdversary.swift` (`#if DEBUG` on line 1) is selected with the launch argument `-fakeAdversary` or the env
`FAKE_ADVERSARY=1`. The gate runs all of its checks first and only then calls the fake instead of Gemini.
- **Input:** the fake decodes the exact JPEG. A canned clue whose box is at least 60% solid black counts as masked and is
  dropped, together with the hypotheses and inferences that cite it.
- **Answer:** when nothing is masked, the full canned answer. When no hypothesis is left, a coarse city-level guess.
- **Synthetic scene:** drawn in code (`SyntheticScene`).
- **Demo vault:** `-seedDemoVault` seeds pins in the open-ocean test area of `shared/testvectors`.
- **Labels:** the HUD and the consent sheet label the fake.

Other DEBUG argument: `-acceptWelcome`.

The real S3 path, `FirebaseCloudTransport`, is compiled but has not been run (free-tier quota reserved). It uses
`generativeModel(modelName:generationConfig:systemInstruction:)` with `responseSchema` from `SchemaFromJSON` and our
own `InlineDataPart`.

## Run
```bash
cd ios && xcodegen generate
xcodebuild -project StrangersEyes.xcodeproj -scheme StrangersEyes -destination 'platform=iOS Simulator,id=E950C8A0-185D-40BF-8A62-C113655C0557' -derivedDataPath build -clonedSourcePackagesDirPath .spm ARCHS=arm64 test
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/StrangersEyes.app
xcrun simctl launch booted dev.strangerseyes.app -fakeAdversary -seedDemoVault -acceptWelcome
xcrun simctl shutdown all   # when done (8 GB: never with Chrome Nano)
```

UI demo run (real taps through the whole flow; writes `ios/screenshots/ios-02…12`):
```bash
TEST_RUNNER_SCREENSHOT_DIR="$PWD/screenshots" xcodebuild -project StrangersEyes.xcodeproj -scheme StrangersEyesDemo -destination 'platform=iOS Simulator,id=E950C8A0-185D-40BF-8A62-C113655C0557' -derivedDataPath build -clonedSourcePackagesDirPath .spm ARCHS=arm64 test
python3 -I tools/strip-png.py screenshots/*.png   # Simulator PNGs carry eXIf/iTXt chunks; check-images I2 rejects them
```

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
- No pre-screen (T-125), no HybridModel explainer (T-129), no CoreLocation pin.
- The vault uses a file with `.completeFileProtection`, not the Keychain as ARCH §19.3 planned.
- `Ledger.finish` writes facesSent = vaultItemsSent = 0. This holds because the gate only reaches the transport after
  proving 0 faces and 0 vault hits on the exact bytes. The counters are asserted by the gate, not measured afterwards.
- If `tokenCount` fails (nil), the 4,096-token budget check is skipped. The call stays on device either way.
