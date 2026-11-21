// ios/StrangersEyes/Core/Geo.swift: port of web/src/core/geo.ts. Distances are code, never the LLM (invariant 5;
// SPEC §10.1, D-10, D-77). Only band words ever reach the UI: never metres, never a map pin or an address for the
// attacker's guess (SR-07). Parity: shared/testvectors/bands.json (GeoTests).
import Foundation

struct BandThresholds: Equatable, Sendable {
  var street: Double, neighbourhood: Double, district: Double, city: Double, country: Double
}

struct PinBand: Equatable, Sendable {
  var vaultId: String
  var band: String
  var hypothesisId: String?
  var confidence: String?
  var effectiveKm: Double?
}

enum Geo {
  static let defaultBands = BandThresholds(street: 250, neighbourhood: 1000, district: 5000, city: 30000, country: 500_000)
  static let earthRadiusM = 6_371_008.8
  private static func rad(_ d: Double) -> Double { d * .pi / 180 }

  static func haversineMeters(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
    let a = pow(sin(rad(lat2 - lat1) / 2), 2) + cos(rad(lat1)) * cos(rad(lat2)) * pow(sin(rad(lng2 - lng1) / 2), 2)
    if a.isNaN { return .nan }   // JS Math.min(1, NaN) is NaN; Swift's min would return 1
    return 2 * earthRadiusM * asin(min(1, a.squareRoot()))
  }

  /// Upper bounds inclusive. NaN, ±Infinity and negatives → none.
  static func bandFor(_ m: Double, _ t: BandThresholds = defaultBands) -> String {
    guard m.isFinite, m >= 0 else { return "none" }
    return m <= t.street ? "street" : m <= t.neighbourhood ? "neighbourhood" : m <= t.district ? "district"
      : m <= t.city ? "city" : m <= t.country ? "country" : "none"
  }

  /// RC bands_m → thresholds: five finite, positive, strictly increasing numbers, with street/neighbourhood/district
  /// locked to 250/1000/5000 (D-77); anything else → defaults.
  static func thresholdsOrDefault(_ raw: Any?) -> BandThresholds {
    guard let o = raw as? [String: Any] else { return defaultBands }
    var prev = 0.0
    var vals: [Double] = []
    for k in ["street", "neighbourhood", "district", "city", "country"] {
      guard let n = o[k] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return defaultBands }
      let v = n.doubleValue
      guard v.isFinite, v > prev else { return defaultBands }
      prev = v
      vals.append(v)
    }
    guard vals[0] == 250, vals[1] == 1000, vals[2] == 5000 else { return defaultBands }
    return BandThresholds(street: vals[0], neighbourhood: vals[1], district: vals[2], city: vals[3], country: vals[4])
  }

  /// e = max(haversine(hypothesis centre, pin), radius).
  static func effectiveMeters(_ h: AdversaryHypothesis, _ p: Pin) -> Double {
    let d = haversineMeters(h.lat, h.lng, p.lat, p.lng), r = h.radiusKm * 1000
    return d.isNaN || r.isNaN ? .nan : max(d, r)   // JS Math.max propagates NaN; Swift's max does not
  }

  static let bandOrder = ["street", "neighbourhood", "district", "city", "country", "none"]
  static func bandRank(_ b: String) -> Int { bandOrder.firstIndex(of: b) ?? -1 }

  /// The closest band over all hypotheses (smallest e; ties keep the earlier; non-finite e skipped).
  static func pinBand(_ vaultId: String, _ pin: Pin, _ hs: [AdversaryHypothesis], _ t: BandThresholds = defaultBands) -> PinBand {
    var best = PinBand(vaultId: vaultId, band: "none", hypothesisId: nil, confidence: nil, effectiveKm: nil)
    for h in hs {
      let m = effectiveMeters(h, pin)
      guard m.isFinite else { continue }
      if best.effectiveKm == nil || m / 1000 < best.effectiveKm! {
        best = PinBand(vaultId: vaultId, band: bandFor(m, t), hypothesisId: h.id, confidence: h.confidence, effectiveKm: m / 1000)
      }
    }
    return best
  }

  static let bandWordIds: [String: String] = [
    "street": "ui.band.street", "neighbourhood": "ui.band.neighbourhood", "district": "ui.band.district",
    "city": "ui.band.city", "country": "ui.band.country", "none": "ui.band.none",
  ]
  static func bandWords(_ band: String) -> String { Strings.t(bandWordIds[band] ?? "ui.band.none") }
}
