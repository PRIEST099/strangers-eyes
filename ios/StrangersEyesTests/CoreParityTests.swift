// ios/StrangersEyesTests/CoreParityTests.swift: the Swift core ports run the SAME shared/testvectors as Vitest
// (T-121, AC-168): bands.json (Geo), fuzzy.json (Fuzzy, VaultScan), referee.json (Referee), verdict.json (VerdictEngine).
// Every case of every listed fn runs; a failure names the case.
import XCTest
@testable import StrangersEyes

final class CoreParityTests: XCTestCase {

  // ---------- bands.json ----------
  func testBandsVectors() throws {
    let v = try Vectors.load("bands")
    var n = 0
    // Explicit thresholds are passed as is (not via the RC validation, D-77), like the web's bandFor(m, t).
    func th(_ c: [String: Any]) -> BandThresholds {
      guard let t = c["thresholdsM"] as? [String: Any] else { return Geo.defaultBands }
      return BandThresholds(street: dbl(t["street"]), neighbourhood: dbl(t["neighbourhood"]), district: dbl(t["district"]), city: dbl(t["city"]), country: dbl(t["country"]))
    }
    for c in Vectors.cases(v, "haversine") {
      let a = c["a"] as! [String: Any], b = c["b"] as! [String: Any], e = c["expect"] as! [String: Any]
      let m1 = Geo.haversineMeters(dbl(a["lat"]), dbl(a["lng"]), dbl(b["lat"]), dbl(b["lng"]))
      let m2 = Geo.haversineMeters(dbl(b["lat"]), dbl(b["lng"]), dbl(a["lat"]), dbl(a["lng"]))
      XCTAssertEqual(m1, dbl(e["meters"]), accuracy: dbl(e["tolM"]), c["name"] as! String)
      XCTAssertEqual(m2, dbl(e["meters"]), accuracy: dbl(e["tolM"]), c["name"] as! String)
      n += 1
    }
    for c in Vectors.cases(v, "band") {
      let e = c["expect"] as! [String: Any]
      XCTAssertEqual(Geo.bandFor(dbl(c["m"]), th(c)), e["band"] as? String, c["name"] as! String); n += 1
    }
    for c in Vectors.cases(v, "thresholds") {
      let e = (c["expect"] as! [String: Any])["thresholdsM"] as! [String: Any]
      let t = Geo.thresholdsOrDefault(c["raw"])
      let got: [String: Any] = ["street": t.street, "neighbourhood": t.neighbourhood, "district": t.district, "city": t.city, "country": t.country]
      XCTAssertTrue(jsonEqual(got, e), "\(c["name"]!): \(got)"); n += 1
    }
    for c in Vectors.cases(v, "effective") {
      let p = c["pin"] as! [String: Any], h = c["hypothesis"] as! [String: Any], e = c["expect"] as! [String: Any]
      let hyp = AdversaryHypothesis(id: "h", label: "", level: "city", lat: dbl(h["lat"]), lng: dbl(h["lng"]), radiusKm: dbl(h["radiusKm"]), confidence: "low", clueIds: [])
      XCTAssertEqual(Geo.effectiveMeters(hyp, Pin(lat: dbl(p["lat"]), lng: dbl(p["lng"]))), dbl(e["meters"]), accuracy: max(1e-6, dbl(e["tolM"])), c["name"] as! String); n += 1
    }
    for c in Vectors.cases(v, "pinBand") {
      let p = c["pin"] as! [String: Any], e = c["expect"] as! [String: Any]
      let hs = (c["hypotheses"] as? [[String: Any]] ?? []).map(hypothesis)
      let pb = Geo.pinBand("v", Pin(lat: dbl(p["lat"]), lng: dbl(p["lng"])), hs, th(c))
      XCTAssertEqual(pb.band, e["band"] as? String, c["name"] as! String)
      XCTAssertTrue(jsonEqual(pb.hypothesisId, e["hypothesisId"] is NSNull ? nil : e["hypothesisId"]), c["name"] as! String)
      XCTAssertTrue(jsonEqual(pb.confidence, e["confidence"] is NSNull ? nil : e["confidence"]), c["name"] as! String)
      n += 1
    }
    for c in Vectors.cases(v, "words") {
      let e = c["expect"] as! [String: Any], band = c["band"] as! String
      XCTAssertEqual(Geo.bandWordIds[band], e["id"] as? String, c["name"] as! String)
      XCTAssertEqual(Geo.bandWords(band), e["words"] as? String, c["name"] as! String); n += 1
    }
    XCTAssertEqual(n, (v["cases"] as! [Any]).count, "every bands.json case ran")
  }

