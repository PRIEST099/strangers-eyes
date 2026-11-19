import { describe, expect, it } from 'vitest';
import { jpegAppSegmentsFromBytes, segmentsAreClean } from './exif';

/** Build a minimal JPEG-like byte stream: SOI, the given APPn segments, SOS, a few data bytes, EOI. */
function jpeg(apps: number[], payload = 4): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  for (const n of apps) parts.push(0xff, 0xe0 + n, 0x00, 2 + payload, ...new Array(payload).fill(0x41));
  parts.push(0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9);
  return new Uint8Array(parts);
}

describe('jpegAppSegmentsFromBytes', () => {
  it('lists APP segments before SOS', () => {
    expect(jpegAppSegmentsFromBytes(jpeg([0, 2]))).toEqual(['APP0', 'APP2']);
    expect(jpegAppSegmentsFromBytes(jpeg([0, 1, 13]))).toEqual(['APP0', 'APP1', 'APP13']);
  });
  it('does not read APP markers hidden in entropy-coded data after SOS', () => {
    const b = jpeg([0]);
    const withFake = new Uint8Array([...b.slice(0, -2), 0xff, 0xe1, 0x00, 0x04, 0, 0, 0xff, 0xd9]);
    expect(jpegAppSegmentsFromBytes(withFake)).toEqual(['APP0']);
  });
  it('rejects non-JPEG input', () => {
    expect(() => jpegAppSegmentsFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow('not a JPEG');
  });
  it('stops on a corrupt length instead of looping', () => {
    expect(jpegAppSegmentsFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]))).toEqual([]);
  });
});

describe('segmentsAreClean (D-19)', () => {
  it('allows APP0 (JFIF) and APP2 (ICC), rejects APP1 and APP13', () => {
    expect(segmentsAreClean(['APP0', 'APP2'])).toBe(true);
    expect(segmentsAreClean(['APP0', 'APP1'])).toBe(false);
    expect(segmentsAreClean(['APP13'])).toBe(false);
    expect(segmentsAreClean([])).toBe(true);
  });
});
