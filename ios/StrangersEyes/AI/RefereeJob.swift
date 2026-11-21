// ios/StrangersEyes/AI/RefereeJob.swift: the on-device referee (S0, nanoRef.v1; T-126; SPEC SCR-09; port of
// web/src/ai/jobs/referee.ts). CLAIMS (≤12) and VAULT (≤20, labels and aliases only, never coordinates) get short
// per-call aliases (c1.., v1..) that are the ONLY ids the model sees; answers are mapped back and validated in code
// (unknown ids, strengths or kind pairs SPEC §17.4 forbids are dropped, AC-161). The Egress Gate runs it on Apple
// Foundation Models only, else the rules referee answers (RULES_ONLY). The device matches are unioned with the rules.
// LOCAL ONLY: vault labels and the prompt stay in memory; nothing is logged, persisted or sent.
import Foundation

struct RefereeOutcome: Sendable {
  var matches: [RefereeMatch]
  var route: Route
  var latencyMs: Int
  var notes: [String]
}

enum RefereeJob {
  static let maxClaims = 12, maxVault = 20, maxMatches = 12, maxClaimChars = 160, maxReasonWords = 12

  struct Prompt {
    var text: String
    var claimOf: [String: RefereeClaim]
    var itemOf: [String: RefereeVaultItem]
  }

  static func prompt(_ claimsIn: [RefereeClaim], _ itemsIn: [RefereeVaultItem]) -> Prompt? {
    let claims = Array(claimsIn.filter { !$0.value.trimmingCharacters(in: .whitespaces).isEmpty }.prefix(maxClaims))
    let items = Array(itemsIn.filter { !Referee.isGenericLabel($0.label) }
      .map { RefereeVaultItem(id: $0.id, kind: $0.kind, label: $0.label, aliases: $0.aliases.filter { !Referee.isGenericLabel($0) }) }
      .prefix(maxVault))
    guard !claims.isEmpty, !items.isEmpty, let tpl = PromptLibrary.text("nanoRef.v1.user.md") else { return nil }
    var claimOf: [String: RefereeClaim] = [:], itemOf: [String: RefereeVaultItem] = [:]
    let cj: [[String: String]] = claims.enumerated().map { k, c in
      claimOf["c\(k + 1)"] = c
      return ["id": "c\(k + 1)", "kind": c.kind, "value": String(c.value.prefix(maxClaimChars))]
    }
    let vj: [[String: String]] = items.enumerated().map { k, v in
      itemOf["v\(k + 1)"] = v
      return ["id": "v\(k + 1)", "kind": Enums.promptKindOf[v.kind] ?? "other", "label": ([v.label] + v.aliases).joined(separator: " / ")]
    }
    guard let text = PromptLibrary.render(tpl, ["CLAIMS_JSON": cj, "VAULT_JSON": vj]) else { return nil }
    return Prompt(text: text, claimOf: claimOf, itemOf: itemOf)
  }

  static func shortReason(_ s: String) -> String {
    s.split(whereSeparator: \.isWhitespace).prefix(maxReasonWords).joined(separator: " ")
  }

  /// The model's answer → validated matches with LOCAL ids (one per pair, the stronger; ≤ 12).
  static func validate(_ answer: FMRefereeAnswer, _ p: Prompt) -> [RefereeMatch] {
    var order: [String] = []
    var out: [String: RefereeMatch] = [:]
    for m in answer.matches.prefix(maxMatches) {
      guard let claim = p.claimOf[m.claim_id], let item = p.itemOf[m.vault_id], Referee.isStrength(m.strength),
            Enums.kindCompat[claim.kind]?.contains(item.kind) == true else { continue }
      let key = claim.id + "\u{0}" + item.id
      if let prev = out[key], Referee.rank[prev.strength]! >= Referee.rank[m.strength]! { continue }
      if out[key] == nil { order.append(key) }
      out[key] = RefereeMatch(claimId: claim.id, vaultId: item.id, strength: m.strength, reason: shortReason(m.reason), clueIds: claim.clueIds, route: Route.onDevice.rawValue)
    }
    return order.compactMap { out[$0] }
  }

  @MainActor
  static func run(gate: EgressGate, adv: AdversaryResult, vault: [VaultItem]) async -> RefereeOutcome {
    let claims = Referee.claims(inferences: adv.inferences, hypotheses: Array(adv.hypotheses.prefix(3)))
    let items = Referee.vaultItems(vault)
    let rules = Referee.rulesReferee(claims, items)
    guard let p = prompt(claims, items) else { return RefereeOutcome(matches: rules, route: .rulesOnly, latencyMs: 0, notes: ["skipped"]) }
    let r = await gate.onDevice(job: Strings.t("ui.job.referee"), cls: .S0, prompt: p.text, generating: FMRefereeAnswer.self,
                                deterministic: { FMRefereeAnswer(matches: []) })
    guard r.route == .onDevice, let answer = r.value else {
      return RefereeOutcome(matches: rules, route: .rulesOnly, latencyMs: r.latencyMs, notes: [r.note ?? "rules"])
    }
    let merged = Referee.mergeMatches(validate(answer, p), rules)
    return RefereeOutcome(matches: merged.matches, route: .onDevice, latencyMs: r.latencyMs, notes: merged.notes)
  }
}
