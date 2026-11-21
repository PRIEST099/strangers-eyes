// ios/StrangersEyes/AI/PromptLibrary.swift: reads the bundled shared/prompts folder (ARCH §19.3; prompts live in
// shared/prompts, never inline). {{NAME}} variables are filled with compact JSON; a missing variable is an error.
import Foundation

enum PromptLibrary {
  static func text(_ file: String) -> String? {
    let ns = file as NSString
    guard let url = Bundle.main.url(forResource: ns.deletingPathExtension, withExtension: ns.pathExtension, subdirectory: "prompts") else { return nil }
    return try? String(contentsOf: url, encoding: .utf8)
  }

  static func json(_ file: String) -> Any? {
    let ns = file as NSString
    guard let url = Bundle.main.url(forResource: ns.deletingPathExtension, withExtension: ns.pathExtension, subdirectory: "prompts"),
          let d = try? Data(contentsOf: url) else { return nil }
    return try? JSONSerialization.jsonObject(with: d)
  }

  /// Fill {{NAME}} with the compact JSON of each value. Returns nil if a variable is missing or left over.
  static func render(_ template: String, _ vars: [String: Any]) -> String? {
    var out = template
    for (k, v) in vars {
      guard JSONSerialization.isValidJSONObject(v), let d = try? JSONSerialization.data(withJSONObject: v, options: [.sortedKeys, .withoutEscapingSlashes]) else { return nil }
      out = out.replacingOccurrences(of: "{{\(k)}}", with: String(decoding: d, as: UTF8.self))
    }
    return out.contains("{{") ? nil : out
  }

  // The S3 pass-B prompt (static: no dynamic segment may ever be added, the gate checks it against these files).
  static var advBSystem: String { text("advB.v1.system.md") ?? "" }
  static var advBUser: String { text("advB.v1.user.md") ?? "" }
}
