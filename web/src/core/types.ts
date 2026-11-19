// web/src/core/types.ts — all domain types. Enum VALUES mirror shared/prompts/enums.v1.json (a Vitest test compares them).
// erasableSyntaxOnly: no TS `enum`, no parameter properties, no namespaces. Use `as const` arrays.

// ---------- enums ----------
export const CLUE_TYPES = ['name_text', 'house_number', 'plate', 'street_sign', 'transit_sign', 'storefront_text',
  'uniform_or_lanyard', 'crest_or_logo', 'mail_or_document', 'screen', 'window_view', 'reflection', 'landmark',
  'architecture', 'road_or_street_furniture', 'vegetation_or_terrain', 'language_or_script', 'other'] as const;
export type ClueType = (typeof CLUE_TYPES)[number];
export const PRESCREEN_CLUE_TYPES: readonly ClueType[] = CLUE_TYPES.slice(0, 13);

export const INFERENCE_KINDS = ['workplace', 'school', 'home_area', 'routine', 'transit_line', 'venue', 'other'] as const;
export type InferenceKind = (typeof INFERENCE_KINDS)[number];
/** Claim kinds seen by the referee: pass-B inference kinds plus 'area' for hypotheses. */
export type ClaimKind = InferenceKind | 'area';

export const CONF = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONF)[number];

/** Adversary's self-declared precision (pass B `level` / `reveals`), finest first. */
export const LEVELS = ['street', 'neighbourhood', 'district', 'city', 'region', 'country'] as const;
export type Level = (typeof LEVELS)[number];
export type Reveals = Level | 'venue_or_organisation';

export const REGIONS = ['top_left', 'top_center', 'top_right', 'middle_left', 'middle_center', 'middle_right',
  'bottom_left', 'bottom_center', 'bottom_right'] as const;
export type GridRegion = (typeof REGIONS)[number];

/** Code-computed distance band from a hypothesis to one of the user's pins, finest first (SPEC §10.1). */
export const DISTANCE_BANDS = ['street', 'neighbourhood', 'district', 'city', 'country', 'none'] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];
export interface BandThresholdsM { street: number; neighbourhood: number; district: number; city: number; country: number }

/** SPEC §17.2 — the only vault kinds. */
export const VAULT_KINDS = ['home_pin', 'work_pin', 'school_pin', 'place_pin', 'self_name', 'child_name', 'person_name',
  'employer', 'school_name', 'area_name', 'street_name', 'plate', 'house_number', 'phone', 'descriptor', 'other_text'] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];
export const PIN_KINDS: readonly VaultKind[] = ['home_pin', 'work_pin', 'school_pin', 'place_pin'];
export const DIGIT_KINDS: readonly VaultKind[] = ['plate', 'house_number', 'phone'];
export const VAULT_MAX_ITEMS = 20;
export const VAULT_LABEL_MAX = 40;

export const STRENGTHS = ['exact', 'likely', 'possible'] as const;
export type MatchStrength = (typeof STRENGTHS)[number];

// ---------- routing ----------
export type PayloadClass = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';
export type JobName = 'preScreen' | 'vaultTextMatch' | 'referee' | 'fixPlan' | 'explain' | 'adversaryA' | 'adversaryB';
export type WebMode = 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_IN_CLOUD';
export type IosMode = 'ON_DEVICE_SESSION' | 'HYBRID_MODEL' | 'CLOUD' | 'NONE';
export type NoModelFallback = 'DETERMINISTIC' | 'TIER0' | 'CLOUD' | 'NONE';
/** What actually produced a result (SPEC §17.1 ROUTE); drives every badge in the Router HUD. */
export type Route = 'ON_DEVICE' | 'IN_CLOUD' | 'RULES_ONLY' | 'CACHED' | 'BLOCKED' | 'QUEUED';

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
export interface Pin {
  lat: number;
  lng: number;
  accuracyM: number;            // GeolocationPosition.coords.accuracy, or 0 for manual
  capturedAt: number;           // epoch ms
  source: 'geolocation' | 'manual' | 'synthetic';   // synthetic = Judge Mode only
}
export interface VaultItem {
  id: string;                   // stable local id, e.g. "vi_8f3a…"; prompts see short aliases v1..vN built per call
  kind: VaultKind;
  label: string;                // <= 40 chars, e.g. "Lucas", "City General Hospital"; pins may have a generic label ("Home")
  aliases: string[];            // extra spellings / nicknames / acronyms ("CGH"), each <= 40 chars
  pin?: Pin;                    // present iff kind is in PIN_KINDS
  linkedPinId?: string;         // area_name created from a pin's optional "area" field
  createdAt: number;
}

