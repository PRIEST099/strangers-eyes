import Foundation
import CoreGraphics
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

func probe(cg: CGImage) async throws {
  AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
  FirebaseApp.configure()
  let ai = FirebaseAI.firebaseAI(backend: .googleAI())
  let glm = ai.geminiLanguageModel(name: "gemini-3.8-flash")
  // cloud through Apple's session API
  let cloud = LanguageModelSession(model: glm, tools: [ReportClue()], instructions: "be brief")
  let r = try await cloud.respond(to: "x", generating: Clue.self)
  print(r.content.label)
  let r2 = try await cloud.respond { "describe"; Attachment(cg) }
  print(r2.content)
  _ = try await cloud.respond(to: "y", contextOptions: ContextOptions(reasoningLevel: .light))
  for try await s in cloud.streamResponse(to: "z") { print(s.content) }
  // on-device only (pure Apple FM)
  let device = LanguageModelSession(model: SystemLanguageModel.default, tools: [], instructions: "referee")
  _ = try await device.respond(to: "q", generating: Clue.self)
  if case .unavailable(let why) = SystemLanguageModel.default.availability { print(why) }
  // errors
  do { _ = try await cloud.respond(to: "e") }
  catch let e as GeminiLanguageModel.Error { print(e) }
  catch let e as LanguageModelError { print(e) }
  // classic cloud API
  let gm = ai.generativeModel(modelName: "gemini-3.8-flash", tools: [.googleSearch()])
  let resp = try await gm.generateContent(cg, "where?")
  print(resp.text ?? "", resp.candidates.first?.groundingMetadata?.searchEntryPoint?.renderedContent ?? "")
  _ = try await Auth.auth().signInAnonymously()
  _ = try await RemoteConfig.remoteConfig().fetchAndActivate()
}

