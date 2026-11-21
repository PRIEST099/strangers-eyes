#!/usr/bin/env node
// scripts/strip-jpeg.mjs: rewrite JPEGs in place to the segments the app's strict validator allows (D-153; RUNBOOK §6.2b).
// Keeps SOI, APP0 (JFIF), DQT, SOF0/SOF2, DHT, DRI, SOS + entropy data, EOI. Drops every other APPn (EXIF, XMP, ICC,
// Photoshop/IPTC) and COM. Fails on anything it does not understand (progressive extras, trailing bytes after EOI).
//   node scripts/strip-jpeg.mjs <file.jpg>...
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const KEEP = new Set([0xe0, 0xdb, 0xc0, 0xc2, 0xc4, 0xdd]);

export function stripJpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG (no SOI)');
  const out = [Buffer.from([0xff, 0xd8])];
  let i = 2;
  for (;;) {
    if (b[i] !== 0xff) throw new Error(`bad marker at ${i}`);
    const m = b[i + 1];
    if (m === 0xda) {
      // SOS: copy the rest up to and including the first EOI that ends the file.
      const end = b.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (end < i || end + 2 !== b.length) throw new Error('trailing bytes after EOI or no EOI');
      out.push(b.subarray(i, end + 2));
      return Buffer.concat(out);
    }
    const len = b.readUInt16BE(i + 2);
    if (KEEP.has(m)) out.push(b.subarray(i, i + 2 + len));
    else if (!((m >= 0xe1 && m <= 0xef) || m === 0xfe)) throw new Error(`unexpected marker 0x${m.toString(16)}`);
    i += 2 + len;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const f of process.argv.slice(2)) {
    const before = readFileSync(f);
    const after = stripJpeg(before);
    writeFileSync(f, after);
    console.log(`${f}: ${before.length} -> ${after.length} bytes`);
  }
}
