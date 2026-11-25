# Illustrations (web/public/art)

Decorative illustrations used in the app and the demo video (D-170, D-171): `hero` is the base picture of the animated HeroLoop on Welcome and Home, `check` sits in the Check drop zone, `gate` on About, `bg-dark`/`bg-light` are the page background, and `vault` is used only in the video (the Vault screen loads no image at all; a test guards that).

| File | Shows | Source |
|---|---|---|
| `hero.webp`, `hero-768.webp` | A phone (violet, this device), a wall with one gate, a masked copy crossing it, and a cloud with one eye (blue) looking at the copy | Generated for this project on Nov 25 2026 with Figma's AI image generation (model `gpt-image-2.5-flare`) |
| `check.webp` | A phone on which two blank signs in a generic street photo are being covered by solid black masks | Same |
| `vault.webp` | A violet safe inside a phone outline holding a house token, a briefcase token and a blank name tag | Same |
| `bg-dark.webp`, `bg-light.webp` | Abstract page backgrounds: a violet glow top-left, a blue glow on the right, a faint dot grid (dark and light themes) | Same (Nov 25 2026). A first pair drew a thin vertical line that ran through the headline and was discarded |
| `gate.webp` | A wall between a violet side (padlock, masked photo card) and a blue side (cloud with one eye); the cloud's "?" is stopped at the wall | Same |

Rules followed (CLAUDE.md invariants 5, 6, 9):
- No real people, no real homes or schools, no real landmarks. The street scenes are generated, not photographs of real places.
- No map, pin or dot for the attacker's guess. A first hero draft drew location dots on a map grid and was discarded.
- Masks are solid black.
- The prompts asked for no text, numbers or logos.

Each file was converted to WebP with `cwebp -metadata none`, so no metadata is stored. They are decoration (`alt=""`, `aria-hidden`); the copy next to each one carries the meaning.
