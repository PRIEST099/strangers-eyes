import Foundation
import FoundationModels

struct ReportClue: Tool {
  let name = "reportClue"
  let description = "Report one location-revealing clue."
  @Generable struct Arguments {
    @Guide(description: "the clue text") var text: String
  }
  func call(arguments: Arguments) async throws -> String {
    print("TOOL CALLED:", arguments.text); return "recorded"
  }
}

@main
struct Probe {
  static func main() async {
    for attempt in 1...2 {
      do {
        let s = LanguageModelSession(tools: [ReportClue()], instructions: "Use the reportClue tool for each clue.")
        let t0 = Date()
        let r = try await s.respond(to: "Clues: ST MARY PRIMARY; Rua Augusta 21")
        print("attempt \(attempt) final:", r.content, Date().timeIntervalSince(t0))
      } catch { print("attempt \(attempt) error:", String(describing: error).prefix(300)) }
    }
    // instructions-only session (no tools) to isolate whether instructions trigger the catalog error
    do {
      let s = LanguageModelSession(instructions: "You are a privacy referee. Reply in one word.")
      let r = try await s.respond(to: "Is 'ST MARY PRIMARY' a school? yes or no")
      print("instructions-only:", r.content)
    } catch { print("instructions-only error:", String(describing: error).prefix(300)) }
  }
}
