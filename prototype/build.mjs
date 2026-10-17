// Bundles the prototype into one self-contained HTML page.
//
//   node build.mjs           writes dist/
//   node build.mjs --site    writes dist/, then makes the repository's site/ folder the same as dist/site/
//
// Writes dist/index.html (loads three.js from cdnjs; this is the page
// published as an artifact), dist/local.html (loads the vendored copy; works
// from a disk) and dist/site/ (the website: a whole document with its icons,
// its manifest and the worker that keeps it on a device; see the end of this file).
// There are no build dependencies. Source files are ES modules that use only
// single-line named imports, `export function|const|class` and
// `export * from`, so a module
// can be turned into a function that returns its exports.

import { SUPPLIED_VEHICLES } from './src/sim/zones/supplied-vehicles.js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIGURES } from './src/sim/figures.js';

const root = dirname(fileURLToPath(import.meta.url));
const IMPORT = /^import\s+\{([^}]+)\}\s+from\s+'([^']+)';?[ \t]*$/gm;
const REEXPORT = /^export\s+\*\s+from\s+'([^']+)';?[ \t]*$/gm;
const id = (file) => relative(resolve(root, 'src'), file);

// Everything reachable from one entry file, as one script.
function bundleFrom(entry) {
  const order = [];
  const seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT)) visit(resolve(dirname(file), match[2]));
    for (const match of source.matchAll(REEXPORT)) visit(resolve(dirname(file), match[1]));
    order.push(file);
  }
  visit(entry);
  let bundle = '"use strict";\nconst __modules = {};\n';
  for (const file of order) {
    let source = readFileSync(file, 'utf8');
    if (/^import\s/m.test(source.replace(IMPORT, ''))) throw new Error(`${id(file)}: only single-line named imports are supported`);
    const names = [];
    const spreads = [];
    source = source.replace(REEXPORT, (_, from) => { spreads.push(`...__modules[${JSON.stringify(id(resolve(dirname(file), from)))}]`); return ''; });
    source = source.replace(IMPORT, (_, list, from) => `const {${list}} = __modules[${JSON.stringify(id(resolve(dirname(file), from)))}];`);
    source = source.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => { names.push(name); return `${kind} ${name}`; });
    if (/^export\s/m.test(source)) throw new Error(`${id(file)}: unsupported export form`);
    bundle += `\n// ---- ${id(file)} ----\n__modules[${JSON.stringify(id(file))}] = (function () {\n${source}\nreturn { ${[...spreads, ...names].join(', ')} };\n})();\n`;
  }
  // A script with even one character outside Latin-1 is held by the browser at two bytes a character for
  // as long as the page is open: seven megabytes for nothing. Written as escapes, such characters mean the
  // same in any string, template or regular expression, and the script stays at one byte a character.
  const narrow = bundle.replace(/[\u0100-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return { bundle: narrow.replace(/<\/script/gi, '<\\/script'), modules: order.length };
}
const { bundle, modules } = bundleFrom(resolve(root, 'src/client/main.js'));

// The brand's display face travels inside the page: the host allows no font files of its own.
const font = readFileSync(resolve(root, 'assets/brand/pcw-arcade.ttf')).toString('base64');
const mark = readFileSync(resolve(root, 'src/client/mark.svg.txt'), 'utf8').trim();
const FIGURE_FILES = [['man', 'muscular_male.glb', '__PCW_MAN_B64', true], ['woman', 'woman.glb', '__PCW_WOMAN_B64', true],
  ['athlete', 'athlete.glb', '__PCW_ATHLETE_B64', false], ['police', 'police.glb', '__PCW_POLICE_B64', false],
  ['priest', 'priest.glb', '__PCW_PRIEST_B64', false], ['warrior', 'warrior.glb', '__PCW_WARRIOR_B64', false]];
// Where the page's first script fetches each supplied figure from (template.html): the six of 8 and 12 October as
// base64 text (and, in the copy on disk, the first two written into the page); the eighteen of 16 October as the
// files they are.
const FIGURE_LOAD = Object.fromEntries(Object.values(FIGURES).map((f) => {
  const old = FIGURE_FILES.find(([, file]) => file === f.file);
  return [f.id, old ? [`${old[0]}.b64.txt`, old[2]] : [f.file, null, 1]];
}));
const template = readFileSync(resolve(root, 'src/client/template.html'), 'utf8').replace('@@PCW_FONT@@', font).replaceAll('@@PCW_MARK@@', mark).replace('@@PCW_FIGURE_FILES@@', JSON.stringify(FIGURE_LOAD));
if (template.includes('@@')) throw new Error('template.html: a placeholder was left unfilled');
const page = (three) => `${template}\n<script src="${three}"></script>\n<script>\n${bundle}</script>\n`;
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/index.html'), page('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'));
// The published page is wrapped in a document skeleton by the host. The local
// copy carries an equivalent skeleton of its own.
const skeleton = (content) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${content}</body></html>\n`;
// The two supplied figures are the owner's GLB files as they were supplied (7 and 9 MB). The published page
// fetches each from beside itself: as .glb where the host serves it, otherwise as the same bytes written as
// base64 text (the published artifact serves no .glb). The local copy, opened from disk where nothing can be
// fetched, carries both inside.
// The four added on 12 October 2026 (an athlete, a police officer, a priest, a hooded warrior; 8 to 21 MB each)
// are served the same way; the local copy carries only the first two inside it, so that it stays a file a
// browser can open, and the others are seen on the website.
let inline = '';
for (const [name, file, global, inLocal] of FIGURE_FILES) {
  const bytes = readFileSync(resolve(root, `assets/characters/figures/animated/${file}`));
  writeFileSync(resolve(root, `dist/${name}.glb`), bytes);
  writeFileSync(resolve(root, `dist/${name}.b64.txt`), bytes.toString('base64'));
  if (inLocal) inline += `<script>window.${global} = "${bytes.toString('base64')}";</script>\n`;
}
// The eighteen added on 16 October 2026 (src/sim/figures.js; 5 to 38 MB each) are served as the files they are,
// beside the page, under their own names: the website serves .glb, so no copy as text is made of them. The copy of
// the game on disk carries none of them.
const SERVED_FIGURES = Object.values(FIGURES).map((f) => f.file).filter((file) => !FIGURE_FILES.some(([, f]) => f === file));
for (const file of SERVED_FIGURES) writeFileSync(resolve(root, `dist/${file}`), readFileSync(resolve(root, `assets/characters/figures/animated/${file}`)));
writeFileSync(resolve(root, 'dist/local.html'), skeleton(inline + page('../vendor/three.min.js')));
console.log(`bundled ${modules} modules, ${(bundle.length / 1024).toFixed(0)} KB of script`);

// The character lab: a second, smaller page for looking at characters on their own.
const lab = bundleFrom(resolve(root, 'src/client/lab.js'));
const labTemplate = readFileSync(resolve(root, 'src/client/lab-template.html'), 'utf8');
const labPage = (three) => `${labTemplate}\n<script src="${three}"></script>\n<script>\n${lab.bundle}</script>\n`;
writeFileSync(resolve(root, 'dist/lab.html'), labPage('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'));
writeFileSync(resolve(root, 'dist/lab-local.html'), skeleton(labPage('../vendor/three.min.js')));
console.log(`character lab: ${lab.modules} modules, ${(lab.bundle.length / 1024).toFixed(0)} KB of script`);

// The vehicle yard: a third page, for looking at the keke and the coach on their own.
const yard = bundleFrom(resolve(root, 'src/client/yard.js'));
const yardTemplate = readFileSync(resolve(root, 'src/client/yard-template.html'), 'utf8');
const yardPage = (three) => `${yardTemplate}\n<script src="${three}"></script>\n<script>\n${yard.bundle}</script>\n`;
writeFileSync(resolve(root, 'dist/yard.html'), yardPage('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'));
writeFileSync(resolve(root, 'dist/yard-local.html'), skeleton(yardPage('../vendor/three.min.js')));
console.log(`vehicle yard: ${yard.modules} modules, ${(yard.bundle.length / 1024).toFixed(0)} KB of script`);

// The website, postcivilwar.com: the same game as dist/index.html, as a page that stands on its own and can be
// put on a device. It differs from the artifact's page in what surrounds the game, never in the game:
//   - it is a whole document (the artifact's host wraps its page in one; a website has to bring its own), so a
//     phone lays it out at the phone's width and the browser reads it by the standard rules;
//   - the 3D library is served from beside the page, the same file as vendor/, so nothing comes from anywhere else;
//   - a manifest and icons, so a phone or a computer can install it and open it full screen from its own icon;
//   - sw.js, which keeps the files on the device: the game then opens with no connection (src/site/sw.js).
// The two figures are the owner's files, byte for byte, as base64 text, exactly as beside the artifact's page.
const siteDir = resolve(root, 'dist/site');
rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });
const siteFiles = new Map();          // name -> bytes
const put = (name, bytes) => { siteFiles.set(name, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8')); };
const head = readFileSync(resolve(root, 'src/site/head.html'), 'utf8');
if (!/^<title>PostCivilWar<\/title>\n/.test(template)) throw new Error('template.html: expected to begin with the title');
const gameBody = template.replace(/^<title>[^<]*<\/title>\n/, '');      // the document's head carries the title
// The character kit and the vehicle kit are two-thirds of the game's script: numbers, written as text. On the
// website they are files of their own beside the page: fetched as soon as the page begins to arrive, and kept
// by the worker under their fingerprints, so that bringing the game up to date does not send them again. The
// page asks for each by its fingerprint (sw.js keeps a page and its files from being mixed across builds).
let siteBundle = bundle;
const packFiles = {};
for (const [name, constant] of [['kit', 'KIT_B64'], ['vehicles', 'VEHICLE_B64'], ['moves', 'MOVES_B64']]) {
  const found = new RegExp(`const ${constant} = '([A-Za-z0-9+/=]+)';`).exec(siteBundle);
  if (!found) throw new Error(`the bundle has no ${constant} to take out`);
  if (siteBundle.indexOf(`const ${constant} = '`, found.index + 1) !== -1) throw new Error(`the bundle has ${constant} twice`);
  siteBundle = siteBundle.slice(0, found.index) + `const ${constant} = '';` + siteBundle.slice(found.index + found[0].length);
  put(`${name}.b64.txt`, found[1]);
  packFiles[name] = `${name}.b64.txt?v=${createHash('sha256').update(found[1]).digest('hex').slice(0, 16)}`;
}
const packScript = `<script>window.__PCW_PACK_FILES = ${JSON.stringify(packFiles)};</script>\n`;
put('index.html', `<!doctype html>\n<html lang="en">\n<head>\n${head}${packScript}</head>\n<body>\n${gameBody}\n<script src="three.min.js"></script>\n<script>\n${siteBundle}</script>\n</body>\n</html>\n`);
put('three.min.js', readFileSync(resolve(root, 'vendor/three.min.js')));
put('THREE-LICENSE.txt', readFileSync(resolve(root, 'vendor/THREE-LICENSE.txt')));
for (const [name] of FIGURE_FILES) put(`${name}.b64.txt`, readFileSync(resolve(root, `dist/${name}.b64.txt`)));
for (const file of SERVED_FIGURES) put(file, readFileSync(resolve(root, `dist/${file}`)));
const manifest = readFileSync(resolve(root, 'src/site/manifest.webmanifest'), 'utf8');
JSON.parse(manifest);
put('manifest.webmanifest', manifest);
for (const name of readdirSync(resolve(root, 'assets/brand/icons')).sort()) put(name, readFileSync(resolve(root, 'assets/brand/icons', name)));
for (const icon of JSON.parse(manifest).icons) if (!siteFiles.has(icon.src)) throw new Error(`manifest.webmanifest: no file ${icon.src}`);
// Things that can be owned (asset-view.js): the owner's model exactly as it was supplied, and the photographs
// taken of it. The model is 64 MB and is fetched only when a player asks to see it.
for (const [name, from] of [['assets/watch.glb', 'assets/market/watch.glb'], ['assets/watch-turn.webp', 'assets/market/watch-turn.webp'], ['assets/watch-poster.webp', 'assets/market/watch-poster.webp']]) put(name, readFileSync(resolve(root, from)));
// PostCivilWar PowerBike (16 October 2026): the owner's skyscraper, exactly as supplied (13 MB), beside the page, where
// render-powerbike.js fetches it once the town is ready. The pictures of the motorcycles from all round that stand in
// for those across its hall (tools/vehicles/bike_impostors.mjs) go up with the market's photographs, below.
put('powerbike.glb', readFileSync(resolve(root, 'assets/buildings/powerbike/skyscraper.glb')));
// The owner's twelve motorcycles (13 October 2026): their parts as the game draws them (tools/vehicles/bikes.py
// sorted the triangles of each supplied file into body, fork and wheels, every one kept) and their pictures, at
// 2048 for phones and 4096 elsewhere; and the market's photographs of each. A player's device fetches a motorcycle's
// files only to ride it or look at it. The supplied files themselves are in assets/vehicles/bikes/ and are not sent.
for (const name of readdirSync(resolve(root, 'assets/vehicles/bikes/game')).sort()) put(`bikes/${name}`, readFileSync(resolve(root, 'assets/vehicles/bikes/game', name)));
// the owner's engine recordings (16 October 2026), cut into the loops and the start and stop the game plays
// (tools/audio/bike_sounds.py; bike-audio.js, BIKE_RECORDINGS). The supplied files are in sound/original/ and are not sent.
for (const name of readdirSync(resolve(root, 'assets/vehicles/bikes/sound/game')).filter((n) => n.endsWith('.wav')).sort()) put(`bikes/sound-${name}`, readFileSync(resolve(root, 'assets/vehicles/bikes/sound/game', name)));
for (const name of readdirSync(resolve(root, 'assets/market')).filter((n) => /^bike-.*\.webp$/.test(n)).sort()) put(`assets/${name}`, readFileSync(resolve(root, 'assets/market', name)));
// The Post Civil War Car Showroom (17 October 2026): the owner's five buildings for its compound, exactly as supplied,
// beside the page, where render-carshow.js fetches each as someone comes near (the villa, 76 MB, only from close by);
// and the owner's twenty cars, their parts as the game draws them (tools/vehicles/cars.py sorted the triangles of
// each supplied file into body and wheels, every one kept) and their pictures at 2048 and 4096, with the market's
// photographs of each and the pictures from all round that stand in for those across the hall. The supplied car
// files themselves are in assets/vehicles/cars/ and are not sent.
for (const [name, from] of [['carshow-showroom.glb', 'tall_glass_skyscraper_3d_model.glb'], ['carshow-stacked.glb', 'modern_skyscraper_3d_model_4.glb'], ['carshow-twisting.glb', 'twisting_skyscraper_3d_model.glb'], ['carshow-deck.glb', 'architectural_3d_model_1.glb'], ['carshow-villa.glb', 'modern_villa_3d_model.glb']]) put(name, readFileSync(resolve(root, 'assets/buildings/carshow', from)));
for (const name of readdirSync(resolve(root, 'assets/vehicles/cars/game')).sort()) put(`cars/${name}`, readFileSync(resolve(root, 'assets/vehicles/cars/game', name)));
// The owner's ambulance, private jet and two trucks (17 October 2026), exactly as supplied, beside the page, where
// render-supplied.js fetches each: the parked ones as someone comes near them, the ambulance once the town is ready.
for (const v of Object.values(SUPPLIED_VEHICLES)) put(v.file, readFileSync(resolve(root, 'assets/vehicles/town', v.source)));
for (const name of readdirSync(resolve(root, 'assets/market')).filter((n) => /^car-.*\.webp$/.test(n)).sort()) put(`assets/${name}`, readFileSync(resolve(root, 'assets/market', name)));
// Songs for the phone's Music app: the list, and every file the list names (assets/music/README.md).
{
  const dir = resolve(root, 'assets/music');
  const library = readFileSync(resolve(dir, 'library.json'), 'utf8');
  const tracks = JSON.parse(library).tracks;
  if (!Array.isArray(tracks)) throw new Error('assets/music/library.json: "tracks" must be a list');
  put('music/library.json', library);
  for (const track of tracks) for (const key of ['file', 'cover']) {
    const name = track[key];
    if (!name) { if (key === 'file') throw new Error('assets/music/library.json: a track has no file'); continue; }
    if (typeof name !== 'string' || name.includes('/') || name.includes('\\') || name.startsWith('.')) throw new Error(`assets/music/library.json: ${name} is not a plain file name`);
    if (!existsSync(resolve(dir, name))) throw new Error(`assets/music/library.json names ${name}, which is not in assets/music/`);
    put(`music/${name}`, readFileSync(resolve(dir, name)));
  }
}
// The worker's table: every file it may keep, under the fingerprint of its contents. The page is not in it
// (it is always asked for afresh), nor are the two files nothing in the game ever reads.
// Which build this is: the fingerprint of the page itself, in a small file of its own. After the site has been
// put live, the live address is asked for this file and it is compared with the build that was tested, so that
// "it is live" is something checked and not something assumed.
put('version.json', `${JSON.stringify({ page: createHash('sha256').update(siteFiles.get('index.html')).digest('hex').slice(0, 16), bytes: siteFiles.get('index.html').length })}\n`);
const NOT_KEPT = new Set(['index.html', 'THREE-LICENSE.txt', 'share.png', 'assets/watch.glb', 'version.json']);
// songs are streamed, a piece at a time, and the list of them is always asked for afresh: neither is kept by the worker
const kept = (name) => !NOT_KEPT.has(name) && !name.startsWith('music/');
// (the two kits are needed to start at all, so they are kept as soon as the worker is: the game then opens with no connection)
const KEPT_FIRST = ['', 'three.min.js', 'kit.b64.txt', 'vehicles.b64.txt', 'moves.b64.txt', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png'];
// the figures: each is kept only when the page asks for it (the player's own figure), never just for being looked at
const ASKED = [...FIGURE_FILES.map(([name]) => `${name}.b64.txt`), ...SERVED_FIGURES];
const table = {};
for (const [name, bytes] of [...siteFiles].sort(([a], [b]) => (a < b ? -1 : 1))) if (kept(name)) table[name] = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
for (const name of KEPT_FIRST) if (name && !table[name]) throw new Error(`sw.js: ${name} is to be kept first but is not among the site's files`);
for (const name of ASKED) if (!table[name]) throw new Error(`sw.js: ${name} is to be kept when asked for but is not among the site's files`);
const worker = readFileSync(resolve(root, 'src/site/sw.js'), 'utf8').replace('/*@@FILES@@*/{}', JSON.stringify(table)).replace('/*@@FIRST@@*/[]', JSON.stringify(KEPT_FIRST)).replace('/*@@ASKED@@*/[]', JSON.stringify(ASKED));
if (worker.includes('@@')) throw new Error('sw.js: a placeholder was left unfilled');
put('sw.js', worker);
for (const [name, bytes] of siteFiles) { mkdirSync(dirname(resolve(siteDir, name)), { recursive: true }); writeFileSync(resolve(siteDir, name), bytes); }
console.log(`website: ${siteFiles.size} files, ${([...siteFiles.values()].reduce((n, b) => n + b.length, 0) / 1048576).toFixed(1)} MB; the page is ${(siteFiles.get('index.html').length / 1048576).toFixed(1)} MB`);

// --site: the repository's site/ folder is what the host serves, as it is. Make it this build, and nothing else.
if (process.argv.includes('--site')) {
  const served = resolve(root, '../site');
  mkdirSync(served, { recursive: true });
  // a file that is already there with the same contents is left alone (the model is 64 MB)
  const same = (a, b) => existsSync(b) && statSync(a).size === statSync(b).size && readFileSync(a).equals(readFileSync(b));
  const tops = new Set([...siteFiles.keys()].map((name) => name.split('/')[0]));
  for (const name of readdirSync(served)) if (!tops.has(name)) rmSync(resolve(served, name), { recursive: true, force: true });
  for (const top of tops) if (existsSync(resolve(served, top)) && statSync(resolve(served, top)).isDirectory()) for (const name of readdirSync(resolve(served, top))) if (!siteFiles.has(`${top}/${name}`)) rmSync(resolve(served, top, name), { recursive: true, force: true });
  for (const name of siteFiles.keys()) if (!same(resolve(siteDir, name), resolve(served, name))) { mkdirSync(dirname(resolve(served, name)), { recursive: true }); cpSync(resolve(siteDir, name), resolve(served, name)); }
  console.log(`site/ is now this build (${siteFiles.size} files)`);
}
