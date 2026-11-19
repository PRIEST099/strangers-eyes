# #BuildHybridAI 2026 — Idea & Build Plan

**Deadline:** Dec 1, 2026 00:00 GMT+2 (submit by **Nov 30**). 12 days left as of Nov 18. 3,200+ participants.
**Prizes:** $10k Grand, $7k, $4k, plus $3k each for Best Web / Android / iOS. Multi-platform apps get "strong consideration" for the Grand Prize.
**Judging (equal weight, as stated):** Technological Implementation (how well hybrid inference is used) · Design (complete product, not a PoC) · Potential Impact (specific real problem + audience) · Quality of Idea (creative, non-obvious, shows understanding of the domain).
**Must submit:** working app, public GitHub repo with an OSS license (Apache-2.0) that actually calls Firebase AI Logic, a YouTube demo of 3 minutes or less, a text description, and ideally a hosted URL.

---

## 1. What the platform actually allows (this shapes the idea)

| | Web (Chrome) | iOS (Apple FM) | Android (Nano) |
|---|---|---|---|
| Status | GA-ish, Chrome 139+, SDK v13 | **Experimental**, SPM only | **Experimental**, ML Kit beta |
| On-device context | ~9,216 tokens | 4,096 tokens | 4,000 tokens, under 256 output tokens advised |
| Structured JSON output | ✅ | ❌ ("coming soon") | ✅ |
| Image input | ✅ JPEG/PNG | ❌ | ✅ 1 bitmap |
| Multi-turn chat / tools | ❌ (single-turn only) | tools ✅ | ❌ |
| Audio / PDF | ❌ → cloud | ❌ | ❌ |
| Know which side ran | `response.inferenceSource` | session API | mode/status APIs |
| Cloud fallback default | `gemini-3.5-flash-lite` | any Gemini | any Gemini |

Key consequences:
- On-device models are **small, single-turn, short-context, and English-first**. They're good at extraction, classification, structuring and redaction. They're weak at long context, multilingual output and deep reasoning.
- Cloud is good at long context, multilingual output, reasoning and multi-turn chat.
- **The most convincing hybrid apps give each tier a *different job* because of those strengths**, rather than "on-device if available, else cloud" for the same prompt. Most entries will do the second thing (notes summarizer, journaling, chat). That's our opening.

---

## 2. Ideas considered and scored (1–5)

| # | Idea | Tech (hybrid use) | Design | Impact | Idea quality | Buildable in 12 days | **Total** |
|---|---|---|---|---|---|---|---|
| A | **Clinic copilot with a PHI firewall**: on-device structures notes, flags danger signs, and de-identifies; cloud reasons only on de-identified data; offline-first for low-connectivity clinics | 5 | 4 | 5 | 5 | 3.5 | **22.5** |
| B | "Redact" Chrome extension: on-device strips PII/secrets before you paste into any cloud chatbot, then puts it back | 5 | 4 | 4 | 4 | 4.5 | 21.5 |
| C | SMS / mobile-money scam shield (on-device scan, cloud escalation) | 4 | 4 | 4 | 3 (crowded) | 3.5 | 18.5 |
| D | Offline crop-disease / farm advisor from photos | 3 | 4 | 4 | 2 (cliché) | 3.5 | 16.5 |
| E | Private journaling / mental-health companion | 3 | 4 | 3 | 2 (crowded) | 4.5 | 16.5 |
| F | Notes app: summarize on-device, long docs to cloud | 3 | 4 | 2 | 1 (literally the example on the brief) | 5 | 15 |

**Pick: A, using B's redaction mechanism as its core.** It's the only idea that scores 5 on Impact *and* Idea, and its hybrid split is principled, not just a fallback.

Why A beats B: B has a great mechanism but a generic audience. A puts the same mechanism where it matters most (patient data), and adds a second real need, offline operation, that only hybrid AI can meet. That gives judges a specific audience, a specific constraint, and a specific reason each tier exists.

---

## 3. The product: **Muganga** *(working name; "doctor" in Kinyarwanda/Kirundi)*

> **An AI clinical copilot for low-connectivity primary-care clinics. It keeps working offline, and identifiable patient data never reaches a cloud AI model.**

### Problem (be specific in the pitch)
- Nurses at primary health centres in East Africa see 40–80 patients a day and spend a big share of that time on documentation.
- Connectivity is intermittent and mobile data is expensive. A cloud-only AI tool stops working exactly when the clinic is busiest.
- Health-data laws (e.g. Rwanda's 2021 data protection law, Kenya's DPA 2019) make clinics wary of sending patient records to third-party AI.
- So today's choice is "no AI" or "risky AI". Hybrid inference removes that trade-off.

