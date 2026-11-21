// ios/StrangersEyes/Core/Boxes.swift: the subset of web/src/core/boxes.ts the iOS fix needs (ARCH §11.5, D-35, D-88,
// D-89, D-97). Every stored box is in MASTER pixels. Pure functions.
import Foundation

enum Boxes {
  static let defaultPadRatio = 0.15
  static let minPadPx = 4.0
  static let maxCropRatio = 0.4

  private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { max(lo, min(hi, v)) }
  private static func ceilPx(_ v: Double) -> Double { (v - 1e-9).rounded(.up) }

  static func roundOut(_ r: PxRect) -> PxRect {
    let x0 = r.x.rounded(.down), y0 = r.y.rounded(.down)
    return PxRect(x: x0, y: y0, w: (r.x + r.w).rounded(.up) - x0, h: (r.y + r.h).rounded(.up) - y0)
  }

  static func clampRect(_ r: PxRect, _ W: Double, _ H: Double) -> PxRect {
    let x0 = clamp(r.x, 0, W), y0 = clamp(r.y, 0, H), x1 = clamp(r.x + r.w, 0, W), y1 = clamp(r.y + r.h, 0, H)
    return PxRect(x: x0, y: y0, w: max(0, x1 - x0), h: max(0, y1 - y0))
  }

  static func area(_ r: PxRect) -> Double { max(0, r.w) * max(0, r.h) }

  static func intersect(_ a: PxRect, _ b: PxRect) -> PxRect {
    let x0 = max(a.x, b.x), y0 = max(a.y, b.y), x1 = min(a.x + a.w, b.x + b.w), y1 = min(a.y + a.h, b.y + b.h)
    return PxRect(x: x0, y: y0, w: max(0, x1 - x0), h: max(0, y1 - y0))
  }

  /// box_2d (0..1000 of the image AS SENT, i.e. of `frame`) → master px, rounded outward, inside the frame's crop.
  /// nil for a non-finite or zero-area box.
  static func box2dToMaster(_ box: Box2D, _ frame: ImageFrame) -> PxRect? {
    guard box.count == 4, box.allSatisfy(\.isFinite) else { return nil }
    let v = box.map { clamp($0, 0, 1000) }
    let ymin = min(v[0], v[2]), ymax = max(v[0], v[2]), xmin = min(v[1], v[3]), xmax = max(v[1], v[3])
    guard xmax > xmin, ymax > ymin else { return nil }
    let c = frame.cropInMaster
    let x0 = (c.x + xmin * c.w / 1000).rounded(.down), y0 = (c.y + ymin * c.h / 1000).rounded(.down)
    let x1 = (c.x + xmax * c.w / 1000).rounded(.up), y1 = (c.y + ymax * c.h / 1000).rounded(.up)
    let r = intersect(PxRect(x: x0, y: y0, w: x1 - x0, h: y1 - y0), roundOut(c))
    return area(r) > 0 ? r : nil
  }

  /// Pad by `ratio` of the size in total (half per side, rounded up), at least 4 px per side, clamped to W×H.
  static func padRect(_ r: PxRect, _ W: Double, _ H: Double, _ ratio: Double = defaultPadRatio) -> PxRect {
    let k = ratio.isFinite ? clamp(ratio, 0, 0.5) : defaultPadRatio
    let px = max(minPadPx, ceilPx(r.w * k / 2)), py = max(minPadPx, ceilPx(r.h * k / 2))
    return clampRect(roundOut(PxRect(x: r.x - px, y: r.y - py, w: r.w + 2 * px, h: r.h + 2 * py)), W, H)
  }

  enum CropResult: Equatable { case ok(side: String, px: Double, rect: PxRect), fail(reason: String) }

  static func minimalCrop(_ side: String, _ boxes: [PxRect], _ W: Double, _ H: Double) -> CropResult {
    let bs = boxes.map { clampRect($0, W, H) }.filter { area($0) > 0 }
    guard !bs.isEmpty else { return .fail(reason: "no_boxes") }
    let px: Double, dim: Double
    switch side {
    case "top": px = bs.map { $0.y + $0.h }.max()!.rounded(.up); dim = H
    case "bottom": px = (H - bs.map(\.y).min()!).rounded(.up); dim = H
    case "left": px = bs.map { $0.x + $0.w }.max()!.rounded(.up); dim = W
    default: px = (W - bs.map(\.x).min()!).rounded(.up); dim = W
    }
    if px > maxCropRatio * dim { return .fail(reason: "too_much") }
    let rect: PxRect = side == "top" ? PxRect(x: 0, y: px, w: W, h: H - px)
      : side == "bottom" ? PxRect(x: 0, y: 0, w: W, h: H - px)
      : side == "left" ? PxRect(x: px, y: 0, w: W - px, h: H)
      : PxRect(x: 0, y: 0, w: W - px, h: H)
    return .ok(side: side, px: px, rect: rect)
  }

  /// D-89: the side whose minimal crop removes the smallest share within the 40% cap; ties keep top, bottom, left, right.
  static func bestCrop(_ boxes: [PxRect], _ W: Double, _ H: Double) -> CropResult {
    var best: CropResult?
    var bestShare = Double.infinity
    var reason = "no_boxes"
    for side in ["top", "bottom", "left", "right"] {
      let r = minimalCrop(side, boxes, W, H)
      guard case let .ok(_, px, _) = r else { if case let .fail(why) = r { reason = why }; continue }
      let share = px / (side == "top" || side == "bottom" ? H : W)
      if share < bestShare { best = r; bestShare = share }
    }
    return best ?? .fail(reason: reason)
  }
}
