// ios/StrangersEyes/Core/Strings.swift: UI copy from the bundled shared/strings/en.json (ARCH §19.2; never inline copy).
// The web twin is web/src/core/strings.ts. A missing key shows the key itself, so gaps are visible, never silent.
import Foundation

enum Strings {
  /// Flat map of copy keys ("ui.app.name") to text, loaded once from Bundle.main/strings/en.json (a folder resource).
  static let table: [String: String] = {
    guard let url = Bundle.main.url(forResource: "en", withExtension: "json", subdirectory: "strings"),
          let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return obj.compactMapValues { $0 as? String }
  }()

  static func t(_ key: String) -> String { table[key] ?? key }
}