### The core loop (what the demo shows)
1. **Capture.** A nurse types quick shorthand during the consult: *"Aline Uwase 4y F, fever 3d, cough, RR 52, not able to drink, Kicukiro, mum 078…"*
2. **On-device, instant, works offline:**
   - Structures the note into SOAP sections plus vitals JSON (on-device structured output).
   - **Danger-sign check**: the model extracts findings, then deterministic WHO IMCI-style rules decide (e.g. RR 52 at age 4 → fast breathing; "not able to drink" → general danger sign → *URGENT REFERRAL* banner). The LLM extracts and the rules decide, which is safer and explainable.
   - **PHI firewall**: the model finds names, phone numbers, IDs, villages and exact dates, and swaps them for tokens like `[PATIENT]`, `[PHONE_1]` and `[LOCATION_1]`. A regex/dictionary pass runs as a backstop.
3. **The "What leaves this device" panel** (the signature UI moment): a side-by-side diff of the original note and the de-identified payload, with a "0 identifiers sent" counter.
4. **Cloud, only with de-identified text, only when needed:**
   - Referral letter to the district hospital.
   - Patient-history summary across many visits (longer than the on-device context limit).
   - Discharge instructions translated into Kinyarwanda, Swahili or French (on-device models are English-first).
   - "Things to consider" decision support with guideline references.
   - The answer comes back with tokens, **and re-identification happens on-device**, so real names only ever exist locally.
5. **Offline mode**: on-device features keep working. Cloud jobs go into a visible queue ("3 tasks waiting for connection") and run automatically when the clinic is back online. Firestore offline persistence keeps patient records in sync.
6. **Router transparency**: every AI card shows a badge such as `On-device · 380 ms · 0 bytes sent` or `Cloud · de-identified · 2.1 s`. A small clinic dashboard shows the share of AI handled on-device, data saved, and identifiers blocked.

### Why judges should score it high
- **Tech:** it uses all four inference modes on purpose. `ONLY_ON_DEVICE` handles PHI work (it fails closed). `PREFER_ON_DEVICE` handles structuring. `ONLY_IN_CLOUD` handles long-context and translation, always gated by the firewall. `inferenceSource` drives the UI. Remote Config controls the routing policy, Firestore handles offline sync, Auth covers clinic staff, App Check is enforced, and the app is on Firebase Hosting.
- **Fails safe:** if a device has no on-device model, the app falls back to the deterministic redactor and asks the clinician to confirm before anything is sent. A Remote Config "strict privacy" switch can disable cloud AI entirely.
- **Measured, not claimed:** an evaluation harness over about 60 synthetic clinical notes reports PHI leak rate, danger-sign recall and on-device share. Real numbers in the video set the entry apart.

### Safety / scope guardrails (judges will look for this)
- It's a documentation and triage-support tool, not a diagnosis tool. Danger-sign logic is rule-based and cites the rule, and the clinician always confirms.
- **Synthetic patient data only** in the repo, demo and video.

---

## 4. Platforms

**Platform 1: Web (Chrome).** Clinic desktops and laptops, and the main product. Hosted on Firebase Hosting for judges. Judges without on-device Nano still get a working app through the cloud path plus the deterministic redactor, and the UI explains why.

**Platform 2: a mobile app for community health workers / home visits** (capture, danger signs, firewall, offline queue), sharing the same Firestore. Which OS depends on hardware (see the open decision below):
- **Android** fits the audience best, since East African health workers mostly use Android. On-device Nano needs a supported physical phone (Pixel 9/10, recent Galaxy S, etc.). The emulator has no on-device model.
- **iOS** can actually run Apple's on-device model **in the Simulator on this Mac** (M1 with Apple Intelligence enabled), so we can build and demo it here without extra hardware. On-device has no structured output on iOS, so it uses `@Generable`/prompted JSON plus validation.

Being on two platforms is what makes the app eligible for the Grand Prize "strong consideration".

---

## 5. Architecture

