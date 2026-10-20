// The website served the way the host serves it, over a slow connection: for measuring the opening (test/opening.mjs).
//
//   - every file of the folder, with the host's types, its compression (brotli for the kinds of file the host
//     compresses, nothing for the rest: https://vercel.com/docs/compression), its revalidation (an ETag, and 304 when
//     the browser already has the file) and the cache times vercel.json sets; /api/ answered by `api` (the game's own
//     server function, api/game.js), after the link's wait;
//   - one shared link of `rate` bytes a second for everything the browser fetches (the page, its workers and the
//     service worker alike: a throttle set in the browser's tools does not reach a service worker's fetches), with
//     `rtt` milliseconds before each answer begins;
//   - a count of what was sent for each file, so that a file fetched twice is seen.
// Not a test itself.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.gz': 'application/gzip',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};
// what the host compresses (its list, by the start of the type)
const COMPRESSED = /^(text\/(css|csv|javascript|plain|markdown|html|xml|vtt)|application\/(json|manifest\+json|javascript|xml|wasm|tar|ld\+json|x-web-app-manifest\+json)|image\/(svg\+xml|bmp|x-icon)|font\/(otf|ttf))/;

// the cache rules of vercel.json, by path
function cacheFor(path) {
  if (/^\/(figures|cover)\//.test(path) || ['/game.js', '/three.min.js', '/reactions.json'].includes(path) || path.endsWith('.bin.gz')) return 'public, max-age=31536000, immutable';
  if (path.endsWith('.b64.txt')) return 'public, max-age=3600';
  if (path === '/sw.js') return 'public, max-age=0, must-revalidate';
  if (path.startsWith('/assets/')) return 'public, max-age=604800';
  return 'public, max-age=0, must-revalidate';
}

export function createSlowServer({ root, rate: startRate = 204800, rtt = 150, log = false, api = null } = {}) {
  let rate = startRate;              // bytes a second (setRate changes it)
  const sent = new Map();          // path -> { requests, full, notModified, bytes, first, last }
  const packed = new Map();        // file -> { mtime, body } (brotli, made once)
  let nextFree = 0;                // when the shared link is next free (ms, performance clock of this process)
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  // the link: a chunk goes when the link has finished with everything queued before it
  const slot = (bytes) => { const at = Math.max(now(), nextFree); nextFree = at + (bytes / rate) * 1000; return nextFree - now(); };
  const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const entry = (path) => { let s = sent.get(path); if (!s) { s = { requests: 0, full: 0, notModified: 0, bytes: 0, first: null, last: null }; sent.set(path, s); } return s; };
  // (a request is counted when it is answered; its bytes as each piece goes, so that a file still on its way counts)
  const note = (path, kind, bytes) => {
    const s = entry(path);
    s.requests += 1; if (kind === 200) s.full += 1; if (kind === 304) s.notModified += 1; s.bytes += bytes;
    if (s.first === null) s.first = now(); s.last = now();
  };
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    // the game's server (api/game.js, as the host runs it), after the link's wait
    if (api && path.startsWith('/api/')) { await wait(rtt); note(path, 'api', 0); api(req, res); return; }
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) {
      await wait(rtt); res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); note(path, 404, 0); return;
    }
    const st = statSync(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    const etag = `"${createHash('sha1').update(`${file}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 20)}"`;
    const headers = { 'Content-Type': type, 'Cache-Control': cacheFor(path === '/' ? '/index.html' : path), ETag: etag, Vary: 'Accept-Encoding' };
    await wait(rtt);
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); note(path, 304, 0); return; }
    let body = readFileSync(file);
    if (COMPRESSED.test(type) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
      let made = packed.get(file);
      if (!made || made.mtime !== st.mtimeMs) { made = { mtime: st.mtimeMs, body: brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } }) }; packed.set(file, made); }
      body = made.body; headers['Content-Encoding'] = 'br';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); note(path, 200, 0); return; }
    let closed = false;
    res.on('close', () => { closed = true; });
    // (counted as sent in full once the whole of it has gone; a file stopped on its way, as the page stops a figure
    // the player has pressed past, is counted as cut off)
    note(path, 'begun', 0);
    let done = 0;
    for (let at = 0; at < body.length && !closed; at += 16384) {
      const chunk = body.subarray(at, Math.min(body.length, at + 16384));
      await wait(slot(chunk.length));
      if (closed) break;
      res.write(chunk); done += chunk.length; entry(path).bytes += chunk.length;
    }
    if (done === body.length) entry(path).full += 1; else entry(path).cut = (entry(path).cut || 0) + 1;
    res.end();
    if (log) console.log(`  served ${path} ${done} bytes${closed ? ' (cut off)' : ''}`);
  });
  return {
    server,
    listen: () => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}/`))),
    close: () => new Promise((ok) => { server.closeAllConnections && server.closeAllConnections(); server.close(() => ok()); }),
    // what has been sent, per file, and in all
    sent: () => Object.fromEntries(sent),
    total: () => [...sent.values()].reduce((n, s) => n + s.bytes, 0),
    reset: () => { sent.clear(); },
    // the link made faster or slower from now on (bytes a second)
    setRate: (bytes) => { rate = bytes; },
    now,
  };
}
