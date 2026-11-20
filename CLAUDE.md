# Strangers' Eyes: project context for every Claude session

> **You are the builder.** Claude Code writes all the code for this hackathon entry, across many sessions.
> Your memory does not carry over between sessions, so **these files are the memory.** Read them and keep them current.

## What this is
- **Hackathon:** #BuildHybridAI 2026 (Devpost / Google Firebase).
  - **Hard deadline:** Nov 30 14:00 PT (= Dec 1 00:00 GMT+2).
  - **Internal deadline:** submitted by Mon Nov 30 12:00 GMT+2.
  - Judging runs Dec 10–16, so the hosted app must stay up until then.
- **Product:** *Strangers' Eyes*, "See your photo the way a stalker's AI would, before you post it."
  - The **cloud** (Gemini via Firebase AI Logic) plays the attacker on a **redacted** copy of a photo.
  - An **on-device** model (Gemini Nano in Chrome / Apple Foundation Models on iOS) compares the attacker's guesses with a private **vault** (home and work pins, kids' names, employer) that never leaves the device. It then plans the fix, and the cloud re-attacks to confirm.
  - **"The attacker never learns whether it guessed right."**
- **Platforms:** Web PWA (primary, hosted on Firebase Hosting) and iOS (SwiftUI, runs Apple FM in the Simulator). **Android is cut.**

## Protocols
- **Session start:** follow `docs/TASKS.md` §1 exactly. In short:
  1. Read `docs/PROGRESS.md` (STATE, WIP, USER pending, Decisions, latest session).
  2. Check for a crashed session.
  3. Remind the user of due `[USER]` tasks.
  4. Pick the next task (TASKS §0.5).
  5. Read only that task's **Read:** sections.
- **Session end** (and after every finished task): follow `docs/TASKS.md` §2 exactly:
  1. Verify.
  2. Tick the task with its evidence.
  3. Update the PROGRESS STATE and session log.
  4. Log decisions as the next free D-number (the PROGRESS Decisions log says which; D-59 as of Nov 19) and edit the affected doc in the same session.
  5. Append to `docs/DEVLOG.md`: a dated entry, plus an `F-nn` ledger row for every flaw found, including your own mistakes (D-76).
  6. Commit with explicit pathspecs.
- **Never Read a whole doc.** The docs total about 800 KB. Grep for the task ID (`T-0xx`), AC ID (`AC-xxx`), `D-nn`, `U-xx` or the § heading, then Read with offset/limit.
- **Which doc wins:**
  1. These invariants.
  2. The PROGRESS Decisions log.
  3. SPEC (behaviour, ACs, copy).
  4. ARCHITECTURE (paths, types, RC keys, prompts, rules).
  5. API-NOTES (how the SDKs really behave).
  6. RUNBOOK.
  7. TASKS.
  8. `PLAN.md` and `research/` are **history only**.
- **AC IDs** are SPEC's three-digit `AC-xxx`. **Never guess SDK names:** check `docs/API-NOTES.md` first. Verify `[UNVERIFIED]` items, then flip their tag.
- Tasks marked `[USER]` are for the human: remind them, never do them. When a USER task blocks you, work on something unblocked (TASKS §0.5).

## Invariants: never break these
1. **Vault data never leaves the device.** It is never sent to any AI call that could reach the cloud, never written to Firestore, never logged remotely, never put in analytics.
2. **The original, unredacted photo never leaves the device.** The cloud only receives an EXIF-free copy with faces and vault-matched text solid-masked, after the user consents to the exact image shown.
3. **Routing by payload class** (from Remote Config `routing_policy`; code enforces a hard floor that RC can never loosen):
   - **S0** (touches the vault) and **S1** (original photo): `ONLY_ON_DEVICE`, and **fail closed**. Immediately before every S0/S1 call, check that `LanguageModel` exists and its `availability()` is `'available'`, with no cache. Otherwise run deterministic code labelled **RULES-ONLY**. This is necessary because, without `window.LanguageModel`, the web SDK silently sends even `ONLY_ON_DEVICE` to the cloud. **Never** fall back to the cloud.
   - **S2** (public explanations): `PREFER_ON_DEVICE`, with a real cloud fallback. An S2 payload containing a vault string is reclassified to S0.
   - **S3** (adversary): `ONLY_IN_CLOUD`.
   - **S4** (synthetic Judge Mode samples): `PREFER_ON_DEVICE`.
