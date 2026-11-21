// web/src/ai/egressGate.testing.ts: TEST SEAM ONLY (T-062 review S3, D-131). It builds an Egress Gate on injected
// dependencies so unit tests can run the real algorithm on fakes. App code must never import this file: a second gate
// could run with an empty vault index or a fake allowlist (check-boundaries restricts its importers to *.test.ts and
// ai/egressGate.ts, which registers its factory here). Import './egressGate' before calling createEgressGate.
import type { EgressGate, GateDeps } from './egressGate';

type Factory = (deps: GateDeps) => EgressGate;
let factory: Factory | null = null;

/** Called once by ai/egressGate.ts when it loads (and again on a dev hot reload). */
export function registerGateFactory(f: Factory): void {
  factory = f;
}

/** A gate on injected dependencies (tests only). */
export function createEgressGate(deps: GateDeps): EgressGate {
  if (!factory) throw new Error('egressGate.testing: import ./egressGate before creating a test gate');
  return factory(deps);
}
