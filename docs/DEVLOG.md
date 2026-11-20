# DEVLOG: Strangers' Eyes development log

An honest, chronological record of building this project: what was built, **what went wrong** (bugs, design flaws, wrong assumptions, our own mistakes), how each problem was found and fixed, and what got better as a result. It complements:
- `docs/PROGRESS.md`: current state and the decisions log (D-numbers);
- `docs/TASKS.md`: the plan.

It is written for the team and for judges, so it is **public-safe**: no secrets or tokens, no coordinates, place names or private photos, no personal data.

**How it is kept (D-76):** after every finished task, Claude appends what happened to the dated narrative below. Every flaw also gets a row in the ledger: how it was found, how serious it was, the fix, and where the fix lives. Mistakes are logged too, including Claude's own.

Severity:
- **blocker:** would invalidate a result, leak private data, or waste paid/limited calls.
- **major:** a wrong behaviour or metric a user or judge would see.
- **minor:** robustness or clarity.

How a flaw was found:
- **review:** an independent reviewer agent, then an adversarial verifier;
- **live:** a real run against Firebase/Gemini/Chrome;
- **self:** caught while building;
- **mistake:** our own error, caught afterwards.

---

## Flaw ledger

| # | Date | Task | Found by | Sev. | Flaw | Fix (where) |
|---|---|---|---|---|---|---|
| F-01 | Nov 19 | T-023 | review | major | Vault "Burn" could race a concurrent add: a deleted vault could be re-created with a fresh key, and two concurrent first adds could lose an item | All vault writes and Burn run under `withVaultLock()` (tab queue + `navigator.locks`); `ensureVaultKey()` is single-flight; Burn deletes the key first (D-55) |
| F-02 | Nov 19 | T-023 | review | major | The fetch tripwire matched the AI host case-sensitively and could not scan `Request`/non-string bodies, so a request could slip past unscanned | Case-insensitive host match with regional prefixes; non-string bodies fail closed (`UNSCANNABLE_BODY`); every string value is scanned except image bytes (D-56) |
| F-03 | Nov 19 | T-023 | review | major | The boundary checker could be evaded 6 ways (aliased calls, dynamic imports with computed paths, glob imports, raw egress APIs…) | Rules R1–R20 (identifier bans, literal-only dynamic imports, glob limits, raw-egress ban, DEV markers checked in the built output) with a self-test of 45 planted violations (D-57) |
| F-04 | Nov 19 | T-023 | review | major | PWA auto-update would stall: with `injectRegister:false` a new deploy waited until every tab closed | Workbox `skipWaiting` + `clientsClaim` (D-58) |
| F-05 | Nov 20 | T-024 | review | major | A vault label such as "Medium" or "Landmark Road" would trip the tripwire on **every** pass-B request, because the schema itself contains those words | The scanner skips string values that exactly equal schema/protocol strings and strips static prompt text before scanning (D-65) |
| F-06 | Nov 20 | T-024 | review | major | A released (frozen) prompt could be silently edited by flipping it back to "draft" | `check-prompts.mjs` compares against git HEAD: a release can never be undone and frozen files keep their hash (D-62) |
| F-07 | Nov 20 | T-025 | self | minor | We believed the Firebase CLI was logged in; it had no saved login at all | Checked the CLI config before relying on it; the user finished `firebase login` in the terminal |
| F-08 | Nov 20 | T-011 | mistake | major | Claude added `localhost` to the reCAPTCHA key's allowed domains, which weakens App Check for local origins | Removed it the same day; local development uses the App Check **debug token** instead (ARCH/API-NOTES updated) |
| F-09 | Nov 20 | T-012 | live | minor | The console masks a debug token after saving, and the permission classifier (correctly) blocked Claude from reading the secret, so the token could not be transferred automatically | The user generated their own token and pasted it into both the console and the gitignored env file; Claude never saw the value |
| F-10 | Nov 20 | T-030 | live | minor | The first Spike A run "hung": Vite's dependency optimiser forced a full page reload mid-run, and the browser tool did not capture the AI requests | Re-ran after the optimiser settled; used `performance` resource entries as evidence instead |
| F-11 | Nov 20 | T-030 | live | minor | The App Check token cache would have hidden a failed enforcement test (old valid token reused) | Cleared the App Check IndexedDB before the no-token run, then proved enforcement: **401 "App Check token is invalid"** |
| F-12 | Nov 20 | T-031 | review | **blocker** | A page reload or hot update during the live spike would **restart the run and repeat cloud calls** on a 20-calls-per-day quota | The autorun flag is stripped from the URL at start; a sessionStorage one-shot flag and a global guard block any restart; the runner kills Chrome on a second navigation; HMR and the websocket are off in spike mode |
| F-13 | Nov 20 | T-031 | review | major | After an abort, the runner would overwrite the final record and delete the partial file that held the real results | Timestamped file names that never overwrite (`wx`); the partial is saved on every new call and is kept on abort |
| F-14 | Nov 20 | T-031 | review | major | A timeout or an error *after* a response was treated as "transient" and re-sent: a duplicate billed call | Only errors raised before any response (429, 5xx, network) may be re-sent, once; timeouts never; response parsing sits outside the retry |
| F-15 | Nov 20 | T-031 | review | major | The G1b "did the fix help?" metric compared one rerun with the *closest* of 3 earlier runs, a built-in bias toward "it helped" (regression to the mean) | The headline compares with the **median** band of the earlier runs; the optimistic comparison is shown separately and labelled |
| F-16 | Nov 20 | T-031 | review | major | A failed or unreadable fix rerun had band "none", so it would have counted as "moved outward" | Bands are null for unscorable runs; "moved" is only computed for valid reruns; the scorer cross-checks the page |
| F-17 | Nov 20 | T-031 | review | major | An orphaned headless Chrome could keep spending calls after a runner crash, and a restart could attach to it | The runner only talks to the Chrome it spawned (random debugging port) and kills it on every exit path |
| F-18 | Nov 20 | T-031 | live | **blocker** | The pass-B response schema was **rejected by Gemini**: `400 "too many states for serving"` on both models (open question U-45) | Text-only probes found the minimal fix: no `maxItems` on arrays of objects; the caps (12/3/8) are enforced in the parser (D-73) |
| F-19 | Nov 20 | T-031 | live | major | `gemini-3.8-flash`, the planned adversary, was unusable that day: 503 "Deadline expired" after 180 s with any schema, 131 s without | Switched the spike to `gemini-4-hydrogen` with the user's approval (D-73); re-test flash before choosing the default |
| F-20 | Nov 20 | T-031 | live | major | The free tier allows only **20 requests per day per model**; the run hit it after 3 photos | The circuit breaker stopped the run cleanly; the user chose to wait for the reset; the 3rd run per photo is now skipped when it cannot change the result (D-74) |
| F-21 | Nov 20 | T-031 | self | minor | The scorer showed the primary model's runs again in the "secondary model" column when only one model ran, and called an incomplete set "FAIL" | Fixed both: no secondary when absent; an incomplete set reads "INCOMPLETE (n of 10)" |
| F-22 | Nov 20 | T-027 | live | minor | XcodeGen's `optional: true` still adds a reference to a missing file, so the iOS build failed | Missing resources are added only once they exist (T-038, T-052) |
| F-23 | Nov 20 | T-093 | review | major | With two cloud calls authorised at once, one call's request could consume the other's permit. An attack (S3) request could then take a Judge Mode (S4) permit and **skip the tripwire's vault-text scan** | Only one cloud call may sit between "authorised" and "sent" (milliseconds); an integration test proves the scan always runs (D-75) |
| F-24 | Nov 20 | T-052 | self | major | `pinBand` could **under-report risk**: if the first hypothesis had NaN coordinates, every later (even street-level) hypothesis was ignored, so the pin showed "not located" | Hypotheses with a non-finite distance are skipped; 3 shared vectors lock it in |
| F-25 | Nov 20 | T-052 | self | minor | The Remote Config band table was never validated: a non-increasing table would silently skip bands | `bandThresholdsOrDefault` falls back to the defaults for any invalid table |
| F-26 | Nov 20 | T-052 | review | major | A Remote Config change to the street threshold would make the UI claim "within 250 m" about something 300 m away | The three named thresholds are locked; only city/country are tunable (D-77) |
| F-27 | Nov 20 | T-052 | review | minor | The band-words test could skip itself silently, and the copy IDs were untyped, so a deleted string would show a raw ID to users | The test is unconditional; the IDs are typed, so a missing string fails the build |
| F-28 | Nov 20 | T-087 | self | major | The strings file held only 11 of SPEC's 134 copy rows; the band code used 6 IDs that did not exist; explain templates could not be looked up | All copy added verbatim; tests check SPEC fidelity and that every ID used in web **and iOS** code exists |
| F-29 | Nov 20 | T-087 | review | minor | Two Judge Mode coach texts were inaccurate (said face/text finding might run in the cloud; said the attack is always live) | Reworded to match SCR-17; all 7 coach texts await a human copy review |
| F-30 | Nov 20 | T-087 | review | minor | Holes in the copy-ID audit: Swift IDs checked against the wrong table, hyphenated IDs skipped, two template loaders not pinned together | Each fixed with a test |
| F-31 | Nov 20 | T-058 | review | major | A phone number or plate **glued to a label** ("Tel:07700900123", "REG:SE1234") was never matched against the vault | Digit values are also matched on punctuation-separated sub-words (up to 6), still never as substrings |
| F-32 | Nov 20 | T-058 | review | major | The possessive of a **short child's name** ("AVA'S", "Jo's") never matched "Ava"/"Jo": the exact-match rule for ≤3-letter names met the deleted apostrophe | Each word is also read with a possessive 's removed (D-77) |
| F-33 | Nov 20 | T-058 | review | minor | A soft hyphen or zero-width space inside a name split it in two; the first fix (delete them) then broke "Lucas[zero-width space]school" (found by the fix verifier) | Both readings are scanned, deleted and spaced; either one counts (fail closed) |
| F-34 | Nov 20 | T-058 | review | minor | A phone stored as "+44 (20) 7946.0958" was compared with too small a window | Groups are counted on the normalised value |
| F-35 | Nov 20 | T-058 | self | minor | The architecture sketch would have tripped on any "of the" pair, missed multi-group phones, and returned Object.prototype members for the token "constructor" | Function-word pairs are ignored, the digit window follows the value's groups, and folds use a Map |
| F-36 | Nov 20 | T-053 | review | minor | An image dragged in from another browser tab, or copied with "Copy image" on a website and pasted, started an import. It arrives as a file plus its web address, which breaks "local files only" (SR-06) | A transfer that carries a web address or page markup gets `copy.import.noUrl` (D-78) |
| F-37 | Nov 20 | T-053 | review | minor | A failed re-import left the previous photo's "ready" panel, GPS warning and master in place. After the first fix, going back to the Import step would have shown an idle drop zone over a stored photo (found by the fix verifier) | Every attempt clears the photo. The import status sits next to the master in a pure Check reducer, pinned by tests that run Check's real state |
| F-38 | Nov 20 | T-053 | review | minor | Hostile HEIF/WebP files made of thousands of tiny boxes or chunks were walked with no limit: about 380 MB and 1.3 s for a 30 MB HEIF, and about 1.4 s for a WebP, which was walked twice. The first WebP cap then covered only one WebP layout (found by two fix verifiers) | One capped walk (1024 boxes or chunks) for every HEIF and WebP; over the cap the file is unsupported |
| F-39 | Nov 20 | T-053 | review | minor | A truncated HEIF size box borrowed its width and height from the next box | Bounds are checked against the box itself, failing closed |
| F-40 | Nov 20 | T-053 | review | minor | A WebP carrying EXIF GPS never triggered the GPS warning, because the EXIF library has no WebP reader | The EXIF chunk is taken out of the WebP container and parsed |
| F-41 | Nov 20 | T-053 | review | minor | The GPS warning named only the closest pin, read the pins before the vault was unsealed, and showed a place pin as "PLACE" instead of its label | Every pin within district range is named, one line per kind. Pins are awaited, capped at 5 s. A place pin carries its label, for local display only |
| F-42 | Nov 20 | T-053 | review | minor | "Max 30 MB" was enforced as 30 MiB, so a file the Mac shows as 30.1–31.4 MB was accepted | The limit is 30,000,000 bytes, as the copy and Finder say (D-78) |
| F-43 | Nov 20 | T-053 | review | minor | Screen readers might not announce a successful import, because the live region appeared already filled. Dragging outside the drop zone looked droppable and then silently did nothing | One live region, always mounted. Outside the zone the cursor shows "not allowed" |
| F-44 | Nov 20 | T-053/T-054 | review | minor | The no-logging rule (R9) missed the new files that hold pin coordinates, and missed `console['log']`, aliases and destructuring. Nothing forced IndexedDB stores to close on version change, and a store that never closes blocks Burn vault | R9 now flags any `console` in 15 sensitive files. New rule R21: only `vault/idb.ts` may open IndexedDB. 80 planted violations |
| F-45 | Nov 20 | T-054 | review | major | The in-memory vault index was kept per tab. A vault edit or a Burn in one tab left other tabs scanning with old names and holding burned names and pins in memory | Every committed change is announced on a `BroadcastChannel` (the message holds no data), and each tab rebuilds. The gate's generation check before each call is T-062 |
| F-46 | Nov 20 | T-054 | review | minor | An unrecognised vault record read as an empty vault (fail open), and the next add would have overwritten it | It is treated as corrupt, so reads and writes refuse |
| F-47 | Nov 20 | T-054 | review | minor | Vault item ids were free text and could repeat, and free text would reach the unsealed ledger. Timestamps, pin source, blank labels and the number of aliases were not checked | Ids are `vi_` + 12 hex, unique, with links checked. Item rules now include at most 5 aliases (D-79) |
| F-48 | Nov 20 | T-054 | review | minor | The vault key could be created outside the vault lock. Burn reported success while another connection still held a database open | Creating the key needs an unforgeable lock token. Burn waits for the deletion, and otherwise reports "not finished" |
| F-49 | Nov 20 | T-054 | review | minor | A Burn interrupted after the key delete was never finished, so the unsealed ledger stayed readable | A burn-pending marker is written in the same transaction as the key delete, and the next load or boot finishes the burn (D-80) |
| F-50 | Nov 20 | T-054 | review | major | The first fixes for F-48 and F-49, taken together, could leave every vault operation in every tab waiting forever while holding the vault lock (found by the fix verifier with a probe) | Deletion timeouts start when the request is made, and a second deletion of the same database is never queued |
| F-51 | Nov 20 | T-054 | review | minor | A failing burn retry announced a change, which made every tab retry again: about 830 full burn attempts per second (fix verifier, probe) | Only a finished burn announces. Reloads are coalesced: one in flight plus one follow-up |
| F-52 | Nov 20 | T-054 | review | minor | A Judge Mode boot never finished an interrupted burn. After that fix, a failed Burn took about 3 s per other open tab, and a Judge boot on a fresh browser created the vault's key database (fix verifiers) | Every boot finishes a pending burn and reads only the marker. Retries give up after 250 ms. The marker is not looked for when its database does not exist (D-80) |
| F-53 | Nov 20 | T-054 | review | minor | A failed Burn before the app had booted never settled | `refresh()` before boot resolves at once |
| F-54 | Nov 20 | T-037 | live | major | Tesseract's default binarisation missed a large, high-contrast name tag in 16 of 30 placements on street photos, so Tier-0 would have let a child's name through unmasked about half the time. A bigger tag made it worse | T-057 uses adaptive Otsu plus a Sauvola union pass: 30/30 (D-81) |
| F-55 | Nov 20 | T-053/T-054 | mistake | minor | The orchestrator's fix prompts cut the findings list at 14,000 characters, so 6 review findings (2 for T-053, 4 for T-054) silently never reached a fixer | Caught by reconciling the fixer tables against the findings, and fixed in round 4. Findings are now passed whole |
| F-56 | Nov 20 | T-054 | mistake | minor | A fixer's mutation check left a mutated `crypto.ts` in the shared working tree for a few minutes while the other fixer was running checks | Mutation checks now run only in scratch copies |
| F-57 | Nov 20 | T-054 | review | major | A sparse alias list (`[, 'Ottie']`) passed validation and was stored, then blocked the vault index and every later write (final reviewer, probe) | Holes count as bad values (`bad_item`). An item may hold only its known fields |
| F-58 | Nov 20 | T-054 | review | minor | During a boot-time burn retry, a slow (not blocked) deletion left the vault index blocked until some later vault operation | When a timed-out deletion completes, the tab announces once, and every index reloads and finishes the burn |
| F-59 | Nov 20 | T-054 | review | minor | In a browser without `indexedDB.databases()`, a Judge Mode boot created an empty vault key database (AC-241) | An existence check that aborts its own upgrade, so nothing is created |
| F-60 | Nov 20 | T-054 | review | minor | An update with a field set to undefined threw a raw TypeError. Array patches and unknown fields were sealed without validation | Undefined means "no change", and only the item's known fields are allowed |
| F-61 | Nov 20 | T-054 | review | minor | A generic alias ("Home") on a pin with a real label, or on any item, became a vault term, so every prompt containing "home" was blocked (AC-088) | Generic strings are never terms; a generic text label is refused. A shared vector pins this for iOS |
| F-62 | Nov 20 | T-053 | review | minor | The import's fail-closed metadata error reused gate copy saying the data "would have left this device", which is untrue at import | Its own copy (`ui.import.metadataFailed`) |
| F-63 | Nov 20 | T-053 | review | minor | The JPEG and PNG walks stopped early (at the first SOF or IDAT), while the EXIF library walks further. A crafted 30 MB file passed the sniff, then cost about 1 s and hundreds of MB | Both walks go to SOS or IEND, capped at 1024, and the code comment now matches |
| F-64 | Nov 20 | T-053/T-054 | review | minor | The IndexedDB rules missed idb-keyval's default store and a relative path into `node_modules` | New rule R22 and path-segment matching. 95 planted violations |
| F-65 | Nov 20 | T-053 | review | minor | Several guarantees were pinned only by source regexes or partial test harnesses: Check's effects, the master photo ref, an unmount after the import settled, a remount while busy, an EXIF thumbnail that contains a size marker | Each now has a behaviour test that a mutant fails |
| F-66 | Nov 20 | T-053 | review | major | The F-63 fix rested on a wrong premise, that bounding the sniff's walks bounds the EXIF library. exifr walks PNG chunks past IEND, byte-scans some JPEG segment bodies past the scan, and walks every HEIF box, so a crafted 30 MB file still cost about 1 s and 365–577 MB (round-5 verifier, exifr source + probes). It also lost GPS on a PNG with a trailing byte | exifr never sees the file. It gets only the EXIF TIFF found on the app's own capped walks (`sniff.exifTiff`), and every HEIF meta child is now capped |
| F-67 | Nov 20 | T-054 | review | minor | A pin object with extra fields was sealed as given, a text item with `pin: null` passed, and the fail-closed branch of the new database-existence check had no test | Pins may hold only Pin fields, and a text item may hold no pin at all. A stubbed failing open must reject, not read as "no burn" |
| F-68 | Nov 20 | T-053/T-054 | review | minor | The IndexedDB rules could be dodged with an upper-case path (macOS ignores case), a `?query` suffix or a glob into `node_modules` | Case-insensitive matching, query and hash suffixes, and R19 also covers `node_modules`. 101 planted violations |
| F-69 | Nov 20 | T-053 | self | minor | A browser re-check ran against a page that had not reloaded (same URL, hot reload off), so it tested the previous code. The identical timings gave it away before any conclusion was drawn | Force a reload and check for a marker that the new code is loaded before trusting a browser check |
| F-70 | Nov 20 | T-053 | review | major | Handing exifr only the TIFF still did not bound it. Its TIFF parser trusts each tag's value count, so a crafted 30 MB TIFF inside a PNG, WebP or HEIF cost about 2.5 s. A 30 MB HEIF `ftyp` brand list cost about 2 s more before any cap applied (round-6 verifier) | exifr gets at most 1 MiB of TIFF (about 5 ms worst case). At most 64 ftyp brands are read |
| F-71 | Nov 20 | T-053 | review | minor | An accepted HEIC could still lose its GPS warning when the Exif lookup hit a cap the sniff never checked. Most iloc/iinf layouts (several items, base offset, index size, 32-bit ids), little-endian TIFFs and an XMP block before the Exif block had no test | The sniff validates every infe and iloc entry with the lookup's own caps. A test for each layout, with 13 mutants killed |
| F-72 | Nov 20 | T-053/T-054 | review | minor | Globs in DEV files or with `exhaustive` could still reach `node_modules`, and an escaped specifier (`'idb-keyv\\x61l'`) hid a package from the name rules. A Date-based pin passed validation and was then sealed as a date string, which blocked every later write | R19 now covers every file and every route out of `web/src`. Backslashes are banned in specifiers. Validation runs on exactly what is sealed (a JSON round trip). 106 planted violations |
| F-73 | Nov 20 | T-054 | mistake | minor | While mutation-checking, the orchestrator restored a backup taken BEFORE its edit, which silently undid the fix while the tests stayed in place | Noticed at once from the count of `asSealed` call sites, and reapplied. A backup is now always taken right before the mutation |
| F-74 | Nov 20 | T-053 | review | minor | The first TIFF cut (64 KiB) dropped GPS from real Apple ImageIO HEIC/PNG files with a large UserComment, whose GPS IFD sits past 100 KB. Each of the two new HEIF walks also lacked a test on its own (final verifier) | The cut is 1 MiB, plus a test with the GPS IFD at 100 KB and one overflow test per walk. Remaining minors (R19 as an allowlist, escaped identifiers) move to T-090 |
| F-75 | Nov 20 | T-038 | live | minor | On the live site, a missing file (a wrong `/vendor/…` path, for example) returned `200 text/html` with a 1-hour cache, because of the catch-all SPA rewrite, which a hash-routed app never needed. MediaPipe or Tesseract would have tried to parse a web page as wasm | Rewrite removed: a missing file is now a real 404 (D-82) |
| F-76 | Nov 21 | T-057 | review | major | The union of the two OCR passes deduplicated word by word. That split a sequence only the second pass read in full (spaced "L U C A S", a plate over two words, a phone number), so the union could be WORSE than the second pass alone, failing open at the gate | The union works by line: a second-pass line is added whole unless every word on it is a re-reading. Tests run the real matcher and phone detector on the union |
| F-77 | Nov 21 | T-057 | review | major | tesseract.js 7's `createWorker` never settles when the language data fails to load (a network blip on a first visit), so OCR, the idle drop and terminate would all have hung for the rest of the session | An `errorHandler` fails the start. Start (120 s) and each pass (30 s) have timeouts. A drop never waits on a pending start |
| F-78 | Nov 21 | T-057 | review | minor | A freed (empty) canvas hangs tesseract's image loading. Each pass re-encoded the canvas. The downscale canvas was never freed. The single-pass function's name invited a future gate caller to skip the union | An empty canvas is refused. One snapshot serves both passes. The downscale is freed after use. The single-pass function is now `ocrSinglePass` |
| F-79 | Nov 21 | T-056 | review | minor | A comment claimed a face detector built at the RC floor and filtered in code gives "exactly" the same output. MediaPipe's weighted NMS can shift a box slightly | Reworded: the same faces and scores; boxes may differ slightly. Tier-0 and the gate share the function, so they always agree |
| F-80 | Nov 21 | T-057 | self | minor | My first test for the idle-drop race never produced the race (the job ended before the timer fired), so it passed vacuously. Every test passing on the first run is what raised the suspicion | Rewritten to really queue the drop. The new timeouts then made the race impossible (start + two passes < idle), and a test pins that bound |