```
┌──────────────── Device (web / mobile) ─────────────────┐
│ Note editor ──► On-device model (Nano / Apple FM)       │
│                 ├─ structure → SOAP + vitals JSON       │
│                 ├─ extract findings → IMCI rules engine │
│                 └─ detect PHI → token map (stays local) │
│ Regex/dictionary redactor (backstop + no-model path)    │
│ Router (policy from Remote Config)                      │
│   └─ cloud job? → de-identified payload only ──────────┼──► Firebase AI Logic → Gemini (cloud)
│ Re-identifier (token map → real names, local only) ◄───┼─── response with tokens
│ Offline job queue  │  Firestore (offline persistence)   │
└─────────────────────────────────────────────────────────┘
   Auth (clinic staff) · App Check (reCAPTCHA Enterprise / DeviceCheck/App Attest, debug in dev) · Hosting
```

**Web stack:** Vite + React + TypeScript + Tailwind, `firebase` JS SDK v13+ (`firebase/ai`, `firestore`, `auth`, `app-check`, `remote-config`), installable PWA so it can load offline.
**iOS stack:** SwiftUI, firebase-ios-sdk v12.13+ via SPM (`FirebaseAILogic`, `FirebaseAppCheck`, Firestore, Auth, Remote Config), `HybridModel(primary: SystemLanguageModel.default, secondary: gemini)`.
**Android stack (if chosen):** Kotlin + Compose, `firebase-ai` + `firebase-ai-ondevice`, `OnDeviceConfig(mode = PREFER_ON_DEVICE)`.

**Firestore model:** `clinics/{clinicId}/patients/{id}`, `.../encounters/{id}` (structured note, flags, status), `.../cloudJobs/{id}` (de-identified payload, status, result). The token map is **never** written to Firestore; it lives only in device storage.

**Remote Config keys:** `cloud_ai_enabled`, `strict_privacy_mode`, `cloud_model`, `ondevice_max_tokens`, `translation_languages`, `require_confirm_without_ondevice`.

---

## 6. 12-day schedule

| Day | Date | Work |
|---|---|---|
| 0–1 | Nov 18–19 | **De-risk spikes:** Firebase project plus web/iOS app registration, App Check debug tokens. Confirm Gemini Nano runs in your Chrome on this M1 with 8 GB RAM (`chrome://on-device-internals`, plus the "Gemma 4 / built-in AI" flags Firebase pointed to on Discord). Confirm Foundation Models runs in the iOS Simulator. Run a hello-world hybrid call on each and log `inferenceSource`. Create the repo with Apache-2.0. |
| 2–3 | Nov 20–21 | Web: note editor, on-device structuring (JSON schema), IMCI rules engine with tests, patient and encounter screens |
| 4–5 | Nov 22–23 | Web: PHI firewall (LLM + regex), "What leaves this device" diff, router, cloud tasks (referral, summary, translation), on-device re-identification |
| 6 | Nov 24 | Offline queue, Firestore persistence, Auth, Remote Config policy, Hosting deploy, PWA |
| 7–9 | Nov 25–27 | Mobile app (iOS or Android): capture → structure → danger signs → firewall → queue, on the shared Firestore |
| 10 | Nov 28 | Eval harness on synthetic notes (leak rate, danger-sign recall, on-device %). Dashboard. Polish. |
| 11 | Nov 29 | Design pass, README (value proposition, setup, architecture), Devpost write-up |
| 12 | Nov 30 | 3-minute demo video (story: busy clinic → network drops → keeps working → firewall diff → referral in Kinyarwanda → numbers), submit with buffer |

**Cut list if behind:** Android/iOS goes down to capture + danger signs + firewall only. The dashboard shrinks to the badges. Translation drops to one language.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Gemini Nano may not run in Chrome on an **8 GB M1** (Chrome wants more than 4 GB VRAM or 16 GB RAM) | Check on Day 0. If it doesn't run, use the Gemma-4 built-in AI flag, or record the web on-device demo on another machine. The cloud path still works for judges either way. |
| iOS and Android hybrid are *Experimental* | Pin SDK versions, and keep the mobile scope small |
| Free-tier Gemini API terms allow training on data | It's a *feature* of our design that only de-identified text is ever sent. Mention switching to the Vertex AI backend for production. |
| Medical-claims concerns | Frame it as documentation and triage support with rule-cited flags, a clinician confirms everything, synthetic data only |
| Judges' devices lack on-device models | Hosted app degrades gracefully and explains it. The video shows the on-device path. |

---

## 8. Open decisions for you
1. **Second platform:** Android (better fit for the audience, needs a supported physical phone) or iOS (demo-able on this Mac today)?
2. **Name:** "Muganga" or something else?
3. **Domain input:** if you have real clinic workflow insight (forms, referral formats, daily patient volumes), it would make the "genuine understanding of the problem space" criterion much stronger. Synthetic data only, though.
