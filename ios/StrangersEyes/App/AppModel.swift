// ios/StrangersEyes/App/AppModel.swift: the @Observable root of the lean iOS check (ARCH §19.2), mirroring the web flow:
// import → Tier-0 (faces, OCR, vault text → solid masks) → consent to the exact redacted JPEG → pass B through the Egress
// Gate (S3) → on-device referee (S0, Apple FM or RULES-ONLY) → verdict with distance BANDS (code) → rules fix (masks +
// crop) → consent again → re-attack → compare ("Risk reduced", never "safe").
// The original photo (`photo.master`) never leaves this object; only `outgoing.jpeg`, built from masked pixels and
// re-checked by the gate, can reach a transport (invariant 2).
// Judge Mode (Judge/JudgeSamples.swift): a bundled CC0 sample, a FAKE in-memory vault (`activeVault`; the real
// VaultStore is not read while it is on), and the attacker replays the RECORDED real Gemini answer through the same gate
// path (route CACHED, no cloud request). The on-device steps (Tier-0, the FM pre-screen, the FM referee) run for real.
import Foundation
import Observation
import UIKit

struct Outgoing: @unchecked Sendable {
  let jpeg: Data
  let image: UIImage
  let frame: ImageFrame
  let sha256: String
  var precheck: EgressGate.Precheck?
}

/// One Judge Mode run: the sample, its fake vault (in memory only) and the first recording as parsed (D-161 keys on it).
struct JudgeSession: Sendable {
  let sample: JudgeSample
  let vault: [VaultItem]
  var firstRecording: AdversaryResult?
}

struct Round: Sendable {
  var adv: AdversaryResult
  var frame: ImageFrame
  var referee: RefereeOutcome
  var verdict: Verdict
  /// The attacker's answer was a recorded replay (Judge Mode): shown with the CACHED SAMPLE badge and its date.
  var recorded = false
}

@MainActor @Observable
final class AppModel {
  enum Stage: Equatable { case idle, working(String), prescreened, consent, verdict, fixPlanned, reattackConsent, compared, refused, failed(String) }

  let vault = VaultStore()
  let ledger = Ledger()
  @ObservationIgnored private(set) lazy var gate: EgressGate = makeGate()

  var welcomeAccepted = UserDefaults.standard.bool(forKey: "welcome.accepted.v1")
  var stage: Stage = .idle
  var fmState: FMState = .unknown
  /// Settings › Developer: shows payload classes, prompt ids, hashes and gate notes. Off by default (plain language).
  var techDetails = UserDefaults.standard.bool(forKey: "tech.details.v1") {
    didSet { UserDefaults.standard.set(techDetails, forKey: "tech.details.v1") }
  }
  /// Judge Mode: the bundled manifest (loaded on first use) and the active run, if any.
  private(set) var judgeManifest: JudgeManifest?
  private(set) var judge: JudgeSession?
  var inJudgeMode: Bool { judge != nil }
  /// The vault every step uses: the fake one in Judge Mode (the real store is not read), else the user's.
  var activeVault: [VaultItem] { judge?.vault ?? vault.items }
  private(set) var prescreen: PrescreenOutcome?
  private(set) var photo: DecodedPhoto?
  private(set) var tier0: Tier0Result?
  /// Every mask applied so far (Tier-0, then fix rounds), master px. Solid fills only.
  private(set) var masks: [PxRect] = []
  private(set) var crop: PxRect?
  private(set) var preview: UIImage?
  private(set) var outgoing: Outgoing?
  private(set) var first: Round?
  private(set) var fix: RulesFix?
  private(set) var second: Round?
  private(set) var comparison: VerdictComparison?
  var usingFake: Bool { gate.transport is FakeMarker && judge == nil }
  /// The current run's generation. `reset()` (a new import, entering or leaving Judge Mode) bumps it, and every async
  /// step re-checks it after each `await`: a step from a superseded run drops its result instead of writing it into the
  /// new run (a Judge sample's answer never lands on the user's real vault, and a live reply never lands in Judge Mode).
  @ObservationIgnored private var runGen = 0