---

## Narrative

### Nov 19 (evening): idea, plan, verified research
- **What happened:**
  - A 29-agent idea tournament picked **Strangers' Eyes** (the cloud plays the attacker on a redacted photo; the device holds the private answers). **Blindfill** is kept as a fallback.
  - The five working docs were written and cross-checked: SPEC, ARCHITECTURE, API-NOTES, RUNBOOK, TASKS.
  - Day-1 research code was rescued into `research/day1-artifacts/`: a compiled TypeScript core, Firestore-rules tests, an iOS SDK probe that builds, and a headless-Chrome harness.
- **Improved:** every SDK claim in the docs is tagged VERIFIED or UNVERIFIED, so later work knows what to test first.

### Nov 19 (late): web scaffold and its first independent review
- **What happened:**
  - The Vite + React + TypeScript PWA scaffold, with the Tier-0 libraries ported: EXIF strip, face detection, OCR, solid masks, encrypted vault.
  - `check-boundaries.mjs`, a static checker that enforces where AI calls, Firebase init and vault access may live.
- **Review:** 18 confirmed findings, all fixed before the first commit. The main ones are **F-01 to F-04**.
- **Improved:**
  - The vault survives concurrent tabs.
  - The tripwire fails closed on anything it can't scan.
  - The boundary checker catches 45 planted evasions.

