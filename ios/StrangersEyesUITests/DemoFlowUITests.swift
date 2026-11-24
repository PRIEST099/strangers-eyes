// ios/StrangersEyesUITests/DemoFlowUITests.swift: one recorded Simulator run of iOS Judge Mode with REAL taps (T-131):
// home → Judge Mode → the level-crossing sample (judge-02, CC0) with its fake vault → Tier-0 + the Apple FM text
// pre-screen on this device → consent to the exact redacted image → the attacker's RECORDED real Gemini answer replayed
// through the Egress Gate (CACHED SAMPLE, no network) → the Apple FM referee on this device → verdict → rules fix →
// consent again → the recorded after-fix answer → "Risk reduced". Screenshots go to $SCREENSHOT_DIR as
// ios-judge-NN-*.png (pass TEST_RUNNER_SCREENSHOT_DIR=… to xcodebuild) and are attached to the result bundle.
// No -fakeAdversary: the DEBUG stand-in attacker plays no part in this run.
import XCTest

@MainActor
final class DemoFlowUITests: XCTestCase {
  let app = XCUIApplication()
  var dir: String? { ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] }

  func shot(_ name: String) {
    let s = XCUIScreen.main.screenshot()
    let a = XCTAttachment(screenshot: s); a.name = name; a.lifetime = .keepAlways; add(a)
    if let dir { try? s.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")) }
  }

  /// Scroll until the element is on screen above the compact HUD (at most 8 swipes).
  func reveal(_ e: XCUIElement) {
    for _ in 0..<8 where !(e.isHittable && e.frame.maxY < app.frame.maxY - 120) { app.swipeUp() }
  }

  func testJudgeModeLevelCrossingReachesRiskReduced() throws {
    continueAfterFailure = false
    app.launchArguments = ["-acceptWelcome"]
    app.launch()
    XCTAssertTrue(app.buttons["judgeButton"].waitForExistence(timeout: 30))
    shot("ios-judge-01-home")

    reveal(app.buttons["judgeButton"])
    app.buttons["judgeButton"].tap()
    let run = app.buttons["run-judge-02"]
    XCTAssertTrue(run.waitForExistence(timeout: 15), "Judge Mode samples")
    shot("ios-judge-02-samples")
    run.tap()

    XCTAssertTrue(app.buttons["cloudButton"].waitForExistence(timeout: 240), "Tier-0 and the on-device pre-screen finished")
    shot("ios-judge-03-prescreen")
    reveal(app.buttons["cloudButton"])
    app.buttons["cloudButton"].tap()
    XCTAssertTrue(app.buttons["sendButton"].waitForExistence(timeout: 60), "consent sheet")
    shot("ios-judge-04-consent")
    app.buttons["sendButton"].tap()

    let running = app.staticTexts["Referee comparing guesses with your vault… on this device"]
    if running.waitForExistence(timeout: 20) { shot("ios-judge-05-referee-running") }
    XCTAssertTrue(app.buttons["fixButton"].waitForExistence(timeout: 300), "verdict")
    shot("ios-judge-06-verdict")
    reveal(app.buttons["fixButton"])
    shot("ios-judge-07-verdict-clues")

    app.buttons["fixButton"].tap()
    XCTAssertTrue(app.buttons["reattackButton"].waitForExistence(timeout: 20))
    reveal(app.buttons["reattackButton"])
    shot("ios-judge-08-fix")
    app.buttons["reattackButton"].tap()
    XCTAssertTrue(app.buttons["sendButton"].waitForExistence(timeout: 60), "re-attack consent sheet")
    shot("ios-judge-09-reattack-consent")
    app.buttons["sendButton"].tap()

    let headline = app.staticTexts["compareHeadline"]
    XCTAssertTrue(headline.waitForExistence(timeout: 300), "compare")
    shot("ios-judge-10-compare")
    XCTAssertTrue(headline.label.hasPrefix("Risk reduced"), headline.label)
    app.swipeUp()
    shot("ios-judge-11-after-verdict")

    app.buttons["hudToggle"].tap()
    XCTAssertTrue(app.staticTexts["ledgerCounters"].waitForExistence(timeout: 5))
    shot("ios-judge-12-hud")
  }
}
