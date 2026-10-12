// The game as an app on a device: what can be checked of it without a browser. The website itself is opened,
// installed and taken off the network in test/webapp.mjs.
//
//   node --test test/webapp.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { installWay, playsOffline, createWebApp } from '../src/client/webapp.js';

const here = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(here(path), 'utf8');
const pngSize = (path) => { const b = readFileSync(here(path)); assert.equal(b.toString('latin1', 1, 4), 'PNG', `${path} is a PNG`); return [b.readUInt32BE(16), b.readUInt32BE(20), b[25]]; };

test('the manifest names the game, opens it on the whole screen, and every icon it lists is there at the size it says', () => {
  const m = JSON.parse(read('src/site/manifest.webmanifest'));
  assert.equal(m.name, 'PostCivilWar');
  assert.ok(m.short_name.length <= 12, 'the name under the icon is not cut short');
  assert.equal(m.display, 'fullscreen');
  assert.deepEqual(m.display_override, ['fullscreen', 'standalone']);
  assert.equal(m.orientation, 'any', 'the game is played upright and sideways');
  // black, as every ground of the interface is
  assert.equal(m.background_color, '#000000');
  assert.equal(m.theme_color, '#000000');
  // addresses beside the page, so the same files work at any address they are served from
  for (const key of ['id', 'start_url', 'scope']) assert.equal(m[key], './');
  const purposes = new Set();
  for (const icon of m.icons) {
    const [w, h] = pngSize(`assets/brand/icons/${icon.src}`);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    assert.equal(icon.type, 'image/png');
    purposes.add(`${icon.purpose} ${icon.sizes}`);
  }
  // what a phone needs to offer installing: a small and a large icon, and the same again for cutting to its own shape
  for (const need of ['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512']) assert.ok(purposes.has(need), need);
});

