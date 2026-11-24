// ios/StrangersEyes/AI/Generables.swift: static @Generable result types for the on-device S0 jobs (ARCH §19.4: a static
// Generable cannot hold runtime ID enums, so IDs and strengths are validated IN CODE and unknown ones dropped, AC-161).
import Foundation
import FoundationModels

/// nanoRef.v1 answer (SPEC SCR-09). snake_case to match the shared prompt and fixtures.
@Generable
struct FMRefereeAnswer {
  @Guide(description: "Only the claim/vault pairs that match. Empty if none match.")
  var matches: [FMRefereeMatch]
}

@Generable
struct FMRefereeMatch {
  @Guide(description: "a claim id from CLAIMS, e.g. c1")
  var claim_id: String
  @Guide(description: "a vault id from VAULT, e.g. v1")
  var vault_id: String
  @Guide(description: "exact, likely or possible")
  var strength: String
  @Guide(description: "at most 12 words")
  var reason: String
}

/// fmPre.v1 answer (SPEC §14.2 I3; ARCH §10.12): the iOS TEXT-ONLY pre-screen. Types, regions, severities and line ids are
/// validated in code (PrescreenJob.validate); unknown ones are dropped.
@Generable
struct FMPreScreen {
  @Guide(description: "At most 8 items, most severe first. Empty if nothing qualifies.")
  var clues: [FMPreClue]
}

@Generable
struct FMPreClue {
  @Guide(description: "one of the listed types, e.g. street_sign")
  var type: String
  @Guide(description: "the id of the text line, e.g. l1, or empty for scene labels")
  var line_id: String
  @Guide(description: "the words it is about, copied exactly, or empty")
  var text: String
  @Guide(description: "a region such as top_left, middle_center or bottom_right")
  var region: String
  @Guide(description: "high, medium or low")
  var severity: String
}
