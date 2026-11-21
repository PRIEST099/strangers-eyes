// ios/StrangersEyes/Core/AdvBParser.swift: port of web/src/ai/parse.ts parseAdvB (ARCH §10.6, API-NOTES §6.8).
// Validates pass-B JSON: a wrong required field or enum value throws; duplicate ids, dangling clue_ids, bad boxes,
// out-of-range lat/lng, radius < 0.1 and over-long arrays are repaired. Only this ungrounded JSON feeds code (inv. 8).
import Foundation

struct ParseError: Error, Equatable { var message: String }

enum AdvBParser {
  static let limits = (clues: 12, hypotheses: 3, inferences: 8)
  static let minRadiusKm = 0.1
  static let statuses = ["ok", "no_location_signal", "declined"]

  private typealias Obj = [String: Any]

  private static func obj(_ v: Any?, _ p: String) throws -> Obj {
    guard let o = v as? Obj else { throw ParseError(message: "\(p): expected an object") }
    return o
  }
  private static func str(_ o: Obj, _ k: String, _ p: String) throws -> String {
    guard let v = o[k] as? String else { throw ParseError(message: "\(p).\(k): expected a string") }
    return v
  }
  private static func num(_ o: Obj, _ k: String, _ p: String) throws -> Double {
    guard let n = o[k] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { throw ParseError(message: "\(p).\(k): expected a finite number") }
    return n.doubleValue
  }
  private static func bool(_ o: Obj, _ k: String, _ p: String) throws -> Bool {
    guard let n = o[k] as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { throw ParseError(message: "\(p).\(k): expected a boolean") }
    return n.boolValue
  }
  private static func oneOf(_ o: Obj, _ k: String, _ allowed: [String], _ p: String) throws -> String {
    let v = try str(o, k, p)
    guard allowed.contains(v) else { throw ParseError(message: "\(p).\(k): not an allowed value") }
    return v
  }
  private static func arr(_ o: Obj, _ k: String, _ p: String) throws -> [Any] {
    guard let v = o[k] as? [Any] else { throw ParseError(message: "\(p).\(k): expected an array") }
    return v
  }
  private static func strArr(_ o: Obj, _ k: String, _ p: String) throws -> [String] {
    try arr(o, k, p).map { guard let s = $0 as? String else { throw ParseError(message: "\(p).\(k): expected strings") }; return s }
  }

  static func normaliseBox2d(_ raw: Any?, _ p: String) throws -> Box2D? {
    guard let a = raw as? [Any], a.count == 4 else { throw ParseError(message: "\(p): box_2d must have 4 numbers") }
    let v: [Double] = try a.map {
      guard let n = $0 as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { throw ParseError(message: "\(p): expected finite numbers") }
      return max(0, min(1000, n.doubleValue)).rounded(.toNearestOrAwayFromZero)
    }
    let box = [min(v[0], v[2]), min(v[1], v[3]), max(v[0], v[2]), max(v[1], v[3])]
    return box[2] > box[0] && box[3] > box[1] ? box : nil
  }

  static func parse(data: Data) throws -> AdversaryResult {
    guard let raw = try? JSONSerialization.jsonObject(with: data) else { throw ParseError(message: "pass B: not JSON") }
    return try parse(raw)
  }

  static func parse(_ raw: Any) throws -> AdversaryResult {
    let root = try obj(raw, "$")
    var repairs: [String] = []
    let status = try oneOf(root, "audit_status", statuses, "$")
    let scene = try str(root, "scene_summary", "$")
    let rawClues = try arr(root, "clues", "$"), rawHyps = try arr(root, "hypotheses", "$"), rawInfs = try arr(root, "inferences", "$")
    let reveals = Enums.levels + ["venue_or_organisation"]

    var clues: [AdversaryClue] = []
    var seen = Set<String>()
    for (i, v) in rawClues.enumerated() {
      let p = "$.clues[\(i)]"
      let o = try obj(v, p)
      let id = try str(o, "id", p)
      let type = try oneOf(o, "type", Enums.clueTypes, p)
      let ev = try str(o, "evidence", p)
      let rv = try oneOf(o, "reveals", reveals, p)
      let sev = try oneOf(o, "severity", Enums.conf, p)
      let rem = try bool(o, "removable", p)
      guard let box = try normaliseBox2d(o["box_2d"], "\(p).box_2d") else { repairs.append("clue \(id): zero-area box dropped"); continue }
      guard seen.insert(id).inserted else { repairs.append("clue \(id): duplicate id dropped"); continue }
      clues.append(AdversaryClue(id: id, type: type, box2d: box, evidence: ev, reveals: rv, severity: sev, removable: rem))
    }
    if clues.count > limits.clues { clues = Array(clues.prefix(limits.clues)); repairs.append("clues capped") }
    let clueIds = Set(clues.map(\.id))
    func keepKnown(_ ids: [String]) -> [String] { var s = Set<String>(); return ids.filter { clueIds.contains($0) && s.insert($0).inserted } }

    var hyps: [AdversaryHypothesis] = []
    seen = []
    for (i, v) in rawHyps.enumerated() {
      let p = "$.hypotheses[\(i)]"
      let o = try obj(v, p)
      var h = AdversaryHypothesis(id: try str(o, "id", p), label: try str(o, "label", p), level: try oneOf(o, "level", Enums.levels, p),
                                  lat: try num(o, "lat", p), lng: try num(o, "lng", p), radiusKm: try num(o, "radius_km", p),
                                  confidence: try oneOf(o, "confidence", Enums.conf, p), clueIds: try strArr(o, "clue_ids", p))
      if abs(h.lat) > 90 || abs(h.lng) > 180 { repairs.append("hypothesis \(h.id): lat/lng out of range, dropped"); continue }
      if h.radiusKm < minRadiusKm { h.radiusKm = minRadiusKm }
      guard seen.insert(h.id).inserted else { continue }
      hyps.append(h)
    }
    hyps = Array(hyps.prefix(limits.hypotheses)).map { var h = $0; h.clueIds = keepKnown(h.clueIds); return h }

    var infs: [Inference] = []
    seen = []
    for (i, v) in rawInfs.enumerated() {
      let p = "$.inferences[\(i)]"
      let o = try obj(v, p)
      let x = Inference(id: try str(o, "id", p), kind: try oneOf(o, "kind", Enums.inferenceKinds, p), value: try str(o, "value", p),
                        confidence: try oneOf(o, "confidence", Enums.conf, p), clueIds: try strArr(o, "clue_ids", p))
      guard seen.insert(x.id).inserted else { continue }
      infs.append(x)
    }
    infs = Array(infs.prefix(limits.inferences)).map { var x = $0; x.clueIds = keepKnown(x.clueIds); return x }

    if status != "ok" { return AdversaryResult(status: status, sceneSummary: scene, repairs: repairs) }
    return AdversaryResult(status: status, sceneSummary: scene, clues: clues, hypotheses: hyps, inferences: infs, repairs: repairs)
  }
}
