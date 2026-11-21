// ios/StrangersEyes/Core/Referee.swift: port of web/src/core/referee.ts, the deterministic rules-only referee and the
// union with the on-device referee (SPEC §10.3, §17.4, §17.5; ARCH §12.1). Parity: shared/testvectors/referee.json.
// Vault labels flow through here: pure code, no logging, nothing persisted or sent. Pins enter as kind + label only;
// coordinates are never read (bands are Geo.swift).
import Foundation

struct RefereeClaim: Equatable, Sendable {
  var id: String
  var kind: String
  var value: String
  var confidence: String
  var clueIds: [String]
}

/// kind + label + aliases. Never coordinates (SPEC SCR-09, AC-162, AC-167). LOCAL ONLY.
struct RefereeVaultItem: Equatable, Sendable {
  var id: String
  var kind: String
  var label: String
  var aliases: [String]
}

struct RuleHit: Equatable { var strength: String; var rule: String; var reason: String }

enum Referee {
  static let rulesNote = "+rules"
  static let rank: [String: Int] = ["exact": 3, "likely": 2, "possible": 1]
  static func isStrength(_ s: String) -> Bool { Enums.strengths.contains(s) }

  /// CLAIMS = pass-B inferences, then hypotheses as {kind: area, value: label}.
  static func claims(inferences: [Inference], hypotheses: [AdversaryHypothesis]) -> [RefereeClaim] {
    inferences.map { RefereeClaim(id: $0.id, kind: $0.kind, value: $0.value, confidence: $0.confidence, clueIds: $0.clueIds) }
      + hypotheses.map { RefereeClaim(id: $0.id, kind: "area", value: $0.label, confidence: $0.confidence, clueIds: $0.clueIds) }
  }

  static func isGenericLabel(_ s: String) -> Bool {
    let n = Fuzzy.normalize(s)
    return (n.isEmpty && Fuzzy.alnum(s).isEmpty) || Enums.genericPinLabels.contains(n)
  }

  private static func eligibleStrings(_ item: RefereeVaultItem) -> [String] {
    if isGenericLabel(item.label) { return [] }
    return ([item.label] + item.aliases).filter { !isGenericLabel($0) }
  }

  static func vaultItems(_ vault: [VaultItem]) -> [RefereeVaultItem] {
    vault.map { RefereeVaultItem(id: $0.id, kind: $0.kind, label: $0.label, aliases: $0.aliases.filter { !isGenericLabel($0) }) }
      .filter { !eligibleStrings($0).isEmpty }
  }

  // ---------- word lists as token runs ----------
  private struct Run { var text: String; var toks: [String] }
  private static func runOf(_ t: String) -> Run { Run(text: t, toks: Fuzzy.tokens(t)) }
  private static let artefactRuns = Enums.artefactTerms.map(runOf)
  private static let classRuns: [(name: String, words: [Run])] = Enums.synonymClasses.map { ($0[0], $0.map(runOf)) }

  private static func hasRun(_ toks: [String], _ run: Run) -> Bool {
    let n = run.toks.count
    if n == 0 || toks.count < n { return false }
    for j in 0...(toks.count - n) where run.toks.enumerated().allSatisfy({ toks[j + $0.offset] == $0.element }) { return true }
    return false
  }

  static func acronym(_ labelToks: [String]) -> String {
    labelToks.filter { !Fuzzy.functionWords.contains($0) }.compactMap { $0.unicodeScalars.first.map { String($0) } }.joined()
  }
  private static func isAcronymOk(_ s: String) -> Bool {
    s.unicodeScalars.count >= 3 && s.unicodeScalars.allSatisfy(Fuzzy.isL)
  }

  /// Every token reading of a claim, exactly as the matcher scans a text (F-121); duplicates removed.
  static func claimReadings(_ value: String) -> [[String]] {
    var seen = Set<String>()
    var out: [[String]] = []
    for seq in Fuzzy.prepare(Fuzzy.wordsOfText(value)).seqs {
      let toks = seq.map(\.t)
      let key = toks.joined(separator: " ")
      if seen.insert(key).inserted { out.append(toks) }
    }
    return out
  }

  private static func digitHit(_ s: String, _ kind: String, _ claimValue: String, _ theta: Double) -> Bool {
    Fuzzy.termInWords(Fuzzy.makeTerm("", kind, s), Fuzzy.wordsOfText(claimValue), theta, .image)
  }

