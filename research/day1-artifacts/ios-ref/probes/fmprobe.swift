import Foundation
import FoundationModels

@main
struct Probe {
  static func main() async {
    let m = SystemLanguageModel.default
    print("availability:", m.availability)
    print("isAvailable:", m.isAvailable)
    print("contextSize:", m.contextSize)
    if #available(macOS 27.0, iOS 27.0, *) {
      print("variant:", m.variant.displayName)
      print("caps vision:", m.capabilities.contains(.vision), "tools:", m.capabilities.contains(.toolCalling), "guided:", m.capabilities.contains(.guidedGeneration), "reasoning:", m.capabilities.contains(.reasoning))
    }
    guard m.isAvailable else { return }
    let s = LanguageModelSession(instructions: "Answer in one short sentence.")
    do {
      let t0 = Date()
      let r = try await s.respond(to: "Say hello and name one color.")
      print("response:", r.content, "latency:", Date().timeIntervalSince(t0))
    } catch { print("error:", error) }
  }
}
