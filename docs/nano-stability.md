# How stable are the on-device verdicts? (Gemini Nano, Judge Mode, Nov 27)

**Question.** With Gemini Nano doing the guess check, one Judge Mode sample (the level crossing) ended "Still exposed" in the video and "Risk reduced" in a gallery shot. How often does each sample end each way?

**Method (pre-registered in the private protocol before any run).** Each of the three Judge Mode samples was run end to end 10 times by `scripts/measure-nano-stability.mjs`: the local DEV build, Judge Mode with autoplay, Gemini Nano on in headless Chrome, and the app's own "Simulate offline" on, so the recorded Nov 23 attacker answers replayed (CACHED SAMPLE) and no cloud call was made. Every run used a fresh browser profile. The script recorded the first verdict, the final outcome and the Cloud Ledger counters. 30 runs, all reported.

## Results

| Sample | First verdict | Final outcome (10 runs) | On-device AI calls per run | Rules-only fallbacks | Requests to an AI host |
|---|---|---|---|---|---|
| Station forecourt | amber, 10 of 10 | **Still exposed** 10 of 10 | 3 | 0 | 0 |
| Level crossing | amber, 10 of 10 | **Still exposed** 6, **Risk reduced** 4 | 3 | 0 | 0 |
| Castle with the lunchbox | red, 10 of 10 | **Nothing a mask can remove** 10 of 10 | 2 | 0 | 0 |

- Two of the three samples gave the same outcome in every run. Every on-device step ran on Gemini Nano in all 30 runs (no fallback to rules), and no run sent anything to an AI host.
- The level crossing is the one that varies. After the fix, the attacker can only name the city. When Nano links the made-up workplace (which is in that city) to the guess, the app's strict rule keeps it at "Still exposed"; when it doesn't, the level drops and the app says "Risk reduced". That happened 6 times and 4 times out of 10. Both readings are honest; the app never says "safe".
- Time from picking a sample to the final outcome: station 44–52 s, level crossing 56–94 s, castle 30–41 s (headless Chrome on an 8 GB M1, Nano on the CPU).

**Limits.** Three samples, one machine, one Nano version, recorded attacker answers (so this measures the on-device half only). Without Nano, the guess check runs in the cloud or as rules and was not measured here.

Raw log: private (`raw/nano-stability-2026-11-27T07-01-19.json`, UI text only).