### Nov 20 (morning): prompts, Firebase project, App Check
- **Prompts (T-024):**
  - All prompts are versioned files with sha256 hashes; they stay "drafts" until their first recorded run.
  - The review found **F-05** (false vault alarms on every request) and **F-06** (frozen prompts could be unfrozen). Both fixed.
- **Firebase:** project created, with Analytics off and the console's Gemini assistant off.
  - The web and iOS apps are registered.
  - AI Logic is on the free Gemini Developer API (D-70: free while building, paid only for judging).
  - App Check is enforced, with a reCAPTCHA Enterprise key.
  - **F-07, F-08 and F-09** happened here. F-08 was Claude's own mistake and was reverted the same day.
- **App shell (T-050):** built by an agent and reviewed (12 findings, 10 fixed), then checked by hand at desktop and phone widths in both themes.

### Nov 20: Spike A, Firebase plumbing (T-030), PASS
- Anonymous sign-in plus an App Check token; both Gemini models answered from the cloud on the free tier.
- **Proved** that a request without a valid App Check token is rejected (401).
- **Flaws found:** F-10, F-11.
- **Noted:** `gemini-3.8-flash` took 38.8 s for a one-word answer, an early sign of F-19.

### Nov 20: Spike B, the adversary go/no-go (T-031), in progress
- **Built:** the pass-B validator (`parseAdvB`, 15 tests); a DEV-only spike page; a headless runner that keeps raw results only in the private folder; and a scorer that recomputes every distance independently and refuses to write anything that looks like a coordinate.
- **Dry run:** all 10 images that would be sent were metadata-free and face-masked. Two "faces" were false positives on shop-window signs, masked anyway. Checked by eye.
- **Review before any paid or limited call:**
  - 35 findings, 24 confirmed, all fixed (F-12 to F-17).
  - The most serious: a reload could have silently repeated the whole run (F-12).
  - The fix was tested: a forced restart attempt made **0** AI requests.