// ---------- geometry ----------
/** Gemini convention: [ymin, xmin, ymax, xmax], integers 0..1000, relative to the image SENT. */
export type Box2D = [number, number, number, number];
/** Pixel rect in the coordinates of a named frame (see ImageFrame). */
export interface PxRect { x: number; y: number; w: number; h: number }
export interface ImageFrame {
  id: 'master' | 'nano768' | 'cloud' | 'export';
  width: number;
  height: number;
  /** Rect of this frame inside the master, before scaling. Uncropped frames = full master. */
  cropInMaster: PxRect;
}

// ---------- clues ----------
export type ClueSource = 'tier0_face' | 'tier0_ocr_vault' | 'tier0_regex' | 'nano_prescreen' | 'nano_vault_text'
  | 'adversary_b' | 'gate_preflight' | 'manual';
export type Readers = 'tier0' | 'nano' | 'both' | 'cloud' | 'gate' | 'user';
export type MaskReason = 'face' | 'vault_text' | 'regex' | 'auto_type' | 'strict' | 'fix_plan' | 'gate_auto' | 'user';
export interface Clue {
  id: string;                   // "t0-3", "np-2", "pf-1"; pass-B ids are kept and prefixed per run: "r1:c4"
  source: ClueSource;
  readers: Readers;
  type: ClueType | 'face';
  box: PxRect;                  // ALWAYS master-frame pixels
  boxPrecision: 'exact' | 'grid_cell';
  region?: GridRegion;
  severity: Confidence;
  removable: boolean;
  /** LOCAL ONLY text read on device (OCR/Nano). Never sent anywhere, never in an S2 payload. */
  localText?: string;
  /** Pass-B evidence (cloud output, <= 20 words). May be used in S2 explain. */
  evidence?: string;
  reveals?: Reveals;
  /** LOCAL ONLY: vault item ids this clue matched on device. */
  vaultHits: string[];
  masked: boolean;
  /** The user deliberately un-ticked this mask. The consent dry run never re-masks it: it warns (copy.consent.unmasked), Send stays enabled, and the gate blocks the send (forced-leak demo). */
  userUnmasked: boolean;
  maskReason?: MaskReason;
}

// ---------- adversary (pass B, validated) ----------
export interface AdversaryHypothesis {
  id: string;                   // h1..h3
  label: string;                // area name at justified precision (shown as text; never on a map)
  level: Level;
  lat: number;                  // used by code for bands ONLY; never rendered
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
  reveals: Reveals;
  severity: Confidence;
  removable: boolean;
}
export type AuditStatus = 'ok' | 'no_location_signal' | 'declined';
export interface AdversaryResult {
  runId: string;                // "r1" first attack, "r2" re-attack …
  promptVersion: string;        // "advB.v1"
  model: string;
  status: AuditStatus | 'blocked' | 'truncated' | 'unreadable';
  declineReason?: string;
  sceneSummary: string;
  hypotheses: AdversaryHypothesis[];
  clues: AdversaryClue[];
  inferences: Inference[];
  sentImageSha256: string;
  sentFrame: ImageFrame;
  route: 'IN_CLOUD' | 'CACHED';
  latencyMs: number;
  echoedVaultIds: string[];     // vault items whose strings appeared in returned text (response-side scan)
}
/** Pass A is display-only (grounding terms): never parsed, persisted, cached or fed to code. Memory only. */
export interface AdversaryNotes {
  runId: string;
  markdown: string;
  declined: boolean;            // text starts with "DECLINED:"
  searchEntryPointHtml?: string;
  webSearchQueries: string[];
  sources: { uri: string; title: string }[];
}

// ---------- referee / verdict / fix (SPEC §10) ----------
export interface RefereeMatch {
  claimId: string;              // i* or h*
  vaultId: string;              // LOCAL vault item id (mapped back from the v1..vN alias)
  strength: MatchStrength;
  reason: string;               // <= 12 words, local only
  clueIds: string[];            // clues the claim relies on
  route: Route;                 // ON_DEVICE (Nano/FM) or RULES_ONLY
}
export interface PinBand {
  vaultId: string;
  band: DistanceBand;
  hypothesisId: string | null;
  confidence: Confidence | null;
  effectiveKm: number | null;   // max(d, r) — NEVER shown; bands only
}
export type LineSeverity = 'HIGH' | 'MEDIUM' | 'INFO' | 'NONE' | 'CAUGHT';
export type VerdictLevel = 'RED' | 'AMBER' | 'LOW' | 'PARTIAL';
export interface VerdictLine {
  id: string;
  kind: 'pin' | 'match' | 'pin_match' | 'caught' | 'echo' | 'found_on_device';
  severity: LineSeverity;       // UI colour: HIGH red, MEDIUM amber, INFO grey, CAUGHT teal. GREEN is never a line colour.
  copyId: string;               // SPEC §11 id, e.g. 'copy.verdict.likely'
  params: Record<string, string>;
  vaultId?: string;
  band?: DistanceBand;
  strength?: MatchStrength;
  confidence?: Confidence;
  clueIds: string[];
  route: Route;
}
export interface Verdict {
  phase: 'initial' | 'after_fix';
  level: VerdictLevel;
  lines: VerdictLine[];
  notLinkedVaultIds: string[];
  bestGuess: { level: Level; label: string; confidence: Confidence } | null;
  pinBands: PinBand[];
  matches: RefereeMatch[];
  noVault: boolean;
}
export interface VerdictComparison {
  riskReduced: boolean;         // the ONLY thing ever coloured green
  before: Verdict;
  after: Verdict;
  worstRemainingLineId: string | null;
}
export type CropSide = 'none' | 'top' | 'bottom' | 'left' | 'right';
export interface FixPlan {
  maskClueIds: string[];
  crop: CropSide;
  explanation: string;          // <= 2 sentences / 40 words, never repeats private labels
  expectedResidual: 'country' | 'region' | 'city' | 'district' | 'neighbourhood' | 'street';
  route: Route;                 // ON_DEVICE or RULES_ONLY
  rulesAddedMasks: number;      // > 0 when validateDevicePlan topped up the device plan
}

