// How the game performs at its usual places (the owner's brief of 23 October 2026: measured before anything is changed,
// and after each stage): on a phone's settings (#lite, a phone's screen, the processor slowed four times) or a
// computer's, the time to PLAY on a first visit, to the character screen, and into the town; then at each place, by day
// and by night: the time a frame takes, draw calls and triangles (the picture's and the sun's shadows' apart), what the
// graphics card holds (the game's own count), the script's memory, and a picture.
//   ../server/with-postgres.sh node tools/measure/places.mjs <out folder> phone|computer [places, comma separated|all] [site folder]
// The site folder defaults to dist/site (node build.mjs makes it). PERF_LEVEL=n holds the graphics level at n (0, the
// most, by default); PERF_QUICK=1 does not wait for the town to be wholly ready first; PERF_DAY_ONLY=1 measures by day
// only; PERF_WHEN="day:12,dusk:18.2,rain:13:rain" the hours (and weathers: clear, cloudy, rain, storm) each place is
// measured at, named (by default day:12,night:22); PERF_DPR=n gives the screen n pixels to each of the page's (1 by default; a phone's are 2 to 3). TEXTURE_LIST=1
// lists what is on the graphics card, picture by picture, after each place; DUMP_IMPOSTORS=1, PROBE_MIPS=1 and
// PROBE_HAB=1 look at the habitation's pictures of its far trees. Side by side: python3 tools/measure/sheets.py
// <before> <after> phone|computer <out.pdf> [title].
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { pastQuestion } = await import(`${ROOT}/prototype/test/start.mjs`);
const out = resolve(process.argv[2] || '/tmp/perf'); mkdirSync(out, { recursive: true });
const DEVICE = process.argv[3] === 'computer' ? 'computer' : 'phone';
const ONLY = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null;
const SITE = resolve(process.argv[5] || `${ROOT}/prototype/dist/site`);
const PHONE = DEVICE === 'phone';

// the site and the server's /api/game, as server/dev.mjs serves them (but from the folder given)
const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };
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

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
// (PERF_DPR: the screen's pixels to each of the page's; 1 unless asked: a phone's is 2 to 3, of which each graphics level
// draws at most its own share)
const DPR = Number(process.env.PERF_DPR) > 0 ? Number(process.env.PERF_DPR) : 1;
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) { errors.push(m.text()); console.log('CONSOLE', m.text().slice(0, 300)); } });
const cdp = await context.newCDPSession(page);
if (PHONE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
// (the page's own processor time: how long its main thread is busy, in all, by Chrome's count, the slowing included)
await cdp.send('Performance.enable');
const busy = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); const m = Object.fromEntries(metrics.map((x) => [x.name, x.value])); return { task: m.TaskDuration || 0, script: m.ScriptDuration || 0 }; };
// frames, counted from the start
// (the same random numbers in every run, so that what is placed at random, the stars say, is placed alike)
await page.addInitScript(() => { let s = 20261023; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
// (TEXTURE_TRACE: every picture the 3D library makes remembered with where in the game's code it was made, so that the
// list after each place (TEXTURE_LIST) says what made each, those nothing in the scene uses among them: each texture
// is caught as its constructor gives it its id, `uuid`, through a setter put on Texture's prototype before the library
// is read)
if (process.env.TEXTURE_TRACE) await page.addInitScript(() => {
  let T;
  const made = window.__texturesMade = [];
  Object.defineProperty(window, 'THREE', { configurable: true, get() { return T; }, set(v) {
    T = v;
    try {
      Object.defineProperty(v.Texture.prototype, 'uuid', { configurable: true, get() { return this.__uuid; }, set(id) {
        this.__uuid = id;
        if (this.__madeAt === undefined) {
          const lines = (new Error().stack || '').split('\n').slice(2).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '')).filter((l) => !/three\.min\.js/.test(l));
          Object.defineProperty(this, '__madeAt', { value: lines.slice(0, 4).join(' < '), enumerable: false });
          made.push(new WeakRef(this));
        }
      } });
    } catch (error) { console.log('TEXTURE_TRACE could not watch the textures:', error.message); }
  } });
});
await page.addInitScript(() => { window.__ft = []; window.__fbase = 0; const f = (t) => { window.__ft.push(t); if (window.__ft.length > 600) { window.__ft.splice(0, 300); window.__fbase += 300; } requestAnimationFrame(f); }; requestAnimationFrame(f); });