- **Live:**
  - The first real call exposed the schema problem (F-18) and the flash outage (F-19). Hydrogen then ran 3 photos before the free quota ran out (F-20).
  - Partial result: 0 refused; 2 of 3 located at street level. On one located photo, masking 6 clues pushed the attacker's best guess from street level to country level.
- **Improved:** the run is now resumable, budget-aware (adaptive third run) and safe to interrupt.

### Nov 20: iOS skeleton (T-027)
- XcodeGen project on iOS 27, Firebase iOS SDK pinned to exactly 12.19.3. The App Check debug provider is set before Firebase starts. Shared prompts and copy are bundled from the same files the web uses.
- Builds in 72 s (12 s incremental); 2/2 tests pass. **F-22** found and fixed.

### Nov 20: domain types audit (T-051) and the interlock (T-093)
- T-051: the types already matched the architecture byte for byte, and an independent check agreed. Nothing changed.
- T-093: the local/cloud interlock and the single-flight device queue.
  - The skeptic reviewer **reproduced F-23**, a real hole in the last line of defence. It was fixed (D-75) and pinned with an integration test.
  - 195 tests green.

### Nov 20 (afternoon): bands, copy and the vault matcher (T-052, T-087, T-058)
- **How:** three builder agents in parallel, one skeptic per task, then a fix-verifier on the result (workflows `wf_1b4a803c-24f`, `wf_192cfaaa-008`).
- **Built:**
  - Distance bands, with the first shared test vectors, which the iOS tests also bundle.
  - All of the product copy, checked against SPEC.
  - THE vault matcher, used by OCR masking, the gate, the prompt scans, the tripwire and the echo scan.
