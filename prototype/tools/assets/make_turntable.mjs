// Takes the turntable's photographs of a model: the model itself, as supplied, drawn from all round it.
//
//   node tools/assets/make_turntable.mjs            writes assets/market/watch-turn.webp and watch-poster.webp
//
// It draws with the game's own viewer (src/client/asset-view.js) in a headless browser, so a photograph is what a
// player sees when they load the model itself. The model file is read, never written. Needs Playwright with
// Chromium; run it again only when the model changes.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL = 'watch';
const FRAME = 384, COLS = 6, ROWS = 4, FRAMES = COLS * ROWS, POSTER = 640;

const files = {
  '/three.min.js': [resolve(root, 'vendor/three.min.js'), 'text/javascript'],
  '/asset-view.js': [resolve(root, 'src/client/asset-view.js'), 'text/javascript'],
  '/assets/watch.glb': [resolve(root, 'assets/market/watch.glb'), 'model/gltf-binary'],
};
const page_html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><canvas id="c" width="${POSTER}" height="${POSTER}" style="width:${POSTER}px;height:${POSTER}px"></canvas>
<script src="/three.min.js"></script><script type="module">
import { createModelView } from '/asset-view.js';
const canvas = document.getElementById('c');
const view = createModelView(canvas, { transparent: true, pixelRatio: 1 });
window.info = await view.load('${MODEL}');
const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
const b64 = async (blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
window.take = async () => {
  const sheet = document.createElement('canvas'); sheet.width = ${FRAME * COLS}; sheet.height = ${FRAME * ROWS};
  const g = sheet.getContext('2d'); g.imageSmoothingQuality = 'high';
  for (let i = 0; i < ${FRAMES}; i += 1) { view.shot((i / ${FRAMES}) * Math.PI * 2, 0.2, 4.1); g.drawImage(canvas, (i % ${COLS}) * ${FRAME}, Math.floor(i / ${COLS}) * ${FRAME}, ${FRAME}, ${FRAME}); }
  view.shot(0.55, 0.24, 4.0);
  return { sheet: await b64(await blobOf(sheet, 'image/webp', 0.88)), poster: await b64(await blobOf(canvas, 'image/webp', 0.9)) };
};
window.ready = true;
</script>`;
const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page_html); return; }
  const file = files[url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file[1], 'Content-Length': statSync(file[0]).size });
  createReadStream(file[0]).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: POSTER, height: POSTER }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 600000 });
console.log('model:', JSON.stringify(await page.evaluate(() => window.info)));
const out = await page.evaluate(() => window.take());
writeFileSync(resolve(root, 'assets/market/watch-turn.webp'), Buffer.from(out.sheet, 'base64'));
writeFileSync(resolve(root, 'assets/market/watch-poster.webp'), Buffer.from(out.poster, 'base64'));
console.log(`watch-turn.webp ${(Buffer.from(out.sheet, 'base64').length / 1024).toFixed(0)} KB (${FRAMES} photographs of ${FRAME} px), watch-poster.webp ${(Buffer.from(out.poster, 'base64').length / 1024).toFixed(0)} KB`);
await page.screenshot({ path: resolve(root, 'dist/watch-check.png') }).catch(() => {});
await browser.close();
server.close();
