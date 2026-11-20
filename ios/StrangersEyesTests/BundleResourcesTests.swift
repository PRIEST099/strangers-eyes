// ios/StrangersEyesTests/BundleResourcesTests.swift: the skeleton's smoke tests (T-027).
// The shared prompt and string files must be bundled as folder resources, exactly as the web build reads them.
import XCTest
@testable import StrangersEyes

final class BundleResourcesTests: XCTestCase {
  func testPromptManifestIsBundled() throws {
    let url = try XCTUnwrap(Bundle.main.url(forResource: "manifest", withExtension: "json", subdirectory: "prompts"))
    let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    let prompts = try XCTUnwrap(manifest["prompts"] as? [String: Any])
    XCTAssertNotNil(prompts["advB.v1"])
    XCTAssertNotNil(Bundle.main.url(forResource: "advB.v1.schema", withExtension: "json", subdirectory: "prompts"))
  }

  func testStringsLoadFromSharedFile() {
    XCTAssertEqual(Strings.t("ui.app.name"), "Strangers' Eyes")
    XCTAssertEqual(Strings.t("no.such.key"), "no.such.key")
  }
}
