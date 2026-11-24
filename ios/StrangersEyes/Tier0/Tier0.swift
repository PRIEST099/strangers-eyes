// ios/StrangersEyes/Tier0/Tier0.swift: the deterministic on-device guard (T-123, SPEC §14.2 I2; API-NOTES §4.1).
// Vision finds faces (CPU compute device in the Simulator, else "Could not create inference context") and readable text
// with word boxes; Fuzzy.matchWords checks the words against the vault terms; every face and every vault hit becomes a
// SOLID mask (15% padding). The same scan is the Egress Gate's image re-check on the exact outgoing pixels.
// LOCAL ONLY: OCR text and vault hits stay in memory; nothing is logged or sent.
import CoreML
import Foundation
import Vision

struct OCRWord: Sendable { var text: String; var line: Int; var box: PxRect }

struct Tier0Mask: Sendable, Identifiable {
  enum Reason: Sendable, Equatable { case face, vault(vaultId: String) }
  var id = UUID()
  var reason: Reason
  var box: PxRect
}

struct Tier0Result: Sendable {
  var words: [OCRWord]
  var faces: [PxRect]
  var vaultHits: [(vaultId: String, kind: String, boxes: [PxRect])]
  var masks: [Tier0Mask]
  var labels: [String]
  var ms: Int
}

enum Tier0 {
  /// RC face_min_confidence at its strictest (the gate's 0.3): Tier-0 and the re-check use one rule.
  static let faceMinConfidence: Float = 0.3

  static func faces(_ cg: CGImage) async throws -> [PxRect] {
    var req = DetectFaceRectanglesRequest()
    #if targetEnvironment(simulator)
    if let cpu = MLComputeDevice.allComputeDevices.first(where: { if case .cpu = $0 { return true }; return false }) {
      req.setComputeDevice(cpu, for: .main)
    }
    #endif
    let size = CGSize(width: cg.width, height: cg.height)
    return try await req.perform(on: cg).filter { $0.confidence >= faceMinConfidence }.map {
      let r = $0.boundingBox.toImageCoordinates(size, origin: .upperLeft)
      return PxRect(x: r.minX, y: r.minY, w: r.width, h: r.height)
    }
  }

  static func words(_ cg: CGImage) async throws -> [OCRWord] {
    var req = RecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    let size = CGSize(width: cg.width, height: cg.height)
    var out: [OCRWord] = []
    for (li, o) in try await req.perform(on: cg).enumerated() {
      guard let c = o.topCandidates(1).first else { continue }
      let s = c.string
      var idx = s.startIndex
      while idx < s.endIndex {
        guard let start = s[idx...].firstIndex(where: { !$0.isWhitespace }) else { break }
        let end = s[start...].firstIndex(where: \.isWhitespace) ?? s.endIndex
        let range = start..<end
        let r = (c.boundingBox(for: range)?.boundingBox ?? o.boundingBox).toImageCoordinates(size, origin: .upperLeft)
        out.append(OCRWord(text: String(s[range]), line: li, box: PxRect(x: r.minX, y: r.minY, w: r.width, h: r.height)))
        idx = end
      }
    }
    return out
  }

  static func sceneLabels(_ cg: CGImage) async -> [String] {
    (try? await ClassifyImageRequest().perform(on: cg))?.filter { $0.confidence >= 0.3 }.prefix(10).map(\.identifier) ?? []
  }

  /// Vault terms in the OCR words → the union of each hit's word boxes, per span.
  static func vaultHits(_ words: [OCRWord], _ terms: [Fuzzy.Term], theta: Double = Fuzzy.defaultThreshold) -> [(vaultId: String, kind: String, boxes: [PxRect])] {
    let fw = words.map { Fuzzy.Word(text: $0.text, line: $0.line) }
    return Fuzzy.matchWords(fw, terms, theta, .image).map { hit in
      let boxes = hit.spans.map { sp -> PxRect in
        let bs = words[sp[0]...sp[1]].map(\.box)
        let x0 = bs.map(\.x).min()!, y0 = bs.map(\.y).min()!
        let x1 = bs.map { $0.x + $0.w }.max()!, y1 = bs.map { $0.y + $0.h }.max()!
        return PxRect(x: x0, y: y0, w: x1 - x0, h: y1 - y0)
      }
      return (hit.term.vaultId, hit.term.kind, boxes)
    }
  }

  static func run(_ cg: CGImage, terms: [Fuzzy.Term], labels wantLabels: Bool = true) async throws -> Tier0Result {
    let t0 = Date()
    let W = Double(cg.width), H = Double(cg.height)
    let fs = try await faces(cg)
    let ws = try await words(cg)
    let hits = vaultHits(ws, terms)
    var masks = fs.map { Tier0Mask(reason: .face, box: Boxes.padRect($0, W, H)) }
    for h in hits { masks += h.boxes.map { Tier0Mask(reason: .vault(vaultId: h.vaultId), box: Boxes.padRect($0, W, H)) } }
    let labels = wantLabels ? await sceneLabels(cg) : []
    return Tier0Result(words: ws, faces: fs, vaultHits: hits, masks: masks, labels: labels, ms: Int(Date().timeIntervalSince(t0) * 1000))
  }
}
