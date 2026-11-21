// ios/StrangersEyes/AI/SchemaFromJSON.swift: advB.v1.schema.json → FirebaseAILogic Schema for pass B's
// GenerationConfig(responseMIMEType: "application/json", responseSchema:) (ARCH §19.4, API-NOTES §3.7; U-30).
// JSONSerialization loses key order, so propertyOrdering is read from the file's raw text order (clues before
// hypotheses, D-64). Only the JSON-schema features the file uses are supported; anything else returns nil (fail closed).
import FirebaseAILogic
import Foundation

enum SchemaFromJSON {
  static func advB() -> Schema? {
    guard let url = Bundle.main.url(forResource: "advB.v1.schema", withExtension: "json", subdirectory: "prompts"),
          let data = try? Data(contentsOf: url), let raw = String(data: data, encoding: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    return convert(obj, raw: raw)
  }

  /// Property names of an object in the order they appear in the raw file text (first occurrence after the
  /// previous one), which is the schema author's order.
  static func ordering(_ keys: [String], raw: String) -> [String] {
    keys.sorted { a, b in
      (raw.range(of: "\"\(a)\"")?.lowerBound ?? raw.endIndex) < (raw.range(of: "\"\(b)\"")?.lowerBound ?? raw.endIndex)
    }
  }

  static func convert(_ o: [String: Any], raw: String) -> Schema? {
    let desc = o["description"] as? String
    switch o["type"] as? String {
    case "object":
      guard let props = o["properties"] as? [String: [String: Any]] else { return nil }
      var out: [String: Schema] = [:]
      for (k, v) in props { guard let s = convert(v, raw: raw) else { return nil }; out[k] = s }
      let required = Set(o["required"] as? [String] ?? Array(props.keys))
      let optional = props.keys.filter { !required.contains($0) }.sorted()
      return .object(properties: out, optionalProperties: optional, propertyOrdering: ordering(Array(props.keys), raw: raw), description: desc)
    case "array":
      guard let items = o["items"] as? [String: Any], let s = convert(items, raw: raw) else { return nil }
      return .array(items: s, description: desc, minItems: o["minItems"] as? Int, maxItems: o["maxItems"] as? Int)
    case "string":
      if let e = o["enum"] as? [String] { return .enumeration(values: e, description: desc) }
      return .string(description: desc)
    case "integer": return .integer(description: desc)
    case "number": return .double(description: desc)
    case "boolean": return .boolean(description: desc)
    default: return nil
    }
  }
}
