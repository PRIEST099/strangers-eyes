// web/src/core/types.ts — shared domain types (no runtime imports except enums)

// ---------- enums (as const; erasableSyntaxOnly forbids TS `enum`) ----------
export const CLUE_TYPES = ['name_text', 'house_number', 'plate', 'street_sign', 'transit_sign', 'storefront_text',
  'uniform_or_lanyard', 'crest_or_logo', 'mail_or_document', 'screen', 'window_view', 'reflection', 'landmark',
  'architecture', 'road_or_street_furniture', 'vegetation_or_terrain', 'language_or_script', 'other'] as const;
export type ClueType = (typeof CLUE_TYPES)[number];
export const PRESCREEN_CLUE_TYPES = CLUE_TYPES.slice(0, 13) as readonly ClueType[];

export const INFERENCE_KINDS = ['workplace', 'school', 'home_area', 'routine', 'transit_line', 'venue', 'other'] as const;
export type InferenceKind = (typeof INFERENCE_KINDS)[number];

export const CONF = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONF)[number];

/** Adversary's self-declared precision (pass B `level`), finest first. */
export const LEVELS = ['street', 'neighbourhood', 'district', 'city', 'region', 'country'] as const;
export type Level = (typeof LEVELS)[number];

export const REGIONS = ['top_left', 'top_center', 'top_right', 'middle_left', 'middle_center', 'middle_right',
  'bottom_left', 'bottom_center', 'bottom_right'] as const;
export type GridRegion = (typeof REGIONS)[number];

/** Code-computed distance band from a hypothesis to one of the user's pins, finest first. */
export const DISTANCE_BANDS = ['street', 'neighbourhood', 'district', 'city', 'country', 'none'] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];
export interface BandThresholdsM { street: number; neighbourhood: number; district: number; city: number; country: number }

// ---------- routing ----------
export type PayloadClass = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';
export type JobName = 'preScreen' | 'vaultTextMatch' | 'referee' | 'fixPlan' | 'explain' | 'adversaryA' | 'adversaryB';
export type WebMode = 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_IN_CLOUD';
export type IosMode = 'ON_DEVICE_SESSION' | 'HYBRID_MODEL' | 'CLOUD' | 'NONE';
export type NoModelFallback = 'DETERMINISTIC' | 'TIER0' | 'CLOUD' | 'NONE';
/** What actually produced a result; drives every badge in the Router HUD. */
export type Route = 'ON_DEVICE' | 'IN_CLOUD' | 'RULES_ONLY' | 'CACHED' | 'BLOCKED';

export interface ClassPolicy {
  web: WebMode;
  ios: IosMode;
  noModel: NoModelFallback;
  /** May any byte of this class reach a cloud endpoint? Hard-floored to false for S0/S1. */
  cloud: boolean;
}
export interface RoutingPolicy {
  version: number;
  classes: Record<PayloadClass, ClassPolicy>;
  /** Default class per job outside Judge Mode. In Judge Mode the device jobs run as S4. */
  jobs: Record<JobName, PayloadClass>;
}

// ---------- vault (LOCAL ONLY; sealed with AES-GCM in IndexedDB / Keychain on iOS) ----------
export type VaultKind =
  | 'home_pin' | 'work_pin' | 'school_pin' | 'other_pin'   // carry a Pin
  | 'self_name' | 'child_name' | 'person_name'              // names
  | 'employer' | 'school_name' | 'home_label'                // organisations / areas (e.g. neighbourhood name)
  | 'plate' | 'house_number' | 'phone'                      // digit-ish strings
  | 'uniform_descriptor' | 'custom_text';

export interface Pin {
  lat: number;
  lng: number;
  accuracyM: number;            // from GeolocationPosition.coords.accuracy
  capturedAt: number;           // epoch ms
  source: 'geolocation' | 'manual' | 'synthetic';   // synthetic = Judge Mode only
}

