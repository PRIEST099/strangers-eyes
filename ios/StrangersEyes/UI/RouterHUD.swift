// ios/StrangersEyes/UI/RouterHUD.swift: the Router HUD (T-124; SPEC §14.6): every AI call with where it ran
// (ON-DEVICE / IN CLOUD / RULES-ONLY / BLOCKED), its engine and latency, plus the Ledger counters (faces and vault items
// sent: always 0 · 0, AC-329). Reads the in-memory Ledger only.
import SwiftUI

struct RouterHUD: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(Strings.t("ui.hud.label")).font(.caption.bold())
        Spacer()
        Text(Strings.t("copy.ledger.counters", ["f": String(model.ledger.facesSent), "v": String(model.ledger.vaultItemsSent)]))
          .font(.caption2.monospacedDigit()).accessibilityIdentifier("ledgerCounters")
      }
      if model.ledger.entries.isEmpty {
        Text(Strings.t("ui.hud.idle")).font(.caption2).foregroundStyle(.secondary)
      }
      ForEach(model.ledger.entries.prefix(4)) { e in
        HStack(spacing: 6) {
          if let r = e.route { RouteBadge(route: r) } else { ProgressView().controlSize(.mini) }
          Text(e.route == nil ? Strings.t("ui.hud.pillRunning", ["job": e.job])
               : Strings.t("ui.hud.pill", ["job": e.job, "route": routeLabel(e.route), "engine": e.engine,
                                           "latency": latency(e.latencyMs)]))
            .font(.caption2).lineLimit(1)
        }
      }
    }
    .padding(10)
    .background(.regularMaterial)
  }
  /// The on-screen route label (ON-DEVICE, IN CLOUD, ...), as the web HUD pill shows it (core/ledgerView.ts).
  private func routeLabel(_ r: Route?) -> String {
    guard let r else { return "" }
    return Strings.t("ui.route.\(r.rawValue)")
  }
  private func latency(_ ms: Int?) -> String {
    guard let ms else { return "" }
    return ms >= 1000 ? Strings.t("ui.unit.seconds", ["n": String(format: "%.1f", Double(ms) / 1000)])
                      : Strings.t("ui.unit.ms", ["n": String(ms)])
  }
}
