// ios/StrangersEyesUITests/DemoFlowUITests.swift: one recorded Simulator run of the full loop with REAL taps (T-131,
// lean): synthetic photo → Tier-0 → consent to the exact image → attack (DEBUG fake attacker, no network) → on-device
// referee → verdict → rules fix → consent again → re-attack → "Risk reduced". Screenshots go to $SCREENSHOT_DIR
// (pass TEST_RUNNER_SCREENSHOT_DIR=… to xcodebuild) and are attached to the result bundle.
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

  /// Scroll until the element is on screen above the HUD (at most 6 swipes).
  func reveal(_ e: XCUIElement) {
    for _ in 0..<6 where !(e.isHittable && e.frame.maxY < app.frame.maxY - 260) { app.swipeUp() }
  }

  func testFullLoopWithFakeAttacker() throws {
    continueAfterFailure = false
    app.launchArguments = ["-fakeAdversary", "-seedDemoVault", "-acceptWelcome"]
    app.launch()
    XCTAssertTrue(app.buttons["vaultButton"].waitForExistence(timeout: 20))
    shot("ios-02-home")

    app.buttons["vaultButton"].tap()
    XCTAssertTrue(app.navigationBars.buttons["Continue"].waitForExistence(timeout: 10))
    shot("ios-03-vault")
    app.navigationBars.buttons["Continue"].tap()

    app.buttons["sampleButton"].tap()
    XCTAssertTrue(app.buttons["cloudButton"].waitForExistence(timeout: 60), "Tier-0 finished")
    shot("ios-04-tier0")

    app.swipeUp()   // the Router HUD overlays the bottom of the scroll view: bring the button above it
    app.buttons["cloudButton"].tap()
    if !app.buttons["sendButton"].waitForExistence(timeout: 60) { shot("debug-no-consent") }
    XCTAssertTrue(app.buttons["sendButton"].exists, "consent sheet")
    shot("ios-05-consent")
    app.buttons["sendButton"].tap()

    let running = app.staticTexts["Referee comparing guesses with your vault… on this device"]
    if running.waitForExistence(timeout: 20) { shot("ios-06-referee-running") }
    XCTAssertTrue(app.buttons["fixButton"].waitForExistence(timeout: 240), "verdict")
    shot("ios-07-verdict")
    reveal(app.buttons["fixButton"])
    shot("ios-08-verdict-lines")

    app.buttons["fixButton"].tap()
    XCTAssertTrue(app.buttons["reattackButton"].waitForExistence(timeout: 20))
    reveal(app.buttons["reattackButton"])
    shot("ios-09-fix")
    app.buttons["reattackButton"].tap()
    XCTAssertTrue(app.buttons["sendButton"].waitForExistence(timeout: 60), "re-attack consent sheet")
    shot("ios-10-reattack-consent")
    app.buttons["sendButton"].tap()

    let headline = app.staticTexts["compareHeadline"]
    XCTAssertTrue(headline.waitForExistence(timeout: 240), "compare")
    XCTAssertTrue(headline.label.hasPrefix("Risk reduced"), headline.label)
    shot("ios-11-risk-reduced")
    app.swipeUp()
    shot("ios-12-after-verdict")
  }
}
