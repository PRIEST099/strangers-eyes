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
    return fill(text, params)
  }

  /// The same, with the named placeholders dropped from the template together with one neighbouring " · " separator.
  /// Used where a value must never be shown (the attacker's guessed place name), whichever en.json is bundled.
  static func t(_ key: String, _ params: [String: String], omitting: Set<String>) -> String {
    guard var text = table[key] else { return key }
    for name in omitting {
      for pattern in ["\\s*·\\s*\\{\(NSRegularExpression.escapedPattern(for: name))\\}", "\\{\(NSRegularExpression.escapedPattern(for: name))\\}\\s*·\\s*",
                      "\\{\(NSRegularExpression.escapedPattern(for: name))\\}"] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { continue }
        let r = NSRange(text.startIndex..., in: text)
        if re.firstMatch(in: text, range: r) != nil { text = re.stringByReplacingMatches(in: text, range: r, withTemplate: ""); break }
      }
    }
    return fill(text, params.filter { !omitting.contains($0.key) })
  }

  private static func fill(_ text: String, _ params: [String: String]) -> String {
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
