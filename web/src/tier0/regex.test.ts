import { describe, expect, it } from 'vitest';
import { houseNumbers, isHouseNumberText, isPlateLike, phones, plates, PLATE_MIN_CONF, regexFlags, spacedPlates, trimPunct, unionRect } from './regex';
import type { OcrWord } from '../core/types';

/** OCR words laid out left to right per line; every word 40 px tall unless given. */
function ocr(lines: (string | [string, number?, number?])[][]): OcrWord[] {
  const out: OcrWord[] = [];
  lines.forEach((l, line) => {
    let x = 10;
    for (const w of l) {
      const [text, conf = 90, h = 40] = typeof w === 'string' ? [w] : w;
      out.push({ text, conf, line, box: { x, y: 100 * line, w: 20 * text.length, h } });
      x += 20 * text.length + 10;
    }
  });
  return out;
}

describe('isPlateLike (SPEC SCR-06 step 4: 5–8 alphanumerics, ≥2 letters and ≥2 digits)', () => {
  it.each(['SE1234', 'AB12CDE', 'KA01AB12', 'B-MW-1234', 'AB-123-CD', '(XY123)'])('%s is plate-like', (t) => expect(isPlateLike(t)).toBe(true));
  it.each([
    ['AB12', 'too short'], ['ABCDE1234', 'too long'], ['ABCDEF1', 'one digit'], ['A123456', 'one letter'], ['1234567', 'no letters'],
    ['STREET', 'no digits'], ['SE 1234', 'two tokens'], ['SE_1234', 'other punctuation'], ['AB--12CD', 'empty hyphen group'],
  ])('%s is not (%s)', (t) => expect(isPlateLike(t)).toBe(false));
  it('needs OCR confidence ≥ 60', () => {
    const words = ocr([[['SE1234', PLATE_MIN_CONF - 1], ['XY9876', PLATE_MIN_CONF]]]);
    expect(plates(words).map((h) => h.text)).toEqual(['XY9876']);
  });
});

describe('phones (SPEC SCR-06 step 4: 7–15 digits, separators + - . space)', () => {
  const found = (lines: string[][]) => phones(ocr(lines)).map((h) => [h.text, h.words]);
  it('finds a number spread over several OCR words on one line, with the words it covers', () => {
    expect(found([['Call', '+44', '20', '7946', '0958', 'today']])).toEqual([['+44 20 7946 0958', [1, 2, 3, 4]]]);
  });
  it('accepts dots and dashes, and 7 to 15 digits', () => {
    expect(found([['555-0199-12']])).toEqual([['555-0199-12', [0]]]);
    expect(found([['555.019.9123']])).toEqual([['555.019.9123', [0]]]);
    expect(found([['1234567']])).toEqual([['1234567', [0]]]);
    expect(found([['123456789012345']])).toEqual([['123456789012345', [0]]]);
  });
  it('rejects 6 digits, a 16-digit run, digits glued to letters, and other separators', () => {
    expect(found([['123456']])).toEqual([]);
    expect(found([['1234567890123456']])).toEqual([]);
    expect(found([['AB1234567']])).toEqual([]);
    expect(found([['123/456/789']])).toEqual([]);
  });
  it('never joins words from different OCR lines', () => {
    expect(found([['555', '01'], ['99123']])).toEqual([]);   // 5 + 5 digits; joined they would be 10
  });
});

describe('houseNumbers (SPEC SCR-06 step 4: standalone 1–4 digits + optional letter, alone on its line, ≥2% of image height)', () => {
  const H = 1000;   // image height: 2% = 20 px
  it('flags a lone number on its own line', () => {
    expect(houseNumbers(ocr([['12']]), H).map((h) => h.text)).toEqual(['12']);
    expect(houseNumbers(ocr([['7b.']]), H).map((h) => h.text)).toEqual(['7b']);
    expect(houseNumbers(ocr([['1024A']]), H).map((h) => h.text)).toEqual(['1024A']);
  });
  it('ignores stray punctuation on the same line', () => {
    expect(houseNumbers(ocr([['-', '42', '|']]), H).map((h) => [h.text, h.words])).toEqual([['42', [1]]]);
  });
  it('rejects a number with other words on its line, 5 digits, two letters, or a box under 2% of the image height', () => {
    expect(houseNumbers(ocr([['No.', '12']]), H)).toEqual([]);
    expect(houseNumbers(ocr([['12345']]), H)).toEqual([]);
    expect(houseNumbers(ocr([['12ab']]), H)).toEqual([]);
    expect(houseNumbers(ocr([[['12', 90, 19]]]), H)).toEqual([]);
    expect(houseNumbers(ocr([[['12', 90, 20]]]), H)).toHaveLength(1);
  });
  it('isHouseNumberText', () => {
    expect(['1', '12', '123', '1234', '12a', '(3)'].every(isHouseNumberText)).toBe(true);
    expect(['', 'a1', '12345', '12ab', '1 2'].some(isHouseNumberText)).toBe(false);
  });
});