4. **Every** Firebase AI Logic call goes through the single `EgressGate` wrapper. It checks the class, re-checks the bitmap (no faces, no vault OCR hits, no APP1/APP13/GPS metadata), scans the prompt for vault strings, and writes a `LedgerEntry`. **There are no direct `generateContent` calls anywhere else**; `scripts/check-boundaries.mjs` enforces this.
5. **Distances and geometry are code, not the LLM** (haversine plus bands). The UI shows distance bands to the user's own pins, **never** a map pin or an address for the attacker's guess.
6. Masks are solid fills, never blur. Say "Risk reduced", never "safe". Always show confidence.
7. If Gemini refuses, show "on-device findings only". **Never** retry with jailbreak or role-play phrasing. Never re-attack after a decline or safety block.
8. **Grounded pass A is display-only.** It is never parsed, cached, persisted or fed to code. Only the ungrounded pass B JSON feeds the referee, the fix planner, the Leak Atlas and the benchmark.
9. No real people, no real homes or schools in sample, demo or benchmark images. Photos must be synthetic, builder-owned, or **openly licensed (CC0 / public domain / CC BY / CC BY-SA) photos of public places** with no identifiable people. Openly licensed ones are for spikes and benchmarks only: they are kept in PRIV with a `SOURCES.md` attribution file and are never used as Judge Mode or demo samples (D-71). Photos come from local files only, never from a URL.
10. Never type passwords or API secrets into web pages. Account sign-ins, billing, consoles and Devpost submission are `[USER]` tasks. The Firebase web config is not secret and may be committed.
11. On 8 GB RAM, never run Chrome Gemini Nano and the Simulator's Foundation Models at the same time. Run `xcrun simctl shutdown all` before Nano work.

## Where things live
```
PLAN.md                    overview and the tournament (history; superseded where it conflicts with docs/)
CLAUDE.md                  this file
docs/PROGRESS.md           STATE, WIP, USER pending, key values, gate results, Decisions log, session log
docs/DEVLOG.md             development log: dated narrative + flaw ledger (F-nn: found by, severity, fix) + lessons; public-safe
docs/TASKS.md              every task (T-001..T-209) with Deps/Read/Files/Do/Verify; schedule; USER board; cut order
docs/SPEC.md               product contract: D-01..D-39, screens SCR-xx, copy, safety SR-xx, AC-xxx
docs/ARCHITECTURE.md       layout, types, gate algorithm, prompts, RC keys, Firestore rules, iOS module map
docs/API-NOTES.md          verified SDK behaviour, version pins (§11), UNVERIFIED register (§10)
docs/RUNBOOK.md            USER console steps, local dev, deploy, benchmark, filming, submission, troubleshooting
research/day1-artifacts/   verified reference code from Day 1 (port from it; see its README)
research/_vendor-docs/     third-party docs (git-ignored)
web/ ios/ shared/ benchmark/ tests/   app code (ARCHITECTURE §3)
```
- **Private data:** real photos, `truth.csv` and raw results with coordinates live in **`/Users/mac/StrangersEyes-private/`** (PRIV: `spike/ bench/ scenes/ gate-test/ test/ raw/ video/`), outside the repo. Never copy anything from PRIV into the repo.
- **Secrets:** `web/.env.development.local`, `ios/.appcheck-debug-token` and `ios/Config/Secrets.xcconfig` are all git-ignored. Never commit them, print them, or put them in PROGRESS.

## Conventions
- TypeScript strict. Small pure functions for the gate, bands and parsers, with Vitest tests. Prompts live in `shared/prompts/` and UI copy in `shared/strings/en.json`, never inline.
- `npm --prefix web run check` (typecheck + `scripts/check-boundaries.mjs` self-test and scan + Vitest) must be green before ticking a task; `npm run build` also runs `scripts/check-dist.mjs`. Never weaken a boundary rule to make code pass: fix the code, or log a decision and update ARCH §4.2.
- No `temperature` (Gemini 3.x ignores it). Pin model IDs in RC. firebase-ios-sdk is pinned to **exactly 12.19.3**. All version pins are in API-NOTES §11.
- Show the inference source (`ON_DEVICE` / `IN_CLOUD` / `RULES_ONLY`) and latency for **every** AI call in the Router HUD.
- Git:
  - Commits wait for the user's approval (T-018d).
  - Use explicit pathspecs; **never `git add -A` or `git add .`**
  - Messages start with the task ID.
  - Never commit secrets, real photos or coordinates.
- If a fallback decision is triggered (e.g. the Day-1 adversary spike G1 fails, so switch to "Blindfill"), record it in PROGRESS.md and **ask the user before pivoting**.
