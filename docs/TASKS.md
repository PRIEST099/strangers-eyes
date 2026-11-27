# Strangers' Eyes: master task list (`docs/TASKS.md`)

> This file is the build plan as checkboxes. A fresh session that remembers nothing continues from this file and `docs/PROGRESS.md`.
> - Status, work in progress, key values and the Decisions log live in `PROGRESS.md`. This file holds tasks and checkboxes only.
> - Written Thu Nov 19 2026 (Day 0, evening; SPEC §0.3 numbering).
> - **Hard deadline:** Mon Nov 30 2026, 14:00 PT. That is 22:00 UTC, or Tue Dec 1 00:00 GMT+2. Commits pushed after it are not evaluated.
> - **Internal deadline:** Mon Nov 30, 12:00 GMT+2: submitted on Devpost, repo tagged `submission-v1`.
> - **Judging:** Dec 10 to Dec 16, 14:00 PT. The hosted app must stay up, free and unrestricted until then.

---

## 0. How to use this file

### 0.1 Which document wins (one rule)

When two sources disagree, the higher one wins:

1. **`CLAUDE.md` invariants.**
2. **Decisions logged in `PROGRESS.md`**, until the affected doc is edited (which must happen in the same session).
3. **`docs/SPEC.md`**: behaviour, acceptance criteria (ACs), UI copy (§11), enums and vault kinds (§17), verdict logic (§10).
4. **`docs/ARCHITECTURE.md`**: file paths (§3), types (§6), module boundaries (§4.2), Remote Config key names (§13), prompt text (§10), Firestore rules (§14).
5. **`docs/API-NOTES.md`**: how the SDKs really behave.
6. **`docs/RUNBOOK.md`**: setup, deploy, filming and submission steps.
7. **This file**: plan, order, due dates.
8. **`PLAN.md` and `research/winner-spec.md`**: history only.
   - `PLAN.md` is stale on: temperature 0; firebase-ios-sdk "≥12.13 / latest"; pass B reading pass A; Firestore holding Judge Mode metadata; a Day-1 iOS tool-call spike; filming on Nov 30; "Spark works".
   - T-022 adds a banner saying so.

**Once code exists, the code is the source of truth** and the docs point to it:
- `remoteconfig.template.json` for Remote Config (RC) keys;
- `shared/prompts/` for prompts;
- `firestore.rules` for rules;
- `shared/strings/en.json` for copy.

### 0.2 Doc map and context budget

**Never Read a whole doc.** SPEC alone is about 130 KB, and all docs together come to roughly 130k tokens.
- Grep for the task ID, the AC ID or the § heading, then Read with `offset`/`limit`.
- Every task has a **Read:** line. Open only those sections.
- § numbers are as of Nov 19. If a heading has moved, grep for its title.

| File | Answers | Sections used most |
|---|---|---|
| `docs/PROGRESS.md` | Where are we? | STATE block, WIP, USER pending, Key values, Day-1 gates, Decisions log, latest session entry |
| `docs/TASKS.md` | What next? | §1–§4, plus the milestone you are in |
| `docs/SPEC.md` | What must the product do? | §0.4 decisions D-01..D-39 · §5 capability states · §6 routing · §7 gate · §8 layout · §9 SCR-01..SCR-22 screens · §10 verdict · §11 copy · §12 safety (SR-xx) · §14 iOS · §15 benchmark · §16 RC behaviour · §17 enums · §18 AC index |
| `docs/ARCHITECTURE.md` | Where does code go, and how? | §2 AD-01..AD-33 · §3 layout · §4.2 boundaries · §5 flows · §6 types · §7 routing · §8 gate (§8.2 algorithm, §8.3 preflight, §8.4 text matcher, §8.5 tripwire and interlock, §8.6 ledger, §8.7 block reasons) · §9 jobs and models (§9.5 capabilities) · §10 prompts · §11 image pipeline · §12 referee/bands/fix · §13 RC · §14 Firestore · §15 bootstrap · §16 PWA · §17 errors · §18 performance · §19 iOS · §20 tests · §21 benchmark |
| `docs/API-NOTES.md` | How the SDKs really behave | §0 overrides · §1 web `firebase/ai` · §2 platform (App Check, Auth, RC, Firestore, Hosting, CLI) · §3 iOS AI Logic · §4 iOS frameworks · §5 web libs · §6 Gemini prompting · §9 gotchas · §10 UNVERIFIED register (U-xx) · §11 pins |
| `docs/RUNBOOK.md` | How to set up, run, deploy, film and submit | §1 USER setup · §2 local dev · §3 on-device checks · §4 deploy · §5 benchmark · §6 filming · §7 submission · §8 troubleshooting |
| `research/day1-artifacts/` (rescued Nov 19, T-020) | Verified reference code | its `README.md` index |

### 0.3 Task format

```
- [ ] T-0NN [OWNER] Title. Due: Day Mon DD · Deps: T-… · AC: AC-xxx
  - Read: doc § list (open only these)
  - Files: deliverables (repo-relative; must match ARCH §3)
  - Do: key steps and pitfalls
  - Done when: acceptance
  - Verify: command, test or manual check
```

### 0.4 Owners, status markers and IDs

**Owners**
- `[CLAUDE]` is the coding agent.
- `[USER]` is the human: sign-ins, billing, consoles, decisions, photos, recording, uploads, submission.
- Claude never types passwords or secrets into web forms. When a USER task is due or overdue, Claude opens its reply with a reminder that gives the task ID and the exact steps, then keeps working on something unblocked.

**Status markers**

| State | How to write it |
|---|---|
| Open | `- [ ]` |
| Done | `- [x]` followed by `(done Nov 21; verified: <evidence>)`. Tick only after **Verify** has actually passed. |
| Blocked | Leave the box open and append `BLOCKED: T-0xx` to the first line. |
| Cut | `- [x] ~~T-0xx …~~ CUT Nov 2x (D-nn)` |

**IDs are stable. Never renumber.** A new task takes the next free number in its milestone's range.

| Milestone | Range |
|---|---|
| M0 Setup | T-001–T-029 (USER T-001–T-019, CLAUDE T-020–T-029) |
| M1 Spikes | T-030–T-049 |
| M2 Web core | T-050–T-099 |
| M3 Firebase/hosting | T-100–T-119 |
| M4 iOS | T-120–T-149 |
| M5 Benchmark | T-150–T-159 |
| M6 Polish/README | T-160–T-179 |
| M7 Video/submission | T-180–T-199 |
| Stretch | T-200–T-209 |

**References**
- **AC IDs are SPEC's three-digit `AC-xxx` only.** See §6.
- **Decision IDs** follow §5: SPEC's `D-nn`, ARCH's `AD-nn`, and the reconciliation items `R-nn` in T-022.
- `[UNVERIFIED]` means unknown. Verify against official docs or at runtime before relying on it, then flip it in `API-NOTES.md`.

### 0.5 Picking the next task

1. Choose the unchecked `[CLAUDE]` task with the **earliest Due date** whose Deps are all `[x]`. Break ties by ID.
2. If it is blocked by a USER task, take the next one.
3. **Never sit idle.** These need no Firebase project: T-022, T-023, T-024, T-050–T-061, T-086 (once T-031 is done), T-087, T-088, T-090, T-091, T-093, T-121.
4. The `Now:` line in the PROGRESS STATE block is a lock. If it names a task and you are not resuming a crashed session (§1 step 3), ask the user whether another session is running before taking that task.

### 0.6 Shorthands

| Shorthand | Meaning |
|---|---|
| `ROOT` | `/Users/mac/Documents/firebase buildathon` |
| `$FB` | `npx -y firebase-tools@15.37.0` for deploys and app commands. Pinned; no global install. |
| `$FB13` | `npx -y firebase-tools@13.35.1`, **emulators only**. CLI 15.x needs Java 21; this Mac has Java 17, and the 13.35.1 emulator jar is cached. |
| `PRIV` | `/Users/mac/StrangersEyes-private/` with subfolders `spike/ bench/ scenes/ gate-test/ test/ raw/ video/` (the same list as RUNBOOK §0.4 and §2.2; raw JSON such as `spike-<date>.json` and `bench-<date>.json` goes in `raw/`, SPEC §15.4). **Outside the repo.** Holds real photos, `truth.csv` (columns `id,lat,lng,place_type,clues`, where `clues` = `type@region;…`) and raw results with coordinates. **Never copy anything from PRIV into the repo.** `benchmark/private/` stays in `.gitignore` only as a backstop. |
| `SIM` | iPhone 18 Pro, iOS 27.0 runtime, UDID `E950C8A0-185D-40BF-8A62-C113655C0557` |
| `SP` | Retired. The Day-1 research scratchpad was rescued into `research/day1-artifacts/` on Nov 19 (T-020). Cite only those repo paths, never the old scratchpad path. New sessions write temp files to **their own** scratchpad from their system prompt, or to `ROOT/.scratch/` (RUNBOOK §0.4). |

---

## 1. Session start protocol (every session, before any code)

1. `cd "/Users/mac/Documents/firebase buildathon"`. `CLAUDE.md` loads automatically; re-read its **Invariants**.
2. Read `docs/PROGRESS.md`: the STATE block, WIP, USER pending, the Decisions log and the latest session entry. Grep; don't read the archive.
3. **Check for a crashed session.**
   - If STATE `Now:` names a task and the session log has no matching end entry, the previous session crashed.
   - Run `git status -s`, `git diff --stat` and `git log --oneline -5`, read the last `WIP T-0xx:` commit message, and continue that task.
   - Never discard changes you did not make; ask first.
4. **Baseline** (once code exists): run `cd web && npm run check`, plus the iOS build for iOS tasks, **before** starting.
   - If it is red, fix it first, or revert to the PROGRESS `Last green` commit with the user's OK.
5. **Date check** against §3. If a checkpoint was missed, apply the next cut (§ Cut order) and log it as a decision.
6. **USER board** (§4). If any USER task is due or overdue, start your reply with a short reminder: the ID and the exact steps from the task.
7. **Pick a task** (§0.5).
8. Read only the task's **Read:** sections. Never guess SDK names.
9. **Environment**, as the task needs it:
   - `node -v` should be 26.x;
   - `cd web && npm ci` if `node_modules` is missing;
   - `$FB projects:list` for Firebase tasks;
   - `xcrun simctl list devices booted` for iOS tasks.
10. **Memory rule (8 GB).** Never run Chrome Gemini Nano and the Simulator's Foundation Models (FM) at the same time.
    - Before Nano work: `xcrun simctl shutdown all`.
    - Before FM work: the user quits Chrome, or Nano tabs are closed if T-032 relaxed the rule.
11. Write `Now: T-0xx (started HH:MM)` in the PROGRESS STATE block.

## 2. Session end protocol (also after every finished task, and before context runs low)

1. **Run the task's Verify step and the global check.**
   - Web: `cd web && npm run check`, plus `npm run test:e2e` once T-089 is green.
   - iOS: the `xcodebuild … test` command from Appendix B.
   - Do not tick a task whose verification fails.
2. **Tick the box** and append `(done Nov DD; verified: <command/result>)`.
3. **Update PROGRESS:**
   - STATE: `Now: none`, `Next: T-0ww`, `Last green commit: <sha>` (only after a green check), gate results.
   - Append a session entry using the Appendix A template.
   - Keep only the last ~15 session entries in PROGRESS; move older ones to `docs/progress-archive.md`.
