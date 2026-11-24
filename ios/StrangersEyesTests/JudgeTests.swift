// ios/StrangersEyesTests/JudgeTests.swift: iOS Judge Mode and the FM pre-screen (T-125) without any model or network.
// - The bundled web samples: strict manifest, photo hashes, every recording parses as pass B.
// - The fake vault: kinds, labels and 3-decimal pins (the sample's own when given, D-164).
// - D-161: the "after fix" recording only when the masks sent hide the first recording's fixMasked clues.
// - The CACHED replay goes through the Egress Gate: same checks, Ledger route CACHED, 0 bytes, 0 cloud requests.
// - The level-crossing sample (judge-02) reaches "Risk reduced" with the rules referee, and the UI text never contains
//   the attacker's guessed place name.
// - The pre-screen: text lines and regions, code validation, fail-closed RULES-ONLY (generate never called, AC-325).
import FoundationModels
import XCTest
@testable import StrangersEyes

final class PreMockDevice: DeviceModel, @unchecked Sendable {
  var current: FMState = .available
  var generateCalls = 0
  var prompts: [String] = []
  var answer = FMPreScreen(clues: [])
  func state() -> FMState { current }
  func tokenCount(_ text: String) async -> Int? { 10 }
  func generate<T: Generable & Sendable>(_ prompt: String, instructions: String?, as type: T.Type) async throws -> T {
    generateCalls += 1
    prompts.append(prompt)
    return answer as! T
  }
}

@MainActor
final class JudgeTests: XCTestCase {
  func manifest() throws -> JudgeManifest { try XCTUnwrap(JudgeManifest.load(), "samples/manifest.json bundled and valid") }
  func sample(_ id: String) throws -> JudgeSample { try XCTUnwrap(try manifest().samples.first { $0.id == id }) }
  func recording(_ file: String) throws -> AdversaryResult { try AdvBParser.parse(data: XCTUnwrap(JudgeManifest.data(file))) }

  // ---------- the bundled samples ----------
  func testBundledManifestSamplesAndRecordings() throws {
    let m = try manifest()
    XCTAssertEqual(m.samples.map(\.id), ["judge-01", "judge-02", "judge-03"])
    for s in m.samples {
      XCTAssertNotNil(JudgeManifest.photo(s), "\(s.id): photo bundled and its sha256 matches the manifest")
      XCTAssertEqual(try recording(s.cachedAdvB).status, "ok", s.id)
      XCTAssertEqual(try recording(s.cachedAdvBFixed).status, "ok", s.id)
    }
    let s2 = try sample("judge-02")
    XCTAssertEqual(s2.fixMasked, ["c1", "c3"])
    XCTAssertNotNil(s2.fakeVault, "judge-02 carries its own pins (D-164)")
    XCTAssertNil(try sample("judge-01").fakeVault)
    XCTAssertNotNil(Bundle.main.url(forResource: "SOURCES", withExtension: "md", subdirectory: "samples"), "credits bundled")
  }

  func testManifestRejectsDefects() throws {
    let url = try XCTUnwrap(Bundle.main.url(forResource: "manifest", withExtension: "json", subdirectory: "samples"))
    let good = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    XCTAssertNotNil(JudgeManifest.parse(good))
    func broken(_ edit: (inout [String: Any]) -> Void) -> [String: Any] { var o = good; edit(&o); return o }
    func sampleEdit(_ k: String, _ v: Any) -> [String: Any] {
      broken { o in var ss = o["samples"] as! [[String: Any]]; ss[0][k] = v; o["samples"] = ss }
    }
    XCTAssertNil(JudgeManifest.parse(broken { $0["version"] = 2 }))
    XCTAssertNil(JudgeManifest.parse(broken { $0["samples"] = [] }))
    XCTAssertNil(JudgeManifest.parse(broken { $0["fakeVault"] = ["homePin": ["lat": 91, "lng": 0], "workPin": ["lat": 0, "lng": 0]] }))
    XCTAssertNil(JudgeManifest.parse(sampleEdit("image", "../secret.jpg")), "a path is never a sample file")
    XCTAssertNil(JudgeManifest.parse(sampleEdit("imageSha256", "XYZ")))
    XCTAssertNil(JudgeManifest.parse(sampleEdit("id", "judge-02")), "duplicate id")
    XCTAssertNil(JudgeManifest.parse(sampleEdit("fixMasked", ["c 1"])))
    XCTAssertNil(JudgeManifest.parse(sampleEdit("fakeVault", ["homePin": ["lat": 1]])))
    XCTAssertNil(JudgeManifest.data("../manifest.json"))
  }

