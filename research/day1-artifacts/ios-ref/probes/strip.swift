import Foundation
import ImageIO
import UniformTypeIdentifiers
import CoreGraphics

func img() -> CGImage {
  let ctx = CGContext(data: nil, width: 64, height: 64, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 64)); return ctx.makeImage()!
}
func props(_ d: Data) -> [String: Any] { let s = CGImageSourceCreateWithData(d as CFData, nil)!; return (CGImageSourceCopyPropertiesAtIndex(s, 0, nil) as? [String: Any]) ?? [:] }
func make(_ type: UTType) -> Data {
  let out = NSMutableData(); let d = CGImageDestinationCreateWithData(out, type.identifier as CFString, 1, nil)!
  let p: [CFString: Any] = [kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 38.71, kCGImagePropertyGPSLatitudeRef: "N", kCGImagePropertyGPSLongitude: 9.14, kCGImagePropertyGPSLongitudeRef: "W"],
    kCGImagePropertyExifDictionary: [kCGImagePropertyExifUserComment: "secret", kCGImagePropertyExifDateTimeOriginal: "2026:11:19 10:00:00"],
    kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "Apple", kCGImagePropertyTIFFModel: "iPhone"], kCGImagePropertyOrientation: 6]
  CGImageDestinationAddImage(d, img(), p as CFDictionary); CGImageDestinationFinalize(d); return out as Data
}
for t in [UTType.jpeg, UTType.heic, UTType.png] {
  let orig = make(t); let po = props(orig)
  print(t.identifier, "orig GPS:", po["{GPS}"] != nil, "TIFF:", po["{TIFF}"] != nil, "orient:", po["Orientation"] ?? "-")
  // A: lossless copy with metadata removal
  let src = CGImageSourceCreateWithData(orig as CFData, nil)!
  let outA = NSMutableData(); let dA = CGImageDestinationCreateWithData(outA, CGImageSourceGetType(src)!, 1, nil)!
  var err: Unmanaged<CFError>?
  let okA = CGImageDestinationCopyImageSource(dA, src, [kCGImageDestinationMetadata: CGImageMetadataCreateMutable(), kCGImageMetadataShouldExcludeGPS: true] as CFDictionary, &err)
  let pa = okA ? props(outA as Data) : [:]
  print("  A copySource ok:", okA, "GPS:", pa["{GPS}"] != nil, "Exif:", (pa["{Exif}"] as? [String: Any])?.keys.sorted() ?? [], "TIFF:", pa["{TIFF}"] != nil, "err:", err.map { String(describing: $0.takeRetainedValue()) } ?? "nil")
  // B: decode + re-encode pixels only
  let cg = CGImageSourceCreateImageAtIndex(src, 0, nil)!
  let outB = NSMutableData(); let dB = CGImageDestinationCreateWithData(outB, UTType.jpeg.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dB, cg, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary); CGImageDestinationFinalize(dB)
  let pb = props(outB as Data)
  print("  B re-encode TIFFdict:", pb["{TIFF}"] ?? "none", "GPS:", pb["{GPS}"] != nil, "Exif:", (pb["{Exif}"] as? [String: Any])?.keys.sorted() ?? [], "TIFF:", pb["{TIFF}"] != nil, "orient:", pb["Orientation"] ?? "-")
}