- **Flaws:** F-24 to F-35. Two would have hidden real risk from the user: F-24 (a broken hypothesis masked a street-level one) and F-32 (a short child's name in the possessive). Both are now pinned by shared vectors.
- **Process note:** the fix-verifier caught a regression introduced by one of the fixes (F-33). The "verify the fix too" step paid for itself.
- **Pending a human:** a copy review of the 7 Judge Mode coach texts.
- 438 tests green.

### Nov 20 (evening): photo import (T-053), the vault store (T-054) and the prop OCR spike (T-037)
- **How:** one builder per task, two adversarial reviewers per task, then four fix rounds. Each round had its own verifier, and each verifier hunted for regressions the fixes had introduced (workflows `wf_1ad9d726-1ee`, `wf_8b0f6516-78d`, `wf_0697d92c-600`, `wf_a187abcf-c96`). A last round was applied by hand and verified again (`wf_0660c067-fab`). Every fix was mutation-checked: the fix is reverted in a scratch copy and its test must fail.
- **Built:**
  - Import: a file, drag or paste becomes an upright, metadata-free master photo. Formats are checked by their bytes; the size limit is read from the header before decoding. A warning shows when the photo's GPS point is near one of your pins. All 6 real test photos with GPS came out clean.
  - The vault store: a sealed vault that survives an interrupted Burn, stays consistent across open tabs, and can never hang while holding its lock.
- **Flaws:** F-36 to F-74. The two most important:
  - **F-45:** another open tab kept a burned vault's names in memory.
  - **F-54:** the default OCR binarisation missed a large name tag on street photos half the time. This would have let a child's name through unmasked; adaptive thresholding catches it in every placement tested.
  - Three of the major findings (F-50, F-57, and F-45's follow-ups) were caused or exposed by earlier fixes. Each was caught by the next verifier, not by the builder's tests.
- **Our own mistakes:**
  - F-55: the orchestrator's prompts silently dropped 6 findings by truncating them.
  - F-56: a fixer left a mutated file in the shared tree.
- check: 657 tests, 106 planted boundary violations. Eight review/fix rounds in all; the last verifier found nothing major. Rounds 5–7 were applied by hand and verified independently (`wf_0660c067-fab`, `wf_6a8e7fe5-09a`, plus a final verifier). The import path took the most rounds, because each fix moved the cost to the next unbounded parser.

### Nov 20 (night): the site is live (T-038)
- With the user's OK, the walking skeleton went up on Firebase Hosting: https://strangers-eyes.web.app.
- Headers, file types and caching were checked with `curl` on every asset class. A photo import on the live site makes zero network requests. The debug token cannot reach a production build. The layout works at phone width.
- One live finding (F-75): the catch-all rewrite served a web page for a missing file. Removed.

### Nov 21 (after midnight): OCR and faces (T-057, T-056)
- Tier-0 OCR now implements tonight's finding: adaptive binarisation plus a Sauvola union pass. On the 30 real-photo placements it finds the name tag **29 times out of 30**, against 14 with the old setting. The one miss is the smallest tag on the busiest background, so the demo prop gets a minimum letter size.
- One independent reviewer found two real defects in my first version (F-76, F-77). The fix for one F-77 case, a start that hangs, also made a race I had tested impossible (F-80).
- **Measurement caveat:** OCR timings in the Browser pane swung 4–5× with the Claude app's own CPU load (276% CPU), so the AC-064 timing moves to the user's Chrome.

### Nov 20: this log (D-76)
- The user asked for one place that records every flaw and improvement. This file was backfilled from the session logs and review reports, and updating it is now part of the end-of-task protocol (TASKS §2, CLAUDE.md).

---

## Lessons so far
1. **Review before you spend.** Every serious problem in the adversary spike (F-12 to F-17) was caught by an independent review *before* any limited call was made.
2. **Probe the real API early.** The schema rejection (F-18) and the 20-per-day quota (F-20) were invisible in the docs; one real call found both.
3. **Fail closed, and test that it fails closed.** The tripwire, the circuit breaker and the restart guards each stopped something real today.
4. **Ask an adversary to break it.** The skeptic agents found real defects (F-01, F-23) that the builders' own tests passed.
5. **Verify the fix, then verify that fix.** In T-054, each of the first three fix rounds introduced or exposed a new defect (a lock that could hang, a retry storm, a database created on a judge's fresh browser), and only the next verifier saw it. Rounds stop when a verifier finds nothing major, not when the fixer says done.
6. **Never truncate the work list.** Cutting the findings at a size limit dropped 6 of them silently (F-55). Reconcile every fixer table against the full findings list.
7. **Test the real background, not a white canvas.** OCR read synthetic text perfectly and missed half the tags on real street photos (F-54).
8. **Don't bound a library's input by bounding your own parser.** Read what the library actually walks, or give it only the small piece it needs (F-66).