test('the icons: a phone that cuts its own shape gets a full square; a tab gets cut corners', () => {
  // colour type 6 has transparency, 2 has none
  assert.deepEqual(pngSize('assets/brand/icons/apple-touch-icon.png'), [180, 180, 2]);
  assert.equal(pngSize('assets/brand/icons/icon-maskable-512.png')[2], 2);
  assert.equal(pngSize('assets/brand/icons/icon-512.png')[2], 6);
  assert.deepEqual(pngSize('assets/brand/icons/share.png').slice(0, 2), [1200, 630]);
  const svg = read('assets/brand/icons/favicon.svg');
  // the mark and its two colours, and nothing fetched
  assert.ok(svg.includes('#e9c46a') && svg.includes('#ffffff') && svg.includes('#000000'));
  assert.ok(!/href=|url\(http/.test(svg));
});

test('the website\'s page is a whole document: read at the phone\'s width, by the standard rules, with its manifest and icons', () => {
  const head = read('src/site/head.html');
  assert.match(head, /<meta charset="utf-8">/);
  assert.match(head, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
  assert.match(head, /<title>PostCivilWar<\/title>/);
  // the manifest is asked for with the visitor's sign-in, so a preview behind a sign-in can be installed too
  assert.match(head, /<link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">/);
  assert.match(head, /<link rel="apple-touch-icon" href="apple-touch-icon.png">/);
  assert.match(head, /<meta name="theme-color" content="#000000">/);
  assert.match(head, /body\{margin:0/);
  // nothing in it comes from anywhere but the site itself (the two addresses are what a shared link shows)
  const outside = [...head.matchAll(/(?:href|src)="(https?:[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(outside, []);
  for (const m of head.matchAll(/(?:href)="([^"]+)"/g)) if (m[1] !== 'manifest.webmanifest') assert.ok(existsSync(here(`assets/brand/icons/${m[1]}`)), `${m[1]} exists`);
  const build = read('build.mjs');
  assert.ok(build.includes('<!doctype html>\\n<html lang="en">'), 'the build writes a doctype');
  assert.ok(build.includes('<script src="three.min.js">'), 'the 3D library comes from beside the page');
});

test('how the game can be installed is said only where it is true', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  // not the website (the artifact, a copy on disk): nothing is offered, whatever the device
  assert.equal(installWay({ site: false, offered: true, userAgent: iphone }), null);
  assert.equal(installWay({ site: true, standalone: true, offered: true, userAgent: android }), 'installed');
  assert.equal(installWay({ site: true, offered: true, userAgent: android }), 'prompt');
  // a browser that has not offered is not said to offer
  assert.equal(installWay({ site: true, offered: false, userAgent: android }), null);
  assert.equal(installWay({ site: true, userAgent: iphone }), 'share');
  // an iPad calls itself a Mac; a Mac has no touch screen
  assert.equal(installWay({ site: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', touchPoints: 5 }), 'share');
  assert.equal(installWay({ site: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', touchPoints: 0 }), null);
});

test('"plays without a connection" is yes only when the page, the 3D library and the player\'s own figure are kept', () => {
  const needs = ['', 'three.min.js', 'woman.b64.txt'];
  assert.equal(playsOffline({ worker: false, kept: needs, needs }), 'no');
  assert.equal(playsOffline({ worker: true, kept: ['', 'three.min.js'], needs }), 'not yet');
  assert.equal(playsOffline({ worker: true, kept: ['', 'three.min.js', 'man.b64.txt'], needs }), 'not yet');
  assert.equal(playsOffline({ worker: true, kept: ['', 'three.min.js', 'woman.b64.txt', 'icon-192.png'], needs }), 'yes');
});

test('away from the website the page offers nothing and starts no worker', () => {
  assert.equal(createWebApp({ win: null }).site, false);
  let registered = 0;
  const win = { document: { querySelector: () => null, readyState: 'complete' }, navigator: { serviceWorker: { register: () => { registered += 1; return Promise.resolve({}); } } }, location: { protocol: 'https:', hostname: 'claude.ai' }, addEventListener() {} };
  win.self = win; win.top = win;
  const app = createWebApp({ win });
  assert.deepEqual(app.state(), { site: false, way: null, offline: 'no' });
  assert.equal(registered, 0);
});

test('on the website, in a frame, the page starts no worker', () => {
  let registered = 0;
  const win = { document: { querySelector: () => ({}), readyState: 'complete' }, navigator: { userAgent: '', serviceWorker: { register: () => { registered += 1; return Promise.resolve({}); } } }, location: { protocol: 'https:', hostname: 'postcivilwar.com' }, addEventListener() {}, matchMedia: () => ({ matches: false }) };
  win.self = win; win.top = {};
  const app = createWebApp({ win });
  assert.equal(registered, 0);
  assert.equal(app.state().offline, 'no');
});

// ---- the worker, run here against a pretend network and a pretend store ----

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const SCOPE = 'https://postcivilwar.test/';

// A site as the build makes one: the worker's table filled in from the files' contents.
function makeSite(files) {
  const table = {};
  for (const [name, body] of Object.entries(files)) if (name !== 'index.html') table[name] = sha(body);
  const source = read('src/site/sw.js').replace('/*@@FILES@@*/{}', JSON.stringify(table)).replace('/*@@FIRST@@*/[]', JSON.stringify(['', 'three.min.js']));
  return { files: { ...files }, source };
}

// One device: what it has kept stays when the site is brought up to date and a new worker takes over.
function makeDevice() {
  const stores = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(key) { const hit = store.get(String(key.url || key)); return hit ? new Response(hit.body, { status: 200, headers: hit.headers }) : undefined; },
        async put(key, response) { store.set(String(key.url || key), { body: Buffer.from(await response.arrayBuffer()), headers: [...response.headers] }); },
        async keys() { return [...store.keys()].map((url) => ({ url })); },
        async delete(key) { return store.delete(String(key.url || key)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  return { caches, stores };
}

// A worker from `site` on `device`. `net` says what the network does: { online, delay, asked: [] }.
function runWorker(site, device, net) {
  const listeners = {};
  const fetchFake = async (request) => {
    const url = new URL(request.url || request);
    net.asked.push(url.pathname + url.search);
    if (net.delay) await new Promise((resolve) => setTimeout(resolve, net.delay));
    if (!net.online) throw new TypeError('Failed to fetch');
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!(name in site.files)) return new Response('not found', { status: 404 });
    return new Response(site.files[name], { status: 200, headers: { 'content-type': 'text/plain' } });
  };
  const self = { registration: { scope: SCOPE }, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInNewContext(site.source, { self, caches: device.caches, fetch: fetchFake, Request, Response, URL, Promise, Set, Object, Array, JSON, Error, setTimeout, clearTimeout, console });
  const run = async (type, extra = {}) => {
    const waits = [];
    let answer;
    const event = { waitUntil: (p) => waits.push(Promise.resolve(p)), respondWith: (p) => { answer = Promise.resolve(p); }, ...extra };
    listeners[type](event);
    const result = answer ? await answer.then((r) => r, (error) => error) : undefined;
    // read what was answered before the keeping is waited for, as a browser does: the two share one stream
    const text = result instanceof Response ? await result.text() : null;
    await Promise.all(waits);
    return { handled: !!answer, result, text };
  };
  const get = (path, init = {}) => run('fetch', { request: new Request(new URL(path, SCOPE), init) });
  return { run, get, install: () => run('install'), activate: () => run('activate') };
}

const FILES_V1 = { 'index.html': 'the game, version one', 'three.min.js': 'the 3D library', 'woman.b64.txt': 'the woman', 'man.b64.txt': 'the man', 'manifest.webmanifest': '{}' };

test('the worker: installed, it keeps the page and the small files; with no connection it gives them back', async () => {
  const site = makeSite(FILES_V1), device = makeDevice(), net = { online: true, asked: [] };
  const w = runWorker(site, device, net);
  await w.install(); await w.activate();
  // the page and the library were fetched; neither figure was (they are 10 MB and 13 MB)
  assert.deepEqual(net.asked.sort(), ['/', '/three.min.js']);
  net.online = false; net.asked.length = 0;
  assert.equal((await w.get('./')).text, 'the game, version one');
  assert.equal((await w.get('./index.html')).text, 'the game, version one');
  assert.equal((await w.get('./?source=icon')).text, 'the game, version one', 'whatever follows the address');
  assert.equal((await w.get('./three.min.js')).text, 'the 3D library');
  // the library was not even asked for: a file kept under its fingerprint is never fetched again
  assert.ok(!net.asked.includes('/three.min.js'));
  // a figure that was never used is not here, and the worker does not pretend it is
  assert.ok((await w.get('./woman.b64.txt')).result instanceof Error);
});

test('the worker: a figure is kept once it has been used, and only that one', async () => {
  const site = makeSite(FILES_V1), device = makeDevice(), net = { online: true, asked: [] };
  const w = runWorker(site, device, net);
  await w.install(); await w.activate();
  // fetched through the worker
  assert.equal((await w.get('./woman.b64.txt')).text, 'the woman');
  net.online = false;
  assert.equal((await w.get('./woman.b64.txt')).text, 'the woman');
  assert.ok((await w.get('./man.b64.txt')).result instanceof Error);
  // or fetched before the worker was there, and the page says so afterwards
  net.online = true;
  await w.run('message', { data: { type: 'keep', paths: ['man.b64.txt', '../elsewhere', 'index.html', 'no-such-file'] } });
  net.online = false;
  assert.equal((await w.get('./man.b64.txt')).text, 'the man');
  // and it can say what it has
  let said = null;
  await w.run('message', { data: { type: 'kept' }, ports: [{ postMessage: (m) => { said = m; } }] });
  assert.deepEqual([...said.paths].sort(), ['', 'man.b64.txt', 'three.min.js', 'woman.b64.txt']);
});

test('the worker: a file asked for by the fingerprint the page was built with is kept; by another, fetched as it is now and not kept', async () => {
  const site = makeSite({ ...FILES_V1, 'kit.b64.txt': 'the kit, version one' }), device = makeDevice(), net = { online: true, asked: [] };
  const w = runWorker(site, device, net);
  await w.install(); await w.activate();
  const one = sha('the kit, version one');
  // the page of this build asks for its kit by its fingerprint: fetched once, then kept
  assert.equal((await w.get(`./kit.b64.txt?v=${one}`)).text, 'the kit, version one');
  net.asked.length = 0; net.online = false;
  assert.equal((await w.get(`./kit.b64.txt?v=${one}`)).text, 'the kit, version one');
  assert.deepEqual(net.asked, [], 'and is not asked for again');
  // the site is brought up to date and the page that arrives is newer than this worker: it asks for the new kit
  // by its own fingerprint, and is given the kit as it is now, not the one this worker kept
  net.online = true; site.files['kit.b64.txt'] = 'the kit, version two';
  assert.equal((await w.get(`./kit.b64.txt?v=${sha('the kit, version two')}`)).text, 'the kit, version two');
  // ...which is not kept in place of the one this worker's own pages need
  net.online = false;
  assert.equal((await w.get(`./kit.b64.txt?v=${one}`)).text, 'the kit, version one');
});

test('the worker: with a connection the page is always the newest; without one, the newest it has seen', async () => {
  const site = makeSite(FILES_V1), device = makeDevice(), net = { online: true, asked: [] };
  const w = runWorker(site, device, net);
  await w.install(); await w.activate();
  // the game is brought up to date on the server; the worker is still the old one
  site.files['index.html'] = 'the game, version two';
  assert.equal((await w.get('./')).text, 'the game, version two');
  net.online = false;
  assert.equal((await w.get('./')).text, 'the game, version two');
  // the server is in trouble: the kept page, not the error
  net.online = true; delete site.files['index.html'];
  assert.equal((await w.get('./')).text, 'the game, version two');
});

test('the worker: a network that does not answer in four seconds does not hold the game up', async () => {
  const site = makeSite(FILES_V1), device = makeDevice(), net = { online: true, asked: [] };
  const w = runWorker(site, device, net);
  await w.install(); await w.activate();
  site.files['index.html'] = 'the game, version two';
  net.delay = 4600;
  const began = Date.now();
  const shown = await w.get('./');
  assert.equal(shown.text, 'the game, version one');
  // (the helper waits for the slow answer to be kept, as the browser keeps the worker alive for it)
  assert.ok(Date.now() - began < 6000);
  net.delay = 0; net.online = false;
  assert.equal((await w.get('./')).text, 'the game, version two', 'the late answer was kept for next time');
});

test('the worker: when a file changes it is fetched again, and what did not change is not', async () => {
  const device = makeDevice(), net = { online: true, asked: [] };
  const one = runWorker(makeSite(FILES_V1), device, net);
  await one.install(); await one.activate();
  await one.get('./woman.b64.txt'); await one.get('./man.b64.txt');
  // a new build: the page and the man changed; the library and the woman did not
  const next = makeSite({ ...FILES_V1, 'index.html': 'the game, version two', 'man.b64.txt': 'the man, changed' });
  net.asked.length = 0;
  const two = runWorker(next, device, net);
  await two.install(); await two.activate();
  assert.deepEqual(net.asked, ['/'], 'installing again fetched the page and nothing else');
  net.asked.length = 0;
  assert.equal((await two.get('./woman.b64.txt')).text, 'the woman');
  assert.equal((await two.get('./three.min.js')).text, 'the 3D library');
  assert.deepEqual(net.asked, []);
  assert.equal((await two.get('./man.b64.txt')).text, 'the man, changed');
  assert.deepEqual(net.asked, ['/man.b64.txt']);
  // the old man is gone from the device, not left behind
  const keys = [...device.stores.get('pcw-files-v1').keys()];
  assert.equal(keys.filter((k) => k.includes('/man.b64.txt')).length, 1);
  assert.equal(keys.length, 4);
});

test('the worker leaves alone what is not the game\'s', async () => {
  const site = makeSite(FILES_V1), device = makeDevice(), net = { online: true, asked: [] };
  const w = runWorker(site, device, net);
  await w.install(); await w.activate();
  assert.equal((await w.get('https://elsewhere.test/three.min.js')).handled, false);
  assert.equal((await w.get('./some-other-page.html')).handled, false);
  assert.equal((await w.get('./sw.js')).handled, false, 'the worker never keeps itself');
  assert.equal((await w.get('./', { method: 'POST' })).handled, false);
  // an error page is not kept in place of a file
  delete site.files['woman.b64.txt'];
  assert.equal((await w.get('./woman.b64.txt')).result.status, 404);
  site.files['woman.b64.txt'] = 'the woman';
  assert.equal((await w.get('./woman.b64.txt')).text, 'the woman');
});

test('what is served is one build: every file the worker in site/ lists is there, with that fingerprint', () => {
  const served = here('../site/');
  if (!existsSync(new URL('sw.js', served))) return;      // a checkout from before the website was a web app
  const worker = readFileSync(new URL('sw.js', served), 'utf8');
  const table = JSON.parse(worker.match(/const FILES = (\{[^;]*\});/)[1]);
  const first = JSON.parse(worker.match(/const FIRST = (\[[^;]*\]);/)[1]);
  assert.ok(Object.keys(table).length >= 8);
  for (const [name, print] of Object.entries(table)) assert.equal(createHash('sha256').update(readFileSync(new URL(name, served))).digest('hex').slice(0, 16), print, name);
  for (const name of first) assert.ok(name === '' || table[name], `${name} is kept first and is in the table`);
  const page = readFileSync(new URL('index.html', served), 'utf8');
  assert.ok(page.startsWith('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">'));
  assert.ok(page.includes('<script src="three.min.js"></script>'));
  assert.ok(!/<script src="https?:/.test(page), 'no script comes from another site');
  // the figures are the owner's files, byte for byte, written as text
  for (const [text, file] of [['man.b64.txt', 'muscular_male.glb'], ['woman.b64.txt', 'woman.glb']]) {
    const supplied = readFileSync(here(`assets/characters/figures/animated/${file}`));
    assert.ok(Buffer.from(readFileSync(new URL(text, served), 'latin1'), 'base64').equals(supplied), `${text} is ${file}, unchanged`);
  }
  // the wristwatch is the owner's model, byte for byte; it is beside the page and is not one of the files the worker keeps
  assert.ok(readFileSync(new URL('assets/watch.glb', served)).equals(readFileSync(here('assets/market/watch.glb'))), 'the watch on the site is the supplied model, unchanged');
  assert.equal(table['assets/watch.glb'], undefined);
  assert.ok(table['assets/watch-turn.webp'] && table['assets/watch-poster.webp']);
  // the list of songs is always asked for afresh, and every song it names is there
  const songs = JSON.parse(readFileSync(new URL('music/library.json', served), 'utf8')).tracks;
  assert.ok(Array.isArray(songs));
  for (const song of songs) assert.ok(existsSync(new URL(`music/${song.file}`, served)), `music/${song.file}`);
  assert.ok(Object.keys(table).every((name) => !name.startsWith('music/')));
  // and nothing else is lying about in the folder, or in the two folders inside it
  // which build this is: the page's own fingerprint, in a file that is asked for on the live address after a deployment
  const version = JSON.parse(readFileSync(new URL('version.json', served), 'utf8'));
  const pageBytes = readFileSync(new URL('index.html', served));
  assert.equal(version.page, createHash('sha256').update(pageBytes).digest('hex').slice(0, 16), 'version.json names the page that is served with it');
  assert.equal(version.bytes, pageBytes.length);
  assert.equal(table['version.json'], undefined, 'and is always asked for afresh');
  const expected = new Set([...Object.keys(table), 'index.html', 'sw.js', 'version.json', 'THREE-LICENSE.txt', 'share.png', 'assets/watch.glb', 'music/library.json', ...songs.flatMap((song) => [song.file, song.cover].filter(Boolean).map((name) => `music/${name}`))]);
  const there = readdirSync(served, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? readdirSync(new URL(`${entry.name}/`, served)).map((name) => `${entry.name}/${name}`) : [entry.name]));
  assert.deepEqual(there.filter((name) => !expected.has(name)), []);
});
