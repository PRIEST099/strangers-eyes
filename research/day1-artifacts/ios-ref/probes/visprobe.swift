import Foundation
import Vision
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers
import Security
import CoreLocation

func makeImage() -> CGImage {
  let w = 1000, h = 400
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 72, nil)
  let attr = NSAttributedString(string: "ST MARY PRIMARY", attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
  ctx.textPosition = CGPoint(x: 60, y: 250); CTLineDraw(CTLineCreateWithAttributedString(attr), ctx)
  let attr2 = NSAttributedString(string: "Rua Augusta 21", attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
  ctx.textPosition = CGPoint(x: 60, y: 80); CTLineDraw(CTLineCreateWithAttributedString(attr2), ctx)
  return ctx.makeImage()!
}

@main struct P { static func main() async {
  let img = makeImage()
  let size = CGSize(width: img.width, height: img.height)
  do {
    var req = RecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    let obs = try await req.perform(on: img)
    for o in obs {
      guard let c = o.topCandidates(1).first else { continue }
      let r = o.boundingBox.toImageCoordinates(size, origin: .upperLeft)
      print("text:", c.string, "conf:", c.confidence, "rect(upperLeft px):", r)
      if let range = c.string.range(of: "MARY"), let wb = c.boundingBox(for: range) {
        print("  word MARY box:", wb.boundingBox.toImageCoordinates(size, origin: .upperLeft))
      }
    }
    let faces = try await DetectFaceRectanglesRequest().perform(on: img)
    print("faces:", faces.count)
    let labels = try await ClassifyImageRequest().perform(on: img)
    print("labels:", labels.filter { $0.confidence > 0.1 }.prefix(3).map { "\($0.identifier) \($0.confidence)" })
    // combined perform via handler
    let handler = ImageRequestHandler(img)
    let (t2, f2) = try await handler.perform(RecognizeTextRequest(), DetectFaceRectanglesRequest())
    print("handler combined:", t2.count, f2.count)
  } catch { print("vision error:", error) }
  // metadata strip
  let out = NSMutableData()
  if let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) {
    let props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.9]
    CGImageDestinationAddImage(dest, img, props as CFDictionary)
    print("jpeg finalize:", CGImageDestinationFinalize(dest), out.length)
    if let src = CGImageSourceCreateWithData(out, nil), let p = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] {
      print("has GPS:", p[kCGImagePropertyGPSDictionary] != nil, "has Exif:", p[kCGImagePropertyExifDictionary] != nil, "keys:", p.keys.map { $0 as String }.sorted())
    }
  }
  // keychain
  let q: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: "probe.vault", kSecAttrAccount: "vault.v1",
                            kSecValueData: Data("{}".utf8), kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
  SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: "probe.vault"] as CFDictionary)
  print("keychain add:", SecItemAdd(q as CFDictionary, nil))
  var res: AnyObject?
  let st = SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrService: "probe.vault", kSecAttrAccount: "vault.v1", kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne] as CFDictionary, &res)
  print("keychain read:", st, (res as? Data).map { String(decoding: $0, as: UTF8.self) } ?? "nil")
  print("CL auth:", CLLocationManager().authorizationStatus.rawValue)
}}