  // ---------- the fake vault ----------
  func testFakeVaultUsesSamplePinsRoundedTo3Decimals() throws {
    let m = try manifest()
    let v = JudgeVault.make(JudgePins(homePin: Pin(lat: 0.5 + 4e-4, lng: -30.5 - 6e-4), workPin: Pin(lat: 0.5, lng: -30.5)))
    XCTAssertEqual(v.map(\.kind), ["home_pin", "work_pin", "child_name", "plate"])
    XCTAssertEqual(v.map(\.label), ["Home", "City General Hospital", "Lucas", "SE 1234"])
    XCTAssertEqual(v[0].pin, Pin(lat: 0.5, lng: -30.501))
    XCTAssertEqual(m.pins(for: try sample("judge-02")), try sample("judge-02").fakeVault)
    XCTAssertEqual(m.pins(for: try sample("judge-01")), m.fakeVault)
    for item in v { XCTAssertNoThrow(try VaultStore.validate(item), item.id) }
  }

  // ---------- D-161: which recording a re-attack replays ----------
  func testFixedRecordingAppliesOnlyWhenFixMaskedCluesAreHidden() throws {
    let s = try sample("judge-02")
    let first = try recording(s.cachedAdvB)
    let W = 1600.0, H = 1067.0
    func pad(_ id: String) -> PxRect { Boxes.padRect(JudgeFlow.boxToPx(first.clues.first { $0.id == id }!.box2d, W, H), W, H) }
    XCTAssertTrue(JudgeFlow.fixedRecordingApplies(first, masks: [pad("c1"), pad("c3")], crop: nil, W: W, H: H, fixMasked: s.fixMasked))
    XCTAssertFalse(JudgeFlow.fixedRecordingApplies(first, masks: [pad("c1")], crop: nil, W: W, H: H, fixMasked: s.fixMasked))
    XCTAssertFalse(JudgeFlow.fixedRecordingApplies(first, masks: [], crop: nil, W: W, H: H, fixMasked: s.fixMasked))
    // nil fixMasked = every removable clue (c2 too)
    XCTAssertFalse(JudgeFlow.fixedRecordingApplies(first, masks: [pad("c1"), pad("c3")], crop: nil, W: W, H: H, fixMasked: nil))
    // a crop that cuts a clue off counts as hiding it
    let c1 = JudgeFlow.boxToPx(first.clues.first { $0.id == "c1" }!.box2d, W, H)
    XCTAssertEqual(JudgeFlow.hiddenShare(c1, [], PxRect(x: 0, y: 0, w: W, h: c1.y - 1)), 1)
    XCTAssertEqual(JudgeFlow.boxIntoCrop([0, 0, 1000, 1000], nil, W, H), [0, 0, 1000, 1000])
    XCTAssertEqual(JudgeFlow.boxIntoCrop([500, 500, 1000, 1000], PxRect(x: W / 2, y: H / 2, w: W / 2, h: H / 2), W, H), [0, 0, 1000, 1000])
  }

  // ---------- the CACHED replay through the gate ----------
  func cleanJpeg() -> Data {
    let ctx = CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
    return ImagePipeline.jpeg(ctx.makeImage()!)!
  }

