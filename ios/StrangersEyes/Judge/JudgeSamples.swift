// ios/StrangersEyes/Judge/JudgeSamples.swift: iOS Judge Mode (SPEC SCR-17; port of web/src/vault/judgeVault.ts and
// web/src/ui/judge/judgeFlow.ts; D-37, D-150..D-153, D-161, D-164).
//   - The SAME bundled samples as the web: web/public/samples (manifest.json, judge-0N.jpg, the recorded pass-B answers
//     judge-0N.advB.v1.json / judge-0N.advB.fixed.v1.json, SOURCES.md), referenced by ios/project.yml as the `samples`
//     folder resource. Openly licensed (CC0) photos of public places; nothing here is the user's.
//   - JudgeManifest.parse: strict, like parseJudgeManifest (nil on any defect). Each photo's sha256 is checked on load.
//   - JudgeVault.make: the FAKE vault, in memory only (Home, work "City General Hospital", child "Lucas", plate
//     "SE 1234"); pins = the sample's own fakeVault, else the manifest's, rounded to 3 decimals (D-26, D-164). The real
//     VaultStore is never read while Judge Mode is on (AppModel.activeVault).
//   - JudgeFlow.fixedRecordingApplies: the "after fix" recording stands for a re-attack only when the masks (and crop)
//     actually sent hide the first recording's manifest `fixMasked` clues (absent = every removable clue); otherwise the
//     first recording is replayed (honest: still exposed). Keyed on the FIRST answer's own boxes (D-161).
//   - RecordedReplayTransport: the CACHED replay. The Egress Gate calls it like any transport, after every pre-send
//     check, and writes a Ledger entry with route CACHED, 0 bytes and no cloud request. The text it returns is the
//     recorded real Gemini answer and is parsed by the same strict AdvBParser as a live answer (invariant 8).
import CryptoKit
import Foundation

struct JudgePins: Equatable, Sendable { var homePin: Pin; var workPin: Pin }

struct JudgeSample: Equatable, Sendable, Identifiable {
  var id: String
  var title: String
  var image: String
  var imageSha256: String
  var cachedAdvB: String
  var cachedAdvBFixed: String
  var recordedAt: String
  var model: String
  /// D-161: the first recording's clue ids the recorded fix masked; nil = every removable clue.
  var fixMasked: [String]?
  /// D-164: this sample's own made-up pins; nil = the manifest's.
  var fakeVault: JudgePins?
}

struct JudgeManifest: Equatable, Sendable {
  var fakeVault: JudgePins
  var samples: [JudgeSample]

  static let folder = "samples"
  private static let shaHex = try! NSRegularExpression(pattern: "^[0-9a-f]{64}$")
  private static let sampleId = try! NSRegularExpression(pattern: "^[a-z0-9][a-z0-9-]{0,31}$")
  private static let clueId = try! NSRegularExpression(pattern: "^[A-Za-z0-9_-]{1,16}$")
  /// A sample file name (no path): only these are ever read from the bundle.
  private static let sampleFile = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9.-]{0,63}\\.(jpg|json)$")

  static func matches(_ re: NSRegularExpression, _ s: String) -> Bool {
    re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
  }
  private static func str(_ v: Any?, max: Int = 200) -> String? {
    guard let s = v as? String, !s.isEmpty, s.count <= max else { return nil }
    return s
  }
  private static func num(_ v: Any?) -> Double? {
    guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { return nil }
    return n.doubleValue
  }
  private static func pin(_ v: Any?) -> Pin? {
    guard let o = v as? [String: Any], let lat = num(o["lat"]), let lng = num(o["lng"]), abs(lat) <= 90, abs(lng) <= 180 else { return nil }
    return Pin(lat: lat, lng: lng)
  }
  private static func pins(_ v: Any?) -> JudgePins? {
    guard let o = v as? [String: Any], let h = pin(o["homePin"]), let w = pin(o["workPin"]) else { return nil }
    return JudgePins(homePin: h, workPin: w)
  }

  /// The manifest, or nil when anything is missing, malformed or duplicated.
  static func parse(_ raw: Any) -> JudgeManifest? {
    guard let root = raw as? [String: Any], (root["version"] as? NSNumber)?.intValue == 1,
          let list = root["samples"] as? [Any], !list.isEmpty, let fake = pins(root["fakeVault"]) else { return nil }
    var out: [JudgeSample] = []
    var ids = Set<String>()
    for item in list {
      guard let s = item as? [String: Any] else { return nil }
      var own: JudgePins?
      if s["fakeVault"] != nil { guard let p = pins(s["fakeVault"]) else { return nil }; own = p }
      var fixMasked: [String]?
      if let fm = s["fixMasked"] {
        guard let a = fm as? [Any], a.count <= 32 else { return nil }
        let ids = a.compactMap { str($0, max: 16) }.filter { matches(clueId, $0) }
        guard ids.count == a.count else { return nil }
        fixMasked = ids
      }
      guard let id = str(s["id"]), matches(sampleId, id), !ids.contains(id), let title = str(s["title"]),
            let recordedAt = str(s["recordedAt"], max: 40), let model = str(s["model"], max: 120),
            let sha = str(s["imageSha256"]), matches(shaHex, sha) else { return nil }
      var files: [String] = []
      for k in ["image", "cachedAdvB", "cachedAdvBFixed"] {
        guard let f = str(s[k]), matches(sampleFile, f) else { return nil }
        files.append(f)
      }
      ids.insert(id)
      out.append(JudgeSample(id: id, title: title, image: files[0], imageSha256: sha, cachedAdvB: files[1], cachedAdvBFixed: files[2],
                             recordedAt: recordedAt, model: model, fixMasked: fixMasked, fakeVault: own))
    }
    return JudgeManifest(fakeVault: fake, samples: out)
  }

  /// A file of the bundled `samples` folder (nil for a name that is not a sample file, or a missing file).
  static func data(_ file: String, bundle: Bundle = .main) -> Data? {
    guard matches(sampleFile, file) else { return nil }
    let ns = file as NSString
    guard let url = bundle.url(forResource: ns.deletingPathExtension, withExtension: ns.pathExtension, subdirectory: folder) else { return nil }
    return try? Data(contentsOf: url)
  }

  static func load(bundle: Bundle = .main) -> JudgeManifest? {
    guard let d = data("manifest.json", bundle: bundle), let raw = try? JSONSerialization.jsonObject(with: d) else { return nil }
    return parse(raw)
  }

  /// The sample photo's bytes, only when their sha256 is the manifest's.
  static func photo(_ s: JudgeSample, bundle: Bundle = .main) -> Data? {
    guard let d = data(s.image, bundle: bundle) else { return nil }
    let hex = SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined()
    return hex == s.imageSha256 ? d : nil
  }

  /// D-164: the pins a sample's fake vault uses.
  func pins(for s: JudgeSample) -> JudgePins { s.fakeVault ?? fakeVault }
}

