// ios/StrangersEyes/UI/FlowViews.swift: consent sheet (the exact image, SCR-07), verdict card (SPEC §10, bands only,
// confidence on every line), fix card (SCR-11, solid masks + crop) and the before → after compare (SPEC §10.6).
// Misuse hardening: the attacker's guessed place name, its inference values and its clue evidence text are NEVER shown
// (that would make this a free "where was this taken" tool); only the precision level, confidence and each clue's
// type, what it reveals and its severity. In Judge Mode the consent sheet says plainly that nothing is sent: the
// recorded answer is replayed (CACHED SAMPLE) after the same pre-send checks.
import SwiftUI
import CoreTransferable
import UniformTypeIdentifiers

struct ConsentView: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text(Strings.t(judge != nil ? "ui.consent.imageAlt" : "copy.consent.title")).font(.title3.bold())
          if let j = judge {
            HStack(spacing: 6) { RouteBadge(route: .cached); Text(Strings.t("ui.judge.fakeChip")).font(.caption2.bold()).foregroundStyle(.purple) }
            Text(Strings.t("copy.judge.cached", ["date": j.sample.recordedAt, "model": j.sample.model])).font(.caption)
          }
          if let o = model.outgoing {
            Image(uiImage: o.image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 8))
              .accessibilityLabel(Strings.t("ui.consent.imageAlt"))
            if model.techDetails {
              Text(Strings.t("ui.consent.meta", ["w": String(Int(o.frame.width)), "h": String(Int(o.frame.height)), "kb": String(o.jpeg.count / 1024), "sha": String(o.sha256.prefix(12))]))
                .font(.caption.monospaced())
            }
            if let pc = o.precheck {
              Text(Strings.t("ui.consent.checklist")).font(.headline)
              check(pc.metadataClean, Strings.t("ui.consent.checkMetadata"))
              check(pc.faces == 0, Strings.t("ui.consent.checkFaces", ["n": String(pc.faces)]))
              check(pc.vaultHits == 0, Strings.t("ui.consent.checkVault", ["n": String(pc.vaultHits)]))
              if !pc.metadataClean { failed("ui.consent.failed.metadata") }
              if pc.faces > 0 { failed("ui.consent.failed.faces") }
              if pc.vaultHits > 0 { failed("ui.consent.failed.vault") }
              if pc.failed { failed("ui.consent.failed.check") }
            }
          }
          Text(Strings.t("copy.consent.never")).font(.callout)
          if judge == nil {
            Text(Strings.t("copy.consent.tierFree")).font(.caption).foregroundStyle(.secondary)
            if model.first != nil { Text(Strings.t("copy.about.reattackDisclosure")).font(.caption).foregroundStyle(.secondary) }
          }
          if model.usingFake { Text(Strings.t("ui.ios.fakeBanner")).font(.caption.bold()).foregroundStyle(.purple) }
          HStack {
            Button(Strings.t("copy.consent.cancel")) { model.cancelConsent() }.buttonStyle(.bordered)
            Button(Strings.t(judge != nil ? "ui.judge.useRecorded" : "copy.consent.send")) { Task { await model.sendConsented() } }
              .buttonStyle(.borderedProminent).disabled(!model.sendAllowed).accessibilityIdentifier("sendButton")
          }
        }
        .padding(16)
      }
    }
  }

  private var judge: JudgeSession? { model.judge }

  private func check(_ ok: Bool, _ text: String) -> some View {
    Label(text, systemImage: ok ? "checkmark.circle.fill" : "xmark.octagon.fill").foregroundStyle(ok ? .green : .red).font(.callout)
  }
  private func failed(_ id: String) -> some View { Text(Strings.t(id)).font(.caption).foregroundStyle(.red) }
}

