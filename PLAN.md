> **Superseded where it conflicts with `docs/`.** See `docs/TASKS.md` §0.1. PLAN.md is stale on: temperature 0, the iOS SDK version (pin exactly 12.19.3), pass B reading pass A, Firestore holding Judge Mode data, a Day-1 iOS tool-call spike, filming on Nov 30, and "Spark works". Start from `CLAUDE.md` and then `docs/PROGRESS.md`.

# #BuildHybridAI 2026: Idea & Build Plan (v2)

**Deadline:** Dec 1, 2026 00:00 GMT+2, so submit by **Nov 30**. That leaves 11 build days (Nov 19–30).
**Judging criteria:** Technological Implementation (how well hybrid inference is used) · Design (a complete product) · Potential Impact (specific real problem and audience) · Quality of Idea (non-obvious, shows understanding of the domain). Apps on more than one platform get "strong consideration" for the $10k Grand Prize.
**Submission:** working app (hosted URL encouraged), public repo under Apache-2.0 that actually calls Firebase AI Logic, a YouTube demo of 3 minutes or less, and a write-up.

> v1 (Muganga, a clinic copilot) is archived in `research/PLAN-v1-muganga.md`. The full tournament data is in `research/idea-tournament.json`.

---

## 1. How the idea was chosen

The tournament had 29 agents. Six ideators each looked through a different lens (privacy split, always-on/high-frequency, Chrome-native, accessibility, verification/meta, contrarian wildcards) and produced 24 ideas. A shortlister cut those to 6 finalists plus the Muganga baseline. Each finalist then got three independent reviews: a simulated Firebase judge who has "seen 300 summarizers", a **red team** that searched the web for competitors and checked every capability claim against the real on-device limits, and a demo/video producer. A synthesizer ranked them and picked the winner.

| Rank | Finalist | Judge avg (T/D/I/Q) | Red team | Composite | Why it won or lost |
|---|---|---|---|---|---|
| **1** | **Strangers' Eyes**: see your photo the way an AI stalker would, before you post | 7.9 (7/8/8/8.5) | viable | **8.18** | Global by construction (anyone who posts photos), the least crowded space, a visceral demo, and a hybrid split that comes from the problem itself |
| 2 | Blindfill: the cloud reads the blank form, only your device reads your passport | 8.1 | risky | 7.98 | Collides with Google's own Chrome autofill and "Find and fill with Gemini" in front of Google judges, and many Nano form-fillers already exist |
| 3 | Asking For A Friend: real legal problem becomes an anonymous hypothetical before any AI sees it | 7.25 | viable | 7.65 | Most honest hybrid split, but judges can't try the core without Nano, and it carries legal-accuracy liability |
| 4 | Utter: AAC keyboard, a few taps become full sentences | 7.5 | risky | 7.30 | "AAC Board AI" already **won Google's Chrome Built-in AI Challenge 2025**, and Apple FM may refuse sensitive vocabulary |
| 5 | Denominator: adds the missing baseline to every statistic you read | 7.25 | risky | 7.25 | Audience too broad, caching grounded results breaks the Search terms, and the fact-check genre is crowded |
| 6 | Telegraph: AI codec for satellite/SMS messages | 7.0 | risky | 7.00 | The 160-character pain is disappearing (inReach 1,600 chars), and the satellite hop can't be demoed honestly |
| 7 | Muganga (v1 baseline) | 6.5 | **kill** | 5.00 | Region-bound. The target clinics' hardware can't run on-device models, so `PREFER_ON_DEVICE` sends raw patient data to the cloud. Crowded, plus medical-device baggage |

18 more ideas were dropped with reasons (spoiler blocker, feed filter, Easy-Read, subscription finder, and others). See `research/idea-tournament.json` → `dropped`.

---

## 2. The product: **Strangers' Eyes**

> **"See your photo the way a stalker's AI would, before you post it."**
> The cloud plays the attacker. Your device holds the answers. **The attacker never learns whether it guessed right.**

### Problem (global, the same in every country)
- Platforms strip GPS data, so people feel safe. But multimodal AI now geolocates photos **from the pixels alone**: street signs, bus-stop codes, paving, school crests, lanyards, window views, even reflections. The April 2025 "o3 reverse location search" trend made this a party trick, and GeoSpy and Picarta sell it as a service.
- Nobody can see what an adversary could infer from their photo, and **no tool knows what *you* specifically need to hide**: your home, your workplace, your kid's name.
- Audience: everyone who posts publicly. Hero personas are **parents** (school-run photos), **marketplace sellers** (photos of rooms in their homes), and **creators**. Highest-need users are domestic-violence survivors, journalists and activists.

