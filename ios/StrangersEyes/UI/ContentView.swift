// ios/StrangersEyes/UI/ContentView.swift: the one-screen check (T-128, T-130) plus the Judge Mode entry. Copy comes from
// shared/strings/en.json only. Never shows a map pin, coordinates, an address or the attacker's guessed place name
// (bands, precision level and confidence only), never says "safe", always shows confidence. Plain language by default:
// payload classes, prompt ids, hashes and gate notes appear only with Settings › Developer on (`techDetails`). The
// Router HUD sits at the bottom, compact, for every AI call.
import PhotosUI
import SwiftUI

struct ContentView: View {
  @Environment(AppModel.self) private var model
  @State private var pick: PhotosPickerItem?
  @State private var showVault = false
  @State private var showJudge = false
  @State private var showSettings = false

  var body: some View {
    @Bindable var model = model
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          header
          CapabilityCard()
          if !model.welcomeAccepted {
            WelcomeCard()
          } else if model.inJudgeMode {
            JudgeBanner()
            stageView
            if let img = model.preview { photoCard(img) }
          } else {
            vaultRow
            importRow
            judgeCard
            stageView
            if let img = model.preview { photoCard(img) }
          }
        }
        .padding(16)
      }
      .safeAreaInset(edge: .bottom) { RouterHUD() }
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button { showSettings = true } label: { Image(systemName: "gearshape") }
            .accessibilityLabel(Strings.t("ui.screen.settings")).accessibilityIdentifier("settingsButton")
        }
      }
      .sheet(isPresented: $showVault) { VaultView() }
      .sheet(isPresented: $showJudge) { JudgePickerView { s in showJudge = false; Task { await model.startJudge(s) } } }
      .sheet(isPresented: $showSettings) { SettingsView() }
      .sheet(isPresented: Binding(get: { model.stage == .consent || model.stage == .reattackConsent }, set: { if !$0 { if model.stage == .consent || model.stage == .reattackConsent { model.cancelConsent() } } })) {
        ConsentView()
      }
      .onChange(of: pick) { _, item in
        guard let item else { return }
        Task {
          if let data = try? await item.loadTransferable(type: Data.self) { await model.importPhoto(data) }
          pick = nil
        }
      }
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(Strings.t("ui.app.name")).font(.largeTitle.bold())
      Text(Strings.t("copy.app.tagline")).font(.subheadline).foregroundStyle(.secondary)
    }
  }

  private var vaultRow: some View {
    HStack {
      Button { showVault = true } label: {
        Label(Strings.t("ui.ios.vaultButton", ["n": String(model.vault.items.count)]), systemImage: "lock.fill")
      }
      .buttonStyle(.bordered)
      .accessibilityIdentifier("vaultButton")
      Text(Strings.t("copy.vault.lock")).font(.caption).foregroundStyle(.secondary)
    }
  }

  private var importRow: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Strings.t("ui.home.check.title")).font(.headline)
      HStack {
        PhotosPicker(selection: $pick, matching: .images) {
          Label(Strings.t("ui.home.check.cta"), systemImage: "photo")
        }
        .buttonStyle(.borderedProminent)
        #if DEBUG
        if model.usingFake {
          Button(Strings.t("ui.ios.sample")) { Task { await model.importPhoto(SyntheticScene.jpeg()) } }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("sampleButton")
        }
        #endif
      }
      Text(Strings.t("copy.welcome.b3")).font(.caption).foregroundStyle(.secondary)
    }
  }

  private var judgeCard: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Strings.t("ui.home.judge.title")).font(.headline)
      Text(Strings.t("ui.home.judge.body")).font(.callout)
      Button { showJudge = true } label: { Label(Strings.t("ui.home.judge.cta"), systemImage: "rectangle.stack") }
        .buttonStyle(.bordered).accessibilityIdentifier("judgeButton")
    }
    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
  }

  private func photoCard(_ img: UIImage) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 260).clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityLabel(Strings.t("ui.editor.stage"))
      if let t = model.tier0 {
        if model.techDetails {
          Text(Strings.t("ui.ios.tier0Summary", ["faces": String(t.faces.count), "words": String(t.words.count), "hits": String(t.vaultHits.count)]))
            .font(.caption)
        } else {
          Label(Strings.t("ui.prescreen.facesDone", ["n": String(t.faces.count)]), systemImage: "checkmark.circle").font(.caption)
          Label(Strings.t("ui.prescreen.textDone", ["n": String(t.words.count)]), systemImage: "checkmark.circle").font(.caption)
          Label(Strings.t("ui.prescreen.vaultDone", ["n": String(t.vaultHits.count)]), systemImage: "checkmark.circle").font(.caption)
        }
        if model.photo?.hadGPS == true { Text(Strings.t("copy.import.gpsFound")).font(.caption).foregroundStyle(.orange) }
      }
      if let p = model.prescreen { PrescreenSummary(outcome: p) }
    }
  }

  @ViewBuilder private var stageView: some View {
    switch model.stage {
    case .idle: EmptyView()
    case let .working(what):
      HStack { ProgressView(); Text(what) }
      if (what == Strings.t("copy.ref.running") || what == AppModel.prescreenWorking) && model.fmState == .available {
        Text(Strings.t("copy.ios.slow")).font(.caption).foregroundStyle(.secondary)
      }
    case .prescreened, .consent:
      Button(Strings.t("ui.prescreen.cloud")) { Task { await model.prepareConsent() } }
        .buttonStyle(.borderedProminent).accessibilityIdentifier("cloudButton")
    case .verdict:
      if let r = model.first { VerdictCard(round: r) }
      Button(Strings.t("copy.fix.button")) { model.planFix() }.buttonStyle(.borderedProminent).accessibilityIdentifier("fixButton")
    case .fixPlanned, .reattackConsent:
      if let r = model.first { VerdictCard(round: r) }
      if let f = model.fix { FixCard(fix: f) }
    case .compared:
      if let c = model.comparison { CompareCard(cmp: c) }
    case .refused:
      Text(Strings.t("copy.adv.declined")).font(.callout)
      if let r = model.second ?? model.first { VerdictCard(round: r) }
    case let .failed(msg):
      Text(msg).foregroundStyle(.red)
    }
  }
}

