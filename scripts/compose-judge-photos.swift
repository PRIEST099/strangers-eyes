// scripts/compose-judge-photos.swift: Judge Mode samples from openly licensed photos (D-153; RUNBOOK §6.2b).
// Usage: swift scripts/compose-judge-photos.swift <spec.json> <srcDir> <outDir>
// For each sample: decode the CC0 source, draw SOLID masks (never blur) over people, adverts showing people and real
// number plates, draw the synthetic props (staff badge, name-tag lunchbox) at OUTPUT resolution, and write
// judge-0N.jpg (1600 px long side) and judge-0N.nano768.jpg (768 px long side). ImageIO may add APP/ICC segments:
// scripts/strip-jpeg.mjs rewrites both files to JFIF-only afterwards. All rects are normalised 0..1 of the image.
import AppKit
import Foundation

struct Rect: Decodable { let x0: Double; let y0: Double; let x1: Double; let y1: Double }
struct Badge: Decodable { let rect: Rect; let angle: Double; let header: String; let title: String; let id: String }
struct Tag: Decodable { let rect: Rect; let angle: Double; let name: String }
struct Sample: Decodable { let id: String; let src: String; let masks: [Rect]; let badge: Badge?; let tag: Tag? }

let args = CommandLine.arguments
guard args.count == 4 else { fputs("usage: compose <spec.json> <srcDir> <outDir>\n", stderr); exit(2) }
let samples = try JSONDecoder().decode([Sample].self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))

func render(_ src: CGImage, longSide: Int, _ s: Sample) -> NSBitmapImageRep {
  let scale = Double(longSide) / Double(max(src.width, src.height))
  let W = Int((Double(src.width) * scale).rounded()), H = Int((Double(src.height) * scale).rounded())
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  let ctx = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = ctx
  let cg = ctx.cgContext
  cg.interpolationQuality = .high
  cg.draw(src, in: CGRect(x: 0, y: 0, width: W, height: H))
  // y is flipped: normalised y0 is the TOP of the image.
  func px(_ r: Rect) -> CGRect {
    CGRect(x: r.x0 * Double(W), y: (1 - r.y1) * Double(H), width: (r.x1 - r.x0) * Double(W), height: (r.y1 - r.y0) * Double(H))
  }
  NSColor(calibratedWhite: 0.12, alpha: 1).setFill()
  for m in s.masks { px(m).fill() }
  func text(_ str: String, in r: CGRect, size: CGFloat, color: NSColor, weight: NSFont.Weight = .heavy) {
    let p = NSMutableParagraphStyle(); p.alignment = .center
    let a: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: p]
    let h = (str as NSString).size(withAttributes: a).height
    (str as NSString).draw(in: CGRect(x: r.minX, y: r.midY - h / 2, width: r.width, height: h), withAttributes: a)
  }
  func rotated(_ r: CGRect, _ deg: Double, _ body: (CGRect) -> Void) {
    cg.saveGState()
    cg.translateBy(x: r.midX, y: r.midY); cg.rotate(by: CGFloat(deg * .pi / 180))
    body(CGRect(x: -r.width / 2, y: -r.height / 2, width: r.width, height: r.height))
    cg.restoreGState()
  }
  if let b = s.badge {
    let r = px(b.rect)
    // lanyard first (behind the card)
    NSColor(calibratedRed: 0.75, green: 0.1, blue: 0.12, alpha: 1).setStroke()
    let lan = NSBezierPath(); lan.lineWidth = r.width * 0.05
    lan.move(to: CGPoint(x: r.midX - r.width * 0.1, y: r.maxY)); lan.curve(to: CGPoint(x: r.minX - r.width * 0.4, y: r.maxY + r.height * 0.5),
      controlPoint1: CGPoint(x: r.midX - r.width * 0.3, y: r.maxY + r.height * 0.4), controlPoint2: CGPoint(x: r.minX, y: r.maxY + r.height * 0.6))
    lan.stroke()
    rotated(r, b.angle) { c in
      NSColor(calibratedWhite: 0.0, alpha: 0.35).setFill()
      NSBezierPath(roundedRect: c.offsetBy(dx: c.width * 0.02, dy: -c.width * 0.02), xRadius: c.width * 0.05, yRadius: c.width * 0.05).fill()
      NSColor.white.setFill()
      NSBezierPath(roundedRect: c, xRadius: c.width * 0.05, yRadius: c.width * 0.05).fill()
      let head = CGRect(x: c.minX, y: c.maxY - c.height * 0.30, width: c.width, height: c.height * 0.30)
      NSColor(calibratedRed: 0.04, green: 0.24, blue: 0.57, alpha: 1).setFill()
      NSBezierPath(roundedRect: head, xRadius: c.width * 0.05, yRadius: c.width * 0.05).fill()
      text(b.header, in: head.insetBy(dx: c.width * 0.03, dy: 0), size: head.height * 0.42, color: .white)
      // a solid grey photo box: never a face
      NSColor(calibratedWhite: 0.62, alpha: 1).setFill()
      CGRect(x: c.minX + c.width * 0.06, y: c.minY + c.height * 0.10, width: c.width * 0.26, height: c.height * 0.50).fill()
      let body = CGRect(x: c.minX + c.width * 0.34, y: c.minY + c.height * 0.30, width: c.width * 0.64, height: c.height * 0.32)
      text(b.title, in: body, size: body.height * 0.75, color: .black)
      text(b.id, in: CGRect(x: body.minX, y: c.minY + c.height * 0.08, width: body.width, height: c.height * 0.2), size: c.height * 0.12, color: .darkGray, weight: .semibold)
    }
  }
  if let t = s.tag {
    let r = px(t.rect)
    rotated(r, t.angle) { c in
      NSColor(calibratedWhite: 0.0, alpha: 0.35).setFill()
      NSBezierPath(roundedRect: c.offsetBy(dx: c.width * 0.02, dy: -c.width * 0.02), xRadius: c.height * 0.12, yRadius: c.height * 0.12).fill()
      NSColor(calibratedRed: 0.1, green: 0.62, blue: 0.62, alpha: 1).setFill()
      NSBezierPath(roundedRect: c, xRadius: c.height * 0.12, yRadius: c.height * 0.12).fill()
      NSColor(calibratedRed: 0.06, green: 0.45, blue: 0.45, alpha: 1).setFill()
      CGRect(x: c.minX, y: c.maxY - c.height * 0.22, width: c.width, height: c.height * 0.06).fill()
      let label = c.insetBy(dx: c.width * 0.12, dy: c.height * 0.24).offsetBy(dx: 0, dy: -c.height * 0.06)
      NSColor.white.setFill()
      NSBezierPath(roundedRect: label, xRadius: label.height * 0.12, yRadius: label.height * 0.12).fill()
      text(t.name, in: label, size: label.height * 0.62, color: .black)
    }
  }
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

for s in samples {
  let url = URL(fileURLWithPath: args[2]).appendingPathComponent(s.src)
  guard let isrc = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(isrc, 0, nil) else {
    fputs("cannot read \(s.src)\n", stderr); exit(1)
  }
  for (suffix, long, q) in [("", 1600, 0.88), (".nano768", 768, 0.85)] {
    let rep = render(img, longSide: long, s)
    let data = rep.representation(using: .jpeg, properties: [.compressionFactor: q])!
    let out = URL(fileURLWithPath: args[3]).appendingPathComponent("\(s.id)\(suffix).jpg")
    try data.write(to: out)
    print("wrote \(out.lastPathComponent) \(rep.pixelsWide)x\(rep.pixelsHigh)")
  }
}
