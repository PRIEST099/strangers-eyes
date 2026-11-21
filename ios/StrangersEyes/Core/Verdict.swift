// ios/StrangersEyes/Core/Verdict.swift: port of web/src/core/verdict.ts, the verdict engine (SPEC §10.1, §10.2, §10.5,
// §10.6; ARCH §12.3, §12.4; D-115, D-116, D-127, D-128). Deterministic and pure; parity: shared/testvectors/verdict.json.
// The view model carries copy IDs, band words and enums only: never a coordinate, a radius or a measured distance
// (SR-07, AC-146). GREEN is never a level: "Risk reduced" is only the compare header. Never says "safe".
import Foundation

struct VerdictAdv: Sendable {
  var status: String
  var hypotheses: [AdversaryHypothesis]
  var inferences: [Inference]
}

struct CaughtItem: Sendable { var vaultId: String; var route: String }
struct PrescreenFlags: Sendable { var types: [String]; var route: String }

struct VerdictInput: Sendable {
  var adv: VerdictAdv?
  var matches: [RefereeMatch]
  var vault: [VaultItem]
  var caught: [CaughtItem] = []
  var echoedVaultIds: [String] = []
  var prescreenFlags: PrescreenFlags?
  /// RC bands_m, already validated with Geo.thresholdsOrDefault (D-77); nil → defaults.
  var bands: BandThresholds? = nil
  var refused = false
  var phase = "initial"
}

struct VerdictLine: Equatable, Sendable {
  var id: String
  var kind: String
  var severity: String
  var copyId: String
  var params: [String: String]
  var vaultId: String?
  var band: String?
  var strength: String?
  var confidence: String?
  var bandConfidence: String?
  var reason: String?
  var clueIds: [String]
  var route: String
}

struct BestGuess: Equatable, Sendable { var level: String; var label: String; var confidence: String }

struct Verdict: Equatable, Sendable {
  var phase: String
  var level: String
  var lines: [VerdictLine]
  var notLinkedVaultIds: [String]
  var bestGuess: BestGuess?
  var pinBands: [PinBand]
  var matches: [RefereeMatch]
  var noVault: Bool
  var noPins: Bool
}

struct VerdictComparison: Sendable {
  var riskReduced: Bool
  var before: Verdict
  var after: Verdict
  var worstRemainingLineId: String?
}

enum VerdictEngine {
  static let bandSeverity: [String: String] = ["street": "HIGH", "neighbourhood": "HIGH", "district": "MEDIUM", "city": "INFO", "country": "NONE", "none": "NONE"]
  static let strengthSeverity: [String: String] = ["exact": "HIGH", "likely": "HIGH", "possible": "MEDIUM"]
  static let matchCopyIds: [String: String] = ["exact": "copy.verdict.exact", "likely": "copy.verdict.likely", "possible": "copy.verdict.possible"]
  static let levelCopyIds: [String: String] = ["RED": "copy.verdict.red", "AMBER": "copy.verdict.amber", "LOW": "copy.verdict.low", "PARTIAL": "copy.verdict.partial"]
  static let strengthRank: [String: Int] = ["exact": 3, "likely": 2, "possible": 1]
  static let confRank: [String: Int] = ["high": 3, "medium": 2, "low": 1]
  static let sevRank: [String: Int] = ["HIGH": 3, "MEDIUM": 2, "INFO": 1, "NONE": 0, "CAUGHT": -1]
  static let sevOrder: [String: Int] = ["HIGH": 0, "MEDIUM": 1, "INFO": 2, "NONE": 3, "CAUGHT": 4]
  static let levelRank: [String: Int] = ["RED": 2, "AMBER": 1, "LOW": 0]
  static let emptyVaultLevel: [String: String] = ["street": "RED", "neighbourhood": "RED", "district": "AMBER", "city": "LOW", "region": "LOW", "country": "LOW"]
  static let usableStatus: Set<String> = ["ok", "no_location_signal"]
  static let scrubbed = "…"