const result = { device: DEVICE, site: SITE, when: new Date().toISOString(), engine: null, loading: {}, places: [], errors };
const tap = (sel) => (PHONE ? page.tap(sel) : page.click(sel));

// ---- loading: a first visit to PLAY, then to the character screen, then into the town ----
const navStart = Date.now();
await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 600000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 600000 });
result.loading.playMs = await page.evaluate(() => Math.round(performance.now()));
result.loading.playWallMs = Date.now() - navStart;
result.engine = await page.evaluate(() => (window.THREE && window.THREE.REVISION) || (window.__nlw && window.__nlw.engine) || null);
console.log('PLAY at', result.loading.playMs, 'ms; engine', result.engine);
await page.evaluate(() => document.getElementById('cover-play').click());
const t1 = Date.now();
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 600000 });
await page.click('#open-signup');
await page.fill('#account-username', `Perf_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the measuring');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.waitForFunction(() => (window.__nlw.figureLog() || []).some((r) => r.readyMs !== undefined), null, { timeout: 600000 }).catch(() => {});
result.loading.characterMs = Date.now() - t1;     // (from PLAY, with the account made on the way)

// ---- what is measured at a place ----
const quiet = async (most = 45000) => {
  // until what the graphics card holds stops changing (models and pictures arriving), at most `most`
  const t0 = Date.now(); let last = '', same = 0;
  while (Date.now() - t0 < most) {
    const now = await page.evaluate(() => { const r = window.__nlw.renderer; const m = r ? r.info.memory : {}; const g = window.__nlw.graphics || {}; return `${m.geometries}/${m.textures}/${g.held}`; });
    if (now === last) { same += 1; if (same >= 3) return Date.now() - t0; } else { same = 0; last = now; }
    await page.waitForTimeout(1500);
  }
  return Date.now() - t0;
};
const frames = async (n, most = 120000) => {
  // (frames counted from the start: the list keeps the last few hundred, __fbase how many it has let go)
  const k0 = await page.evaluate(() => window.__fbase + window.__ft.length);
  const b0 = await busy();
  // (looked at twice a second, not every frame: the looking is itself work for the page)
  await page.waitForFunction(([k0, n]) => window.__fbase + window.__ft.length >= k0 + n, [k0, n], { timeout: most, polling: 500 }).catch(() => {});
  const b1 = await busy();
  const t = await page.evaluate((k0) => window.__ft.slice(Math.max(0, k0 - window.__fbase)), k0);
  const d = []; for (let i = 1; i < t.length; i += 1) d.push(t[i] - t[i - 1]);
  d.sort((a, b) => a - b);
  // busyMs: the main thread's time for each frame (the game's script and its handing of the picture to the graphics
  // card, not the drawing itself, which this machine does in another process): what a phone's processor would have to
  // do each frame, slowed as set
  const drawn = Math.max(1, t.length);
  return { n: d.length, median: d.length ? Math.round(d[Math.floor(d.length / 2)]) : null, p90: d.length ? Math.round(d[Math.min(d.length - 1, Math.floor(d.length * 0.9))]) : null, busyMs: +(((b1.task - b0.task) * 1000) / drawn).toFixed(1), scriptMs: +(((b1.script - b0.script) * 1000) / drawn).toFixed(1) };
};
const state = () => page.evaluate(() => {
  const n = window.__nlw, r = n.renderer, g = n.graphics || {};
  const mem = performance.memory || {};
  const safe = (f) => { try { return f(); } catch (e) { return null; } };
  return { level: safe(() => n.quality), sunShadows: safe(() => n.sunShadows), calls: n.drawn ? n.drawn.calls : null, triangles: n.drawn ? n.drawn.triangles : null, gpuMB: +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(1), picturesMB: +((g.pictures || 0) / 1048576).toFixed(1), buffersMB: +((g.buffers || 0) / 1048576).toFixed(1), screenMB: +((g.screen || 0) / 1048576).toFixed(1), pixelRatio: r ? r.getPixelRatio() : null, textures: r ? r.info.memory.textures : null, geometries: r ? r.info.memory.geometries : null, programs: r && r.info.programs ? r.info.programs.length : null, heapMB: mem.usedJSHeapSize ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null };
});
// what the main picture and the sun's shadow map each draw, per frame, counted object by object over four frames (three.js
// r186 counts the shadow map's draws in renderer.info, r128 did not: this counts both the same way on both)
const passes = () => page.evaluate(() => new Promise((done) => {
  const r = window.__nlw.renderer, rbd = r.renderBufferDirect, render = r.render;
  const c = { frames: 0, main: { calls: 0, tris: 0 }, shadow: { calls: 0, tris: 0 }, post: { calls: 0, tris: 0 } };
  r.render = function (...a) { if (r.getRenderTarget() === null) c.frames += 1; return render.apply(this, a); };
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const target = r.getRenderTarget();
    const shadow = target !== null && camera && camera.isOrthographicCamera && material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial || material.type === 'MeshDepthMaterial');
    const main = target === null;
    {
      const idx = group ? group.count : geometry.index ? geometry.index.count : geometry.attributes.position ? geometry.attributes.position.count : 0;
      const inst = object.isInstancedMesh ? object.count : geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1;
      // (and what is drawn into the picture's own passes since stage 3: the soft darkening's picture of the near
      // surfaces, the glow's: post)
      const p = shadow ? c.shadow : main ? c.main : c.post; p.calls += 1; p.tris += Math.floor(idx / 3) * (Number.isFinite(inst) ? Math.max(0, inst) : 1);
    }
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
  let k = 0; const f = () => { k += 1; if (k < 5) requestAnimationFrame(f); else { r.render = render; r.renderBufferDirect = rbd; const n = Math.max(1, c.frames); done({ frames: c.frames, mainCalls: Math.round(c.main.calls / n), mainTris: Math.round(c.main.tris / n), shadowCalls: Math.round(c.shadow.calls / n), shadowTris: Math.round(c.shadow.tris / n), postCalls: Math.round(c.post.calls / n), postTris: Math.round(c.post.tris / n) }); } };
  requestAnimationFrame(f);
}));
const setHour = (h, kind = 'clear') => page.evaluate(([h, kind]) => { const n = window.__nlw, g = n.host.game; const day = Math.floor(g.state.t / 86400); g.state.t = day * 86400 + h * 3600; g.state.weather = { kind, until: g.state.t + 12 * 3600 }; }, [h, kind]);
const WHEN = process.env.PERF_WHEN ? process.env.PERF_WHEN.split(',').map((w) => { const [name, hour, kind = 'clear'] = w.split(':'); return [name, Number(hour), kind]; }) : null;
let shotN = 0;
const shot = async (name) => { const f = resolve(out, `${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); return f; };
const measureHere = async (place, quietMs, n = 8) => {
  const row = { place, quietMs };
  // (PERF_DAY_ONLY: by day only, for a quicker measuring of each graphics level)
  for (const [when, hour, kind] of (WHEN || (process.env.PERF_DAY_ONLY ? [['day', 12]] : [['day', 12], ['night', 22]]))) {
    await setHour(hour, kind);
    await frames(4, 90000);
    // (rain: the ground given time to be wet through; after it, to dry a little, as the hour's own weather has it)
    if (kind === 'rain' || kind === 'storm') await page.waitForTimeout(12000);
    const f = await frames(n, 180000);
    row[when] = { frame: f, ...(await state()), ...(await passes()) };
    row[when].shot = await shot(`${place.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${when}`);
    console.log(place, when, JSON.stringify({ frame: f, ...row[when], shot: undefined }));
  }
  result.places.push(row);
};

