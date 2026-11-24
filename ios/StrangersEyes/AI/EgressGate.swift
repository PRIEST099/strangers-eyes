// ios/StrangersEyes/AI/EgressGate.swift: THE only door to an AI model on iOS (invariant 4; T-124; ARCH §19.3–19.4).
// scripts/check-boundaries.mjs R16 allows `respond(` / `generateContent` / `HybridModel(` in this file only.
//
// - onDevice (S0, S1 only): checks Foundation Models availability IMMEDIATELY before every call (no cache). If the model
//   is unavailable, over the 4,096-token budget, or fails, the caller's deterministic code answers as RULES_ONLY.
//   The session is built HERE from FirebaseAI.SystemLanguageModel.default (never a HybridModel), so S0/S1 data can
//   never fall back to the cloud (fail closed, invariant 3).
// - cloud (S3 only): the prompt must be the bundled static pass-B template (a dynamic segment is CLASS_MISMATCH), the
//   JPEG must be the exact bytes the user consented to (sha256), carry no metadata, show 0 faces and 0 vault-text hits
//   on a fresh Vision pass; any non-template text is scanned for vault strings and pin coordinates. Only then is the
//   transport called with OUR InlineDataPart bytes. A decline or safety block is final: never retried or rephrased.
// - Every call writes one Ledger entry (pending → done/fallback/blocked) and so appears in the Router HUD. Judge Mode's
//   recorded replay goes through `cloud(..., via:)` with every check above and is logged CACHED with 0 bytes.
// LOCAL ONLY: vault terms and pins are read from the store to scan; they are never logged or put in the Ledger.
import FirebaseAILogic
import Foundation
import FoundationModels

enum BlockReason: String, Sendable {
  case classMismatch = "CLASS_MISMATCH", noConsent = "NO_CONSENT", metadata = "EXIF", face = "FACE"
  case vaultTextInImage = "VAULT_TEXT_IN_IMAGE", vaultTextInPrompt = "VAULT_TEXT_IN_PROMPT", pinInPrompt = "PIN_IN_PROMPT"
  case checkFailed = "CHECK_FAILED"

  var copyId: String {
    switch self {
    case .classMismatch: "copy.gate.blockedClass"
    case .noConsent: "copy.gate.blockedConsent"
    case .metadata: "copy.gate.blockedMetadata"
    case .face: "copy.gate.blockedFace"
    case .vaultTextInImage, .vaultTextInPrompt, .pinInPrompt, .checkFailed: "copy.gate.blockedPrompt"
    }
  }
}

struct GateResult<T: Sendable>: Sendable {
  var value: T?
  var route: Route
  var latencyMs: Int
  var engine: String
  var note: String?
  var blocked: BlockReason?
}

/// The user's approval of one exact outgoing image (SPEC SCR-07): its sha256.
struct ConsentToken: Sendable, Equatable { let sha256: String }

enum FMState: Sendable, Equatable {
  case available, modelNotReady, appleIntelligenceNotEnabled, deviceNotEligible, unknown
  var copyId: String? {
    switch self {
    case .available: nil
    case .modelNotReady: "copy.ios.fmNotReady"
    case .appleIntelligenceNotEnabled: "copy.ios.fmOff"
    case .deviceNotEligible, .unknown: "copy.ios.ineligible"
    }
  }
}

// ---------- engines (protocols so the gate is testable with mocks) ----------
protocol DeviceModel: Sendable {
  /// Read fresh on every call (never cached).
  func state() -> FMState
  func tokenCount(_ text: String) async -> Int?
  func generate<T: Generable & Sendable>(_ prompt: String, instructions: String?, as type: T.Type) async throws -> T
}

struct CloudReply: Sendable { var text: String?; var declined: Bool; var engine: String }

protocol CloudTransport: Sendable {
  var engine: String { get }
  /// true only for the DEBUG fake attacker: nothing leaves the device, so the HUD shows CACHED, never IN CLOUD.
  var simulated: Bool { get }
  func passB(system: String, user: String, jpeg: Data) async throws -> CloudReply
}

extension CloudTransport { var simulated: Bool { false } }

/// Apple Foundation Models through Firebase AI Logic's on-device-only session (API-NOTES §3.4, §3.6).
struct FirebaseDeviceModel: DeviceModel {
  func state() -> FMState {
    switch FirebaseAI.SystemLanguageModel.default.availability {
    case .available: return .available
    case .unavailable(.modelNotReady): return .modelNotReady
    case .unavailable(.appleIntelligenceNotEnabled): return .appleIntelligenceNotEnabled
    case .unavailable(.deviceNotEligible): return .deviceNotEligible
    case .unavailable: return .unknown
    }
  }

  func tokenCount(_ text: String) async -> Int? {
    try? await FoundationModels.SystemLanguageModel.default.tokenCount(for: Prompt(text))
  }

