// ios/StrangersEyes/UI/RouterHUD.swift: the Router HUD (T-124; SPEC §14.6): every AI call with where it ran
// (ON-DEVICE / IN CLOUD / CACHED SAMPLE / RULES-ONLY / BLOCKED), its engine and latency, plus the Ledger counters
// (faces and vault items sent: always 0 · 0, AC-329) and the real request count (a CACHED replay is 0 requests, 0 bytes,
// so "nothing sent" never sits next to a result without saying why). Compact by default (one line: the latest call), so
// it never covers the flow's buttons; tap to expand. Reads the in-memory Ledger only. With Settings › Developer on,
// each call also shows its payload class and gate note.
import SwiftUI

struct RouterHUD: View {
  @Environment(AppModel.self) private var model
  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button { withAnimation(.snappy) { expanded.toggle() } } label: {
        HStack(spacing: 6) {
          Text(Strings.t("ui.hud.name")).font(.caption2.bold())
          if let e = model.ledger.entries.first { pill(e) } else { Text(Strings.t("ui.hud.idle")).font(.caption2).foregroundStyle(.secondary) }
          Spacer(minLength: 4)
          Image(systemName: expanded ? "chevron.down" : "chevron.up").font(.caption2)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("hudToggle")
      if expanded {
        Text(Strings.t("copy.ledger.counters", ["f": String(model.ledger.facesSent), "v": String(model.ledger.vaultItemsSent)]))
          .font(.caption2.monospacedDigit()).accessibilityIdentifier("ledgerCounters")
        Text(Strings.t("ui.ledger.traffic", ["unique": String(model.ledger.cloudRequests), "n": String(model.ledger.cloudRequests),
                                             "kb": Strings.t("ui.unit.kb", ["n": String(model.ledger.cloudBytes / 1024)])]))
          .font(.caption2.monospacedDigit())
        Text(Strings.t("ui.ledger.local", ["k": String(model.ledger.onDeviceCalls), "r": String(model.ledger.rulesCalls), "b": String(model.ledger.blocked)]))
          .font(.caption2.monospacedDigit())
        ForEach(model.ledger.entries.prefix(6)) { e in pill(e) }
      }
    }
    .padding(.horizontal, 12).padding(.vertical, 8)
    .background(.regularMaterial)
  }

  private func pill(_ e: LedgerEntry) -> some View {
    HStack(spacing: 6) {
      if let r = e.route { RouteBadge(route: r) } else { ProgressView().controlSize(.mini) }
      Text(e.route == nil ? Strings.t("ui.hud.pillRunning", ["job": e.job])
           : Strings.t("ui.hud.pill", ["job": e.job, "engine": e.engine, "latency": latency(e.latencyMs)], omitting: ["route"]))
        .font(.caption2).lineLimit(1)
      if model.techDetails {
        Text([e.cls.rawValue, e.note].compactMap { $0 }.joined(separator: " "))
          .font(.caption2.monospaced()).foregroundStyle(.secondary).lineLimit(1)
      }
    }
  }

  private func latency(_ ms: Int?) -> String {
    guard let ms else { return "" }
    return ms >= 1000 ? Strings.t("ui.unit.seconds", ["n": String(format: "%.1f", Double(ms) / 1000)])
                      : Strings.t("ui.unit.ms", ["n": String(ms)])
  }
}