// ---- the character screen ----
if (!ONLY || ONLY.includes('character')) {
  await page.waitForTimeout(1500);
  const f = await frames(8, 120000);
  const s = await state();
  result.places.push({ place: 'character screen', day: { frame: f, ...s, shot: await shot('character-screen') } });
  console.log('character screen', JSON.stringify({ frame: f, ...s }));
}

// ---- into the town ----
await page.fill('#name', 'Perf');
await tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 120000 });
const t2 = Date.now();
await tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.playerId && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
result.loading.townMs = Date.now() - t2;
// (every place measured at the game's full detail, its level 0: on this machine, which draws in software, the game would
// otherwise step its detail down as it does on a slow device, and what is measured would depend on how long it had run)
const LEVEL = process.env.PERF_LEVEL ? Number(process.env.PERF_LEVEL) : 0;
// (and the memory guard set aside, which would lower even a level held when the card is nearly full: what each level
// holds is what is measured; whether that is past the guard's limit is in the numbers)
await page.evaluate((level) => { const n = window.__nlw, g = n.governor; g.hold(true); g.set(level, 'measuring'); if (n.graphicsPretend) n.graphicsPretend.extraMB = -1e6; }, LEVEL);
const t3 = Date.now();
if (!process.env.PERF_QUICK) await page.waitForFunction(() => window.__nlw.beyond, null, { timeout: 900000 }).catch(() => {});
result.loading.warmMs = Date.now() - t3;
console.log('loading', JSON.stringify(result.loading));
await page.evaluate(() => { for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });

