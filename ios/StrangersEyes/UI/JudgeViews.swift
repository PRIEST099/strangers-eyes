// ios/StrangersEyes/UI/JudgeViews.swift: the Judge Mode sample picker (SPEC SCR-17; web ui/judge). The same three CC0
// samples as the web, from the bundled web/public/samples. Picking one runs the whole check on it with a fake vault;
// the attacker's answer is the recorded real Gemini answer for that sample (CACHED SAMPLE), the on-device steps run live.
import SwiftUI

struct JudgePickerView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let onPick: (JudgeSample) -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text(Strings.t("ui.judge.intro")).font(.callout)
          Text(Strings.t("copy.judge.fakeVault")).font(.caption).foregroundStyle(.secondary)
          if let m = model.loadJudgeManifest() {
            Text(Strings.t("ui.judge.pick")).font(.headline)
            ForEach(m.samples) { s in row(s) }
            Text(Strings.t("ui.judge.samplesNote")).font(.caption).foregroundStyle(.secondary)
          } else {
            Text(Strings.t("ui.judge.loadFailed")).foregroundStyle(.red)
          }
        }
        .padding(16)
      }
      .navigationTitle(Strings.t("ui.home.judge.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button(Strings.t("ui.close")) { dismiss() } } }
    }
  }

  private func row(_ s: JudgeSample) -> some View {
    HStack(alignment: .center, spacing: 12) {
      if let d = JudgeManifest.data(s.image), let img = UIImage(data: d) {
        Image(uiImage: img).resizable().scaledToFill().frame(width: 72, height: 54).clipShape(RoundedRectangle(cornerRadius: 6))
          .accessibilityHidden(true)
      }
      Text(s.title).font(.subheadline)
      Spacer()
      Button(Strings.t("ui.judge.run")) { onPick(s) }.buttonStyle(.borderedProminent).accessibilityIdentifier("run-\(s.id)")
    }
    .padding(8)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
  }
}