export interface VaultItem {
  id: string;                   // stable local id, e.g. "vi_8f3a…"; prompts use short aliases v1..vN built per call
  kind: VaultKind;
  label: string;                // user-facing, e.g. "Lucas", "City General Hospital", "Campo de Ourique"
  aliases: string[];            // extra spellings / nicknames / acronyms ("CGH")
  pin?: Pin;                    // required for *_pin kinds, absent otherwise
  createdAt: number;
}

// ---------- geometry ----------
/** Gemini convention: [ymin, xmin, ymax, xmax], integers 0..1000, relative to the image SENT. */
export type Box2D = [number, number, number, number];
/** Pixel rect in the coordinates of a named frame (see ImageFrame). */
export interface PxRect { x: number; y: number; w: number; h: number }
export interface ImageFrame {
  id: string;                   // 'master' | 'nano768' | 'cloud' | 'export' …
  width: number;
  height: number;
  /** Rect of this frame inside the oriented master, before scaling. Uncropped frames = full master. */
  cropInMaster: PxRect;
}

// ---------- clues ----------
export type ClueSource = 'tier0_face' | 'tier0_ocr_vault' | 'tier0_regex' | 'nano_prescreen' | 'nano_vault_text'
  | 'adversary_b' | 'manual';

export interface Clue {
  id: string;                   // local id: "t0-3", "np-2", "c4" (pass-B ids are kept verbatim, prefixed per run: "r1:c4")
  source: ClueSource;
  type: ClueType | 'face';
  box: PxRect;                  // ALWAYS in master-frame pixels
  boxPrecision: 'exact' | 'grid_cell';      // Nano regions are 3x3 grid cells unless an OCR box confirmed them
  severity: Confidence;
  removable: boolean;           // faces/text: true; adversary decides for its own clues
  /** LOCAL ONLY text read on device (OCR/Nano). Never sent anywhere. */
  localText?: string;
  /** Pass-B evidence (cloud output, max 20 words). Safe to show and to use in S2 explain. */
  evidence?: string;
  reveals?: Level | 'venue_or_organisation';
  /** LOCAL ONLY: vault item ids this clue matched on device. */
  vaultHits: string[];
  masked: boolean;
  maskReason?: 'face' | 'vault_text' | 'regex' | 'auto_type' | 'strict' | 'fix_plan' | 'user';
}

// ---------- adversary (pass B, validated) ----------
export interface AdversaryHypothesis {
  id: string;                   // h1..h3
  label: string;                // area name at justified precision (never shown on a map)
  level: Level;
  lat: number;
  lng: number;
  radiusKm: number;             // >= 0.1
  confidence: Confidence;
  clueIds: string[];            // validated: all exist in clues
}
export interface Inference {
  id: string;                   // i1..i8
  kind: InferenceKind;
  value: string;                // organisation / place / line / area; never a person
  confidence: Confidence;
  clueIds: string[];
}
export interface AdversaryClue {
  id: string;                   // c1..c12
  type: ClueType;
  box2d: Box2D;                 // normalised, corners fixed, zero-area dropped
  evidence: string;
  reveals: Level | 'venue_or_organisation';
  severity: Confidence;
  removable: boolean;
}
export type AuditStatus = 'ok' | 'no_location_signal' | 'declined';
export interface AdversaryResult {
  runId: string;                // "r1" first attack, "r2" re-attack …
  promptVersion: string;        // "advB.v1"
  model: string;                // exact model id used
  status: AuditStatus | 'blocked' | 'truncated' | 'unreadable';
  declineReason?: string;
  sceneSummary: string;
  hypotheses: AdversaryHypothesis[];
  clues: AdversaryClue[];
  inferences: Inference[];
  sentImageSha256: string;      // which consented image produced this
  sentFrame: ImageFrame;        // to map box2d back to master pixels
  route: Route;                 // IN_CLOUD or CACHED (Judge Mode fallback)
  latencyMs: number;
}
/** Pass A is display-only (Search-grounding terms): never parsed, never cached across users, never fed to code. */
export interface AdversaryNotes {
  runId: string;
  markdown: string;             // rendered as-is
  declined: boolean;            // text starts with "DECLINED:"
  searchEntryPointHtml?: string;  // groundingMetadata.searchEntryPoint.renderedContent, rendered in a shadow root
  webSearchQueries: string[];
  sources: { uri: string; title: string }[];
}

