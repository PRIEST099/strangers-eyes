// ios/StrangersEyes/Tier0/ImagePipeline.swift: decode with orientation baked in, solid masks, crop, and the EXIF-free
// JPEG re-encode for the cloud copy (T-123; API-NOTES §4.2–4.3; ARCH §19.4).
// - Orientation is baked into the pixels (CGImageSourceCreateThumbnailAtIndex + kCGImageSourceCreateThumbnailWithTransform),
//   because the re-encode drops the orientation tag. All boxes (faces, OCR, Gemini) live on this oriented master.
// - The cloud copy is a re-encode of PIXELS ONLY (CGImageDestinationAddImage with no properties). Never
//   CGImageDestinationCopyImageSource: it leaves GPS in HEIC and PNG.
// - Masks are solid black fills composited with Core Image, never blur (invariant 6).
import CoreImage
import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct DecodedPhoto: @unchecked Sendable {
  let master: CGImage
  /// The imported file carried GPS metadata (removed here: the master is pixels only).
  let hadGPS: Bool
  var width: Double { Double(master.width) }
  var height: Double { Double(master.height) }
}

enum ImagePipeline {
  /// Cloud copy long side (the web's 1536-px cloud frame).
  static let cloudMaxPx = 1536
  /// Masters above this are downscaled on decode (memory on an 8 GB Mac running the Simulator).
  static let masterMaxPx = 2400

  static func decode(_ data: Data) -> DecodedPhoto? {
    guard let src = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(src) > 0 else { return nil }
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] ?? [:]
    let hadGPS = props[kCGImagePropertyGPSDictionary] != nil
    let w = (props[kCGImagePropertyPixelWidth] as? Int) ?? masterMaxPx
    let h = (props[kCGImagePropertyPixelHeight] as? Int) ?? masterMaxPx
    let opts: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: min(masterMaxPx, max(w, h)),
      kCGImageSourceShouldCacheImmediately: true,
    ]
    guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
    return DecodedPhoto(master: cg, hadGPS: hadGPS)
  }

  /// Pixels only: no properties are written, so no GPS / TIFF / maker data can survive.
  static func jpeg(_ cg: CGImage, quality: Double = 0.85) -> Data? {
    let out = NSMutableData()
    guard let d = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(d, cg, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    guard CGImageDestinationFinalize(d) else { return nil }
    return out as Data
  }

  /// The gate's metadata check on the exact outgoing bytes: no {GPS}, no {TIFF}, no IPTC/maker dictionaries, and Exif
  /// limited to the basics ImageIO always writes (ColorSpace, pixel dimensions).
  static func metadataClean(_ jpeg: Data) -> Bool {
    guard let src = CGImageSourceCreateWithData(jpeg as CFData, nil),
          CGImageSourceGetType(src) as String? == UTType.jpeg.identifier,
          let p = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] else { return false }
    if p[kCGImagePropertyGPSDictionary] != nil || p[kCGImagePropertyTIFFDictionary] != nil || p[kCGImagePropertyIPTCDictionary] != nil
      || p[kCGImagePropertyMakerAppleDictionary] != nil { return false }
    if let exif = p[kCGImagePropertyExifDictionary] as? [CFString: Any] {
      let allowed: Set<String> = [kCGImagePropertyExifColorSpace as String, kCGImagePropertyExifPixelXDimension as String, kCGImagePropertyExifPixelYDimension as String]
      if !Set(exif.keys.map { $0 as String }).isSubset(of: allowed) { return false }
    }
    return true
  }

  private static let ci = CIContext(options: [.useSoftwareRenderer: false])

  /// Solid black rectangles (master px, upper-left origin) over the image. Never blur.
  static func applySolidMasks(_ cg: CGImage, _ rects: [PxRect]) -> CGImage {
    guard !rects.isEmpty else { return cg }
    let H = Double(cg.height)
    var img = CIImage(cgImage: cg)
    for r in rects where r.w > 0 && r.h > 0 {
      let ciRect = CGRect(x: r.x.rounded(.down), y: (H - r.y - r.h).rounded(.down), width: r.w.rounded(.up) + 1, height: r.h.rounded(.up) + 1)
      img = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 1)).cropped(to: ciRect).composited(over: img)
    }
    return ci.createCGImage(img, from: CGRect(x: 0, y: 0, width: cg.width, height: cg.height)) ?? cg
  }

  static func crop(_ cg: CGImage, _ r: PxRect?) -> CGImage {
    guard let r, let c = cg.cropping(to: r.cg.integral) else { return cg }
    return c
  }

  /// Downscale so the long side is at most `maxPx` (the cloud frame). Returns the image and its frame in master px.
  static func cloudFrame(_ cg: CGImage, cropInMaster: PxRect, maxPx: Int = cloudMaxPx) -> (CGImage, ImageFrame) {
    let w = cg.width, h = cg.height
    let s = min(1, Double(maxPx) / Double(max(w, h)))
    let tw = max(1, Int((Double(w) * s).rounded())), th = max(1, Int((Double(h) * s).rounded()))
    var out = cg
    if s < 1, let ctx = CGContext(data: nil, width: tw, height: th, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) {
      ctx.interpolationQuality = .high
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: tw, height: th))
      out = ctx.makeImage() ?? cg
    }
    return (out, ImageFrame(width: Double(out.width), height: Double(out.height), cropInMaster: cropInMaster))
  }

  /// Fraction of a box (upper-left px) that is solid black: how the DEBUG fake adversary "sees" a mask.
  static func blackFraction(_ cg: CGImage, _ r: PxRect) -> Double {
    let rect = r.cg.integral.intersection(CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    guard rect.width >= 1, rect.height >= 1, let sub = cg.cropping(to: rect) else { return 0 }
    let w = 32, h = 32
    var px = [UInt8](repeating: 0, count: w * h * 4)
    guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return 0 }
    ctx.interpolationQuality = .none
    ctx.draw(sub, in: CGRect(x: 0, y: 0, width: w, height: h))
    var black = 0
    for i in stride(from: 0, to: px.count, by: 4) where px[i] < 12 && px[i + 1] < 12 && px[i + 2] < 12 { black += 1 }
    return Double(black) / Double(w * h)
  }

  static func sha256Hex(_ d: Data) -> String {
    SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined()
  }
}
