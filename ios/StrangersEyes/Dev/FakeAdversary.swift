#if DEBUG
// ios/StrangersEyes/Dev/FakeAdversary.swift: DEBUG-ONLY stand-ins so the full loop runs with NO cloud call (the free-tier
// quota is reserved). Compiled out of Release by the #if DEBUG above (check-boundaries R16 requires it on line 1).
// - FakeAdversaryTransport: a CloudTransport the Egress Gate calls INSTEAD of Gemini, after every gate check has passed.
//   It returns a canned pass-B JSON shaped like shared/prompts/advB.v1.schema.json for the synthetic scene below. It
//   "looks" at the exact JPEG it was given: a canned clue whose box is ≥ 60% solid black counts as masked and is
//   dropped, with the hypotheses and inferences that relied on it; if no hypothesis is left it answers a coarse
//   city-level guess (the re-attack after a fix). No network, no model.
// - SyntheticScene: a drawn test photo (no real people, places or homes; invariant 9).
// - Demo vault pins: the synthetic open-ocean test area of shared/testvectors (no land nearby).
// Selected only with the launch argument -fakeAdversary (or env FAKE_ADVERSARY=1); the HUD labels it.
import Foundation
import UIKit

enum DevFlags {
  static var fakeAdversary: Bool {
    ProcessInfo.processInfo.arguments.contains("-fakeAdversary") || ProcessInfo.processInfo.environment["FAKE_ADVERSARY"] == "1"
  }
  static var seedDemoVault: Bool { ProcessInfo.processInfo.arguments.contains("-seedDemoVault") }
  static var acceptWelcome: Bool { ProcessInfo.processInfo.arguments.contains("-acceptWelcome") }
  static let demoHome = Pin(lat: 0.5, lng: -30.5)
  static let demoWork = Pin(lat: 0.53, lng: -30.46)
}

struct FakeAdversaryTransport: CloudTransport {
  var engine: String { Strings.t("ui.hud.engine.fake") }
  var simulated: Bool { true }

  private struct Clue { var id, type: String; var box: [Double]; var evidence, reveals, severity: String; var removable: Bool }
  private struct Hyp { var id, label, level: String; var lat, lng, radiusKm: Double; var confidence: String; var clueIds: [String] }
  private struct Inf { var id, kind, value, confidence: String; var clueIds: [String] }

  // box_2d [ymin, xmin, ymax, xmax] on 0..1000, matching SyntheticScene's layout.
  private static let clues: [Clue] = [
    Clue(id: "c1", type: "street_sign", box: [75, 563, 225, 900], evidence: "Blue street sign naming a harbour road.", reveals: "street", severity: "high", removable: true),
    Clue(id: "c2", type: "uniform_or_lanyard", box: [700, 300, 858, 469], evidence: "Lanyard card printed HOSPITAL STAFF with a red logo.", reveals: "venue_or_organisation", severity: "high", removable: true),
    Clue(id: "c3", type: "house_number", box: [317, 597, 421, 681], evidence: "Door number plaque beside the entrance.", reveals: "street", severity: "medium", removable: true),
    Clue(id: "c4", type: "transit_sign", box: [271, 884, 371, 975], evidence: "Green bus stop sign at the kerb.", reveals: "neighbourhood", severity: "medium", removable: true),
    Clue(id: "c5", type: "architecture", box: [150, 0, 800, 1000], evidence: "Pale wooden facade with regular boards.", reveals: "city", severity: "low", removable: false),
  ]
  private static let hyps: [Hyp] = [
    Hyp(id: "h1", label: "Harbour Road, a coastal district", level: "street", lat: 0.502, lng: -30.497, radiusKm: 0.6, confidence: "medium", clueIds: ["c1", "c3"]),
    Hyp(id: "h2", label: "The harbour district of a coastal city", level: "district", lat: 0.51, lng: -30.48, radiusKm: 3, confidence: "low", clueIds: ["c4", "c5"]),
  ]
  private static let coarse = Hyp(id: "h9", label: "A coastal city", level: "city", lat: 0.6, lng: -30.3, radiusKm: 25, confidence: "low", clueIds: ["c5"])
  private static let infs: [Inf] = [
    Inf(id: "i1", kind: "workplace", value: "A hospital (staff lanyard)", confidence: "medium", clueIds: ["c2"]),
    Inf(id: "i2", kind: "home_area", value: "Near Harbour Road", confidence: "medium", clueIds: ["c1", "c3"]),
  ]

  func passB(system: String, user: String, jpeg: Data) async throws -> CloudReply {
    try await Task.sleep(for: .milliseconds(900))   // feel like a network call; nothing leaves the device
    guard let cg = ImagePipeline.decode(jpeg)?.master else { return CloudReply(text: nil, declined: false, engine: engine) }
    let W = Double(cg.width), H = Double(cg.height)
    let visible = Self.clues.filter { c in
      let r = PxRect(x: c.box[1] * W / 1000, y: c.box[0] * H / 1000, w: (c.box[3] - c.box[1]) * W / 1000, h: (c.box[2] - c.box[0]) * H / 1000)
      return !c.removable || ImagePipeline.blackFraction(cg, r) < 0.6
    }
    let ids = Set(visible.map(\.id))
    var hs = Self.hyps.filter { $0.clueIds.allSatisfy(ids.contains) }
    if hs.isEmpty { hs = [Self.coarse] }
    let inf = Self.infs.filter { $0.clueIds.allSatisfy(ids.contains) }
    let obj: [String: Any] = [
      "audit_status": "ok",
      "scene_summary": visible.count == Self.clues.count ? "A building entrance with a street sign, a bus stop and a lanyard on a railing."
        : "The same scene with several solid black areas; little readable text remains.",
      "clues": visible.map { ["id": $0.id, "type": $0.type, "box_2d": $0.box, "evidence": $0.evidence, "reveals": $0.reveals, "severity": $0.severity, "removable": $0.removable] },
      "hypotheses": hs.map { ["id": $0.id, "label": $0.label, "level": $0.level, "lat": $0.lat, "lng": $0.lng, "radius_km": $0.radiusKm, "confidence": $0.confidence, "clue_ids": $0.clueIds] },
      "inferences": inf.map { ["id": $0.id, "kind": $0.kind, "value": $0.value, "confidence": $0.confidence, "clue_ids": $0.clueIds] },
    ]
    let d = try JSONSerialization.data(withJSONObject: obj)
    return CloudReply(text: String(decoding: d, as: UTF8.self), declined: false, engine: engine)
  }
}

