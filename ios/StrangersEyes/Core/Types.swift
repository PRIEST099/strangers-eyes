// ios/StrangersEyes/Core/Types.swift: Swift mirrors of web/src/core/types.ts (ARCH §6, §19.4) and the word lists of
// shared/prompts/enums.v1.json (bundled as the `prompts` folder resource, so iOS and web read ONE file).
// Kinds, levels and strengths stay plain strings, as in the JSON the prompts, fixtures and test vectors use; code
// validates them against the enums wherever untrusted data (pass B, the on-device model) enters.
// LOCAL ONLY: vault items flow through these types; nothing here logs, persists or sends.
import Foundation

/// shared/prompts/enums.v1.json, loaded once from the app bundle.
enum Enums {
  nonisolated(unsafe) static let raw: [String: Any] = {
    guard let url = Bundle.main.url(forResource: "enums.v1", withExtension: "json", subdirectory: "prompts"),
          let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      preconditionFailure("enums.v1.json is missing from the bundle (project.yml prompts folder resource)")
    }
    return obj
  }()

  private static func list(_ k: String) -> [String] { raw[k] as? [String] ?? [] }
  private static func map(_ k: String) -> [String: String] { raw[k] as? [String: String] ?? [:] }

  static let clueTypes = list("CLUE_TYPES")
  static let inferenceKinds = list("INFERENCE_KINDS")
  static let conf = list("CONF")
  static let levels = list("LEVELS")
  static let strengths = list("STRENGTHS")
  static let vaultKinds = list("VAULT_KINDS")
  static let pinKinds = list("PIN_KINDS")
  static let digitKinds = list("DIGIT_KINDS")
  static let genericWords = Set(list("GENERIC_WORDS"))
  static let genericPinLabels = Set(list("GENERIC_PIN_LABELS"))
  static let artefactTerms = list("ARTEFACT_TERMS")
  static let synonymClasses: [[String]] = raw["SYNONYM_CLASSES"] as? [[String]] ?? []
  static let wordFolds = map("WORD_FOLDS")
  static let kindDisplay = map("KIND_DISPLAY")
  static let kindPhrase = map("KIND_PHRASE")
  static let promptKindOf = map("PROMPT_KIND_OF")
  static let kindCompat: [String: [String]] = raw["KIND_COMPAT"] as? [String: [String]] ?? [:]
}

// ---------- vault ----------
struct Pin: Codable, Equatable, Sendable {
  var lat: Double
  var lng: Double
}

/// One vault item (SPEC §17). LOCAL ONLY: never logged, never sent, never in the Ledger.
struct VaultItem: Codable, Equatable, Identifiable, Sendable {
  var id: String
  var kind: String
  var label: String
  var aliases: [String] = []
  var pin: Pin?
}

func isPinKind(_ k: String) -> Bool { Enums.pinKinds.contains(k) }

// ---------- pass B ----------
/// box_2d [ymin, xmin, ymax, xmax], 0..1000 of the image AS SENT.
typealias Box2D = [Double]

struct AdversaryClue: Equatable, Sendable {
  var id: String
  var type: String
  var box2d: Box2D
  var evidence: String
  var reveals: String
  var severity: String
  var removable: Bool
}

struct AdversaryHypothesis: Equatable, Sendable {
  var id: String
  var label: String
  var level: String
  var lat: Double
  var lng: Double
  var radiusKm: Double
  var confidence: String
  var clueIds: [String]
}

struct Inference: Equatable, Sendable {
  var id: String
  var kind: String
  var value: String
  var confidence: String
  var clueIds: [String]
}

/// Validated pass B (web ParsedAdvB). Only this ungrounded JSON feeds code (invariant 8).
struct AdversaryResult: Equatable, Sendable {
  var status: String          // ok | no_location_signal | declined
  var sceneSummary: String = ""
  var clues: [AdversaryClue] = []
  var hypotheses: [AdversaryHypothesis] = []
  var inferences: [Inference] = []
  var repairs: [String] = []
}

// ---------- routing ----------
enum PayloadClass: String, Codable, Sendable { case S0, S1, S2, S3, S4 }

enum Route: String, Codable, Sendable {
  case onDevice = "ON_DEVICE", inCloud = "IN_CLOUD", rulesOnly = "RULES_ONLY", cached = "CACHED", blocked = "BLOCKED", queued = "QUEUED"
}

// ---------- referee ----------
struct RefereeMatch: Codable, Equatable, Sendable {
  var claimId: String
  var vaultId: String
  var strength: String
  var reason: String
  var clueIds: [String]
  var route: String
}

// ---------- geometry ----------
struct PxRect: Codable, Equatable, Sendable {
  var x: Double
  var y: Double
  var w: Double
  var h: Double
  var cg: CGRect { CGRect(x: x, y: y, width: w, height: h) }
}

/// A derived image (the cloud copy) and where it sits in the master (web ImageFrame).
struct ImageFrame: Equatable, Sendable {
  var width: Double
  var height: Double
  var cropInMaster: PxRect
}