struct VerdictCard: View {
  @Environment(AppModel.self) private var model
  let round: Round
  var body: some View {
    let v = round.verdict
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(Strings.t("ui.verdict.level.\(v.level)")).font(.caption.bold()).padding(4).background(levelColor(v.level).opacity(0.2), in: Capsule())
        Text(Strings.t(VerdictEngine.headlineCopyId(v.level))).font(.headline)
      }
      if v.noVault { Text(Strings.t("copy.verdict.noVault")).font(.callout) }
      ForEach(Array(v.lines.enumerated()), id: \.offset) { _, l in LineRow(line: l) }
      if let bg = VerdictEngine.bestGuessDisplay(v) { Text(bg).font(.callout).accessibilityIdentifier("bestGuess") }
      if let nl = VerdictEngine.notLinkedText(v, model.activeVault) { Text(nl).font(.caption).foregroundStyle(.secondary) }
      if !round.adv.clues.isEmpty { ClueList(clues: round.adv.clues) }
      HStack(spacing: 6) {
        Text(Strings.t("ui.step.attack")).font(.caption)
        RouteBadge(route: round.recorded ? .cached : (model.usingFake ? .cached : .inCloud))
      }
      if round.recorded, let j = model.judge {
        Text(Strings.t("copy.judge.cached", ["date": j.sample.recordedAt, "model": j.sample.model])).font(.caption2).foregroundStyle(.secondary)
          .accessibilityIdentifier("recordedNote")
      }
      // D-179 (as on the web): no referee row when nothing was graded (a declined attack); a referee that needed no model
      // ("skipped") reads BUILT-IN · code; RULES-ONLY only for a real fallback, with the reason (no model vs it failed).
      if round.adv.status != "declined" {
        HStack(spacing: 6) {
          Text(Strings.t("ui.verdict.referee")).font(.caption)
          if round.referee.route == .rulesOnly && round.referee.notes == ["skipped"] {
            BuiltInBadge(engine: "code")
          } else {
            RouteBadge(route: round.referee.route)
            if round.referee.route == .onDevice { Text(Strings.t("ui.hud.engine.fm")).font(.caption2).foregroundStyle(.secondary) }
            if round.referee.route == .rulesOnly {
              Text(Strings.t(model.fmState == .available ? "ui.verdict.refFallback" : "copy.ref.rules")).font(.caption2).foregroundStyle(.secondary)
            }
          }
        }
      }
      if model.techDetails && !round.referee.notes.isEmpty {
        Text(round.referee.notes.joined(separator: " · ")).font(.caption2.monospaced()).foregroundStyle(.secondary)
      }
      Text(Strings.t("ui.verdict.distances")).font(.caption2).foregroundStyle(.secondary)
      Text(Strings.t("copy.verdict.neverLearns")).font(.caption).italic()
    }
    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
    .background(levelColor(v.level).opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
  }
}

/// The clues the attacker used, by TYPE only: what each reveals (precision level) and its severity. Never the
/// attacker's free-text evidence, which can name the place.
struct ClueList: View {
  let clues: [AdversaryClue]
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(Strings.t("ui.attack.clues")).font(.caption.bold())
      ForEach(Array(clues.enumerated()), id: \.offset) { _, c in
        Text([Strings.t("ui.clue.\(c.type)"),
              Strings.t("ui.compare.guessLevel", ["level": c.reveals.replacingOccurrences(of: "_", with: " ")]),
              Strings.t("ui.editor.severity.\(c.severity)")].joined(separator: " · "))
          .font(.caption2)
      }
    }
    .accessibilityIdentifier("clueList")
  }
}

struct LineRow: View {
  let line: VerdictLine
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(VerdictEngine.lineText(line)).font(.callout.weight(line.severity == "HIGH" ? .semibold : .regular))
      if let c = conf { Text(c).font(.caption2).foregroundStyle(.secondary) }
    }
  }
  /// Always show confidence (SPEC §10.2): the attacker's, and for a combined line the distance's too.
  private var conf: String? {
    switch line.kind {
    case "pin_match": Strings.t("ui.verdict.pinMatchConf", ["strength": line.strength ?? "", "confidence": line.confidence ?? "", "bandConfidence": line.bandConfidence ?? ""])
    case "match": Strings.t("ui.verdict.strengthConf", ["strength": line.strength ?? "", "confidence": line.confidence ?? ""])
    case "pin": Strings.t("ui.verdict.conf", ["confidence": line.confidence ?? ""])
    case "caught": Strings.t("ui.verdict.onDevice") + " " + Strings.t("ui.verdict.neverSent")
    default: nil
    }
  }
}

func levelColor(_ level: String) -> Color {
  switch level { case "RED": .red; case "AMBER": .orange; case "LOW": .gray; default: .purple }
}

