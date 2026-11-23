// ios/StrangersEyes/App/AppModel.swift: the @Observable root of the lean iOS check (ARCH §19.2), mirroring the web flow:
// import → Tier-0 (faces, OCR, vault text → solid masks) → consent to the exact redacted JPEG → pass B through the Egress
// Gate (S3) → on-device referee (S0, Apple FM or RULES-ONLY) → verdict with distance BANDS (code) → rules fix (masks +
// crop) → consent again → re-attack → compare ("Risk reduced", never "safe").
// The original photo (`photo.master`) never leaves this object; only `outgoing.jpeg`, built from masked pixels and
// re-checked by the gate, can reach a transport (invariant 2).
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

struct Round: Sendable {
  var adv: AdversaryResult
  var frame: ImageFrame
  var referee: RefereeOutcome
  var verdict: Verdict
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
  var usingFake: Bool { gate.transport is FakeMarker }

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
    return EgressGate(ledger: ledger, device: FirebaseDeviceModel(), transport: transport, vault: { [unowned self] in self.vault.items })
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
    photo = nil; tier0 = nil; masks = []; crop = nil; preview = nil; outgoing = nil
    first = nil; fix = nil; second = nil; comparison = nil; stage = .idle
  }

  // ---------- 1. import + Tier-0 ----------
  func importPhoto(_ data: Data) async {
    reset()
    stage = .working(Strings.t("ui.prescreen.facesName"))
    guard let p = ImagePipeline.decode(data) else { stage = .failed(Strings.t("copy.import.unsupported")); return }
    photo = p
    do {
      let r = try await Tier0.run(p.master, terms: VaultScan.termsOf(vault.items))
      tier0 = r
      masks = r.masks.map(\.box)
      preview = UIImage(cgImage: ImagePipeline.applySolidMasks(p.master, masks))
      stage = .prescreened
    } catch {
      stage = .failed(Strings.t("ui.prescreen.failed"))
    }
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
    stage = .working(Strings.t("ui.consent.checking"))
    outgoing = await buildOutgoing()
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
    let isReattack = first != nil
    stage = .working(Strings.t(isReattack ? "ui.step.reattack" : "ui.step.attack"))
    let r = await gate.cloud(job: Strings.t(isReattack ? "ui.step.reattack" : "ui.job.adversaryB"), cls: .S3,
                             system: PromptLibrary.advBSystem, user: PromptLibrary.advBUser, jpeg: o.jpeg, consent: ConsentToken(sha256: o.sha256))
    if let b = r.blocked { stage = .failed(Strings.t(b.copyId, ["KIND": "-"])); return }
    guard let reply = r.value, !reply.declined, let text = reply.text, let adv = try? AdvBParser.parse(data: Data(text.utf8)), adv.status != "declined" else {
      // A decline, a safety block or unreadable output: on-device findings only. Never retried or rephrased (inv. 7).
      let v = VerdictEngine.build(VerdictInput(adv: nil, matches: [], vault: vault.items, caught: caught, refused: true, phase: isReattack ? "reattack" : "initial"))
      let round = Round(adv: AdversaryResult(status: "declined"), frame: o.frame, referee: RefereeOutcome(matches: [], route: .rulesOnly, latencyMs: 0, notes: []), verdict: v)
      if isReattack { second = round } else { first = round }
      stage = .refused
      return
    }
    stage = .working(Strings.t("copy.ref.running"))
    let ref = await RefereeJob.run(gate: gate, adv: adv, vault: vault.items)
    let input = VerdictInput(adv: VerdictAdv(status: adv.status, hypotheses: adv.hypotheses, inferences: adv.inferences),
                             matches: ref.matches, vault: vault.items, caught: caught, phase: isReattack ? "reattack" : "initial")
    let round = Round(adv: adv, frame: o.frame, referee: ref, verdict: VerdictEngine.build(input))
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

  // ---------- 4. fix + re-attack ----------
  func planFix() {
    guard let r = first, let p = photo else { return }
    fix = FixPlanner.deterministicFix(adv: r.adv, frame: r.frame, verdict: r.verdict, vault: vault.items, width: p.width, height: p.height)
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
