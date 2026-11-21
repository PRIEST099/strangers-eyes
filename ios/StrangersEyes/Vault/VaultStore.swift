// ios/StrangersEyes/Vault/VaultStore.swift: the private vault (T-122, SPEC §14.2 I1, D-23). LOCAL ONLY.
// Storage: one JSON file in Application Support written with `.completeFileProtection` (encrypted at rest while the
// device is locked) and excluded from iCloud/iTunes backup. It is never logged, never sent to any AI call that could reach
// the cloud, never put in the Ledger or analytics (invariant 1). Limits: 20 items, labels and aliases ≤ 40 characters
// (Unicode scalars, D-78), ≤ 5 aliases. "Burn vault" deletes the file and clears memory.
// Note: the ARCH plan named the Keychain; the lean build uses a file-protected file instead (ios/NOTES.md).
import Foundation
import Observation

enum VaultError: Error, Equatable { case full, labelTooLong, aliasTooLong, tooManyAliases, labelRequired, badKind, pinRequired, badPin }

@MainActor @Observable
final class VaultStore {
  static let maxItems = 20
  static let maxChars = 40
  static let maxAliases = 5
  /// The kinds this lean iOS build offers (a subset of SPEC §17's VAULT_KINDS).
  static let offeredKinds = ["home_pin", "work_pin", "employer", "child_name", "self_name", "school_name", "street_name", "plate", "house_number"]

  private(set) var items: [VaultItem] = []
  private(set) var loadError = false
  /// DEBUG demo seed: the synthetic Judge Mode vault (web/public/samples/manifest.json fakeVault pins, open ocean).
  private(set) var isDemoVault = false
  private let url: URL

  init(fileName: String = "vault.v1.json") {
    let dir = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
      ?? FileManager.default.temporaryDirectory
    url = dir.appendingPathComponent(fileName)
    load()
  }

  func load() {
    guard FileManager.default.fileExists(atPath: url.path) else { items = []; return }
    do {
      let file = try JSONDecoder().decode(VaultFile.self, from: Data(contentsOf: url))
      items = file.items
      isDemoVault = file.demo ?? false
    } catch { items = []; loadError = true }
  }

  private func save() throws {
    let data = try JSONEncoder().encode(VaultFile(items: items, demo: isDemoVault))
    try data.write(to: url, options: [.atomic, .completeFileProtection])
    var u = url
    var rv = URLResourceValues()
    rv.isExcludedFromBackup = true
    try? u.setResourceValues(rv)
  }

  static func validate(_ item: VaultItem) throws {
    guard Enums.vaultKinds.contains(item.kind) else { throw VaultError.badKind }
    guard item.label.unicodeScalars.count <= maxChars else { throw VaultError.labelTooLong }
    guard item.aliases.count <= maxAliases else { throw VaultError.tooManyAliases }
    guard item.aliases.allSatisfy({ $0.unicodeScalars.count <= maxChars }) else { throw VaultError.aliasTooLong }
    if isPinKind(item.kind) {
      guard let p = item.pin else { throw VaultError.pinRequired }
      guard p.lat.isFinite, p.lng.isFinite, abs(p.lat) <= 90, abs(p.lng) <= 180 else { throw VaultError.badPin }
    } else if Referee.isGenericLabel(item.label) {
      throw VaultError.labelRequired
    }
  }

  func add(_ item: VaultItem) throws {
    guard items.count < Self.maxItems else { throw VaultError.full }
    try Self.validate(item)
    items.append(item)
    try save()
  }

  func remove(_ id: String) throws {
    items.removeAll { $0.id == id }
    try save()
  }

  /// Burn vault (SPEC SCR-19): delete the file and forget everything in memory.
  func burn() {
    items = []
    isDemoVault = false
    loadError = false
    try? FileManager.default.removeItem(at: url)
  }

  /// "lat, lng" typed by hand (copy.vault.manualCoords): never geocoded, never looked up.
  static func parseCoords(_ s: String) -> Pin? {
    let parts = s.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    guard parts.count == 2, let lat = Double(parts[0]), let lng = Double(parts[1]), abs(lat) <= 90, abs(lng) <= 180 else { return nil }
    return Pin(lat: lat, lng: lng)
  }

  #if DEBUG
  /// DEBUG only (launch argument -seedDemoVault): the web Judge Mode fake vault, pins from the bundled samples manifest
  /// (synthetic, open South Atlantic). Labelled as a demo vault in the UI.
  func seedDemoVault(homePin: Pin, workPin: Pin) {
    items = [
      VaultItem(id: "demo-home", kind: "home_pin", label: "Home", pin: homePin),
      VaultItem(id: "demo-work", kind: "work_pin", label: "City General Hospital", pin: workPin),
      VaultItem(id: "demo-child", kind: "child_name", label: "Lucas"),
      VaultItem(id: "demo-plate", kind: "plate", label: "SE 1234"),
    ]
    isDemoVault = true
    try? save()
  }
  #endif

  private struct VaultFile: Codable { var items: [VaultItem]; var demo: Bool? }
}
