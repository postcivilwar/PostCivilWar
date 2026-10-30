// Takes the market's photographs of each of the sports mall's things (30 October 2026): the owner's model, drawn as the
// game draws it, from all round.
//
//   node tools/sports/turntables.mjs [ids...]      writes assets/market/sport-<id>-turn.webp and -poster.webp
//
// It draws with the market's own viewer (src/client/asset-view.js, which draws one with sports-model.js from the
// parts tools/sports/sports.py made) in a headless browser at full quality, so a photograph is what a player sees
// when they look at the model itself. Nothing is written but the photographs. Needs Playwright with Chromium.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { writeFileSync, createReadStream, statSync, existsSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { SPORTS_PARTS } = await import(resolve(root, 'src/client/sports-parts.js'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPORTS_PARTS).filter((id) => id !== 'naval-ship');
const FRAME = 384, COLS = 6, ROWS = 4, FRAMES = COLS * ROWS, POSTER = 640;
const TYPES = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream' };

const page_html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><canvas id="c" width="${POSTER}" height="${POSTER}" style="width:${POSTER}px;height:${POSTER}px"></canvas>
<script src="/vendor/three.min.js"></script><script type="module">
import { createModelView } from '/src/client/asset-view.js';
const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
const b64 = async (blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
window.take = async (id) => {
  const old = document.getElementById('c'); const canvas = old.cloneNode(); old.replaceWith(canvas);
  const view = createModelView(canvas, { transparent: true, pixelRatio: 1 });
  const info = await view.load('sport:' + id, null, { base: '/assets/sports/game/', lite: false });
  const sheet = document.createElement('canvas'); sheet.width = ${FRAME * COLS}; sheet.height = ${FRAME * ROWS};
  const g = sheet.getContext('2d'); g.imageSmoothingQuality = 'high';
  // (the camera stands far enough back that the whole of it is in every picture: its distance is in its own size)
  for (let i = 0; i < ${FRAMES}; i += 1) { view.shot(Math.PI / 2 + (i / ${FRAMES}) * Math.PI * 2, 0.25, 3.0); g.drawImage(canvas, (i % ${COLS}) * ${FRAME}, Math.floor(i / ${COLS}) * ${FRAME}, ${FRAME}, ${FRAME}); }
  // (its poster from in front and to its left)
  view.shot(Math.PI / 2 - 0.6, 0.3, 3.1);
  const out = { info, sheet: await b64(await blobOf(sheet, 'image/webp', 0.86)), poster: await b64(await blobOf(canvas, 'image/webp', 0.9)) };
  view.dispose();
  return out;
};
window.ready = true;
</script>`;
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page_html); return; }
  const file = resolve(root, `.${url}`);
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: POSTER, height: POSTER }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 600000 });
for (const id of ids) {
  const out = await page.evaluate((which) => window.take(which), id);
  const sheet = Buffer.from(out.sheet, 'base64'), poster = Buffer.from(out.poster, 'base64');
  writeFileSync(resolve(root, `assets/market/sport-${id}-turn.webp`), sheet);
  writeFileSync(resolve(root, `assets/market/sport-${id}-poster.webp`), poster);
  console.log(`${id}: ${(sheet.length / 1024).toFixed(0)} KB of photographs, poster ${(poster.length / 1024).toFixed(0)} KB`, JSON.stringify(out.info));
}
await browser.close();
server.close();
