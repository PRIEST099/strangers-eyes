# The sealed answer, opened offline (Judge Mode "Prove it offline", Nov 27)

**What it is (D-182).** In Judge Mode, the "Prove it offline" switch holds the cloud attacker's first answer on the device, unchecked. The judge turns the connection off and opens it: only then does the device check the guess against the made-up family's places, with no network. A stamp then shows what the Cloud Ledger recorded while the connection was off. "Open it now" checks it the usual way, with no stamp.

**Question (pre-registered in the private protocol before any run).** Opened with the connection off, does the guess check run on the device, and does anything try to leave?

**Method.** `scripts/measure-sealed.mjs`: the local DEV build in headless Chrome with Gemini Nano, a fresh browser profile per run, Judge Mode with autoplay and the switch on, and the app's "Simulate offline" setting on so the first answer was the recorded Nov 23 one (no live attack). At the sealed card the script cut the page's network with Chrome's own offline emulation (the page sees `navigator.onLine = false` and an `offline` event, as with Wi-Fi off), clicked "Open it offline", waited for the verdict and the stamp, and logged every request the page attempted while offline. Three samples, 5 runs each, all reported.

## Results

| | 15 runs |
|---|---|
| Card said "CONNECTION: OFF" once the network was cut | 15 |
| Guess check ran ON-DEVICE (Gemini Nano) | **15** |
| Stamp: on-device AI calls / simple-rules checks / cloud AI calls | 1 / 0 / **0** in every run |
| Requests the page attempted while offline (any host) | **none** |
| From "Open it offline" to the verdict | 3.2–5.6 s |

Per sample: station 5/5, level crossing 5/5, castle 5/5, all identical on the counts above.

**What this does and doesn't show.** It shows where the check ran: on the device, with the network cut, in 3–6 s, and that the page didn't even try to reach a server meanwhile. With the network cut a cloud call cannot complete, so the stamp's 0 is a check that the app behaved, not extra evidence about what is sent when online; that is what `docs/egress-measurement.md` measures. The cut was Chrome's offline emulation on one machine, not the operating system's Wi-Fi switch (a judge can use the real switch). The first answers were recorded ones. Without Nano in the browser, the offline check runs as simple rules instead (shown as RULES-ONLY on the stamp).

Raw log: private (`raw/sealed-2026-11-27T10-05-00.json`, UI text only).