// ---------- referee / verdict / fix ----------
export type MatchStrength = 'exact' | 'likely' | 'possible';
export interface RefereeMatch {
  claimId: string;              // pass-B inference id (i*) or hypothesis id (h*)
  vaultId: string;              // LOCAL vault item id (mapped back from the v1..vN alias)
  strength: MatchStrength;
  reason: string;               // <= 12 words, local only
  route: Route;                 // ON_DEVICE (Nano/FM) or RULES_ONLY (deterministic matcher)
}
export interface PinBand {
  vaultId: string;              // a *_pin vault item
  band: DistanceBand;           // closest band over all hypotheses (conservative)
  hypothesisId: string | null;
  confidence: Confidence | null;
  effectiveKm: number | null;   // max(haversine(center,pin), radiusKm) — NEVER shown in UI, bands only
}
export type VerdictColor = 'red' | 'amber' | 'green' | 'grey';
export interface VerdictLine {
  id: string;
  kind: 'pin_band' | 'identified' | 'caught_local' | 'declined' | 'info';
  color: VerdictColor;
  text: string;                 // e.g. "Identified your WORKPLACE by name", "Home: within 1 km"
  vaultId?: string;
  band?: DistanceBand;
  confidence?: Confidence;
  route: Route;                 // who produced the evidence for this line
}
export interface Verdict {
  phase: 'initial' | 'after_fix';
  color: VerdictColor;          // worst line colour (grey only if everything is grey)
  headline: string;             // never contains the word "safe"
  lines: VerdictLine[];
  pinBands: PinBand[];
  matches: RefereeMatch[];
  riskReduced: boolean;         // only meaningful for phase 'after_fix'
}
export interface FixPlan {
  maskClueIds: string[];        // subset of removable adversary + local clue ids
  crop: 'none' | 'top' | 'bottom' | 'left' | 'right';
  explanation: string;          // <= 2 sentences / 40 words, never repeats private labels
  expectedResidual: 'country' | 'region' | 'city' | 'district' | 'neighbourhood' | 'street';
  route: Route;                 // ON_DEVICE or RULES_ONLY
}

// ---------- ledger ----------
export interface LedgerEntry {
  id: string;
  sessionId: string;
  ts: number;
  job: JobName;
  payloadClass: PayloadClass;
  route: Route;
  mode: WebMode | IosMode;
  model: string;                // "gemini-nano" | "apple-fm" | exact cloud model id | "rules"
  inferenceSource?: 'on_device' | 'in_cloud';   // straight from response.inferenceSource (web)
  latencyMs: number;
  bytesOut: number;             // actual request body bytes seen by the tripwire (0 for on-device / rules)
  imagesOut: number;
  imageSha256: string[];
  facesInOutgoing: number;      // must be 0 for any sent request (gate blocks otherwise)
  vaultItemsInOutgoing: number; // must be 0 for any sent request
  blocked?: { reason: GateBlockReason; vaultId?: string };
  error?: string;               // GateErrorCode when the call failed after leaving the gate
}
export type GateBlockReason = 'CLASS_FLOOR' | 'CLASS_MISMATCH' | 'NOT_SYNTHETIC' | 'KILL_SWITCH' | 'DAILY_CAP' | 'OFFLINE'
  | 'NO_CONSENT' | 'EXIF' | 'BAD_MIME' | 'FACE' | 'VAULT_TEXT_IN_IMAGE' | 'VAULT_TEXT_IN_PROMPT' | 'PIN_IN_PROMPT'
  | 'TRIPWIRE';
export interface LedgerCounters {
  cloudRequests: number;
  imagesSent: number;
  bytesSent: number;
  facesSent: number;            // the demo shows "Faces sent: 0"
  vaultItemsSent: number;       // the demo shows "Vault items sent: 0"
  onDeviceCalls: number;
  rulesOnlyCalls: number;
  blocked: number;
}