// ---------- the on-device pre-screen (T-125): what Apple FM flagged from the photo's text, or rules-only ----------
struct PrescreenSummary: View {
  @Environment(AppModel.self) private var model
  let outcome: PrescreenOutcome
  /// One line per clue type (the model may flag several lines of one sign).
  private var types: [String] { var seen = Set<String>(); return outcome.findings.map(\.type).filter { seen.insert($0).inserted } }
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        Text(Strings.t("ui.step.prescreen")).font(.caption.bold())
        RouteBadge(route: outcome.route)
        if outcome.route == .onDevice { Text(Strings.t("ui.hud.engine.fm")).font(.caption2).foregroundStyle(.secondary) }
      }
      if outcome.route != .onDevice && outcome.note != PrescreenJob.nothingToRead {
        Text(Strings.t(model.fmState == .available ? "ui.prescreen.nanoFailed" : "ui.prescreen.nanoUnavailable")).font(.caption2).foregroundStyle(.secondary)
      }
      ForEach(types, id: \.self) { type in
        Text(Strings.t("copy.prescreen.possible", ["type": Strings.t("ui.clue.\(type)")])).font(.caption)
      }
      if model.techDetails, let n = outcome.note { Text(n).font(.caption2.monospaced()).foregroundStyle(.secondary) }
    }
    .accessibilityIdentifier("prescreenSummary")
  }
}

// ---------- Judge Mode: the banner while a sample runs ----------
struct JudgeBanner: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(Strings.t("ui.judge.fakeChip")).font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 2)
          .background(Color.purple.opacity(0.2), in: Capsule()).foregroundStyle(.purple)
        Text(model.judge?.sample.title ?? "").font(.subheadline.bold()).lineLimit(2)
      }
      Text(Strings.t("copy.judge.fakeVault")).font(.caption)
      Button(Strings.t("ui.judge.exit")) { model.exitJudge() }.buttonStyle(.bordered).font(.caption).accessibilityIdentifier("judgeExit")
    }
    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
  }
}

// ---------- capability state + safety copy (T-130) ----------
struct CapabilityCard: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        RouteBadge(route: model.fmState == .available ? .onDevice : .rulesOnly)
        Text(model.fmState == .available ? Strings.t("ui.ios.fmReady") : Strings.t("ui.cap.chip.rulesOnly")).font(.subheadline.bold())
      }
      if let id = model.fmState.copyId { Text(Strings.t(id)).font(.caption) }
      Text(Strings.t("copy.cap.invariant")).font(.caption).foregroundStyle(.secondary)
      if model.techDetails { Text(Strings.t("ui.cap.row.tier0") + ": " + Strings.t("ui.cap.row.tier0.ready")).font(.caption) }
      if model.usingFake { Text(Strings.t("ui.ios.fakeBanner")).font(.caption.bold()).foregroundStyle(.purple) }
      if model.vault.isDemoVault && !model.inJudgeMode { Text(Strings.t("ui.ios.demoVault")).font(.caption).foregroundStyle(.secondary) }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
  }
}

struct WelcomeCard: View {
  @Environment(AppModel.self) private var model
  @State private var adult = false
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(Strings.t("copy.welcome.b1"))
      Text(Strings.t("copy.welcome.b2"))
      Text(Strings.t("copy.welcome.b3")).bold()
      Toggle(Strings.t("copy.welcome.age"), isOn: $adult)
      Text(Strings.t("copy.about.notGuarantee")).font(.caption).foregroundStyle(.secondary)
      Button(Strings.t("ui.welcome.continue")) { model.acceptWelcome() }.buttonStyle(.borderedProminent).disabled(!adult)
    }
  }
}

// ---------- Settings: on-device AI state and the Developer (technical details) toggle ----------
struct SettingsView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    @Bindable var model = model
    NavigationStack {
      Form {
        Section(Strings.t("ui.settings.device")) {
          Text(Strings.t("ui.settings.device.now", ["state": model.fmState == .available ? Strings.t("ui.ios.fmReady") : Strings.t("ui.cap.chip.rulesOnly")]))
          if let id = model.fmState.copyId { Text(Strings.t(id)).font(.caption) }
        }
        Section(Strings.t("ui.settings.dev")) {
          Toggle(Strings.t("ui.settings.device.details"), isOn: $model.techDetails).accessibilityIdentifier("techToggle")
        }
      }
      .navigationTitle(Strings.t("ui.screen.settings"))
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button(Strings.t("ui.close")) { dismiss() } } }
    }
  }
}

struct RouteBadge: View {
  let route: Route
  var body: some View {
    Text(Strings.t("ui.route.\(route.rawValue)"))
      .font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 2)
      .background(color.opacity(0.2), in: Capsule()).foregroundStyle(color)
  }
  private var color: Color {
    switch route {
    case .onDevice: .green
    case .inCloud: .blue
    case .cached: .purple
    case .rulesOnly: .orange
    case .blocked: .red
    default: .gray
    }
  }
}
