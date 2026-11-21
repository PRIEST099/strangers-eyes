// D-130: the gate's strict outgoing-JPEG validator, with every bypass the T-062 security review planted.
import { describe, expect, it } from 'vitest';
import { ICC_MAX_BYTES, validateOutgoingJpeg } from './jpegStrict';
import { checkCleanJpeg } from '../tier0/exif';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const u8 = (a: number[]) => { const b = new Uint8Array(new ArrayBuffer(a.length)); b.set(a); return b; };
const APP0 = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ICC = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, ...new Array(64).fill(0x20)]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(1)]);
const SOF0 = seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]);
const SOF2 = seg(0xc2, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]);
const DHT = seg(0xc4, [0, ...new Array(16).fill(0)]);
const DRI = seg(0xdd, [0, 4]);
const SOS = seg(0xda, [1, 1, 0, 0, 63, 0]);
const DATA = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd7, 0x78];
const EOI = [0xff, 0xd9];
const XMP_GPS = seg(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>REDACTED</exif:GPSLatitude> Lucas</x:xmpmeta>'));
const good = (mid: number[] = [], sof = SOF0) => u8([0xff, 0xd8, ...APP0, ...ICC, ...DQT, ...sof, ...DHT, ...mid, ...SOS, ...DATA, ...EOI]);

describe('validateOutgoingJpeg (D-130)', () => {
  it('accepts canvas output: JFIF + one ICC profile + tables + baseline or progressive scans, stuffing and restarts', () => {
    expect(validateOutgoingJpeg(good())).toEqual({ ok: true, segments: ['APP0', 'APP2', 'DQT', 'SOF0', 'DHT', 'SOS', 'EOI'] });
    expect(validateOutgoingJpeg(u8([0xff, 0xd8, ...APP0, ...DQT, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])).ok).toBe(true);
    // progressive: DHT and a second SOS between scans
    expect(validateOutgoingJpeg(u8([0xff, 0xd8, ...APP0, ...DQT, ...SOF2, ...DHT, ...SOS, ...DATA, ...DHT, ...SOS, ...DATA, ...EOI])).ok).toBe(true);
    expect(validateOutgoingJpeg(good(DRI)).ok).toBe(true);
  });
  const bad: [string, Uint8Array][] = [
    ['APP1 EXIF', good(seg(0xe1, [...ascii('Exif'), 0, 0, 1, 2]))],
    ['junk byte before an APP1 XMP (P4)', good([0x00, ...XMP_GPS])],
    ['APP1 after the first SOS (P5)', u8([0xff, 0xd8, ...APP0, ...DQT, ...SOF2, ...DHT, ...SOS, ...DATA, ...XMP_GPS, ...SOS, ...DATA, ...EOI])],
    ['COM with vault text (P6)', good(seg(0xfe, ascii('Lucas, Northwind Clinic, 0.501,-30.502')))],
    ['APP15 (P6)', good(seg(0xef, ascii('Lucas 0.501 -30.502')))],
    ['APP13 IPTC', good(seg(0xed, ascii('Photoshop 3.0')))],
    ['APP3', good(seg(0xe3, ascii('x')))],
    ['a second APP2 (ICC)', good(ICC)],
    ['APP2 that is not ICC (P6)', u8([0xff, 0xd8, ...APP0, ...seg(0xe2, ascii('MPF\0Lucas, Northwind')), ...DQT, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])],
    ['an oversize ICC', u8([0xff, 0xd8, ...APP0, ...seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, ...new Array(ICC_MAX_BYTES).fill(0)]), ...DQT, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])],
    ['a second JPEG after EOI (P6)', u8([...good(), 0xff, 0xd8, ...XMP_GPS, ...SOS, ...DATA, ...EOI])],
    ['trailing bytes after EOI', u8([...good(), 0x00])],
    ['corrupt length < 2 (P6)', good([0xff, 0xe1, 0x00, 0x01, ...XMP_GPS])],
    ['length past the end', u8([0xff, 0xd8, ...APP0, 0xff, 0xdb, 0xff, 0xff, 0x00, ...EOI])],
    ['JFIF thumbnail', u8([0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 9, 9, 9]), ...DQT, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])],
    ['APP0 not first', u8([0xff, 0xd8, ...DQT, ...APP0, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])],
    ['APP0 JFXX', u8([0xff, 0xd8, ...seg(0xe0, [...ascii('JFXX'), 0, 0x10, 1, 2, 3, 4, 5, 6, 7, 8, 9]), ...DQT, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])],
    ['fill bytes before a marker', good([0xff, ...DRI])],
    ['a stray byte between two allowed segments', u8([0xff, 0xd8, ...APP0, ...DQT, 0x00, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])],
    ['JFIF thumbnail dimensions in a 16-byte header', u8([0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 1, 1]), ...DQT, ...SOF0, ...DHT, ...SOS, ...DATA, ...EOI])],
    ['a second SOI', good([0xff, 0xd8])],
    ['SOF1 (not baseline/progressive)', good([], seg(0xc1, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]))],
    ['two SOFs', good(SOF0)],
    ['no SOS', u8([0xff, 0xd8, ...APP0, ...DQT, ...SOF0, ...DHT, ...EOI])],
    ['SOS before SOF', u8([0xff, 0xd8, ...APP0, ...DQT, ...SOS, ...DATA, ...SOF0, ...EOI])],
    ['a stray RST outside a scan', good([0xff, 0xd0])],
    ['no EOI at the end', u8([0xff, 0xd8, ...APP0, ...DQT, ...SOF0, ...DHT, ...SOS, ...DATA])],
    ['not a JPEG', u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['too short', u8([0xff, 0xd8, 0xff, 0xd9])],
  ];
  for (const [name, b] of bad) it(`rejects ${name}`, () => expect(validateOutgoingJpeg(b).ok).toBe(false));
  it('documents why it exists: tier0/exif.ts checkCleanJpeg reads several of these as clean', async () => {
    const lenient = [bad[1][1], bad[2][1], bad[3][1], bad[10][1], bad[12][1]];
    for (const b of lenient) expect((await checkCleanJpeg(new Blob([b as Uint8Array<ArrayBuffer>]))).clean).toBe(true);
  });
});