  // ---------- fuzzy.json ----------
  func testFuzzyVectors() throws {
    let v = try Vectors.load("fuzzy")
    let terms = v["terms"] as! [String: [String: Any]]
    let theta0 = dbl(v["threshold"])
    var n = 0
    for c in Vectors.cases(v, "match") {
      let name = c["name"] as! String
      let t = terms[c["term"] as! String]!
      let term = Fuzzy.makeTerm(t["vaultId"] as! String, t["kind"] as! String, t["text"] as! String)
      let theta = c["threshold"] != nil ? dbl(c["threshold"]) : theta0
      let e = c["expect"] as! [String: Any]
      var words: [Fuzzy.Word] = []
      let mode: Fuzzy.Mode = (c["mode"] as? String) == "text" ? .text : .image
      if let text = c["text"] as? String { words = Fuzzy.wordsOfText(text) }
      else if let ws = c["words"] as? [String] { words = ws.map { Fuzzy.Word(text: $0, line: 0) } }
      else if let lines = c["lines"] as? [[String]] {
        for (li, l) in lines.enumerated() { words += l.map { Fuzzy.Word(text: $0, line: li) } }
      }
      let spans = Fuzzy.termSpans(term, words, theta, mode)
      XCTAssertEqual(!spans.isEmpty, e["match"] as? Bool, name)
      if let es = e["spans"] as? [[Int]] { XCTAssertEqual(spans, es, name) }
      n += 1
    }
    for c in Vectors.cases(v, "normalize") { XCTAssertEqual(Fuzzy.normalize(c["input"] as! String), c["expect"] as? String, c["name"] as! String); n += 1 }
    for c in Vectors.cases(v, "tokens") { XCTAssertEqual(Fuzzy.tokens(c["input"] as! String), c["expect"] as? [String], c["name"] as! String); n += 1 }
    for c in Vectors.cases(v, "alnum") { XCTAssertEqual(Fuzzy.alnum(c["input"] as! String), c["expect"] as? String, c["name"] as! String); n += 1 }
    for c in Vectors.cases(v, "tokenSim") {
      let e = c["expect"] as! [String: Any]
      XCTAssertEqual(Fuzzy.tokenSim(c["a"] as! String, c["b"] as! String), dbl(e["sim"]), accuracy: 1e-4, c["name"] as! String); n += 1
    }
    for c in Vectors.cases(v, "clampThreshold") {
      let input: Double? = (c["input"] as? NSNumber).flatMap { CFGetTypeID($0) == CFBooleanGetTypeID() ? nil : $0.doubleValue }
      XCTAssertEqual(Fuzzy.clampThreshold(input), dbl(c["expect"]), accuracy: 1e-12, c["name"] as! String); n += 1
    }
    for c in Vectors.cases(v, "termsOf") {
      let vault = (c["vault"] as! [[String: Any]]).map(vaultItem)
      let got = VaultScan.termsOf(vault).map { [$0.vaultId, $0.text, $0.digit] as [Any] }
      XCTAssertTrue(jsonEqual(got, c["expect"]), "\(c["name"]!): \(jsonString(got))"); n += 1
    }
    for c in Vectors.cases(v, "coords") {
      let pins = (c["pins"] as! [[String: Any]]).map { VaultScan.PinRef(vaultId: $0["vaultId"] as! String, kind: $0["kind"] as! String, lat: dbl($0["lat"]), lng: dbl($0["lng"])) }
      XCTAssertEqual(VaultScan.coordinatesNearPins(c["text"] as! String, pins), c["expect"] as? String, c["name"] as! String); n += 1
    }
    XCTAssertEqual(n, (v["cases"] as! [Any]).count, "every fuzzy.json case ran")
  }

