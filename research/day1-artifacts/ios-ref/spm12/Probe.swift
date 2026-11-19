import Foundation
import FoundationModels
import FirebaseCore
import FirebaseAppCheck
import FirebaseAILogic
import FirebaseAuth
import FirebaseRemoteConfig

@Generable struct Clue {
  @Guide(description: "label") var label: String
  var revealsPlace: Bool
}

struct ReportClue: FoundationModels.Tool {
  let name = "reportClue"
  let description = "Report one clue."
  @Generable struct Arguments { var text: String }
  func call(arguments: Arguments) async throws -> String { "ok" }
}

func setup() {
  AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
  FirebaseApp.configure()
}

func hybridProbe() async throws {
  let ai = FirebaseAI.firebaseAI(backend: .googleAI())
  let cloudModel = ai.geminiModel(name: "gemini-3.8-flash")
  let systemModel = FirebaseAI.SystemLanguageModel.default
  // Hybrid via init
  let hybrid = HybridModel(primary: systemModel, secondary: cloudModel)
  let s1 = ai.generativeModelSession(model: hybrid)
  let r1 = try await s1.respond(to: "hi")
  print(r1.content, r1.rawResponse.modelVersion ?? "nil")
  // Hybrid via static provider
  let s2 = ai.generativeModelSession(model: .hybridModel(primary: systemModel, secondary: cloudModel))
  for try await snap in s2.streamResponse(to: "hi") { print(snap.content) }
  // On-device only (throws instead of falling back)
  let s3 = ai.generativeModelSession(model: systemModel, instructions: "You are a referee.")
  let r3 = try await s3.respond(to: "x", generating: Clue.self)
  print(r3.content.label)
  // Tools
  let s4 = ai.generativeModelSession(model: systemModel, tools: [ReportClue()], instructions: "use tools")
  _ = try await s4.respond(to: "x")
  // Options
  _ = try await s1.respond(to: "y", options: .hybrid(
    gemini: GenerationConfig(temperature: 0),
    foundationModels: FirebaseAI.GenerationOptions(sampling: .greedy, temperature: 0)))
  // Availability
  switch FirebaseAI.SystemLanguageModel.default.availability {
  case .available: break
  case .unavailable(.deviceNotEligible), .unavailable(.appleIntelligenceNotEnabled), .unavailable(.modelNotReady): break
  case .unavailable: break
  }
  _ = FirebaseAI.SystemLanguageModel.default.isAvailable
  // Apple-FM-native adapter (12.19+)
  let glm = ai.geminiLanguageModel(name: "gemini-3.8-flash")
  let s5 = LanguageModelSession(model: glm, instructions: "hi")
  _ = try await s5.respond(to: "z")
  // Classic cloud API with grounding + image
  let gm = ai.generativeModel(modelName: "gemini-3.8-flash", tools: [.googleSearch()])
  _ = try await gm.generateContent("q")
  // Auth / RC
  _ = try await Auth.auth().signInAnonymously()
  let rc = RemoteConfig.remoteConfig()
  _ = try await rc.fetchAndActivate()
  _ = rc.configValue(forKey: "k").stringValue
}