  func testReplayRunsTheGateChecksAndLogsCachedWithNoRequest() async throws {
    let ledger = Ledger()
    let live = MockTransport()
    final class Faces: @unchecked Sendable { var n = 0 }
    let faces = Faces()
    let vault = JudgeVault.make(try manifest().fakeVault)
    let gate = EgressGate(ledger: ledger, device: MockDevice(), transport: live, vault: { vault }, recheck: { _ in (faces.n, []) })
    let json = String(decoding: try XCTUnwrap(JudgeManifest.data(try sample("judge-02").cachedAdvB)), as: UTF8.self)
    let replay = RecordedReplayTransport(json: json, model: "gemini-3.5-flash-lite")
    let jpeg = cleanJpeg()
    let ok = await gate.cloud(job: "Attack", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: jpeg,
                              consent: ConsentToken(sha256: ImagePipeline.sha256Hex(jpeg)), via: replay)
    XCTAssertEqual(ok.route, .cached)
    XCTAssertEqual(ok.value?.text, json)
    XCTAssertEqual(live.calls, 0, "the configured (live) transport is never called for a replay")
    XCTAssertEqual(ledger.entries.first?.route, .cached)
    XCTAssertEqual(ledger.entries.first?.bytes, 0)
    XCTAssertEqual(ledger.cloudRequests, 0)
    XCTAssertEqual(ledger.cloudBytes, 0)
    // The same pre-send checks still apply to a replay.
    let noConsent = await gate.cloud(job: "Attack", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: jpeg, consent: nil, via: replay)
    XCTAssertEqual(noConsent.blocked, .noConsent)
    faces.n = 1
    let face = await gate.cloud(job: "Attack", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: jpeg,
                                consent: ConsentToken(sha256: ImagePipeline.sha256Hex(jpeg)), via: replay)
    XCTAssertEqual(face.blocked, .face)
    XCTAssertEqual(live.calls, 0)
  }

  // ---------- judge-02 end to end (rules referee) ----------
  func testLevelCrossingSampleReachesRiskReducedWithoutShowingTheGuess() throws {
    let m = try manifest()
    let s = try sample("judge-02")
    let vault = JudgeVault.make(m.pins(for: s))
    let photo = try XCTUnwrap(ImagePipeline.decode(XCTUnwrap(JudgeManifest.photo(s))))
    let full = PxRect(x: 0, y: 0, w: photo.width, h: photo.height)
    let frame = ImageFrame(width: photo.width, height: photo.height, cropInMaster: full)
    func verdict(_ adv: AdversaryResult, phase: String) -> Verdict {
      let claims = Referee.claims(inferences: adv.inferences, hypotheses: Array(adv.hypotheses.prefix(3)))
      let matches = Referee.rulesReferee(claims, Referee.vaultItems(vault))
      return VerdictEngine.build(VerdictInput(adv: VerdictAdv(status: adv.status, hypotheses: adv.hypotheses, inferences: adv.inferences),
                                              matches: matches, vault: vault, phase: phase))
    }
    let first = try recording(s.cachedAdvB)
    let v1 = verdict(first, phase: "initial")
    XCTAssertEqual(v1.level, "AMBER", "\(v1.lines.map(\.id))")
    let fix = FixPlanner.deterministicFix(adv: first, frame: frame, verdict: v1, vault: vault, width: photo.width, height: photo.height)
    XCTAssertEqual(Set(fix.maskClueIds), ["c1", "c3"])
    XCTAssertTrue(JudgeFlow.fixedRecordingApplies(first, masks: fix.masks.map(\.box), crop: fix.crop, W: photo.width, H: photo.height, fixMasked: s.fixMasked))
    let v2 = verdict(try recording(s.cachedAdvBFixed), phase: "reattack")
    let cmp = VerdictEngine.compare(v1, v2)
    XCTAssertTrue(cmp.riskReduced, "after: \(v2.level) \(v2.lines.map(\.id))")
    let shown = [VerdictEngine.comparisonHeadlineDisplay(cmp), VerdictEngine.bestGuessDisplay(v1) ?? "", VerdictEngine.bestGuessDisplay(v2) ?? ""]
      + v1.lines.map(VerdictEngine.lineText) + v2.lines.map(VerdictEngine.lineText)
    XCTAssertTrue(shown[0].hasPrefix("Risk reduced"), shown[0])
    for text in shown {
      for h in first.hypotheses + (try recording(s.cachedAdvBFixed)).hypotheses { XCTAssertFalse(text.contains(h.label), text) }
      XCTAssertFalse(text.contains("{label}"), text)
      XCTAssertFalse(text.lowercased().contains("berlin"), text)
    }
  }