// ---------- ledger ----------
export type GateBlockReason = 'CLASS_FLOOR' | 'CLASS_MISMATCH' | 'NOT_SYNTHETIC' | 'KILL_SWITCH' | 'DAILY_CAP' | 'OFFLINE'
  | 'NO_CONSENT' | 'EXIF' | 'BAD_MIME' | 'FACE' | 'VAULT_TEXT_IN_IMAGE' | 'VAULT_TEXT_IN_PROMPT' | 'PIN_IN_PROMPT'
  | 'TRIPWIRE';
export interface LedgerEntry {
  id: string;
  sessionId: string;
  judge: boolean;               // S4 / Judge Mode entries are tagged and filtered separately
  ts: number;
  status: 'pending' | 'done';   // written BEFORE the call, completed after (SPEC §7.1 step 5)
  job: JobName;
  payloadClass: PayloadClass;
  route: Route;
  mode: WebMode | IosMode | 'RULES';
  model: string;                // "gemini-nano" | "apple-fm" | exact cloud model id | "rules" | "tier0:mediapipe" …
  promptVersion: string | null;
  inferenceSource?: 'on_device' | 'in_cloud';
  latencyMs: number;
  bytesOut: number;             // request body bytes seen by the tripwire (0 for on-device / rules / blocked)
  imagesOut: number;
  imageSha256: string[];
  facesInOutgoing: number;      // 0 for every sent request (the gate blocks otherwise)
  vaultItemsInOutgoing: number; // 0 for every sent request
  groundedQueries?: number;     // pass A: webSearchQueries.length
  notes: string[];              // 'fallback: no on-device model', 'RECLASSIFIED S2→S0', 'simulated', 'policy floored' …
  blocked?: { reason: GateBlockReason; vaultId?: string; vaultKind?: VaultKind };  // never the string itself (AC-045)
  error?: string;               // GateErrorCode
}
export interface LedgerCounters {
  facesSent: number;            // "Faces sent: 0"
  vaultItemsSent: number;       // "Vault items sent: 0"
  uniqueImages: number;
  cloudRequests: number;
  bytesSent: number;
  onDeviceCalls: number;
  rulesChecks: number;
  blocked: number;
}

// ---------- pipeline ----------
export interface OcrWord { text: string; conf: number; box: PxRect /* master px */; line: number }
export interface PreScreenClue { type: ClueType; text: string; region: GridRegion; severity: Confidence }
export interface VaultTextHit { textId: string; vaultId: string; strength: MatchStrength }
export interface ConsentToken { sha256: string; sessionId: string; issuedAt: number }   // TTL 10 min, one image
export interface PendingCheck { id: string; createdAt: number; sessionId: string; masterJpeg: Blob; clues: Clue[] }
export type Phase = 'idle' | 'imported' | 'tier0' | 'prescreen' | 'review' | 'preflight' | 'consent' | 'queued_offline'
  | 'attacking' | 'refereeing' | 'verdict' | 'fixing' | 'fix_review' | 'reattacking' | 'verdict_after' | 'done';
export interface CheckSession {
  id: string;
  phase: Phase;
  judgeSampleId: string | null;
  strict: boolean;
  master: ImageFrame;           // pixels live in pipeline-owned canvases, not React state
  clues: Clue[];
  consent: ConsentToken | null;
  sentImages: { runId: string; sha256: string; jpeg: Blob; promptIds: string[]; model: string; at: number }[];
  attacks: AdversaryResult[];
  notes: AdversaryNotes[];      // pass A, memory only
  verdicts: Verdict[];
  fix: FixPlan | null;
  fixRoundsUsed: number;
  refused: boolean;             // state (e): no retry, no re-attack for this photo
  compromised: boolean;         // mirrors gateState.compromised (AC-022) for the UI
}
