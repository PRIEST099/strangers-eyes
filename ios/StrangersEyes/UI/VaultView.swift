// ios/StrangersEyes/UI/VaultView.swift: the private vault (T-122). Pins are typed as "lat, lng" (copy.vault.manualCoords):
// no CoreLocation in this lean build, never geocoded, never uploaded. Burn vault deletes the file.
import SwiftUI

struct VaultView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @State private var kind = "home_pin"
  @State private var label = ""
  @State private var coords = ""
  @State private var error: String?
  @State private var confirmBurn = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text(Strings.t("copy.vault.lock")).font(.caption)
          Text(Strings.t("copy.vault.howUsed")).font(.caption).foregroundStyle(.secondary)
          if model.vault.isDemoVault { Text(Strings.t("ui.ios.demoVault")).font(.caption).foregroundStyle(.purple) }
        }
        Section(Strings.t("ui.vault.counter", ["n": String(model.vault.items.count), "max": String(VaultStore.maxItems)])) {
          if model.vault.items.isEmpty { Text(Strings.t("copy.vault.empty")) }
          ForEach(model.vault.items) { item in
            VStack(alignment: .leading) {
              Text(Strings.t("ui.vault.kind.\(item.kind)")).font(.caption).foregroundStyle(.secondary)
              Text(item.label.isEmpty ? "—" : item.label)
              if item.pin != nil { Text(Strings.t("ui.vault.pin.manual")).font(.caption2).foregroundStyle(.secondary) }
            }
          }
          .onDelete { idx in for i in idx { try? model.vault.remove(model.vault.items[i].id) } }
        }
        Section(Strings.t("ui.vault.form.addDetail")) {
          Picker(Strings.t("ui.vault.form.kind"), selection: $kind) {
            ForEach(VaultStore.offeredKinds, id: \.self) { Text(Strings.t("ui.vault.kind.\($0)")).tag($0) }
          }
          TextField(isPinKind(kind) ? Strings.t("ui.vault.form.placeLabel") : Strings.t("ui.vault.form.value"), text: $label)
          if isPinKind(kind) {
            TextField(Strings.t("ui.vault.manual.label"), text: $coords).keyboardType(.numbersAndPunctuation)
            Text(Strings.t("copy.vault.manualCoords")).font(.caption2).foregroundStyle(.secondary)
          }
          if let error { Text(error).foregroundStyle(.red).font(.caption) }
          Button(Strings.t("ui.vault.form.save")) { save() }
        }
        Section {
          Button(Strings.t("ui.burn.action"), role: .destructive) { confirmBurn = true }
        }
      }
      .navigationTitle(Strings.t("ui.vault.places"))
      .toolbar { Button(Strings.t("ui.welcome.continue")) { dismiss() } }
      .confirmationDialog(Strings.t("ui.burn.atConfirm"), isPresented: $confirmBurn) {
        Button(Strings.t("ui.burn.atYes"), role: .destructive) { model.vault.burn(); model.reset() }
      }
    }
  }

  private func save() {
    var pin: Pin?
    if isPinKind(kind) {
      guard let p = VaultStore.parseCoords(coords) else { error = Strings.t("ui.vault.manual.format"); return }
      pin = p
    }
    do {
      try model.vault.add(VaultItem(id: UUID().uuidString, kind: kind, label: label.trimmingCharacters(in: .whitespaces), pin: pin))
      label = ""; coords = ""; error = nil
    } catch let e as VaultError {
      let id: String = switch e {
      case .full: "copy.vault.full"
      case .labelTooLong: "ui.vault.error.labelTooLong"
      case .aliasTooLong: "ui.vault.error.aliasTooLong"
      case .tooManyAliases: "ui.vault.error.tooManyAliases"
      case .labelRequired: "ui.vault.error.labelRequired"
      case .badKind: "ui.vault.error.badKind"
      case .pinRequired: "ui.vault.error.pinRequired"
      case .badPin: "ui.vault.error.badPin"
      }
      error = Strings.t(id)
    } catch { self.error = Strings.t("ui.vault.error.saveFailed") }
  }
}
