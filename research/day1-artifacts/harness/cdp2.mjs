// Offline test: wait for SW + precache, go offline, reload, wait for self-test output.
const [,, port, url] = process.argv;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR: ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  if (m.method === 'Network.loadingFailed') logs.push('NETFAIL: ' + m.params.errorText + ' ' + (m.params.requestId));
  if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, m.params.request.url);
});
const reqs = new Map();
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Page.navigate', { url });
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const st = await ev(`(async()=>{const k=await caches.keys();let n=0;for(const c of k){n+=(await (await caches.open(c)).keys()).length};return JSON.stringify({ctl:!!navigator.serviceWorker.controller,keys:k,n,sw:document.getElementById('sw')?.textContent})})()`);
  if (i % 5 === 0) console.log('t=' + i, st);
  if (st && JSON.parse(st).ctl && JSON.parse(st).n >= 16) { console.log('READY', st); break; }
}
// Clear tesseract's IndexedDB traineddata cache to force a network/SW fetch of the lang file
await ev(`new Promise(r=>{const q=indexedDB.deleteDatabase('keyval-store');q.onsuccess=q.onerror=q.onblocked=()=>r('deleted')})`);
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send('Page.reload', { ignoreCache: false });
let out = '';
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  out = await ev(`(document.getElementById('out')||{}).textContent`) ?? '';
  if (out && !out.startsWith('running')) break;
}
try { const d = JSON.parse(out); for (const k of ['ocr','faces_short','faces_full','exif','vault']) console.log(k, d[k]?.ok, d[k]?.error ?? '', k==='ocr' ? JSON.stringify(d[k]?.value?.words?.map(w=>w.text)) : ''); } catch { console.log('RAW', out.slice(0, 1500)); }
console.log('workers:', JSON.stringify((await send('Target.getTargets')).result?.targetInfos?.map(t=>t.type+':'+t.url.slice(0,80))));
const failed = logs.map((l) => l.startsWith('NETFAIL') ? l + ' ' + (reqs.get(l.split(' ').pop()) ?? '') : l);
console.log('--- logs ---\n' + failed.slice(0, 30).join('\n'));
ws.close();
