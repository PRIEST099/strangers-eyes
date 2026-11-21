// ios/StrangersEyes/Core/Strings.swift: UI copy from the bundled shared/strings/en.json (ARCH §19.2; never inline copy).
// The web twin is web/src/core/strings.ts. A missing key shows the key itself, and a missing {name} parameter stays in
// place, so gaps are visible, never silent (the web's lenient mode).
import Foundation

enum Strings {
  /// Flat map of copy keys ("ui.app.name") to text, loaded once from Bundle.main/strings/en.json (a folder resource).
  static let table: [String: String] = {
    guard let url = Bundle.main.url(forResource: "en", withExtension: "json", subdirectory: "strings"),
          let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return obj.compactMapValues { $0 as? String }
  }()

  private static let placeholder = try! NSRegularExpression(pattern: "\\{([^{}]+)\\}")

  static func t(_ key: String) -> String { table[key] ?? key }

  /// `{name}` placeholders (SPEC §11); names may contain spaces and capitals ({band words}, {KIND}).
  static func t(_ key: String, _ params: [String: String]) -> String {
    guard let text = table[key] else { return key }
    let ns = text as NSString
    var out = ""
    var last = 0
    for m in placeholder.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
      out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
      let name = ns.substring(with: m.range(at: 1))
      out += params[name] ?? ns.substring(with: m.range)
      last = m.range.location + m.range.length
    }
    out += ns.substring(from: last)
    return out
  }
}