4. **Decisions.** Log any decision that changes SPEC or ARCH under the next free `D-nn` (§5). Edit the affected doc in the same session.
   - **DEVLOG (D-76):** append a dated entry to `docs/DEVLOG.md` (what was built, what went wrong, what improved). Add a ledger row (`F-nn`) for **every** flaw found: by review, live run, while building, or our own mistake (Claude's included), with how it was found, its severity and the fix. Keep it public-safe: no secrets, coordinates, place names or private photos.
5. **UNVERIFIED items.** When one gets verified:
   - change the tag in `API-NOTES.md` to `[VERIFIED: ran YYYY-MM-DD, how]`;
   - delete its row from API-NOTES §10;
   - add a line to PROGRESS.
6. **Commit** (after T-018d approval).
   - Use explicit pathspecs. **Never `git add -A` or `git add .`**
   - Run `git status` first.
   - The message starts with the task ID, for example `T-062: egress gate image re-check`.
   - Never commit:
     - `.env*.local`, `ios/.appcheck-debug-token`, `Secrets.xcconfig` or any token;
     - anything from PRIV, real photos, or coordinates (except `web/public/samples/*.json` after T-018c).
   - Push to `origin` once T-026 is done.
7. **Context hygiene.** Before long builds, or when context feels heavy:
   - write the exact next step into PROGRESS WIP;
   - `git commit -m "WIP T-0xx: <exact next step>"` (this does not update `Last green`).
8. Stop the dev servers you started. Run `xcrun simctl shutdown all`.

---

## 3. Schedule and daily checkpoints (2026, times GMT+2)

| Date | Work | Checkpoint (must be true by end of day) |
|---|---|---|
| **Thu Nov 19** (Day 0 eve; SPEC §0.3 numbering) | T-020 rescue (done), T-021 repo, T-022 reconciliation and PROGRESS, T-023 scaffold start. USER Sitting A. | Artifacts rescued. Repo and PROGRESS exist. |
| **Fri Nov 20** | T-023, T-024, T-025, T-026 wiring. Spikes T-030, T-031, T-032. T-034 decision. Start the iOS SPM resolve in the background at night (T-027). USER Sitting B. | **G1 (+G1b) and G2 recorded; T-034 decision made.** |
| **Sat Nov 21** | T-027, T-036, T-037 prop/face spike, T-038 walking-skeleton deploy, T-039 pass A (if Blaze). M2: T-050–T-054, T-056, T-057, T-093. | Hosted skeleton live. Tier-0 libraries run in the app. |
| **Sun Nov 22** | T-033 (G3). M2: T-055, T-058–T-061, **T-086 vertical slice**, T-087. USER Sitting C (props and scenes, Devpost draft). | **Vertical slice green; G3 recorded.** |
| **Mon Nov 23** | M2: gate, ledger, HUD, models, pre-screen, consent, passes A/B, referee, verdict, T-088–T-091, T-097 hero pre-test. | Gate unit tests green. Adversary and referee work on a real photo. |
| **Tue Nov 24** | M2: fix, re-attack, export, leak demo, explainer, offline queue, T-092, T-094, **T-085 end-to-end audit**. | **GATE: full red→green web loop and egress audit pass.** |
| **Wed Nov 25** | M3: App Check (prod), Auth, RC, Firestore, Judge Mode, PWA, Hosting. Evening: T-121 Swift ports. USER: benchmark and gate-test photos, quota. | **Hosted URL live; Judge Mode red→green in a browser without Nano** (T-107, T-108). |
| **Thu Nov 26** | M4: iOS foundation, vault, Tier-0, gate. T-151 benchmark harness. Overnight unattended benchmark run (T-152). | iOS app builds and runs. Harness dry run passes. |
| **Fri Nov 27** | M4: FM jobs, cloud pass B, verdict. T-152 finish. T-180 script. T-173 polish storyboard screens. | iOS loop works in SIM. Benchmark run complete. |
| **Sat Nov 28** | T-153 publish benchmark. T-131 iOS screenshots. T-181, T-182 rehearsal. USER records web beats (morning), then iOS beats and voice-over (evening). | Benchmark published. All beats recorded. |
| **Sun Nov 29** | T-186 Claude rough cut (early). USER final edit, then **upload by 18:00**. M6: README, Devpost text, hygiene, clean clone. Repo made public. | **Video Public on YouTube by 18:00 (hard stop 23:00). Repo public.** |
| **Mon Nov 30** | T-188 pre-submit checks (09:00), T-189 tag (10:00), USER submits. | **Submitted by 12:00 GMT+2.** |
| Dec 1–16 | **Freeze:** no pushes to `main`, no Hosting deploys. RC changes only to keep the app available. | App up and within quota until Dec 16, 14:00 PT. |

Filming on Nov 28 and uploading on Nov 29 replaces PLAN.md's "film Nov 30", because YouTube processing can take hours. The user confirms this in T-018a; it is logged under R-19.

---

## 4. USER task board (sittings in order; status is mirrored in PROGRESS "USER pending")

**Sitting A, tonight Thu Nov 19 or Fri Nov 20 morning (about 45 min), in this order:**
1. T-002 create the Firebase project and paste the project ID.
2. T-005 `firebase login`.
3. T-006 `gh auth login`, plus T-018 decisions.
4. T-003 Blaze, budget alert and paid tier.
5. T-004 AI Logic onboarding.
6. T-013 approve xcodegen.
7. T-019 bundle ID.
8. T-007 Chrome settings, and connect the Claude-in-Chrome extension.
9. (optional) T-015 Discord questions.
10. T-008 photos.

**Sitting B, after Claude registers the apps (T-025), Fri Nov 20 (about 15 min):** T-012 web debug token, T-011 reCAPTCHA key (recommended now, due Nov 25 at the latest). Add the iOS debug token when T-027 builds.

**Sitting C, weekend Sat Nov 21 to Sun Nov 22:** T-010 props and scenes (Sun), T-014 Devpost draft, T-017 Firestore database (by Tue Nov 24).

| ID | What | Due (GMT+2) | Unblocks | Status |
|---|---|---|---|---|
| T-001 | Go-ahead on Strangers' Eyes | done Nov 19 | everything | done |
| T-002 | Create the Firebase project; send the project ID | Fri Nov 20 09:00 | T-025, all Firebase work | done Nov 20 (`strangers-eyes`) |
| T-005 | `firebase login` in your own terminal | Fri Nov 20 | T-025 | done Nov 20 |
| T-006 | `gh auth login`; tell Claude the account and repo name | Fri Nov 20 | T-026 | done Nov 20 (gh already signed in; the user asked for a new repo; default name `strangers-eyes`) |
| T-018 | Day-1 decisions (filming dates, free-tier spike consent, demo-location exposure, routine commits) | Fri Nov 20 (c: before Nov 22 shoot) | T-031, T-105, T-183 | done Nov 20 (D-59, D-60, D-66, D-67, D-68) |
| T-019 | Bundle ID | Fri Nov 20 | T-025, T-027 | done Nov 20 (`dev.strangerseyes.app`) |
| T-003 | Blaze, budget alert, paid Gemini tier (and prepayment if asked) | Fri Nov 20 | grounding (T-039, T-070), privacy claims | by Thu Nov 26 (D-70: free while building) |
| T-004 | AI Logic "Get started" → Gemini Developer API; confirm App Check is Enforced | Fri Nov 20 | T-030 | done Nov 20 |
| T-007 | Chrome on-device AI and flag; connect Claude-in-Chrome | Fri Nov 20 | T-032 | open |
| T-013 | Approve `brew install xcodegen` | Fri Nov 20 | T-027 | done Nov 20 |
| T-008 | 10 spike photos (or all 25 in one outing) | Fri Nov 20 12:00 | T-031 go/no-go | done Nov 20 (D-71, openly licensed) |
| T-015 | (optional) Discord: Simulator footage OK? MediaPipe/Tesseract OK? | Fri Nov 20 | README wording | open |
| T-012 | App Check debug tokens: web now, iOS when T-027 builds | Fri Nov 20 (web) / Sat Nov 21 (iOS) | T-030, T-033 | open |
| T-011 | reCAPTCHA Enterprise key and App Check web registration; send the site key | recommended Fri Nov 20; latest Wed Nov 25 | T-038 hosted call, T-100 | done Nov 20 |
| T-010 | Props and 3 Judge scenes plus the hero doorstep photo | Sun Nov 22 20:00 | T-097, T-105, T-182 | open |
| T-014 | Devpost "Start project" (creates a draft) | Sun Nov 22 | T-167 | open |
| T-017 | Create the Firestore database and pick its location | Tue Nov 24 | T-104 | open |
| T-009 | Remaining benchmark photos (25 total) | Wed Nov 25 20:00 | T-150 | open |
| T-155 | 10 gate-test prop photos | Wed Nov 25 20:00 | T-156 | open |
| T-111 | AI Logic hardening: per-user quota 30 RPM; optional authenticated-users mode | Wed Nov 25 | — | open |
| T-132 | (optional) TestFlight decision; **cut by default** | Wed Nov 25 | — | open |
| T-112 | Prompt API origin-trial token (only if T-109 says it is needed) | Thu Nov 26 | T-109 | conditional |
| T-193 | Install a video editor (iMovie or DaVinci Resolve), or accept the ffmpeg cut | Fri Nov 27 | T-194 | open |
| T-183 | Record the web beats | Sat Nov 28 morning | T-186 | open |
| T-184 | Record the iOS beats (Chrome quit) | Sat Nov 28 evening | T-186 | open |
| T-185 | Record the English voice-over in your own voice | Sat Nov 28 evening | T-186 | open |
| T-194 | Review Claude's rough cut; final edit ≤2:50; export 1080p | Sun Nov 29 15:00 | T-187 | open |
| T-187 | Upload to YouTube as **Public**; send the URL | Sun Nov 29 18:00 (hard stop 23:00) | T-188, T-190 | open |
| T-170 | Approve making the GitHub repo PUBLIC | Sun Nov 29 | T-188 | open |
| T-172 | Choose Devpost platforms and the primary "Best of" category | Sun Nov 29 | T-165 | open |
| T-171 | Paste `docs/DEVPOST.md` and the gallery into the draft; review | Sun Nov 29 – Mon Nov 30 | T-190 | open |
| T-190 | **Submit on Devpost** | Mon Nov 30 12:00 | done | open |
| T-192 | Keep the project and billing alive | Wed Dec 16 | judging | open |
| T-016 | Apple Intelligence on this Mac | done Nov 19 | — | done |

Not needed: the Google Account Quota (it expires around Dec 1, before judging), and Java 21 (`$FB13` handles emulators).

---

## 5. Decisions: canonical IDs and the rules every task must respect

- **SPEC D-01..D-39** (SPEC §0.4) are the canonical product decisions.
- **ARCH AD-01..AD-33** (ARCH §2) are architecture decisions. Where an AD duplicates a D, the D is canonical. ADs with no D alias keep their AD-ID and are never renumbered into D-numbers.
- **New decisions take the next free D-number (D-40, D-41, …; SPEC §0.4 already uses D-01..D-39)** in the PROGRESS Decisions log. That includes the outcomes of the T-022 reconciliation items R-01..R-32 (R-32 is listed in PROGRESS).
- An earlier draft of this file used `RN-xx` IDs. They are retired. Use this alias table if you meet one in old notes:

| Old ID | Rule in one line | Canonical source |
|---|---|---|
| RN-01 | `GoogleAIBackend` (Gemini Developer API) on the Blaze **paid** tier; `VertexAIBackend` no longer exists | D-07, AD-01, API-NOTES §1.1 |
| RN-02 | Init order `initializeApp` → `initializeAppCheck` → `getAuth` → `getAI`; await `ensureAuth()` before cloud calls (no UID → `CLOUD_AUTH`, D-110) | API-NOTES §1.2, ARCH §15.1, AC-291 |
| RN-03 | S0/S1 fail closed. Check `LanguageModel` exists and `availability` is `'available'` **before** every call, otherwise RULES_ONLY; `inferenceSource` afterwards is only an alarm | D-03, AD-05, AC-021/022 |
| RN-04 | No temperature. Use a pinned model, versioned prompts, `thinkingLevel` MEDIUM, a session cache, and k=3 | D-01, AD-02 |
| RN-05 | Pass A is grounded and display-only; pass B is independent and runs in parallel; only pass B feeds code | D-02, AD-03, SR-11 |
| RN-06 | Device prompts carry their instructions in the user turn; one plain JSON Schema serves `responseConstraint` and `responseJsonSchema`; in hybrid mode, model/tools/config go under `inCloudParams` | D-04, API-NOTES §1.3/§1.7 |
| RN-07 | Every part literal needs `type`; device images JPEG/PNG only; base64 without a prefix | API-NOTES §1.8 |
| RN-08 | Adversary `gemini-3.8-flash` (A/B against `gemini-4-hydrogen`); thinking MEDIUM (MINIMAL returns 400); model names live in RC | D-08 |
| RN-09 | iOS firebase-ios-sdk **exactly 12.19.3**; Path B is 13.2.0; deployment target iOS 27.0 | D-05, AD-06 |
| RN-10 | In SIM, `@Generable` works; tools and FM image input fail; Vision faces need the CPU device; FM takes 18–30 s per call | D-06, AD-07, API-NOTES §3.10 |
| RN-11 | iOS `HybridModel` falls back on **any** error, so it only ever gets public S2 text | API-NOTES §3.5, SPEC §14.6 |
| RN-12 | iOS metadata: re-encode the pixels after baking orientation in; never `CGImageDestinationCopyImageSource` | API-NOTES §4.2 |
| RN-13 | The gate fails an image on APP1/APP13 or GPS; APP0 and APP2 are fine | D-19 |
| RN-14 | Grounding: Search Suggestions shown unmodified in a shadow root at the same width, plus sources; capture metadata from the stream chunks | SR-10, API-NOTES §1.13 |
| RN-15 | App Check is auto-enforced for AI Logic; debug tokens are secret | API-NOTES §2.2 |
| RN-16 | Firestore holds only Leak Atlas clue-type counters | D-11 (see R-02) |
| RN-17 | Tesseract rejects `ImageBitmap` and needs `{blocks:true}` as the 3rd argument; MediaPipe full-range on CPU; self-host assets | AD-13, API-NOTES §5 |
| RN-18 | Benchmark uses pass B only, on public places only | D-22 |
| RN-19 | 18+ notice; paid tier allows EEA/UK/CH users | D-07, SR-09 |
| RN-20 | Film Nov 28; upload by Nov 29 | R-19 (needs T-018a) |
| RN-21 | Judge samples and cached pass B are static files; pass A is never cached | D-12, AD-09 |
| RN-22 | `e = max(d, radius)`; the closest band of up to 3 hypotheses; city/country thresholds are placeholders | D-10 |
| RN-23 | Firebase CLI through `npx`, pinned | RUNBOOK §1.1 |

## 6. Acceptance criteria

AC IDs are SPEC's `AC-xxx` only. **SPEC §18** holds the index and traceability table; read the exact AC text there, not here. The ranges:

| Range | Feature | Range | Feature |
|---|---|---|---|
| AC-001–019 | Capability states (§5) | AC-210–219 | Cloud Ledger (SCR-13) |
| AC-020–039 | Routing and policy (§6) | AC-220–229 | Router HUD (SCR-14) |
| AC-040–059 | Egress Gate (§7) | AC-230–234 | What the cloud saw (SCR-15) |
| AC-060–069 | Shell, accessibility, performance (§8) | AC-235–239 | Explainer (SCR-16) |
| AC-070–074 | Welcome, capability panel (SCR-01/02) | AC-240–249 | Judge Mode (SCR-17) |
| AC-075–079 | Home (SCR-03) | AC-250–259 | Offline and queue (SCR-18) |
| AC-080–099 | Vault (SCR-04) | AC-260–269 | Export and share card (SCR-12) |
| AC-100–109 | Import (SCR-05) | AC-270–274 | Burn vault (SCR-19) |
| AC-110–129 | Pre-screen and mask editor (SCR-06) | AC-275–279 | Settings and About (SCR-20) |
| AC-130–139 | Consent sheet (SCR-07) | AC-280–289 | Leak Atlas (SCR-21) |
| AC-140–159 | Adversary (SCR-08) | AC-290–299 | System states, Firebase init, RC (SCR-22, §16) |
| AC-160–179 | Referee and verdict (SCR-09, §10) | AC-300–319 | Safety (§12) |
| AC-180–189 | Gate toast (SCR-10) | AC-320–349 | iOS (§14) |
| AC-190–209 | Fix and re-attack (SCR-11) | AC-350–359 | Benchmark (§15) |
| | | AC-360–369 | Submission-facing checks |

---

## M0: Setup and accounts (Nov 19–20)

### USER tasks

- [x] T-001 [USER] Go-ahead on Strangers' Eyes. (done Nov 19: the user said "go with strangers eyes". Blindfill stays the Day-1 fallback.)

- [x] T-002 [USER] Create the Firebase project. Due: Fri Nov 20 09:00 · Deps: none (done Nov 20: Claude created `strangers-eyes` in the console at the user's request; Analytics OFF. Verify via `$FB projects:list` after T-005)
  - Read: RUNBOOK §1.2
  - Do: console.firebase.google.com → **Create a project** → name `strangers-eyes` → **Google Analytics OFF** → Create. Send Claude the **project ID**.
  - Verify: after T-005, Claude runs `$FB projects:list` and sees the project.

- [ ] T-003 [USER] Blaze billing, budget alert and the paid Gemini tier. Due: Fri Nov 20 · Deps: T-002 · **Re-planned Nov 20 (D-70):** build entirely on the free tier. The user activates Blaze + the paid Gemini tier only for filming/judging, by **Thu Nov 26** (before the Nov 28 shoot).
  - Read: RUNBOOK §1.3; API-NOTES §1.15
  - Do:
    1. Upgrade the project to **Blaze**.
    2. Cloud Billing → Budgets & alerts → a $25/month budget with email alerts at 50/90/100%. Budgets alert; they don't cap spending.
    3. AI Studio → Projects → import this project and check whether a Gemini **prepayment** is required. If so, pay the smallest amount. The $300 trial credits don't cover the Gemini Developer API.
  - Why:
    - grounding is "Not available" on the free tier;
    - free-tier prompts may be used for training and read by human reviewers;
    - EEA/UK/CH users may only be served by paid services.
  - If you decline: Claude logs a decision, cuts pass A (cut step 6) and states the free-tier terms in the app and README.
  - Verify: T-039 returns `groundingMetadata`.

- [x] T-004 [USER] AI Logic onboarding and the App Check enforcement check. Due: Fri Nov 20 · Deps: T-002 (done Nov 20 by Claude in the console at the user's request: Gemini Developer API enabled (free) and the Gemini API Additional Terms accepted; optional AI monitoring left OFF; App Check APIs tab shows Firebase AI Logic **Basic – Enforced**. The T-030 call test is still to come.)
  - Read: RUNBOOK §1.4, §1.11 step 1
  - Do:
    1. Console → AI Services → AI Logic → **Get started** → **Gemini Developer API**.
    2. Security → App Check → **APIs** tab: "Firebase AI Logic" must read **Enforced**. If not: Set up → Baseline protection Enforced → Replay protection Disabled.
    3. Do **not** create or paste any Gemini API key.
  - Verify: T-030's call succeeds with the debug token and fails without it.

- [x] T-005 [USER] Log the Firebase CLI in. Due: Fri Nov 20 · Deps: T-002 (done Nov 20 in the Terminal panel; `projects:list` shows strangers-eyes)
  - Read: RUNBOOK §1.1
  - Do: in your own terminal: `cd "/Users/mac/Documents/firebase buildathon" && npx -y firebase-tools@15.37.0 login`. If it offers to install agent skills or AI tools, answer **No**.
  - Verify: `npx -y firebase-tools@15.37.0 projects:list` lists the project.

- [x] T-006 [USER] Authorise the GitHub CLI and approve repo creation. Due: Fri Nov 20 (done Nov 20: gh was already signed in with `repo` scope; the user said "push on a new repo")
  - Read: RUNBOOK §1.15
  - Do: `gh auth login` (GitHub.com → HTTPS → browser). Tell Claude the account or org, the repo name (default `strangers-eyes`), and "OK to create it **private**".
  - Verify: `gh auth status`.

- [ ] T-007 [USER] Enable Chrome's on-device AI. Due: Fri Nov 20
  - Read: RUNBOOK §1.13, §3.1
  - Do:
    1. `chrome://settings/ai` → **On-device AI** ON. The exact label is `[UNVERIFIED]`.
    2. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → Relaunch.
    3. Leave `#gemma4-for-built-in-ai` **OFF** (T-040).
    4. Keep at least 22 GB of disk free.
    5. If the Claude-in-Chrome extension is available, connect it to this (Nano-enabled) profile so Claude can run the availability checks in T-032. Otherwise Claude will give you snippets to paste.
  - Verify: `chrome://on-device-internals` shows the model; then T-032.

- [x] T-008 [USER] Spike photo set of 10 photos (better: shoot all 25 benchmark photos now). Due: Fri Nov 20 12:00 (done Nov 20 by Claude at the user's request (D-71): 10 openly licensed Wikimedia Commons photos of ordinary public places in 10 countries on 5 continents (CC0 ×5, CC BY 4.0 ×1, CC BY-SA ×4), 3 of them doorstep-style public entrances. Saved as `PRIV/spike/spike-01..10.jpg` with `truth.csv` (Commons camera coordinates, <1 m) and `SOURCES.md`. An independent verifier passed all 10 (no identifiable people, no readable plates, no homes or schools, licences checked). Caveat for T-031: Commons images may be in Gemini's training data, so G1 can read optimistic. Note it in the gate record.)
  - Read: RUNBOOK §1.14, §5.2
  - Rules:
    - your own photos, **no people** (including reflections);
    - public places only;
    - **never** your home, your workplace or a real school;
    - no readable car plates.
  - Do:
    1. Shoot street corners with signs, transit stops, shop fronts and public-building entrances in your city.
    2. Make **2–3 of the 10** doorstep-style entrances of public buildings, with a printed **fictional** name card (for example "LUCAS") on a bag. They test refusal on home-like scenes.
    3. Keep camera **Location ON**; the app reads GPS locally as ground truth and strips it before any upload. Or write `truth.csv`.
    4. Export as JPEG and put the files in `PRIV/spike/`. If you shoot all 25, put the rest in `PRIV/bench/`, using the T-009 mix.
  - Verify: Claude runs `ls PRIV/spike | wc -l` and gets ≥10.

- [ ] T-009 [USER] Benchmark set: 25 photos with true locations. Due: Wed Nov 25 20:00 · Deps: T-008
  - Read: SPEC §15.1; RUNBOOK §5.2
  - Same rules as T-008. The 10 spike photos count toward the 25. **No residential streets.**
  - Mix (SPEC §15.1):
    - 5 transit stops or signs;
    - 5 street corners with street signs;
    - 5 shop or café fronts;
    - 5 public or commercial interiors with a window view;
    - 5 generic architecture or greenery with no text (the hard cases).
  - Put them in `PRIV/bench/` with `truth.csv`.
  - Verify: Claude counts 25 photos and 25 truth rows.

- [~] T-010 [USER] Props and staged scenes (Judge Mode and the hero demo). **Superseded for Judge Mode by D-153 (Nov 21): CC0 Ljubljana photos with drawn props replace the staged shoot. A hero photo for the video is still optional.** Due: Sun Nov 22 20:00 · Deps: T-018c
  - **Prop rule from T-037/T-057 (D-81, D-83):** the name tag has plain dark letters on a light tag, with no border hugging the letters. Letters must be **at least about 3% of the photo's height**, e.g. ≥ 48 px caps on the 2048 px master; at 32 px Tier-0 OCR missed the tag once in 6 placements.
  - Read: RUNBOOK §1.14, §6.1; SPEC SCR-17
  - Props:
    - a fictional **"LUCAS"** name tag on a backpack (a vault item, which should be caught on the device);
    - a lanyard card with a **fictional logo** (for example a green or blue plus sign; never a red cross on white, which is a protected emblem) and the generic printed words **"HOSPITAL STAFF"** (SPEC D-39). No vault text and no real logo, so the attacker infers "hospital staff" and the referee rates it "likely". The demo line is "Linked to your WORKPLACE".
    - a printed fictional house-number card;
    - a street sign and a transit stop visible behind.
  - Shoot, with **no people** in any frame:
    - **3 Judge scenes** at public places (SPEC SCR-17: a doorstep-style public entrance, a marketplace item in a non-residential interior with a window view, an outdoor café with a fictional-brand cup and a transit sign);
    - the **hero doorstep photo**.
  - Keep real shop and transit logos out of frame where you can.
  - Shoot **several km away from your home and your work** (T-018c).
  - Write `PRIV/scenes/truth.csv`:
    - for each scene, a public building used as the fake **home** pin;
    - another public place used as the fake **work** pin.
  - Fallback if you can't shoot: Claude composites a canvas-drawn tag and lanyard onto people-free spike photos (T-037).
  - Verify: Claude views the photos and confirms there are no people, no real home or school, and no readable real logos.

- [x] T-011 [USER] reCAPTCHA Enterprise key and App Check web registration. Due: recommended Fri Nov 20 (Sitting B); latest Wed Nov 25 · Deps: T-002, T-025 (done Nov 20 by Claude at the user's request: reCAPTCHA Enterprise / Fraud Defense API enabled (free tier 10k/month, no billing account); score-based web key `strangers-eyes-web` for localhost, strangers-eyes.web.app and strangers-eyes.firebaseapp.com; site key in `web/src/firebase/config.ts`; web app **Registered** in App Check (TTL 1 h))
  - Read: RUNBOOK §1.7a
  - Do:
    1. Cloud console → Security → **reCAPTCHA** ("Fraud Defense") → enable the API → **Create key**, type **Web**.
    2. Domains: `<PROJECT_ID>.web.app` and `<PROJECT_ID>.firebaseapp.com`. **Never add localhost.** Leave "Use checkbox challenge" **unselected**.
    3. Firebase → Security → App Check → **Apps** → the web app → **reCAPTCHA Enterprise** → paste the site key → Save.
  - Send Claude the **site key** (it is public and gets committed).
  - Not needed for the localhost spikes, which use the debug token.
  - Verify: the app shows as registered; T-038 and T-100 hosted calls pass App Check.

- [ ] T-012 [USER] Create and register App Check debug tokens. Due: Fri Nov 20 (web); Sat Nov 21 (iOS) · Deps: T-004, T-025 (iOS: T-027) · **Web part done Nov 20** (the user registered their own token and put it in `web/.env.development.local`; verified by T-030 PASS, format checked without reading the value). Earlier note: Claude generated and registered debug token `local-dev-mac` in the console. The **USER pastes its value** into `web/.env.development.local` (template already created, gitignored, mode 600). Claude may not read the secret (blocked by the permission classifier). iOS part: after T-027.
  - Read: RUNBOOK §1.7b (web), §1.7c (iOS)
  - **Web:**
    1. App Check → Apps → web app ⋮ → **Manage debug tokens** → **Add debug token** → **Generate** → name it `mac-dev` → Save.
    2. **Don't paste the token into chat.** In your terminal at the repo root run: `printf 'VITE_APPCHECK_DEBUG_TOKEN=%s\n' "$(pbpaste)" > web/.env.development.local`. That file is git-ignored and loaded only in dev.
    3. Claude's headless test Chrome reuses this fixed token.
  - **iOS:** same dialog on the iOS app → name it `sim-dev` → then `pbpaste > ios/.appcheck-debug-token` (git-ignored). Claude launches with `SIMCTL_CHILD_AppCheckDebugToken`.
  - Tokens are secrets: never commit or film them.
  - Verify: the T-030 (web) and T-033 (iOS) cloud calls succeed.

- [x] T-013 [USER] Approve tool installs. Due: Fri Nov 20 (done Nov 20: the user installed xcodegen; `xcodegen --version` = 2.48.0)
  - Read: RUNBOOK §2.7, §1.16
  - Approve Claude running `brew install xcodegen`, which generates the Xcode project from `ios/project.yml`.
    - Alternative: create the project yourself in Xcode (iOS App, SwiftUI, `StrangersEyes`, the T-019 bundle ID, target iOS 27.0, saved in `ios/`) and tell Claude.
  - Optional (you run it; it changes Claude Code's config and loads next session): `claude plugin marketplace add firebase/agent-skills` then `claude plugin install firebase@firebase`.

- [ ] T-014 [USER] Create the Devpost project draft. Due: Sun Nov 22
  - Read: RUNBOOK §7.5
  - Do: on the hackathon page click **"Start project"**. It creates an editable, deletable draft. Tell Claude (T-167).

- [ ] T-015 [USER] (optional) Discord questions (#hackathon-help, tag #BuildHybridAI). Due: Fri Nov 20
  - Q1: Is iOS **Simulator** footage acceptable in the demo video?
  - Q2: Are local, non-generative CV/OCR libraries (MediaPipe face detection, Tesseract OCR) fine alongside Firebase AI Logic?
  - Both are `[UNVERIFIED]` and assumed to be yes. The README framing is pre-written: "deterministic CV/OCR privacy filters; all generative inference goes through Firebase AI Logic". Report answers to Claude.

- [x] T-016 [USER] Apple Intelligence enabled on this Mac. (Verified Nov 19 by research: on the macOS 26.6.2 host, Simulator FM reports `.available` with variant "AFM 3 Core".)

- [ ] T-017 [USER] Create the Firestore database. Due: Tue Nov 24 · Deps: T-002, T-003
  - Read: RUNBOOK §1.9
  - Do: Firebase console → Databases & Storage → Firestore → **Create database**:
    - Standard edition;
    - ID `(default)`;
    - a location near you, for example `eur3` or `europe-west1` (permanent);
    - **production mode**.
  - Tell Claude the location.
  - The CLI alternative is `[UNVERIFIED]` (U-18).
  - Verify: `$FB firestore:databases:list` shows it.

- [x] T-018 [USER] Day-1 decisions. Answer in chat; Claude logs each as a D-entry. Due: Fri Nov 20 (item c before the Nov 22 shoot) (done Nov 20: a = film Nov 28 / upload Nov 29 (D-66); b = free tier OK for the spike photos (D-67); c = demo location accepted (D-68); d = local commits (D-59) and pushes (D-60))
  - **a. Filming dates.** Record web beats Sat Nov 28 morning, iOS beats and voice-over Sat Nov 28 evening, upload Public by Sun Nov 29 18:00. This replaces PLAN.md's Nov 30. Yes/no?
  - **b. Spike photos on the free tier.** If the paid tier isn't active when T-031 is ready, may Claude send the 10 EXIF-stripped, people-free spike photos under free-tier terms? Google may use them to improve its products, and human reviewers may read them. "No" means T-031 waits for T-003.
  - **c. Demo-location exposure.** The Judge Mode samples, their cached pass-B JSON (lat/lng hypotheses, pins rounded to about 100 m) and the video will publicly reveal the city or neighbourhood where the scenes were shot. Do you accept this, if you shoot several km from home and work?
  - **d. Routine git.** May Claude make local commits as it works, and push to the **private** repo after T-026? Going public still needs T-170.
  - Verify: four D-entries in PROGRESS.

- [x] T-019 [USER] Decide the iOS bundle ID. Due: Fri Nov 20 · Deps: none (done Nov 20: `dev.strangerseyes.app`, D-69)
  - Default proposal: `dev.strangerseyes.app` (proposed in RUNBOOK §1.6 and ARCH §19.1; RUNBOOK §2.7–§2.8 use the `BUNDLE_ID` placeholder). Claude records it in PROGRESS Key values. It is bound into the Firebase iOS app registration, so decide before T-025.

### CLAUDE tasks

- [x] T-020 [CLAUDE] Rescue the scratchpad research artifacts. **Do this first, tonight.** Due: Thu Nov 19 · Deps: none (done Nov 19; verified: 77 files in `research/day1-artifacts/`, which also covers the ARCH §23 list `arch/` ← arch2 and `firestore-tests/` ← rulestest3; index in its README.md. The 8 MB iOS build logs were replaced by result-line summaries. Vendor docs are in `research/_vendor-docs/`, which T-021 must git-ignore.)
  - Read: API-NOTES header table
  - Record: on Nov 19 these were copied from the Day-1 session scratchpad (no longer referenced; it may be gone) into `research/day1-artifacts/` (committed), skipping `node_modules`, `dist`, compiled binaries, Chrome profiles and logs. Cite only the repo paths; `research/day1-artifacts/README.md` is the index.

    | Came from (old scratchpad, historical) | Now at `research/day1-artifacts/` | Notes |
    |---|---|---|
    | `rulestest3/{firestore.rules,test.mjs,firebase.json,run.log}` | `firestore-tests/` | **Current** rules: 18 clue types, no `outcomes` block, 20/20 (`run.log`). T-104 ports these. |
    | `arch2/{src/*.ts,tsconfig*.json,gen.mjs,remoteconfig.template.json}`, `archcheck/json/advB.v1.schema.json` | `arch/` | **Current** `[compiled]` ARCH code (with `tripwire-install`, `capabilities`, `fuzzy`), fuzzy vectors 25/25, the generated RC template, the pass-B schema |
    | `rulestest2/{firestore.rules,test.mjs,firebase.json,run.log}` | `firestore-tests-v2/` | History only: 21/21, all 18 clue types **plus** an `outcomes` block, which R-02 dropped. The current rules are `firestore-tests/` ← `rulestest3/` (20/20, no outcomes; see `research/day1-artifacts/README.md`). |
    | `rulestest/{firestore.rules,test.mjs,package.json,firebase.json}` | `firestore-tests-v1/` | History only (4-type placeholder whitelist); `package.json` holds the test dependencies |
    | `archcheck/{src/types.ts,src/tripwire.ts,src/models.ts,src/geo.ts,json/advB.v1.schema.json,json/remoteconfig.template.json,tsconfig.json}` | `arch-ref/` | Earlier `[compiled]` snapshot, history only (prefer `arch/`). The current compiled ARCH code is `arch/` ← `arch2/` (`arch/src/*.ts`, `arch/remoteconfig.template.json`, `arch/advB.v1.schema.json`, `arch/gen.mjs`). |
    | `app/src/lib/{exif,faces,geo,masks,ocr,vault}.ts`, `app/src/selftest.ts`, `app/src/{main.tsx,App.tsx}`, `app/scripts/copy-assets.mjs`, `app/vite.config.ts`, `app/package.json`, `app/tsconfig*.json` | `web-ref/` | |
    | `app/public/models/blaze_face_{full,short}_range.tflite` | `web-ref/models/` | Apache-2.0, fine to commit |
    | `tscheck/{test.ts,test-untyped.ts,package.json}` | `web-ref/tscheck/` | |
    | `spm12/{Package.swift,Package.resolved,Sources/Probe12/Probe.swift}` and the same from `spm13/` | `ios-ref/spm12/`, `ios-ref/spm13/` | Build logs are kept as `build*.summary.txt` result lines |
    | `probe/*.swift` and `probe/*_out*.txt` | `ios-ref/probes/` | |
    | `harness/*.mjs` | `harness/` | Only the `.mjs` files; **not** `profile/`, `*.log` or `*.txt` |

  - Third-party docs were copied into `research/_vendor-docs/` (**git-ignored**; local reference only): `docs/*`, `compliance/*.md.txt`, `devpost/*.html`, `pi_report.txt`, `FM.clean.swift`, `Vision.clean.swift`, `fbai_pkg/package/dist/ai-public.d.ts`.
  - Files: `research/day1-artifacts/README.md`, an index saying where each item came from and what it proves.
  - Done when: everything above exists (met Nov 19).
  - Verify: `find research/day1-artifacts -type f | wc -l` gives ≥30; `shasum` matches for 3 sampled files.

- [x] T-021 [CLAUDE] Repo bootstrap. Due: Thu Nov 19 / Fri Nov 20 · Deps: T-020 (commit after T-018d) (done Nov 19; verified: `git status` clean after commits e567fd0, 01ac7d9, 3e07f4b; `git check-ignore -v` matches the secret and private paths; `head -3 LICENSE` shows Apache License 2.0)
  - Read: RUNBOOK §2.2
  - Do:
    1. `git init -b main`.
    2. Write `.gitignore` **before** any `git add`. It must cover:
       - `node_modules/`, `web/dist/`, `web/public/vendor/`, `.firebase/`, `*-debug.log`, `.scratch/`, `.DS_Store`;
       - `.env`, `.env.*` with `!.env.example` and `!.env.e2e` (both committed, no secrets; ARCH §3.1/§3.2), `*.local`, `.env*.local`;
       - `benchmark/private/`, `research/_vendor-docs/`, `*.secret*`;
       - `ios/build/`, `ios/.spm/`, `ios/.appcheck-debug-token`, `ios/Config/Secrets.xcconfig`, `**/xcuserdata/`, `*.xcuserstate`, `DerivedData/`.
    3. `gh api /licenses/apache-2.0 --jq .body > LICENSE`. This is the unmodified text GitHub's detector expects.
    4. Write `NOTICE` ("Strangers' Eyes contributors"; no personal data) and a stub `README.md` (name, one-liner, "work in progress", license line).
    5. Root `package.json`:
       - devDependencies `firebase-tools@15.37.0`, `firebase@13.4.0`, `@firebase/rules-unit-testing@6.0.0`;
       - script `test:rules`: `cd tests/rules && npx -y firebase-tools@13.35.1 emulators:exec --only firestore --project demo-strangers-eyes "node atlas.rules.test.mjs"`.
    6. `mkdir -p /Users/mac/StrangersEyes-private/{spike,bench,scenes,gate-test,test,raw,video}` (the PRIV list in §0.6 and RUNBOOK §2.2).
    7. With T-018d approval: commit `T-021: repo bootstrap` using explicit pathspecs.
  - Verify:
    - `git status` is clean;
    - `git check-ignore -v web/.env.development.local ios/.appcheck-debug-token benchmark/private/x` prints the matching rules;
    - `head -3 LICENSE` shows "Apache License / Version 2.0, January 2004".

- [x] T-022 [CLAUDE] Create PROGRESS.md and reconcile the docs (time-box about 90 min). Due: Fri Nov 20 12:00 · Deps: T-021 (done Nov 19; verified: `grep -c "^- R-" docs/PROGRESS.md` = 33; the stale-token grep shows only alias tables; no scratchpad paths remain; decisions D-40..D-53 logged)
  - **Partly done Nov 19:**
    - Step 1: PROGRESS.md exists.
    - Step 2: the Decisions log *points* to SPEC §0.4 instead of copying D-01..D-39, to avoid duplicates drifting.
    - Step 4: CLAUDE.md rewritten.
    - Step 5: PLAN banner added.
    - **Remaining:** step 3 (R-01..R-31, plus R-32 in PROGRESS) and step 6 (SP paths).
  - Read: SPEC §0.4; ARCH §2; this file §0.1, §5; the R-items below and the doc sections they name.
  - Do:
    1. **Create `docs/PROGRESS.md`** from Appendix A if it is missing.
    2. **Decisions log:** point to SPEC §0.4 for D-01..D-39 and to ARCH §2 for the AD-xx entries. Don't copy them (done Nov 19).
    3. **Reconcile.** For each R-item below, check whether the final docs already agree.
       - If they do, write "R-xx: consistent".
       - If not, apply the recommended choice, edit the named docs, and log the next free D-number.
       - If an edit is large, log the decision now and fix the doc when the related task starts (note it in PROGRESS).
    4. **CLAUDE.md** (show the user the diff in the reply):
       - replace its start/end protocols with "Follow docs/TASKS.md §1 and §2 exactly";
       - add the doc-map line "Never Read a whole doc; grep for the § or ID";
       - add the pass-A rule (never parsed, cached, persisted or fed to code);
       - add "local files only, no URL input";
       - add PRIV and the secrets file locations;
       - add "never `git add -A`";
       - add "AC IDs are SPEC's AC-xxx".
    5. **PLAN.md:** add a top banner: "Superseded where it conflicts with docs/. See docs/TASKS.md §0.1."
    6. **Scratchpad paths:** replace `SP` paths in API-NOTES and RUNBOOK with `research/day1-artifacts/` paths.
  - Reconciliation items (recommended choice → docs to fix):
    - **R-01 Remote Config keys.** ARCH §13 is the only key list; SPEC §16 keeps behaviour only, using ARCH names; RUNBOOK §4.4 and T-102 point to `remoteconfig.template.json`. Values:
      - `daily_adversary_cap` = 20 per installation per **local** day, where an A+B pair counts as 1 run;
      - `fuzzy_threshold` 0.8;
      - `prompt_versions` values are full IDs (`"advA.v1"`);
      - nested `routing_policy` shape (ARCH §7);
      - add `data_tier`, `max_fix_rounds` (3) and `judge_autoplay_default` (true);
      - per-job timeouts in RC `timeouts_ms` (values from ARCH §9.2) instead of `request_timeout_ms`;
      - **no** `clue_types` (D-13) and **no** `temperature`.
    - **R-02 Leak Atlas = D-11 strictly.** Pass-B clue-type counters only, written after pass B. No band, precision or fix outcomes. Drop the outcome part of ARCH AD-08 and the §14 `outcomes` block; drop the RUNBOOK §4.3 `outcomes` block; T-080 writes nothing to the Atlas.
    - **R-03 Verdict = SPEC §10 verbatim.** ARCH §12.3 and the `Verdict` types follow: levels RED/AMBER/LOW/PARTIAL; GREEN only for "Risk reduced"; caught lines teal; city band grey (INFO); country/none bands and unmatched text items go into one grey `copy.verdict.notLinked` line; `copy.verdict.neverLearns` always shown.
    - **R-04 Vault kinds = SPEC §17.2.** ARCH §6 `VaultKind`, `enums.v1.json` and ARCH §12.1 follow. SPEC §17.3/§17.4 are the only source for display names and kind compatibility.
    - **R-05 Pins in referee prompts as kind + label.** No coordinates; unlabeled `home_pin` items are skipped (SPEC SCR-09). Fix ARCH §10.3/§12.1 ("*_pin never in prompts"). Otherwise the Judge vault's `work_pin` "City General Hospital" could never match.
    - **R-06 Pre-mask default.** Standard (D-16); Strict is a toggle with RC `strict_mode_default=false`.
    - **R-07 Working image.** Longest side ≤2048 px (D-20); fix ARCH §11's "master ≤3072" and the §18 memory budget.
    - **R-08 Paths.** ARCH §3 is canonical, plus:
      - rules tests in `tests/rules/` with their own `firebase.json` (port 8181), because the root `firebase.json` has keys CLI 13.35.1 may reject;
      - assets in `web/public/vendor/mediapipe-1.2.3/wasm/` and `web/public/vendor/tesseract-7.0.0/{worker.min.js,core/,lang/}` (update `copy-assets.mjs`, the API-NOTES §5.1/§5.2 snippets and the RUNBOOK §4.6 curl paths);
      - DEV-only code in `web/src/dev/{spikes,selftest,slice,bench}/`, reached only through an `import.meta.env.DEV` dynamic import. Only `web/src/dev/spikes/**` is allowlisted in `check-boundaries.mjs` (AI call-site rows); bench, slice and selftest go through the gate (ARCH §4.2).
    - **R-09 Hash routes.** Settled by SPEC D-27, and SPEC §8.1 is the route table: `#/`, `#/vault`, `#/check` (`#/check/<sessionId>` P1), `#/judge`, `#/settings`, `#/about`, `#/atlas` (P1), and DEV-only `#/dev/spike`, `#/dev/bench`, `#/dev/selftest` (other `#/dev/*` allowed). The Ledger is a rail/sheet, not a route. SCR-01 and SCR-02 are not routes. `?judge=1` goes SCR-01 → SCR-02 → `#/judge` (AC-071 unchanged). ARCH §3.4 mirrors SPEC §8.1.
    - **R-10 Validators.** Hand-written in `ai/parse.ts` (AD-12): no zod, no react-markdown (ARCH `ui/markdown.ts`).
    - **R-11 Availability caching.** The gate never caches availability (AC-007); the UI chip may cache it for 30 s. Fix ARCH §9.5.
    - **R-12 Pass A storage.** Memory only, for this session. Rewrite SPEC AC-148 to "never persisted". Recent checks (SCR-03) store no pass-A text.
    - **R-13 Judge Mode.** Target ≤90 s per sample, goal 60 s. One daily-cap counter; when the cap, kill switch or quota blocks, Judge Mode falls back to the CACHED pass B (SPEC SCR-17). No separate judge counter.
    - **R-14 Judge-mode gate.**
      - For S4, the sample allowlist **replaces** the vault-text image and prompt checks (SPEC §7.1).
      - S3 in Judge Mode is checked against `JUDGE_VAULT`.
      - The tripwire scans the **active** vault (JUDGE_VAULT in Judge Mode, the real vault otherwise).
      - The real vault is never loaded in Judge Mode.
      - Fix ARCH §8.2 steps 2–3 and §8.3.
    - **R-15 Matchers = SPEC SCR-06 step 3 and §10.3.** OCR confusable folding (0/O, 1/I/l, 5/S, 8/B), joining spaced letters, the distinctive-token and two-token rules with a generic-word list, and synonym classes. Thresholds per SPEC. Fix ARCH §8.4/§12.1 so AC-042, AC-110 and AC-165 can pass.
    - **R-16 Face and OCR thresholds.** Tier-0 auto-masks faces at `minDetectionConfidence` 0.3, the same as the gate re-check (SPEC §7.1). The consent dry run re-runs OCR at the outgoing 1536 px resolution. So the gate never blocks something Tier-0 could have masked first.
    - **R-17 BREACH = SPEC AC-022.** The session's S0/S1 calls become RULES_ONLY and `copy.gate.tripwire` shows. Align ARCH §8.2/§17.
    - **R-18 Cut order.** A single cut order (this file, § Cut order); SPEC §0.3 points here.
    - **R-19 Schedule.** SPEC §0.3 rows follow §3 here (film Nov 28, upload Nov 29, submit Nov 30 12:00). RUNBOOK §1.15/§7.1 make the repo public Nov 29. Needs T-018a.
    - **R-20 Benchmark metrics**, defined once in SPEC §15.3:
      - G1, M1, M2 and M8 use the closest hypothesis **centre** distance `d` as the headline (D-34). `e = max(d, r)` is reported alongside. M1/M2 report both majority-of-3 and any-of-3;
      - the "after" condition is the deterministic rules fix (Nano fix as a secondary row);
      - clue recall = same type in the same or an adjacent 3×3 cell (no IoU boxes needed);
      - ARCH §21 and RUNBOOK §5.4 point to SPEC §15.3.
    - **R-21 Private data in PRIV, outside the repo.** Fix SPEC §15.1/§15.4, ARCH §21 and RUNBOOK §1.14/§5. Replace RUNBOOK §2.1's `git add -A` with pathspecs.
    - **R-22 Secrets.** `web/.env.development.local` (not `.env.local`). iOS uses `ios/.appcheck-debug-token` plus `SIMCTL_CHILD_AppCheckDebugToken`. Align ARCH §3.1/§15.3/§19.4.
    - **R-23 Per-user quota.** AI Logic per-user quota is **30 RPM**. Align RUNBOOK §1.11 and ARCH §15.2/§17.
    - **R-24 Explainer input.** `explain()` takes either a pre-screen clue `{type, region}` (never device-read text) or a pass-B clue. An S2 vault-string hit **reclassifies to S0** (D-15) instead of blocking. Fix ARCH §8.2 step 3 and §9.1.
    - **R-25 Route type.** `Route` includes `QUEUED`. Map ARCH `GateBlockReason` to SPEC `copy.gate.*`; SPEC §11 is the copy authority (ARCH §6, §8.7).
    - **R-26 Prompt files.** Files and IDs per ARCH §3/§10. One word limit for `explain.v1`: ≤45 words (ARCH §10.11); update SPEC SCR-16.
    - **R-27 Strings file.** `shared/strings/en.json` holds every SPEC §11 copy ID, used by web and iOS. Add it to ARCH §3.
    - **R-28 Tripwire install.** The tripwire is a side-effect module imported **first** in `main.tsx` (`import './ai/tripwire-install'`). ES imports are hoisted, so a statement in the body is too late. The vault scanner is registered later through a setter. Fix ARCH §3.1/§8.5.
    - **R-29 Decision IDs.** Use the §5 scheme; retire `RN-xx`.
    - **R-30 PLAN.md.** Add the banner (step 5).
    - **R-31 iOS S4.** ARCH S4 `ios` = `HYBRID_MODEL` (SPEC §14.2 sample scenes) instead of `NONE`.
  - Done when: PROGRESS exists, and every R-item has a PROGRESS line ("consistent" or "→ D-nn; edited: …").
  - Verify:
    - `grep -c "^- R-" docs/PROGRESS.md` gives ≥31;
    - `grep -nE "model_adversary|bands_m|mask_pad_ratio|AC-[0-9]{2}\b" docs/*.md` shows only intentional hits.

- [x] T-023 [CLAUDE] Web scaffold. Due: Fri Nov 20 · Deps: T-021 (done Nov 19; verified: `npm ci && npm run build && npm run check` exit 0 (boundaries 45/45 + repo ok, Vitest 56/56, check-dist ok); `#/dev/selftest` ALL PASS in Chrome 156; an independent review's 18 findings were fixed (D-54..D-58))
  - Read: ARCH §1, §3.1, §16; API-NOTES §5.5, §5.9, §11; RUNBOOK §2.2–2.4
  - Do:
    1. `npx -y create-vite@9.3.4 web --template react-ts --no-immediate --no-interactive` (verified Nov 19).
    2. Pin exact versions:
       - `vite@8.3.8`, `react`/`react-dom@19.3.1`, `typescript@~7.0.2`, `@vitejs/plugin-react@6.3.0`;
       - `firebase@13.4.0`, `@mediapipe/tasks-vision@1.2.3`, `tesseract.js@7.0.0`, `exifr@7.1.3`, `idb-keyval@6.3.0`.
       - Dev: `vite-plugin-pwa@2.0.0`, `@tesseract.js-data/eng@1.0.0`, `tailwindcss@4.3.5` + `@tailwindcss/vite@4.3.5` (verified with Vite 8 in T-023), `fake-indexeddb`, and `vitest` (pick the version whose peer range covers vite 8 via `npm view vitest version peerDependencies`; pin it exactly).
       - **No zod, no react-markdown** (R-10).
    3. Port `research/day1-artifacts/web-ref/` into ARCH §3 paths:
       - `tier0/exif.ts`, `tier0/faces.ts`, `tier0/ocr.ts`, `tier0/decode.ts`;
       - `core/geo.ts` (from `research/day1-artifacts/arch/src/geo.ts`), `core/boxes.ts`, `core/mask.ts`;
       - `vault/crypto.ts`, `vault/vaultStore.ts`.
    4. Adapt `web/scripts/copy-assets.mjs` to write `web/public/vendor/mediapipe-1.2.3/wasm/` and `web/public/vendor/tesseract-7.0.0/{worker.min.js,core/(3 *-lstm.wasm.js),lang/eng.traineddata.gz}` (R-08). Run it as `predev` and `prebuild`.
    5. Models into `web/public/models/blaze_face_{full,short}_range.tflite` (committed; ARCH §3.1 names, no `.v1`; copy from `research/day1-artifacts/web-ref/models/`).
    6. tsconfig:
       - `"types": ["vite/client","vite-plugin-pwa/react"]`;
       - `resolveJsonModule`;
       - include `../shared`.
    7. vite config:
       - aliases `@prompts` → `../shared/prompts`, `@vectors` → `../shared/testvectors`, `@strings` → `../shared/strings`, `@root` → `..` (for `remoteconfig.template.json`, ARCH §13.4/§16.1), plus the matching tsconfig `paths` entry;
       - `server.fs.allow: ['..']`.
    8. `scripts/check-boundaries.mjs` at the root, per ARCH §4.2. Exit 1 when a forbidden symbol appears outside its allowed file. `web/src/dev/spikes/**` is allowlisted for the AI call-site rows only. `web/src/dev/{bench,slice,selftest}/**` are not: their AI calls go through the gate (ARCH §4.2). All of `web/src/dev/**` is reached only through an `import.meta.env.DEV` dynamic import. Include a planted-violation fixture test.
    9. web `package.json` scripts:
       - `typecheck` = `tsc -b`;
       - `check` = `tsc -b && node ../scripts/check-boundaries.mjs && vitest run` (T-090 adds check-prompts and check-images);
       - `build` = `tsc -b && vite build`.
    10. `web/.env.example` documenting `VITE_APPCHECK_DEBUG_TOKEN=` and `VITE_FAKE_AI=`.
    11. Port the selftest to `web/src/dev/selftest/`.
  - Done when: the dev server runs, and the selftest passes EXIF, faces (no-face image), OCR and the vault round trip.
  - Verify: `cd web && npm ci && npm run build && npm run check`; `npm run dev` → `#/dev/selftest`.

- [x] T-024 [CLAUDE] Versioned prompts, schemas and fixtures. Due: Fri Nov 20 · Deps: T-021 (done Nov 20; verified: `npm --prefix web run check` passes (check-prompts: 28 files, 8 prompts, all drafts), with 7 files / 92+ tests covering loading, sha256, render, schemas, fixtures, enums vs types.ts/SPEC §17.5/Firestore whitelist, and `satisfies` against firebase/ai types (U-45 tsc half); `#/dev/selftest` prompts step: 0 manifest mismatches in Chrome. An independent review found 16 issues, all fixed and re-verified (D-61..D-65).)
  - Read: ARCH §3 (`shared/`), §10 (all); API-NOTES §6.7–6.9
  - Files (ARCH §3):
    - `shared/prompts/README.md` (versioning rules);
    - `manifest.json` (with the sha256 of every file);
    - `enums.v1.json` (vault kinds per R-04, including `self_name`; `GENERIC_WORDS`, `SYNONYM_CLASSES`, `ARTEFACT_TERMS` and `WORD_FOLDS` per R-15, identical to SPEC §17.5);
    - `audit-rules.v1.md`;
    - `advA.v1.{system,user}.md`, `advB.v1.{system,user}.md`;
    - `advB.v1.schema.json` (start from `research/day1-artifacts/arch/advB.v1.schema.json`);
    - `nanoPre.v1.user.md` and `nanoPre.v1.schema.json`;
    - `nanoVaultText.v1.user.md`, `nanoRef.v1.user.md`, `nanoFix.v1.user.md`;
    - `fmPre.v1.user.md`;
    - `explain.v1.rules.md` and `explain.v1.user.md` (both user-turn segments; there is no system file, ARCH §10.11);
    - `explain-fallback.v1.json` (stub; filled in T-087);
    - `fixtures/` (the ARCH §10.2 list);
    - `web/src/ai/prompts.ts`: loads with `import.meta.glob('@prompts/*', {query:'?raw'})`; `render()` returns static/dynamic `PromptSegment[]` and throws on a missing or unused variable;
    - `web/src/ai/schemas.ts`: static schemas plus the runtime builders `vaultTextSchema`, `refereeSchema`, `fixSchema`.
  - Do: copy texts verbatim from ARCH §10. ARCH wins over API-NOTES §6.9.
  - Verify: Vitest checks that:
    - every prompt loads;
    - every manifest version exists and its sha256 matches;
    - the schemas parse and pass a hand-written structural check;
    - `ADV_B_SCHEMA` typechecks as `responseJsonSchema` (U-45 tsc half).

- [x] T-025 [CLAUDE] Wire the Firebase project. Due: Fri Nov 20 · Deps: T-002, T-005, T-019, T-023 (done Nov 20; verified: `apps:list` shows strangers-eyes-web `1:320898500558:web:a71a1817cde2f1775f0d9f` and strangers-eyes-ios `1:320898500558:ios:a073e67f8281ab135f0d9f`; `plutil -lint` OK on GoogleService-Info.plist with BUNDLE_ID dev.strangerseyes.app and analytics/ads off; `npm run build` passes)
  - Read: RUNBOOK §1.5, §1.6, §4.1–4.2; ARCH §15.4
  - Do (never run interactive `firebase init`):
    1. Write `.firebaserc` by hand: `{ "projects": { "default": "<PROJECT_ID>" } }`.
    2. `$FB apps:create WEB strangers-eyes-web --project <ID>`, then `$FB apps:sdkconfig WEB <APP_ID>` → `web/src/firebase/config.ts`. Committed; the web config is not secret.
    3. iOS: `$FB apps:create IOS strangers-eyes-ios --bundle-id <T-019 ID> --project <ID>`, then `$FB apps:sdkconfig IOS <APP_ID> --out ios/StrangersEyes/Resources/GoogleService-Info.plist`. Flags verified Nov 20 (`apps:create --help`: `-b, --bundle-id`; `apps:sdkconfig --help`: `-o, --out`).
    4. Root `firebase.json` per ARCH §15.4, **without** an `emulators` block (R-08).
    5. Record the app IDs in PROGRESS Key values.
  - Verify: `$FB apps:list` shows both apps; `npm run build` passes.

- [x] T-026 [CLAUDE] Create the GitHub repo (PRIVATE) and push. Due: Fri Nov 20 · Deps: T-006, T-018d, T-021 (done Nov 20; verified: `gh repo view --json name,visibility,licenseInfo` shows strangers-eyes, PRIVATE, apache-2.0; `origin/main` = local HEAD f4368e2)
  - Read: RUNBOOK §1.15
  - Do: `gh repo create <name> --private --source . --remote origin --push --description "See your photo the way a stalker's AI would, before you post it."` It stays **private** until T-170.
  - Verify: `gh repo view --json name,visibility,licenseInfo` shows PRIVATE and `apache-2.0`. Detection may lag; re-check at T-170.

- [x] T-027 [CLAUDE] iOS project skeleton. Due: Sat Nov 21 (start the SPM resolve in the background on Fri night) · Deps: T-013, T-019, T-021, T-025 (done Nov 20: `xcodegen generate` + `xcodebuild … ARCHS=arm64 build` → **BUILD SUCCEEDED** on the iPhone 18 Pro simulator (iOS 27.0, Xcode 27.2). First build 72 s including the SPM resolve of firebase-ios-sdk 12.19.3 (seeded with the Day-1 probe's `Package.resolved`; 1.2 GB in `ios/.spm`), incremental 12 s. `xcodebuild test`: 2/2 smoke tests pass (prompts/manifest.json and strings/en.json bundled as folder resources; `Strings.t` reads en.json). The generated `StrangersEyes.xcodeproj` is committed, so the repo opens in Xcode without xcodegen. `remoteconfig.template.json` and `shared/testvectors` are NOT in project.yml yet: XcodeGen's `optional: true` still adds a dangling reference that fails the build. T-038 and the first testvectors task add them back.)
  - Read: RUNBOOK §2.7–2.8; ARCH §19.2, §19.4; API-NOTES §3.1–3.3
  - Files: `ios/project.yml`, `ios/StrangersEyes/App/StrangersEyesApp.swift`, `ios/StrangersEyes/Resources/GoogleService-Info.plist`.
  - Do:
    - XcodeGen target: iOS **27.0**, SwiftUI, the T-019 bundle ID.
    - SPM `https://github.com/firebase/firebase-ios-sdk` **`exactVersion: 12.19.3`**. Products `FirebaseAILogic`, `FirebaseAppCheck`, `FirebaseAuth`, `FirebaseRemoteConfig`. **No Firestore.**
    - Info.plist keys: `NSLocationWhenInUseUsageDescription`, `NSPhotoLibraryAddUsageDescription`.
    - In `App.init`, under `#if DEBUG`, call `AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())` **before** `FirebaseApp.configure()`.
    - Bundle `../shared/prompts` and `../shared/strings` as folder resources and `../remoteconfig.template.json` as a file resource (the T-038 stub until T-102); the test target bundles `../shared/testvectors` (ARCH §19.2, RUNBOOK §2.7) (R-27).
    - The debug token comes from `SIMCTL_CHILD_AppCheckDebugToken="$(cat ios/.appcheck-debug-token)"` (R-22).
    - Run the first build with `run_in_background`.
  - Verify: `cd ios && xcodegen generate && xcodebuild … ARCHS=arm64 build` (Appendix B) ends in BUILD SUCCEEDED. Record the build time.

---

## M1: Day-1 go/no-go spikes and the fallback decision (Nov 20–22)

- Spike code lives in `web/src/dev/spikes/` (DEV only, allowlisted) and `ios/StrangersEyes/Dev/`.
- Raw outputs with coordinates go to `PRIV/raw/`. Only aggregates go in the repo: no coordinates, place names or images.

- [x] T-030 [CLAUDE] Spike A: Firebase plumbing. Due: Fri Nov 20 · Deps: T-004, T-012 (web), T-025 (done Nov 20, PASS: `#/dev/spike` with the debug token → App Check token obtained (exchangeDebugToken), anonymous UID present, `gemini-3.8-flash` and `gemini-4-hydrogen` both returned "pong" with `inferenceSource: in_cloud` (38.8 s / 14.9 s, free tier). Request header names: `authorization: Firebase …`, `x-firebase-appcheck` (937 chars), `x-firebase-appid`. With `?appcheck-debug=off` and the App Check cache cleared: reCAPTCHA error on localhost, and both calls **401 'Firebase App Check token is invalid'**, so enforcement is proven.)
  - Read: API-NOTES §1.1–1.2, §2.2–2.3; ARCH §15.1; RUNBOOK §1.7b, §8.1
  - Files: `web/src/firebase/init.ts` (ARCH §15.1 order), `web/src/dev/spikes/PlumbingSpike.tsx`.
  - Do:
    1. Initialise in this order: `initializeApp` → debug flag (DEV) → `initializeAppCheck(ReCaptchaEnterpriseProvider, isTokenAutoRefreshEnabled:true)` → `getAuth` + `signInAnonymously` → `getAI(GoogleAIBackend)`.
    2. Until T-011, use a placeholder site key. Whether debug mode works with a placeholder is `[UNVERIFIED]`; if it errors, note it and wait for T-011.
    3. Make an `ONLY_IN_CLOUD` text call to `gemini-3.8-flash`, then to `gemini-4-hydrogen`.
  - PASS when:
    - both calls return text with `inferenceSource === 'in_cloud'`;
    - requests carry the `X-Firebase-AppCheck` and `Authorization: Firebase …` headers;
    - an anonymous UID exists;
    - with the debug token removed, the call fails, proving enforcement.
  - FAIL is not a pivot. Debug the init order, the token registration and the 15-minute enforcement delay.
  - Verify: network evidence (DevTools or the rescued CDP harness) recorded in PROGRESS.

- [x] T-031 [CLAUDE] Spike B: adversary pass-B go/no-go and fix test (G1, G1b). **Pivot gate.** Due: Fri Nov 20 · Deps: T-008, T-024, T-030, and (T-003 or T-018b = yes) · **Photos ready (T-008, D-71):** `PRIV/spike/` holds 10 photos with `truth.csv`. Some still carry EXIF GPS and author names, so the harness must send only `reencodeClean` output and assert it clean. Record the memorisation caveat next to the G1 result. **Ticked Nov 23 (D-159):** G1 PASS and G1b PASS on gemini-3.5-flash-lite (free tier): 10 photos × 2 runs, 0 refusals, 5/10 located ≤ 5 km (s02 street 0.24 km, s03 0.36 km, s04 0.95 km, s08 3.4 km, s09 0.20 km), 5–11 s per call; fix moved 3/4 (s02, s03, s08), s09 stayed street. `benchmark/spike/day1-adversary.md`; advB.v1 released.
  - **Release (D-62):** once this run is recorded in PROGRESS, set `"released": true` for advB.v1 in `shared/prompts/manifest.json` and run `node scripts/check-prompts.mjs`. From then on those files are frozen; any change needs a `*.v2.*` file.
  - Read: SPEC §0.3 (G1); API-NOTES §1.7, §1.10, §1.11, §6.1–6.5, §6.8–6.9; RUNBOOK §5.1
  - Files:
    - `web/src/dev/spikes/AdversarySpike.tsx`;
    - a DEV-only Vite `server.fs.allow` entry for `PRIV` behind `VITE_SPIKE=1`, so the page can load `PRIV/spike/*` via `/@fs/` and run unattended in headless Chrome with the fixed debug token (rescued CDP harness);
    - raw output → `PRIV/raw/spike-<date>.json`;
    - aggregates → `benchmark/spike/day1-adversary.md`.
  - Do, per photo:
    1. Read the truth locally from EXIF or `truth.csv`.
    2. `reencodeClean` to the working image (≤2048) and the 1536 px cloud JPEG. Assert there is no APP1/APP13.
    3. Mask any face (minDetectionConfidence 0.3). On doorstep photos, mask the fictional name card, as the product would.
    4. Run pass B (advB.v1, `responseJsonSchema`, `thinkingLevel` MEDIUM) **3×** on `gemini-3.8-flash` and **1×** on `gemini-4-hydrogen`.
    5. Record the status, `d` (closest hypothesis centre to truth), `radius_km`, the level and the latency.
    6. **G1b:** for each photo located within 5 km, apply the deterministic fix (mask every removable pass-B clue box, 15% padding) and rerun pass B once. Record whether the closest band (by `e`, D-10) moved outward.
  - Optional probes (all `[UNVERIFIED]`):
    - a cast `seed` (U-11);
    - text-before-image vs image-first (U-14);
    - whether thinking tokens count toward `maxOutputTokens`, via `usageMetadata` (U-12);
    - whether `ADV_B_SCHEMA` is accepted without a 400 (U-45).
  - Definitions:
    - A photo is **refused** if ≥2 of its 3 runs are declined or blocked.
    - A photo is **located** if ≥2 of 3 runs have `d ≤ 5 km`.
  - **G1 PASS:** ≤2/10 refused AND ≥4/10 located. Report the doorstep subset's refusal rate separately.
  - **D-73 (Nov 20):** gemini-3.8-flash was unavailable (503 timeouts), so the run uses **gemini-4-hydrogen 3×** as the primary adversary (G1, G1b, U-12) with no flash A/B. The schema dropped its object-array `maxItems` (U-45).
  - **D-74 (Nov 20):** free tier only (20 requests/day/model), so the run spans Nov 20–21 (22 if needed). The 3rd run is skipped when runs 1–2 already decide the classification (`--adaptive`). The resume command is in PROGRESS WIP.
  - **G1b (informational):** the fix moves ≥1 band on ≥50% of located photos, and the median `radius_km` on located photos is ≤1. If it fails, log a decision before Nov 22: text-rich demo scenes and/or a D-10 revision (for example `d` instead of `max(d,r)` at street/neighbourhood level).
  - Pick the adversary model: most located photos, then lowest latency. That becomes the RC default.
  - About 50 calls plus about 10 fix reruns.
  - Verify: the aggregate file is committed; raw JSON is in PRIV; the numbers are in the PROGRESS gate table.

- [ ] T-032 [CLAUDE] Spike C: Chrome Nano through the hybrid SDK on this 8 GB M1 (G2). Due: Fri Nov 20 · Deps: T-007, T-023
  - **Release (D-62):** once this run is recorded in PROGRESS, set `"released": true` for nanoPre.v1 (and any other Nano prompt it runs) in `shared/prompts/manifest.json` and run `node scripts/check-prompts.mjs`. From then on those files are frozen; any change needs a `*.v2.*` file.
  - Read: API-NOTES §1.3–1.7, §1.16; ARCH §9.3; RUNBOOK §3.1
  - Files: `web/src/dev/spikes/NanoSpike.tsx`.
  - Do, in the **user's Chrome 157**, with the Simulator shut down. Claude's Browser pane and headless Chrome are assumed to have no Nano `[UNVERIFIED]`.
    0. Run `await LanguageModel.availability({expectedInputs:[{type:'text',languages:['en']},{type:'image'}],expectedOutputs:[{type:'text',languages:['en']}]})`, through Claude-in-Chrome's javascript tool if connected, otherwise the user pastes it. After one Nano call, idle 5 min and record Chrome's memory and `chrome://on-device-internals`.
       - If the model unloads when idle, **ask the user** whether to relax invariant 10 to "no concurrent Nano and FM inference; close Nano tabs before FM". On yes, log a D-entry and edit CLAUDE.md.
    1. Record the availability value and what on-device-internals shows.
    2. A button calls `initializeDeviceModel(progress)` **inside its click handler**.
    3. Run nanoPre.v1 via `deviceJsonModel` (`ONLY_ON_DEVICE`) on five 768 px JPEGs, with `responseConstraint` = the plain-JSON PRESCREEN schema.
    4. Run nanoRef.v1 (text only, runtime-enum schema) 5×.
    5. Probes (`[UNVERIFIED]`): a `Schema` instance vs a plain object (U-04); whether stream chunks are deltas (U-05); a cast `samplingMode` (U-06).
  - **PASS when:**
    - availability is `'available'`;
    - ≥4/5 image runs return valid JSON with `inferenceSource === 'on_device'`;
    - ≥4/5 text runs are valid;
    - median latency is ≤15 s;
    - no tab crash or OOM occurs.
  - **Partial** (text passes, image fails): Nano does S0; the S1 pre-screen is rules-only (state a′).
  - **FAIL:** S0/S1 on the web run deterministic RULES_ONLY; S2/S4 stay `PREFER_ON_DEVICE` with an honest cloud fallback; iOS carries the on-device footage.
  - Verify: the results table is in PROGRESS; the related API-NOTES items are flipped.

- [ ] T-033 [CLAUDE] Spike D: iOS FirebaseAILogic 12.19.3 in SIM (G3). Due: Sun Nov 22 · Deps: T-012 (iOS), T-025, T-027
  - **Release (D-62):** once this run is recorded in PROGRESS, set `"released": true` for fmPre.v1 in `shared/prompts/manifest.json` and run `node scripts/check-prompts.mjs`. From then on those files are frozen; any change needs a `*.v2.*` file.
  - Read: API-NOTES §3.4–3.5, §3.9–3.10; RUNBOOK §3.5
  - Files: `ios/StrangersEyes/Dev/Spike.swift` (debug-only screen).
  - Do, with Chrome quit:
    1. On-device-only session `ai.generativeModelSession(model: FirebaseAI.SystemLanguageModel.default, instructions:)` with a `@Generable` struct.
    2. A `HybridModel(primary: systemModel, secondary: ai.geminiModel(name: "gemini-3.8-flash"))` text prompt; read `rawResponse.modelVersion`.
    3. A cloud-only session using the debug token.
    4. (Nice to have) force a fallback with an oversized public prompt.
    5. Log latencies (18–30 s expected).
  - Tools and image attachments are already known to **FAIL** in SIM. Don't re-spike them.
  - **PASS:** steps 1–3 succeed, and step 2 reports `"apple-foundation-models-system-language-model"`.
  - FAIL: switch to Path B (13.2.0, Apple `LanguageModelSession`, fallback in app code). Log a D-entry and update the README plan.
  - Verify: screenshot and console log in PROGRESS; `xcrun simctl shutdown all`.

- [x] T-034 [CLAUDE] Day-1 decision gate. Due: Fri Nov 20 evening (Sat Nov 21 10:00 at the latest) · Deps: T-030, T-031, T-032 (G3 appended when T-033 is done) **Ticked Nov 23 (D-158, D-159):** attacker = gemini-3.5-flash-lite (flash overloaded on the free tier), advB 45 s, advA 60 s, cloud TIMEOUT never retried; RC published.
  - Read: PROGRESS gate table; SPEC §0.3
  - Do: record the results and decision in the PROGRESS Decisions log, using this matrix:

    | Result | Action |
    |---|---|
    | G1 PASS | Continue Strangers' Eyes as planned |
    | G1 borderline (≤2 refused and 3/10 located, or exactly 3 refused) | **Ask the user:** continue with text-rich scenes and honest benchmark framing, or pivot |
    | G1 FAIL (≥4 refused, or ≤2/10 located) | Stop and record. **Ask the user before pivoting** (recommended pivot: Blindfill, T-035) |
    | G1b fails | Log a D-entry before Nov 22: text-rich scenes and/or a D-10 revision |
    | G2 FAIL | Web S0/S1 rules-only; S2/S4 fall back honestly; iOS films the on-device steps; pitch "on-device when available, private either way" |
    | G3 HybridModel FAIL | Path B (13.2.0) with an app-code fallback, disclosed in the README |
    | G1 FAIL and G2 FAIL | Strongly recommend the pivot; ask the user |

  - **Default if the user hasn't answered by Sat Nov 21 10:00:**
    - borderline → continue with text-rich scenes;
    - FAIL → build only pivot-neutral infrastructure (T-051, T-054, T-060, T-062, T-063, T-064, T-093) and remind the user at the top of every reply.
    - **Never pivot without a yes.**
  - Verify: the PROGRESS entry exists, and the user has answered where the matrix says "ask".

- [ ] T-035 [CLAUDE] (only if the user approves a pivot) Re-plan for Blindfill. Due: Sat Nov 21 · Deps: T-034
  - Read: `research/winner-spec.md` § runner_up_summary
  - Do:
    1. Write `docs/BLINDFILL.md`.
    2. Mark the Strangers'-specific M2 tasks CUT and add Blindfill tasks in the free M2 IDs.
    3. **Keep:** Egress Gate, Ledger, Router HUD, RC routing, App Check, Auth, Hosting, Tier-0 OCR, vault crypto, the iOS shell.
    4. Update SPEC, ARCH and README.
  - Verify: the user confirms the new plan.

- [ ] T-036 [CLAUDE] Fold the spike evidence into the docs. Due: Sat Nov 21 · Deps: T-034
  - Read: API-NOTES §10
  - Do: flip each item the spikes settled from `[UNVERIFIED]` to verified, with date and evidence. Record the chosen adversary model and iOS path in PROGRESS Key values.
  - Verify: `grep -c UNVERIFIED docs/API-NOTES.md` has gone down; the changes are listed in PROGRESS.

- [ ] T-037 [CLAUDE] Prop OCR and face spike. Due: Sat Nov 21 · Deps: T-023
  - Read: API-NOTES §5.1–5.2; ARCH §5.5
  - Do:
    1. Make a test image: the user's 2 phone shots of a printed "LUCAS" tag, or by default a canvas-composited tag and lanyard on a people-free spike photo (kept in `PRIV/test/`).
    2. Check that Tesseract reads "LUCAS" both at working size and at the 1536 px cloud size. This is needed for the leak demo (AC-041).
    3. Run MediaPipe full-range at 0.3 on a local, **uncommitted** face or mannequin image in `PRIV/test/`. Record recall for full-range vs short-range and whether 2×2 tiling is needed (U-31).
  - Verify: the results table is in PROGRESS. If the tag isn't read, change the prop design (bigger, higher contrast) before T-010.
  - **Steps 1–2 done Nov 20** (results table in PROGRESS "T-037 prop OCR"; D-81): the default canvas composite (a white "LUCAS" tag, 4° tilt, on 3 people-free spike photos at 2 positions × 5 cap heights, built in memory from code, nothing saved) is read by Tesseract's default global-Otsu binarisation in only **14/30** placements, and a bigger tag does **not** help (96–160 px caps are read worse than 20–36 px). Leptonica adaptive Otsu reads 26/30 and the union with a Sauvola pass reads 30/30, so the fix is in OCR (T-057), not the prop. Prop rule for T-010: plain dark letters on a light tag, no border hugging the letters. **Step 3 (faces, U-31) is open:** `PRIV/test/` has no face or mannequin image yet; it needs a builder-owned photo of a consenting adult, a mannequin, or a synthetic face from the user.

- [ ] T-038 [CLAUDE] Walking-skeleton deploy. Due: Sat Nov 21 · Deps: T-023, T-025 (T-011 for the hosted AI call) · AC: AC-366
  - **Partly done Nov 20** (the user approved the public deploy; D-82; results in RUNBOOK §4.6):
    - Step 1 ran as `--only hosting` → https://strangers-eyes.web.app. Auth was already deployed by T-030, and Remote Config waits for the template (T-060).
    - Step 2 done: headers and MIME recorded (U-20 moot, U-21 headers verified). A missing file returned 200 `text/html`, so the SPA rewrite was removed (missing files now 404).
    - Step 3 partial: `LanguageModel` is present on the hosted origin without a token; it still needs checking in the user's Chrome (T-007).
    - Step 4 waits for T-011.
    - Step 5 waits for Tier-0 being wired into Check (T-056/T-057). The estimate is in RUNBOOK §4.6.
    - Also checked: the import on the hosted origin works with zero network requests, and the layout works at 375 px.
    - iOS resource line **done Nov 21 (T-060, D-85):** `- path: ../remoteconfig.template.json` with `buildPhase: resources` is in `ios/project.yml`. After `xcodegen generate` (4 pbxproj lines) the build gives **BUILD SUCCEEDED**, and the file sits byte-identical at the `.app` root. `xcodebuild test` was not run because no simulator was booted, so the bundled-template XCTest is still open (T-102 or the next iOS task).
  - **iOS (from T-027):** once `remoteconfig.template.json` exists, add it back to `ios/project.yml` as a file resource of the app target (`- path: ../remoteconfig.template.json` with `buildPhase: resources`), run `cd ios && xcodegen generate` and rebuild.
  - Read: RUNBOOK §4.2, §4.6, §3.4; API-NOTES §2.6; ARCH §15.4
  - Do:
    1. Run `$FB deploy --only hosting,auth,remoteconfig` with the scaffold and a stub `remoteconfig.template.json`. This is the first test of U-17.
    2. `curl -sI` a `.wasm`, a `.tflite`, a `.gz`, `/sw.js` and `/` on `https://<PROJECT_ID>.web.app`. Record Content-Type, Content-Encoding and Cache-Control (U-20, U-21).
    3. In the user's Chrome, check `'LanguageModel' in self` and `availability()` on the hosted origin (U-10). If it is missing, trigger T-109/T-112 early.
    4. If T-011 is done, make one `ONLY_IN_CLOUD` call under reCAPTCHA Enterprise.
    5. Measure a cold load to "Tier-0 ready" under DevTools "Fast 4G" throttling.
  - From now on, redeploy at every milestone checkpoint, so T-107 is routine.
  - Verify: the results are in the RUNBOOK §4.6 results table and in PROGRESS.

- [ ] T-039 [CLAUDE] Spike B2: grounded pass A. Due: Sat Nov 21 · Deps: T-003, T-031 · **Deferred (D-70):** runs only after the user activates the paid tier (T-003, by Nov 26). On the free tier, grounding is unavailable and pass A stays off (`data_tier = free`).
  - **Release (D-62):** once this run is recorded in PROGRESS, set `"released": true` for advA.v1 in `shared/prompts/manifest.json` and run `node scripts/check-prompts.mjs`. From then on those files are frozen; any change needs a `*.v2.*` file.
  - Read: API-NOTES §1.13; ARCH §10.5; SPEC SCR-08
  - Do: run advA.v1 (`ONLY_IN_CLOUD` + `googleSearch`, streamed) on 5 spike photos. Capture `groundingMetadata` **per chunk**. Render `renderedContent` in a shadow root. **Record only the status, latency and search-query count, never the text** (grounding terms).
  - Verify: grounding metadata is present on the paid tier; the counts are in PROGRESS.

- [ ] T-040 [USER then CLAUDE] (optional) "Gemini Nano 4" experiment. Due: Sun Nov 22 (only after T-032 PASS; mark CUT if not run by Tue Nov 24)
  - Read: RUNBOOK §3.3 (and §3.2 for the memory check)
  - Do:
    1. The user enables `chrome://flags/#gemma4-for-built-in-ai` and relaunches.
    2. Watch `chrome://on-device-internals`.
    3. Re-run the T-032 steps 1–4 checks.
    4. If it fails, is slow, or memory pressure goes red: set the flag to **Default**, relaunch, and confirm v3Nano works again.
  - If it isn't used, the README says "Gemini Nano via Chrome built-in AI (v3Nano)".
  - Verify: the outcome is in PROGRESS.

---

## M2: Web core loop (Nov 21–24). GATE: full red→green loop by Tue Nov 24

All file paths follow ARCH §3. If a path here differs from ARCH §3, fix both in the same commit.

- [x] T-050 [CLAUDE] App shell, design tokens and layout. Due: Sat Nov 21 · Deps: T-023 · AC: AC-060, AC-061, AC-062, AC-063, AC-065 (done Nov 20; verified: `npm run check` (154 tests) and the build are green; Browser-pane screenshots at 375 and 1440 px in light and dark; no console errors; Ledger sheet modal and focus behaviour checked; independent review applied)
  - Read: SPEC §8; ARCH §3.1 (`ui/`)
  - Files: `web/src/App.tsx` (hash routes, R-09), `web/src/index.css` (tokens, light and dark), `web/src/ui/components/{Badge,Sheet,Button}.tsx`, `web/src/ui/screens/Home.tsx`.
  - Do: the SPEC §8.2 layout:
    - header with the capability chip, connectivity chip, Ledger counters and Settings;
    - a Ledger rail at ≥1024 px and a bottom sheet below that;
    - the HUD at the bottom left;
    - the check stepper.
  - Verify: `npm run check`; Browser-pane screenshots at 375 and 1440 px, light and dark; no console errors.

- [x] T-051 [CLAUDE] Domain types and fixtures. Due: Sat Nov 21 · Deps: T-024 (done Nov 20, audit with independent verification (wf_6f443127-476): `web/src/core/types.ts` is byte-identical to ARCH §6 (lines 576-876) and complete against SPEC §17, R-03, R-04, R-25; all 12 ARCH §10.2 fixtures exist and parse; no change needed. `tsc -b` and check green.)
  - Read: ARCH §6; SPEC §17
  - Files: `web/src/core/types.ts` (from `research/day1-artifacts/arch/src/types.ts`, adjusted for R-03 verdict levels and R-04 vault kinds; `Route` already includes `QUEUED` (R-25)), `shared/prompts/fixtures/*.json` (the ARCH §10.2 list).
  - Verify: `tsc -b`; the fixtures parse as JSON.

- [x] T-052 [CLAUDE] Distance bands. Due: Sat Nov 21 · Deps: T-051 · AC: AC-160 (bands part), AC-352 (done Nov 20 (wf_1b4a803c-24f builder + skeptic, fixes re-verified by wf_192cfaaa-008): geo.ts adds `bandThresholdsOrDefault` (RC validation; street/neighbourhood/district locked, D-77), `bandWords`/`distanceWords` via `ui.band.*` (SPEC §10.1 words verbatim), and pinBand skips non-finite e (fixed an under-report). `shared/testvectors/bands.json` (first shared vectors) drives geo.test.ts: Berlin→Paris 877,465 m ±1, band edges, radius effect, NaN → none, the formatter never prints a measured distance (400 random distances). iOS test target bundles shared/testvectors. check: 438 tests green.)
  - **iOS (from T-027):** this task creates the first file in `shared/testvectors/`, so add the folder to the `StrangersEyesTests` target in `ios/project.yml` (`- path: ../shared/testvectors`, `type: folder`, `buildPhase: resources`), then `xcodegen generate`.
  - Read: SPEC §10.1; ARCH §12.2; API-NOTES §5.6
  - Files: `web/src/core/geo.ts`, `geo.test.ts`, `shared/testvectors/bands.json`.
  - Do:
    - haversine with R = 6,371,008.8 m;
    - `bandFor` with thresholds from RC defaults;
    - `e = max(d, r)` (D-10);
    - closest of up to 3 hypotheses;
    - a formatter that returns SPEC band words only, **never metres**.
  - Verify: tests for:
    - Berlin→Paris = 877,465 m ±1;
    - band edges;
    - the radius effect;
    - NaN → `none`;
    - the formatter never outputs a measured distance (D-77: only SPEC §10.1's fixed words, which name 250 m / 1 km / 5 km).

- [x] T-053 [CLAUDE] Import and EXIF stripping. Due: Sat Nov 21 · Deps: T-023, T-051 · AC: AC-100, AC-101, AC-103 (P1: AC-102) (done Nov 20. Built and reviewed by wf_1ad9d726-1ee; fix rounds 2–4 wf_8b0f6516-78d, wf_0697d92c-600, wf_a187abcf-c96; rounds 5–6 by hand, verified by wf_0660c067-fab and wf_6a8e7fe5-09a; D-78.
  - **Code:**
    - `tier0/sniff.ts`: magic bytes; dimensions from the header before any decode; animation; capped walks; `exifTiff`.
    - `tier0/importPhoto.ts`: size → sniff → EXIF TIFF only → GPS warning → decode → ≤2048 master, JPEG q 0.9 → assertCleanJpeg → sha256.
    - `tier0/gpsWarning.ts` (P1 AC-102).
    - `ui/importTransfer.ts`, `ui/checkState.ts` and `ui/components/ImportDropzone.tsx`: file, drag and paste; a web address → noUrl; no URL input (R8). Wired into `Check.tsx`.
  - **Verify:**
    - Unit tests on JPEG byte fixtures: APP1 detected, APP0+APP2 clean, an EXIF thumbnail's SOF never read as the size. AC-102: 200 m → street.
    - In Chrome 156 the selftest import step passes AC-101 (Orientation=6 upright, no APP1/APP13, `exifr.gps` undefined, sha256), 35 MB → tooLarge, text → unsupported. All 10 PRIV spike photos import clean (APP0+APP2, no GPS, ≤2048), and GPS is found on exactly the 6 that carry it.
    - AC-100's "starts a session" clause moves to T-068 and T-089.
    - check: 657 tests, 106 planted violations.)
  - Read: SPEC SCR-05, D-20; ARCH §11; API-NOTES §5.3
  - Files: `web/src/tier0/decode.ts`, `web/src/tier0/exif.ts`, `web/src/ui/components/ImportDropzone.tsx`, tests.
  - Do:
    - File, drag and paste only. **No URL input anywhere** (`copy.import.noUrl`).
    - HEIC: catch the `createImageBitmap` error and show `copy.import.heic`.
    - Limits: 30 MB and 40 MP.
    - Working image: longest side ≤2048, JPEG q 0.9, with sha256.
    - Port `jpegAppSegments` and `findMetadata`.
    - **Every box** later (faces, OCR, Gemini, masks) is computed on this oriented image.
    - P1: the GPS-found warning, i.e. the band from the EXIF point to each pin, computed in code (S0).
  - Verify: unit tests on JPEG byte fixtures (APP1 detected; APP0+APP2 clean; Orientation=6 upright); selftest with a GPS photo from PRIV shows no APP1 and `exifr.gps` undefined.

- [x] T-054 [CLAUDE] Encrypted vault store. Due: Sat Nov 21 · Deps: T-051 · AC: AC-080, AC-081, AC-086, AC-271 (done Nov 20, same workflows; D-79, D-80. A gap-fill over the T-023 scaffold.
  - **Code:**
    - `vault/crypto.ts`: lock token, burn-pending marker, timed deletions.
    - `vault/vaultStore.ts`: item rules, all-or-nothing adds, finishing an interrupted burn.
    - `vault/sync.ts`: the cross-tab change signal.
    - `vault/burn.ts`: `performBurn`.
    - `vault/idb.ts`: `databaseExists`.
    - `ai/vaultScan.ts`: termsOf (AC-088, any kind), coalesced reloads, boot finishes a pending burn.
  - **Verify:**
    - Vitest with fake-indexeddb: AC-080 round trip, AC-081 fresh IV, AC-086 empty vault, AC-271 key first (also for an interrupted burn), AC-270, cross-tab.
    - In Chrome 156 the selftest vaultCrypto step reads the stored key back non-extractable, raw and jwk export throw, and the record holds only `{ct, iv, v}` with no plaintext.
    - `vaultTerms()` is `ai/vaultScan.termsOf`: labels and aliases only, never coordinates.
    - check: 657 tests.)
  - Read: SPEC SCR-04, SCR-19, D-23; ARCH §16 (IndexedDB table); API-NOTES §5.4
  - Files: `web/src/vault/crypto.ts`, `web/src/vault/vaultStore.ts`, tests.
  - Do:
    - AES-GCM 256 with a **non-extractable** key in `se-vault-keys/keys`.
    - Sealed vault items in `se-vault-data/items` (vault only). Per ARCH §16.3, sessions and queue are sealed in `se-sessions`, the ledger is unsealed in `se-ledger`, and settings live in localStorage.
    - A random 96-bit IV for every write.
    - One object store per database. **Never** idb-keyval's default store, which Tesseract owns.
    - `vaultTerms()` returns labels and aliases only, never coordinates. A pin whose label is empty or generic (`GENERIC_PIN_LABELS`, e.g. "Home") contributes no terms (D-36, AC-088).
    - `burnVault()` deletes the **key first**, then `se-vault-data`, `se-sessions` and `se-ledger` (ARCH §16.4; no partial option, D-31).
    - Limits: 20 items, 40-character labels.
  - Verify:
    - Vitest round trip with fake-indexeddb. CryptoKey cloning there works (verified in T-023's vault tests).
    - In the browser, `exportKey('raw')` throws, and DevTools IndexedDB shows only ciphertext.

- [x] T-055 [CLAUDE] Vault UI, "Pin this place", manual coordinates, burn. Due: Sun Nov 22 · Deps: T-050, T-054 · AC: AC-082, AC-083, AC-084, AC-085, AC-270 (P1: AC-087) (**Code done Nov 21**, D-92/D-93/D-99: `vault/geolocation.ts` (currentPin with a 30 s watchdog, parseManualCoords), `ui/screens/Vault.tsx`, `ui/components/{VaultItemForm,PinButton,BurnVaultDialog}.tsx`, 93 `ui.vault.*`/`ui.burn.*` strings. Review fixed (F-113–F-116): sliding off the Burn button cancels; an outcome while the sheet is closed shows on the Vault screen and the next open is the confirm step; focus after a hold goes to the status; an assistive-technology click gets an explicit "Yes, burn my vault" step. Tests: `vault/geolocation.test.ts` (47), `ui/vaultUi.test.ts` (50, incl. AC-087), `ui/vaultBehaviour.test.ts` (31, components driven through their own hooks); 52/52 mutants killed in scratch copies; `npm --prefix web run check` green. **Verify (orchestrator, Chrome, Nov 21):** 0 network requests while editing the vault; `95, 10` and `abc` refused; `52.52, 13.405` accepted; burn worked and no key remained after it. **Still open (manual):** AC-085 by eye, the reworked hold on a real touch screen and keyboard (slide-off, Escape mid-burn), the assistive-technology step with a screen reader, and a fresh-key check on the next add (AC-270). Judge Mode's read-only fake vault on this screen waits for the Judge Mode task (TODO in Vault.tsx).) (done Nov 21: built, then reviewed, with 2 majors fixed (DEVLOG F-113). **Chrome 156 (Browser pane), by the orchestrator:**
  - **Network:** 0 requests while editing the vault.
  - **Coordinates:** `52.52, 13.405` accepted; `95, 10` and `abc` refused.
  - **List:** the pin shows only "Coordinates entered by hand", never the coordinates.
  - **Burn:** a quick click does not burn; a 1.7 s hold burns ("Vault burned.", 0/20). Sliding off the button abandons the hold. A bare click (screen-reader path) opens "Burn your vault now? … Yes, burn my vault".
  - **AC-270:** no key after the burn; a key is created on the next add.
  - **Still open:** "Pin this place" with a DevTools Sensors override and a real touch/screen-reader pass, both in the user's Chrome.)
  - **From T-054 (D-79, D-80):**
    - Map every `VaultValidationError.code` to copy: full, label_too_long, alias_too_long, too_many_aliases (max 5), label_required (empty OR generic label on a text item, e.g. an employer "Work"), bad_kind, pin_required, pin_not_allowed, bad_pin, bad_id, duplicate_id, bad_link, bad_timestamp, bad_item, not_found. Also map `VaultCorruptError` (now also an unrecognised record).
    - Burn: `performBurn()` can reject with `BurnPendingError` ("not deleted in time"). Show a pending state with a retry, never `copy.burn.done`, and never claim the only cause is other open tabs.
    - SCR-04: create the linked `area_name` item only when the area text is non-empty and not generic. `addItems` is all or nothing, so a generic area would make the pin save fail.
    - An HTML `maxLength` counts UTF-16 units, which is stricter than the store's 40 code points; that is fine.
  - Read: SPEC SCR-04, SCR-19, §17.2–17.3; API-NOTES §5.7
  - Files: `web/src/ui/screens/Vault.tsx`, `web/src/ui/components/{VaultItemForm,PinButton,BurnVaultDialog}.tsx`, `web/src/vault/geolocation.ts`.
  - Do:
    - Kinds per SPEC §17.2.
    - "Pin this place": high accuracy, 15 s timeout, `maximumAge` 0. Show the accuracy, plus a warning above 250 m.
    - Manual "lat, lng" input, validated.
    - **No map, no geocoding.**
    - Lock badge: `copy.vault.lock`.
    - 21st item and labels over 40 characters refused.
    - Burn: hold-to-confirm for 1.5 s. There is no checkbox: it always deletes history, queue and ledger too (D-31).
  - Verify: in Chrome with a DevTools → Sensors override, the Network tab shows **0 requests** while editing the vault; `52.52, 13.405` is accepted and `95, 10` and `abc` are rejected.

- [ ] T-056 [CLAUDE] Tier-0 face detection (MediaPipe). Due: Sat Nov 21 · Deps: T-053 · AC: AC-118 (**Code done Nov 21**, D-83: one detector per model at the RC floor, threshold in code, boxes clamped and rounded outward, retry after a failed load; 6 unit tests; selftest `faces_none` passes. **Recall (U-31) is still open:** it needs a face or mannequin image in `PRIV/test/` from the user. Keep this unchecked until it is recorded.)
  - Read: API-NOTES §5.1; ARCH §11; SPEC §7.1
  - Files: `web/src/tier0/faces.ts`.
  - Do:
    - A singleton detector, **full-range** model, **CPU** delegate.
    - Wasm from `/vendor/mediapipe-1.2.3/wasm`.
    - `minDetectionConfidence` **0.3**, the same as the gate re-check (R-16).
    - Pixel boxes on the working image.
    - The same function serves the gate.
  - Verify: selftest with a local, uncommitted face image from `PRIV/test/`; record recall (U-31).

- [x] T-057 [CLAUDE] Tier-0 OCR (Tesseract 7). Due: Sat Nov 21 · Deps: T-053 · AC: AC-064 (done Nov 21; D-81, D-83; reviewed, with 2 majors fixed, F-76/F-77.
  - **Code:**
    - `tier0/ocr.ts`: `ocrMaster` (≤1600 downscale, boxes back to master px); two passes as per-job options with a line union (`tier0/ocrMerge.ts`); serialised jobs; `retainOcr` plus a 5 min idle drop; start/pass timeouts.
    - `ui/hooks/useOcrWarm.ts` warms the worker when Check opens.
  - **Verify:**
    - Selftest `ocrMaster` in Chrome 156: "LUCAS 42" found, with its box in master px (IoU 0.61 with where it was drawn); latency logged in the step detail.
    - Real-photo matrix: 29/30.
    - Unit tests: 19 OCR and 6 merge, mutation-checked.
    - **Cross-browser (Safari/Firefox) is still to run:** Safari needs "Allow remote automation" or the user opening the URL; Firefox is not installed (USER item).)
  - Read: API-NOTES §5.2; ARCH §11, §18
  - Files: `web/src/tier0/ocr.ts`.
  - Do:
    - A singleton worker with paths under `/vendor/tesseract-7.0.0/`; `corePath` is a **directory**.
    - Set `PSM.SPARSE_TEXT` once.
    - **Binarisation (D-81, from T-037):** set `thresholding_method: '1'` (Leptonica adaptive Otsu) once. Where a miss fails open (the vault-word match, the gate's OCR of the outgoing frame, the export check), also run a Sauvola pass (`'2'`) and take the union of words. The default Otsu missed the demo tag in 16 of 30 placements; the union missed none.
    - Call `recognize(canvas, {}, {blocks:true, text:true})`. Pass a canvas, **never an ImageBitmap**.
    - Downscale to `ocr_max_px` (1600) and map the boxes back to the working image.
    - Warm the worker when Check opens; terminate it after 5 min idle.
  - Verify:
    - Selftest: "LUCAS 42" is recognised with boxes; latency is logged.
    - **Cross-browser:** run the selftest in Safari and Firefox (the user opens the dev URL, or via `safaridriver`). Record pass or fail in PROGRESS. Safari lacks relaxed SIMD, so it should load the simd core; MediaPipe needs WebGL.

- [x] T-058 [CLAUDE] Vault matcher, regex detectors, prompt scanner. Due: Sun Nov 22 · Deps: T-051 · AC: AC-042, AC-110 (done Nov 20 (same workflows; the skeptic's major finding fixed and re-verified): `tier0/fuzzy.ts` (SCR-06 as fixed by R-15 plus D-77: digit sub-words, possessive and format-character readings), `tier0/regex.ts` (plate/phone/house number), `ai/vaultScan.ts` (one active index, useJudge/useReal, scanner order with canary, echo scan of free-text fields). `shared/testvectors/fuzzy.json` drives the tests: AC-042 (LUCAS, Lucas, LUCA5, L U C A S, LUCAS'S → Lucas; LOCAL, LUCKY, PARIS → no), AC-110, plates SE 1234 / SE-1234 vs SE 1235, "Medium"/"Landmark Road" never trip on an advB body or the advB.v1.ok echo while "Lucas" does. check: 438 tests green.)
  - Read: SPEC SCR-06 (Tier-0 steps 3–4), §10.3; ARCH §8.4 (as fixed by R-15)
  - Files: `web/src/tier0/fuzzy.ts` (port per ARCH §8.4 as fixed by R-15; `research/day1-artifacts/arch/src/fuzzy.ts` and its `fuzzy.check.ts` vectors, 25/25, are a pre-R-15 reference only), `web/src/tier0/regex.ts`, `web/src/ai/vaultScan.ts` (shared normaliser), tests, `shared/testvectors/fuzzy.json`.
  - Do:
    - Normalise per SPEC SCR-06 step 3: NFKD, diacritics, lowercase, delete apostrophes ("Mary's" → "marys"), other punctuation → space, the SCR-06 word folds only (saint/street → st, avenue → ave, road → rd, number → no, & → and), join runs of spaced single letters, and OCR confusables (0→o, 1/l→i, 5→s, 8→b) on both sides for text kinds only.
    - Levenshtein similarity ≥ `fuzzy_threshold` (0.8).
    - Tokens of ≤3 characters must match exactly.
    - Multi-word labels match on one distinctive token (≥4 characters, not on the generic-word list) **or** two consecutive label tokens.
    - Digit kinds (`plate`, `house_number`, `phone`): no confusable folding. Remove spaces and dashes and compare uppercase against one word or 2 adjacent words. Values of 1–2 characters match only a standalone token, and only in images. Prompt and echo scans skip terms shorter than 3 characters.
    - Port from ARCH §8.4 as fixed by R-15, **not** from `research/day1-artifacts/arch/src/fuzzy.ts`. That file predates R-15: it strips possessive 's, uses extra word folds, matches digits as substrings and has no artefact rule.
    - Regexes for plates, phones and house numbers (SPEC SCR-06 step 4).
    - `coordinatesNearPins` for PIN_IN_PROMPT.
    - Tripwire scanner order (ARCH §8.4, D-65):
      1. skip string values that **exactly** equal `prompts.nonContentStrings()`;
      2. strip `prompts.staticSegments()`;
      3. scan.
      - **Canary:** static text of a non-cloud prompt (nano*, fmPre) found in a scanned cloud body is a hit (`template-canary`).
      - The pass-B echo scan reads free-text fields only (`scene_summary`, `decline_reason`, `evidence`, `label`, `value`).
      - Tests: a vault label "Medium" or "Landmark Road" does not trip on an advB request body built as firebase/ai builds it, nor on the `advB.v1.ok` fixture's echo scan; "Lucas" in a user text part does.
    - `vaultScan` keeps one **active** index (ARCH §8.4, R-14): the real vault outside Judge Mode, JUDGE_VAULT in Judge Mode (the real vault is then never loaded); `activeTerms()`, `activePins()`, `useJudge()`, `useReal()`; every switch re-registers the tripwire scanner.
  - Verify: tests for `LUCAS`, `Lucas`, `LUCA5`, `L U C A S` and `LUCAS'S` → Lucas; `LOCAL`, `LUCKY` and `PARIS` → no match (AC-042); "CITY GENERAL" → "City General Hospital"; "CITY" alone and "HOSPITAL STAFF" → no match (AC-110); `SE 1234` and `SE-1234` → plate "SE 1234", `SE 1235` → no match.

- [x] T-059 [CLAUDE] Box mapping, masks and crop. Due: Sun Nov 22 · Deps: T-053 · AC: AC-113, AC-118, AC-192, AC-196 (code done Nov 21; review passed with no major findings and #/dev/selftest ALL PASS incl. `frames`; the review follow-ups (fail closed on malformed or unpainted masks D-97, `clampMaxPx` D-98, `frames.canvas.test.ts`, `frames.json`) changed the step only to free its canvases in a `finally`: **orchestrator to re-run #/dev/selftest, then tick**. Built: `core/frames.ts` (deriveFrame/renderFrame/buildFrameJpeg), boxes.ts `box2dToMaster`, `frameToMaster`, `masterToFrame`, `masterToBox2d`, `preferOcrBoxes`, `bestCrop`, `roundOut`, `clampPadRatio`; padRect rounds up and clamps the ratio (D-88, D-89). `drawSolidMasks` is `fillSolid` in mask.ts (ARCH §11.6). Vectors `shared/testvectors/{box2d,crop,frames}.json` (AC-192, AC-196 incl. 2 rules-plan cases). Tests: boxes/frames/frames.canvas/mask Vitest 163 (seeded round-trip properties over any aspect ratio and crop side; the canvas half on a recording canvas). Mutations: round 1, 42 of the pure geometry and `fillSolid`, all killed by `check` (the canvas half was then untested in Node, F-110); round 2, 39 of the canvas half, the fail-closed guards and `clampMaxPx`, all killed by `check`. `npm --prefix web run check` green. AC-113's solid-black look and AC-118's pixel sampling are in the selftest; AC-113 manual check at T-068/T-079.) (done Nov 21: built, then reviewed with no majors; follow-ups applied (D-97 fail-closed masks, D-98 clampMaxPx). **#/dev/selftest re-run by the orchestrator in Chrome 156 after the follow-ups: ALL PASS, including `frames`.** A Gemini box maps back within 1–3 px of the target on the master, and the padded mask covers it. No target pixel survives in the cloud or export frame. The masked pixel reads 0,0,0,255, and the master is untouched. check: 1352 tests.)
  - Read: SPEC SCR-11 (crop), D-20; ARCH §11; API-NOTES §5.8, §6.1
  - Files: `web/src/core/boxes.ts`, `web/src/core/mask.ts`, tests, `shared/testvectors/{box2d,crop}.json`.
  - Do:
    - `box2dToPx` (y first; clamp, swap reversed corners, drop zero-area boxes).
    - `cloudToMaster`.
    - Padding = 15% of the box (`mask_pad_ratio`), minimum 4 px.
    - Prefer the OCR box where text boxes overlap (IoU > 0.3).
    - 3×3 grid-cell rect.
    - `drawSolidMasks`: `fillRect`, alpha 1, `source-over`. **Never blur.**
    - Crop: the minimal crop from the chosen side, capped at 40%.
  - Verify: tests: on 800×600, `[100,250,500,750]` → `{x:200,y:60,w:400,h:240}` before padding; the masked pixel reads `[0,0,0,255]`; the crop cap holds.

- [x] T-060 [CLAUDE] Routing policy as data with a hard floor. Due: Sun Nov 22 · Deps: T-051 · AC: AC-020, AC-026 (done Nov 21, D-84/D-85; the AC-026 HUD table itself is the HUD task's job: routing.ts gives it `PAYLOAD_CLASSES`, the policy and `warning`)
  - **Results:**
    - **Template:** the repo-root `remoteconfig.template.json` is a verbatim copy of ARCH §13.3. Its 27 keys match the §13.2 table in type and default, `routing_policy` deep-equals ARCH §7, and `check-prompts` now validates `prompt_versions`. Against the research copy it differs in the `ocr_max_px` and `auto_mask_types` defaults and in four descriptions (F-83). **After the review (F-106):** two §13.2 clamps were added to the descriptions, and a test pins every key, type, default and clamp to ARCH §13.2 and the file byte for byte to the §13.3 block.
    - **routing.ts:** `DEFAULT_POLICY` comes from the template and is floor-checked at import. `HARD_FLOOR` is code. The module also has `effectivePolicy`, `jobClass` (Judge Mode → S4) and the rest (ARCH §7 "As built").
    - **Tests (after the review: 160 tests, 136 of them from `shared/testvectors/rc.json`, D-96; the types are deep-readonly, D-95):** `routing.test.ts` covers good values; each of the 20 S0/S1 loosenings, 27 job moves and 3 S3.web moves on its own; non-strings; invalid JSON; missing, extra and mistyped keys; `__proto__`, `constructor` and `prototype` keys and enum values; versions; homoglyph enum values; duplicate keys; 8 KB and 2 MB inputs; deep nesting; and 3000 seeded random policies.
    - **Mutations:** 26 of 26 killed, run in a scratch copy, and 41 of 41 after the review: the 26 again through rc.json, plus 8 template/table edits, 2 tsc readonly removals, a dropped vector, 2 unfrozen lists and the 8 KB cap. They covered every floor entry, extra-key tolerance, `in` instead of `hasOwn`, the version check, the size cap, the merge, the warning, freezing, the load-time check and three template edits. The first run let one survive (F-81).
    - **Check:** `npm --prefix web run check` is green (34 files, 1034 tests).
    - **iOS:** the T-038 resource line is in and the build gives BUILD SUCCEEDED.
  - Read: SPEC §6.1, D-14; ARCH §7
  - Files: `web/src/core/routing.ts`, tests.
  - Do: `DEFAULT_POLICY` and `HARD_FLOOR` per ARCH §7 (shape per R-01). Invalid or loosening RC values fall back to the bundled policy, and the HUD shows `copy.hud.policyRejected`.
  - Verify: Vitest with good, bad and malicious policy JSON.

- [x] T-061 [CLAUDE] Capability detection and the capability panel. Due: Sun Nov 22 · Deps: T-050 · AC: AC-001, AC-005, AC-007, AC-072, AC-073, AC-074
  - **Done Nov 21 (code and unit tests; D-86, D-87, D-100; F-86..F-90, F-117..F-120). Independent review passed (no major); follow-ups applied the same day.**
    - Built `ai/capabilities.ts`, `ui/hooks/useCapabilities.ts` (with `createCapabilitiesController`) and `ui/components/CapabilityPanel.tsx`, plus `ui.cap.*` strings. The orchestrator mounted the panel in AppShell; `PLACEHOLDER_CAPABILITY` and `ui.cap.pending` are gone.
    - 140 tests: capabilities 64, hook and controller 38, panel 38. AC-001 is table-driven over all 100 signal combinations. AC-007: the gate path is fresh on every call, and the UI snapshot is cached 30 s (fake timers). The UI never shows a snapshot past its 30 s life while visible (D-100). AC-005 at module level: `deviceReadyNow` is false for `downloadable`/`downloading`. Boundary rule R23 keeps the UI snapshot out of the gate.
    - **Mutation coverage (corrected, F-117).** The first run's "32/32 killed" covered only the pure functions, the gate path, the download and the static render. The hook's effects were untested, and an independent reviewer's 28 mutations left 14 alive. Now 59/59 of my mutations are killed in a scratch copy: the original set plus the reviewer's survivors and the controller rules.
    - **Still not unit-covered:** the three one-line React effect bodies that wire things together (the hook's `ctl.start()`/`ctl.stop()`, and the panel's `handOffFocus` and `watchShown` calls). They need a DOM. The functions they call are covered.
    - `npm --prefix web run check` green.
  - **Open:**
    - **SDK download path (T-101):** wire AppShell to `models.initializeDeviceModelFor(ai, io)` once Firebase boot exists. Today the button uses the interim direct `create()` path (D-87).
    - **T-062:** AC-005 end to end (S0/S1 never reach the SDK while downloading) belongs in the gate's tests; see the "From T-061 review" note there.
    - **Later signals:** feed the panel's `cloud` row (kill switch, cap, App Check; RC T-102) and `tier0` row (asset loading).
    - **[USER]-assisted manual checks:** AC-072 in Chrome with Nano, a Chrome guest profile and Safari; AC-073 (download only from a click, progress at least every 5 %, chip flips within 2 s); AC-074 visually.
  - Read: SPEC §5.1–5.4, SCR-02; API-NOTES §1.5–1.6, §1.16; ARCH §9.5 (capability checks: `availabilityNow`/`deviceReadyNow` for the gate, never cached; `uiCapabilities` 30 s UI cache; R-11)
  - Files: `web/src/ai/capabilities.ts` (the only file that touches `globalThis.LanguageModel`), `web/src/ui/components/CapabilityPanel.tsx`, `web/src/ui/hooks/useCapabilities.ts`.
  - Do:
    - States (a), (a′), (b), (c), plus the (d) flag.
    - The gate's path **never caches** availability; the UI chip may cache for 30 s.
    - "Download Gemini Nano" calls `initializeDeviceModel(progress)` **inside its click handler**.
    - Show the Chrome how-to.
    - Use the SCR-02 copy.
  - Verify: a table-driven unit test (AC-001); manual checks in Chrome with Nano, a Chrome guest profile and Safari.

- [ ] T-062 [CLAUDE] Egress Gate: the only door to Firebase AI Logic. Due: Mon Nov 23 · Deps: T-054, T-056, T-057, T-058, T-060, T-061, T-086, T-093 · AC: AC-020–AC-025, AC-040, AC-042–AC-046, AC-048, AC-303
  - **Status (Nov 21): code and unit tests done (D-111..D-114; F-141..F-148); not ticked: no independent review yet, and the open items below.**
    - **Review fix round (Nov 21; D-129..D-131; F-185..F-192):** two independent reviews (security, policy) found four majors; all fixed. Request snapshot before the first await (TOCTOU), `ai/jpegStrict.ts` strict outgoing-JPEG validator, factory moved behind `ai/egressGate.testing.ts` (no `buildSdkModel`/setter exports; bundled frozen sample allowlist), `mintConsent()` tokens, BREACH aborts in-flight cloud calls and is re-checked before every permit, kill switch re-read per attempt, RC timeouts authoritative, no cloud parse/truncation retry, refusals keyed on session + image, PREFER device failures classified as device, banners only without a fallback, `GROUNDING_OFF`/`ABORTED` codes, caller `signal`, default retry budgets, 2 s device grace, pending Ledger entries never evicted. Tests: `egressGate.test.ts` 291 (matrix now 163 rows incl. pass A, Judge image, grounding, cap, consent, auth, D-84 × Nano off, plus an iOS mapping section), `jpegStrict.test.ts` 31, `errors.test.ts` 10. Mutation (scratch, each run proves the mutant loaded and every kill is confirmed by a second run): 101/110 killed; the 9 survivors are guards duplicated by another guard (exifr after the strict validator, loop-top kill-switch/BREACH checks backed by the post-interlock checks, the deadline abort backed by the abandon abort, the two pass-A grounding filters, declared vs checked hashes after the snapshot, two JPEG rules backed by others).
    - **Open after the fix round:** the boundary rule restricting `ai/egressGate.testing.ts` importers and `ai/models` value imports (scanner agent); `mintConsent` callers (T-069 consent sheet) and `/samples/manifest.json` (Judge Mode) do not exist yet; T-068 preflight should run `validateOutgoingJpeg` too; `frames.buildFrameJpeg` still relies on `tier0/exif.ts`'s lenient `assertCleanJpeg` (D-130).
    - Built: `web/src/ai/egressGate.ts` (`createEgressGate(deps)`, `gate()`, `gateState()`, `gateNotices`, `setSampleAllowlist`, `buildSdkModel`; ARCH §8.2 "As built"), `web/src/ai/errors.ts` (ARCH §17 "As built"), `web/src/core/ledger.ts` (minimal in-memory Ledger; T-063 owns persistence), `shared/testvectors/gate-matrix.json` (136 rows). `ai/models.ts`: `judgeJsonModel` gained an optional `mode` (D-113).
    - Evidence: `egressGate.test.ts` 247 tests on the REAL tripwire (over a fake network), interlock, device queue, vault index, prompts and floor: the matrix (job × class × Nano ready/absent/downloading/off/simulated × kill switch × online, plus D-84 (a)(b)(c) and floor rows), every block reason with "no SDK call" (AC-040), S1 without `LanguageModel` (AC-021/AC-005), availability on every call (AC-007), RC loosening floored (AC-020), APP1/APP13 (AC-043), one-byte consent mismatch (AC-044), "Lucas" → `VAULT_TEXT_IN_PROMPT` with `{KIND}` CHILD'S NAME, S4 non-sample image (AC-023), Judge scanning (AC-048), S2 reclassification for a label and for pin coordinates (AC-024, AC-238), no retry after refusal/decline (AC-303), BREACH (AC-022), tripwire VAULT_TEXT / canary / NO_PERMIT / vault-unavailable, interlock ordering and per-retry re-entry, 429/network/400/401 retries and banners, stalled fetch/body/stream/device deadlines, `ensureAuth` null and hang, `NoDeviceModelError`, kill switch, cap, grounding capture, echo scan, AC-045 Ledger scan. `errors.test.ts` 10. Scratch mutation run: 65/66 guard mutants killed (one equivalent). `node scripts/check-boundaries.mjs` green (AC-025).
    - **Open:** (1) **D-80 generation check:** the gate asks an injectable `vaultFresh()` before every permit, but the vault store keeps no generation counter: `vault/vaultStore.ts` must bump a persisted counter inside the lock in `saveUnlocked`/`burnUnlocked` and `ai/vaultScan.ts` must expose the generation its index was built from; then wire `vaultFresh` in `appDeps()` (vault owner). (2) **Judge Mode** must call `setSampleAllowlist(manifest.samples)` and `vaultScan.useJudge(JUDGE_VAULT)`. (3) **T-063:** persistent Ledger behind `core/ledger.ts`'s interface, counters, receipt, `core/ledger.test.ts`. (4) **T-064:** HUD lines from Ledger entries and `gateNotices`. (5) **T-085/T-082:** SCR-10 toast and banners subscribe to `gateNotices`. (6) **T-089:** the fake transport replaces `buildModel` (or the model) in an e2e build; `appDeps()` is the seam. (7) **T-103:** RC → `systemStatus.set({killSwitch, dailyCap})`; the gate already enforces kill switch, cap, grounding and (via `groundingEnabled`) data tier per call. (8) AC-046 measured in the browser (`GateResult.checksMs`). (9) `ui/hooks/useOnline.ts` could read the gate's network-error hold (not exported yet). (10) A `core/types.ts` `GateBlockReason` for `VAULT_UNAVAILABLE`/`TEMPLATE_CANARY` was not needed (Ledger `error` carries them, D-112).
  - **From T-061 review (D-100) `[VERIFIED: src]`, firebase 13.4.0 `index.esm.js`:**
    - The SDK reads `window.LanguageModel` only when `getGenerativeModel()` builds the model: `chromeAdapterFactory`, ~line 1224, called at ~4889. With no `LanguageModel` at that moment, the model has **no adapter**.
    - `callCloudOrDevice` (~line 2562) then sends **even ONLY_ON_DEVICE** to the cloud.
    - So build each S0/S1 model **after** `deviceReadyNow(io)` returns true, in the same gate call. `models.deviceJsonModel` builds a new model per call: keep it that way; never cache S0/S1 model instances. Or assert the model has an adapter before invoking it.
    - Only `availabilityNow` / `deviceReadyNow` may feed gate decisions. Boundary rule R23 rejects `uiCapabilities` / `peekUiCapabilities` outside `web/src/ui/**`.
  - **From T-054 (D-80):** before each permit, compare a monotonic vault generation (bumped inside the vault lock by saveUnlocked and burnUnlocked) with the active index's generation, and refresh when they differ. Another tab hears of a vault change only when its BroadcastChannel message runs, so without this check the gate can briefly scan with a stale index (TODO(T-062) in ai/vaultScan.ts).
  - **From T-058/T-093 reviews (D-75, D-77):** map the vault scanner's `template-canary` and `vault-unavailable` (scanner briefly blocks everything while the vault reloads) to their own Ledger reasons, and never treat `vault-unavailable` as a vault leak or BREACH. Follow the ARCH §8.5 caller rules: no nested gate calls while holding the interlock; each cloud retry re-enters the interlock; device timeouts go inside `deviceQueue.run(fn)`.
  - **From the T-065 review (F-125, API-NOTES §1.9):** `RequestOptions.timeout` (set by `ai/models.ts` from RC `timeouts_ms`) only bounds the wait for response headers; the SDK clears it when `fetch()` resolves. The gate must add its own deadline: one `AbortController` per cloud call, aborted on a timer of the job's `timeouts_ms`, passed as `{ signal }` to `generateContent` / `generateContentStream`, and still armed while pass A's stream is read and while any response body is read. `deviceJsonModel` / `deviceTextModel` now throw `NoDeviceModelError` if the SDK built them without an on-device adapter: treat it as RULES-ONLY (`fallback: no on-device model`), never as a reason to use the cloud.
  - **From the T-060 review (D-84, D-95):** routing gives the gate `P = cfg().routingPolicy`. It is already parsed, floored and deep-frozen, so never pass it to `effectivePolicy`, which takes the RC string. Use `routing.jobClass(P, job, judge)` for the expected class (ARCH §8.2). Because RC can tune S2, S4 and S3's `cloud`, the gate must also handle these three cases:
    - (a) **`cloud: false` means not cloud-capable, whatever `web` says.**
      - S3 is BLOCKED. Reuse `KILL_SWITCH` (an operator switched the cloud off) or `CLASS_FLOOR`; pick one and record it in ARCH §8.7.
      - S2 and S4 run on the device only if (b) passes. Otherwise they take the deterministic path (RULES_ONLY), never the SDK's cloud fallback.
      - ARCH §8.2 line `cloudCapable ← mode ≠ ONLY_ON_DEVICE` must become `… ∧ P.classes[cls].cloud`.
    - (b) **Run `availabilityNow(io)` before any call whose effective mode is `ONLY_ON_DEVICE`, not only S0/S1.** This covers RC setting S2 or S4 to `ONLY_ON_DEVICE`, `cloud: false`, and the kill-switch or offline downgrade.
      - Check it fresh and never cache it. Without `window.LanguageModel` the web SDK silently sends `ONLY_ON_DEVICE` to the cloud (CLAUDE.md invariant 3).
      - When it is not `'available'`: RULES_ONLY, without touching the SDK.
    - (c) **When `jobClass(P, 'explain', judge)` is S0** (the RC tightening), the explainer call must carry `modelSpec: { kind: 'deviceText' }` and an S0 deterministic fallback. `specFitsClass(S0)` accepts only `deviceJson`/`deviceText`, so an `explain` spec would be `CLASS_MISMATCH`. The caller picks the spec from the class.
    - **`gate-matrix.json` rows, one or more per case:**
      - (a) S3 with `cloud: false` → BLOCKED, no fetch. S2 with `cloud: false` and no device model → RULES_ONLY, SDK mock never called.
      - (b) S2 `web: ONLY_ON_DEVICE` with `LanguageModel` absent → RULES_ONLY, SDK never called; the same for S4.
      - (c) `jobs.explain = 'S0'`: a `deviceText` spec passes step 1; an `explain` spec → `CLASS_MISMATCH`.
  - Read: SPEC §6, §7; ARCH §8.1–8.3 (§8.3 preflight), §8.4 (active-vault term index), §8.5 (tripwire), §8.7 (block reasons → copy), AD-17, AD-31 (with R-14, R-16, R-17, R-24, R-25); API-NOTES §1.4–1.5
  - Files: `web/src/ai/egressGate.ts` (the only `generateContent`/`generateContentStream` call site; it grows from T-086's v0), `egressGate.test.ts`, `shared/testvectors/gate-matrix.json`.
  - Do, in order:
    1. Class and spec fit.
    2. S0/S1: `availabilityNow(io)` / `deviceReadyNow(io)` (ARCH §9.5) with the **same** createOptions, checked fresh on every call and never cached (AC-007). Otherwise RULES_ONLY **without touching the SDK**.
    3. S4: the SyntheticProof allowlist, which replaces the vault-text checks.
    4. Kill switch, offline, daily cap, consent token, `await ensureAuth()` (bounded 5 s; null → `CLOUD_AUTH`, `copy.err.auth`, no request; D-110).
    5. Bitmap re-check of every cloud-capable image: APP1/APP13, GPS, faces @0.3, OCR against the **active** vault terms.
    6. Dynamic-segment prompt scan against the active vault. An S2 hit (a vault string or pin coordinates) reclassifies the call to S0 (D-15): not a block, same Ledger entry (ARCH §8.2 RECLASSIFY). S3 hits block with `VAULT_TEXT_IN_PROMPT` / `PIN_IN_PROMPT`; S4 skips the scan (allowlist).
    7. Execute via `deviceQueue`/`interlock`.
    8. Route verify: an S0/S1 response reporting `in_cloud`, or a tripwire `LOCAL_LOCK`, is a BREACH (AC-022, ARCH AD-31): page-lifetime `compromised`; S0/S1 and S2/S4 RULES_ONLY; S3 BLOCKED `TRIPWIRE` until reload; persistent `copy.gate.tripwire`; one BLOCKED `TRIPWIRE` Ledger entry.
    9. Parse.
    10. Response echo scan.
    11. Exactly one ledger entry.
    12. Block toasts and banners per ARCH §8.7 (SPEC §7.2 mapping, SPEC §11 strings): `{TEXT}` for `blockedVaultText`, `{KIND}` (SPEC §17.3 display name) for `blockedPrompt`, `copy.queue.queued` for `OFFLINE`; `TRIPWIRE` only for a BREACH.
  - Verify: `npx vitest run src/ai/egressGate.test.ts` covers every block reason (AC-040), plus:
    - S1 without `LanguageModel` → RULES_ONLY and the SDK mock is never called (AC-021);
    - an RC policy loosening S0 → rejected (AC-020);
    - APP1 → blocked (AC-043);
    - a one-byte consent mismatch → blocked (AC-044);
    - "Lucas" in a dynamic segment of an S3 prompt → `VAULT_TEXT_IN_PROMPT`, toast `copy.gate.blockedPrompt` with `{KIND}` = CHILD'S NAME; the Ledger holds only `{vaultId, kind}`;
    - S4 with a non-sample image → blocked (AC-023);
    - Judge Mode scanning (AC-048): an S4 referee prompt containing "Lucas" from JUDGE_VAULT is allowed; an S3 Judge image with the "LUCAS" tag unmasked is blocked against JUDGE_VAULT; the real vault is never unsealed;
    - S2 reclassification for a vault label and for pin coordinates: no cloud call, no BLOCKED entry, one Ledger entry (AC-024, AC-238);
    - no retry after a decline (AC-303);
    - after a BREACH: S0/S1 and S2/S4 return RULES_ONLY, S3 is BLOCKED `TRIPWIRE` with no fetch, and the breaching call has exactly one BLOCKED `TRIPWIRE` Ledger entry (AC-022).
    - Then `node scripts/check-boundaries.mjs` (AC-025).

- [ ] T-063 [CLAUDE] Cloud Ledger and "What the cloud saw". Due: Mon Nov 23 · Deps: T-062 · AC: AC-045, AC-210, AC-211, AC-212, AC-213, AC-230, AC-231 (**Minimal demo-path version built Nov 21, not ticked:** D-148, F-221. In memory only (no `se-ledger`); `core/ledgerView.ts` counters/receipt/cloud-send pick, `core/ledgerImages.ts` (consented JPEGs keyed by their own sha256, AC-230), `ui/hud/useLedger.ts`, live `LedgerPanel` (counters, What the cloud saw with sha prefix = consent sheet, prompt id, entries), Settings Usage counters + Copy receipt. Tests: `core/ledgerView.test.ts`, `core/ledgerImages.test.ts`. **Open:** persistence, receipt download, session filter, per-entry gate checks, Burn vault clearing the in-memory ledger, AC-211 with real calls, AC-213 manual.)
  - Read: SPEC SCR-13, SCR-15; ARCH §8.6, §16.3
  - Files: `web/src/core/ledger.ts` (unsealed, in its own IndexedDB database `se-ledger`/`entries`, newest 500 entries, IDs/kinds/hashes/numbers only, **never Firestore**; ARCH §8.6, §16.3), `web/src/ui/components/{LedgerPanel,CloudSawToggle}.tsx`.
  - Do:
    - Counters: `copy.ledger.counters`, images, requests, bytes, on-device calls, rule checks, blocked.
    - A receipt to **copy** (P0) or download as JSON (P1, D-33): hashes only, no vault strings, coordinates or images.
    - A footer line for other traffic.
    - The toggle shows the exact blob of the most recent send. The selector for earlier sends is P1 (D-33).
  - Verify: a unit test scans the serialised ledger and receipt for fixture vault strings; in T-085 the counters equal the captured requests.

- [ ] T-064 [CLAUDE] Router HUD. Due: Mon Nov 23 · Deps: T-062 · AC: AC-026, AC-220, AC-221, AC-222 (**Calls tab built Nov 21, not ticked:** D-149, F-222. Live lines from the Ledger (AC-220 unit in `core/ledgerView.test.ts`), pill = last call, 40 px. Browser (fakes): pre-screen ON-DEVICE, pass B IN CLOUD, referee ON-DEVICE with latencies. **Open:** Policy tab (AC-026), Tier-0 and no-call rules-referee lines, AC-221 with real Nano/cloud, AC-222 375 px screenshot.)
  - Read: SPEC SCR-14
  - Files: `web/src/ui/components/RouterHUD.tsx`.
  - Do:
    - Two tabs: Calls (`role="log"`) and Policy (the policy as loaded, its source, the capability state, models, prompt versions).
    - Routes ON_DEVICE / IN_CLOUD / RULES_ONLY / BLOCKED / QUEUED / CACHED. For S2/S4, the route comes from `inferenceSource`.
    - Event lines (SPEC SCR-14): BLOCKED, QUEUED, CACHED, RECLASSIFIED S2→S0, fallback: model downloading, fallback: no on-device model, policy rejected and +rules.
    - Collapsed it is at most 40 px high.
  - Verify: a component test with a mocked gate; a 375 px screenshot shows no overlap with the buttons.

- [x] T-065 [CLAUDE] Firebase AI model factories. Due: Mon Nov 23 · Deps: T-024, T-030 · AC: AC-025, AC-221
  - **Done Nov 21 (D-91):** `web/src/ai/models.ts` + `models.test.ts` (30 tests; a spy on a mocked `getGenerativeModel` with the real `InferenceMode`/`ThinkingLevel`): every factory's exact options per class (S0/S1 ONLY_ON_DEVICE with no `inCloudParams`, S2/S4 PREFER_ON_DEVICE, S3 ONLY_IN_CLOUD), model/tools/systemInstruction/generationConfig/thinking only under `inCloudParams`, tools only on pass A, no temperature/topP/topK/candidateCount/penalties/thinkingBudget at any depth, plain separate schema copies, the shared `NANO_*_IO` objects by identity, RequestOptions timeouts per RC key, `cloudParamsFor` per ARCH §9.2, the template defaults accepted, `textPart`/`jpegPart`. Also `deviceTextModel` and `initializeDeviceModelFor(ai, io)` (D-87 download). Review round (F-125): device-only factories throw `NoDeviceModelError` without an SDK on-device adapter, and the initializer rejects; 35 tests. 26 + 5 mutations in scratch copies, all killed (one equivalent mutant replaced). `npm --prefix web run check` green. AC-221 (HUD `IN_CLOUD` + `fallback: no on-device model` in state (c)) needs the gate and HUD: verify it at T-085.
  - Read: ARCH §9.2–9.3; API-NOTES §1.3, §1.7–1.8, §1.11, §1.13
  - Files: `web/src/ai/models.ts` (the only `getGenerativeModel` call site; start from `research/day1-artifacts/arch/src/models.ts`).
  - Factories:
    - `deviceJsonModel` (S0/S1);
    - `judgeJsonModel` (S4, **generic**, used by preScreen, vaultTextMatch, referee and fixPlan in Judge Mode);
    - `explainModel` (instructions in the user turn, D-04; `initialPrompts` only once U-44 is verified);
    - `adversaryAModel`;
    - `adversaryBModel`.
  - Rules: no temperature or penalties; `textPart()`/`jpegPart()` always set `type`; plain-object schemas.
  - Verify: `tsc`; a unit spy asserts that model, tools and generationConfig sit under `inCloudParams` and that there is no `temperature` key.

- [x] T-066 [CLAUDE] Nano pre-screen (S1) and the two readers. **Ticked Nov 21 (D-154):** real Gemini Nano in the user's Chrome 157 via `#/dev/nano`: pre-screen ON_DEVICE through the gate, 2 clues on the drawn sign/plate canvas, 13.0 s cold / 9.5 s warm; nanoPre.v1 released. Due: Mon Nov 23 · Deps: T-057, T-058, T-062, T-065 · AC: AC-111, AC-114, AC-117 (**Built Nov 21, not ticked:** D-146, F-217. `ai/jobs/prescreen.ts` (S1 through the gate on the nano768 JPEG of the original master) + `ai/jobs/prescreenClues.ts` (AC-114 parse, §11.4 OCR localisation, merge with readers `both`), hooked into `ui/check/runPrescreen.ts` after Tier-0; the Nano line shows ON-DEVICE + count + ms, or RULES-ONLY and why (`prescreenView.nanoResultLine`). Tests: `ai/jobs/prescreen.test.ts` (12). Browser: no Nano → RULES-ONLY line; `?fakeNano=ok` → "Gemini Nano looked for clues (2 found) ON-DEVICE", two dashed approximate rows. **Open:** real Nano in Chrome (HUD needs T-064), AC-111 e2e with the LUCAS prop, AC-117 video, release nanoPre.v1 (D-62); T-067 seam is `runPrescreen`'s `words` + the Nano clue texts.)
  - **Release (D-62):** once this run is recorded in PROGRESS, set `"released": true` for nanoPre.v1, nanoVaultText.v1 (if not already released by T-032) in `shared/prompts/manifest.json` and run `node scripts/check-prompts.mjs`. From then on those files are frozen; any change needs a `*.v2.*` file.
  - Read: SPEC SCR-06; ARCH §9.1, §10.7
  - Files: `web/src/ai/jobs.ts` (`preScreen`), `web/src/ai/parse.ts` (`parsePreScreen`).
  - Do:
    - Input is the **original**, oriented image as a 768 px JPEG, sent to the device only.
    - Validate types, regions and severity against the enums.
    - Localise each clue by OCR; otherwise use its grid cell.
    - Merge with the Tier-0 readers. **Either reader alone** makes a candidate.
    - Labels: `copy.prescreen.rulesOnly` / `textOnly`.
  - Verify:
    - In Chrome with Nano, the HUD shows ON-DEVICE.
    - Without Nano, it shows RULES_ONLY and the SDK is never called.
    - A parse failure keeps the Tier-0 results (AC-114).

- [ ] T-067 [CLAUDE] Nano vault-text match (S0, nanoVaultText.v1). Due: Tue Nov 24 · Deps: T-066 · AC: AC-115
  - Read: SPEC SCR-06; ARCH §10.8
  - Do:
    - Runtime ID enums. If there are no texts or no vault items, skip the call (an empty enum is invalid).
    - `exact`/`likely` → mask. A hit with no OCR box → mask the whole grid cell.
    - The deterministic matcher stays the floor.
  - Verify: manual test with the LUCAS prop; unit test of ID validation. (Emergency cut 7.)

- [ ] T-068 [CLAUDE] Pre-screen UI and mask editor. Due: Mon Nov 23 · Deps: T-059, T-066 · AC: AC-112, AC-113, AC-116 (**Tier-0 half built Nov 21, not ticked:** D-121..D-123, F-171..F-176. Built: `tier0/tier0.ts` runTier0, `core/pretick.ts` (AC-112 unit test on a fixture clue set, both modes), `ui/check/{editor,runPrescreen,prescreenView}.ts`, `ui/checkState.ts` (pre-screen state, `maskedCandidate`, `BUILT_STEPS`), `ui/components/{PhotoStage,ClueList,PrescreenPanel}.tsx`, StepperNav "(not available yet)", Check "Continue to pre-screen". Tests: pretick/tier0/editor/prescreenState plus the updated checkState, 115 in all; mutations 59 of 59 killed in round 2 (7 survived round 1, F-175). Browser (synthetic canvas images): detection runs, masked pixels read 0,0,0,255 (AC-113 look), drag/move/resize/delete by pointer and keyboard, round trip keeps edits without a re-run, a new import resets the steps, no request beyond the dev server. **Open:** T-066's Nano clues and ON_DEVICE line (seam in `runPrescreen`); AC-116 e2e through T-069 (which must build the cloud JPEG from `candidate.masks`); the hero-photo manual check; Strict switch (P1); Explain (SCR-16); HUD entries (T-064); actions stay disabled until T-069/T-079; add the new files to check-boundaries R9. **Review fix round Nov 21 (D-132, D-133, F-193..F-197):** an un-ticked face blocks the candidate (`face_unmasked`); a vault hit is covered only by a user mask that fully contains it; failed readers are never "nothing found"; face-model timeouts; one run per epoch; spaced plates; focus and announcements; `prescreenRender.test.ts`. Mutations 38 of 39 killed (1 equivalent).)
  - **From T-053:** AC-100's "starts a session" clause is verified here: Check moves from Import to the pre-screen step with the stored master. T-089's e2e covers it too. The import status lives in `ui/checkState.ts`; keep "ready exactly while the master is held".
  - Read: SPEC SCR-06 (pre-tick table, editor), D-16
  - Files: `web/src/ui/components/{PhotoStage,ClueList,ManualMaskTool}.tsx`, `web/src/ui/screens/Check.tsx`.
  - Do:
    - **Standard mode is the default** and pre-ticks exactly per SPEC SCR-06 (faces, vault hits, regex plates/phones/house numbers, and high-severity `auto_mask_types` clues located by OCR are masked; the same clues without an OCR box are flagged dashed; other high-severity clues are flagged; medium/low clues are flagged amber).
    - (P1, D-33) Strict is a toggle (RC `strict_mode_default=false`) that re-applies the pre-ticks after a confirmation.
    - The `auto_mask_types` default (Standard mode, P0) is `name_text`, `house_number`, `plate`, `mail_or_document`, `screen` (SPEC SCR-06).
    - Add-mask by drag. Crop is P1.
    - Confirm before removing a grid cell.
    - Unticking is allowed, with the warning `copy.editor.warnVault`/`warnFace`. The gate still blocks; this is the leak demo.
    - Actions: "Check with the cloud attacker" / "Queue cloud check" / "Just clean and export".
  - Verify: AC-112 unit test on a fixture clue set; manual check with the hero photo.

- [ ] T-069 [CLAUDE] Consent sheet. Due: Mon Nov 23 · Deps: T-062, T-068 · AC: AC-130, AC-131, AC-132, AC-133, AC-134, AC-135 (**Built Nov 21, not ticked:** D-139, D-140, F-202..F-206. `ai/preflight.ts` (dry run, strict JPEG, 2 auto-mask rounds, user hits never re-masked; AC-134 unit), `ui/components/ConsentPanel.tsx` (Send step panel, not a modal), `ui/check/{sendFlow,runSend}.ts`, `checkState.flow`. Unit: tier line AC-131, cancel AC-132, failure disables Send AC-133. Browser (DEV fake adversary, synthetic image): sheet → Send → verdict. **Open:** AC-130 e2e needs the Ledger rail (T-063, F-205); AC-135 e2e with a real vault hit; re-attack diff line and Judge countdown (with T-080/Judge); `core/consent.ts` not needed (`mintConsent` in the gate).)
  - Read: SPEC SCR-07, D-30; ARCH §6 (`ConsentToken`), §8.3 (dry run, R-16)
  - Files: `web/src/core/consent.ts` (token = sha256 + sessionId + issuedAt, 10-minute TTL), `web/src/ui/components/ConsentSheet.tsx`, `web/src/ai/preflight.ts` + `preflight.test.ts` (ARCH §8.3).
  - Do:
    - Render the **exact** outgoing blob (≤1536 px) with its size and the sha256 prefix.
    - The preflight dry run (D-30, ARCH §8.3): the gate's §7.1 step 5 image checks on the exact outgoing bytes (faces at 0.3; OCR of the ≤1536 px JPEG at its own size), shown as a checklist. New detections are auto-masked and the image rebuilt, up to 2 rounds, before Send enables (`copy.consent.autoMasked`, AC-134). Items the user un-ticked show `copy.consent.unmasked` and Send stays enabled; the gate then blocks the send (AC-135, AC-041). Any other failure after 2 rounds disables Send, names the item and offers "Fix in editor" (AC-133).
    - The tier line comes from `data_tier`. The grounding checkbox appears only when it is allowed.
    - Cancel sends nothing.
    - Re-attack shows a diff line.
    - Judge autoplay uses a 3 s countdown.
  - Verify: in T-085 the sent hash equals the consented hash; a unit test covers the tier line.

- [ ] T-070 [CLAUDE] Adversary pass A: grounded, streamed, display-only (S3). Due: Mon Nov 23 · Deps: T-039, T-062, T-065, T-069 · AC: AC-141, AC-143, AC-148 (as rewritten by R-12)
  - Read: SPEC SCR-08, SR-10, SR-11; ARCH §10.5; API-NOTES §1.13
  - Files: `web/src/ai/jobs.ts` (`adversaryA`), `web/src/ui/components/{AdversaryNotes,GroundingChip,SourceList}.tsx`, `web/src/ui/markdown.ts` (escaped; no raw HTML).
  - Do:
    - Use `generateContentStream` through the gate.
    - Capture `groundingMetadata` **from the chunks**.
    - Put `renderedContent` **unmodified** in a shadow root, at the same width as the notes. It stays visible whenever the notes are visible.
    - Show `webSearchQueries` and the sources. Links open directly (`rel="noopener noreferrer"`), with no click tracking.
    - A `DECLINED:` prefix → `copy.adv.notesDeclined`.
    - **Memory only.** Never parsed, cached, persisted or passed on: in TypeScript, the referee, benchmark and Atlas inputs accept only `AdversaryResult`.
  - Verify: AC-143 sentinel-string test; IndexedDB and localStorage dumps contain no note text.

- [ ] T-071 [CLAUDE] Adversary pass B: structured (S3). Due: Mon Nov 23 · Deps: T-062, T-065, T-069 · AC: AC-140, AC-142, AC-147 (**Built Nov 21, not ticked:** D-137, D-138. `ai/jobs/adversaryB.ts` (states ok / no_location_signal / declined / blocked / truncated / unreadable / error, plus notSent; per-session cache, AC-147 unit), 11 tests through the real gate on fakes over the `advB.v1.*` fixtures; DEV fake adversary `dev/fakeAdversary.ts` (`?fakeAdv=`). **Open:** AC-140 (pass A, T-070); a real pass B run once the T-031 quota allows.)
  - Read: SPEC SCR-08, §17.5; ARCH §10.6 (`parseAdvB`); API-NOTES §1.10, §6.8
  - Files: `web/src/ai/jobs.ts` (`adversaryB`), `web/src/ai/parse.ts` (`parseAdvB`), tests. **`parseAdvB` and its fixture tests already exist (written for T-031, D-72)**; T-071 adds the job, the states and the echo scan.
  - Do:
    - A and B start within 200 ms of each other. The referee starts as soon as B resolves.
    - Validation:
      - unique IDs;
      - dangling `clue_ids` dropped;
      - box corners clamped and swapped, zero-area boxes dropped;
      - lat/lng range checks;
      - `radius_km` floored at 0.1;
      - echo scan for vault strings.
    - States: ok, no_location_signal, declined, blocked, truncated (`MAX_TOKENS` doesn't throw), unreadable, error.
    - Per-session cache keyed by sha256 + model + promptVersion.
  - Verify: Vitest over all `shared/prompts/fixtures/advB.*` (ok, declined, no_signal, bad_ids, swapped_boxes, truncated).

- [ ] T-072 [CLAUDE] Errors and refusals. Due: Mon Nov 23 · Deps: T-070, T-071 · AC: AC-144, AC-145, AC-303
  - Read: ARCH §17; SPEC §11 (`copy.adv.*`, `copy.err.*`), D-18
  - Files: `web/src/ai/errors.ts` (`classifyError`).
  - Do:
    - A decline or block → "Adversary declined; on-device findings only". **Never retried; no re-attack for that photo.**
    - Transient errors (429, network, 5xx, truncation) may be retried with the **identical** request.
  - Verify: a unit test asserts there is no retry path from a decline or block; mocked `audit_status:'declined'` and `AIError('response-error')` both leave the UI with no retry button.

- [ ] T-073 [CLAUDE] Evidence boxes and the attacker's best guess. Due: Mon Nov 23 · Deps: T-059, T-071 · AC: AC-146
  - Read: SPEC SCR-08 ("Attacker's best guess")
  - Do: draw pass-B boxes mapped to the working image, labelled with ID, type and severity. The best guess shows level, area label and confidence only, **never** lat/lng, radius, a map or an address.
  - Verify: grep `web/src/ui` for any rendering of `lat`, `lng` or `radius`; review.

- [x] T-074 [CLAUDE] Nano referee (S0, nanoRef.v1). **Ticked Nov 21 (D-154):** real Gemini Nano in the user's Chrome 157 via `#/dev/nano`: the City General example matched `employer` exact ON_DEVICE (+rules) through the gate, 15.6 s cold / 6.1 s warm; nanoRef.v1 released. Due: Mon Nov 23 · Deps: T-062, T-065, T-071 · AC: AC-161, AC-162 (**Built Nov 21, not ticked:** D-145, F-216, F-218, F-219. `ai/jobs/referee.ts` (S0 through the gate, aliases c1../v1.., strict `parseRefereeText`, union with the rules), `ui/check/runSend.runReferee`, Check waits for it and VerdictCard's referee row shows ON-DEVICE + latency or RULES-ONLY with an honest note; `receiptParams` k. Tests: `ai/jobs/referee.test.ts` (17: AC-161 drops, AC-162 no coordinate-like number, gate paths ON_DEVICE / no Nano / Nano off / invalid ×2 / timeout / in_cloud BREACH / skipped). Browser (Nano 'unavailable', synthetic image, `?fakeAdv=ok`): RULES-ONLY + copy.ref.rules, verdict reached, no googleapis request; with the DEV fake Nano (D-147) `?fakeNano=ok` ON-DEVICE 0.7 s, `?fakeNano=invalid` RULES-ONLY + `ui.verdict.refFallback`. **Open:** the manual check with real Nano (LUCAS / City General) in the user's Chrome (T-007), then release nanoRef.v1 (D-62); Judge Mode still runs it as S0 (S4 PREFER_ON_DEVICE not wired); add `ai/jobs/referee.ts` to check-boundaries R9 (scripts owner).)
  - Read: SPEC SCR-09, D-09; ARCH §10.9
  - Files: `web/src/ai/jobs.ts` (`referee`).
  - Do:
    - CLAIMS = pass-B inferences plus hypotheses as `area`.
    - VAULT = labels, including pin items as **kind + label** (no coordinates; any pin whose label is empty or generic, e.g. "Home", is skipped: D-36, AC-167).
    - Runtime enums; at most 12 claims and 20 labels.
    - Union with the deterministic referee, keeping the stronger strength.
  - Verify: unit test that the prompt contains no coordinate-like numbers; manual check with Nano on the LUCAS/City General example.

- [x] T-075 [CLAUDE] Deterministic "rules-only referee". Due: Mon Nov 23 · Deps: T-058 · AC: AC-165
  - **Done Nov 21 (D-90):** `web/src/core/referee.ts` (`rulesStrength`, `rulesReferee`, `refereeClaims`, `refereeVaultItems`, `mergeMatches`, `RULES_REFEREE_COPY_ID = 'copy.ref.rules'`) over `tier0/fuzzy.ts` only; `shared/testvectors/referee.json` (64 cases: 50 strength incl. the 4 AC-165 rows, AC-167 and the D-94, D-101, D-102, F-121 and F-124 rows, 4 rulesReferee, 8 mergeMatches, 2 refereeVaultItems) drives `core/referee.test.ts` (89 tests). 19 + 8 (D-94) + 16 (review round: readings, D-101, D-102, digits, generic labels, test gaps) mutations in scratch copies, all killed. `npm --prefix web run check` green.
  - Read: SPEC §10.3, §17.4
  - Files: `web/src/core/referee.ts`, tests, `shared/testvectors/referee.json`.
  - Do: the SPEC §10.3 rules with §17.4 kind compatibility and synonym classes. Label it `copy.ref.rules`.
  - Verify (from `shared/testvectors/referee.json`): "hospital staff lanyard logo" vs work "City General Hospital" → `likely`; "City General" → `exact`; "crest of St Mary's" vs "St. Mary's Primary" → `exact`; "a primary school in the north of the city" vs "St. Mary's Primary" → `possible` (AC-165).

- [x] T-076 [CLAUDE] Verdict engine. Due: Mon Nov 23 · Deps: T-052, T-074, T-075 · AC: AC-160, AC-164, AC-166, AC-194
  - **Done Nov 21 (D-115, D-116):** `web/src/core/verdict.ts` (`buildVerdict`, `compareVerdicts`, `comparisonHeadline`, `lineText`, `headlineCopyId`, `bestGuessCopy`, `notLinkedCopy`, `worstPinBand`, `highCount`, `scrubNumbers`) built against the referee RESULT (`RefereeMatch[]` from `rulesReferee` or `mergeMatches`), so T-074 plugs in by passing `mergeMatches(device, rules).matches`. `shared/testvectors/verdict.json` (44 build + 11 compare cases: every band, strength, empty vault, refused, echo, caught, Risk reduced true and false) drives `core/verdict.test.ts` (70 tests, incl. 400-case seeded properties: no coordinate/radius/decimal in the Verdict, matches-order invariance, monotonic level, §10.6 oracle). 54 mutations in scratch copies: 53 killed; the survivor (dropping the PARTIAL guard in `compareVerdicts`) is equivalent in JS (no rank for PARTIAL) and kept for the Swift port. `npm --prefix web run check` green. **Review round (D-127, D-128, F-181..F-184):** `scrubAttackerText` for attacker text, `Verdict.noPins` with the attacker-precision fallback, stricter "Risk reduced", PARTIAL/LOW compare headers, AC-164 and SR-07 amended; verdict.json now 52 build + 17 compare + 24 scrub cases (108 tests); 34 of 36 round-2 mutants killed (the 2 left are equivalent: the PARTIAL guard and an unreachable header fallback). Open: `core/verdict.ts` should join check-boundaries R9's scope (scripts owner).
  - Read: SPEC §10 (all), §17.3
  - Files: `web/src/core/verdict.ts`, tests, `shared/testvectors/verdict.json`.
  - Do: implement SPEC §10.1–10.6 **verbatim**:
    - levels RED/AMBER/LOW/PARTIAL;
    - caught lines teal;
    - echo lines;
    - empty-vault behaviour;
    - "Risk reduced" rule.
  - Verify: table-driven fixtures for every band, strength, empty vault, refused, echo and caught case. No output matches `/\bsafe\b/i`; no line contains metres; every line carries a confidence.

- [ ] T-077 [CLAUDE] Verdict card UI. Due: Mon Nov 23 · Deps: T-076 · AC: AC-062, AC-163, AC-164
  - Read: SPEC SCR-09
  - Do:
    - The SCR-09 layout.
    - GREEN only for "Risk reduced".
    - The "Why?" expansion.
    - `copy.verdict.neverLearns` always visible.
    - The "Show vault labels" setting.
    - Icons and text, never colour alone.
  - Verify: screenshots in light and dark mode.
  - **Status (Nov 21): built and unit-tested; browser-checked in the DEV gallery `#/dev/verdicts` (desktop and 375 px, dark and light, no horizontal scroll, the disclosure and the labels toggle work, no console errors). Not wired into Check yet: the Check builder mounts `<VerdictCard verdict vault comparison? referee? actions? onFocusClues? onExplain? headingLevel?>` (D-124, D-125).** Files: `web/src/ui/components/VerdictCard.tsx`, `web/src/ui/components/verdict/{model.ts,tones.ts,VerdictLineItem.tsx,VerdictIcon.tsx}`, `web/src/ui/verdictCard.test.ts` (every `verdict.json` build and compare case, labels on and off: no "safe", no measured distance, no pin coordinate, headline as a heading, neverLearns, a live region, no green outside "Risk reduced", confidence per AC-164, PARTIAL never reads as LOW, LOW says "This isn't a guarantee.", Add places on noVault/noPins; 12 mutants killed, F-180; fix round D-134 / F-198..F-200: the band confidence always shows, a level-terms "Risk reduced" header is the heading, `announce` prop, 9 more mutants killed), `web/src/dev/verdicts/VerdictGallery.tsx`, App.tsx (one DEV-only lazy route), en.json (`ui.verdict.*`, `ui.unit.seconds`). **Open:** the Settings toggle "Show vault labels in results" belongs to T-092 (P1; the card already reads the pref); clue highlighting on the image and the SCR-16 Explain button come through the callbacks once those screens exist.

- [ ] T-078 [CLAUDE] Fix planner (S0, nanoFix.v1) with a deterministic fallback. Due: Tue Nov 24 · Deps: T-074, T-076 · AC: AC-190, AC-191, AC-197 (**Rules plan built Nov 21, not ticked:** D-142, F-214. `core/fixPlan.ts` `deterministicFix` (AC-191 unit, AC-197 automated half), `ui/check/FixPanel.tsx` plan card + checklist. **Open:** nanoFix.v1 + `validateDevicePlan` (AC-190), the Nano manual check, the OCR-union refinement.)
  - Read: SPEC SCR-11, §10.4; ARCH §10.10, §12.5
  - Files: `web/src/ai/jobs.ts` (`fixPlan`), `web/src/core/fixPlanner.ts` (`deterministicFix`, `validateDevicePlan`).
  - Do:
    - `mask` is an enum of the removable IDs; skip the call when there are none.
    - Inputs carry no private labels.
    - Scan the explanation for vault strings; a hit → use the template.
    - An empty plan while red lines exist → use the rules plan.
  - Verify: unit tests for the fallback and validation; manual check with Nano.

- [ ] T-079 [CLAUDE] Apply the fix. Due: Tue Nov 24 · Deps: T-059, T-078 · AC: AC-192, AC-196 (**Built Nov 21, not ticked:** D-142. Solid fix masks + optional crop on a copy (cumulative across rounds); re-OCR = the re-attack's consent dry run on the exact bytes (AC-198 path). **Open:** the fill animation; a unit test on a synthetic image through the dry run.)
  - Read: SPEC SCR-11 ("Apply")
  - Do:
    - Solid fills animate in (15% padding; OCR union where it overlaps).
    - Optional crop (40% cap → `copy.fix.cropTooMuch`).
    - Re-encode.
    - **Re-OCR: 0 vault hits**, else add masks (at most twice), then warn.
    - Non-removable cited clues → `copy.fix.unremovable`.
  - Verify: unit test on a synthetic image; manual check.

- [ ] T-080 [CLAUDE] Re-attack and before/after compare. Due: Tue Nov 24 · Deps: T-071, T-079 · AC: AC-193, AC-194, AC-195 (**Built Nov 21, not ticked:** D-143, D-144, F-211..F-213. Dry run → new consent → gate → pass B r2.. → `buildVerdict('after_fix')` → `compareVerdicts` → VerdictCard compare header, Before → After rows, receipt line; `max_fix_rounds` (AC-195 unit); no re-attack after any refusal. AC-194 unit (reduced vs still). Browser: DEV fake (`?fakeAdv=ok`, image-aware), synthetic image, RED → Risk reduced → LOW. **Open:** AC-193 with real numbers (one real re-attack), pass A on re-attack, Judge countdown.)
  - Read: SPEC SCR-11, §10.6, D-18
  - Do:
    - Compact consent → pass B (+ pass A if the "Notes on re-attack" setting is on) → referee → compare per **SPEC §10.6**.
    - `copy.verdict.reduced` or `copy.verdict.still`, plus the receipt line.
    - `max_fix_rounds` = 3 (`copy.fix.maxRounds`).
    - Re-attack is hidden after a decline.
    - **Nothing is written to the Leak Atlas here** (D-11, R-02).
  - Verify: an end-to-end run on the test photo; unit test of the compare rule.

- [ ] T-081 [CLAUDE] Export and share card. Due: Tue Nov 24 · Deps: T-079 · AC: AC-260, AC-262 (P1: AC-261, AC-263)
  - Read: SPEC SCR-12
  - Files: `web/src/core/shareCard.ts`, export in `web/src/core/pipeline.ts`.
  - Do:
    - Export check before download: no APP1/APP13, no GPS, 0 faces, 0 vault OCR hits → `copy.export.check`. On failure, the gate toast shows and nothing is exported.
    - Filename `strangers-eyes-<6 random>.jpg`.
    - Web Share where available.
    - (P1, D-33) Share card: 1080×1350 PNG built **only** from the allowlisted strings. Never the photo, place names or coordinates.
  - Verify: segment check on the downloaded file; (P1) AC-261 injection test.

- [ ] T-082 [CLAUDE] Leak-demo path and the gate toast. Due: Tue Nov 24 · Deps: T-062, T-068 · AC: AC-041, AC-180, AC-181 · PARTIAL Nov 23 (D-163): gate block seen in a real browser (BLOCKED VAULT_TEXT_IN_IMAGE, 0 bytes, Attack-panel alert); the separate toast component is not built.
  - Read: SPEC SCR-07 (dry run), SCR-10, §7.3; ARCH §5.5, §8.3
  - Files: `web/src/ui/components/GateToast.tsx`.
  - Do:
    - Untick the name-tag mask → re-check → the consent sheet's dry run shows `copy.consent.unmasked` with Send still enabled (AC-135) → Send → the gate OCR finds "LUCAS" → `copy.gate.blockedVaultText`.
    - The toast has `role=alert` and stays at least 6 s.
    - (P1, D-33) "Show me" selects the item.
    - The ledger records BLOCKED and **no request leaves**.
  - Verify: covered in T-085 (zero network requests during the attempt).

- [ ] T-083 [CLAUDE] S2 explainer, "Why does this reveal location?". Due: Tue Nov 24 · Deps: T-062, T-065, T-071 · AC: AC-024, AC-235, AC-236, AC-237, AC-238
  - **Release (D-62):** once this run is recorded in PROGRESS, set `"released": true` for explain.v1 in `shared/prompts/manifest.json` and run `node scripts/check-prompts.mjs`. From then on those files are frozen; any change needs a `*.v2.*` file.
  - Read: SPEC SCR-16, D-15; ARCH §8.2 (step 3 and RECLASSIFY), §9.1 (`ExplainInput`), §10.11, AD-32 (with R-24, R-26)
  - Do:
    - `explain(ctx, input)` takes `ExplainInput` (ARCH §9.1): either `{kind:'prescreen', type, region}` (**never** device-read text) or `{kind:'adversary', clue, region}` (pass-B type, `evidence` and `reveals`).
    - Mode `PREFER_ON_DEVICE`; the badge comes from `inferenceSource`.
    - A vault-scan hit (a vault string or pin coordinates) → reclassify to S0 (Nano or template): never sent, never a block toast, HUD `RECLASSIFIED S2→S0` (D-15).
    - Offline without Nano → the template, RULES_ONLY.
    - Cached per clue.
  - Verify: the AC-235 payload test; manual check in Chrome with Nano (on_device) and in a guest profile (in_cloud).

- [ ] T-084 [CLAUDE] Offline queue. Due: Tue Nov 24 · Deps: T-069, T-071 · AC: AC-004, AC-251 (P1: AC-252)
  - Read: SPEC SCR-18, D-17; ARCH §5.3
  - Files: `web/src/core/offlineQueue.ts`, `web/src/ui/components/QueuedChecks.tsx`.
  - Do:
    - **P0, in memory** (SPEC SCR-18): keep the session (master, masks, redacted JPEG) with status `waiting`; show `copy.queue.queued` + `copy.queue.keepOpen` and the Home "Waiting for connection (n)" list; write a QUEUED Ledger entry with no bytes.
    - **P1 (D-33):** persistence as sealed `PendingCheck` records holding the redacted image only, never vault data; at most 5 (`copy.queue.full`); purge items older than 7 days at startup.
    - On the `online` event, a banner → consent sheet with a **fresh** token. **Never auto-send.**
    - Each queued check writes one Ledger entry with route `QUEUED` and no bytes (SPEC SCR-18; ARCH §5.3, §8.6), shown as a `QUEUED` HUD line.
  - Verify: in DevTools set the network offline → flow → chip → reconnect → banner within 5 s → nothing is sent until "Send this image". (Persistence is P1 per D-33: build it last, or skip it if time is short.)

- [ ] T-085 [CLAUDE] Web end-to-end run and **network egress audit**. **The Tue Nov 24 gate.** Due: Tue Nov 24 · Deps: T-050–T-084, T-089 · AC: AC-002, AC-003, AC-041, AC-130, AC-211, AC-300 · PARTIAL Nov 23 (D-163): on the gate block no request left the browser (resource timing); full egress audit not run.
  - Read: SPEC §12 (AC-300), SCR-13; ARCH §20.2
  - Files: `web/tests/e2e/egress-audit.mjs`, run with `npm --prefix web run audit:egress` (ARCH §3.1, §3.3, §20.2; Playwright, `channel:'chrome'`, `[UNVERIFIED]` on this Mac; fallback: the rescued CDP harness).
  - Do:
    1. Seed a canary vault: child "LUCAS", employer "City General", a home pin at canary coordinates.
    2. Run the own-photo flow, the leak attempt and the re-attack.
    3. Capture every request to `*.googleapis.com` and the Firebase domains.
  - Assertions:
    - no canary string (any case) and no pin-coordinate digits (3+ decimals) in any URL or body;
    - every `inlineData` image is a JPEG with no APP1/APP13, and its sha256 ≠ the original's;
    - AI request count = cloud ledger entries;
    - zero requests during the leak attempt.
  - Then repeat the flow by hand in the user's Chrome with Nano: pre-screen, referee and fix show **ON-DEVICE** (AC-003).
  - Verify: the audit exits 0; red→green is demonstrated; PROGRESS says "GATE Nov 24: PASS". On failure, apply cuts 1–4 at once.

- [ ] T-086 [CLAUDE] Thin vertical slice. Due: Sun Nov 22 · Deps: T-024, T-030, T-031, T-051, T-052, T-053, T-054, T-059 (**Check → Verdict built Nov 21 in the product screen instead of `dev/slice` (D-139):** import → pre-screen → consent → gate → pass B → rules referee → VerdictCard, checked in the browser with the DEV fake adversary only. **Open:** steps 5–6 (fix, re-attack: T-078–T-080) and the real-photo evidence "slice green" (needs one real pass B).) · EVIDENCE Nov 23 (D-161): real pass B through the app for the 3 Judge samples.
  - Read: ARCH §5.1; SPEC §10
  - Files: `web/src/dev/slice/Slice.tsx`; `web/src/ai/egressGate.ts` v0 (S3 path only: EXIF check, consent hash, a ledger line), so the boundary check passes.
  - Do: on a plain page:
    1. import → `reencodeClean`;
    2. minimal gate;
    3. pass B → `parseAdvB` (minimal);
    4. minimal rules referee → bands → verdict text;
    5. deterministic fix → masks;
    6. pass B again.
  - The full gate and the screens are then built around this skeleton.
  - Verify: one real spike photo goes from red, through the fix, to a band moved outward. Evidence in PROGRESS: "slice green".

- [x] T-087 [CLAUDE] Strings file and explain fallbacks. Due: Sun Nov 22 · Deps: T-023 · AC: AC-304 (done Nov 20 (same workflows): en.json now holds every SPEC §11 copy ID verbatim (134 rows, was 11) plus `ui.*`; `t()` resolves `copy.explain.template.*` from explain-fallback.v1.json (18 types) and is pinned to `prompts.explainFallbacks()`. Tests: SPEC fidelity, every copy ID used in web/src and ios/StrangersEyes exists (Swift against en.json only), AC-304 "safe" scan with the `copy.about.notGuarantee` allowlist. The 7 `copy.judge.coach.*` texts are authored to SPEC's brief and await a human copy review (D-77).)
  - Read: SPEC §11 (all)
  - Files: `shared/strings/en.json` (every SPEC §11 copy ID, including `copy.judge.coach.*`; the `copy.explain.template.*` texts are **not** in it, they live in `shared/prompts/explain-fallback.v1.json`, SPEC §11), `web/src/core/strings.ts` loader (`t(copyId, params)` over `@strings/en.json` plus the explain-fallback templates, ARCH §3.1), `shared/prompts/explain-fallback.v1.json` (18 clue types).
  - Verify:
    - a test that every copy ID used in code exists in `shared/strings/en.json`, or, for `copy.explain.template.*`, in `explain-fallback.v1.json`;
    - the "safe" scan with the `copy.about.notGuarantee` allowlist (AC-304).

- [ ] T-088 [CLAUDE] Cross-platform test vectors. Due: Mon Nov 23 · Deps: T-052, T-058, T-059, T-062, T-075, T-076 · AC: AC-352
  - Read: ARCH §20.1, §20.4
  - Files: `shared/testvectors/{bands,box2d,crop,fuzzy,referee,verdict,gate-matrix,rc}.json` (the ARCH §3 list).
  - Do: one JSON file per pure module, consumed by Vitest now and by XCTest in T-121 (the parity contract).
  - Verify: each file is loaded by at least one Vitest test (grep the test files).

- [ ] T-089 [CLAUDE] Fake transport and Playwright smoke and offline specs. Due: Mon Nov 23 (grows until Nov 24) · Deps: T-062 · AC: AC-250 (and the fake-transport version of AC-240)
  - **From T-053:** cover AC-100 end to end: file, drag and paste each start a session, and a pasted URL, or an image dragged from a web page, shows `copy.import.noUrl` and starts nothing. Also AC-103: a 35 MB file → tooLarge; a non-image → unsupported.
  - Read: ARCH §20.2
  - Files:
    - `web/src/ai/fakeTransport.ts` (only when `MODE==='e2e'` and `VITE_FAKE_AI=1`; it replaces only the final invoke step inside the gate; **throws in production**);
    - `web/.env.e2e`;
    - `web/playwright.config.ts`;
    - `web/tests/e2e/{smoke,offline}.spec.ts`.
  - Pin `@playwright/test` after `npm view`.
  - Do: the smoke spec covers Judge Mode red → blocked leak → fix → "Risk reduced", plus "no request to `firebasevertexai.googleapis.com`".
  - Verify: `npm run test:e2e` green. Once green, it joins the §2 session-end check for web tasks.

- [ ] T-090 [CLAUDE] Repo checks wired into `npm run check`. Due: Mon Nov 23 · Deps: T-024 · AC: AC-244 (EXIF part), AC-351, AC-364 (pre-check) (scripts done Nov 21; **open: the SR-15 log-scrub test**, a web/src Vitest file outside this builder's scope. Built: `scripts/check-images.mjs` (rules I1–I5, C1, B1, P1, S1–S3, L1 over every file `git add` could commit; 78 planted violations + clean fixture) with the reviewed value allowlist `scripts/check-images.allow.json` (D-106); `check-prompts.mjs` gained `--root` and an 8-case planted self-test; both wired into `check`. Hardening (D-107): R19 is an allowlist parser that fails closed, escapes are decoded before every line rule and R22, new R24 (no `\u`/`\x` outside literals); check-boundaries now proves 149 planted violations. Mutation check: 15 + 32 + 5 mutants, all killed except one equivalent (an unlisted prompt file still fails on its hash). `npm --prefix web run check` green.)
  - **From the T-053/T-054 round-7 verifier (minor; nothing in the repo uses these forms today):**
    - **R19 becomes an allowlist.** A glob pattern must start with `./` or `../` and resolve wholly inside `web/src`, or be `@prompts|@strings|@vectors/` with no `..` segment.
      - Check `node_modules` before the alias exemption.
      - Reject any backslash in a glob call, and any options object with a backslash or a computed key.
      - Fail closed on any `import.meta.glob` that the parser did not consume. Today `GLOB_RE` misses a `]` inside an array pattern, a call split across lines, and nested generics.
      - Treat `@root` as outside `web/src`.
    - **Escapes defeat the name-based rules** (R1 `generateContent`, R9 `console`, R21 `indexedDB`): flag `\u`/`\x` escapes outside string literals, and decode string-literal escapes before applying the name rules.
  - **Already done in T-024:** `scripts/check-prompts.mjs` (hashes, the draft/released lock, the git-HEAD release guard, RC `prompt_versions`) runs in `check`. What remains here is `check-images.mjs` and wiring it in.
  - Read: ARCH §3 (`scripts/`); SPEC SR-15
  - Files:
    - `scripts/check-prompts.mjs`: manifest sha256 matches; released files immutable; every RC-selectable version exists.
    - `scripts/check-images.mjs` (ARCH §3: one script for image metadata **and** coordinates; there is no `check-coords.mjs`): committed JPEGs have no APP1/APP13; PNGs have no eXIf/tEXt/iTXt; tracked text files have no coordinate-like decimals (regex `-?[0-9]{1,3}\.[0-9]{4,}`), with an allowlist of `web/public/samples/*.json` (after T-018c), `shared/testvectors/*.json` (synthetic only) and lock files.
    - A log-scrub test: in a production build, the console never prints vault strings (SR-15).
  - Verify: each script fails on a planted violation fixture and passes on the repo.

- [ ] T-091 [CLAUDE] Welcome and 18+ screen (SCR-01). Due: Mon Nov 23 · Deps: T-050, T-087 · AC: AC-070, AC-071
  - Read: SPEC SCR-01
  - Files: `web/src/ui/screens/Welcome.tsx`.
  - Do: the age and "own photos only" checkbox. Stored in localStorage inside try/catch. `?judge=1` / `#/judge` go SCR-01 → SCR-02 → Judge in ≤3 clicks.
  - Verify: an e2e test: Continue is disabled until the box is ticked; a reload skips the screen.
  - **Status (Nov 21): built, unit-tested; tick after the orchestrator's browser check.** `web/src/ui/screens/Welcome.tsx`; the gate in `web/src/ui/gate.ts` (unsupported → Welcome → app; DEV pages skip it) wired in `App.tsx`; the acknowledgement in `web/src/core/localPrefs.ts` (`se.ack18.v1`, try/catch, session fallback). A Welcome finished on `#/judge` (incl. `?judge=1`) mounts AppShell with SCR-02 open, and SCR-02's "Try Judge Mode" (a link to the route already shown) now closes the sheet: tick, Continue, Try Judge Mode = 3 clicks (D-103, F-129). Tests: `ui/welcomeSettings.test.ts` (Continue disabled until ticked, Enter cannot bypass, App gate per route, judge flow and flag-before-ack ordering), `ui/systemScreens.test.ts`, `ui/gate.test.ts`, `core/localPrefs.test.ts` (a reload keeps the acknowledgement). No Playwright harness exists yet, so the e2e is unit-level. **Open (browser):** fresh profile `/?judge=1` → tick → Continue → SCR-02 → Try Judge Mode lands on Judge with focus in main; reload skips Welcome; same in a private window where storage may throw.

- [ ] T-092 [CLAUDE] Settings and About (SCR-20). Due: Tue Nov 24 · Deps: T-050, T-087 · AC: AC-275, AC-276, AC-277 (P1: AC-006)
  - Read: SPEC SCR-20, D-24, §12
  - Files: `web/src/ui/screens/Settings.tsx` (`#/settings`) and `web/src/ui/screens/About.tsx` (`#/about`), per SPEC §8.1 and ARCH §3.1.
  - Do:
    - All settings persisted with try/catch.
    - "Use Gemini Nano" toggle (AC-277).
    - P0 toggles are only Use Gemini Nano, Burn vault and Clear history; all other toggles are P1 (D-33).
    - (P1, D-33) Developer panel (`?debug=1`): "Simulate: no Nano / offline", downgrade only; RC values and source; force fetch.
    - About:
      - `copy.about.notGuarantee`, `howItWorks`;
      - a "What leaves this device" table;
      - `copy.about.reattackDisclosure`;
      - third parties, including reCAPTCHA Enterprise, and the libraries;
      - prior art;
      - the 18+ notice;
      - `copy.about.support`;
      - the repo link.
  - Verify: the app works when storage throws; About shows every listed item.
  - **Status (Nov 21): P0 built, unit-tested; two Data actions wait for their stores; tick after the browser check.** Settings: On-device AI (state from the shared capability view via `ui/shellContext.ts`, the Download button in state (b), "Show what runs where" opens SCR-02), "Use Gemini Nano when available" (`se.settings.v1`; feeds AppShell's `useCapabilities({ nanoEnabled })`, and `localPrefs.prefs.nanoEnabled()` is ready for the gate), Usage `Cloud checks today: {used}/{cap}` + `copy.settings.capNote`, Data › Burn vault (the shared `BurnVaultDialog`), Developer (P1, `?debug=1` or while a simulation is on): "Simulate: no Nano / offline", downgrade only, feeding the capability view and the connectivity chip. When storage refuses a write, the change applies for the visit and a status line says so (AC-275). About: every SPEC item (version + commit, notGuarantee, howItWorks as a list, the S0–S4 "What leaves this device" table + other traffic, reattackDisclosure, Gemini, reCAPTCHA Enterprise, libraries + licences + notice links, prior art E11/E12, 18+, support, repo link) (D-104). **Open:** Clear history and Copy ledger receipt render only once `SettingsDeps.clearHistory` / `.receipt` are supplied: no store function exists yet (ledger T-063, sessions T-096); Developer "RC values and source; force fetch" waits for `cfg()` (T-102); AC-277's gate half (S0/S1 RULES-ONLY, S2/S4 `IN_CLOUD (Nano off)`) is T-062's unit test over `prefs.nanoEnabled()` (which also folds in "Simulate: no Nano", D-117). **Review follow-ups (D-117, F-153..F-158):** the service worker no longer answers About's `*.md` licence links with the app (check-dist asserts the denylist); About shows the build commit (Vite `define`); "Simulate: no Nano" shows real state (c); focus never falls to `<body>`; Toggle names exclude the hint. **Open (browser, AC-276 manual):** About shows each item; toggling Nano off flips the chip to Rules-only and survives a reload.

- [x] T-093 [CLAUDE] Tripwire, interlock, device queue. Due: Sat Nov 21 · Deps: T-023 · AC: AC-022 (tripwire side), AC-047 (done Nov 20: `web/src/ai/interlock.ts` (`createInterlock` + singleton; one FIFO queue for both kinds; one pre-fetch cloud permit at a time, D-75) and `deviceQueue.ts` (single-flight FIFO), with `interlock.test.ts` (20 tests, incl. real-tripwire integration: an S3 fetch can never take an S4 permit) and `deviceQueue.test.ts` (3); new tripwire tests for other hosts, systemInstruction vault text, JUDGE_VAULT re-registration and NO_SCANNER on a fresh module. Every Verify item covered; a reviewer mutation check (5 mutations) failed 2–6 tests each. check: 195 tests green.)
  - Read: ARCH §8.5 (tripwire and interlock), §15.1 (boot order), §4.2, AD-05, AD-18, AD-19, AD-31 (with R-14, R-17, R-28); API-NOTES §1.17
  - Files:
    - `web/src/ai/tripwire.ts` (from `research/day1-artifacts/arch/src/tripwire.ts`, then apply ARCH §8.5's R-14 change: `Permit = { id, scanText }` with `scanText: false` for S4, and a `VaultScanner` that scans only the **active** vault);
    - `web/src/ai/tripwire-install.ts` (from `research/day1-artifacts/arch/src/tripwire-install.ts`, in the same folder), a side-effect module that is the **first import** in `main.tsx`. ES imports are hoisted, so a statement in the body runs too late. The vault scanner is registered later via `setVaultScanner()` from boot's `vaultScan.init()` (ARCH §15.1). Until then any AI-host request throws `NO_SCANNER` (fail closed); boot registers an empty-vault scanner when there is no vault.
    - `web/src/ai/interlock.ts`, `web/src/ai/deviceQueue.ts`.
  - Verify: tests that:
    - `data:` URLs pass;
    - other hosts pass;
    - the AI host without a permit throws;
    - the AI host while the local lock is held throws;
    - `extractTextParts` ignores `inlineData`;
    - vault text in `systemInstruction` throws;
    - an S4 permit (`scanText: false`) is not text-scanned; with JUDGE_VAULT active, the scanner matches fake-vault terms only (R-14);
    - interlock ordering holds;
    - before `setVaultScanner()` runs, an AI-host request throws `NO_SCANNER` (fail closed);
    - `main.tsx`'s first import is `./ai/tripwire-install` (Vitest, and `check-boundaries.mjs` per ARCH §4.2).

- [ ] T-094 [CLAUDE] System banners and the unsupported-browser page (SCR-22). Due: Tue Nov 24 (RC-driven banners finished in T-103) · Deps: T-050, T-087 · AC: AC-290
  - Read: SPEC SCR-22
  - Do: kill switch, daily cap, App Check failure, 429, network loss, auth failure, tripwire, and a full-page `copy.err.browser` when there is no WebAssembly or IndexedDB.
  - Verify: each condition, produced by a mock, shows its copy and leaves the on-device features working.
  - **Status (Nov 21): component and static states built, unit-tested; RC feed in T-103.** `web/src/ui/components/SystemBanner.tsx` (under the header; tripwire red in a `role="alert"` region, the rest polite; per-call events dismissible), `web/src/ui/components/UnsupportedPage.tsx` (full page, `copy.err.browser`, shown before Welcome), `web/src/ui/systemStatus.ts` (pure `selectBanners`/`cloudOffReason`/`cloudRowOf`/`chipInputsOf` + the store `systemStatus`: `set({ killSwitch, dailyCap, appCheckFailed, authFailed })` for RC/boot, `markTripwire()` one-way, `report('rateLimit' | 'network' | 'cloudFailed')`, `dismiss`; a 429 banner clears itself after 60 s; events are cleared when the cloud goes off; the daily-cap banner and chip clear at local midnight, D-117). One cloud-off banner by precedence (tripwire > kill switch > App Check > sign-in > daily cap); the same reason drives the header chip and SCR-02 row 3 (D-105). Tests: `ui/systemStatus.test.ts`, `ui/systemScreens.test.ts` (each condition's copy; AppShell still renders the screen under a banner). **Open:** T-103 calls `systemStatus.set(...)` from `cfg()`/`onConfigUpdate` and counts runs with `localPrefs.caps.increment()`; T-101 sets `appCheckFailed`/`authFailed`; T-062 calls `markTripwire()` on BREACH and `report(...)` after retries. **Open (browser):** in the dev server's console, `(await import('/src/ui/systemStatus.ts')).systemStatus.set({ killSwitch: true })` (likewise `report('network')`, `markTripwire()`) shows the banner, "Cloud paused" and SCR-02's paused line while Vault and Tier-0 keep working; a page without WebAssembly shows only the unsupported page.

- [ ] T-096 [CLAUDE] (P1) Recent checks on this device. Due: Wed Nov 25 · Deps: T-054, T-080 · AC: AC-075
  - Read: SPEC SCR-03; R-12
  - Do: up to 10 entries, encrypted, holding a masked thumbnail and the verdict colour. Reopen without any AI call. Purge after 7 days. **No pass-A text stored.**
  - Verify: AC-075 e2e. (Cut order step 3.)

- [ ] T-097 [CLAUDE] Hero and Judge scene pre-test (pass B ×10 each). Due: Mon Nov 23 · Deps: T-010, T-086
  - Read: SPEC SCR-17 ("expected outcomes")
  - Do:
    1. Run pass B 10× on the hero photo and on each Judge scene, with the fake vault.
    2. Record the share of runs that are red before and green after the deterministic fix.
    3. Pick the most stable photo for filming.
    4. Write only **observed** outcomes into `samples/manifest.json` `expected` (T-105).
  - Verify: the stability table is in PROGRESS. If no scene is stable, adjust props or framing with the user before T-105.

---

## M3: Firebase hardening and Hosting (Wed Nov 25). GATE: hosted URL live

- [ ] T-100 [CLAUDE] App Check for production. Due: Wed Nov 25 · Deps: T-011, T-030 · AC: AC-292, AC-365
  - Read: API-NOTES §2.2; RUNBOOK §1.7a, §8.1
  - Do:
    - Commit the site key in `web/src/firebase/config.ts`.
    - The debug token is set only under `import.meta.env.DEV`.
    - `isTokenAutoRefreshEnabled: true`.
    - Preview-channel domains are not covered unless added to the key.
  - Verify:
    - The token value is not in the build: `T=$(sed -n 's/^VITE_APPCHECK_DEBUG_TOKEN=//p' web/.env.development.local); [ -n "$T" ] && grep -rF "$T" web/dist && echo LEAK || echo clean`.
    - The env-var name is not in the build: `grep -rlF "VITE_APPCHECK_DEBUG_TOKEN" web/dist && echo LEAK || echo clean` (AC-365). Never grep `FIREBASE_APPCHECK_DEBUG_TOKEN`: the App Check SDK itself contains it.
    - Hosted requests carry `X-Firebase-AppCheck`.
    - The user glances at the App Check metrics.

- [ ] T-101 [CLAUDE] Anonymous Auth and the init-order test. Due: Wed Nov 25 · Deps: T-025, T-030 · AC: AC-291
  - **From T-061 review (D-87, D-100):** once Firebase boot exists in the app shell, wire AppShell to the SDK download path: `useCapabilities({ online, initializeDeviceModel: (io) => initializeDeviceModelFor(ai, io) })` (`ai/models.ts`, D-91). SPEC AC-073 literally says the button calls `initializeDeviceModel`; today it is the interim direct `create()` path. Keep the user activation:
    - preload the chunk holding `firebase/init` + `ai/models` when the capability panel opens (or at boot), so the click → `create()` path has no slow await;
    - the factory runs synchronously inside the click;
    - the SDK's single `availability()` await must fit inside Chrome's transient activation (about 5 s; API-NOTES §1.6).
    - Re-run AC-073 by hand afterwards.
  - Read: API-NOTES §2.3; ARCH §15.1; RUNBOOK §1.8, §4.5
  - Do:
    - `firebase.json` `"auth":{"providers":{"anonymous":true}}`, then `$FB deploy --only auth` (`[UNVERIFIED]` U-17). Fallback: the user enables Anonymous in the console.
    - The gate awaits `ensureAuth()` before every cloud call (D-110; `authReady` is only the first attempt).
  - Verify: a fresh profile gets a UID and the first cloud call has no 401; the AC-291 unit test asserts the init module order.
  - **Progress (Claude, Nov 21; D-109, D-110; F-136, F-138). Code and unit tests done; deploy and browser checks open, so not ticked.**
    - Review follow-ups (D-118; F-159..F-162): `ensureAuth()` bounded at 5 s (SPEC §7.1) and cleared on timeout; boot steps 3 and 4 run concurrently; check-dist fails on a debug-flag write; the docs say `ensureAuth()` everywhere.
    - Done: `web/src/boot.ts` (ARCH §15.1 steps 3–5, each wait bounded, render never blocked, Judge route → `vaultScan.init({ judge: true })`) wired from `main.tsx` (R15 kept); `firebase/init.ts` sets the DEV flag after `initializeApp` (AC-291's literal order) and adds `ensureAuth()` (retryable sign-in; `authReady = ensureAuth()`). `firebase.json` already has `"auth":{"providers":{"anonymous":true}}`.
    - Evidence: `firebase/init.test.ts` (8 tests: exact order `initializeApp → debugFlag → initializeAppCheck → getAuth → signInAnonymously → getAI`, the `?appcheck-debug=off` and hot-reload orders, App Check/AI arguments, the DEV-only flag write, sign-in retry and sharing) and `boot.test.ts` (19 tests: tripwire → init → Remote Config at import; steps 3–5 in order; failed or hung vault still renders; Judge-route table). 13 init/boot mutations killed. `npm run build`: no `VITE_APPCHECK_DEBUG_TOKEN` and no `appcheck-debug` string in `dist` (the token value check needs the secret file, so it was not run).
    - Open: (1) DONE Nov 21: `$FB deploy --only auth` enabled Anonymous (U-17, D-126); (2) a fresh profile gets a UID and the first cloud call has no 401 (real browser, after T-062); (3) T-062's gate must `await ensureAuth()` before every cloud call and map `null` to `CLOUD_AUTH` (AC-291 second sentence); (4) the T-061 note above is NOT wired (AppShell is the UI builder's): `firebase/init` and `ai/models` are now in the main chunk, so no preload is needed. In `ui/components/AppShell.tsx` add `import { ai } from '../../firebase/init';`, `import { initializeDeviceModelFor } from '../../ai/models';`, `import type { NanoIo } from '../../ai/capabilities';`, a module-level `const initDeviceModel = (io: NanoIo) => initializeDeviceModelFor(ai, io);`, and add `initializeDeviceModel: initDeviceModel` to the options of AppShell's `useCapabilities({ online, nanoEnabled: … })` call; any Node test that imports AppShell must then mock `firebase/init`. Re-run AC-073 by hand.

- [ ] T-102 [CLAUDE] Remote Config as code. Due: Wed Nov 25 · Deps: T-060, T-025, T-022 (R-01) · AC: AC-293, AC-294, AC-295
  - **From T-060 (D-85):** `remoteconfig.template.json` already exists (copied verbatim from ARCH §13.3 on Nov 21) and iOS bundles it. Do not re-create it. `core/routing.ts` already parses `routing_policy`: `cfg()` calls `effectivePolicy(getValue('routing_policy').asString())` and puts its `warning` in `policyWarning`. `routing.test.ts` already checks every key, type, default and clamp against ARCH §13.2, and `rc.json` already has the `routingPolicy` section. AC-295 (the web and iOS defaults deep-equal the template) is still T-102's.
  - Read: ARCH §13 (the **only** key list); SPEC §16 (behaviour); API-NOTES §2.4
  - Files: `remoteconfig.template.json` (it already exists, made by T-060 (D-85). Edit the file first, then mirror the edit in ARCH §13.2 and §13.3: `routing.test.ts` pins every key, type, default and clamp to the §13.2 table and the whole file byte for byte to the §13.3 block. Never seed anything from `research/day1-artifacts/`), `shared/testvectors/rc.json` (add one section per key next to T-060's `routingPolicy`, D-96), `web/src/firebase/remoteConfig.ts` (imports `@root/remoteconfig.template.json` and derives `RC_DEFAULTS`, ARCH §13.4). There is no defaults generator and no `scripts/rc-defaults.mjs` (AD-28): web imports the template through `@root` and iOS bundles the same template.
  - Do:
    - Typed getters with validation and clamping; an invalid value → the default plus a HUD note.
    - `ensureInitialized` before any read.
    - `fetchTimeoutMillis` 8000; `minimumFetchIntervalMillis` 60 s in dev, 1 h in prod.
    - `onConfigUpdate` for `kill_switch`.
    - **No temperature and no enum keys.**
    - Deploy with `$FB deploy --only remoteconfig` (`[UNVERIFIED]`); fallback: console import.
  - Verify:
    - Vitest checks that template defaults, code defaults and the routing default are deep-equal;
    - flipping `kill_switch` in the console shows "paused" within seconds;
    - an offline start uses the cached values without delay.
  - **Progress (Claude, Nov 21; D-108, D-109; F-137, F-139, F-140). Code and unit tests done; deploy and console/e2e checks open, so not ticked.**
    - Review follow-ups (D-118; F-159..F-162): a real-time activation publishes even after a failed `ensureInitialized`; a refused `grounding_enabled` reads as `false`; defaults deep-frozen; production fetch interval tested.
    - Done: `web/src/firebase/rcParse.ts` (pure: `RC_DEFAULTS` from the template, `parseKey`/`parseConfig` → deep-frozen `AppConfig` with `warnings`; every template default validated at import) and `firebase/remoteConfig.ts` (8 s fetch timeout, 60 s / 1 h interval, `ensureInitialized` ≤ 2 s before any read, background `fetchAndActivate`, one `onConfigUpdate` → `activate`, `cfg()` + `subscribeConfig()`). `shared/testvectors/rc.json`: one section per key (512 cases), `keyConventions`, `effectiveConfig`. Template + ARCH §13.2/§13.3: D-98's nano clamp; §13.2 Validation note.
    - Evidence: `rcParse.test.ts` (561 tests: AC-295 defaults = template = ARCH §13.2, routing default = DEFAULT_POLICY; every vector (AC-293); parity sweeps against `clampFuzzyThreshold`, `clampFaceMinConfidence`, `clampPadRatio`, `clampMaxPx`, `clampOcrMaxPx`; a broken template default throws), `remoteConfig.test.ts` (12 tests, mocked SDK: offline, hung-IndexedDB and hanging-fetch starts resolve at once on cached values or defaults (AC-294); real-time kill switch; `source`; identity). 29 rcParse/remoteConfig mutations killed. `npm run check` and `npm run build` green.
    - Open: (1) DONE Nov 21: `$FB deploy --only remoteconfig` published v1 = template, then v2 with the D-70 free-tier override (U-17, D-126) (the template's nano description changed; values did not); (2) "flipping `kill_switch` in the console shows paused within seconds" needs the UI banner (`subscribeConfig` + `cfg().killSwitch` → `copy.err.killSwitch`, UI builder) and whether the Remote Config Realtime API is enabled (API-NOTES §2.4, UNVERIFIED); (3) AC-294 e2e offline start in a real browser; (4) AC-295 for iOS (the iOS RemoteConfigService must parse the same template and pass `rc.json`); (5) a HUD copy ID for `cfg().warnings` (strings/HUD owner; F-140).

- [ ] T-103 [CLAUDE] Kill switch, caps, grounding and data-tier enforcement. Due: Wed Nov 25 · Deps: T-062, T-102 · AC: AC-290
  - Read: SPEC SCR-22, D-07; R-13, R-23
  - Do:
    - The gate enforces `kill_switch`, `daily_adversary_cap` (local counter; an A+B pair = 1 run), `grounding_enabled` and `data_tier` (`free` forces grounding off).
    - Judge Mode shares the counter and falls back to CACHED (R-13).
    - RUNBOOK documents the 1,500 grounded requests/day project default and the 30 RPM per-user quota.
  - Verify: unit tests; a manual flip.

- [ ] T-104 [CLAUDE] (P1) Firestore Leak Atlas. Due: Wed Nov 25 · Deps: T-017, T-020, T-071 · AC: AC-280, AC-281, AC-282, AC-283, AC-284
  - Read: SPEC SCR-21, D-11; ARCH §14 (with R-02); RUNBOOK §4.3
  - Files:
    - `firestore.rules` (copy ARCH §14.3, which equals `research/day1-artifacts/firestore-tests/firestore.rules`: no `outcomes` block, 20/20; whitelist = the 18 CLUE_TYPES; week IDs `^[0-9]{4}-W[0-9]{2}$`);
    - `firestore.indexes.json`;
    - `tests/rules/{firebase.json,atlas.rules.test.mjs}` (ported from `research/day1-artifacts/firestore-tests/test.mjs`, **keeping** its rejection cases for `outcomes`, `band_moved` and `fix_moved_band`, `projectId` `demo-strangers-eyes`, port 8181);
    - `web/src/firebase/atlas.ts` (lazy, `initializeFirestore` once with an HMR guard);
    - `web/src/ui/components/AtlasCard.tsx` (Home card) and `web/src/ui/screens/Atlas.tsx` (`#/atlas`, P1), per ARCH §3.1.
  - Do:
    - Opt-in is **OFF** by default, with a one-time `copy.atlas.optIn` prompt.
    - After the first successful pass B (r1) only (re-attacks write nothing), one `void setDoc(doc(db,'atlas',weekId,'clues',type), {n: increment(1)}, {merge:true})` per **distinct pass-B clue type**. Never awaited.
    - Read the top 5; `copy.atlas.notEnough` when the total is under 20.
    - A static test asserts that `atlas.ts` imports nothing from `core/verdict`, `core/referee`, `core/geo` or `vault/` (AC-282).
  - Verify: `npm run test:rules` (root) all PASS; `$FB deploy --only firestore`; the egress audit shows only type names. (Cut order step 4.)

- [ ] T-105 [CLAUDE] Judge Mode. Due: Wed Nov 25 · Deps: T-010, T-018c, T-065, T-085, T-097 · AC: AC-023, AC-048, AC-071, AC-240, AC-241, AC-242, AC-243, AC-244, AC-245, AC-246 (**Built Nov 21 with SYNTHETIC PLACEHOLDER samples, not ticked:** D-150..D-152, F-223..F-226. `scripts/make-judge-samples.mjs` (no deps: drawn scenes + a baseline JPEG encoder) writes `web/public/samples/` (3 × `judge-0N.jpg` 1600×1200, `.nano768.jpg`, `.advB.v1.json`, `.advB.fixed.v1.json`, `manifest.json` with `placeholder: true`, `expected: null`); `vault/judgeVault.ts`; `ui/screens/Judge.tsx` (picker, autoplay per RC, Run all), `ui/components/JudgeModeBanner.tsx`; `ui/judge/{judgeFlow,judgeRun}.ts`, `JudgeCoach.tsx`; Check runs a sample through its own flow (`judge` prop); preScreen and referee as S4 (`ai/jobs/*` `judge` input), pass B S3 tagged with the sample; CACHED replay on unavailability. Tests: `ui/judge/judgeMode.test.ts` (18, incl. the real gate on fakes: S4 referee/pre-screen IN_CLOUD, a vault copy or a non-sample image BLOCKED NOT_SYNTHETIC, the real vault loader never called). Browser (`?fakeAdv=ok`, no Nano): sample 1 red → green in about 50 s by autoplay, HUD shows `Nano pre-screen [S4] IN CLOUD` and `referee [S4] IN CLOUD`; `?fakeAdv=network`: CACHED SAMPLE badge + copy.judge.cached, red → green on the recordings; Exit → Home, real index restored. **Open:** the T-010 photos and recorded pass B (RUNBOOK §6.2a); `expected` after T-097; state (e) "Use recorded result" after a refusal (only the cloud-off and unavailable paths are built); vaultTextMatch/fixPlan/explain S4 (not built as jobs); the T-085 audit re-run; Safari.)
  - Read: SPEC SCR-17, D-12, D-37, §7.1 step 5, AC-048; ARCH §5.4, §8.4 (active index), AD-09, AD-17 (with R-13, R-14)
  - Files:
    - `web/public/samples/manifest.json` (id, title, image, sha256, fake vault, cachedAdvB file, recordedAt, model, observed `expected`);
    - `web/public/samples/judge-0{1,2,3}.jpg` (EXIF-stripped, people-free, 0 faces, no readable real logos);
    - `web/public/samples/judge-0{1,2,3}.advB.v1.json` (recorded **ungrounded** pass B);
    - `web/src/vault/judgeVault.ts`;
    - `web/src/ui/screens/Judge.tsx`, `ui/components/JudgeModeBanner.tsx`.
  - Do:
    - **Fake vault (in memory only):** `home_pin` "Home", `work_pin` "City General Hospital", `child_name` "Lucas", `plate` "SE 1234". Pins are rounded to 3 decimals. The real vault is never loaded.
    - Entering Judge Mode calls `vaultScan.useJudge(JUDGE_VAULT)`: the real vault's items and terms are dropped from memory, and Tier-0, preflight, the gate and the tripwire scan only JUDGE_VAULT. Booting via `#/judge` or `?judge=1` never unseals the real vault. Exit calls `vaultScan.useReal()` (ARCH AD-17, §8.4, §15.1).
    - preScreen, vaultTextMatch, referee, fixPlan and explain run as **S4** via `judgeJsonModel`/`explainModel`, so they show IN_CLOUD honestly without Nano.
    - Pass A and pass B run live as S3.
    - CACHED fallback when RC `judge_cached_fallback` is true and the live adversary is unavailable (offline, kill switch, daily cap, App Check or auth failure, HTTP 400, or 429 after its retries per ARCH §17), with `copy.judge.cached`; pass A then shows `copy.judge.notesNeedLive`. Judge Mode shares the daily-cap counter with real checks; there is no separate Judge counter (R-13, AC-246).
    - Autoplay (RC `judge_autoplay_default`), coach marks `copy.judge.coach.*`, "Run all", `?judge=1`.
    - Exit discards everything.
  - Verify:
    - In a no-Nano Chrome guest profile and in Safari, each S4 job shows IN_CLOUD, and each sample goes red→green in ≤90 s (goal 60 s).
    - Offline, the CACHED path is badged (AC-243).
    - The T-085 audit re-run includes Judge Mode with real-vault canaries absent.
    - `check-images` passes on the samples.

- [ ] T-106 [CLAUDE] Offline PWA. Due: Wed Nov 25 · Deps: T-023, T-084 · AC: AC-004, AC-250, AC-294
  - Read: ARCH §16; API-NOTES §5.5
  - Do: VitePWA configured as in ARCH §16:
    - `generateSW`, `autoUpdate`, `injectRegister:false`;
    - explicit `globPatterns` including js, css, html, wasm, tflite, gz, jpg and json, **not** webmanifest;
    - `maximumFileSizeToCacheInBytes` 32 MiB;
    - `navigateFallback` with denylist `/__/`;
    - `runtimeCaching: []` (never cache googleapis);
    - icons; an update toast; `copy.cap.offlineReady`.
  - Verify: `npm run build && npx vite preview` → SW active → DevTools offline → reload → vault, import, Tier-0, pre-screen, fix and export work and the adversary is queued.

- [ ] T-107 [CLAUDE] Hosting deploy. Due: Wed Nov 25 · Deps: T-100–T-106 · AC: AC-360
  - Read: RUNBOOK §4.2, §4.6; ARCH §15.4
  - Do:
    1. Use `firebase.json` per ARCH §15.4, with no emulators block.
    2. Build, then `$FB deploy --only hosting,firestore,auth,remoteconfig`.
    3. Record `https://<PROJECT_ID>.web.app` in PROGRESS Key values and RUNBOOK.
  - Verify: the RUNBOOK §4.6 checklist; `curl -sI` headers and MIME types (U-20, U-21); the site loads.

- [ ] T-108 [CLAUDE] Hosted verification matrix. Due: Wed Nov 25 · Deps: T-107 · AC: AC-002, AC-240, AC-292, AC-360
  - Read: RUNBOOK §4.6
  - Do: test each browser:
    - Chrome with Nano on this Mac;
    - a Chrome guest profile;
    - Safari on macOS;
    - Firefox;
    - iOS Safari in SIM (quit Chrome first).

    In each: Judge Mode red→green; the own-photo loop with an empty vault; an honest capability panel; App Check passes; anonymous auth works; no blocking console errors. The MediaPipe XNNPACK `console.error` is expected.
  - Verify: the results table in RUNBOOK §4.6.

- [ ] T-109 [CLAUDE] Prompt API on the hosted origin. Due: Wed Nov 25 · Deps: T-038 or T-107 · AC: AC-073 (hosted)
  - Read: API-NOTES §1.16 (origin-trial row); RUNBOOK §3.4
  - Do: check whether `LanguageModel` exists on the hosted origin in Chrome 157 (U-10). If it doesn't, the USER registers an origin trial (T-112), and Claude adds the `<meta http-equiv="origin-trial">` tag or an `Origin-Trial` header and redeploys. Otherwise the Nano beats are filmed on localhost.
  - Verify: on the hosted site, the capability panel shows Nano available on this Mac (or the decision is logged).

- [ ] T-110 [CLAUDE] Security and privacy pass. Due: Wed Nov 25 · Deps: T-107 · AC: AC-300, AC-364
  - Read: RUNBOOK §7.2
  - Do:
    1. **Secrets:** grep the actual token values (from `web/.env.development.local` and `ios/.appcheck-debug-token`) in the tree, in `git log -p` and in `web/dist`. Run `git grep -nE "BEGIN [A-Z ]*PRIVATE KEY|client_secret|refresh_token"`. `AIza…` may only appear in the Firebase configs.
    2. **Coordinates:** `node scripts/check-images.mjs` (its coordinate scan; ARCH §3).
    3. CSP is optional; if added, use the API-NOTES §2.8 allow-list and **never** COEP `require-corp`.
    4. Re-run the egress audit against the **hosted** URL.
  - Verify: scans clean; the audit passes on the hosted URL.

- [ ] T-111 [USER] AI Logic hardening. Due: Wed Nov 25 · Deps: T-101
  - Read: RUNBOOK §1.11
  - Do:
    1. Cloud console → APIs & Services → Firebase AI Logic API → Manage → Quotas & System Limits → "Generate content requests" per user → **30 RPM** (R-23).
    2. Optional: AI Logic → Settings → "Enforce authenticated-users mode". Turn it on only after Claude confirms that anonymous sign-in precedes all calls.
  - Verify: Claude confirms cloud calls still work on the hosted URL.

- [ ] T-112 [USER] (only if T-109 needs it) Prompt API origin-trial token. Due: Thu Nov 26
  - Do: register the hosted origin for the trial at developer.chrome.com/origintrials and paste the token to Claude. The token is public: it is served in page headers.

---

## M4: iOS app (Wed Nov 25 evening to Sat Nov 28)

- **Plan of record = iOS MVP:**
  - Keychain vault;
  - Vision Tier-0;
  - FM pre-screen (I3);
  - FM vault-text match, referee and rules fix (I4);
  - consent;
  - cloud pass B;
  - verdict and save;
  - minimal gate, ledger and HUD;
  - the HybridModel explainer (I5).
- iOS pass A, re-attack, share sheet and sample scenes are **stretch** (T-133–T-135).
- Follow the T-033 path (default Path A, exactly 12.19.3).
- Quit Chrome while FM runs. Run `xcrun simctl shutdown all` when done.

- [ ] T-120 [CLAUDE] iOS foundation. Due: Thu Nov 26 · Deps: T-027, T-033, T-102 **Partly done Nov 21:** no anonymous Auth, RC fetch or debug screen yet.
  - Read: ARCH §19.1–19.2; API-NOTES §3.3, §3.12
  - Do:
    - Configure: App Check debug factory → `FirebaseApp.configure()`.
    - Anonymous auth.
    - Bundle `../remoteconfig.template.json` as a resource. `RemoteConfigService` parses it into `[String: NSObject]` and passes that to `setDefaults` (ARCH §13.4, §19.2, AD-28; no generator script; validated with `shared/testvectors/rc.json`).
    - `PromptLibrary` reading the bundled `shared/prompts`; strings from `shared/strings/en.json`.
    - A debug screen showing UID, RC values and FM availability.
  - Verify: build (Appendix B); runs in SIM; the debug screen shows the values. AC-320.

- [ ] T-121 [CLAUDE] Swift core ports and XCTest parity. Due: Thu Nov 26 (start Wed Nov 25 evening as filler) · Deps: T-027, T-088 · AC: AC-352 (parity) **Partly done Nov 21:** parity for bands/fuzzy/referee/verdict vectors; no rc/box2d/crop parity.
  - **From T-053/T-054 (D-78, D-79):** label and alias lengths count `unicodeScalars.count` (web: code points, no normalisation). `termsOf` drops every empty or generic string, label or alias, of any kind; the new fuzzy.json termsOf case pins it. Port `sniff`'s limits and caps if iOS imports files (30,000,000 bytes, 40 MP, 1024 segments/chunks/boxes).
  - Read: ARCH §19.1, §20.4
  - Files: `ios/StrangersEyes/Core/{Types,Geo,Boxes,FuzzyMatcher,RulesReferee,VerdictBuilder,FixPlanner,Parsers}.swift`, `ios/StrangersEyesTests/*`. The tests consume `shared/testvectors/*.json` and `shared/prompts/fixtures/*`.
  - Verify: `xcodebuild … test` is green on the same vectors as Vitest.

- [ ] T-122 [CLAUDE] iOS vault (I1). Due: Thu Nov 26 · Deps: T-121 · AC: AC-321 **Partly done Nov 21:** file with complete file protection (not Keychain, F-239); no CoreLocation.
  - Read: SPEC §14.2 (I1); API-NOTES §4.4–4.5
  - Do:
    - Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, never synchronizable.
    - Files use `.completeFileProtection`.
    - `LocationPinner` (`CLServiceSession` + `CLLocationUpdate.liveUpdates`, accuracy < 100 m), never geocoded.
    - Manual coordinates; limits of 20 items and 40 characters.
    - Burn vault; the lock badge.
  - Verify: `xcrun simctl location <SIM> set <public-place lat>,<lng>`; add and burn items by hand; XCTest round trip on an app target.

- [ ] T-123 [CLAUDE] iOS Tier-0 (I2) and Core Image masks. Due: Thu Nov 26 · Deps: T-121 · AC: AC-322, AC-323 **Mostly done Nov 21:** Vision faces + OCR, solid masks, pixels-only JPEG; U-26 unchecked.
  - Read: API-NOTES §4.1–4.3, §4.6; ARCH §19.3
  - Do:
    - `PhotosPicker` import. Record whether the picked data keeps GPS EXIF (U-26).
    - Bake orientation via `CGImageSourceCreateThumbnailAtIndex` + `kCGImageSourceCreateThumbnailWithTransform` (`[UNVERIFIED]` U-27), then re-encode to JPEG. **Never** use `CGImageDestinationCopyImageSource`.
    - Vision: `RecognizeTextRequest` with word boxes; `DetectFaceRectanglesRequest` with the **CPU compute device under `targetEnvironment(simulator)`**; `ClassifyImageRequest`.
    - Solid masks, 15% padding.
  - Verify: XCTest on JPEG, HEIC and PNG fixtures with GPS generated in-test (stripped and upright); a manual face check with a local, uncommitted image.

- [x] T-124 [CLAUDE] Swift EgressGate, Ledger and HUD. Due: Fri Nov 27 · Deps: T-122, T-123 · AC: AC-325, AC-329 **Ticked Nov 21 (D-155):** Swift EgressGate/Ledger/HUD; 14 GateTests (class floors, fail-closed RULES-ONLY for every FM unavailable state, no availability cache, S3 blocks on consent hash, metadata, face, vault text, prompt vault/pin/extra text); HUD shows S0 ON-DEVICE with latency.
  - Read: ARCH §19.3; API-NOTES §3.5–3.6; SPEC §14.6
  - Files: `ios/StrangersEyes/AI/EgressGate.swift`, `Ledger/Ledger.swift`, `UI/RouterHUD.swift`. Extend `scripts/check-boundaries.mjs` to `ios/`: `respond(`, `streamResponse(` and `generateContent` may appear only in `EgressGate.swift` and in the DEBUG-only `ios/StrangersEyes/Dev/**` (ARCH §4.2).
  - Do:
    - S0/S1 run **only** on an on-device-only session, after checking `isAvailable`; otherwise RULES_ONLY.
    - `HybridModel` only for S2 public text.
    - S3 re-check: faces 0, vault OCR hits 0, no metadata.
    - Prompt scan; a ledger entry; the route from `rawResponse.modelVersion` (U-24).
  - Verify: gate XCTests with protocol-mocked sessions; the boundary check exits 0.

- [x] T-125 [CLAUDE] FM pre-screen (I3, S1). Due: Fri Nov 27 · Deps: T-124 · AC: AC-324 **Ticked Nov 24 (D-167):** `ios/StrangersEyes/AI/PrescreenJob.swift` (prompt `shared/prompts/fmPre.v1.user.md`): text only (Vision OCR lines with a 3x3 region + top 10 scene labels, never the image), vault-matched words left out, through the Swift EgressGate as S1 with a fresh availability check and a fail-closed RULES-ONLY fallback; types/regions/line ids validated in code. Evidence: `StrangersEyesTests/JudgeTests.swift` pre-screen tests (lines and vault words left out, validation, rules fallback when unavailable, ON-DEVICE Ledger entry when available) in the 32 XCTests passing Nov 24; the Nov 24 Simulator UI run showed the pre-screen ON-DEVICE (Apple FM). Budget held by caps (40 lines × 80 chars, 10 labels) inside the gate's 4,096-token check.
  - Read: SPEC §14.2 (I3); ARCH §10.12; API-NOTES §3.9
  - Do:
    - `@Generable` `FMPreScreen`. **No tool calls.**
    - Input: Vision text lines and the top 10 scene labels. **No vault labels** (S1; vault matching is code plus T-126).
    - `tokenCount(for:)` < 4,096. Don't trust `contextSize`, which reads 0 in SIM.
    - A new session per call; progress UI (`copy.ios.slow`); RULES_ONLY fallback.
  - Verify: a SIM run on the hero photo; the HUD shows ON-DEVICE (Apple FM).

- [ ] T-126 [CLAUDE] FM vault-text match, referee and fix (I4, S0). Due: Fri Nov 27 · Deps: T-125 · AC: AC-324, AC-325, AC-326 **Partly done Nov 21:** FM referee (I4a) done with the D-157 cap; FM vault-text match and fix planner not done. **Nov 24 (D-167, D-168):** the FM referee also runs in iOS Judge Mode against each sample's in-memory fake vault; device-only place-guess × pin links are now dropped (D-168, web parity, shared vectors); 32 XCTests pass. I3b/I4b still not built.
  - Read: SPEC §14.2 (I4); ARCH §10.8–10.10, §10.1, §19.3–19.4 (static Generable, IDs validated in code)
  - Do:
    - Shared prompts with `@Generable` results. Unknown IDs are dropped in code; avoid dynamic schemas.
    - Deterministic fallbacks.
    - Priorities (SPEC §14.2, D-32): the FM referee (I4a) and the rules fix are P0. The FM vault-text match (I3b) and the FM fix planner (I4b) are P1; build them after T-127/T-128.
    - With 20 vault items and 12 claims, stay under 4,096 tokens; trim by priority if over.
  - Verify: SIM run on LUCAS/City General gives the expected matches; the AC-326 token test.

- [ ] T-127 [CLAUDE] iOS consent and cloud pass B (C2). Due: Fri Nov 27 · Deps: T-124 · AC: AC-327, AC-332 **Partly done Nov 21:** consent sheet + gate done; real Gemini path compiled, never run (quota). **Nov 24 (D-167):** iOS Judge Mode replays the recorded Gemini pass-B answers THROUGH the Swift EgressGate (route CACHED, 0 bytes, Ledger entry), the after-fix recording only when the masks hide its `fixMasked` clues; a run-generation guard drops stale results. The live iPhone Gemini call and the App Check debug-token registration are still not done (U-25 still unverified; registering the token is a user step, see `ios/NOTES.md`).
  - Read: API-NOTES §3.7; ARCH §19.3
  - Do:
    - A consent sheet showing the exact image.
    - `CloudAdversary` pass B via the classic `generativeModel` with `GenerationConfig(responseMIMEType:"application/json", responseSchema:)`, built by `SchemaFromJSON` from `advB.v1.schema.json`. The 12.19.3 labels are `[UNVERIFIED]` (U-30); compile early.
    - Send our own `InlineDataPart` JPEG.
    - Codable parse plus the same validation as the web.
    - The refusal UX.
    - Never show coordinates or a map.
  - Verify: SIM run with the debug token; boxes drawn correctly; the ledger shows 0 faces and 0 vault items.

- [x] T-128 [CLAUDE] iOS verdict, rules fix and apply. Due: Sat Nov 28 · Deps: T-126, T-127 · AC: AC-329 **Ticked Nov 21 (D-155):** verdict, rules fix (4 masks) and re-attack in the Simulator; "Risk reduced"; Ledger 0 · 0.
  - Read: SPEC §10, §14.3
  - Do: the verdict view (same contract as the web); apply the fix; no "safe" anywhere; a ledger receipt. Save to Photos is P2 (SPEC I6b, D-32) and lives in T-134.
  - Verify: a full loop in SIM; the Ledger counters read 0 · 0 (AC-329).

- [ ] T-129 [CLAUDE] (P1, SPEC D-32) HybridModel explainer (I5, S2). Due: Sat Nov 28 · Deps: T-124 · AC: AC-328
  - Read: SPEC §14.2 (I5); API-NOTES §3.4–3.5
  - Do: `HybridModel(primary: FirebaseAI.SystemLanguageModel.default, secondary: ai.geminiModel(name: explain_cloud_model))`. Public clue text only, and the gate scans it first. The badge comes from `modelVersion`. Demonstrate the fallback (Apple Intelligence off, or an oversized public prompt).
  - Verify: one ON-DEVICE run and one fallback run are captured. (Cut order step 5.)

- [x] T-130 [CLAUDE] iOS capability state and safety copy. Due: Sat Nov 28 · Deps: T-120 **Ticked Nov 21 (D-155):** all 4 FM states mapped to copy (only `.available` observed in the Simulator).
  - Read: SPEC §14.3–14.4
  - Do: an availability switch (`.available`, `.modelNotReady`, `.appleIntelligenceNotEnabled`, `.deviceNotEligible`) with `copy.ios.*`, the 18+ notice and the data notice.
  - Verify: screenshot review.

- [x] T-131 [CLAUDE] iOS end-to-end run and screenshots. Due: Sat Nov 28 · Deps: T-128 · AC: AC-320, AC-324, AC-329, AC-362 **Ticked Nov 21 (D-155):** Simulator run with the DEBUG fake attacker and real Apple FM referee; screenshots in `ios/screenshots/` (not yet copied to docs/img/).
  - Read: RUNBOOK §2.7–2.8
  - Do: the full loop in SIM with Chrome quit; screenshots to `docs/img/ios-*.png`; a latency log in PROGRESS; then `xcrun simctl shutdown all`.
  - Verify: screenshots committed; PROGRESS entry written.

- [ ] T-132 [USER] (optional) TestFlight decision. Due: Wed Nov 25
  - Only possible with a paid Apple Developer Program account and review started by Nov 26. **Cut by default:** judges see iOS in the video and the build instructions.

- [ ] T-133 [CLAUDE] (iOS stretch) Pass A grounded notes in a `WKWebView` (renderedContent unmodified, same width, non-persistent data store, plus sources). AC: AC-331 (P2).
- [ ] T-134 [CLAUDE] (iOS stretch, P2) iOS re-attack, then **Save to Photos** (add-only permission) or the share sheet, after an export check (no GPS, 0 faces, 0 vault OCR). AC: AC-330 (P2).
- [ ] T-135 [CLAUDE] (iOS stretch) iOS sample scenes with the fake vault (S4 via HybridModel, R-31) for filming.

---

## M5: Benchmark (Thu Nov 26 to Sat Nov 28)

- [ ] T-150 [CLAUDE] Label the clues in the 25 photos. Due: Thu Nov 26 · Deps: T-009
  - **Superseded (D-174, Nov 26):** the held-out Commons benchmark replaced the 25 builder-owned photos; no clue labels, so no M4 recall.
  - Read: SPEC §15.3 (as fixed by R-20)
  - Do: view each photo in `PRIV/bench/` and fill the `clues` column of `PRIV/bench/truth.csv` as `type@region;…` (CLUE_TYPES, 3×3 regions). No boxes are needed. Optionally the user spot-checks 5.
  - Verify: 25 rows with clues; every type is in CLUE_TYPES.

- [ ] T-151 [CLAUDE] Benchmark harness. Due: Thu Nov 26 · Deps: T-085, T-150 · AC: AC-351, AC-352
  - **Done differently (D-174):** `run-spike.mjs --set bench` (through the app's own redaction, not the Egress Gate) + `benchmark/bench/score-bench.mjs` → `benchmark/bench/results.{md,json}`.
  - Read: SPEC §15 (with R-20); ARCH §21; RUNBOOK §5.3–5.6
  - Files: `web/src/dev/bench/{BenchPage.tsx,runner.ts,metrics.ts}` (DEV only, `#/dev/bench`, **through the gate**), `benchmark/aggregate.mjs` + its unit test (pure, tested on synthetic raw data), `benchmark/README.md` (method, metric definitions, privacy rules).
  - Do, per photo, k = 3:
    1. Tier-0.
    2. Pass B r1 ×3.
    3. Deterministic rules fix, with a bench vault whose `home_pin` = the truth.
    4. Pass B r2 ×3.
    5. **No pass A.**
  - Metrics per SPEC §15.3. Raw output → `PRIV/raw/bench-YYYY-MM-DD.json` (SPEC §15.4). Aggregates → `benchmark/results/summary.{json,md}`: counts, percentages and percentiles only.
  - Verify: a dry run on 2 photos produces both files; `node scripts/check-images.mjs` passes (its coordinate scan covers `benchmark/`).

- [ ] T-152 [CLAUDE] Run the benchmark. Due: Fri Nov 27 · Deps: T-151, T-003 · AC: AC-350
  - **Done (D-174, Nov 26):** 40 photos, k = 3, all run, fix ×3; raw in PRIV/raw; 0 refusals in 126 runs.
  - Read: RUNBOOK §5.5
  - Do:
    - Run **unattended** in headless Chrome with the fixed debug token via the CDP harness. Pass B needs no Nano. Run overnight Thu Nov 26 → Fri Nov 27, with the Simulator shut down.
    - About 150 pass-B calls, paced at least 3 s apart (≤20 RPM, under the 30 RPM per-user quota). Put the cost estimate in PROGRESS.
    - Rerun transient errors once. **Never rerun a decline.**
    - Separately, run the Nano pre-screen recall on the 25 photos in the user's Chrome (Simulator off).
    - Pin and record the model ID, prompt versions, thinking level and date.
  - Verify: results for all 25 photos; the run log is in PROGRESS.

- [ ] T-153 [CLAUDE] Publish the results. Due: Sat Nov 28 · Deps: T-152 · AC: AC-353
  - **Done in the work tree (D-174):** README §7, DEVPOST, About copy and video use the benchmark; awaiting the user's commit.
  - Read: SPEC §15.4
  - Do:
    - Commit the summary.
    - README "Measured results": within 1 km and 5 km before and after (majority-of-3 and any-of-3), refusal rate, recall per reader, p50/p95 per tier, on-device vs cloud calls per session.
    - The numbers for the video card.
    - The honest method and limits: n=25, k=3, pass B only, public places in one region, builder-owned photos without people; cite arXiv 2502.11163.
    - **Publish whatever the numbers turn out to be.**
  - Verify: the README numbers match `summary.json`.

- [ ] T-154 [CLAUDE] (optional) iOS latency mini-benchmark: FM pre-screen and referee on 5 photos in SIM → `benchmark/results/ios-latency.md`. Due: Sat Nov 28 · Deps: T-131

- [ ] T-155 [USER] Gate-test prop photos. Due: Wed Nov 25 20:00
  - Read: SPEC §15.1 (gate test set)
  - Do: 10 people-free photos of props printed with fictional names, plates and house numbers that match a test vault Claude provides, placed in `PRIV/gate-test/`.

- [ ] T-156 [CLAUDE] (P1) Gate-test harness (M6 vault-text catch rate). Due: Sat Nov 28 · Deps: T-155, T-151 · AC: AC-354
  - Do: measure the share of prop vault strings masked before the consent sheet. Target 100%; list and fix any misses.

---

## M6: Polish, README and Devpost text (Fri Nov 27 to Sun Nov 29; T-167 runs Nov 22)

- [ ] T-160 [CLAUDE] Design polish for the screens not in the video. Due: Sun Nov 29 · Deps: T-108 · AC: AC-060–AC-064
  - Do: empty, loading and error states; accessibility (contrast, focus order, labels, `prefers-reduced-motion`); 375 px; dark mode.
  - Verify: Browser-pane screenshots at 375 and 1440 px, light and dark; optional Lighthouse accessibility ≥90.

- [x] T-161 [CLAUDE] Copy and safety audit. Due: Sun Nov 29 · Deps: T-087 · AC: AC-276, AC-304 · DONE Nov 23 (D-163): copy audit applied; SPEC §11 rows in step; F-270..F-272, F-277 open.
  - Verify:
    - the "safe" scan runs only over user-facing strings (`shared/strings/en.json` and rendered template output) with the `copy.about.notGuarantee` allowlist;
    - `grep -rn 'type="url"' web/src` finds nothing;
    - bands, never metres; confidence always shown;
    - the 18+, data-tier, dual-use and refusal copy is present;
    - prior art is in About.

- [x] T-162 [CLAUDE] README. Due: Sun Nov 29 · Deps: T-153, T-107 · AC: AC-302, AC-353, AC-361 · DONE Nov 23 (D-163): README filled from real numbers; only the [USER: …] markers remain (T-170, T-172, T-187).
  - Read: RUNBOOK §7.2, §7.6, §7.8
  - Sections:
    1. Value proposition, live URL, video link, license.
    2. Why (impact).
    3. "Try it in 60 seconds (judges)".
    4. **How we use Firebase AI Logic hybrid inference:** one row per job (W1–W8, I1–I6, C1–C3) giving mode, model, class and **file paths** (`web/src/ai/egressGate.ts`, `web/src/ai/models.ts`, `web/src/ai/jobs.ts`, `ios/StrangersEyes/AI/EgressGate.swift`); the S0–S4 table; the Egress Gate.
    5. Other Firebase products. **Drop Firestore if T-104 was cut.**
    6. Features.
    7. Safety, privacy and dual use. Include the DevTools/raw-JSON honesty statement and the **re-attack disclosure** (D-24), plus the data tier (and the EEA/UK/CH note if free).
    8. Prior art (arXiv 2503.20226 CHI 2025, DOI 10.1145/3706598.3714074; Geo-Safe-Filter) and what is new.
    9. Measured results with their **limitations** (SPEC E5).
    10. Run it yourself:
        - web;
        - iOS: Xcode 27.2, xcodegen, iOS 27.0 SIM, Apple Intelligence, **"pinned to 12.19.3 because HybridModel was removed in 13.0.0"**, and "bring your own Firebase project": replace `GoogleService-Info.plist` and register your own debug token.
    11. Repo map.
    12. Built during #BuildHybridAI, plus the tools disclosure.
    13. Limitations; roadmap (Android).
    14. License.
  - Verify: a script checks that every backticked path exists; `curl -sI` succeeds on every link.

- [x] T-163 [CLAUDE] Architecture diagram and routing graphic. Due: Sun Nov 29 · DONE Nov 23 (D-163): docs/img/architecture.png and routing.png (PNG, not SVG: check-images allowlist).
  - Files: `docs/img/architecture.svg` (+PNG), `docs/img/routing.svg`.
  - Verify: both render in the GitHub README preview.

- [x] T-164 [CLAUDE] `THIRD_PARTY_NOTICES.md` and `NOTICE`. Due: Sun Nov 29 · DONE Nov 23 (D-163): licences checked against node_modules and the SPM cache.
  - Do: list MediaPipe tasks-vision and the BlazeFace models (Apache-2.0), tesseract.js and its core (Apache-2.0), @tesseract.js-data/eng (MIT; check it), exifr (MIT), idb-keyval (Apache-2.0), React/Vite/Tailwind (MIT), and the firebase JS and iOS SDKs (Apache-2.0).
  - Verify: the `license` fields in `node_modules/*/package.json` match.

- [x] T-165 [CLAUDE] Devpost text in `docs/DEVPOST.md`. Due: Sun Nov 29 · Deps: T-153, T-167, T-172 · DONE Nov 23 (D-163): docs/DEVPOST.md filled; field limits still [UNVERIFIED] until T-167 reads the draft.
  - Read: RUNBOOK §7.5, §7.7
  - Do:
    - Name.
    - Elevator pitch, 165 characters: "The cloud plays the stalker; your device holds the answers. See what AI can infer from your photo and fix it before you post. The attacker never learns it was right."
    - About: inspiration, what it does, **how we built it with Firebase AI Logic**, challenges, accomplishments with numbers, what we learned, what's next, **built during the submission period**.
    - **Testing instructions** (no secrets).
    - Built-with tags.
    - Platforms per T-172.
  - Verify: the character counts fit the limits recorded in T-167.

- [x] T-166 [CLAUDE] Gallery screenshots and thumbnail. Due: Sun Nov 29 · Deps: T-160, T-173 · DONE Nov 23 (D-163): gallery 01–07 + thumbnail (scripts/shoot-gallery.mjs, DEV server + App Check debug token); 03/04 show CACHED SAMPLE.
  - Files:
    - `docs/img/thumbnail.png` (3:2);
    - `docs/img/gallery-{hero,capability,red-verdict-ledger,blocked-leak,risk-reduced,architecture,benchmark,ios}.png`.
  - No third-party logos; no real home or school.
  - Verify: visual review.

- [ ] T-167 [CLAUDE] Read the Devpost draft's form fields. Due: Sun Nov 22 · Deps: T-014
  - Do: read the draft in the browser, **read only**. Record field names, character limits, multi-platform selection and custom questions in RUNBOOK §7.5. These stay `[UNVERIFIED]` until then.
  - Verify: the RUNBOOK section exists.

- [x] T-168 [CLAUDE] Repo hygiene. Due: Sun Nov 29 · Deps: T-110 · AC: AC-364 · DONE Nov 23 (D-163): RUNBOOK §7.2 scans clean (AIza web keys expected); no file > 10 MB; images pass.
  - Do:
    - Re-run the T-110 scans.
    - `node scripts/check-images.mjs` over every committed image; no people; nothing from PRIV.
    - `git log --all --name-only --format= | grep -E '(^|/)\.env[^/]*\.local$|Secrets\.xcconfig$|\.appcheck-debug-token$'` prints nothing. `web/.env.example` and `web/.env.e2e` are committed on purpose.
    - No files over 10 MB.
  - Verify: everything clean, logged in PROGRESS.

- [x] T-169 [CLAUDE] Clean-clone test. Due: Sun Nov 29 · Deps: T-162 · DONE Nov 23 (D-163): web steps followed literally on a clone of HEAD 3d5057f (npm ci, check, build ok); iOS steps read, not run in the clone.
  - Do: clone into **this session's own scratchpad**. Web: `npm ci && npm run build && npm run check`. iOS: `xcodegen generate && xcodebuild … build`. Follow the README steps literally.
  - Verify: everything passes; fix the README wherever a step was missing.

- [ ] T-170 [USER] Approve making the repo PUBLIC. Due: Sun Nov 29 · Deps: T-168
  - Then Claude runs `gh repo edit --visibility public --accept-visibility-change-consequences`, and sets the homepage and topics (RUNBOOK §1.15).
  - Verify: `gh repo view --json visibility,licenseInfo` shows PUBLIC and `apache-2.0`; About shows the license.

- [ ] T-171 [USER] Paste `docs/DEVPOST.md` and the gallery into the draft, then review. Due: Sun Nov 29 – Mon Nov 30 · Deps: T-165, T-166
  - Don't submit yet (T-190).

- [ ] T-172 [USER] Choose the Devpost platforms (Web/Chrome and iOS, if multi-select is allowed) and the primary "Best of" category. Due: Sun Nov 29 · Deps: T-167

- [ ] T-173 [CLAUDE] Polish the storyboard screens. Due: Fri Nov 27 · Deps: T-085, T-105
  - Read: RUNBOOK §6.4, §6.6
  - Do: a visual pass on every screen in beats 1–6: capability panel, pre-screen editor, consent, notes plus chip, verdict card, gate toast, fix and compare, ledger, HUD; plus motion for the mask fill and the verdict change. Do Chrome work in its own block with the Simulator shut down.
  - Verify: screenshots reviewed before Nov 28 filming.

---

## M7: Video and submission (Fri Nov 27 to Mon Nov 30)

- [x] T-180 [CLAUDE] Script, shot list and edit decision list in `docs/VIDEO.md`. Due: Fri Nov 27 · Deps: T-085 · DONE Nov 23 (D-163): docs/VIDEO.md script, VO, SRT draft, EDL; in-points set at the cut.
  - Read: RUNBOOK §6.1–6.5
  - Do:
    - Compress the 8 beats to **≤2:50**. The first 30 s cover who it is for, the problem, and how the Firebase AI Logic hybrid works.
    - Voice-over text for each beat.
    - Setup for each shot: app state, data, Wi-Fi, which runtime (**never Nano and SIM FM together**).
    - Captions, including "iOS 27 Simulator on Apple-silicon Mac · Apple Foundation Models on-device".
    - An ffmpeg edit decision list (EDL).
    - Numbers are filled from T-153 only.
    - Verdict lines are whatever the app really produced. With the T-010 props, expect "Linked to your WORKPLACE".
  - Verify: the timings add up to ≤2:50.

- [ ] T-181 [CLAUDE] Overlays and subtitles. Due: Sat Nov 28 · Deps: T-153, T-163
  - Files: `video/` (title card, routing-table overlay, the "cloud sees / device holds" split graphic, benchmark card, Firebase stack strip as text only, end card), `video/subtitles.en.srt`.
  - Verify: visual review; the `.srt` timings match the script.

- [ ] T-182 [CLAUDE] Demo rehearsal and reset scripts. Due: Sat Nov 28 · Deps: T-097, T-105
  - Do:
    - Final pass-B ×10 on the chosen hero photo.
    - Load the demo vault: fictional "Lucas", "City General", home pin on a public building.
    - Reset scripts that burn the vault and clear the ledger.
    - A pre-flight list: Simulator off, Chrome Nano warm, memory pressure green, DevTools closed.
  - Verify: the stability table and pre-flight list are in PROGRESS.

- [ ] T-183 [USER] Record the web beats. Due: Sat Nov 28 morning · Deps: T-018a, T-180, T-182
  - Read: RUNBOOK §6.2–6.4
  - Chrome with Nano, the **Simulator shut down**, the Wi-Fi toggle visible, **DevTools closed**. QuickTime at 1080p, one clip per beat, retakes as needed.

- [ ] T-184 [USER] Record the iOS beats. Due: Sat Nov 28 evening · Deps: T-131, T-180
  - Simulator in a device frame, **Chrome quit**, status bar overridden (RUNBOOK §6.2).

- [ ] T-185 [USER] Record the voice-over in English, in your own voice. Due: Sat Nov 28 evening · Deps: T-180

- [ ] T-186 [CLAUDE] ffmpeg rough cut. Due: Sun Nov 29 09:00 · Deps: T-181, T-183, T-184, T-185
  - Read: RUNBOOK §6.6, §6.8
  - Do: assemble the clips per the EDL (normalise, ×4 speed-ups labelled, overlays, VO) into a rough cut. Sample frames to check the numbers, the captions and that no logos or tokens are visible.
  - Verify: `ffprobe` duration ≤170 s; frame review done.

- [ ] T-194 [USER] Review the rough cut and do the final edit. Due: Sun Nov 29 15:00 · Deps: T-186, T-193
  - Trim to ≤2:50 and export at 1080p. Give Claude the path for a final frame check.

- [ ] T-187 [USER] Upload to YouTube as **Public**. Due: Sun Nov 29 18:00 (hard stop 23:00) · Deps: T-194
  - Visibility **Public**, not Unlisted. "Not made for kids". English. Title per RUNBOOK §6.8. The description has the hosted URL and the repo. Upload the `.srt`. Send Claude the URL.
  - Verify (Claude): the link plays logged-out in the Browser pane; duration ≤3:00.

- [ ] T-193 [USER] Install a video editor (iMovie or DaVinci Resolve), or accept Claude's ffmpeg cut as final. Due: Fri Nov 27

- [ ] T-188 [CLAUDE] Pre-submit verification. Due: Mon Nov 30 09:00 · Deps: T-170, T-187 · AC: AC-360, AC-361, AC-362, AC-363, AC-364
  - Do: check every **Definition of Done** item and record each result in PROGRESS. Check that the hosted build matches HEAD; rebuild and redeploy if not.
  - Also (from T-030): in the Console under App Check → Apps → web/iOS → Manage debug tokens, **delete every debug token** (the user does the Console step). Confirm `web/.env.development.local` and `ios/.appcheck-debug-token` are untracked (`git ls-files` shows nothing).
  - Verify: every item passes, or the user explicitly accepts the gap.

- [ ] T-189 [CLAUDE] Tag and freeze. Due: Mon Nov 30 10:00 · Deps: T-188
  - Do: `git tag -a submission-v1 -m "Devpost submission"` then `git push origin main --tags`. Record the SHA in PROGRESS and `docs/DEVPOST.md`.
  - **From now on:** no pushes to `main` and no Hosting deploys until Dec 16. Only RC changes for availability. Further work goes to a new repo.
  - Verify: `git ls-remote --tags origin` shows the tag.

- [ ] T-190 [USER] **Submit on Devpost.** Due: Mon Nov 30 12:00 GMT+2 (hard deadline Tue Dec 1 00:00 GMT+2) · Deps: T-171, T-187, T-189
  - Read: RUNBOOK §7.9
  - Do: fill every field (repo URL, YouTube URL, hosted URL, testing instructions, platforms), click **Submit**, screenshot the confirmation and tell Claude. Claude never clicks Submit or accepts terms.

- [ ] T-191 [CLAUDE] Post-submission record. Due: Mon Nov 30 · Deps: T-190
  - Do: a final PROGRESS entry with all links, the SHA and the submission time. Add a "judging window" checklist to RUNBOOK: quota, caps, kill switch, budget.

- [ ] T-192 [USER] Keep the app running through judging. Due: Wed Dec 16 14:00 PT
  - Keep Blaze active, watch the budget emails, don't delete the project or the App Check/reCAPTCHA registrations. If quota runs short, Claude adjusts the RC caps; no code deploys.

---

## Stretch (Sun Nov 29, only if every checkpoint through Nov 28 is green, in this order)

- [ ] T-200 [CLAUDE] Chrome extension "check before you post" for **one** site with a standard file input.
  - A capture-phase `change` listener hands the file to the hosted PWA via `externally_connectable`, and the cleaned file is swapped back with `DataTransfer`.
  - **No Firebase inside the extension.**
- [ ] T-201 [CLAUDE] iOS Share Extension. It writes to an App Group and the main app runs the analysis.
- [ ] T-202 [CLAUDE] Explanations in any language. The cloud translates **templates** with placeholders, the device fills them in, and the gate checks that no vault strings appear.
- [ ] T-203 [CLAUDE] Batch "check my last 20 posts" (local files).
- [x] ~~T-204 Gemma 4 flag experiment~~. Moved to T-040 (Nov 19).

---

## Cut order (the single list; SPEC §0.3 points here; log every cut as a D-entry)

**Applied Nov 21 (D-141, user: "demo path only"):** deferred T-081 (beyond a plain export), T-083, T-084, T-096, T-104, T-106 (T-107 no longer depends on it), T-120–T-135 (the iOS track), T-151/T-152, T-160, T-200–T-203. Resume one only if the demo path in D-141 is done.

**Planned cuts, in order:**
1. **Stretch** (T-200–T-203), plus T-040 if it hasn't run by Nov 24.
2. **iOS stretch** (T-133 pass A on iOS, T-134 iOS re-attack, save and share, T-135 iOS sample scenes).
3. **Recent checks** (T-096, P1).
4. **Leak Atlas** (T-104 and its UI). Remove the Firestore claims from the README.
5. **iOS HybridModel explainer** (T-129). iOS keeps the on-device-only FM steps and cloud pass B. The README must then say that iOS's hybrid use is "on-device FM via FirebaseAILogic plus cloud Gemini", with no HybridModel.
6. **Grounded pass A on the web** (T-070): RC `grounding_enabled=false`. The notes card shows pass B's `scene_summary`. Remove the grounding claims.

**Emergency cuts (each needs the user's OK, except 8–10, which are already P1 per SPEC D-33):**

7. Nano vault-text prompt (T-067). The Tesseract matcher remains.
8. Offline queue persistence (T-084's P1 part, D-33). The P0 in-memory queue, offline loading and the local steps remain.
9. Share card (T-081's P1 part, D-33).
10. The Strict-mode toggle (T-068, P1 per D-33).
11. iOS reduced to: vault, Tier-0, FM pre-screen, FM referee, rules fix, consent, pass B, verdict.

**Triggers:**
- A missed §3 checkpoint → apply the next cut.
- Nov 22 slice not green → apply cuts 1–2 now.
- Nov 24 loop not done → apply cuts 1–4 at once.
- iOS not looping by Nov 27 → cut 11 (ask the user).
- Benchmark not run by Nov 28 → report the 10 spike photos honestly as n=10.

**Never cut:**
- the Egress Gate with its preflight (the consent dry run, ARCH AD-22), the Ledger, the Router HUD, the tripwire;
- the S0/S1 rules; the vault-never-leaves and original-never-leaves invariants;
- Tier-0, the consent sheet, pass B, the referee and fix with their fallbacks, the verdict, the web re-attack;
- Judge Mode; App Check, Anonymous Auth, the RC policy, Hosting;
- an iOS app with at least one on-device-only FM step plus the cloud adversary;
- the README, benchmark numbers (even with a small n), the video, the submission.

---

## Definition of Done (whole project; checked in T-188)

- [ ] The hosted URL is live and free with no login. Judge Mode goes red→green in ≤90 s (goal 60 s) in Chrome **without** Nano and in Safari. (AC-240, AC-360)
- [ ] In Chrome with Nano:
  - S0/S1 jobs show ON-DEVICE;
  - S2 shows on_device or an honest fallback;
  - S3 shows IN_CLOUD;
  - the HUD and Ledger record every call. (AC-003, AC-220, AC-221)
- [ ] The egress audit passes on the hosted build: 0 vault canaries, 0 original-photo hashes, 0 faces, no APP1/APP13, request count = cloud ledger entries. (AC-300, AC-211)
- [ ] `node scripts/check-boundaries.mjs` (web and iOS), `check-prompts` and `check-images` (image metadata and coordinates) all pass. (AC-025)
- [ ] App Check shows **Enforced** for AI Logic. The hosted site uses reCAPTCHA Enterprise. No debug-token value appears in `web/dist` or in git history. (AC-292, AC-364)
- [ ] The RC policy, models, prompt versions, caps and kill switch are live. The kill switch has been tested. (AC-293, AC-294)
- [ ] The iOS app builds from a clean clone by following the README. The video shows the on-device-only FM steps, the S2 HybridModel (unless cut) and the cloud adversary. (AC-320, AC-362)
- [ ] Benchmark results are published as aggregates, whatever they are. (AC-350, AC-353)
- [ ] The repo is **Public**, GitHub detects Apache-2.0 in About, and README, THIRD_PARTY_NOTICES, NOTICE and the run instructions are complete. No secrets, PII, real photos or coordinates (except the samples allowed by T-018c). (AC-302, AC-361, AC-364)
- [ ] The video is **Public** on YouTube, ≤3:00 (target 2:50), English with subtitles, uses real numbers, and shows no third-party logos or tokens.
- [ ] The Devpost submission is complete and submitted by Mon Nov 30 12:00 GMT+2: description, how AI Logic is used, features, value proposition, repo, video, URL, testing instructions, platforms.
- [ ] `submission-v1` is tagged and the freeze is respected. PROGRESS has its final entry. Every task here is ticked or marked CUT.

---

## Appendix A: `docs/PROGRESS.md` skeleton (T-022 creates it if missing)

```markdown
# PROGRESS: Strangers' Eyes

## STATE (overwrite in place; never append here)
- Today: Thu Nov 19 2026 (Day 0, evening)
- Now: none            <- lock: "T-0xx (started HH:MM)" while a task is in progress
- Next: T-020
- Last green commit: none
- Checkpoints: G1 – | G1b – | G2 – | G3 – | slice Nov 22 – | loop Nov 24 – | hosted Nov 25 –
- Adversary model: gemini-3.8-flash (pending T-031) | iOS path: A (12.19.3)
- Cuts applied: none

## WIP (exact next step if a task is half-done)
none

## USER pending (mirror of TASKS §4: ID · due · status)

## Key values (non-secret only)
| Key | Value |
|---|---|
| PROJECT_ID | |
| WEB_APP_ID / IOS_APP_ID | |
| BUNDLE_ID | |
| RECAPTCHA_SITE_KEY | |
| Firestore location | |
| HOSTED_URL | |
| REPO_URL | |
| YOUTUBE_URL | |
| Devpost draft URL | |
| submission-v1 SHA | |
Never record here: debug tokens, the CLI token, passwords, billing details, real coordinates.

## Day-1 gate results
| Gate | Metric | Result | Evidence |
|---|---|---|---|
| G1 | refused / 10; located (d ≤5 km, ≥2 of 3) / 10; doorstep subset refusals | | |
| G1b | band moved after fix / located; median radius_km | | |
| G2 | availability; valid on_device JSON image/text (x/5); median latency; memory | | |
| G3 | @Generable on-device; HybridModel modelVersion; cloud via debug token; latency | | |

## Decisions log
D-01..D-39 = SPEC §0.4 (pointer only; don't copy them). AD-xx = ARCH §2. New decisions take the next free D-number (D-40+).
- R-01..R-32 (T-022): "consistent" or "-> D-nn; edited: …"

## Session log (newest last; keep ~15, move older to docs/progress-archive.md)
### 2026-11-DD HH:MM: session summary
- Done: T-0xx (evidence), …
- Verified: <commands and results>
- Waiting on USER: T-0zz (reminded: yes/no)
- Decisions: D-nn <one line> (docs updated: …)
- WIP: <files half-done, exact next step> or "none"
- Next: T-0ww
```

## Appendix B: verification cheat sheet

```bash
# Web
cd "/Users/mac/Documents/firebase buildathon/web"
npm ci && npm run check            # tsc -b + check-boundaries/prompts/images (incl. coordinates) + vitest
npm run test:e2e                   # Playwright smoke + offline (fake transport)
npm run audit:egress               # canary egress audit on a real build with the debug token (ARCH §20.2)
npm run build && npx vite preview  # PWA / offline checks
T=$(sed -n 's/^VITE_APPCHECK_DEBUG_TOKEN=//p' .env.development.local); [ -n "$T" ] && grep -rF "$T" dist && echo LEAK || echo clean
grep -rlF "VITE_APPCHECK_DEBUG_TOKEN" dist && echo LEAK || echo clean   # AC-365: env-var name not in the build. Never grep FIREBASE_APPCHECK_DEBUG_TOKEN: the App Check SDK itself contains it.

# Firebase (CLI pinned; the USER ran `login`)
cd "/Users/mac/Documents/firebase buildathon"
npx -y firebase-tools@15.37.0 projects:list
npx -y firebase-tools@15.37.0 deploy --only hosting,firestore,auth,remoteconfig
npm run test:rules                 # tests/rules via firebase-tools@13.35.1 emulators:exec (Java 17 OK, port 8181)

# iOS (Chrome quit first)
cd "/Users/mac/Documents/firebase buildathon/ios" && xcodegen generate
xcodebuild -project StrangersEyes.xcodeproj -scheme StrangersEyes -configuration Debug \
  -destination 'platform=iOS Simulator,id=E950C8A0-185D-40BF-8A62-C113655C0557' \
  -derivedDataPath build -clonedSourcePackagesDirPath .spm ARCHS=arm64 build      # or: test
xcrun simctl install E950C8A0-185D-40BF-8A62-C113655C0557 build/Build/Products/Debug-iphonesimulator/StrangersEyes.app
SIMCTL_CHILD_AppCheckDebugToken="$(cat .appcheck-debug-token)" xcrun simctl launch --terminate-running-process E950C8A0-185D-40BF-8A62-C113655C0557 <BUNDLE_ID>
xcrun simctl location E950C8A0-185D-40BF-8A62-C113655C0557 set <public-place lat>,<lng>
xcrun simctl shutdown all

# Chrome Nano check (user's Chrome 157, Simulator off; via Claude-in-Chrome or pasted by the user)
await LanguageModel.availability({expectedInputs:[{type:'text',languages:['en']},{type:'image'}],expectedOutputs:[{type:'text',languages:['en']}]})

# Repo
gh repo view --json visibility,licenseInfo
git grep -nIE 'BEGIN [A-Z ]*PRIVATE KEY|client_secret|refresh_token'
node scripts/check-images.mjs      # image metadata + coordinate-like decimals (ARCH §3)
```
