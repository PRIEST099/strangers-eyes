// ios/StrangersEyesTests/GateTests.swift: the Swift Egress Gate with protocol-mocked engines (T-124 Verify): the class
// floor in code, fail-closed RULES-ONLY with a fresh availability check on every S0/S1 call, and the S3 pre-send checks
// (consent hash, metadata, faces, vault text in the image, vault strings / pin coordinates in the prompt). Plus the
// metadata strip on JPEG / HEIC / PNG files carrying GPS, and the fake-adversary loop reaching "Risk reduced".
import FoundationModels
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import StrangersEyes

final class MockDevice: DeviceModel, @unchecked Sendable {
  var current: FMState = .available
  var stateCalls = 0
  var generateCalls = 0
  var fail = false
  func state() -> FMState { stateCalls += 1; return current }
  func tokenCount(_ text: String) async -> Int? { 10 }
  func generate<T: Generable & Sendable>(_ prompt: String, instructions: String?, as type: T.Type) async throws -> T {
    generateCalls += 1
    if fail { throw ParseError(message: "mock failure") }
    return FMRefereeAnswer(matches: [FMRefereeMatch(claim_id: "c1", vault_id: "v1", strength: "likely", reason: "mock")]) as! T
  }
}

final class MockTransport: CloudTransport, @unchecked Sendable {
  var calls = 0
  var engine: String { "mock" }
  func passB(system: String, user: String, jpeg: Data) async throws -> CloudReply {
    calls += 1
    return CloudReply(text: "{}", declined: false, engine: engine)
  }
}

@MainActor
final class GateTests: XCTestCase {
  // Synthetic vault: a child name and a home pin in the open-ocean test area (shared/testvectors convention).
  let vault = [VaultItem(id: "v-kid", kind: "child_name", label: "Lucas"),
               VaultItem(id: "v-home", kind: "home_pin", label: "Home", pin: Pin(lat: 0.5, lng: -30.5))]

  func makeGate(device: MockDevice = MockDevice(), transport: MockTransport = MockTransport(),
                faces: Int = 0, words: [String] = []) -> (EgressGate, Ledger) {
    let ledger = Ledger()
    let v = vault
    let gate = EgressGate(ledger: ledger, device: device, transport: transport, vault: { v }, recheck: { _ in
      (faces, words.enumerated().map { OCRWord(text: $0.element, line: 0, box: PxRect(x: Double($0.offset) * 10, y: 0, w: 10, h: 10)) })
    })
    return (gate, ledger)
  }

  func cleanJpeg() -> Data {
    let ctx = CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
    return ImagePipeline.jpeg(ctx.makeImage()!)!
  }

