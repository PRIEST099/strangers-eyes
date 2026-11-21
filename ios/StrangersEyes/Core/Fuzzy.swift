// ios/StrangersEyes/Core/Fuzzy.swift: port of web/src/tier0/fuzzy.ts, THE vault matcher (D-38; SPEC SCR-06, ARCH §8.4).
// One algorithm for Tier-0 OCR, the gate's image re-check, the cloud prompt scan and the rules referee.
// Parity: shared/testvectors/fuzzy.json (FuzzyTests). Lengths and Levenshtein run on UTF-16 code units, exactly as the
// JS string functions do; general categories (\p{L}, \p{N}, \p{M}, \p{Cf}) are read from Unicode scalar properties.
// Vault strings flow through here: no logging (R9).
import Foundation

enum Fuzzy {
  static let defaultThreshold = 0.8
  static let thresholdMin = 0.6
  static let thresholdMax = 0.98

  static func clampThreshold(_ x: Double?) -> Double {
    guard let x, x.isFinite else { return defaultThreshold }
    return min(thresholdMax, max(thresholdMin, x))
  }

  static let functionWords: Set<String> = ["the", "of", "and", "for", "at", "in", "on"]
  static func foldWord(_ t: String) -> String { Enums.wordFolds[t] ?? t }
  private static let genericFolded: Set<String> = Set(Enums.wordFolds.filter { Enums.genericWords.contains($0.key) }.map(\.value))
  static func isGeneric(_ t: String) -> Bool { Enums.genericWords.contains(t) || genericFolded.contains(t) }
  static func isDistinctive(_ t: String) -> Bool { t.utf16.count >= 4 && !isGeneric(t) }

