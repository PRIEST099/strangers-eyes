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
