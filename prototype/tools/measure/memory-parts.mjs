// Where a phone's memory goes in the town (the owner's brief of 26 October 2026: the whole page's memory is what a
// phone's browser judges a page by, not the graphics card's alone): on a phone's settings, at a few places, the page's
// own process and the graphics process (this machine draws in software: the graphics process holds what a graphics
// card would), the script's heap and the arrays it holds outside it, the models' shapes as handed to the graphics card
// (every vertex and index buffer, counted as it is handed over) and as the page keeps them (the arrays behind every
// shape in the scene, by what they belong to), the pictures (the game's own count) and the pictures the page still
// holds a copy of, and the canvases.
//   ../server/with-postgres.sh node tools/measure/memory-parts.mjs <out folder> [site folder]
// PARTS_TEXTURES=1: every picture on the graphics card listed, by what it belongs to and its size there
// PARTS_DETAIL=1: the programs compiled (by material), the pictures the page still holds (canvases and bitmaps, by what
// they belong to), and the most the page and the graphics process held while each place was being built (sampled every
// two seconds, not only once it is quiet)
// PARTS_LEVEL (medium), PARTS_DPR (3), PARTS_PLACES (comma separated: park,market,boulevard,powerbike,waterside,east,eastend,habitation,
// crowdwest,crowdcentre: where the town's people are most crowded, at PARTS_HOUR 7.5 and 18.5), PARTS_HOUR (11)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync, statSync, createReadStream, readFileSync, readdirSync } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { pastQuestion } = await import(`${ROOT}/prototype/test/start.mjs`);
const out = resolve(process.argv[2] || '/tmp/parts'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const LEVEL = process.env.PARTS_LEVEL || 'medium';
const DPR = Number(process.env.PARTS_DPR) > 0 ? Number(process.env.PARTS_DPR) : 3;
const ONLY = (process.env.PARTS_PLACES || 'park,market,boulevard,powerbike,waterside,east,habitation').split(',');
const LABEL = process.env.PARTS_LABEL || LEVEL;
const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
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
const TAG = `parts${Date.now().toString(36)}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required', `--parts-tag=${TAG}`] });
const cmdline = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch (e) { return null; } };
const parentOf = (pid) => { try { const s = readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]); } catch (e) { return null; } };
const pids = () => readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number);
const top = pids().find((p) => { const c = cmdline(p); return c && c.some((a) => a === `--parts-tag=${TAG}`) && !c.some((a) => a.startsWith('--type=')); });
function procMemory() {
  const kids = new Map();
  for (const p of pids()) { const pp = parentOf(p); if (pp) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(p); } }
  let page = 0, gpu = 0; const stack = [top];
  while (stack.length) {
    const p = stack.pop(); if (!p) continue; for (const k of kids.get(p) || []) stack.push(k);
    const c = cmdline(p); if (!c) continue;
    const type = (/--type=(\S+)/.exec(c.join(' ')) || [])[1] || 'browser';
    let m; try { m = readFileSync(`/proc/${p}/smaps_rollup`, 'utf8'); } catch (e) { continue; }
    const field = (name) => { const r = new RegExp(`^${name}:\\s+(\\d+) kB`, 'm').exec(m); return r ? Number(r[1]) : 0; };
    const priv = (field('Private_Clean') + field('Private_Dirty')) / 1024;
    if (type === 'renderer') page = Math.max(page, priv); else if (type === 'gpu-process') gpu += priv;
  }
  return { page: +page.toFixed(1), gpu: +gpu.toFixed(1) };
}
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
// every vertex and index buffer handed to the graphics card, counted as it goes (and as it is deleted)
await context.addInitScript(() => {
  const held = new Map(); let bound = { 34962: null, 34963: null };
  window.__geometryBytes = () => { let s = 0; for (const b of held.values()) s += b; return { bytes: s, buffers: held.size }; };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const bind = C.prototype.bindBuffer, data = C.prototype.bufferData, del = C.prototype.deleteBuffer;
    C.prototype.bindBuffer = function (target, buffer) { if (target === 34962 || target === 34963) bound[target] = buffer; return bind.call(this, target, buffer); };
    C.prototype.bufferData = function (target, src, ...rest) { const b = bound[target]; if (b) held.set(b, typeof src === 'number' ? src : src && src.byteLength ? src.byteLength : 0); return data.call(this, target, src, ...rest); };
    C.prototype.deleteBuffer = function (buffer) { held.delete(buffer); return del.call(this, buffer); };
  }
});
const page = await context.newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const cdp = await context.newCDPSession(page);
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Parts_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the parts');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Parts');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate(([level, hourWanted]) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + hourWanted - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics(level); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } }, [LEVEL, Number(process.env.PARTS_HOUR) || 11]);
let peak = { page: 0, gpu: 0, sum: 0 };
const quiet = async (most = 180000) => { const t0 = Date.now(); let last = '', same = 0; while (Date.now() - t0 < most) { const pm = procMemory(); if (pm.page + pm.gpu > peak.sum) peak = { page: pm.page, gpu: pm.gpu, sum: +(pm.page + pm.gpu).toFixed(1), at: Math.round((Date.now() - t0) / 1000) }; const now = await page.evaluate(() => { const r = window.__nlw.renderer, g = window.__nlw.graphics || {}; return `${r.info.memory.geometries}/${r.info.memory.textures}/${g.held}/${window.__geometryBytes().buffers}`; }); if (now === last) { same += 1; if (same >= 3) return Date.now() - t0; } else { same = 0; last = now; } await page.waitForTimeout(2000); } return Date.now() - t0; };
const park = await page.evaluate(() => window.__nlw.service('park'));
if (process.env.PARTS_TEXTURES === '1') await page.evaluate(() => { window.__partsTextures = true; });
if (process.env.PARTS_DETAIL === '1') await page.evaluate(() => { window.__partsDetail = true; });
const PLACES = { park: [park.x + 6, park.z + 4, Math.PI], market: [30, 60, Math.PI / 2], boulevard: [0, 20, 0], powerbike: [-63.6, 64, Math.PI], waterside: [-150, 113, Math.PI / 2], east: [200, 113, Math.PI / 2], habitation: [382, 16, 0.9], eastend: [262, 104, Math.PI / 2], crowdwest: [-85, 92, Math.PI], crowdcentre: [-6, -47, 0] };
const MB = (b) => +(b / 1048576).toFixed(1);
const results = [];
for (const name of ONLY) {
  const [x, z, h] = PLACES[name];
  await page.evaluate(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); n.cam.yaw = h; n.cam.dist = 6.5; n.cam.pitch = 0.12; }, [x, z, h]);
  peak = { page: 0, gpu: 0, sum: 0 };
  const q = await quiet(name === 'habitation' || name === 'eastend' ? 300000 : 180000);
  // (the garbage collected first, so that what is counted is what is held)
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await page.waitForTimeout(3000);
  const usage = await cdp.send('Runtime.getHeapUsage').catch(() => ({}));
  const parts = await page.evaluate(() => {
    const n = window.__nlw, r = n.renderer, g = n.graphics || {}, m = performance.memory || {};
    // the arrays behind every shape in the scene, each counted once, by the top-level thing it belongs to
    const seen = new Set(); const by = {}; let total = 0, inScene = 0;
    const topName = (o) => { let p = o; while (p.parent && p.parent !== n.scene) p = p.parent; return p.name || p.type; };
    n.scene.traverse((o) => {
      const geo = o.geometry; if (!geo || !geo.attributes) return;
      let bytes = 0;
      const arrays = [...Object.values(geo.attributes), ...(geo.index ? [geo.index] : []), ...Object.values(geo.morphAttributes || {}).flat()];
      for (const a of arrays) { const arr = a && (a.array || (a.data && a.data.array)); if (arr && arr.buffer && !seen.has(arr.buffer)) { seen.add(arr.buffer); bytes += arr.buffer.byteLength; } }
      if (o.isInstancedMesh && o.instanceMatrix && !seen.has(o.instanceMatrix.array.buffer)) { seen.add(o.instanceMatrix.array.buffer); bytes += o.instanceMatrix.array.buffer.byteLength; }
      if (!bytes) return;
      const k = topName(o); by[k] = (by[k] || 0) + bytes; total += bytes; inScene += 1;
    });
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, b]) => [k, +(b / 1048576).toFixed(2)]);
    // pictures the page still holds its own copy of (a canvas, or a picture not let go), in the scene's materials
    const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'envMap', 'lightMap', 'bumpMap', 'specularMap'];
    const tex = new Set(); let canvasBytes = 0, canvases = 0, bitmapBytes = 0, bitmaps = 0, imageBytes = 0, images = 0;
    n.scene.traverse((o) => { const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const mt of mats) for (const k of keys) { const t = mt[k]; if (t && t.isTexture && !tex.has(t)) { tex.add(t); const im = t.image; if (!im) continue; const b = (im.width || 0) * (im.height || 0) * 4; if (typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement) { canvasBytes += b; canvases += 1; } else if (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) { if (b) { bitmapBytes += b; bitmaps += 1; } } else if (im.tagName === 'IMG') { imageBytes += b; images += 1; } } } });
    const gb = window.__geometryBytes();
    // (every picture of the scene's materials the graphics card has, by what it belongs to: PARTS_TEXTURES)
    let onCard = null;
    if (window.__partsTextures) {
      const list = new Map();
      n.scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const mt of mats) {
          const ts = []; for (const k of keys) if (mt[k] && mt[k].isTexture) ts.push(mt[k]);
          if (mt.uniforms) for (const u of Object.values(mt.uniforms)) if (u && u.value && u.value.isTexture) ts.push(u.value);
          for (const t of ts) {
            if (list.has(t)) continue;
            const p = r.properties.get(t);
            if (!p || !p.__webglTexture) continue;
            const w = (t.userData && t.userData.drawn) || (t.image && t.image.width) || 0, h = (t.image && t.image.height) || w;
            list.set(t, { owner: topName(o), name: t.name || (t.userData && t.userData.file) || '', w: t.image ? t.image.width : 0, h: t.image ? t.image.height : 0, drawn: t.userData ? t.userData.drawn || 0 : 0, visible: o.visible });
          }
        }
      });
      const byOwner = {};
      for (const e of list.values()) { const side = e.drawn || Math.max(e.w, e.h); const mb = (side * side * 4 * 1.33) / 1048576; byOwner[e.owner] = byOwner[e.owner] || [0, 0]; byOwner[e.owner][0] += 1; byOwner[e.owner][1] += mb; }
      onCard = { count: list.size, byOwner: Object.entries(byOwner).sort((a, b) => b[1][1] - a[1][1]).map(([k, [c, mb]]) => [k, c, +mb.toFixed(1)]).slice(0, 30) };
    }
    // (PARTS_DETAIL) the programs by the material that asked for each; the canvases and bitmaps the page still holds, by owner
    let detail = null;
    if (window.__partsDetail) {
      const progs = {}; for (const pr of r.info.programs) { const k = `${pr.type || ''}:${pr.name || ''}`; progs[k] = (progs[k] || 0) + 1; }
      const held = new Map();
      n.scene.traverse((o) => { const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const mt of mats) { const ts = []; for (const k of keys) if (mt[k] && mt[k].isTexture) ts.push(mt[k]); if (mt.uniforms) for (const u of Object.values(mt.uniforms)) if (u && u.value && u.value.isTexture) ts.push(u.value); for (const t of ts) { if (held.has(t)) continue; const im = t.image; if (!im) continue; const kind = typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement ? 'canvas' : typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap ? 'bitmap' : im.data ? 'data' : null; if (!kind) continue; const bytes = kind === 'data' ? (im.data.byteLength || 0) : (im.width || 0) * (im.height || 0) * 4; if (!bytes) continue; held.set(t, { owner: topName(o), kind, w: im.width, h: im.height, bytes, version: t.version }); } } });
      const byOwner = {}; for (const e of held.values()) { const k = `${e.kind}:${e.owner}`; byOwner[k] = byOwner[k] || [0, 0, new Set()]; byOwner[k][0] += 1; byOwner[k][1] += e.bytes; byOwner[k][2].add(`${e.w}x${e.h}${e.version > 1 ? ` v${e.version}` : ''}`); }
      // the shapes on the card by owner: each geometry's attributes and index as they were handed over (their arrays may be gone)
      const gpuBy = {}; const seenGeo = new Set();
      n.scene.traverse((o) => { const geo = o.geometry; if (!geo || !geo.attributes || seenGeo.has(geo)) return; seenGeo.add(geo); let b = 0; for (const a of [...Object.values(geo.attributes), ...(geo.index ? [geo.index] : [])]) { if (!a) continue; const arr = a.array || (a.data && a.data.array); const per = arr && arr.BYTES_PER_ELEMENT ? arr.BYTES_PER_ELEMENT : 4; b += (a.count || 0) * (a.itemSize || 1) * per; } const k = topName(o); gpuBy[k] = (gpuBy[k] || 0) + b; });
      detail = {
        programs: Object.entries(progs).sort((a, b) => b[1] - a[1]),
        held: Object.entries(byOwner).sort((a, b) => b[1][1] - a[1][1]).slice(0, 40).map(([k, [c, b, sizes]]) => [k, c, +(b / 1048576).toFixed(2), [...sizes].slice(0, 6).join(' ')]),
        shapesOnCardByOwner: Object.entries(gpuBy).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, b]) => [k, +(b / 1048576).toFixed(2)]),
      };
    }
    return {
      detail,
      onCard,
      heapMB: m.usedJSHeapSize ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null,
      shapesKeptMB: +(total / 1048576).toFixed(1), shapes: inScene, shapesByOwner: top,
      shapesOnCardMB: +(gb.bytes / 1048576).toFixed(1), buffersOnCard: gb.buffers,
      picturesMB: +((g.pictures || 0) / 1048576).toFixed(1), drawBuffersMB: +((g.buffers || 0) / 1048576).toFixed(1), screenMB: +((g.screen || 0) / 1048576).toFixed(1),
      canvasMB: +(canvasBytes / 1048576).toFixed(1), canvases, bitmapsHeldMB: +(bitmapBytes / 1048576).toFixed(1), bitmaps, imagesMB: +(imageBytes / 1048576).toFixed(1), images,
      textures: r.info.memory.textures, geometries: r.info.memory.geometries, programs: r.info.programs.length,
      domCanvases: document.querySelectorAll('canvas').length,
      // the town's people about: how many are drawn as their own figures, and as plain ones
      people: n.crowd ? { rigs: n.crowd.stats.rigs, simple: n.crowd.stats.simple, figures: n.crowd.stats.figures } : null,
    };
  });
  const row = { place: name, quietMs: q, peak, proc: procMemory(), heapUsage: { usedMB: MB(usage.usedSize || 0), totalMB: MB(usage.totalSize || 0), embedderMB: MB(usage.embedderHeapUsedSize || 0), backingStoreMB: MB(usage.backingStorageSize || 0) }, ...parts };
  results.push(row);
  console.log(name, JSON.stringify(row));
}
writeFileSync(resolve(out, `memory-parts-${LABEL}.json`), JSON.stringify({ site: SITE, level: LEVEL, dpr: DPR, results }, null, 1));
await browser.close();
server.close();
process.exit(0);