enum JudgeVault {
  static let ids = (home: "judge-home", work: "judge-work", child: "judge-child", plate: "judge-plate")
  /// D-26: sample pins are rounded to 3 decimals (about 100 m).
  static func round3(_ x: Double) -> Double { (x * 1000).rounded() / 1000 }

  /// The fake vault (in memory only; never written, logged or sent).
  static func make(_ p: JudgePins) -> [VaultItem] {
    func pin(_ q: Pin) -> Pin { Pin(lat: round3(q.lat), lng: round3(q.lng)) }
    return [
      VaultItem(id: ids.home, kind: "home_pin", label: "Home", pin: pin(p.homePin)),
      VaultItem(id: ids.work, kind: "work_pin", label: "City General Hospital", pin: pin(p.workPin)),
      VaultItem(id: ids.child, kind: "child_name", label: "Lucas"),
      VaultItem(id: ids.plate, kind: "plate", label: "SE 1234"),
    ]
  }
}

enum JudgeFlow {
  /// A clue counts as removed when at least this share of its box is hidden.
  static let hiddenEnough = 0.9

  /// Box (0..1000 of the uncropped sample) → px rect in a W×H master.
  static func boxToPx(_ b: Box2D, _ W: Double, _ H: Double) -> PxRect {
    PxRect(x: b[1] / 1000 * W, y: b[0] / 1000 * H, w: (b[3] - b[1]) / 1000 * W, h: (b[2] - b[0]) / 1000 * H)
  }

  private static func inside(_ x: Double, _ y: Double, _ r: PxRect) -> Bool { x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  /// Share (0..1) of the box hidden by the masks or cut off by the crop, sampled on a 10×10 grid.
  static func hiddenShare(_ box: PxRect, _ masks: [PxRect], _ crop: PxRect?) -> Double {
    var hid = 0
    for i in 0..<10 {
      for j in 0..<10 {
        let x = box.x + (Double(j) + 0.5) / 10 * box.w, y = box.y + (Double(i) + 0.5) / 10 * box.h
        if let crop, !inside(x, y, crop) { hid += 1; continue }
        if masks.contains(where: { inside(x, y, $0) }) { hid += 1 }
      }
    }
    return Double(hid) / 100
  }

  static func fixedRecordingApplies(_ first: AdversaryResult, masks: [PxRect], crop: PxRect?, W: Double, H: Double, fixMasked: [String]?) -> Bool {
    let must = fixMasked.map { ids in first.clues.filter { ids.contains($0.id) } } ?? first.clues.filter(\.removable)
    return must.allSatisfy { hiddenShare(boxToPx($0.box2d, W, H), masks, crop) >= hiddenEnough }
  }

  /// A box of the uncropped sample mapped into a cropped frame (clamped; 0..1000 of the crop).
  static func boxIntoCrop(_ b: Box2D, _ crop: PxRect?, _ W: Double, _ H: Double) -> Box2D {
    guard let crop, crop.w > 0, crop.h > 0 else { return b }
    func map(_ v: Double, _ size: Double, _ off: Double, _ len: Double) -> Double {
      max(0, min(1000, ((v / 1000 * size - off) / len * 1000).rounded()))
    }
    return [map(b[0], H, crop.y, crop.h), map(b[1], W, crop.x, crop.w), map(b[2], H, crop.y, crop.h), map(b[3], W, crop.x, crop.w)]
  }
}

/// The CACHED replay of one recorded real Gemini answer (see the header). Nothing leaves the device.
struct RecordedReplayTransport: CloudTransport {
  let json: String
  let model: String
  var engine: String { model }
  var simulated: Bool { true }
  func passB(system: String, user: String, jpeg: Data) async throws -> CloudReply {
    CloudReply(text: json, declined: false, engine: engine)
  }
}