/// A drawn 1600×1200 test photo: a doorstep with a street sign, a house number, a bus stop, a staff lanyard and a bag
/// tag reading LUCAS (the demo vault's child name, which Tier-0 must catch and mask). Synthetic: no real place or person.
enum SyntheticScene {
  static func jpeg() -> Data {
    let W = 1600.0, H = 1200.0
    let fmt = UIGraphicsImageRendererFormat()
    fmt.scale = 1
    let img = UIGraphicsImageRenderer(size: CGSize(width: W, height: H), format: fmt).image { ctx in
      let c = ctx.cgContext
      func fill(_ r: CGRect, _ col: UIColor) { col.setFill(); c.fill(r) }
      func text(_ s: String, _ r: CGRect, _ size: CGFloat, _ col: UIColor) {
        let p = NSMutableParagraphStyle(); p.alignment = .center
        (s as NSString).draw(in: r, withAttributes: [.font: UIFont.systemFont(ofSize: size, weight: .heavy), .foregroundColor: col, .paragraphStyle: p])
      }
      fill(CGRect(x: 0, y: 0, width: W, height: 180), UIColor(red: 0.6, green: 0.75, blue: 0.9, alpha: 1))
      fill(CGRect(x: 0, y: 180, width: W, height: 780), UIColor(red: 0.84, green: 0.8, blue: 0.72, alpha: 1))
      for y in stride(from: 250.0, to: 960, by: 72) { fill(CGRect(x: 0, y: y, width: W, height: 4), UIColor(white: 0.7, alpha: 1)) }
      fill(CGRect(x: 0, y: 960, width: W, height: 240), UIColor(white: 0.58, alpha: 1))
      text("SYNTHETIC TEST SCENE", CGRect(x: 30, y: 40, width: 760, height: 70), 52, UIColor(white: 0.2, alpha: 1))
      // street sign (c1)
      fill(CGRect(x: 900, y: 90, width: 540, height: 180), .white)
      fill(CGRect(x: 910, y: 100, width: 520, height: 160), UIColor(red: 0.1, green: 0.28, blue: 0.6, alpha: 1))
      text("HARBOUR ROAD", CGRect(x: 910, y: 140, width: 520, height: 90), 64, .white)
      fill(CGRect(x: 1160, y: 270, width: 14, height: 690), UIColor(white: 0.4, alpha: 1))
      // door and house number (c3)
      fill(CGRect(x: 590, y: 345, width: 320, height: 615), UIColor(white: 0.1, alpha: 1))
      fill(CGRect(x: 615, y: 365, width: 270, height: 595), UIColor(red: 0.37, green: 0.24, blue: 0.16, alpha: 1))
      fill(CGRect(x: 955, y: 380, width: 135, height: 125), UIColor(white: 0.1, alpha: 1))
      fill(CGRect(x: 961, y: 386, width: 123, height: 113), .white)
      text("27", CGRect(x: 961, y: 395, width: 123, height: 100), 72, .black)
      // bus stop (c4)
      fill(CGRect(x: 1480, y: 440, width: 12, height: 520), UIColor(white: 0.4, alpha: 1))
      c.setFillColor(UIColor(red: 0.07, green: 0.47, blue: 0.3, alpha: 1).cgColor)
      c.fillEllipse(in: CGRect(x: 1415, y: 325, width: 145, height: 120))
      text("BUS", CGRect(x: 1415, y: 352, width: 145, height: 70), 50, .white)
      // railing and staff lanyard (c2)
      for x in stride(from: 130.0, to: 620, by: 80) { fill(CGRect(x: x, y: 770, width: 12, height: 190), UIColor(white: 0.1, alpha: 1)) }
      fill(CGRect(x: 130, y: 770, width: 490, height: 12), UIColor(white: 0.1, alpha: 1))
      fill(CGRect(x: 480, y: 840, width: 270, height: 190), UIColor(white: 0.97, alpha: 1))
      c.setFillColor(UIColor.red.cgColor); c.fillEllipse(in: CGRect(x: 500, y: 860, width: 50, height: 50))
      text("HOSPITAL", CGRect(x: 480, y: 915, width: 270, height: 55), 46, .black)
      text("STAFF", CGRect(x: 480, y: 965, width: 270, height: 55), 46, .black)
      // bag with a name tag (vault text: Tier-0 masks it before anything is sent)
      fill(CGRect(x: 985, y: 790, width: 335, height: 330), UIColor(red: 0.18, green: 0.34, blue: 0.25, alpha: 1))
      fill(CGRect(x: 1035, y: 835, width: 230, height: 90), UIColor(white: 0.4, alpha: 1))
      fill(CGRect(x: 1042, y: 842, width: 216, height: 76), .white)
      text("LUCAS", CGRect(x: 1042, y: 845, width: 216, height: 70), 58, .black)
    }
    return img.jpegData(compressionQuality: 0.9) ?? Data()
  }
}
#endif
