// Judge Mode picker: the suggested first sample gets a "Start here" chip, the manifest order is unchanged, and the
// sample button's accessible name stays exactly its title (the chip is outside the button, as its description).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { t } from '../../core/strings';
import type { JudgeSample } from '../../vault/judgeVault';
import { SamplePicker } from './SamplePicker';

const manifest = JSON.parse(readFileSync(join(__dirname, '../../../public/samples/manifest.json'), 'utf8')) as { samples: JudgeSample[] };

describe('SamplePicker "Start here"', () => {
  it('marks only the level crossing (judge-02), keeps the manifest order, and leaves each button named by its title', () => {
    const out = renderToStaticMarkup(createElement(SamplePicker, { samples: manifest.samples, selected: null, compact: false, onPick: () => {}, startHere: 'judge-02' }));
    expect(out.match(/data-start-here=""/g)?.length).toBe(1);
    const order = [...out.matchAll(/data-sample="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(manifest.samples.map((s) => s.id));
    const cards = out.split('<li').slice(1);
    const card = cards.find((c) => c.includes('data-sample="judge-02"')) ?? '';
    expect(card).toContain(t('ui.judge.startHere'));
    const chipId = /<span id="([^"]+)" data-start-here/.exec(card)?.[1];
    expect(chipId).toBeTruthy();
    const button = /<button[^>]*data-sample="judge-02"[^>]*>[\s\S]*?<\/button>/.exec(card)?.[0] ?? '';
    expect(button).toContain(`aria-describedby="${chipId}"`);
    expect(button).not.toContain(t('ui.judge.startHere'));
    for (const c of cards.filter((x) => !x.includes('data-sample="judge-02"'))) expect(c).not.toContain('data-start-here');
  });
});
