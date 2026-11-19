import Foundation
import FoundationModels
import CoreGraphics
import CoreText

@Generable
struct Clue {
  @Guide(description: "short label of the location clue")
  var label: String
  @Guide(description: "true if the clue reveals a place name")
  var revealsPlace: Bool
}

struct ReportClue: Tool {
  let name = "reportClue"
  let description = "Report one location-revealing clue found in the text."
  @Generable struct Arguments {
    @Guide(description: "the clue text") var text: String
    @Guide(description: "kind: school, street, business, other") var kind: String
  }
  func call(arguments: Arguments) async throws -> String {
    print("TOOL CALLED:", arguments.text, arguments.kind)
    return "recorded"
  }
}

func makeImage() -> CGImage {
  let w = 800, h = 300
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 64, nil)
  let attr = NSAttributedString(string: "ST MARY PRIMARY", attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
  let line = CTLineCreateWithAttributedString(attr)
  ctx.textPosition = CGPoint(x: 40, y: 120); CTLineDraw(line, ctx)
  return ctx.makeImage()!
}

@main
struct Probe {
  static func main() async {
    let m = SystemLanguageModel.default
    print("contextSize:", m.contextSize)
    // 1. warm text
    do { let s = LanguageModelSession(); let t0 = Date(); let r = try await s.respond(to: "Reply with the word OK."); print("warm text:", r.content, Date().timeIntervalSince(t0)) } catch { print("text error:", error) }
    // 2. image input on-device
    do {
      let s = LanguageModelSession(); let t0 = Date()
      let r = try await s.respond { "What text is written in this image? Reply with the text only."; Attachment(makeImage()) }
      print("image:", r.content, Date().timeIntervalSince(t0))
    } catch { print("image error:", error) }
    // 3. guided generation
    do {
      let s = LanguageModelSession(); let t0 = Date()
      let r = try await s.respond(to: "OCR text: 'ST MARY PRIMARY'. Extract the main clue.", generating: Clue.self)
      print("guided:", r.content.label, r.content.revealsPlace, Date().timeIntervalSince(t0))
    } catch { print("guided error:", error) }
    // 4. tool calling
    do {
      let s = LanguageModelSession(tools: [ReportClue()], instructions: "Call reportClue once for each location clue, then reply DONE.")
      let t0 = Date()
      let r = try await s.respond(to: "OCR lines: 'ST MARY PRIMARY', 'Rua Augusta 21', 'Hello'")
      print("tools final:", r.content, Date().timeIntervalSince(t0))
    } catch { print("tool error:", error) }
    // 5. token count
    do { let n = try await m.tokenCount(for: Prompt("Hello world, this is a test.")); print("tokenCount:", n) } catch { print("tokenCount error:", error) }
  }
}
