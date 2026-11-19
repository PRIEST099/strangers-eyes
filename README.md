# Strangers' Eyes

**See your photo the way a stalker's AI would, before you post it.**

> Work in progress. Built for the #BuildHybridAI 2026 hackathon (Firebase AI Logic hybrid inference).

The cloud (Gemini through Firebase AI Logic) plays the attacker on a **redacted** copy of your photo. An **on-device** model compares the attacker's guesses with a private vault (your home and work pins, the names you care about) that never leaves your device. It then plans a fix, and the cloud attacks again to confirm the risk dropped. The attacker never learns whether it guessed right.

- Web PWA (Chrome built-in Gemini Nano + Gemini in the cloud)
- iOS (Apple Foundation Models + Gemini in the cloud)

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