  // ---------- referee.json ----------
  func testRefereeVectors() throws {
    let v = try Vectors.load("referee")
    let vault = (v["vault"] as! [String: [String: Any]]).mapValues { o in
      RefereeVaultItem(id: o["id"] as! String, kind: o["kind"] as! String, label: o["label"] as! String, aliases: strs(o["aliases"]))
    }
    let theta0 = dbl(v["threshold"])
    var n = 0
    for c in Vectors.cases(v, "strength") {
      let cl = c["claim"] as! [String: Any], e = c["expect"] as! [String: Any]
      let claim = RefereeClaim(id: "x", kind: cl["kind"] as! String, value: cl["value"] as! String, confidence: cl["confidence"] as! String, clueIds: [])
      let theta = c["threshold"] != nil ? dbl(c["threshold"]) : theta0
      let h = Referee.rulesStrength(claim, vault[c["vault"] as! String]!, theta)
      XCTAssertEqual(h?.strength, e["strength"] as? String, c["name"] as! String)
      if let rule = e["rule"] as? String { XCTAssertEqual(h?.rule, rule, c["name"] as! String) }
      n += 1
    }
    for c in Vectors.cases(v, "referee") {
      let claims = (c["claims"] as! [[String: Any]]).map {
        RefereeClaim(id: $0["id"] as! String, kind: $0["kind"] as! String, value: $0["value"] as! String, confidence: $0["confidence"] as! String, clueIds: strs($0["clueIds"]))
      }
      let items = (c["vault"] as! [String]).map { vault[$0]! }
      let theta = c["threshold"] != nil ? dbl(c["threshold"]) : theta0
      let got = Referee.rulesReferee(claims, items, theta).map(matchJSON)
      XCTAssertTrue(jsonEqual(got, (c["expect"] as! [String: Any])["matches"]), "\(c["name"]!): \(jsonString(got))"); n += 1
    }
    for c in Vectors.cases(v, "merge") {
      let r = Referee.mergeMatches((c["device"] as! [[String: Any]]).map(match), (c["rules"] as! [[String: Any]]).map(match))
      let e = c["expect"] as! [String: Any]
      XCTAssertTrue(jsonEqual(r.matches.map(matchJSON), e["matches"]), "\(c["name"]!): \(jsonString(r.matches.map(matchJSON)))")
      XCTAssertEqual(r.notes, e["notes"] as? [String], c["name"] as! String); n += 1
    }
    for c in Vectors.cases(v, "vaultItems") {
      let got = Referee.vaultItems((c["items"] as! [[String: Any]]).map(vaultItem)).map { ["id": $0.id, "kind": $0.kind, "label": $0.label, "aliases": $0.aliases] as [String: Any] }
      XCTAssertTrue(jsonEqual(got, c["expect"]), "\(c["name"]!): \(jsonString(got))"); n += 1
    }
    XCTAssertEqual(n, (v["cases"] as! [Any]).count, "every referee.json case ran")
  }

  // ---------- verdict.json ----------
  private func verdictInput(_ o: [String: Any], _ vault: [String: VaultItem]) -> VerdictInput {
    var adv: VerdictAdv?
    if let a = o["adv"] as? [String: Any] {
      adv = VerdictAdv(status: a["status"] as! String, hypotheses: (a["hypotheses"] as? [[String: Any]] ?? []).map(hypothesis),
                       inferences: (a["inferences"] as? [[String: Any]] ?? []).map(inference))
    }
    var input = VerdictInput(adv: adv, matches: (o["matches"] as? [[String: Any]] ?? []).map(match), vault: strs(o["vault"]).map { vault[$0]! })
    input.caught = (o["caught"] as? [[String: Any]] ?? []).map { CaughtItem(vaultId: $0["vaultId"] as! String, route: $0["route"] as! String) }
    input.echoedVaultIds = strs(o["echoedVaultIds"])
    if let f = o["prescreenFlags"] as? [String: Any] { input.prescreenFlags = PrescreenFlags(types: strs(f["types"]), route: f["route"] as! String) }
    input.bands = o["bands"] != nil ? Geo.thresholdsOrDefault(o["bands"]) : nil
    input.refused = o["refused"] as? Bool ?? false
    input.phase = o["phase"] as? String ?? "initial"
    return input
  }