  func testBestGuessDisplayDropsTheLabelWhicheverCopyIsBundled() {
    let h = AdversaryHypothesis(id: "h1", label: "Example Street 5, Sometown", level: "street", lat: 0.5, lng: -30.5, radiusKm: 0.2, confidence: "high", clueIds: [])
    let v = VerdictEngine.build(VerdictInput(adv: VerdictAdv(status: "ok", hypotheses: [h], inferences: []), matches: [], vault: []))
    let text = VerdictEngine.bestGuessDisplay(v) ?? ""
    XCTAssertFalse(text.contains("Example Street"), text)
    XCTAssertFalse(text.contains("{"), text)
    XCTAssertTrue(text.contains("street"), text)
    XCTAssertTrue(text.contains("high"), text)
  }

  // ---------- the referee drops a device-only place-guess × pin link (D-168), caps the rest (D-157), web parity ----------
  func testDeviceOnlyAreaToPinLinkIsDroppedOthersCapped() {
    // h1 is an area hypothesis ("Berlin, Germany"), i1 a workplace inference ("A hospital (staff lanyard)").
    func m(_ c: String, _ v: String) -> RefereeMatch { RefereeMatch(claimId: c, vaultId: v, strength: "exact", reason: "", clueIds: [], route: "ON_DEVICE") }
    let geo = Referee.GeoPairs(areaClaimIds: ["h1"], pinVaultIds: [JudgeVault.ids.work, JudgeVault.ids.home])
    let device = [m("h1", JudgeVault.ids.work), m("i1", JudgeVault.ids.work), m("h1", JudgeVault.ids.child)]
    let merged = Referee.mergeMatches(device, [], geo: geo)
    XCTAssertEqual(merged.matches.map(\.claimId), ["i1", "h1"], "only the area × pin link is dropped")
    XCTAssertTrue(merged.matches.allSatisfy { $0.strength == "possible" }, "other device-only matches are capped at possible")
    XCTAssertEqual(merged.notes, [Referee.deviceCapNote, Referee.deviceGeoNote])
    let ruled = Referee.mergeMatches(device, [RefereeMatch(claimId: "h1", vaultId: JudgeVault.ids.work, strength: "likely", reason: "", clueIds: [], route: "RULES_ONLY")], geo: geo).matches
    XCTAssertEqual(ruled.first { $0.claimId == "h1" && $0.vaultId == JudgeVault.ids.work }?.strength, "exact", "rules evidence keeps the link and lifts the cap")
  }

  func testGeoPairsLeavesOutCollidingAreaIds() {
    let claims = [RefereeClaim(id: "h1", kind: "home_area", value: "Elm Park area", confidence: "high", clueIds: []),
                  RefereeClaim(id: "h1", kind: "area", value: "Berlin, Germany", confidence: "medium", clueIds: []),
                  RefereeClaim(id: "h2", kind: "area", value: "Potsdam", confidence: "low", clueIds: [])]
    XCTAssertEqual(Referee.geoPairs(claims, []).areaClaimIds, ["h2"], "a colliding id caps, never drops")
  }

  // ---------- the FM pre-screen (T-125) ----------
  func tier0(words: [(String, Int, PxRect)], vaultMask: PxRect? = nil, labels: [String] = []) -> Tier0Result {
    let ws = words.map { OCRWord(text: $0.0, line: $0.1, box: $0.2) }
    let masks = vaultMask.map { [Tier0Mask(reason: .vault(vaultId: "judge-child"), box: $0)] } ?? []
    return Tier0Result(words: ws, faces: [], vaultHits: [], masks: masks, labels: labels, ms: 0)
  }

