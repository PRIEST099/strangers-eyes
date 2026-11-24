// ios/StrangersEyes/AI/PrescreenJob.swift: the iOS on-device pre-screen (T-125; SPEC §14.2 I3; ARCH §10.12; prompt
// shared/prompts/fmPre.v1.user.md). Apple Foundation Models reasons over TEXT ONLY: the Vision OCR lines (id, text,
// 3x3 region) and the top Vision scene labels. Never an image (API-NOTES §3.10: FM image input fails; Vision handles the
// pixels). No vault labels go in the prompt (S1), and words Tier-0 already matched to the vault are left out.
// Runs through the Egress Gate as S1: a fresh availability check before the call, the 4,096-token budget, and a
// fail-closed RULES-ONLY fallback (no findings: Tier-0's faces and vault matches still stand). Types, regions,
// severities and line ids are validated in code; unknown ones are dropped. The findings are "possible identifiers":
// shown to the user, never masked automatically, and unioned with Tier-0 for the verdict's on-device flags.
// LOCAL ONLY: OCR text stays in memory; nothing is logged, persisted or sent.
import Foundation

struct PreFinding: Equatable, Sendable { var type: String; var severity: String; var lineId: String? }

struct PrescreenOutcome: Sendable {
  var findings: [PreFinding]
  var route: Route
  var latencyMs: Int
  var note: String?
}

enum PrescreenJob {
  static let maxLines = 40, maxLineChars = 80, maxLabels = 10, maxFindings = 8
  static let nothingToRead = "nothing to read"
  static let regions = ["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"]

  /// The allowed types: nanoPre.v1.schema.json's clue type enum (one source with the web), within CLUE_TYPES.
  static let types: [String] = {
    let schema = PromptLibrary.json("nanoPre.v1.schema.json") as? [String: Any]
    let props = ((schema?["properties"] as? [String: Any])?["clues"] as? [String: Any])?["items"] as? [String: Any]
    let list = ((props?["properties"] as? [String: Any])?["type"] as? [String: Any])?["enum"] as? [String] ?? []
    return list.filter { Enums.clueTypes.contains($0) }
  }()

  struct Line: Equatable { var id: String; var text: String; var region: String }

  static func region(_ r: PxRect, _ W: Double, _ H: Double) -> String {
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2
    let col = cx < W / 3 ? "left" : cx < 2 * W / 3 ? "center" : "right"
    let row = cy < H / 3 ? "top" : cy < 2 * H / 3 ? "middle" : "bottom"
    return "\(row)_\(col)"
  }

  /// OCR words → numbered lines (l1, l2…) with a 3x3 region. Words inside `exclude` (Tier-0 vault masks) are left out.
  static func lines(_ words: [OCRWord], W: Double, H: Double, exclude: [PxRect] = []) -> [Line] {
    var order: [Int] = []
    var byLine: [Int: [OCRWord]] = [:]
    for w in words {
      let cx = w.box.x + w.box.w / 2, cy = w.box.y + w.box.h / 2
      if exclude.contains(where: { cx >= $0.x && cx <= $0.x + $0.w && cy >= $0.y && cy <= $0.y + $0.h }) { continue }
      if byLine[w.line] == nil { order.append(w.line) }
      byLine[w.line, default: []].append(w)
    }
    var out: [Line] = []
    for li in order {
      guard let ws = byLine[li], !ws.isEmpty, out.count < maxLines else { continue }
      let text = String(ws.map(\.text).joined(separator: " ").prefix(maxLineChars))
      let x0 = ws.map(\.box.x).min()!, y0 = ws.map(\.box.y).min()!
      let x1 = ws.map { $0.box.x + $0.box.w }.max()!, y1 = ws.map { $0.box.y + $0.box.h }.max()!
      out.append(Line(id: "l\(out.count + 1)", text: text, region: region(PxRect(x: x0, y: y0, w: x1 - x0, h: y1 - y0), W, H)))
    }
    return out
  }

  static func prompt(_ lines: [Line], labels: [String]) -> String? {
    guard let tpl = PromptLibrary.text("fmPre.v1.user.md") else { return nil }
    let lj: [[String: String]] = lines.map { ["id": $0.id, "text": $0.text, "region": $0.region] }
    return PromptLibrary.render(tpl, ["LINES_JSON": lj, "LABELS_JSON": Array(labels.prefix(maxLabels))])
  }

  /// The model's answer → validated findings (known type, severity and region; a line id we sent, or none).
  static func validate(_ answer: FMPreScreen, lineIds: Set<String>) -> [PreFinding] {
    var out: [PreFinding] = []
    for c in answer.clues.prefix(maxFindings) {
      guard types.contains(c.type), Enums.conf.contains(c.severity), regions.contains(c.region) else { continue }
      let lid = c.line_id.trimmingCharacters(in: .whitespaces)
      guard lid.isEmpty || lineIds.contains(lid) else { continue }
      let f = PreFinding(type: c.type, severity: c.severity, lineId: lid.isEmpty ? nil : lid)
      if !out.contains(f) { out.append(f) }
    }
    return out
  }

  @MainActor
  static func run(gate: EgressGate, tier0: Tier0Result, width W: Double, height H: Double) async -> PrescreenOutcome {
    let vaultBoxes = tier0.masks.filter { if case .vault = $0.reason { return true }; return false }.map(\.box)
    let ls = lines(tier0.words, W: W, H: H, exclude: vaultBoxes)
    guard !(ls.isEmpty && tier0.labels.isEmpty), let p = prompt(ls, labels: tier0.labels) else {
      return PrescreenOutcome(findings: [], route: .rulesOnly, latencyMs: 0, note: nothingToRead)
    }
    let r = await gate.onDevice(job: Strings.t("ui.job.preScreen"), cls: .S1, prompt: p, generating: FMPreScreen.self,
                                deterministic: { FMPreScreen(clues: []) })
    guard r.route == .onDevice, let answer = r.value else {
      return PrescreenOutcome(findings: [], route: .rulesOnly, latencyMs: r.latencyMs, note: r.note)
    }
    return PrescreenOutcome(findings: validate(answer, lineIds: Set(ls.map(\.id))), route: .onDevice, latencyMs: r.latencyMs)
  }
}
