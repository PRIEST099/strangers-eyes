// Minimal CDP driver: open URL in headless Chrome, poll #out until done, print it.
const [,, port, url, timeoutMs = '180000'] = process.argv;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
const t0 = Date.now(); let out = '';
while (Date.now() - t0 < Number(timeoutMs)) {
  await new Promise((r) => setTimeout(r, 1000));
  const r = await send('Runtime.evaluate', { expression: "(document.getElementById('out')||{}).textContent + '\\n' + (document.getElementById('sw')||{}).textContent", returnByValue: true });
  out = r.result?.result?.value ?? '';
  if (out && !out.startsWith('running') && !out.startsWith('undefined')) break;
}
console.log(out);
console.log('--- console ---\n' + logs.slice(0, 40).join('\n'));
ws.close();
