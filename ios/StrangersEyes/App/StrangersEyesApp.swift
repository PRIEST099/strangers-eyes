// ios/StrangersEyes/App/StrangersEyesApp.swift: app entry (T-027; ARCH §19.2, API-NOTES §3.3).
// Order matters: the App Check debug provider factory is set BEFORE FirebaseApp.configure(), in DEBUG only.
// The debug token comes from the process environment `AppCheckDebugToken`, passed by Claude's launch command as
// SIMCTL_CHILD_AppCheckDebugToken="$(cat ios/.appcheck-debug-token)" (the file is gitignored; never commit the value).
import SwiftUI
import FirebaseCore
import FirebaseAppCheck

@main
struct StrangersEyesApp: App {
  init() {
    #if DEBUG
    AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
    #endif
    FirebaseApp.configure()
  }

  var body: some Scene {
    WindowGroup {
      RootView()
    }
  }
}

/// Placeholder root until the iOS screens land (T-1xx). All copy comes from shared/strings/en.json.
struct RootView: View {
  var body: some View {
    VStack(spacing: 12) {
      Text(Strings.t("ui.app.name")).font(.largeTitle.bold())
      Text(Strings.t("copy.app.tagline")).font(.body).multilineTextAlignment(.center)
    }
    .padding(24)
  }
}
