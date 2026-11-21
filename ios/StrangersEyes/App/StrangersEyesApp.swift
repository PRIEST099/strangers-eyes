// ios/StrangersEyes/App/StrangersEyesApp.swift: app entry (T-027; ARCH §19.2, API-NOTES §3.3).
// Order matters: the App Check debug provider factory is set BEFORE FirebaseApp.configure(), in DEBUG only.
// The debug token comes from the process environment `AppCheckDebugToken`, passed by Claude's launch command as
// SIMCTL_CHILD_AppCheckDebugToken="$(cat ios/.appcheck-debug-token)" (the file is gitignored; never commit the value).
import SwiftUI
import FirebaseCore
import FirebaseAppCheck

@main
struct StrangersEyesApp: App {
  @State private var model: AppModel

  init() {
    #if DEBUG
    AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
    #endif
    FirebaseApp.configure()
    _model = State(initialValue: AppModel())
  }

  var body: some Scene {
    WindowGroup {
      ContentView().environment(model)
    }
  }
}