  func testPrescreenLinesRegionsAndVaultWordsLeftOut() {
    let t = tier0(words: [("HARBOUR", 0, PxRect(x: 10, y: 10, w: 50, h: 10)), ("ROAD", 0, PxRect(x: 70, y: 10, w: 40, h: 10)),
                          ("LUCAS", 1, PxRect(x: 250, y: 250, w: 40, h: 10)), ("27", 2, PxRect(x: 150, y: 150, w: 10, h: 10))],
                     vaultMask: PxRect(x: 240, y: 240, w: 60, h: 30))
    let ls = PrescreenJob.lines(t.words, W: 300, H: 300, exclude: t.masks.map(\.box))
    XCTAssertEqual(ls, [PrescreenJob.Line(id: "l1", text: "HARBOUR ROAD", region: "top_left"), PrescreenJob.Line(id: "l2", text: "27", region: "middle_center")])
    let p = PrescreenJob.prompt(ls, labels: ["street", "sign"]) ?? ""
    XCTAssertFalse(p.contains("LUCAS"), "no vault text in the S1 prompt")
    XCTAssertFalse(p.contains("{{"))
    XCTAssertTrue(p.contains("HARBOUR ROAD"))
  }

  func testPrescreenValidatesInCode() {
    let a = FMPreScreen(clues: [
      FMPreClue(type: "street_sign", line_id: "l1", text: "HARBOUR ROAD", region: "top_left", severity: "high"),
      FMPreClue(type: "face", line_id: "", text: "", region: "top_left", severity: "high"),          // not a pre-screen type
      FMPreClue(type: "house_number", line_id: "l9", text: "27", region: "top_left", severity: "medium"), // unknown line
      FMPreClue(type: "landmark", line_id: "", text: "", region: "somewhere", severity: "low"),       // bad region
      FMPreClue(type: "landmark", line_id: "", text: "", region: "middle_center", severity: "huge"),  // bad severity
      FMPreClue(type: "transit_sign", line_id: "", text: "", region: "bottom_right", severity: "low"),
    ])
    XCTAssertEqual(PrescreenJob.validate(a, lineIds: ["l1", "l2"]),
                   [PreFinding(type: "street_sign", severity: "high", lineId: "l1"), PreFinding(type: "transit_sign", severity: "low", lineId: nil)])
  }

  func testPrescreenFailsClosedToRulesAndRunsOnDeviceWhenAvailable() async {
    let t = tier0(words: [("HARBOUR", 0, PxRect(x: 10, y: 10, w: 50, h: 10))], labels: ["street"])
    let dev = PreMockDevice()
    dev.current = .appleIntelligenceNotEnabled
    let ledger = Ledger()
    let gate = EgressGate(ledger: ledger, device: dev, transport: MockTransport(), vault: { [] }, recheck: { _ in (0, []) })
    let off = await PrescreenJob.run(gate: gate, tier0: t, width: 300, height: 300)
    XCTAssertEqual(off.route, .rulesOnly)
    XCTAssertEqual(off.findings, [])
    XCTAssertEqual(dev.generateCalls, 0, "AC-325: no FM session code when unavailable")
    XCTAssertEqual(ledger.entries.first?.route, .rulesOnly)
    XCTAssertEqual(ledger.entries.first?.cls, .S1)

    dev.current = .available
    dev.answer = FMPreScreen(clues: [FMPreClue(type: "street_sign", line_id: "l1", text: "HARBOUR", region: "top_left", severity: "high")])
    let on = await PrescreenJob.run(gate: gate, tier0: t, width: 300, height: 300)
    XCTAssertEqual(on.route, .onDevice)
    XCTAssertEqual(on.findings, [PreFinding(type: "street_sign", severity: "high", lineId: "l1")])
    XCTAssertEqual(ledger.entries.first?.route, .onDevice)
    XCTAssertEqual(ledger.cloudRequests, 0)
    XCTAssertFalse(dev.prompts.last?.isEmpty ?? true)
  }
}