  init() {
    #if DEBUG
    if DevFlags.acceptWelcome { welcomeAccepted = true }
    if DevFlags.seedDemoVault { vault.seedDemoVault(homePin: DevFlags.demoHome, workPin: DevFlags.demoWork) }
    #endif
    refreshCapability()
  }

  private func makeGate() -> EgressGate {
    let transport: any CloudTransport
    #if DEBUG
    transport = DevFlags.fakeAdversary ? FakeAdversaryTransport() : FirebaseCloudTransport(modelName: Self.adversaryModel())
    #else
    transport = FirebaseCloudTransport(modelName: Self.adversaryModel())
    #endif
    return EgressGate(ledger: ledger, device: FirebaseDeviceModel(), transport: transport, vault: { [unowned self] in self.activeVault })
  }

  /// RC `adversary_model`, from the bundled template default (remoteconfig.template.json, ARCH §13.4).
  static func adversaryModel() -> String {
    guard let url = Bundle.main.url(forResource: "remoteconfig.template", withExtension: "json"),
          let d = try? Data(contentsOf: url), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
          let params = o["parameters"] as? [String: Any], let p = params["adversary_model"] as? [String: Any],
          let dv = p["defaultValue"] as? [String: Any], let v = dv["value"] as? String else { return "gemini-3.5-flash-lite" }
    return v
  }

  func acceptWelcome() {
    welcomeAccepted = true
    UserDefaults.standard.set(true, forKey: "welcome.accepted.v1")
  }

  func refreshCapability() { fmState = FirebaseDeviceModel().state() }

  func reset() {
    runGen &+= 1
    photo = nil; tier0 = nil; prescreen = nil; masks = []; crop = nil; preview = nil; outgoing = nil
    first = nil; fix = nil; second = nil; comparison = nil; stage = .idle
  }

  // ---------- Judge Mode ----------
  /// The bundled samples (nil when the manifest is missing or invalid: the Judge screen then shows ui.judge.loadFailed).
  func loadJudgeManifest() -> JudgeManifest? {
    if judgeManifest == nil { judgeManifest = JudgeManifest.load() }
    return judgeManifest
  }

  /// Run one sample with its fake vault. The user's own photo and vault are untouched.
  func startJudge(_ sample: JudgeSample) async {
    guard let m = loadJudgeManifest() else { stage = .failed(Strings.t("ui.judge.loadFailed")); return }
    reset()
    judge = JudgeSession(sample: sample, vault: JudgeVault.make(m.pins(for: sample)))
    guard let data = JudgeManifest.photo(sample) else { stage = .failed(Strings.t("ui.judge.sampleFailed")); return }
    await runImport(data)
  }

  /// Leave Judge Mode: the fake vault and the sample run are dropped; the real vault is used again.
  func exitJudge() {
    judge = nil
    reset()
  }

  // ---------- 1. import + Tier-0 + on-device pre-screen ----------
  /// The user's own photo: always with the real vault (leaves Judge Mode first).
  func importPhoto(_ data: Data) async {
    judge = nil
    await runImport(data)
  }

  private func runImport(_ data: Data) async {
    reset()
    let gen = runGen
    stage = .working(Strings.t("ui.prescreen.facesName"))
    guard let p = ImagePipeline.decode(data) else { stage = .failed(Strings.t("copy.import.unsupported")); return }
    photo = p
    do {
      let r = try await Tier0.run(p.master, terms: VaultScan.termsOf(activeVault))
      guard gen == runGen else { return }
      tier0 = r
      masks = r.masks.map(\.box)
      preview = UIImage(cgImage: ImagePipeline.applySolidMasks(p.master, masks))
    } catch {
      guard gen == runGen else { return }
      stage = .failed(Strings.t("ui.prescreen.failed"))
      return
    }
    // T-125: Apple FM over the OCR text and scene labels (S1, on device only), else RULES-ONLY with no extra findings.
    stage = .working(Self.prescreenWorking)
    refreshCapability()
    if let t = tier0 {
      let pre = await PrescreenJob.run(gate: gate, tier0: t, width: p.width, height: p.height)
      guard gen == runGen else { return }
      prescreen = pre
    }
    stage = .prescreened
  }