  /// An image file carrying GPS, TIFF and Exif metadata (written in the test; synthetic values).
  func fileWithGPS(_ type: UTType) -> Data {
    let ctx = CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
    let out = NSMutableData()
    let d = CGImageDestinationCreateWithData(out, type.identifier as CFString, 1, nil)!
    let props: [CFString: Any] = [
      kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 0.5, kCGImagePropertyGPSLatitudeRef: "N", kCGImagePropertyGPSLongitude: 30.5, kCGImagePropertyGPSLongitudeRef: "W"],
      kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "TestMake", kCGImagePropertyTIFFModel: "TestModel"],
      kCGImagePropertyExifDictionary: [kCGImagePropertyExifUserComment: "secret"],
      kCGImagePropertyOrientation: 6,
    ]
    CGImageDestinationAddImage(d, ctx.makeImage()!, props as CFDictionary)
    CGImageDestinationFinalize(d)
    return out as Data
  }

  // ---------- S0/S1: class floor and fail-closed ----------
  func testOnDeviceRejectsCloudClasses() async {
    let dev = MockDevice()
    let (gate, ledger) = makeGate(device: dev)
    for cls in [PayloadClass.S2, .S3, .S4] {
      let r = await gate.onDevice(job: "j", cls: cls, prompt: "p", generating: FMRefereeAnswer.self, deterministic: { FMRefereeAnswer(matches: []) })
      XCTAssertEqual(r.route, .blocked)
      XCTAssertEqual(r.blocked, .classMismatch)
    }
    XCTAssertEqual(dev.generateCalls, 0)
    XCTAssertEqual(ledger.blocked, 3)
  }

  func testUnavailableModelFailsClosedToRulesWithoutCallingTheModel() async {
    for st in [FMState.modelNotReady, .appleIntelligenceNotEnabled, .deviceNotEligible, .unknown] {
      let dev = MockDevice(); dev.current = st
      let (gate, ledger) = makeGate(device: dev)
      var ran = false
      let r = await gate.onDevice(job: "referee", cls: .S0, prompt: "p", generating: FMRefereeAnswer.self, deterministic: { ran = true; return FMRefereeAnswer(matches: []) })
      XCTAssertEqual(r.route, .rulesOnly)
      XCTAssertTrue(ran)
      XCTAssertEqual(dev.generateCalls, 0, "\(st): the model is never called")
      XCTAssertEqual(ledger.entries.first?.route, .rulesOnly)
    }
  }

  func testAvailabilityIsCheckedOnEveryCall() async {
    let dev = MockDevice()
    let (gate, _) = makeGate(device: dev)
    for _ in 0..<3 { _ = await gate.onDevice(job: "j", cls: .S1, prompt: "p", generating: FMRefereeAnswer.self, deterministic: { FMRefereeAnswer(matches: []) }) }
    XCTAssertEqual(dev.stateCalls, 3)
    XCTAssertEqual(dev.generateCalls, 3)
    dev.current = .modelNotReady
    let r = await gate.onDevice(job: "j", cls: .S0, prompt: "p", generating: FMRefereeAnswer.self, deterministic: { FMRefereeAnswer(matches: []) })
    XCTAssertEqual(r.route, .rulesOnly, "no cached 'available'")
  }

  func testModelErrorFallsBackToRules() async {
    let dev = MockDevice(); dev.fail = true
    let (gate, _) = makeGate(device: dev)
    let r = await gate.onDevice(job: "j", cls: .S0, prompt: "p", generating: FMRefereeAnswer.self, deterministic: { FMRefereeAnswer(matches: []) })
    XCTAssertEqual(r.route, .rulesOnly)
    XCTAssertEqual(r.value?.matches.count, 0)
  }

  func testAvailableModelRunsOnDevice() async {
    let (gate, ledger) = makeGate()
    let r = await gate.onDevice(job: "j", cls: .S0, prompt: "p", generating: FMRefereeAnswer.self, deterministic: { FMRefereeAnswer(matches: []) })
    XCTAssertEqual(r.route, .onDevice)
    XCTAssertEqual(r.value?.matches.first?.strength, "likely")
    XCTAssertEqual(ledger.onDeviceCalls, 1)
  }

  // ---------- S3: pre-send checks ----------
  func testCloudRejectsPrivateClasses() async {
    let t = MockTransport()
    let (gate, _) = makeGate(transport: t)
    let j = cleanJpeg()
    for cls in [PayloadClass.S0, .S1, .S2] {
      let r = await gate.cloud(job: "j", cls: cls, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: j, consent: ConsentToken(sha256: ImagePipeline.sha256Hex(j)))
      XCTAssertEqual(r.blocked, .classMismatch)
    }
    XCTAssertEqual(t.calls, 0)
  }

  func testCloudBlocksDynamicPromptTextAndVaultStrings() async {
    let t = MockTransport()
    let (gate, _) = makeGate(transport: t)
    let j = cleanJpeg(), c = ConsentToken(sha256: ImagePipeline.sha256Hex(j))
    var r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser + " The child is Lucas.", jpeg: j, consent: c)
    XCTAssertEqual(r.blocked, .vaultTextInPrompt)
    r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser + " near 0.501, -30.501", jpeg: j, consent: c)
    XCTAssertEqual(r.blocked, .pinInPrompt)
    r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser + " be thorough", jpeg: j, consent: c)
    XCTAssertEqual(r.blocked, .classMismatch)
    XCTAssertEqual(t.calls, 0)
  }

  func testCloudRequiresConsentToTheExactBytes() async {
    let t = MockTransport()
    let (gate, _) = makeGate(transport: t)
    let j = cleanJpeg()
    var r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: j, consent: nil)
    XCTAssertEqual(r.blocked, .noConsent)
    r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: j, consent: ConsentToken(sha256: String(repeating: "0", count: 64)))
    XCTAssertEqual(r.blocked, .noConsent)
    XCTAssertEqual(t.calls, 0)
  }

  func testCloudBlocksMetadataFacesAndVaultTextInTheImage() async {
    let t = MockTransport()
    let gps = fileWithGPS(.jpeg)
    var (gate, _) = makeGate(transport: t)
    var r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: gps, consent: ConsentToken(sha256: ImagePipeline.sha256Hex(gps)))
    XCTAssertEqual(r.blocked, .metadata)
    let j = cleanJpeg(), c = ConsentToken(sha256: ImagePipeline.sha256Hex(j))
    (gate, _) = makeGate(transport: t, faces: 1)
    r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: j, consent: c)
    XCTAssertEqual(r.blocked, .face)
    (gate, _) = makeGate(transport: t, words: ["bag", "LUCAS"])
    r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: j, consent: c)
    XCTAssertEqual(r.blocked, .vaultTextInImage)
    XCTAssertEqual(t.calls, 0)
  }

  func testCleanConsentedImageIsSentOnceAndLedgerReadsZeroZero() async {
    let t = MockTransport()
    let (gate, ledger) = makeGate(transport: t, words: ["HOSPITAL", "STAFF"])
    let j = cleanJpeg()
    let r = await gate.cloud(job: "j", cls: .S3, system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: j, consent: ConsentToken(sha256: ImagePipeline.sha256Hex(j)))
    XCTAssertNil(r.blocked)
    XCTAssertEqual(r.route, .inCloud)
    XCTAssertEqual(t.calls, 1)
    XCTAssertEqual(ledger.cloudRequests, 1)
    XCTAssertEqual(ledger.facesSent, 0)
    XCTAssertEqual(ledger.vaultItemsSent, 0)
  }

  // ---------- metadata strip (API-NOTES §4.2) ----------
  func testReencodeStripsGPSFromJpegHeicAndPng() throws {
    for type in [UTType.jpeg, .heic, .png] {
      let original = fileWithGPS(type)
      guard !original.isEmpty else { continue }   // HEIC encoding can be unavailable in some runtimes
      XCTAssertFalse(ImagePipeline.metadataClean(original), "\(type.identifier) original is not clean")
      let decoded = try XCTUnwrap(ImagePipeline.decode(original), type.identifier)
      XCTAssertTrue(decoded.hadGPS, type.identifier)
      XCTAssertEqual(decoded.master.width, 48, "\(type.identifier): orientation 6 baked into the pixels (U-27)")
      let out = try XCTUnwrap(ImagePipeline.jpeg(decoded.master))
      XCTAssertTrue(ImagePipeline.metadataClean(out), type.identifier)
      let p = CGImageSourceCopyPropertiesAtIndex(CGImageSourceCreateWithData(out as CFData, nil)!, 0, nil) as? [CFString: Any] ?? [:]
      XCTAssertNil(p[kCGImagePropertyGPSDictionary], type.identifier)
      XCTAssertNil(p[kCGImagePropertyOrientation].flatMap { ($0 as? Int) == 1 ? nil : $0 }, type.identifier)
    }
  }

  func testSolidMasksAreSolidBlack() {
    let ctx = CGContext(data: nil, width: 100, height: 80, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: 100, height: 80))
    let masked = ImagePipeline.applySolidMasks(ctx.makeImage()!, [PxRect(x: 10, y: 10, w: 30, h: 20)])
    XCTAssertGreaterThan(ImagePipeline.blackFraction(masked, PxRect(x: 12, y: 12, w: 26, h: 16)), 0.99)
    XCTAssertLessThan(ImagePipeline.blackFraction(masked, PxRect(x: 60, y: 40, w: 30, h: 30)), 0.01)
  }

  // ---------- the vault store ----------
  func testVaultLimitsAndGenericLabels() {
    XCTAssertThrowsError(try VaultStore.validate(VaultItem(id: "a", kind: "employer", label: "Work")))
    XCTAssertThrowsError(try VaultStore.validate(VaultItem(id: "a", kind: "employer", label: String(repeating: "x", count: 41))))
    XCTAssertThrowsError(try VaultStore.validate(VaultItem(id: "a", kind: "home_pin", label: "Home")), "a pin needs coordinates")
    XCTAssertNoThrow(try VaultStore.validate(VaultItem(id: "a", kind: "home_pin", label: "Home", pin: Pin(lat: 0.5, lng: -30.5))))
    XCTAssertNil(VaultStore.parseCoords("91, 0"))
    XCTAssertEqual(VaultStore.parseCoords(" 0.5 , -30.5 "), Pin(lat: 0.5, lng: -30.5))
  }

  // ---------- the DEBUG fake loop: verdict → rules fix → re-attack → Risk reduced ----------
  #if DEBUG
  func testFakeAdversaryLoopReachesRiskReduced() async throws {
    let vault = [VaultItem(id: "h", kind: "home_pin", label: "Home", pin: DevFlags.demoHome),
                 VaultItem(id: "w", kind: "work_pin", label: "City General Hospital", pin: DevFlags.demoWork),
                 VaultItem(id: "k", kind: "child_name", label: "Lucas")]
    let photo = try XCTUnwrap(ImagePipeline.decode(SyntheticScene.jpeg()))
    let full = PxRect(x: 0, y: 0, w: photo.width, h: photo.height)
    let fake = FakeAdversaryTransport()
    func attack(_ masks: [PxRect]) async throws -> (AdversaryResult, Verdict, ImageFrame) {
      let (cloud, frame) = ImagePipeline.cloudFrame(ImagePipeline.applySolidMasks(photo.master, masks), cropInMaster: full)
      let reply = try await fake.passB(system: "", user: "", jpeg: ImagePipeline.jpeg(cloud)!)
      let adv = try AdvBParser.parse(data: Data(reply.text!.utf8))
      let claims = Referee.claims(inferences: adv.inferences, hypotheses: adv.hypotheses)
      let m = Referee.rulesReferee(claims, Referee.vaultItems(vault))
      let v = VerdictEngine.build(VerdictInput(adv: VerdictAdv(status: adv.status, hypotheses: adv.hypotheses, inferences: adv.inferences), matches: m, vault: vault))
      return (adv, v, frame)
    }
    let (adv1, v1, frame1) = try await attack([])
    XCTAssertEqual(v1.level, "RED")
    let fix = FixPlanner.deterministicFix(adv: adv1, frame: frame1, verdict: v1, vault: vault, width: photo.width, height: photo.height)
    XCTAssertFalse(fix.masks.isEmpty)
    XCTAssertFalse(fix.explanation.lowercased().contains("safe"))
    let (_, v2, _) = try await attack(fix.masks.map(\.box))
    let cmp = VerdictEngine.compare(v1, v2)
    XCTAssertTrue(cmp.riskReduced, "after: \(v2.level) \(v2.lines.map(\.id))")
    XCTAssertEqual(VerdictEngine.comparisonHeadline(cmp).copyId, "copy.verdict.reduced")
  }
  #endif
}
