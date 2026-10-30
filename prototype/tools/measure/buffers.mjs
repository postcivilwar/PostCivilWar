// What holds the page's ArrayBuffers (the "backing stores" outside the script's heap: the models' numbers, files, sounds),
// on a phone's settings at Low, at the town's east end with the habitation built (or BUF_PLACE=x,z, two minutes there):
// a heap snapshot, every buffer's bytes added up by what holds it, past the typed arrays over it (29 October 2026: it
// found the model files kept whole by the closures of the functions that read them).
//   ../server/with-postgres.sh node tools/measure/buffers.mjs [site folder] [out json]
import { createRequire } from 'node:module';
import { existsSync, statSync, createReadStream, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const SITE = resolve(process.argv[2] || new URL('../../dist/site', import.meta.url).pathname);
const OUT = resolve(process.argv[3] || '/tmp/buffers.json');
const PLACE = (process.env.BUF_PLACE || '262,104').split(',').map(Number);
const PROTO = resolve(SITE, '../..');
const { pastQuestion } = await import(`${PROTO}/test/start.mjs`);
const game = require(`${PROTO}/../api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.gz': 'application/gzip' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/api/game') { game(req, res); return; }
  const file = resolve(SITE, `.${path === '/' ? '/index.html' : path}`);
  if (!(file === SITE || file.startsWith(SITE + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Buf_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the buffers probe');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Buffers');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 11 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics('low'); });
await page.evaluate(([x, z]) => { const n = window.__nlw; n.place(x, z); n.face(Math.PI / 2); n.cam.yaw = Math.PI / 2; }, PLACE);
const t0 = Date.now();
for (;;) {
  const h = await page.evaluate(() => window.__nlw.habitation && window.__nlw.habitation.state());
  if (!process.env.BUF_PLACE && h && h.built && h.models >= h.of) break;
  if (process.env.BUF_PLACE && Date.now() - t0 > 120000) break;
  if (Date.now() - t0 > 1200000) break;
  await page.waitForTimeout(10000);
}
await page.waitForTimeout(20000);
const cdp = await context.newCDPSession(page);
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.collectGarbage');
let chunks = [];
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
const snap = JSON.parse(chunks.join('')); chunks = null;
const m = snap.snapshot.meta;
const NF = m.node_fields.length, EF = m.edge_fields.length;
const nTypes = m.node_types[0], eTypes = m.edge_types[0];
const fi = (f) => m.node_fields.indexOf(f), ei = (f) => m.edge_fields.indexOf(f);
const N = snap.nodes, E = snap.edges, S = snap.strings;
const nodeCount = N.length / NF;
const iType = fi('type'), iName = fi('name'), iSelf = fi('self_size'), iEdges = fi('edge_count');
const eType = ei('type'), eName = ei('name_or_index'), eTo = ei('to_node');
// first edge of each node, and each node's retainers
const firstEdge = new Uint32Array(nodeCount + 1);
for (let i = 0, e = 0; i < nodeCount; i += 1) { firstEdge[i] = e; e += N[i * NF + iEdges] * EF; firstEdge[i + 1] = e; }
const retainers = new Map();
for (let i = 0; i < nodeCount; i += 1) {
  for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
    const to = E[e + eTo] / NF;
    const t = eTypes[E[e + eType]];
    if (t === 'weak' || t === 'shortcut') continue;
    const name = t === 'element' || t === 'hidden' ? `[${E[e + eName]}]` : S[E[e + eName]];
    if (!retainers.has(to)) retainers.set(to, []);
    retainers.get(to).push([i, name, t]);
  }
}
const nodeName = (i) => S[N[i * NF + iName]];
const typeOf = (i) => nTypes[N[i * NF + iType]];
// the backing stores: "system / JSArrayBufferData" nodes, or native "ArrayBuffer" self sizes
const groups = new Map();
let total = 0;
for (let i = 0; i < nodeCount; i += 1) {
  const name = nodeName(i), type = typeOf(i), self = N[i * NF + iSelf];
  if (!(name === 'system / JSArrayBufferData' || (type === 'native' && /ArrayBuffer/.test(name)))) continue;
  if (self < 4096) continue;
  total += self;
  // walk up: past the ArrayBuffer and the typed arrays over it, to what holds them, and what holds that
  const path = [];
  let at = i;
  const seenUp = new Set([i]);
  for (let step = 0; step < 9 && path.length < 5; step += 1) {
    const all = (retainers.get(at) || []).filter(([from]) => !seenUp.has(from));
    // (prefer a holder that is not a buffer, a typed array or the engine's own bookkeeping)
    const plain = all.filter(([from, , t]) => !/ArrayBuffer|Array$|^system|^\(/.test(nodeName(from)) && t !== 'internal');
    const r = plain.length ? plain : all;
    if (!r.length) break;
    const [from, edge, t] = r[0];
    seenUp.add(from);
    const nm = nodeName(from);
    if (!/ArrayBuffer|^system/.test(nm)) path.push(`${typeOf(from)}:${nm.slice(0, 50)}.${String(edge).slice(0, 30)}`);
    at = from;
  }
  const key = path.slice(0, 4).join(' < ');
  const g = groups.get(key) || { bytes: 0, n: 0 };
  g.bytes += self; g.n += 1; groups.set(key, g);
}
const rows = [...groups].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 60).map(([k, g]) => ({ MB: +(g.bytes / 1048576).toFixed(2), n: g.n, held: k }));
writeFileSync(OUT, JSON.stringify({ totalMB: +(total / 1048576).toFixed(1), rows }, null, 1));
console.log('backing stores', (total / 1048576).toFixed(1), 'MB');
for (const r of rows.slice(0, 40)) console.log(String(r.MB).padStart(7), String(r.n).padStart(5), r.held);
await browser.close(); server.close();
