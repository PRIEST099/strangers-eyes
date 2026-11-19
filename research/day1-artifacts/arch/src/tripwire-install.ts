// web/src/ai/tripwire-install.ts — side-effect module. `import './ai/tripwire-install';` is LINE 1 of main.tsx.
// ESM evaluates a module's imports depth-first in source order, so this runs before App → firebase/init are evaluated.
import { installTripwire } from './tripwire';
installTripwire();
