// Copy the stills the composition shows into public/img (git-ignored: the originals live in the repo already).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/img', { recursive: true });
const files = {
  'judge-03.jpg': '../web/public/samples/judge-03.jpg',
  'judge-02.jpg': '../web/public/samples/judge-02.jpg',
  'ios-07-verdict.png': '../ios/screenshots/ios-07-verdict.png',
  'ios-06-referee-running.png': '../ios/screenshots/ios-06-referee-running.png',
};
for (const [to, from] of Object.entries(files)) { copyFileSync(from, `public/img/${to}`); console.log(`public/img/${to}`); }