describe('spacedPlates (T-068 review, D-133): plates in 2–3 groups over adjacent OCR words', () => {
  it.each([
    [['SE', '1234'], 'SE 1234'],
    [['AB12', 'CDE'], 'AB12 CDE'],
    [['B', 'MW', '1234'], 'B MW 1234'],
    [['(AB12', 'CDE)'], 'AB12 CDE'],
  ])('%j → %s', (parts, text) => {
    const words = ocr([parts]);
    const hits = plates(words);
    expect(hits.map((h) => h.text)).toEqual([text]);
    expect(hits[0].words).toEqual(parts.map((_, i) => i));
    expect(hits[0].box).toEqual(unionRect(words.map((w) => w.box)));
  });

  it.each([
    [['ROOM', '12'], 'an all-letter word of 4+ is a sign'],
    [['Se', '1234'], 'lower case'],
    [['SE', '12'], 'too short joined'],
    [['AB', 'CD', 'EF'], 'no digits'],
    [['12', '34', '56'], 'no letters'],
    [['ABCDE', '12'], 'a part longer than 4'],
  ])('%j is not a plate (%s)', (parts) => {
    expect(plates(ocr([parts]))).toEqual([]);
  });

  it('needs every part at confidence ≥ 60, one line, and the words side by side', () => {
    expect(plates(ocr([[['SE', PLATE_MIN_CONF - 1], '1234']]))).toEqual([]);
    expect(plates(ocr([['SE'], ['1234']]))).toEqual([]); // two lines
    const far = ocr([['SE', '1234']]);
    far[1] = { ...far[1], box: { ...far[1].box, x: far[0].box.x + far[0].box.w + 61 } }; // gap > 1.5 × 40 px
    expect(plates(far)).toEqual([]);
    const tiny = ocr([['SE', ['1234', 90, 20]]]); // height ratio 0.5
    expect(plates(tiny)).toEqual([]);
  });

  it('words already in a single-token plate are not reused; the longest run wins', () => {
    expect(plates(ocr([['SE1234', 'AB']])).map((h) => h.text)).toEqual(['SE1234']);
    expect(spacedPlates(ocr([['SE', '1234']]), new Set([0]))).toEqual([]);
    expect(plates(ocr([['X', 'SE', '1234', 'AB']])).map((h) => h.text)).toEqual(['X SE 1234']);
    expect(plates(ocr([['AB12', 'CDE', '9999']])).map((h) => h.text)).toEqual(['AB12 CDE']); // 3 parts too long: the 2-part run
    expect(plates(ocr([['AB12', 'CDE', '9']])).map((h) => h.text)).toEqual(['AB12 CDE 9']); // both runs fit: the longer one
    expect(plates(ocr([['A1234', 'BC']]))).toEqual([]); // a part of 5 characters is not a plate group
  });
});

describe('regexFlags', () => {
  it('runs all three detectors and returns master-pixel boxes', () => {
    const words = ocr([['PLATE', 'SE1234'], ['tel', '555', '0199', '123'], ['17']]);
    const hits = regexFlags(words, 1000);
    expect(hits.map((h) => [h.kind, h.text])).toEqual([['plate', 'SE1234'], ['phone', '555 0199 123'], ['house_number', '17']]);
    expect(hits[1].box).toEqual(unionRect([words[3].box, words[4].box, words[5].box]));
  });
  it('helpers', () => {
    expect(trimPunct('(SE-1234),')).toBe('SE-1234');
    expect(unionRect([{ x: 10, y: 20, w: 5, h: 5 }, { x: 0, y: 30, w: 4, h: 10 }])).toEqual({ x: 0, y: 20, w: 15, h: 20 });
  });
});