  private static func textHit(_ claimToks: [String], _ lt: [String], _ theta: Double) -> RuleHit? {
    let n = lt.count
    if n == 0 { return nil }
    let sim: (String, String) -> Bool = { Fuzzy.tokenSim($0, $1) >= theta }
    // 1(a)
    if !(n == 1 && Fuzzy.isGeneric(lt[0])), claimToks.count >= n {
      for j in 0...(claimToks.count - n) where lt.enumerated().allSatisfy({ sim($0.element, claimToks[j + $0.offset]) }) {
        return RuleHit(strength: "exact", rule: "exact_a", reason: "named in the claim")
      }
    }
    // 1(b)
    let allGeneric = lt.allSatisfy(Fuzzy.isGeneric)
    if n >= 2 && claimToks.count >= 2 {
      for i in 0..<(n - 1) {
        if Fuzzy.functionWords.contains(lt[i]) && Fuzzy.functionWords.contains(lt[i + 1]) { continue }
        if !allGeneric && Fuzzy.isGeneric(lt[i]) && Fuzzy.isGeneric(lt[i + 1]) { continue }
        for j in 0..<(claimToks.count - 1) where sim(lt[i], claimToks[j]) && sim(lt[i + 1], claimToks[j + 1]) {
          return RuleHit(strength: "exact", rule: "exact_b", reason: "named in the claim")
        }
      }
    }
    // 2(a)
    if let token = lt.first(where: { t in Fuzzy.isDistinctive(t) && claimToks.contains { sim(t, $0) } }) {
      return RuleHit(strength: "likely", rule: "likely_a", reason: "shares '\(token)'")
    }
    // 2(b)
    let acr = acronym(lt)
    if isAcronymOk(acr) && claimToks.contains(acr) { return RuleHit(strength: "likely", rule: "likely_b", reason: "acronym '\(acr)'") }
    // 2(c) / 3(a)
    if let cls = classRuns.first(where: { c in c.words.contains { hasRun(claimToks, $0) } && c.words.contains { hasRun(lt, $0) } }) {
      if let art = artefactRuns.first(where: { hasRun(claimToks, $0) }) {
        return RuleHit(strength: "likely", rule: "likely_c", reason: "\(art.text) + same category: \(cls.name)")
      }
      return RuleHit(strength: "possible", rule: "possible_a", reason: "same category: \(cls.name)")
    }
    return nil
  }

  private static func sharedToken(_ readings: [[String]], _ strings: [String], _ theta: Double) -> String? {
    for s in strings {
      if let t = Fuzzy.tokens(s).first(where: { lt in !Fuzzy.isGeneric(lt) && readings.contains { r in r.contains { Fuzzy.tokenSim(lt, $0) >= theta } } }) {
        return t
      }
    }
    return nil
  }

  /// SPEC §10.3 for one (claim, vault item) pair.
  static func rulesStrength(_ claim: RefereeClaim, _ item: RefereeVaultItem, _ theta: Double = Fuzzy.defaultThreshold) -> RuleHit? {
    guard let compat = Enums.kindCompat[claim.kind], compat.contains(item.kind) else { return nil }
    let strings = eligibleStrings(item)
    if strings.isEmpty { return nil }
    if Fuzzy.isDigitKind(item.kind) {
      return strings.contains { digitHit($0, item.kind, claim.value, theta) } ? RuleHit(strength: "exact", rule: "exact_a", reason: "named in the claim") : nil
    }
    let readings = claimReadings(claim.value)
    var best: RuleHit?
    for s in strings {
      let lt = Fuzzy.tokens(s)
      for r in readings {
        if let h = textHit(r, lt, theta), best == nil || rank[h.strength]! > rank[best!.strength]! { best = h }
      }
    }
    if let best { return best }
    if claim.confidence != "high" { return nil }
    return sharedToken(readings, strings, theta) != nil ? RuleHit(strength: "possible", rule: "possible_b", reason: "compatible kind, high confidence") : nil
  }

  /// The rules-only referee: one match per linked (claim, item) pair, claim order then item order, RULES_ONLY.
  static func rulesReferee(_ claims: [RefereeClaim], _ items: [RefereeVaultItem], _ theta: Double = Fuzzy.defaultThreshold) -> [RefereeMatch] {
    var out: [RefereeMatch] = []
    for c in claims {
      for v in items {
        if let h = rulesStrength(c, v, theta) {
          out.append(RefereeMatch(claimId: c.id, vaultId: v.id, strength: h.strength, reason: h.reason, clueIds: c.clueIds, route: Route.rulesOnly.rawValue))
        }
      }
    }
    return out
  }

  /// Union per (claim, item) pair keeping the stronger (the device wins a tie); route stays the device's when it found
  /// the pair; notes ["+rules"] when a valid rules match entered the union.
  static let deviceCapNote = "device-only: capped at possible"

  static func mergeMatches(_ device: [RefereeMatch], _ rules: [RefereeMatch]) -> (matches: [RefereeMatch], notes: [String]) {
    var order: [String] = []
    var out: [String: RefereeMatch] = [:]
    func take(_ m: RefereeMatch, _ route: String) {
      let k = m.claimId + "\u{0}" + m.vaultId
      let prev = out[k]
      if prev == nil || rank[m.strength]! > rank[prev!.strength]! {
        if prev == nil { order.append(k) }
        var n = m
        n.route = prev?.route ?? route
        out[k] = n
      }
    }
    for m in device where isStrength(m.strength) { take(m, m.route) }
    var used = false
    var ruled = Set<String>()
    for m in rules where isStrength(m.strength) {
      used = true
      ruled.insert(m.claimId + "\u{0}" + m.vaultId)
      take(m, Route.rulesOnly.rawValue)
    }
    // D-157: a device match for a pair that NO rules match links is capped at "possible" (after the union): FM and Nano
    // grade generic-word overlaps ("A coastal city" vs "City General Hospital") as exact.
    var capped = false
    for k in order where !ruled.contains(k) {
      if var m = out[k], rank[m.strength]! > rank["possible"]! { m.strength = "possible"; out[k] = m; capped = true }
    }
    var notes: [String] = used ? [rulesNote] : []
    if capped { notes.append(deviceCapNote) }
    return (order.compactMap { out[$0] }, notes)
  }
}
