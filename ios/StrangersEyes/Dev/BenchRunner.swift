#if DEBUG
// ios/StrangersEyes/Dev/BenchRunner.swift: DEBUG-ONLY harness for the pre-registered iOS parity measurement (D-184;
// PRIV bench/PROTOCOL.md "iOS parity"; run by scripts/measure-ios-parity.mjs). Compiled out of Release by line 1.
// Selected only with the launch argument -iosBench plus the environment IOS_BENCH_MANIFEST=<path to a JSON array of
// {id, path, home: {lat, lng}, work: {lat, lng}}> (a temporary file the script writes from PRIV and deletes).
// Each photo runs ONCE, in order, through the app's own AppModel flow with a made-up in-memory vault (never written,
// never printed): import → Tier-0 → on-device pre-screen → gate precheck → live attack → referee → verdict → if the rules
// fix has anything to mask or crop: apply → gate precheck → live re-attack → compare. Never retried; never a re-attack
// after a decline or block (invariant 7). One "IOSBENCH {json}" line per photo on stdout: bands, levels, routes and
// latencies only (never a coordinate, a vault label or attacker text), then "IOSBENCH-DONE".
import Foundation

extension DevFlags {
  static var iosBench: Bool { ProcessInfo.processInfo.arguments.contains("-iosBench") }
}

@MainActor
enum BenchRunner {
  private struct Item: Decodable { var id: String; var path: String; var home: Pin; var work: Pin }

  static func runIfRequested(_ model: AppModel) async {
    guard DevFlags.iosBench else { return }
    guard let p = ProcessInfo.processInfo.environment["IOS_BENCH_MANIFEST"], let d = FileManager.default.contents(atPath: p),
          let items = try? JSONDecoder().decode([Item].self, from: d) else { emit(["error": "manifest unreadable"]); emitDone(); return }
    for it in items { emit(await runOne(model, it)) }
    model.benchVault = nil
    model.reset()
    emitDone()
  }

  private static func runOne(_ model: AppModel, _ it: Item) async -> [String: Any] {
    var out: [String: Any] = ["id": it.id]
    model.benchVault = [
      VaultItem(id: "bench-home", kind: "home_pin", label: "Home", pin: it.home),
      VaultItem(id: "bench-work", kind: "work_pin", label: "Work", pin: it.work),
      VaultItem(id: "bench-child", kind: "child_name", label: "Lucas"),
    ]
    model.ledger.clear()
    guard let data = FileManager.default.contents(atPath: it.path) else { out["error"] = "photo unreadable"; return out }
    let t0 = Date()
    await model.importPhoto(data)
    guard model.stage == .prescreened else { out["error"] = "import: \(stageName(model.stage))"; return out }
    out["tier0Masks"] = model.masks.count
    if let pre = model.prescreen { out["prescreen"] = ["route": pre.route.rawValue, "ms": pre.latencyMs, "findings": pre.findings.count, "nothingToRead": pre.note == PrescreenJob.nothingToRead] }
    // ---- first attack ----
    await model.prepareConsent()
    guard model.stage == .consent, model.sendAllowed else { out["error"] = "consent: \(stageName(model.stage)) allowed=\(model.sendAllowed)"; return out }
    await model.sendConsented()
    out["attack"] = cloudCall(model, index: 0)
    if model.stage == .refused { out["first"] = ["refused": true]; out["totalS"] = secs(t0); return out }
    guard model.stage == .verdict, let first = model.first else { out["error"] = "attack: \(stageName(model.stage))"; return out }
    out["first"] = roundSummary(first)
    // ---- the app's rules fix, once ----
    model.planFix()
    guard let fix = model.fix else { out["fixOffered"] = false; out["totalS"] = secs(t0); return out }
    let offered = !fix.masks.isEmpty || fix.cropSide != "none"
    out["fixOffered"] = offered
    out["fix"] = ["masks": fix.masks.count, "cropSide": fix.cropSide]
    guard offered else { out["totalS"] = secs(t0); return out }
    await model.applyFixAndPrepareReattack()
    guard model.stage == .reattackConsent, model.sendAllowed else { out["error"] = "reattack consent: \(stageName(model.stage)) allowed=\(model.sendAllowed)"; return out }
    await model.sendConsented()
    out["reattack"] = cloudCall(model, index: 0)
    if model.stage == .refused { out["second"] = ["refused": true]; out["totalS"] = secs(t0); return out }
    guard model.stage == .compared, let second = model.second, let cmp = model.comparison else { out["error"] = "reattack: \(stageName(model.stage))"; return out }
    out["second"] = roundSummary(second)
    out["headline"] = cmp.riskReduced ? "Risk reduced" : "Still exposed"
    out["totalS"] = secs(t0)
    return out
  }

  /// The newest IN_CLOUD (or BLOCKED) Ledger entry: route, status and latency (the Ledger is newest first).
  private static func cloudCall(_ model: AppModel, index: Int) -> [String: Any] {
    let calls = model.ledger.entries.filter { $0.cls == .S3 }
    guard calls.indices.contains(index) else { return ["route": "none"] }
    let e = calls[index]
    return ["route": e.route?.rawValue ?? "pending", "status": e.status, "ms": e.latencyMs ?? -1, "engine": e.engine]
  }

  /// Bands and levels only: the Home pin's code band, whether a Home line is shown (and its band), the referee's route.
  private static func roundSummary(_ r: Round) -> [String: Any] {
    let pb = r.verdict.pinBands.first { $0.vaultId == "bench-home" }
    let shown = r.verdict.lines.first { $0.vaultId == "bench-home" && $0.band != nil }
    return [
      "level": r.verdict.level,
      "homeBand": pb?.band ?? "none",
      "homeBandConfidence": pb?.confidence ?? "-",
      "homeLineShown": shown?.band ?? "not shown",
      "workBand": r.verdict.pinBands.first { $0.vaultId == "bench-work" }?.band ?? "none",
      "referee": ["route": r.referee.route.rawValue, "ms": r.referee.latencyMs, "matches": r.referee.matches.count],
      "hypotheses": r.adv.hypotheses.count,
    ]
  }

  private static func stageName(_ s: AppModel.Stage) -> String { String(describing: s).replacingOccurrences(of: "\n", with: " ") }
  private static func secs(_ t0: Date) -> Double { (Date().timeIntervalSince(t0) * 10).rounded() / 10 }

  private static func emit(_ o: [String: Any]) {
    guard let d = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]) else { return }
    print("IOSBENCH " + String(decoding: d, as: UTF8.self))
    fflush(stdout)
  }

  private static func emitDone() { print("IOSBENCH-DONE"); fflush(stdout) }
}
#endif