const park = await page.evaluate(() => window.__nlw.service('park'));
const PLACES = [
  ['motor park', park.x + 6, park.z + 4, Math.PI],
  ['market', 30, 60, Math.PI / 2],
  ['city boulevard', 0, 20, 0],
  ['PowerBike showroom', -63.6, 64, Math.PI],
  ['car showroom gate', -420, -58, Math.PI],
  ['airport', -845, -244, Math.PI],
  ['town west', -300, 113, 0],
  ['town east end', 200, 113, Math.PI / 2],
  ['by the sign', 262, 113, Math.PI / 2],
  ['habitation gate', 350, 91, Math.PI / 2],
  ['entrance hill', 382, 16, 0.9],
  ['lagoon beach', 618, 118, 0.6],
  ['big waterfall', 894, 216, 1.6],
  ['garden', 618, 405, Math.PI],
  ['boiling river', 528, -180, Math.PI],
];
// (TEXTURE_LIST: after each place, what is on the graphics card, picture by picture: textures-<place>.json)
const pictureList = async (place) => {
  // (what is on the graphics card, picture by picture, as the game's own count has it (graphics-count.js), each matched
  // to the materials that use it and the objects that draw them; what nothing in the scene uses is the drawing's own:
  // the sun's shadow map, the reflected sky as it is made, and pictures kept for later)
  const found = await page.evaluate(() => {
    const n = window.__nlw, r = n.renderer, g = n.graphics || {}, seen = new Map();
    const onCard = new Map((typeof g.list === 'function' ? g.list() : []).map((e) => [e.texture, e.bytes]));
    const glOf = (t) => { try { const p = r.properties.get(t); return p && p.__webglTexture ? p.__webglTexture : null; } catch (e) { return null; } };
    const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'envMap', 'lightMap', 'bumpMap', 'specularMap'];
    const top = (o) => { const names = []; for (let p = o; p && names.length < 4; p = p.parent) if (p.name) names.push(p.name); return names.reverse().join(' / ') || o.type; };
    const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    n.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) for (const k of keys) {
        const t = m[k]; if (!t || !t.isTexture) continue;
        const img = t.image || {};
        const gl = glOf(t);
        const kind = typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement ? 'canvas' : typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap ? 'bitmap' : img.tagName ? img.tagName.toLowerCase() : t.isRenderTargetTexture ? 'drawn' : typeof img;
        let at = null;
        if (!seen.has(t)) { const v = new n.THREE.Vector3(); o.getWorldPosition(v); at = [Math.round(v.x), Math.round(v.z)]; }
        const e = seen.get(t) || { name: t.name || '', material: m.name || m.type, kind, at, slot: k, w: img.width || 0, h: img.height || 0, drawn: t.userData && t.userData.drawn || null, bytes: gl && onCard.has(gl) ? onCard.get(gl) : 0, users: new Set(), shown: false, gl };
        e.users.add(top(o)); if (shown(o) && m.visible !== false) e.shown = true; seen.set(t, e);
      }
    });
    const matched = new Set([...seen.values()].map((e) => e.gl).filter(Boolean));
    const named = {};
    const sun = n.sky && n.sky.sun && n.sky.sun.shadow && n.sky.sun.shadow.map;
    if (sun) { named.shadowMap = onCard.get(glOf(sun.texture)) || 0; if (sun.depthTexture) named.shadowDepth = onCard.get(glOf(sun.depthTexture)) || 0; for (const t of [sun.texture, sun.depthTexture]) { const gl = t && glOf(t); if (gl) matched.add(gl); } }
    const others = [...onCard.entries()].filter(([gl]) => !matched.has(gl)).map(([, bytes]) => bytes).sort((a, b) => b - a);
    // (TEXTURE_TRACE: where each was made; and those nothing in the scene uses, each with what it is)
    const traced = new Map();
    for (const ref of window.__texturesMade || []) { const t = ref.deref(); const gl = t && glOf(t); if (gl) traced.set(gl, t); }
    const describe = (t) => { const img = t.image || {}; return { name: t.name || '', type: t.constructor && t.constructor.name, rt: !!t.isRenderTargetTexture, cube: !!t.isCubeTexture, w: img.width || (t.renderTarget && t.renderTarget.width) || 0, h: img.height || (t.renderTarget && t.renderTarget.height) || 0, madeAt: t.__madeAt || '' }; };
    const unused = [...onCard.entries()].filter(([gl]) => !matched.has(gl)).sort((a, b) => b[1] - a[1]).map(([gl, bytes]) => ({ bytes, ...(traced.has(gl) ? describe(traced.get(gl)) : { untraced: true }) }));
    return {
      list: [...seen.values()].map(({ gl, ...e }) => ({ ...e, madeAt: gl && traced.has(gl) ? traced.get(gl).__madeAt : undefined, onCard: !!(gl && onCard.has(gl)), users: [...e.users].slice(0, 3), uses: e.users.size })).sort((a, b) => b.bytes - a.bytes),
      card: { pictures: g.pictures || 0, held: onCard.size, ...named, others: others.reduce((s, b) => s + b, 0), otherCount: others.length, largestOthers: others.slice(0, 12) },
      unused: unused.slice(0, 30),
    };
  });
  writeFileSync(resolve(out, `textures-${place.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`), JSON.stringify(found, null, 1));
  const MB = (b) => (b / 1048576).toFixed(1);
  const on = found.list.filter((e) => e.onCard);
  console.log(place, 'on the card:', MB(found.card.pictures), 'MB in', found.card.held, 'pictures; used by the scene', MB(on.reduce((s, e) => s + e.bytes, 0)), 'MB in', on.length, '; the shadow map', MB((found.card.shadowMap || 0) + (found.card.shadowDepth || 0)), 'MB; the rest', MB(found.card.others), 'MB in', found.card.otherCount, `(largest ${found.card.largestOthers.map(MB).join(', ')})`);
  for (const e of on.slice(0, 25)) console.log(' ', MB(e.bytes), 'MB', `${e.w}x${e.h}`, e.kind, e.slot, e.shown ? 'shown' : 'hidden', e.uses, `at ${e.at}`, e.users.join(' | ').slice(0, 100));
};
for (const [place, x, z, h] of PLACES) {
  if (ONLY && !ONLY.includes(place)) continue;
  await page.evaluate(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); n.cam.yaw = h; n.cam.dist = 6.5; n.cam.pitch = 0.12; }, [x, z, h]);
  await setHour(12);
  const q = await quiet(place === 'habitation gate' || place === 'entrance hill' ? 120000 : 45000);
  await measureHere(place, q);
  if (process.env.TEXTURE_LIST) await pictureList(place);
}
// (PROBE_MIPS: the far trees' sheet read at each of its smaller copies (mip levels): how much of it is solid enough to be
// drawn (alpha at least a half) at each)
if (process.env.PROBE_MIPS) {
  const mips = await page.evaluate(() => {
    const n = window.__nlw, T = n.THREE, r = n.renderer, imp = n.habitation && n.habitation.impostors;
    if (!imp) return null;
    const size = 256, out = [];
    const target = new T.WebGLRenderTarget(size, size);
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new T.ShaderMaterial({ uniforms: { map: { value: imp.target.texture }, level: { value: 0 } },
      vertexShader: 'varying vec2 vUv2; void main() { vUv2 = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float level; varying vec2 vUv2; void main() { vec4 t = textureLod(map, vUv2, level); gl_FragColor = vec4(t.a, t.a, t.a, 1.0); }' });
    scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
    const buf = new Uint8Array(size * size * 4);
    for (let L = 0; L <= 7; L += 1) {
      mat.uniforms.level.value = L;
      r.setRenderTarget(target); r.render(scene, cam); r.readRenderTargetPixels(target, 0, 0, size, size, buf); r.setRenderTarget(null);
      let half = 0, some = 0, sum = 0; for (let i = 0; i < buf.length; i += 4) { const a = buf[i]; if (a >= 128) half += 1; if (a > 0) some += 1; sum += a; }
      out.push({ L, half, some, mean: +(sum / (size * size) / 255).toFixed(4) });
    }
    target.dispose(); mat.dispose();
    return { revision: T.REVISION, minFilter: imp.target.texture.minFilter, generateMipmaps: imp.target.texture.generateMipmaps, out };
  });
  console.log('mips', JSON.stringify(mips));
}
// (PROBE_HAB: the habitation's far trees: what is drawn as models and as pictures, and the view without the pictures)
if (process.env.PROBE_HAB) {
  const hab = await page.evaluate(() => {
    const n = window.__nlw, h = n.habitation, imp = h && h.impostors;
    const st = h ? h.state() : null;
    const inst = []; if (h && h.root) h.root.traverse((o) => { if (o.isInstancedMesh && o.visible && o.count > 0) inst.push({ name: o.name || o.parent && o.parent.name, count: o.count, culled: o.frustumCulled, sphere: o.boundingSphere ? +o.boundingSphere.radius.toFixed(1) : null }); });
    return { state: st, shown: imp ? imp.shown : null, instanced: inst.length, copies: inst.reduce((s, x) => s + x.count, 0), some: inst.slice(0, 12) };
  });
  console.log('hab', JSON.stringify(hab).slice(0, 3000));
  await page.evaluate(() => { const imp = window.__nlw.habitation.impostors; imp.mesh.visible = false; });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: resolve(out, 'garden-no-pictures.png') });
  await page.evaluate(() => { const imp = window.__nlw.habitation.impostors; imp.mesh.visible = true; window.__nlw.habitation.root.traverse((o) => { if (o.isInstancedMesh) { o.userData.wasVisible = o.visible; o.visible = false; } }); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: resolve(out, 'garden-pictures-only.png') });
  await page.evaluate(() => { window.__nlw.habitation.root.traverse((o) => { if (o.isInstancedMesh) o.visible = o.userData.wasVisible !== false; }); });
}
// (DUMP_IMPOSTORS: the habitation's sheet of the far trees' pictures, as the graphics card holds it, alpha and all)
if (process.env.DUMP_IMPOSTORS) {
  const dump = await page.evaluate(() => {
    const n = window.__nlw, imp = n.habitation && n.habitation.impostors;
    if (!imp) return null;
    const t = imp.target, w = t.width, h = t.height, buf = new Uint8Array(w * h * 4);
    n.renderer.readRenderTargetPixels(t, 0, 0, w, h, buf);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h);
    for (let y = 0; y < h; y += 1) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(img, 0, 0);
    let opaque = 0, partial = 0; for (let i = 3; i < buf.length; i += 4) { if (buf[i] === 255) opaque += 1; else if (buf[i] > 0) partial += 1; }
    return { url: c.toDataURL('image/png'), slots: imp.slots.size, w, h, opaque, partial };
  });
  if (dump) { writeFileSync(resolve(out, 'impostors.png'), Buffer.from(dump.url.split(',')[1], 'base64')); console.log('impostors', JSON.stringify({ ...dump, url: undefined })); }
  else console.log('impostors: none');
}
writeFileSync(resolve(out, `perf-${DEVICE}.json`), JSON.stringify(result, null, 1));
console.log('written', resolve(out, `perf-${DEVICE}.json`), 'errors', errors.length);
await browser.close();
server.close();
process.exit(0);
