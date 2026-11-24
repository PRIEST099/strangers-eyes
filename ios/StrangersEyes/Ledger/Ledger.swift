// ios/StrangersEyes/Ledger/Ledger.swift: the in-memory Cloud Ledger and the Router HUD's data (T-124; SPEC §14.6;
// ARCH §19.3: memory only on iOS). One entry per AI call (pending → done / fallback / blocked), with where it ran
// (ON_DEVICE / IN_CLOUD / RULES_ONLY / BLOCKED), the engine and the latency. Entries never hold vault text, prompts,
// coordinates or pixels: only job names, classes, routes, sizes and the faces / vault-items-sent counters (AC-045).
import Foundation
import Observation

struct LedgerEntry: Identifiable, Sendable {
  let id = UUID()
  let job: String
  let cls: PayloadClass
  var route: Route?
  var engine: String
  var latencyMs: Int?
  var status: String          // pending | done | fallback | blocked | refused
  var note: String?
  var bytes = 0
  var facesSent = 0
  var vaultItemsSent = 0
  let at = Date()
}

@MainActor @Observable
final class Ledger {
  private(set) var entries: [LedgerEntry] = []

  var facesSent: Int { entries.reduce(0) { $0 + $1.facesSent } }
  var vaultItemsSent: Int { entries.reduce(0) { $0 + $1.vaultItemsSent } }
  var cloudRequests: Int { entries.filter { $0.route == .inCloud }.count }
  /// Bytes actually sent to the cloud (a CACHED replay sends none).
  var cloudBytes: Int { entries.filter { $0.route == .inCloud }.reduce(0) { $0 + $1.bytes } }
  var onDeviceCalls: Int { entries.filter { $0.route == .onDevice }.count }
  var rulesCalls: Int { entries.filter { $0.route == .rulesOnly }.count }
  var blocked: Int { entries.filter { $0.route == .blocked }.count }

  @discardableResult
  func begin(job: String, cls: PayloadClass, engine: String) -> UUID {
    let e = LedgerEntry(job: job, cls: cls, route: nil, engine: engine, latencyMs: nil, status: "pending")
    entries.insert(e, at: 0)
    return e.id
  }

  func finish(_ id: UUID, route: Route, engine: String, latencyMs: Int, status: String, note: String? = nil, bytes: Int = 0) {
    guard let i = entries.firstIndex(where: { $0.id == id }) else { return }
    entries[i].route = route
    entries[i].engine = engine
    entries[i].latencyMs = latencyMs
    entries[i].status = status
    entries[i].note = note
    entries[i].bytes = bytes
    // The gate only finishes an IN_CLOUD entry after proving 0 faces and 0 vault hits on the exact bytes sent.
    entries[i].facesSent = 0
    entries[i].vaultItemsSent = 0
  }

  func clear() { entries = [] }
}
