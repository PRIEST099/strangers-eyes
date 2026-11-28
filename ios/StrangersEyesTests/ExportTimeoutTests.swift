// ios/StrangersEyesTests/ExportTimeoutTests.swift: D-185. The covered copy's filename (AC-262) and the gate's attack
// deadline (F-330: a hung cloud call must end as a timeout, never a 15-minute wait or a "decline").
import XCTest
@testable import StrangersEyes

final class ExportTimeoutTests: XCTestCase {
  func testCoveredCopyFilename() {
    for _ in 0..<50 {
      let n = CoveredCopy.filename()
      XCTAssertNotNil(n.range(of: #"^strangers-eyes-[a-z2-9]{6}\.jpg$"#, options: .regularExpression), n)
    }
  }

  func testDeadlineFiresOnAHungCall() async {
    let t0 = Date()
    do {
      _ = try await EgressGate.withDeadline(.milliseconds(200)) { () async throws -> Int in
        try await Task.sleep(for: .seconds(30)); return 1
      }
      XCTFail("expected a timeout")
    } catch {
      XCTAssertTrue(error is EgressGate.DeadlineError)
    }
    XCTAssertLessThan(Date().timeIntervalSince(t0), 5)
  }

  func testDeadlinePassesAFastCall() async throws {
    let v = try await EgressGate.withDeadline(.seconds(5)) { () async throws -> Int in 7 }
    XCTAssertEqual(v, 7)
  }

  func testDeadlineReturnsEvenIfTheCallIgnoresCancellation() async {
    let t0 = Date()
    do {
      _ = try await EgressGate.withDeadline(.milliseconds(200)) { () async throws -> Int in
        let end = Date().addingTimeInterval(3); while Date() < end { /* ignores cancellation */ }; return 1
      }
      XCTFail("expected a timeout")
    } catch { XCTAssertTrue(error is EgressGate.DeadlineError) }
    XCTAssertLessThan(Date().timeIntervalSince(t0), 2)
  }

  func testNoAnswerIsNotCalledADecline() {
    XCTAssertEqual(AppModel.refusalCopyId(cloudFailed: true), "ui.adv.noAnswerIOS")
    XCTAssertEqual(AppModel.refusalCopyId(cloudFailed: false), "copy.adv.declined")
    XCTAssertFalse(Strings.t("ui.adv.noAnswerIOS").lowercased().contains("declin"))
  }

  func testAdvBTimeoutComesFromTheBundledRCDefault() {
    XCTAssertEqual(EgressGate.advBTimeout, .milliseconds(45_000))
  }
}
