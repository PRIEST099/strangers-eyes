import './ai/tripwire-install'; // MUST stay the first import (ARCH §8.5, R-28): wraps fetch before any Firebase module loads.
import { boot, isJudgeBoot } from './boot'; // second (ARCH §15.1): evaluating it runs firebase/init in the AC-291 order.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { applyBootRedirect } from './ui/router';

const judge = isJudgeBoot(window.location); // read before the redirect below rewrites ?judge=1
// `?judge=1` → `#/judge` (SPEC §8.1), before the first render. T-091 puts SCR-01 in front of it on a fresh profile.
applyBootRedirect(window.location, window.history);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
// Steps 3–5 of ARCH §15.1: Remote Config → vault scanner → render (each wait bounded; see boot.ts).
void boot({
  judge,
  render: () => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  },
});
