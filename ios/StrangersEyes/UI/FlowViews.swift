// ios/StrangersEyes/UI/FlowViews.swift: consent sheet (the exact image, SCR-07), verdict card (SPEC §10, bands only,
// confidence on every line), fix card (SCR-11, solid masks + crop) and the before → after compare (SPEC §10.6).
import SwiftUI

struct ConsentView: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text(Strings.t("copy.consent.title")).font(.title3.bold())
          if let o = model.outgoing {
            Image(uiImage: o.image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 8))
              .accessibilityLabel(Strings.t("ui.consent.imageAlt"))
            Text(Strings.t("ui.consent.meta", ["w": String(Int(o.frame.width)), "h": String(Int(o.frame.height)), "kb": String(o.jpeg.count / 1024), "sha": String(o.sha256.prefix(12))]))
              .font(.caption.monospaced())
            if let pc = o.precheck {
              Text(Strings.t("ui.consent.checklist")).font(.headline)
              check(pc.metadataClean, Strings.t("ui.consent.checkMetadata"))
              check(pc.faces == 0, Strings.t("ui.consent.checkFaces", ["n": String(pc.faces)]))
              check(pc.vaultHits == 0, Strings.t("ui.consent.checkVault", ["n": String(pc.vaultHits)]))
              if !pc.metadataClean { failed("ui.consent.failed.metadata") }
              if pc.faces > 0 { failed("ui.consent.failed.faces") }
              if pc.vaultHits > 0 { failed("ui.consent.failed.vault") }
              if pc.failed { failed("ui.consent.failed.check") }
            }
          }
          Text(Strings.t("copy.consent.never")).font(.callout)
          Text(Strings.t("copy.consent.tierFree")).font(.caption).foregroundStyle(.secondary)
          if model.first != nil { Text(Strings.t("copy.about.reattackDisclosure")).font(.caption).foregroundStyle(.secondary) }
          if model.usingFake { Text(Strings.t("ui.ios.fakeBanner")).font(.caption.bold()).foregroundStyle(.purple) }
          HStack {
            Button(Strings.t("copy.consent.cancel")) { model.cancelConsent() }.buttonStyle(.bordered)
            Button(Strings.t("copy.consent.send")) { Task { await model.sendConsented() } }
              .buttonStyle(.borderedProminent).disabled(!model.sendAllowed).accessibilityIdentifier("sendButton")
          }
        }
        .padding(16)
      }
    }
  }

  private func check(_ ok: Bool, _ text: String) -> some View {
    Label(text, systemImage: ok ? "checkmark.circle.fill" : "xmark.octagon.fill").foregroundStyle(ok ? .green : .red).font(.callout)
  }
  private func failed(_ id: String) -> some View { Text(Strings.t(id)).font(.caption).foregroundStyle(.red) }
}

struct VerdictCard: View {
  @Environment(AppModel.self) private var model
  let round: Round
  var body: some View {
    let v = round.verdict
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(Strings.t("ui.verdict.level.\(v.level)")).font(.caption.bold()).padding(4).background(levelColor(v.level).opacity(0.2), in: Capsule())
        Text(Strings.t(VerdictEngine.headlineCopyId(v.level))).font(.headline)
      }
      if v.noVault { Text(Strings.t("copy.verdict.noVault")).font(.callout) }
      ForEach(Array(v.lines.enumerated()), id: \.offset) { _, l in LineRow(line: l) }
      if let bg = VerdictEngine.bestGuessText(v) { Text(bg).font(.callout) }
      if let nl = VerdictEngine.notLinkedText(v, model.vault.items) { Text(nl).font(.caption).foregroundStyle(.secondary) }
      HStack(spacing: 6) {
        Text(Strings.t("ui.verdict.referee")).font(.caption)
        RouteBadge(route: round.referee.route)
        if round.referee.route == .rulesOnly { Text(Strings.t("copy.ref.rules")).font(.caption2).foregroundStyle(.secondary) }
      }
      Text(Strings.t("ui.verdict.distances")).font(.caption2).foregroundStyle(.secondary)
      Text(Strings.t("copy.verdict.neverLearns")).font(.caption).italic()
    }
    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
    .background(levelColor(v.level).opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
  }
}

struct LineRow: View {
  let line: VerdictLine
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(VerdictEngine.lineText(line)).font(.callout.weight(line.severity == "HIGH" ? .semibold : .regular))
      if let c = conf { Text(c).font(.caption2).foregroundStyle(.secondary) }
    }
  }
  /// Always show confidence (SPEC §10.2): the attacker's, and for a combined line the distance's too.
  private var conf: String? {
    switch line.kind {
    case "pin_match": Strings.t("ui.verdict.pinMatchConf", ["strength": line.strength ?? "", "confidence": line.confidence ?? "", "bandConfidence": line.bandConfidence ?? ""])
    case "match": Strings.t("ui.verdict.strengthConf", ["strength": line.strength ?? "", "confidence": line.confidence ?? ""])
    case "pin": Strings.t("ui.verdict.conf", ["confidence": line.confidence ?? ""])
    case "caught": Strings.t("ui.verdict.onDevice") + " " + Strings.t("ui.verdict.neverSent")
    default: nil
    }
  }
}

func levelColor(_ level: String) -> Color {
  switch level { case "RED": .red; case "AMBER": .orange; case "LOW": .gray; default: .purple }
}

struct FixCard: View {
  @Environment(AppModel.self) private var model
  let fix: RulesFix
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Strings.t("copy.fix.title")).font(.headline)
      Text(Strings.t("copy.fix.rules")).font(.caption).foregroundStyle(.secondary)
      Text(fix.explanation).font(.callout)
      ForEach(fix.masks, id: \.clueId) { m in
        Label(Strings.t("ui.fix.maskItem", ["type": m.type.replacingOccurrences(of: "_", with: " "), "id": m.clueId]), systemImage: "square.fill").font(.caption)
      }
      if fix.cropSide != "none" { Label(Strings.t("ui.fix.cropItem", ["side": fix.cropSide]), systemImage: "crop").font(.caption) }
      if fix.unremovable { Text(Strings.t("copy.fix.unremovable")).font(.caption) }
      if fix.cropTooMuch { Text(Strings.t("copy.fix.cropTooMuch")).font(.caption) }
      Text(Strings.t("ui.fix.expected", ["level": fix.expectedResidual])).font(.caption)
      Button(Strings.t("copy.fix.reattack")) { Task { await model.applyFixAndPrepareReattack() } }
        .buttonStyle(.borderedProminent).accessibilityIdentifier("reattackButton")
    }
    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
  }
}

struct CompareCard: View {
  @Environment(AppModel.self) private var model
  let cmp: VerdictComparison
  var body: some View {
    let h = VerdictEngine.comparisonHeadline(cmp)
    VStack(alignment: .leading, spacing: 8) {
      Text(Strings.t("ui.compare.title")).font(.caption).foregroundStyle(.secondary)
      Text(Strings.t(h.copyId, h.params)).font(.title3.bold()).foregroundStyle(cmp.riskReduced ? .green : .primary)
        .accessibilityIdentifier("compareHeadline")
      if let r = model.second { VerdictCard(round: r) }
      Text(Strings.t("copy.about.notGuarantee")).font(.caption).foregroundStyle(.secondary)
    }
  }
}
