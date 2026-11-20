import './ai/tripwire-install'; // MUST stay the first import (ARCH §8.5, R-28): wraps fetch before any Firebase module loads.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { applyBootRedirect } from './ui/router';

// `?judge=1` → `#/judge` (SPEC §8.1), before the first render. T-091 puts SCR-01 in front of it on a fresh profile.
applyBootRedirect(window.location, window.history);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