  // ---------- no coordinates in the view model ----------
  private static let coordinateLike = try! NSRegularExpression(
    pattern: "[-+\u{2212}]?\\p{Nd}+(?:[.,\u{066B}\u{FF0C}\u{FF0E}]\\p{Nd}+)+(?:\\s*[°º˚])?|\\p{Nd}+\\s*[°º˚]")
  /// Decimals and degree expressions in the user's own labels (D-115).
  static func scrubNumbers(_ s: String) -> String { replace(coordinateLike, in: s, with: scrubbed) }

  private static let d = "[\\p{Nd}\\u00B2\\u00B3\\u00B9\\u2070\\u2074-\\u2079\\u2080-\\u2089]"
  private static let numberRun = try! NSRegularExpression(
    pattern: "[-+\\u2212]?\(d)+(?:(?:[.,\\u00B7\\u2027\\u066B\\u066C\\uFF0C\\uFF0E]|[eE][-+\\u2212]?)\(d)+)*"
      + "(?:\\s*(?:(?:km|mi|ft|m|d)(?!\\p{L})|[°º˚′″'\"\\u2032\\u2033]))?")
  private static let ellipsisRun = try! NSRegularExpression(pattern: "…(?:[\\s,;]*…)+")
  /// EVERY number in attacker text (with its unit or degree marks) → "…"; neighbouring ellipses collapse (D-127).
  static func scrubAttackerText(_ s: String) -> String {
    replace(ellipsisRun, in: replace(numberRun, in: s, with: scrubbed), with: scrubbed)
  }
  private static func replace(_ re: NSRegularExpression, in s: String, with t: String) -> String {
    re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: NSRegularExpression.escapedTemplate(for: t))
  }

  /// SPEC §17.3 {KIND}: place_pin shows the user's label in capitals (or PLACE).
  static func kindDisplay(_ kind: String, _ label: String) -> String {
    if kind == "place_pin" {
      let l = label.trimmingCharacters(in: .whitespacesAndNewlines)
      let fallback = (Enums.kindDisplay["place_pin"] ?? "|PLACE").split(separator: "|").dropFirst().first.map { $0.trimmingCharacters(in: .whitespaces) } ?? "PLACE"
      return l.isEmpty ? fallback : l.uppercased()
    }
    return Enums.kindDisplay[kind] ?? Enums.kindDisplay["other_text"] ?? "VAULT ITEM"
  }

  private static func unique<T: Hashable>(_ xs: [T]) -> [T] { var s = Set<T>(); return xs.filter { s.insert($0).inserted } }

  static func build(_ input: VerdictInput) -> Verdict {
    let phase = input.phase
    let th = input.bands ?? Geo.defaultBands
    var items: [VaultItem] = []
    var index: [String: Int] = [:]
    for v in input.vault where index[v.id] == nil { index[v.id] = items.count; items.append(v) }
    let noVault = items.isEmpty
    let noPins = !items.contains { isPinKind($0.kind) && $0.pin != nil }
    let kindOf: (VaultItem) -> String = { scrubNumbers(kindDisplay($0.kind, $0.label)) }

    let echoed = Set(unique(input.echoedVaultIds).filter { index[$0] != nil })
    var caught: [String: String] = [:]
    for c in input.caught where index[c.vaultId] != nil && caught[c.vaultId] == nil { caught[c.vaultId] = c.route }

    func echoLine(_ v: VaultItem) -> VerdictLine {
      VerdictLine(id: "echo:\(v.id)", kind: "echo", severity: "HIGH", copyId: "copy.verdict.echo", params: ["KIND": kindOf(v)], vaultId: v.id, clueIds: [], route: Route.rulesOnly.rawValue)
    }
    func caughtLine(_ v: VaultItem, _ route: String) -> VerdictLine {
      VerdictLine(id: "caught:\(v.id)", kind: "caught", severity: "CAUGHT", copyId: "copy.verdict.caught", params: ["KIND": kindOf(v)], vaultId: v.id, clueIds: [], route: route)
    }
    func sortLines(_ ls: [VerdictLine]) -> [VerdictLine] {
      ls.enumerated().sorted { (a, b) in
        let sa = sevOrder[a.element.severity]!, sb = sevOrder[b.element.severity]!
        return sa != sb ? sa < sb : a.offset < b.offset
      }.map(\.element)
    }

    guard let adv = input.adv, !input.refused, usableStatus.contains(adv.status) else {
      var lines: [VerdictLine] = []
      for v in items where echoed.contains(v.id) { lines.append(echoLine(v)) }
      if let flags = input.prescreenFlags {
        let types = unique(flags.types.filter { Enums.clueTypes.contains($0) })
        if !types.isEmpty {
          lines.append(VerdictLine(id: "found_on_device", kind: "found_on_device", severity: "INFO", copyId: "ui.verdict.foundOnDevice",
                                   params: ["TYPES": types.map { $0.replacingOccurrences(of: "_", with: " ") }.joined(separator: ", ")],
                                   clueIds: [], route: flags.route))
        }
      }
      for v in items { if let r = caught[v.id] { lines.append(caughtLine(v, r)) } }
      return Verdict(phase: phase, level: "PARTIAL", lines: sortLines(lines), notLinkedVaultIds: [], bestGuess: nil, pinBands: [], matches: [], noVault: noVault, noPins: noPins)
    }

    let ok = adv.status == "ok"
    let hyps = ok ? Array(adv.hypotheses.prefix(3)) : []
    let claims = ok ? Referee.claims(inferences: adv.inferences, hypotheses: hyps) : []
    var claimInfo: [String: (conf: String, order: Int)] = [:]
    for (order, c) in claims.enumerated() where claimInfo[c.id] == nil { claimInfo[c.id] = (c.confidence, order) }

    var pairOrder: [String] = []
    var pairs: [String: RefereeMatch] = [:]
    for m in input.matches {
      guard Referee.isStrength(m.strength), index[m.vaultId] != nil, claimInfo[m.claimId] != nil else { continue }
      let k = m.claimId + "\u{0}" + m.vaultId
      if let prev = pairs[k], strengthRank[m.strength]! <= strengthRank[prev.strength]! { continue }
      if pairs[k] == nil { pairOrder.append(k) }
      var n = m
      n.reason = scrubAttackerText(m.reason)
      pairs[k] = n
    }
    let matches = pairOrder.compactMap { pairs[$0] }.enumerated().sorted { (a, b) in
      let ca = claimInfo[a.element.claimId]!.order, cb = claimInfo[b.element.claimId]!.order
      if ca != cb { return ca < cb }
      let va = index[a.element.vaultId]!, vb = index[b.element.vaultId]!
      return va != vb ? va < vb : a.offset < b.offset
    }.map(\.element)

    var best: [String: (m: RefereeMatch, conf: String)] = [:]
    for m in matches {
      guard let info = claimInfo[m.claimId] else { continue }
      let prev = best[m.vaultId]
      let better = prev == nil || strengthRank[m.strength]! > strengthRank[prev!.m.strength]!
        || (strengthRank[m.strength]! == strengthRank[prev!.m.strength]! && confRank[info.conf, default: 0] > confRank[prev!.conf, default: 0])
      if better { best[m.vaultId] = (m, info.conf) }
    }

    let pinBands: [PinBand] = items.filter { isPinKind($0.kind) }.map { v in
      if let pin = v.pin {
        let pb = Geo.pinBand(v.id, pin, hyps, th)
        return PinBand(vaultId: v.id, band: pb.band, hypothesisId: pb.hypothesisId, confidence: pb.confidence, effectiveKm: nil)
      }
      return PinBand(vaultId: v.id, band: "none", hypothesisId: nil, confidence: nil, effectiveKm: nil)
    }
    let bandOf = Dictionary(pinBands.map { ($0.vaultId, $0) }, uniquingKeysWith: { a, _ in a })
    let hypClues: (String?) -> [String] = { id in hyps.first { $0.id == id }?.clueIds ?? [] }

    var lines: [VerdictLine] = []
    var notLinked: [String] = []
    for v in items {
      let KIND = kindOf(v)
      let r = best[v.id]
      let pb = bandOf[v.id]
      let shown: PinBand? = (pb != nil && bandSeverity[pb!.band] != "NONE" && pb!.confidence != nil) ? pb : nil
      let before = lines.count
      if let r, let shown {
        let ms = strengthSeverity[r.m.strength]!, bs = bandSeverity[shown.band]!
        lines.append(VerdictLine(id: "pin_match:\(v.id)", kind: "pin_match", severity: sevRank[bs]! > sevRank[ms]! ? bs : ms,
                                 copyId: matchCopyIds[r.m.strength]!, params: ["KIND": KIND, "band words": Geo.bandWords(shown.band)], vaultId: v.id,
                                 band: shown.band, strength: r.m.strength, confidence: r.conf, bandConfidence: shown.confidence,
                                 reason: r.m.reason, clueIds: unique(r.m.clueIds + hypClues(shown.hypothesisId)), route: r.m.route))
      } else if let r {
        lines.append(VerdictLine(id: "match:\(v.id)", kind: "match", severity: strengthSeverity[r.m.strength]!, copyId: matchCopyIds[r.m.strength]!,
                                 params: ["KIND": KIND], vaultId: v.id, strength: r.m.strength, confidence: r.conf, reason: r.m.reason,
                                 clueIds: r.m.clueIds, route: r.m.route))
      } else if let shown {
        lines.append(VerdictLine(id: "pin:\(v.id)", kind: "pin", severity: bandSeverity[shown.band]!, copyId: "copy.verdict.pin",
                                 params: ["KIND": KIND, "band words": Geo.bandWords(shown.band)], vaultId: v.id, band: shown.band,
                                 confidence: shown.confidence, clueIds: hypClues(shown.hypothesisId), route: Route.rulesOnly.rawValue))
      }
      if echoed.contains(v.id) { lines.append(echoLine(v)) }
      if let cr = caught[v.id] { lines.append(caughtLine(v, cr)) }
      if lines.count == before { notLinked.append(v.id) }
    }

    let bestGuess = hyps.first.map { BestGuess(level: $0.level, label: scrubAttackerText($0.label), confidence: $0.confidence) }
    let ruleLevel = lines.contains { $0.severity == "HIGH" } ? "RED" : lines.contains { $0.severity == "MEDIUM" } ? "AMBER" : "LOW"
    let geoLevel = hyps.reduce("LOW") { acc, h in
      let l = emptyVaultLevel[h.level] ?? "LOW"
      return levelRank[l]! > levelRank[acc]! ? l : acc
    }
    let level = noPins && levelRank[geoLevel]! > levelRank[ruleLevel]! ? geoLevel : ruleLevel
    return Verdict(phase: phase, level: level, lines: sortLines(lines), notLinkedVaultIds: notLinked, bestGuess: bestGuess,
                   pinBands: pinBands, matches: matches, noVault: noVault, noPins: noPins)
  }

  // ---------- copy helpers ----------
  static func headlineCopyId(_ level: String) -> String { levelCopyIds[level] ?? "copy.verdict.partial" }

  static func lineText(_ line: VerdictLine) -> String {
    let text = Strings.t(line.copyId, line.params)
    if line.kind == "pin_match", let bw = line.params["band words"], !bw.isEmpty { return text + " · " + bw }
    return text
  }

  static func bestGuessText(_ v: Verdict) -> String? {
    v.bestGuess.map { Strings.t("copy.verdict.bestGuess", ["level": $0.level, "label": $0.label, "confidence": $0.confidence]) }
  }

  static func notLinkedText(_ v: Verdict, _ vault: [VaultItem]) -> String? {
    let ids = Set(v.notLinkedVaultIds)
    var seen = Set<String>()
    var kinds: [String] = []
    for item in vault where ids.contains(item.id) && seen.insert(item.id).inserted { kinds.append(scrubNumbers(kindDisplay(item.kind, item.label))) }
    let names = unique(kinds)
    return names.isEmpty ? nil : Strings.t("copy.verdict.notLinked", ["KINDS": names.joined(separator: " · ")])
  }

  // ---------- Risk reduced (SPEC §10.6, D-128) ----------
  static func worstPinBand(_ v: Verdict) -> String {
    var worst = "none"
    for p in v.pinBands where Geo.bandRank(p.band) < Geo.bandRank(worst) { worst = p.band }
    return worst
  }
  static func highCount(_ v: Verdict) -> Int { v.lines.filter { $0.severity == "HIGH" }.count }

  private static func worstLine(_ v: Verdict) -> VerdictLine? {
    var w: VerdictLine?
    for l in v.lines where sevRank[l.severity]! > 0 && (w == nil || sevRank[l.severity]! > sevRank[w!.severity]!) { w = l }
    return w
  }
  private static func itemIds(_ v: Verdict) -> Set<String> {
    var ids = Set(v.notLinkedVaultIds)
    for l in v.lines { if let id = l.vaultId { ids.insert(id) } }
    for p in v.pinBands { ids.insert(p.vaultId) }
    return ids
  }
  private static func itemSeverity(_ v: Verdict) -> [String: Int] {
    var out: [String: Int] = [:]
    for l in v.lines { if let id = l.vaultId { out[id] = max(out[id] ?? 0, sevRank[l.severity]!) } }
    return out
  }

  static func compare(_ before: Verdict, _ after: Verdict) -> VerdictComparison {
    var reduced = false
    if before.level != "PARTIAL" && after.level != "PARTIAL" {
      let b = levelRank[before.level]!, a = levelRank[after.level]!
      let bandB = Geo.bandRank(worstPinBand(before)), bandA = Geo.bandRank(worstPinBand(after))
      let base = a < b || (a == b && bandA > bandB && highCount(after) < highCount(before))
      let sameVault = itemIds(before) == itemIds(after)
      let sevB = itemSeverity(before)
      let noRise = itemSeverity(after).allSatisfy { $0.value <= (sevB[$0.key] ?? 0) }
      reduced = base && bandA >= bandB && sameVault && noRise
    }
    return VerdictComparison(riskReduced: reduced, before: before, after: after, worstRemainingLineId: worstLine(after)?.id)
  }

  /// The compare header (D-116, D-128): copy ID and params.
  static func comparisonHeadline(_ cmp: VerdictComparison) -> (copyId: String, params: [String: String]) {
    let before = cmp.before, after = cmp.after
    if cmp.riskReduced {
      let bw = worstPinBand(before), aw = worstPinBand(after)
      return Geo.bandRank(aw) > Geo.bandRank(bw)
        ? ("copy.verdict.reduced", ["before": Geo.bandWords(bw), "after": Geo.bandWords(aw)])
        : ("copy.verdict.reduced", ["before": Strings.t(levelCopyIds[before.level]!), "after": Strings.t(levelCopyIds[after.level]!)])
    }
    if after.level == "PARTIAL" { return ("copy.verdict.partial", [:]) }
    let line = worstLine(after)
    let risk = line != nil && sevRank[line!.severity]! >= sevRank["MEDIUM"]!
    if after.level == "LOW" && !risk { return ("copy.verdict.low", [:]) }
    let text = line.map(lineText) ?? bestGuessText(after) ?? Strings.t(levelCopyIds[after.level]!)
    return ("copy.verdict.still", ["line": text])
  }
}
