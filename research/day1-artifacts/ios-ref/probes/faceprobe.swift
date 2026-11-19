import Foundation
import Vision
import CoreML
import CoreGraphics

func blank() -> CGImage {
  let ctx = CGContext(data: nil, width: 640, height: 480, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 0.8, green: 0.7, blue: 0.6, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: 640, height: 480))
  return ctx.makeImage()!
}

@main struct P { static func main() async {
  let img = blank()
  var req = DetectFaceRectanglesRequest()
  print("supported:", req.supportedComputeStageDevices)
  do { let f = try await req.perform(on: img); print("default faces:", f.count) } catch { print("default error:", error) }
  if let cpu = MLComputeDevice.allComputeDevices.first(where: { if case .cpu = $0 { return true }; return false }) {
    req.setComputeDevice(cpu, for: .main)
    do { let f = try await req.perform(on: img); print("cpu faces:", f.count) } catch { print("cpu error:", error) }
  }
  // legacy API
  let legacy = VNDetectFaceRectanglesRequest()
  let h = VNImageRequestHandler(cgImage: img, options: [:])
  do { try h.perform([legacy]); print("legacy faces:", legacy.results?.count ?? -1) } catch { print("legacy error:", error) }
  let legacyText = VNRecognizeTextRequest()
  legacyText.recognitionLevel = .accurate
  do { try h.perform([legacyText]); print("legacy text ok:", legacyText.results?.count ?? -1) } catch { print("legacy text error:", error) }
}}