  static var prescreenWorking: String { Strings.t("ui.prescreen.busy", ["name": Strings.t("ui.step.prescreen")]) }

  /// The pre-screen's flags for the verdict (SPEC §10.2 found_on_device): FM findings plus Tier-0's vault-text hits.
  var prescreenFlags: PrescreenFlags? {
    guard let t = tier0 else { return nil }
    var types: [String] = []
    if !t.vaultHits.isEmpty { types.append("name_text") }
    for f in prescreen?.findings ?? [] where !types.contains(f.type) { types.append(f.type) }
    return PrescreenFlags(types: types, route: (prescreen?.route ?? .rulesOnly).rawValue)
  }

  var caught: [CaughtItem] {
    var seen = Set<String>()
    return (tier0?.vaultHits ?? []).compactMap { seen.insert($0.vaultId).inserted ? CaughtItem(vaultId: $0.vaultId, route: Route.rulesOnly.rawValue) : nil }
  }

  // ---------- 2. the exact outgoing image + consent ----------
  private func buildOutgoing() async -> Outgoing? {
    guard let p = photo else { return nil }
    let masked = ImagePipeline.crop(ImagePipeline.applySolidMasks(p.master, masks), crop)
    let (cloud, frame) = ImagePipeline.cloudFrame(masked, cropInMaster: crop ?? PxRect(x: 0, y: 0, w: p.width, h: p.height))
    guard let jpeg = ImagePipeline.jpeg(cloud), let img = UIImage(data: jpeg) else { return nil }
    var o = Outgoing(jpeg: jpeg, image: img, frame: frame, sha256: ImagePipeline.sha256Hex(jpeg))
    o.precheck = await gate.precheck(jpeg)
    return o
  }

  func prepareConsent() async {
    let gen = runGen
    stage = .working(Strings.t("ui.consent.checking"))
    let built = await buildOutgoing()
    guard gen == runGen else { return }
    outgoing = built
    stage = outgoing == nil ? .failed(Strings.t("ui.consent.failed.check")) : (first == nil ? .consent : .reattackConsent)
  }

  var sendAllowed: Bool {
    guard let pc = outgoing?.precheck else { return false }
    return pc.metadataClean && pc.faces == 0 && pc.vaultHits == 0 && !pc.failed
  }

  func cancelConsent() { stage = first == nil ? .prescreened : .fixPlanned; outgoing = nil }

