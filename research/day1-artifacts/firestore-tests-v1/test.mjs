import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, increment, deleteDoc } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-atlas', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 } });
const alice = env.authenticatedContext('alice').firestore();
const anon = env.unauthenticatedContext().firestore();
const r = [];
async function t(name, p, expect) { try { await (expect ? assertSucceeds(p) : assertFails(p)); r.push(['PASS', name]); } catch (e) { r.push(['FAIL', name, e.message]); } }
// Design A
const a = doc(alice, 'atlas/2026-W47/clues/street_sign');
await t('A create via setDoc merge increment(1)', setDoc(a, { n: increment(1) }, { merge: true }), true);
await t('A update via setDoc merge increment(1)', setDoc(a, { n: increment(1) }, { merge: true }), true);
await t('A update via updateDoc increment(1)', updateDoc(a, { n: increment(1) }), true);
await t('A increment(2) rejected', updateDoc(a, { n: increment(2) }), false);
await t('A increment(-1) rejected', updateDoc(a, { n: increment(-1) }), false);
await t('A literal set n=99 rejected', setDoc(a, { n: 99 }), false);
await t('A extra field rejected', updateDoc(a, { n: increment(1), x: 1 }), false);
await t('A non-whitelisted clue rejected', setDoc(doc(alice, 'atlas/2026-W47/clues/gps'), { n: increment(1) }, { merge: true }), false);
await t('A bad week id rejected', setDoc(doc(alice, 'atlas/hello/clues/landmark'), { n: increment(1) }, { merge: true }), false);
await t('A unauth rejected', setDoc(doc(anon, 'atlas/2026-W47/clues/landmark'), { n: increment(1) }, { merge: true }), false);
await t('A delete rejected', deleteDoc(a), false);
await t('A public read ok', getDoc(doc(anon, 'atlas/2026-W47/clues/street_sign')), true);
// Design B
const b = doc(alice, 'atlasWeekly/2026-W47');
await t('B create one field via merge increment(1)', setDoc(b, { street_sign: increment(1) }, { merge: true }), true);
await t('B inc existing field', updateDoc(b, { street_sign: increment(1) }), true);
await t('B inc new whitelisted field (absent->1)', updateDoc(b, { landmark: increment(1) }), true);
await t('B two fields at once rejected', updateDoc(b, { landmark: increment(1), street_sign: increment(1) }), false);
await t('B increment(5) rejected', updateDoc(b, { landmark: increment(5) }), false);
await t('B non-whitelisted field rejected', updateDoc(b, { gps: increment(1) }), false);
await t('B create with 2 fields rejected', setDoc(doc(alice, 'atlasWeekly/2026-W48'), { street_sign: 1, landmark: 1 }), false);
await t('B create with value 3 rejected', setDoc(doc(alice, 'atlasWeekly/2026-W49'), { street_sign: 3 }), false);
const snapA = await env.withSecurityRulesDisabled(async c => (await getDoc(doc(c.firestore(), 'atlas/2026-W47/clues/street_sign'))).data());
const snapB = await env.withSecurityRulesDisabled(async c => (await getDoc(doc(c.firestore(), 'atlasWeekly/2026-W47'))).data());
console.log(JSON.stringify(r, null, 0).replace(/\],\[/g, '],\n['));
console.log('final A', snapA, 'final B', snapB);
await env.cleanup();
process.exit(0);