  func generate<T: Generable & Sendable>(_ prompt: String, instructions: String?, as type: T.Type) async throws -> T {
    // A NEW session per single-turn job (sessions keep history). Never a HybridModel for S0/S1 (API-NOTES §3.5).
    let ai = FirebaseAI.firebaseAI(backend: .googleAI())
    let session = ai.generativeModelSession(model: FirebaseAI.SystemLanguageModel.default, instructions: instructions)
    return try await session.respond(to: prompt, generating: T.self).content
  }
}

/// Gemini pass B via the classic API with a JSON response schema and our own InlineDataPart bytes (API-NOTES §3.7).
/// NOT exercised in this build's runs: the free-tier quota is reserved (ios/NOTES.md).
struct FirebaseCloudTransport: CloudTransport {
  let modelName: String
  var engine: String { "Gemini \(modelName)" }

  func passB(system: String, user: String, jpeg: Data) async throws -> CloudReply {
    let ai = FirebaseAI.firebaseAI(backend: .googleAI())
    let model = ai.generativeModel(
      modelName: modelName,
      generationConfig: GenerationConfig(maxOutputTokens: 8192, responseMIMEType: "application/json", responseSchema: SchemaFromJSON.advB()),
      systemInstruction: ModelContent(role: "system", parts: system))
    let resp = try await model.generateContent(user, InlineDataPart(data: jpeg, mimeType: "image/jpeg"))
    let declined = resp.candidates.first?.finishReason == .safety || resp.candidates.first?.finishReason == .prohibitedContent
    return CloudReply(text: resp.text, declined: declined, engine: engine)
  }
}

// ---------- the gate ----------
@MainActor
final class EgressGate {
  static let tokenBudget = 4096
  let ledger: Ledger
  let device: any DeviceModel
  let transport: any CloudTransport
  private let vault: @MainActor () -> [VaultItem]
  /// Image re-check (faces, OCR words) on the exact outgoing bytes; injectable for tests.
  private let recheck: @Sendable (Data) async throws -> (faces: Int, words: [OCRWord])
  private var deviceBusy = false

  init(ledger: Ledger, device: any DeviceModel, transport: any CloudTransport, vault: @escaping @MainActor () -> [VaultItem],
       recheck: (@Sendable (Data) async throws -> (faces: Int, words: [OCRWord]))? = nil) {
    self.ledger = ledger
    self.device = device
    self.transport = transport
    self.vault = vault
    self.recheck = recheck ?? { jpeg in
      guard let cg = ImagePipeline.decode(jpeg)?.master else { throw ParseError(message: "recheck: undecodable JPEG") }
      return (try await Tier0.faces(cg).count, try await Tier0.words(cg))
    }
  }

  private static func ms(since t: Date) -> Int { Int(Date().timeIntervalSince(t) * 1000) }

  /// S0/S1 on device ONLY, else `deterministic` (RULES_ONLY). Never touches the network.
  func onDevice<T: Generable & Sendable>(job: String, cls: PayloadClass, prompt: String, instructions: String? = nil,
                                         generating: T.Type, deterministic: () -> T) async -> GateResult<T> {
    let t0 = Date()
    let id = ledger.begin(job: job, cls: cls, engine: Strings.t("ui.hud.engine.fm"))
    guard cls == .S0 || cls == .S1 else {   // the class floor, in code: nothing else may use this door
      ledger.finish(id, route: .blocked, engine: "-", latencyMs: Self.ms(since: t0), status: "blocked", note: BlockReason.classMismatch.rawValue)
      return GateResult(value: nil, route: .blocked, latencyMs: Self.ms(since: t0), engine: "-", blocked: .classMismatch)
    }
    func rules(_ note: String) -> GateResult<T> {
      let v = deterministic()
      let lat = Self.ms(since: t0)
      ledger.finish(id, route: .rulesOnly, engine: Strings.t("ui.hud.engine.rules"), latencyMs: lat, status: "fallback", note: note)
      return GateResult(value: v, route: .rulesOnly, latencyMs: lat, engine: Strings.t("ui.hud.engine.rules"), note: note)
    }
    // Fresh availability check immediately before the call: no cache (invariant 3).
    let st = device.state()
    guard st == .available else { return rules("fm: \(st)") }
    if let n = await device.tokenCount((instructions ?? "") + "\n" + prompt), n >= Self.tokenBudget { return rules("fm: over \(Self.tokenBudget) tokens") }
    guard !deviceBusy else { return rules("fm: busy") }   // FM throws concurrentRequests: device jobs are serial
    deviceBusy = true
    defer { deviceBusy = false }
    do {
      let v = try await device.generate(prompt, instructions: instructions, as: T.self)
      let lat = Self.ms(since: t0)
      ledger.finish(id, route: .onDevice, engine: Strings.t("ui.hud.engine.fm"), latencyMs: lat, status: "done")
      return GateResult(value: v, route: .onDevice, latencyMs: lat, engine: Strings.t("ui.hud.engine.fm"))
    } catch {
      return rules("fm failed: \(type(of: error))")
    }
  }