  // ---------- Unicode classes ----------
  static func isL(_ s: Unicode.Scalar) -> Bool {
    switch s.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: return true
    default: return false
    }
  }
  static func isN(_ s: Unicode.Scalar) -> Bool {
    switch s.properties.generalCategory {
    case .decimalNumber, .letterNumber, .otherNumber: return true
    default: return false
    }
  }
  static func isM(_ s: Unicode.Scalar) -> Bool {
    switch s.properties.generalCategory {
    case .spacingMark, .nonspacingMark, .enclosingMark: return true
    default: return false
    }
  }
  static func isCf(_ s: Unicode.Scalar) -> Bool { s.properties.generalCategory == .format }
  /// JS `\s` (ECMAScript WhiteSpace + LineTerminator).
  static func isJSSpace(_ s: Unicode.Scalar) -> Bool {
    switch s.value {
    case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
    default: return false
    }
  }

  private static func stripMarksNFKD(_ s: String) -> String {
    var out = String.UnicodeScalarView()
    for u in s.decomposedStringWithCompatibilityMapping.unicodeScalars where !isM(u) { out.append(u) }
    return String(out)
  }

  /// SPEC SCR-06: NFKD, no diacritics, lowercase, apostrophes and format characters deleted, & → " and ", every
  /// other non-letter/number run → one space, trimmed.
  static func normalize(_ s: String) -> String {
    let lower = stripMarksNFKD(s).lowercased()
    var out = String.UnicodeScalarView()
    var pendingSpace = false
    func emit(_ u: Unicode.Scalar) {
      if pendingSpace && !out.isEmpty { out.append(" ") }
      pendingSpace = false
      out.append(u)
    }
    for u in lower.unicodeScalars {
      if u == "'" || u == "\u{2018}" || u == "\u{2019}" || u == "\u{02BC}" || isCf(u) { continue }
      if u == "&" { pendingSpace = true; for c in "and".unicodeScalars { emit(c) }; pendingSpace = true; continue }
      if isL(u) || isN(u) { emit(u) } else { pendingSpace = true }
    }
    return String(out)
  }

  /// Digit kinds: NFKD, no diacritics, uppercase, letters and digits only ("SE-1234" → "SE1234").
  static func alnum(_ s: String) -> String {
    var out = String.UnicodeScalarView()
    for u in stripMarksNFKD(s).uppercased().unicodeScalars where isL(u) || isN(u) { out.append(u) }
    return String(out)
  }

  /// OCR-confusable skeleton (0→o, 1/l→i, 5→s, 8→b), only for tokens that contain a letter.
  static func skeleton(_ t: String) -> String {
    guard t.unicodeScalars.contains(where: isL) else { return t }
    var out = String.UnicodeScalarView()
    for u in t.unicodeScalars {
      switch u {
      case "0": out.append("o")
      case "1", "l": out.append("i")
      case "5": out.append("s")
      case "8": out.append("b")
      default: out.append(u)
      }
    }
    return String(out)
  }

  static func levenshtein(_ a: [UInt16], _ b: [UInt16]) -> Int {
    var d = Array(0...b.count)
    if a.isEmpty { return b.count }
    for i in 1...a.count {
      var prev = d[0]
      d[0] = i
      if b.isEmpty { continue }
      for j in 1...b.count {
        let tmp = d[j]
        d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] == b[j - 1] ? 0 : 1))
        prev = tmp
      }
    }
    return d[b.count]
  }

  /// 1 − levenshtein / maxLength on the skeletons; tokens of ≤3 characters must be equal.
  static func tokenSim(_ a: String, _ b: String) -> Double {
    let x = Array(skeleton(a).utf16), y = Array(skeleton(b).utf16)
    if x.count <= 3 || y.count <= 3 { return x == y ? 1 : 0 }
    return 1 - Double(levenshtein(x, y)) / Double(max(x.count, y.count))
  }

  // ---------- words → tokens ----------
  struct Word: Equatable { var text: String; var line: Int = 0 }
  struct Tok: Equatable { var t: String; var from: Int; var to: Int; var line: Int }
  typealias Span = [Int]   // [from, to], inclusive

  private static func rawTokens(_ words: [Word]) -> [Tok] {
    var out: [Tok] = []
    for (i, w) in words.enumerated() {
      for t in normalize(w.text).split(separator: " ", omittingEmptySubsequences: true) {
        out.append(Tok(t: String(t), from: i, to: i, line: w.line))
      }
    }
    return out
  }

  /// On ONE OCR line, a run of single-character tokens ("L U C A S") becomes one token.
  private static func joinSpaced(_ toks: [Tok]) -> [Tok] {
    var out: [Tok] = []
    var run: [Tok] = []
    func flush() {
      if run.count >= 2 { out.append(Tok(t: run.map(\.t).joined(), from: run[0].from, to: run[run.count - 1].to, line: run[0].line)) }
      else { out.append(contentsOf: run) }
      run = []
    }
    for k in toks {
      if k.t.utf16.count == 1 && (run.isEmpty || run[0].line == k.line) { run.append(k) }
      else {
        flush()
        if k.t.utf16.count == 1 { run.append(k) } else { out.append(k) }
      }
    }
    flush()
    return out
  }

  private static func sequences(_ words: [Word]) -> [[Tok]] {
    let raw = rawTokens(words)
    let joined = joinSpaced(raw)
    let fold: ([Tok]) -> [Tok] = { $0.map { Tok(t: foldWord($0.t), from: $0.from, to: $0.to, line: $0.line) } }
    return joined.count == raw.count ? [fold(raw)] : [fold(joined), fold(raw)]
  }

  /// Normalised, spaced-letter-joined, folded tokens of a label or claim.
  static func tokens(_ s: String) -> [String] { joinSpaced(rawTokens([Word(text: s)])).map { foldWord($0.t) } }

  /// Whitespace-separated words of a prompt or echo text, all on one line.
  static func wordsOfText(_ text: String) -> [Word] {
    var out: [Word] = []
    var cur = String.UnicodeScalarView()
    for u in text.unicodeScalars {
      if isJSSpace(u) { if !cur.isEmpty { out.append(Word(text: String(cur))); cur = String.UnicodeScalarView() } }
      else { cur.append(u) }
    }
    if !cur.isEmpty { out.append(Word(text: String(cur))) }
    return out
  }

  // ---------- terms ----------
  enum Mode { case image, text }
  /// One vault string (a label or an alias). LOCAL ONLY.
  struct Term: Equatable { var vaultId: String; var kind: String; var text: String; var digit: Bool }
  static func isDigitKind(_ k: String) -> Bool { Enums.digitKinds.contains(k) }
  static func makeTerm(_ vaultId: String, _ kind: String, _ text: String) -> Term { Term(vaultId: vaultId, kind: kind, text: text, digit: isDigitKind(kind)) }

  private static func groupsOf(_ s: String) -> Int { normalize(s).split(separator: " ").count }
  private static let maxDigitWindow = 6

  private static func digitSpans(_ term: Term, _ words: [Word], _ mode: Mode) -> [Span] {
    let t = alnum(term.text)
    if t.isEmpty { return [] }
    let whole: [(a: String, i: Int)] = words.enumerated().map { (alnum($0.element.text), $0.offset) }.filter { !$0.0.isEmpty }
    let subs: [(a: String, i: Int)] = words.enumerated().flatMap { (i, w) in
      normalize(w.text).split(separator: " ", omittingEmptySubsequences: false).map { (alnum(String($0)), i) }
    }.filter { !$0.0.isEmpty }
    if t.utf16.count < 3 {
      if mode != .image { return [] }
      return (whole + subs).filter { $0.a == t }.map { [$0.i, $0.i] }
    }
    let maxW = min(maxDigitWindow, max(2, groupsOf(term.text)))
    var out: [Span] = []
    for (ws, win) in [(whole, maxW), (subs, maxDigitWindow)] {
      for s in 0..<ws.count {
        var acc = ""
        var k = s
        while k < ws.count && k - s < win && acc.utf16.count < t.utf16.count {
          acc += ws[k].a
          if acc == t { out.append([ws[s].i, ws[k].i]) }
          k += 1
        }
      }
    }
    return out
  }

  private static func textSpans(_ labelToks: [String], _ seq: [Tok], _ theta: Double) -> [Span] {
    let n = labelToks.count
    if n == 0 { return [] }
    let sim: (String, Tok) -> Bool = { tokenSim($0, $1.t) >= theta }
    var out: [Span] = []
    if n == 1 {
      let t = labelToks[0]
      if t.utf16.count < 4 && isGeneric(t) { return [] }
      for w in seq where sim(t, w) { out.append([w.from, w.to]) }
      return out
    }
    for t in labelToks where isDistinctive(t) { for w in seq where sim(t, w) { out.append([w.from, w.to]) } }   // (a)
    if n >= 2 {
      for i in 0..<(n - 1) {                                                                                     // (b)
        if functionWords.contains(labelToks[i]) && functionWords.contains(labelToks[i + 1]) { continue }
        if seq.count >= 2 {
          for j in 0..<(seq.count - 1) where sim(labelToks[i], seq[j]) && sim(labelToks[i + 1], seq[j + 1]) {
            out.append([seq[j].from, seq[j + 1].to])
          }
        }
      }
    }
    if seq.count >= n {                                                                                          // (c)
      for j in 0...(seq.count - n) where labelToks.enumerated().allSatisfy({ sim($0.element, seq[j + $0.offset]) }) {
        out.append([seq[j].from, seq[j + n - 1].to])
      }
    }
    return out
  }

  /// Sort and merge overlapping spans (spans that only touch stay separate).
  static func mergeSpans(_ spans: [Span]) -> [Span] {
    let s = spans.sorted { $0[0] != $1[0] ? $0[0] < $1[0] : $0[1] < $1[1] }
    var out: [Span] = []
    for sp in s {
      if let last = out.last, sp[0] <= last[1] { out[out.count - 1][1] = max(last[1], sp[1]) }
      else { out.append(sp) }
    }
    return out
  }

  struct Prepared { var words: [Word]; var seqs: [[Tok]] }
  private static let possessive = try! NSRegularExpression(pattern: "(\\p{L})['\u{2018}\u{2019}\u{02BC}][sS](?![\\p{L}\\p{N}])")

  private static func replacePossessive(_ t: String) -> String {
    possessive.stringByReplacingMatches(in: t, range: NSRange(t.startIndex..., in: t), withTemplate: "$1")
  }
  private static func cfAsSpace(_ t: String) -> String {
    var out = String.UnicodeScalarView()
    for u in t.unicodeScalars { out.append(isCf(u) ? " " : u) }
    return String(out)
  }

  /// The words of one scan with every reading the matcher scans (joined/unjoined, possessive 's removed, Cf as space).
  static func prepare(_ words: [Word]) -> Prepared {
    var seqs = sequences(words)
    func variant(_ f: (String) -> String) {
      let v = words.map { Word(text: f($0.text), line: $0.line) }
      if zip(v, words).contains(where: { $0.text != $1.text }) { seqs.append(contentsOf: sequences(v)) }
    }
    variant(replacePossessive)
    variant(cfAsSpace)
    return Prepared(words: words, seqs: seqs)
  }

  private static func spansIn(_ term: Term, _ p: Prepared, _ theta: Double, _ mode: Mode) -> [Span] {
    if term.digit { return mergeSpans(digitSpans(term, p.words, mode)) }
    let lt = tokens(term.text)
    return mergeSpans(p.seqs.flatMap { textSpans(lt, $0, theta) })
  }

  static func termSpans(_ term: Term, _ words: [Word], _ theta: Double, _ mode: Mode) -> [Span] { spansIn(term, prepare(words), theta, mode) }
  static func termInWords(_ term: Term, _ words: [Word], _ theta: Double, _ mode: Mode) -> Bool { !termSpans(term, words, theta, mode).isEmpty }

  struct WordHit { var term: Term; var spans: [Span] }
  /// Tier-0 and the gate's image re-check: every term found in the OCR words, with the word spans to mask (AC-110).
  static func matchWords(_ words: [Word], _ terms: [Term], _ theta: Double, _ mode: Mode = .image) -> [WordHit] {
    let p = prepare(words)
    return terms.compactMap { term in
      let s = spansIn(term, p, theta, mode)
      return s.isEmpty ? nil : WordHit(term: term, spans: s)
    }
  }

  /// Prompt scans: the first term found in `text`, or nil.
  static func findInText(_ text: String, _ terms: [Term], _ theta: Double) -> Term? {
    let p = prepare(wordsOfText(text))
    return terms.first { !spansIn($0, p, theta, .text).isEmpty }
  }
}
