// The whole site on this machine: the built page, and the server behind it, as the host runs them.
//
//   node prototype/build.mjs
//   server/with-postgres.sh node server/dev.mjs [port]        then open http://localhost:8787/
//
// It serves prototype/dist/site/ (what `node build.mjs --site` copies to site/), or the folder PCW_SITE names (another
// build of the site, to try the same test on both), and answers /api/game with the very function the host runs
// (api/game.js). The database is whatever PCW_DATABASE_URL says; with none, the page works as it does for a visitor
// to a site that has no accounts.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const game = require('../api/game.js');
const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(process.env.PCW_SITE || resolve(here, '../prototype/dist/site'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };

export function createDevServer() {
  return createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/api/game') { game(req, res); return; }
    const file = resolve(site, `.${path === '/' ? '/index.html' : path}`);
    if (!(file === site || file.startsWith(site + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': path === '/sw.js' ? 'no-cache' : 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8787;
  createDevServer().listen(port, '127.0.0.1', () => console.log(`PostCivilWar on http://localhost:${port}/  (${process.env.PCW_DATABASE_URL ? 'with a database' : 'no database: accounts are off'})`));
}
