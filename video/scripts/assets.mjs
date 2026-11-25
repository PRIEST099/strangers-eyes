// Copy the stills the composition shows into public/img (git-ignored: the originals live in the repo already).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/img', { recursive: true });
const files = {
  'judge-03.jpg': '../web/public/samples/judge-03.jpg',
  'judge-02.jpg': '../web/public/samples/judge-02.jpg',
  'judge-01.jpg': '../web/public/samples/judge-01.jpg',
  'ios-judge-10-compare.png': '../ios/screenshots/ios-judge-10-compare.png',
  'ios-06-referee-running.png': '../ios/screenshots/ios-06-referee-running.png',
  // D-170: the Figma-generated illustrations the app also uses (credited in web/public/art/SOURCES.md).
  'art-hero.webp': '../web/public/art/hero.webp',
  'art-vault.webp': '../web/public/art/vault.webp',
  'art-gate.webp': '../web/public/art/gate.webp',
  // The architecture diagram (T-163), shown in the "design" scene.
  'architecture.png': '../docs/img/architecture.png',
};
for (const [to, from] of Object.entries(files)) { copyFileSync(from, `public/img/${to}`); console.log(`public/img/${to}`); }