  /// The pre-send checks, shown on the consent sheet before the user decides (they run again inside `cloud`).
  struct Precheck: Sendable { var metadataClean: Bool; var faces: Int; var vaultHits: Int; var failed: Bool }
  func precheck(_ jpeg: Data) async -> Precheck {
    let clean = ImagePipeline.metadataClean(jpeg)
    do {
      let r = try await recheck(jpeg)
      let hits = Tier0.vaultHits(r.words, VaultScan.termsOf(vault()))
      return Precheck(metadataClean: clean, faces: r.faces, vaultHits: hits.count, failed: false)
    } catch { return Precheck(metadataClean: clean, faces: 0, vaultHits: 0, failed: true) }
  }

  /// Non-template text in a cloud prompt (the web's stripStatic): what remains after removing the static segments.
  static func dynamicPieces(_ text: String, statics: [String]) -> [String] {
    var pieces = [text]
    for s in statics.sorted(by: { $0.count > $1.count }) where !s.isEmpty {
      pieces = pieces.flatMap { $0.contains(s) ? $0.components(separatedBy: s) : [$0] }
    }
    return pieces.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  /// Vault strings or pin coordinates in a text that would leave the device.
  func scanPrompt(_ text: String) -> BlockReason? {
    let v = vault()
    if Fuzzy.findInText(text, VaultScan.termsOf(v), Fuzzy.defaultThreshold) != nil { return .vaultTextInPrompt }
    if VaultScan.coordinatesNearPins(text, VaultScan.pinsOf(v)) != nil { return .pinInPrompt }
    return nil
  }

  /// S3 pass B on the consented, re-checked JPEG. `system`/`user` must be the bundled static advB.v1 template.
  /// `via`: Judge Mode's RecordedReplayTransport (a recorded answer, CACHED) in place of the configured transport. It
  /// passes exactly the same checks; nothing about the checks depends on which transport answers.
  func cloud(job: String, cls: PayloadClass, system: String, user: String, jpeg: Data, consent: ConsentToken?,
             via: (any CloudTransport)? = nil) async -> GateResult<CloudReply> {
    let t0 = Date()
    let transport = via ?? self.transport
    let id = ledger.begin(job: job, cls: cls, engine: transport.engine)
    func block(_ r: BlockReason) -> GateResult<CloudReply> {
      let lat = Self.ms(since: t0)
      ledger.finish(id, route: .blocked, engine: "-", latencyMs: lat, status: "blocked", note: r.rawValue)
      return GateResult(value: nil, route: .blocked, latencyMs: lat, engine: "-", blocked: r)
    }
    guard cls == .S3 else { return block(.classMismatch) }
    // The prompt is the static template, nothing else: any dynamic piece is a class mismatch, and is scanned too.
    let statics = [PromptLibrary.advBSystem, PromptLibrary.advBUser]
    let pieces = Self.dynamicPieces(system, statics: statics) + Self.dynamicPieces(user, statics: statics)
    for p in pieces { if let r = scanPrompt(p) { return block(r) } }
    guard pieces.isEmpty, !system.isEmpty, !user.isEmpty else { return block(.classMismatch) }
    guard let consent, consent.sha256 == ImagePipeline.sha256Hex(jpeg) else { return block(.noConsent) }
    guard ImagePipeline.metadataClean(jpeg) else { return block(.metadata) }
    let check: (faces: Int, words: [OCRWord])
    do { check = try await recheck(jpeg) } catch { return block(.checkFailed) }
    guard check.faces == 0 else { return block(.face) }
    guard Tier0.vaultHits(check.words, VaultScan.termsOf(vault())).isEmpty else { return block(.vaultTextInImage) }
    do {
      let reply = try await transport.passB(system: system, user: user, jpeg: jpeg)
      let lat = Self.ms(since: t0)
      // A simulated transport (Judge Mode's recorded replay, the DEBUG fake) sends nothing: CACHED, 0 bytes, 0 requests.
      let route: Route = transport.simulated ? .cached : .inCloud
      ledger.finish(id, route: route, engine: reply.engine, latencyMs: lat, status: reply.declined ? "refused" : "done",
                    bytes: transport.simulated ? 0 : jpeg.count)
      return GateResult(value: reply, route: route, latencyMs: lat, engine: reply.engine)
    } catch {
      let lat = Self.ms(since: t0)
      ledger.finish(id, route: .inCloud, engine: transport.engine, latencyMs: lat, status: "failed", note: "\(type(of: error))", bytes: jpeg.count)
      return GateResult(value: nil, route: .inCloud, latencyMs: lat, engine: transport.engine, note: "failed")
    }
  }
}
