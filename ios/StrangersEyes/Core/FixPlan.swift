// ios/StrangersEyes/Core/FixPlan.swift: port of web/src/core/fixPlan.ts deterministicFix, the RULES-ONLY fix plan
// (SPEC §10.4, SCR-11; ARCH §12.5; D-35, D-51, D-89). Pure code over pass B's validated JSON (invariant 8) and the
// verdict built from it; no model call. Solid fills only (invariant 6). The explanation is a template with generic
// phrases: never a vault label, never "safe". LOCAL ONLY.
import Foundation

struct FixMaskItem: Equatable, Sendable { var clueId: String; var type: String; var box: PxRect }

struct RulesFix: Equatable, Sendable {
  var maskClueIds: [String]
  var masks: [FixMaskItem]
  var crop: PxRect?
  var cropSide: String
  var explanation: String
  var expectedResidual: String
  var unremovable: Bool
  var cropTooMuch: Bool
}

enum FixPlanner {
  static let residualOrder = ["street", "neighbourhood", "district", "city", "region", "country"]
  private static func residualOf(_ r: String) -> String { r == "venue_or_organisation" ? "street" : r }

  static func expectedResidual(_ clues: [AdversaryClue], removed: Set<String>) -> String {
    var best = residualOrder.count - 1
    for c in clues where !removed.contains(c.id) {
      if let i = residualOrder.firstIndex(of: residualOf(c.reveals)), i < best { best = i }
    }
    return residualOrder[best]
  }

  struct Target { var vaultId: String; var strong: Bool; var clueIds: [String] }

  static func targets(_ v: Verdict, _ hypotheses: [AdversaryHypothesis]) -> [Target] {
    var out = v.matches.map { Target(vaultId: $0.vaultId, strong: $0.strength != "possible", clueIds: $0.clueIds) }
    for p in v.pinBands {
      guard let hid = p.hypothesisId, Geo.bandRank(p.band) <= Geo.bandRank("district") else { continue }
      if let h = hypotheses.first(where: { $0.id == hid }) { out.append(Target(vaultId: p.vaultId, strong: true, clueIds: h.clueIds)) }
    }
    return out
  }

  static func explanation(_ n: Int, _ kinds: [String]) -> String {
    var seen = Set<String>()
    let phrases = kinds.map { Enums.kindPhrase[$0] ?? Enums.kindPhrase["other_text"] ?? "" }.filter { seen.insert($0).inserted }
    if n == 0 { return Strings.t("ui.fix.explainNone") }
    return phrases.isEmpty ? Strings.t("ui.fix.explainGeneric", ["n": String(n)])
      : Strings.t("ui.fix.explain", ["n": String(n), "phrases": phrases.joined(separator: ", ")])
  }

  /// SPEC §10.4 deterministicFix over the image AS SENT (`frame`) mapped onto the W×H master.
  static func deterministicFix(adv: AdversaryResult, frame: ImageFrame, verdict: Verdict, vault: [VaultItem],
                               width W: Double, height H: Double, padRatio: Double = Boxes.defaultPadRatio) -> RulesFix {
    let byId = Dictionary(adv.clues.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let ts = targets(verdict, adv.hypotheses)
    let cited = Set(ts.flatMap(\.clueIds).filter { byId[$0] != nil })
    let maskIds = !ts.isEmpty
      ? adv.clues.filter { $0.removable && cited.contains($0.id) }.map(\.id)
      : adv.clues.filter { $0.removable && $0.severity == "high" }.map(\.id)
    var masks: [FixMaskItem] = []
    for id in maskIds {
      if let c = byId[id], let b = Boxes.box2dToMaster(c.box2d, frame) { masks.append(FixMaskItem(clueId: id, type: c.type, box: Boxes.padRect(b, W, H, padRatio))) }
    }
    var cropIds: [String] = []
    for t in ts {
      let own = t.clueIds.compactMap { byId[$0] }
      if t.strong && !own.isEmpty && own.allSatisfy({ !$0.removable }) { for c in own where !cropIds.contains(c.id) { cropIds.append(c.id) } }
    }
    let cropBoxes = cropIds.compactMap { id in byId[id].flatMap { Boxes.box2dToMaster($0.box2d, frame) }.map { Boxes.padRect($0, W, H, padRatio) } }
    var crop: PxRect?
    var side = "none"
    var tooMuch = false
    if !cropBoxes.isEmpty {
      switch Boxes.bestCrop(cropBoxes, W, H) {
      case let .ok(s, _, rect): crop = rect; side = s
      case let .fail(reason): tooMuch = reason == "too_much"
      }
    }
    let unremovable = cited.contains { byId[$0]?.removable == false }
    var applied = Set(masks.map(\.clueId))
    if let crop {
      for c in adv.clues { if let b = Boxes.box2dToMaster(c.box2d, frame), Boxes.area(Boxes.intersect(b, crop)) == 0 { applied.insert(c.id) } }
    }
    var seenV = Set<String>()
    let kinds = ts.map(\.vaultId).filter { seenV.insert($0).inserted }.compactMap { id in vault.first { $0.id == id }?.kind }
    return RulesFix(maskClueIds: masks.map(\.clueId), masks: masks, crop: crop, cropSide: side,
                    explanation: explanation(masks.count, kinds), expectedResidual: expectedResidual(adv.clues, removed: applied),
                    unremovable: unremovable, cropTooMuch: tooMuch)
  }
}
