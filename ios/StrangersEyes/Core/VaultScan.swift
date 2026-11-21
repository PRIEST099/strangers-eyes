// ios/StrangersEyes/Core/VaultScan.swift: port of the pure parts of web/src/ai/vaultScan.ts (ARCH §8.4): the vault's
// match terms, and the prompt scans the Egress Gate runs before any cloud call (VAULT_TEXT_IN_PROMPT, PIN_IN_PROMPT).
// LOCAL ONLY: a hit names the vault item locally; the Ledger only ever records the block reason, never the text.
import Foundation

enum VaultScan {
  static let pinRadiusM = 1000.0

  static func isGenericVaultString(_ s: String) -> Bool { Referee.isGenericLabel(s) }
  static func isGenericPinLabel(_ s: String) -> Bool {
    let n = Fuzzy.normalize(s)
    return n.isEmpty || Enums.genericPinLabels.contains(n)
  }

  /// Every item's label and aliases (digit kinds as digit terms). A pin with a generic label contributes nothing
  /// (D-36); any other generic string is dropped on its own (D-79); duplicates merged.
  static func termsOf(_ vault: [VaultItem]) -> [Fuzzy.Term] {
    var out: [Fuzzy.Term] = []
    var seen = Set<String>()
    for item in vault {
      if isPinKind(item.kind) && isGenericPinLabel(item.label) { continue }
      for s in [item.label] + item.aliases where !isGenericVaultString(s) {
        if seen.insert(item.id + "\u{0}" + s).inserted { out.append(Fuzzy.makeTerm(item.id, item.kind, s)) }
      }
    }
    return out
  }

  struct PinRef { var vaultId: String; var kind: String; var lat: Double; var lng: Double }
  static func pinsOf(_ vault: [VaultItem]) -> [PinRef] {
    vault.compactMap { v in
      guard isPinKind(v.kind), let p = v.pin, p.lat.isFinite, p.lng.isFinite else { return nil }
      return PinRef(vaultId: v.id, kind: v.kind, lat: p.lat, lng: p.lng)
    }
  }

  private static let coordRe = try! NSRegularExpression(pattern: "-?\\d{1,3}\\.\\d{3,}")
  /// Decimal numbers with ≥3 decimals; adjacent pairs tried as (lat, lng) and (lng, lat); the vaultId of a pin within
  /// `radiusM`, or nil.
  static func coordinatesNearPins(_ text: String, _ pins: [PinRef], radiusM: Double = pinRadiusM) -> String? {
    guard !pins.isEmpty else { return nil }
    let ns = text as NSString
    let nums = coordRe.matches(in: text, range: NSRange(location: 0, length: ns.length)).compactMap { Double(ns.substring(with: $0.range)) }
    func near(_ lat: Double, _ lng: Double) -> PinRef? {
      guard abs(lat) <= 90, abs(lng) <= 180 else { return nil }
      return pins.first { Geo.haversineMeters(lat, lng, $0.lat, $0.lng) <= radiusM }
    }
    if nums.count >= 2 {
      for i in 0..<(nums.count - 1) {
        if let p = near(nums[i], nums[i + 1]) ?? near(nums[i + 1], nums[i]) { return p.vaultId }
      }
    }
    return nil
  }
}
