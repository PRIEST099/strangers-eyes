// AttackPanel (SCR-08) misuse hardening (Nov 24, user-approved) and the plain/technical split: nothing the attacker
// WROTE is rendered (scene summary, clue evidence, hypothesis labels, inference values), only code enums; the route badge
// and latency show with Technical details on or off. Rendered to static markup (no DOM in Vitest).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import { t } from '../../core/strings';
import type { AdversaryResult } from '../../core/types';
import type { AttackState } from '../checkState';
import { AttackPanel, clueRowText } from './AttackPanel';

const SECRET_PLACE = 'Zanzibar Quay Plaza';
const result = {
  runId: 'r1', promptVersion: 'advB.v1', model: 'gemini-test-model', status: 'ok',
  sceneSummary: 'A level crossing on Zanzibar Quay, near the old harbour',
  hypotheses: [{ id: 'h1', label: SECRET_PLACE, level: 'street', lat: 1.5, lng: 2.5, radiusKm: 0.2, confidence: 'high', clueIds: ['c1'] }],
  clues: [
    { id: 'c1', type: 'street_sign', box2d: [0, 0, 100, 100], evidence: 'Sign reads Zanzibar Quay', reveals: 'street', severity: 'high', removable: true },
    { id: 'c2', type: 'architecture', box2d: [0, 0, 200, 200], evidence: 'Zanzibar-style balconies', reveals: 'city', severity: 'medium', removable: false },
  ],
  inferences: [{ id: 'i1', kind: 'venue', value: 'Zanzibar Harbour Café', confidence: 'medium', clueIds: ['c2'] }],
  sentImageSha256: 'a'.repeat(64), sentFrame: { width: 100, height: 100 }, route: 'IN_CLOUD', latencyMs: 2100, echoedVaultIds: [],
} as unknown as AdversaryResult;
const outcome: AttackOutcome = {
  kind: 'result', result, call: { route: 'IN_CLOUD', source: 'in_cloud', latencyMs: 2100, ledgerId: 'l1', model: 'gemini-test-model' },
};
const done: AttackState = { kind: 'done', run: 1, outcome };
const render = (tech?: boolean) =>
  renderToStaticMarkup(createElement(AttackPanel, { attack: done, model: 'gemini-test-model', onRetry: () => {}, onToVerdict: () => {}, tech }));

describe('AttackPanel: no attacker free text', () => {
  it('never renders the scene summary, clue evidence, a hypothesis label or an inference value (tech on or off)', () => {
    for (const tech of [false, true]) {
      const out = render(tech);
      expect(out).not.toContain('Zanzibar');
      expect(out).toContain(t('ui.attack.summary'));
    }
  });

  it('a clue reads as type · what it reveals · severity · removability', () => {
    expect(clueRowText({ type: 'street_sign', reveals: 'street', severity: 'high', removable: true }))
      .toBe(`${t('ui.clue.street_sign')} · reveals the street · ${t('ui.editor.severity.high')} · can be masked`);
    const out = render(false).replace(/&#x27;/g, "'");
    expect(out).toContain(clueRowText(result.clues[0]));
    expect(out).toContain(clueRowText(result.clues[1]));
  });
});

describe('AttackPanel: Technical details', () => {
  it('off (the default): no model id, no clue ids; the route badge and the latency stay', () => {
    const out = render();
    expect(out).not.toContain('gemini-test-model');
    expect(out).not.toMatch(/>c1</);
    expect(out).toContain(`>${t('ui.hud.engine.cloudPlain')}<`);
    expect(out).toContain('data-route="IN_CLOUD"');
    expect(out).toContain('2100 ms');
  });

  it('on: the exact model id and the clue ids', () => {
    const out = render(true);
    expect(out).toContain('gemini-test-model');
    expect(out).toMatch(/>c1</);
    expect(out).toContain('data-route="IN_CLOUD"');
    expect(out).toContain('2100 ms');
  });
});
