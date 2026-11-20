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

### Nov 20: this log (D-76)
- The user asked for one place that records every flaw and improvement. This file was backfilled from the session logs and review reports, and updating it is now part of the end-of-task protocol (TASKS §2, CLAUDE.md).

---

## Lessons so far
1. **Review before you spend.** Every serious problem in the adversary spike (F-12 to F-17) was caught by an independent review *before* any limited call was made.
2. **Probe the real API early.** The schema rejection (F-18) and the 20-per-day quota (F-20) were invisible in the docs; one real call found both.
3. **Fail closed, and test that it fails closed.** The tripwire, the circuit breaker and the restart guards each stopped something real today.
4. **Ask an adversary to break it.** The skeptic agents found real defects (F-01, F-23) that the builders' own tests passed.