  // ---------- 3. attack + referee + verdict ----------
  /// Called only from the consent sheet's Send button: the token is the sha256 of the image the user was shown.
  func sendConsented() async {
    guard let o = outgoing else { return }
    // Snapshot this run: its generation, its Judge session and its vault. Nothing below re-reads `judge` or
    // `activeVault`, so leaving or entering Judge Mode mid-step cannot swap the vault or the session under it.
    let gen = runGen
    let session = judge
    let runVault = activeVault
    let isReattack = first != nil
    stage = .working(Strings.t(isReattack ? "ui.step.reattack" : "ui.step.attack"))
    let replay = session.flatMap { recordingFor(reattack: isReattack, judge: $0) }
    if session != nil && replay == nil { stage = .failed(Strings.t("ui.judge.loadFailed")); return }
    let r = await gate.cloud(job: Strings.t(isReattack ? "ui.step.reattack" : "ui.step.attack"), cls: .S3,
                             system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: o.jpeg, consent: ConsentToken(sha256: o.sha256),
                             via: replay)
    guard gen == runGen else { return }
    if let b = r.blocked { stage = .failed(Strings.t(b.copyId, ["KIND": "-"])); return }
    guard let reply = r.value, !reply.declined, let text = reply.text, var adv = try? AdvBParser.parse(data: Data(text.utf8)), adv.status != "declined" else {
      // A decline, a safety block or unreadable output: on-device findings only. Never retried or rephrased (inv. 7).
      var input = VerdictInput(adv: nil, matches: [], vault: runVault, caught: caught, refused: true, phase: isReattack ? "reattack" : "initial")
      input.prescreenFlags = prescreenFlags
      let v = VerdictEngine.build(input)
      let round = Round(adv: AdversaryResult(status: "declined"), frame: o.frame, referee: RefereeOutcome(matches: [], route: .rulesOnly, latencyMs: 0, notes: []), verdict: v)
      if isReattack { second = round } else { first = round }
      stage = .refused
      return
    }
    if var j = session {
      // The recording's boxes are 0..1000 of the uncropped sample: map them into the frame actually sent (web boxIntoCrop).
      if !isReattack { j.firstRecording = adv; judge = j }
      if let c = crop, let p = photo { adv.clues = adv.clues.map { var c2 = $0; c2.box2d = JudgeFlow.boxIntoCrop($0.box2d, c, p.width, p.height); return c2 } }
    }
    stage = .working(Strings.t("copy.ref.running"))
    refreshCapability()
    let ref = await RefereeJob.run(gate: gate, adv: adv, vault: runVault)
    guard gen == runGen else { return }
    var input = VerdictInput(adv: VerdictAdv(status: adv.status, hypotheses: adv.hypotheses, inferences: adv.inferences),
                             matches: ref.matches, vault: runVault, caught: caught, phase: isReattack ? "reattack" : "initial")
    input.prescreenFlags = prescreenFlags
    var round = Round(adv: adv, frame: o.frame, referee: ref, verdict: VerdictEngine.build(input))
    round.recorded = r.route == .cached && session != nil
    if isReattack {
      second = round
      if let f = first { comparison = VerdictEngine.compare(f.verdict, round.verdict) }
      stage = .compared
    } else {
      first = round
      stage = .verdict
    }
    refreshCapability()
  }

  /// Judge Mode: the recorded answer for this attack. The "after fix" recording only when the masks and crop being sent
  /// hide the first recording's `fixMasked` clues (D-161); otherwise the first recording again (honest: still exposed).
  private func recordingFor(reattack: Bool, judge j: JudgeSession) -> RecordedReplayTransport? {
    guard let firstData = JudgeManifest.data(j.sample.cachedAdvB) else { return nil }
    var use = firstData
    if reattack, let p = photo, let firstAdv = j.firstRecording ?? (try? AdvBParser.parse(data: firstData)),
       JudgeFlow.fixedRecordingApplies(firstAdv, masks: masks, crop: crop, W: p.width, H: p.height, fixMasked: j.sample.fixMasked) {
      guard let fixed = JudgeManifest.data(j.sample.cachedAdvBFixed) else { return nil }
      use = fixed
    }
    return RecordedReplayTransport(json: String(decoding: use, as: UTF8.self), model: j.sample.model)
  }

  // ---------- 4. fix + re-attack ----------
  func planFix() {
    guard let r = first, let p = photo else { return }
    fix = FixPlanner.deterministicFix(adv: r.adv, frame: r.frame, verdict: r.verdict, vault: activeVault, width: p.width, height: p.height)
    if let f = fix {
      preview = UIImage(cgImage: ImagePipeline.crop(ImagePipeline.applySolidMasks(p.master, masks + f.masks.map(\.box)), f.crop))
    }
    stage = .fixPlanned
  }

  func applyFixAndPrepareReattack() async {
    guard let f = fix else { return }
    masks += f.masks.map(\.box)
    if let c = f.crop { crop = crop.map { Boxes.intersect($0, c) } ?? c }
    await prepareConsent()
  }
}

/// Marker so the UI can label the DEBUG fake attacker honestly.
protocol FakeMarker {}
#if DEBUG
extension FakeAdversaryTransport: FakeMarker {}
#endif