struct FixCard: View {
  @Environment(AppModel.self) private var model
  let fix: RulesFix
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) { Text(Strings.t("copy.fix.title")).font(.headline); BuiltInBadge(engine: "code") } // D-179: always plain code
      Text(Strings.t("copy.fix.rules")).font(.caption).foregroundStyle(.secondary)
      Text(fix.explanation).font(.callout)
      ForEach(fix.masks, id: \.clueId) { m in
        if model.techDetails {
          Label(Strings.t("ui.fix.maskItem", ["type": m.type.replacingOccurrences(of: "_", with: " "), "id": m.clueId]), systemImage: "square.fill").font(.caption)
        } else {
          Label(Strings.t("ui.editor.maskAria", ["type": Strings.t("ui.clue.\(m.type)")]), systemImage: "square.fill").font(.caption)
        }
      }
      if fix.cropSide != "none" { Label(Strings.t("ui.fix.cropItem", ["side": fix.cropSide]), systemImage: "crop").font(.caption) }
      if fix.unremovable { Text(Strings.t("copy.fix.unremovable")).font(.caption) }
      if fix.cropTooMuch { Text(Strings.t("copy.fix.cropTooMuch")).font(.caption) }
      // Nothing to mask and no crop: no "expected after fix" and no re-attack of the identical photo (Nov 27 live run).
      if !fix.masks.isEmpty || fix.cropSide != "none" {
        Text(Strings.t("ui.fix.expected", ["level": fix.expectedResidual])).font(.caption)
        Button(Strings.t("copy.fix.reattack")) { Task { await model.applyFixAndPrepareReattack() } }
          .buttonStyle(.borderedProminent).accessibilityIdentifier("reattackButton")
      }
    }
    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
  }
}

struct CompareCard: View {
  @Environment(AppModel.self) private var model
  let cmp: VerdictComparison
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Strings.t("ui.compare.title")).font(.caption).foregroundStyle(.secondary)
      Text(VerdictEngine.comparisonHeadlineDisplay(cmp)).font(.title3.bold()).foregroundStyle(cmp.riskReduced ? .green : .primary)
        .accessibilityIdentifier("compareHeadline")
      if let r = model.second { VerdictCard(round: r) }
      Text(Strings.t("copy.about.notGuarantee")).font(.caption).foregroundStyle(.secondary)
    }
  }
}

/// SCR-12 (D-185): "Save a covered copy". Made and checked on this device; shared through the system share sheet.
struct CoveredCopyCard: View {
  @Environment(AppModel.self) private var model
  var stillNear: Bool
  /// No cloud check ran (the pre-screen's "Just clean and export").
  var noCloud = false
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(Strings.t("ui.export.title"), systemImage: "square.and.arrow.down").font(.headline)
      Text(Strings.t(noCloud ? "ui.export.bodyNoCloud" : "ui.export.body")).font(.callout)
      if stillNear { Label(Strings.t("ui.export.stillNear"), systemImage: "exclamationmark.triangle").font(.callout) }
      if let c = model.coveredCopy {
        if model.coveredCopyOk {
          Image(uiImage: c.image).resizable().scaledToFit().frame(maxHeight: 240).clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityLabel(Strings.t("ui.export.imageAlt"))
          Label(Strings.t("copy.export.check"), systemImage: "checkmark.circle").font(.caption)
          ShareLink(item: CoveredJPEG(data: c.jpeg, name: c.name), preview: SharePreview(Strings.t("ui.export.title"), image: Image(uiImage: c.image))) {
            Label(Strings.t("ui.export.share"), systemImage: "square.and.arrow.up")
          }
          .buttonStyle(.borderedProminent).accessibilityIdentifier("shareCopy")
        } else {
          Text(Strings.t("ui.export.failed")).foregroundStyle(.red)
          Button(Strings.t("ui.prescreen.retry")) { Task { await model.makeCoveredCopy() } }
            .buttonStyle(.bordered).accessibilityIdentifier("retryCopy")
        }
      } else if model.coveredCopyBusy {
        HStack { ProgressView(); Text(Strings.t("ui.export.checking")) }
      } else {
        Button(Strings.t("ui.export.make")) { Task { await model.makeCoveredCopy() } }
          .buttonStyle(.bordered).accessibilityIdentifier("makeCopy")
      }
      Text(Strings.t("ui.export.note")).font(.caption).foregroundStyle(.secondary)
    }
    .padding(12).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
  }

  /// Within 5 km of one of the user's pins (code bands, never the model).
  static func near(_ v: Verdict) -> Bool { v.pinBands.contains { ["street", "neighbourhood", "district"].contains($0.band) } }
}

/// The covered JPEG for ShareLink (Save Image, Messages, …), named strangers-eyes-<6 chars>.jpg.
struct CoveredJPEG: Transferable {
  let data: Data
  let name: String
  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .jpeg) { $0.data }.suggestedFileName { $0.name }
  }
}