### Why hybrid is essential (the core insight)
- **Attacking** a photo needs world-scale visual knowledge plus Search, and only the cloud has that.
- **Judging** the attack needs your secrets (home pin, kids' names, employer), which must never leave the device.
- So the split falls exactly there. The cloud attacks a *redacted* copy, and an on-device referee compares its guesses with your private vault. The cloud never sees the vault or the verdict.

### Core loop
`Vault (device) → pre-screen + pre-mask (device) → red-team the redacted copy (cloud) → referee (device) → fix (device) → re-attack (cloud) → "Risk reduced"`

### Routing by sensitivity class (stored as data in Remote Config, enforced by an Egress Gate)

| Class | What it covers | Web mode | iOS | If no on-device model |
|---|---|---|---|---|
| S0 | Anything touching the vault (referee, fix plan) | `ONLY_ON_DEVICE` | on-device-only session | deterministic code, **never cloud** |
| S1 | The original, unredacted photo (pre-screen) | `ONLY_ON_DEVICE` | on-device-only session | rule-based Tier-0 checks, **never cloud** |
| S2 | Public content (clue explanations) | `PREFER_ON_DEVICE` | `HybridModel` | **real automatic cloud fallback**, badge shown |
| S3 | The adversary | `ONLY_IN_CLOUD` (image + Search grounding) | same | none |
| S4 | Synthetic Judge Mode gallery | `PREFER_ON_DEVICE` | — | cloud, so judges see every step |

Every Firebase AI Logic call goes through **one wrapper (the Egress Gate)**. It refuses S0/S1 payloads on any mode that can reach the cloud. It re-checks the outgoing image: 0 faces, 0 OCR matches against the vault, no EXIF. It scans the prompt for vault strings, and writes a **Cloud Ledger** entry (bytes, class, model, `inferenceSource`, latency). The demo deliberately tries to leak a name and the gate visibly blocks it.

### On-device jobs
- **Tier-0, deterministic, runs in every browser:** strip EXIF by re-encoding, MediaPipe face detection (solid masks), Tesseract.js OCR fuzzy-matched against the vault, and regex for plates, house numbers and phone numbers. This is why the privacy promise holds **even without Nano**.
- **Nano pre-screen (S1):** the original image plus a JSON schema lists location clues by type, region and severity. A second prompt matches visible text against vault *labels*. Nano and Tesseract act as two independent readers, and either one alone triggers a mask.
- **Nano referee (S0):** takes the adversary's inferences and the vault labels and returns structured matches ("lanyard logo: City General" ↔ vault "work"). **Distances are code, not the LLM**: haversine distance to your pins, shown as bands (street ≤250 m, neighbourhood ≤1 km, district ≤5 km, city, country).
- **Nano fix planner (S0):** the smallest set of masks that breaks the inferences, plus a plain-language explanation.
- **iOS:** Apple FM has no image input, so Vision (faces, OCR, scene labels) handles the pixels and FM reasons over the text. That covers pre-screen, referee and fix plan in an on-device-only session, plus `HybridModel` for the public explainer.

### Cloud jobs (Gemini via Firebase AI Logic, model name in Remote Config, temperature 0)
- **Adversary pass A:** streamed, **Search-grounded** "privacy audit commissioned by the photo's owner, scene only" investigator notes, shown with source chips.
- **Adversary pass B:** ungrounded structured JSON with up to 3 hypotheses (lat, lng, radius, confidence), clue boxes (`box_2d`) and inferences (workplace, school, home area…). Two passes because grounding plus a JSON schema in one call is flaky.
- **Re-attack** on the fixed image.
- The cloud **never** receives the vault, the pins, names, unmasked faces, EXIF, the original photo, or the verdict.

### Signature demo moment
Split screen: the verdict turns red ("Identified your WORKPLACE by name · Home: within 1 km · Child's name: caught and masked on this device") while the Ledger still reads **"Faces sent: 0 · Vault items sent: 0"**. Then a forced leak gets **BLOCKED**. Then one tap Fixes it, the re-attack returns "Country only, low confidence", and the verdict goes 🟢 **Risk reduced**. Closing line: *"The stalker never learns it was right."*

### Judges without on-device AI (most of them)
- A first-run **capability panel** shows what runs where in *this* browser.
- Without Nano, the app runs Tier-0, the cloud adversary and a deterministic referee. **The full red-to-green loop still works and the original photo still never leaves.** Badges say "rules-only".
- **Judge Mode:** one click loads 3 synthetic scenes and a fake vault, and the whole loop runs in about 60 s.

### Safety & ethics (judges at Google will look for this)
- Faces are always masked before any cloud call, and there are no people in the demo photos.
- Prompts say "privacy audit, scene only". If Gemini refuses, the app shows "on-device findings only" and **never retries with jailbreak phrasing**.
- **Dual use:** local files only (no URL input). The UI shows only distance bands *to your own pins*, never a map pin or address for the guess. App Check, per-user AI Logic limits, and a Remote Config daily cap and kill switch.
- Claims say "risk reduced", never "safe"; use bands, never metres; and always show confidence.
- The no-training tier or Vertex backend, consent for every photo showing the exact outgoing image, and a "burn vault" button.
- **Prior art is cited honestly** (arXiv 2503.20226, Geo-Safe-Filter). What's new is the private vault as ground truth, a referee the attacker never sees, an enforced egress gate, and routing by sensitivity class.

### Measured, not claimed
A 25-photo benchmark in the repo, using the builder's own photos with no people: the share located within 1 km and within 5 km **before vs after the fix**, refusal rate, clue recall for Nano vs Tier-0 vs cloud, p50/p95 latency per tier, and on-device vs cloud calls per session. Publish whatever the numbers turn out to be.

---

## 3. Platforms & stack

| | Web (primary, what judges try) | iOS (on-device showcase) |
|---|---|---|
| Stack | Vite + React + TS + Tailwind PWA, `firebase` JS SDK v13 (`firebase/ai` hybrid), MediaPipe tasks-vision, Tesseract.js | SwiftUI, firebase-ios-sdk ≥12.13 via SPM (`FirebaseAILogic`), Vision, Core Image, CoreLocation |
| On-device model | Gemini Nano. **Already downloaded on this Mac** (v3Nano, 4 GB) | Apple Foundation Models (runs in the Simulator on this M1) |
| Prize lanes | Best Web/Chrome + Grand | Best iOS + multi-platform Grand bonus |

Android is cut: there's no physical device, and the emulator has no Nano. One roadmap line in the README notes it.

**Firebase products:** AI Logic (hybrid, image input, grounding, per-user limits) · **App Check** (reCAPTCHA Enterprise on web, App Attest or debug on iOS) · **Anonymous Auth** (quotas with no identity) · **Remote Config** (routing policy, prompt versions, model names, distance bands, caps, kill switch; cached for offline use) · **Firestore** (opt-in anonymous "Leak Atlas" counters by clue *type* only, plus Judge Mode sample metadata) · **Hosting**.

---

## 4. Schedule

| Day | Date | Work | Gate |
|---|---|---|---|
| 1 | Nov 19–20 | **Go/no-go spikes:** (a) Firebase project + App Check debug. (b) **Cloud adversary on 10 of your own people-free photos**. Pass = at most 2 refusals and at least 4 placed within 5 km. (c) Nano image + JSON schema through the hybrid SDK in Chrome 157. (d) iOS Simulator: on-device-only session, `HybridModel`, a tool call. Repo + Apache-2.0. | If (b) fails, switch to **Blindfill** on Day 2. The router, Egress Gate and Ledger carry over. |
| 2–3 | Nov 21–22 | Web: vault (encrypted IndexedDB, geolocation pins), Tier-0 guard, Nano pre-screen, consent sheet | |
| 4–5 | Nov 23–24 | Web: adversary A/B with streaming and grounding chips, referee + distance bands, verdict card, fix planner, masking, re-attack, Egress Gate, Ledger, Router HUD | Full loop works by Nov 24 |
| 6 | Nov 25 | App Check, Anonymous Auth, Remote Config policy, Firestore, Judge Mode, offline PWA, Hosting deploy | Hosted URL live |
| 7–9 | Nov 26–28 | iOS app (vault, Vision Tier-0, FM pre-screen/referee/fix, HybridModel explainer, cloud adversary, Ledger) and run the benchmark | |
| 10 | Nov 29 | Design polish, README (value proposition, architecture, setup, benchmark), Devpost write-up. Stretch only if green: a one-site Chrome extension "check before you post", an iOS Share Extension | |
| 11 | Nov 30 | Film each beat separately (never Simulator FM and Chrome Nano at the same time on 8 GB), edit the 3-minute video, **submit** | |

**Cut order if behind:** stretch features → iOS explainer → Firestore Leak Atlas → grounding chips (keep pass B only).

---

## 5. Top risks

| Risk | Mitigation |
|---|---|
| Gemini refuses or hedges on geolocation | Privacy-audit, scene-only framing with faces pre-masked. Day-1 go/no-go, and Blindfill as the fallback |
| Geolocation quality is uneven | Temperature 0, pinned model, bands plus confidence, "risk reduced" never "safe", pre-test the demo photos 10× |
| The hybrid looks thin | Give Nano/FM real semantic work (clue reading, vault matching, fix planning), use S2 `PREFER_ON_DEVICE` so automatic fallback is visible, and show `inferenceSource` on every call |
| iOS hybrid SDK is Experimental | Spike on Day 1. Line-format parsing if tool calls fail |
| Demo could dox the builder | Never film your real home or a real school. Use a fictional "LUCAS" tag, a prop lanyard, and a public building as the "home" pin |
| Scope for 11 days | Web loop first, then Firebase hardening, then iOS, then benchmark, then stretch |

---

## 6. What I need from you to start
1. **Go-ahead on Strangers' Eyes** (or pick the runner-up, Blindfill).
2. **A Firebase project.** Create one (free Spark plan works for text, but image input plus Search grounding plus the no-training tier probably needs **Blaze**), or let me guide you. I'll need you to sign in to the Firebase console. I won't handle credentials.
3. **About 10 of your own people-free outdoor photos** (street corners, doorsteps, shop fronts) for the Day-1 adversary test.
4. Make sure Apple Intelligence is enabled on this Mac (System Settings → Apple Intelligence) so the iOS Simulator can run Foundation Models.
