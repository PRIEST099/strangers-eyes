// ios/StrangersEyesTests/VectorSupport.swift: load shared/testvectors/*.json (the same files Vitest runs; AC-168) and
// turn their JSON objects into the Swift core types.
import XCTest
@testable import StrangersEyes

enum Vectors {
  static func load(_ name: String) throws -> [String: Any] {
    let bundle = Bundle(for: BundleToken.self)
    let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json", subdirectory: "testvectors"), "\(name).json not bundled")
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
  }
  static func cases(_ v: [String: Any], _ fn: String) -> [[String: Any]] {
    (v["cases"] as? [[String: Any]] ?? []).filter { $0["fn"] as? String == fn }
  }
  private final class BundleToken {}
}

/// A JSON number, or "NaN" / "Infinity" / "-Infinity" (bands.json convention).
func dbl(_ v: Any?) -> Double {
  if let n = v as? NSNumber { return n.doubleValue }
  switch v as? String {
  case "NaN": return .nan
  case "Infinity": return .infinity
  case "-Infinity": return -.infinity
  default: return .nan
  }
}

func strs(_ v: Any?) -> [String] { v as? [String] ?? [] }

func vaultItem(_ o: [String: Any]) -> VaultItem {
  var pin: Pin?
  if let p = o["pin"] as? [String: Any] { pin = Pin(lat: dbl(p["lat"]), lng: dbl(p["lng"])) }
  return VaultItem(id: o["id"] as? String ?? "", kind: o["kind"] as? String ?? "", label: o["label"] as? String ?? "",
                   aliases: strs(o["aliases"]), pin: pin)
}

func hypothesis(_ o: [String: Any]) -> AdversaryHypothesis {
  AdversaryHypothesis(id: o["id"] as? String ?? "", label: o["label"] as? String ?? "", level: o["level"] as? String ?? "",
                      lat: dbl(o["lat"]), lng: dbl(o["lng"]), radiusKm: dbl(o["radiusKm"]),
                      confidence: o["confidence"] as? String ?? "", clueIds: strs(o["clueIds"]))
}

func inference(_ o: [String: Any]) -> Inference {
  Inference(id: o["id"] as? String ?? "", kind: o["kind"] as? String ?? "", value: o["value"] as? String ?? "",
            confidence: o["confidence"] as? String ?? "", clueIds: strs(o["clueIds"]))
}

func match(_ o: [String: Any]) -> RefereeMatch {
  RefereeMatch(claimId: o["claimId"] as? String ?? "", vaultId: o["vaultId"] as? String ?? "", strength: o["strength"] as? String ?? "",
               reason: o["reason"] as? String ?? "", clueIds: strs(o["clueIds"]), route: o["route"] as? String ?? "")
}

func matchJSON(_ m: RefereeMatch) -> [String: Any] {
  ["claimId": m.claimId, "vaultId": m.vaultId, "strength": m.strength, "reason": m.reason, "clueIds": m.clueIds, "route": m.route]
}

/// Deep JSON equality (NSNumber 1 == 1.0; NSNull for null).
func jsonEqual(_ a: Any?, _ b: Any?) -> Bool {
  let na: Any = a ?? NSNull(), nb: Any = b ?? NSNull()
  return (na as AnyObject).isEqual(nb as AnyObject)
}

func jsonString(_ a: Any?) -> String {
  guard let a, JSONSerialization.isValidJSONObject(["x": a]),
        let d = try? JSONSerialization.data(withJSONObject: ["x": a], options: [.sortedKeys]) else { return String(describing: a) }
  return String(decoding: d, as: UTF8.self)
}
