# shared/prompts: versioned prompts, schemas and fixtures

Both platforms use these files: the web app imports them, and the iOS app bundles them. Their texts come verbatim from `docs/ARCHITECTURE.md` §10. Once these files exist, **they are canonical** and ARCH §10 mirrors them.

## Versioning rules (ARCH §10.1)

- **Drafts until the first recorded run (D-62).**
  - Every prompt in `manifest.json` has `"released": true|false`.
  - A draft may still be edited: run `node scripts/check-prompts.mjs --write` afterwards to refresh its hashes.
  - The task that records a prompt's first real run (T-031/T-039 advA/advB, T-032/T-066 Nano prompts, T-033 fmPre, first explainer run) sets `"released": true`.
- **Released means immutable.**
  - A released prompt's files never change. Neither does `enums.v1.json`, once any prompt is released.
  - To change one, add new `*.v2.*` files and register them in `manifest.json`. Then point Remote Config `prompt_versions` at the new ID in `remoteconfig.template.json`.
- **Hashes.** `manifest.json` records the sha256 of every file here except `manifest.json` and this README:
  - `node scripts/check-prompts.mjs` verifies them, and runs as part of `npm --prefix web run check`;
  - `node scripts/check-prompts.mjs --write` adds new files and re-hashes **draft** files, and refuses (writing nothing) if a released file changed;
  - git-based immutability enforcement is added in T-090.
- **Format.** Files are UTF-8 with LF line endings and exactly one trailing newline. The loader strips that final newline.

## Templates

- The only placeholder syntax is `{{NAME}}`.
- Values of variables whose name ends in `_JSON` are inserted as `JSON.stringify(value)`. All other values must be strings. An empty string means "unknown".
- `render()` (`web/src/ai/prompts.ts`) throws if a placeholder has no value, or if a value matches no placeholder.
- It returns `PromptSegment[]`. Template text is `{dynamic:false}` and substituted values are `{dynamic:true}`. The Egress Gate scans only the dynamic segments for vault strings.
- The tripwire sees whole request bodies (ARCH §8.4). It skips string values that **exactly** equal a `nonContentStrings()` entry: the cloud schemas' strings plus SDK protocol values. It strips the cloud prompts' static texts (`staticSegments()`: advA, advB and explain only), then scans the rest.
- **Device-capable prompts** (`nanoPre`, `nanoVaultText`, `nanoRef`, `nanoFix`, `explain`, `fmPre`) carry every instruction in the user turn.
- **Only the S3 adversary prompts** have a system part: `audit-rules.v1.md` followed by `advA.v1.system.md` or `advB.v1.system.md`, joined with a newline.

## Schemas

- **Format.** Schemas are plain JSON Schema objects, never Firebase `Schema` helper instances.
- **One object for both platforms.** The same object is the device `responseConstraint` and the cloud `responseJsonSchema`.
- **Built at runtime.** The ID-dependent schemas come from builders in `web/src/ai/schemas.ts`: `vaultTextSchema`, `refereeSchema` and `fixSchema`.
  - Their runtime `enum`s mean the model cannot invent IDs.
  - An empty ID list is an invalid schema, so the builders throw `EmptyEnumError`. The caller then skips the device call and runs the deterministic path.
- **Validate in code anyway.** Whether Chrome enforces `enum`, `maxItems` and `additionalProperties` (and accepts that keyword at all) is unverified (U-04, checked in T-032), so code validates every result.

## Files

| ID | User turn | System | Output |
|---|---|---|---|
| `advA.v1` | `advA.v1.user.md` | `audit-rules.v1.md` + `advA.v1.system.md` | Markdown, display-only, grounded |
| `advB.v1` | `advB.v1.user.md` | `audit-rules.v1.md` + `advB.v1.system.md` | `advB.v1.schema.json` |
| `nanoPre.v1` | `nanoPre.v1.user.md` | none | `nanoPre.v1.schema.json` |
| `nanoVaultText.v1` | `nanoVaultText.v1.user.md` (`TEXTS_JSON`, `VAULT_JSON`) | none | `vaultTextSchema(textIds, vaultIds)` |
| `nanoRef.v1` | `nanoRef.v1.user.md` (`CLAIMS_JSON`, `VAULT_JSON`) | none | `refereeSchema(claimIds, vaultIds)` |
| `nanoFix.v1` | `nanoFix.v1.user.md` (`CLUES_JSON`, `MATCHES_JSON`, `DISTANCE_JSON`) | none | `fixSchema(removableIds)` |
| `explain.v1` | `explain.v1.rules.md` + `explain.v1.user.md` (`CLUE_TYPE`, `REGION`, `EVIDENCE`, `REVEALS`) | none | plain text; fallback `explain-fallback.v1.json` |
| `fmPre.v1` (iOS) | `fmPre.v1.user.md` (`LINES_JSON`, `LABELS_JSON`) | none | `@Generable FMPreScreen` |

`enums.v1.json` holds the product enums: clue types, inference kinds, levels, regions, vault kinds, display names and matching word lists. They restate SPEC §17. Tests check that the file matches `web/src/core/types.ts`, SPEC §17.5 and the Firestore whitelist.

## Fixtures (`fixtures/`)

The fixtures are synthetic model outputs that the parser tests decode (Vitest now; XCTest later). They show public places only: no people and no homes. They share one scenario:

- **Pass B (`advB.v1.ok`):** clues come before hypotheses, the same key order as the schema.
  - hypotheses `h1` (neighbourhood) and `h2` (city);
  - clues `c1` transit sign, `c2` storefront, `c3` "HOSPITAL STAFF" lanyard (the fictional demo prop, D-39), and `c4` architecture, which is **non-removable**;
  - inferences `i1` (workplace) and `i2` (transit line).
- **Texts:** `w1` = "LUCAS" (an OCR line from the fictional name-tag prop) and `p1` = "HOSPITAL STAFF" (pre-screen text).
- **Vault:** `v1` child_name "Lucas", `v2` work "City General Hospital" (fictional), and `v3` labelled home pin. None of them carries coordinates.

| File | What it exercises |
|---|---|
| `advB.v1.ok.json` | A valid pass-B result |
| `advB.v1.declined.json`, `advB.v1.no_signal.json` | The non-ok statuses, with empty arrays |
| `advB.v1.bad_ids.json` | Duplicate IDs, and `clue_ids` that point at clues which don't exist (the parser drops them) |
| `advB.v1.swapped_boxes.json` | Reversed corners, out-of-range values, a zero-area box and `radius_km` below 0.1. It is schema-valid, because the bounds live only in descriptions (U-45), so the parser must clamp, swap, drop and floor |
| `advB.v1.truncated.json` | A **wrapper**, `{_fixture, finishReason: "MAX_TOKENS", raw}`, around cut-off raw text. Its `raw` is not valid JSON |
| `nanoPre.v1.ok.json` | A valid pre-screen result |
| `nanoVaultText.v1.ok.json` | Hits for text IDs `w1`/`p1` and vault IDs `v1`/`v2` |
| `nanoRef.v1.ok.json` | A match from claim `i1` to vault item `v2` (likely) |
| `nanoRef.v1.unknown_ids.json` | Invented claim and vault IDs, which must be dropped. Only the last pair is valid |
| `nanoFix.v1.ok.json` | A plan that masks `c3`, `c1` and `c2`. Its `expected_residual` "city" follows D-51: c4, the only clue left, reveals the city |
| `nanoFix.v1.non_removable.json` | A plan that masks the non-removable `c4` (must be rejected) |