  private func lineJSON(_ l: VerdictLine) -> [String: Any] {
    var o: [String: Any] = ["id": l.id, "kind": l.kind, "severity": l.severity, "copyId": l.copyId, "params": l.params, "clueIds": l.clueIds, "route": l.route]
    if let x = l.vaultId { o["vaultId"] = x }
    if let x = l.band { o["band"] = x }
    if let x = l.strength { o["strength"] = x }
    if let x = l.confidence { o["confidence"] = x }
    if let x = l.bandConfidence { o["bandConfidence"] = x }
    if let x = l.reason { o["reason"] = x }
    return o
  }

  func testVerdictVectors() throws {
    let v = try Vectors.load("verdict")
    let vault = (v["vault"] as! [String: [String: Any]]).mapValues(vaultItem)
    var n = 0
    for c in Vectors.cases(v, "build") {
      let name = c["name"] as! String
      let input = verdictInput(c["input"] as! [String: Any], vault)
      let vd = VerdictEngine.build(input)
      let e = c["expect"] as! [String: Any]
      XCTAssertEqual(vd.level, e["level"] as? String, name)
      XCTAssertEqual(VerdictEngine.headlineCopyId(vd.level), e["headlineId"] as? String, name)
      XCTAssertEqual(vd.noVault, e["noVault"] as? Bool, name)
      XCTAssertEqual(vd.noPins, e["noPins"] as? Bool, name)
      XCTAssertEqual(vd.phase, e["phase"] as? String, name)
      let lines = vd.lines.map(lineJSON)
      XCTAssertTrue(jsonEqual(lines, e["lines"]), "\(name) lines: \(jsonString(lines))")
      XCTAssertEqual(vd.lines.map(VerdictEngine.lineText), e["texts"] as? [String], name)
      let pbs = vd.pinBands.map { ["vaultId": $0.vaultId, "band": $0.band, "hypothesisId": $0.hypothesisId ?? NSNull(), "confidence": $0.confidence ?? NSNull(), "effectiveKm": NSNull()] as [String: Any] }
      XCTAssertTrue(jsonEqual(pbs, e["pinBands"]), "\(name) pinBands: \(jsonString(pbs))")
      XCTAssertEqual(vd.notLinkedVaultIds, e["notLinkedVaultIds"] as? [String], name)
      let bg: Any = vd.bestGuess.map { ["level": $0.level, "label": $0.label, "confidence": $0.confidence] } ?? NSNull()
      XCTAssertTrue(jsonEqual(bg, e["bestGuess"]), "\(name) bestGuess: \(jsonString(bg))")
      XCTAssertTrue(jsonEqual(VerdictEngine.bestGuessText(vd) ?? NSNull(), e["bestGuessText"]), name)
      XCTAssertTrue(jsonEqual(VerdictEngine.notLinkedText(vd, input.vault) ?? NSNull(), e["notLinkedText"]), "\(name): \(VerdictEngine.notLinkedText(vd, input.vault) ?? "nil")")
      if let em = e["matches"] { XCTAssertTrue(jsonEqual(vd.matches.map(matchJSON), em), "\(name) matches") }
      n += 1
    }
    for c in Vectors.cases(v, "compare") {
      let name = c["name"] as! String
      let b = VerdictEngine.build(verdictInput(c["before"] as! [String: Any], vault))
      let a = VerdictEngine.build(verdictInput(c["after"] as! [String: Any], vault))
      let cmp = VerdictEngine.compare(b, a)
      let e = c["expect"] as! [String: Any]
      XCTAssertEqual(cmp.riskReduced, e["riskReduced"] as? Bool, name)
      XCTAssertTrue(jsonEqual(cmp.worstRemainingLineId ?? NSNull(), e["worstRemainingLineId"]), name)
      let h = VerdictEngine.comparisonHeadline(cmp)
      XCTAssertTrue(jsonEqual(["copyId": h.copyId, "params": h.params], e["headline"]), "\(name): \(h)")
      n += 1
    }
    for c in Vectors.cases(v, "scrub") {
      let input = c["input"] as! String
      let got = (c["mode"] as? String) == "attacker" ? VerdictEngine.scrubAttackerText(input) : VerdictEngine.scrubNumbers(input)
      XCTAssertEqual(got, c["expect"] as? String, c["name"] as! String); n += 1
    }
    XCTAssertEqual(n, (v["cases"] as! [Any]).count, "every verdict.json case ran")
  }
}
