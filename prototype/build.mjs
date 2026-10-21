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
import { TOWN_MODELS } from './src/sim/zones/town-buildings.js';
import { HABITATION_STANDING } from './src/sim/zones/habitation-scene.js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIGURES } from './src/sim/figures.js';
import { MOVES_B64 } from './src/client/figure-borrowed.js';

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
// The page's worker (src/client/figure-worker.js), with what it uses put before it: one script, written into the
// page as text (template.html makes the worker from it), so that it works wherever the page does, from a disk too.
const workerSource = ['inflate.js', 'glb-read.js', 'figure-worker.js'].map((name) => {
  const source = readFileSync(resolve(root, 'src/client', name), 'utf8');
  if (/^import\s/m.test(source)) throw new Error(`${name}: the worker's source may import nothing`);
  return `// ---- ${name} ----\n${source.replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '')}`;
}).join('\n');
const workerText = JSON.stringify(`'use strict';\n${workerSource}`).replace(/<\/script/gi, '<\\/script');
// The page as it is filled in: `figures` is the table of each figure the game can fetch (window.__PCW_FIGURES; on
// the website its light copy, below; elsewhere none: there the owner's files are read as they are, animated.js).
const templateSource = readFileSync(resolve(root, 'src/client/template.html'), 'utf8').replace('@@PCW_FONT@@', font).replaceAll('@@PCW_MARK@@', mark).replace('@@PCW_WORKER@@', workerText);
const templateFor = (figures) => {
  const filled = templateSource.replace('@@PCW_FIGURE_FILES@@', JSON.stringify(figures));
  if (filled.includes('@@')) throw new Error('template.html: a placeholder was left unfilled');
  return filled;
};
const template = templateFor({ figures: {} });
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
function stripCommentLines(script) {
  let ts = null;
  const require = createRequire(import.meta.url);
  for (const at of ['typescript', '/opt/node22/lib/node_modules/typescript', '/usr/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript']) { try { ts = require(at); break; } catch (error) { /* not there */ } }
  if (!ts) { console.log('game.js: TypeScript is not on this machine, so the comments are left in'); return script; }
  const source = ts.createSourceFile('game.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let unsafe = 0;
  const visit = (node) => { if ((ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && /\n\s*\/\//.test(node.getText(source))) unsafe += 1; node.forEachChild(visit); };
  visit(source);
  if (unsafe) { console.log(`game.js: ${unsafe} piece(s) of text hold a line beginning //, so the comments are left in`); return script; }
  return script.split('\n').filter((line) => !/^\s*\/\/.*$/.test(line)).join('\n');
}
// A file's fingerprint: the first 16 hexadecimal digits of the SHA-256 of its bytes. The page asks for a file by it
// (`?v=`), and the worker that keeps the files on a device keeps each under it (sw.js).
const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

// ---- the figures, as their light copies (20 October 2026, the owner's brief) ----
// Each figure the website sends is the light copy tools/characters/light.py made from the owner's file: the owner's
// files in assets/characters/figures/animated/ are never sent, and never changed. A copy that is missing, or that was
// made from a file that has changed since (its MD5 in made.json is not the file's), is made again here (it needs
// Python with numpy and Pillow); the copies are kept in the repository, so a build normally makes none.
const LIGHT = resolve(root, 'assets/characters/figures/light');
const lightTool = /^TOOL = '([^']+)'/m.exec(readFileSync(resolve(root, 'tools/characters/light.py'), 'utf8'))[1];
const lightMade = () => (existsSync(resolve(LIGHT, 'made.json')) ? JSON.parse(readFileSync(resolve(LIGHT, 'made.json'), 'utf8')) : { figures: {} });
const originalMd5 = new Map(Object.values(FIGURES).map((f) => [f.file, createHash('md5').update(readFileSync(resolve(root, 'assets/characters/figures/animated', f.file))).digest('hex')]));
const staleLight = (made) => Object.values(FIGURES).filter((f) => { const e = made.figures[f.file]; return !e || e.tool !== lightTool || e.md5 !== originalMd5.get(f.file) || Object.keys(e.files).some((n) => !existsSync(resolve(LIGHT, n))); });
let made = lightMade();
if (staleLight(made).length) {
  const files = staleLight(made).map((f) => f.file);
  console.log(`making the light copies of ${files.join(', ')} (tools/characters/light.py)`);
  const run = spawnSync('python3', [resolve(root, 'tools/characters/light.py'), ...files], { stdio: 'inherit' });
  made = lightMade();
  if (run.status !== 0 || staleLight(made).length) throw new Error(`the light copies of ${staleLight(made).map((f) => f.file).join(', ')} could not be made: run python3 tools/characters/light.py (it needs numpy and Pillow)`);
}
// what each light copy is made of, from the copy itself: its model, and its pictures in the order its images list them
const glbJson = (glb) => { const length = glb.readUInt32LE(12); return JSON.parse(glb.subarray(20, 20 + length).toString('utf8')); };
const MOVES = JSON.parse(Buffer.from(MOVES_B64, 'base64').toString('utf8'));
const lightFiles = new Map();              // site path -> bytes
const turns = existsSync(resolve(LIGHT, 'turns.json')) ? JSON.parse(readFileSync(resolve(LIGHT, 'turns.json'), 'utf8')) : { figures: {} };
const staleTurns = [];
const lightTable = {};                     // id -> what the page fetches for it (window.__PCW_FIGURES)
for (const f of Object.values(FIGURES)) {
  const entry = made.figures[f.file];
  const stem = f.file.replace(/\.glb$/, '');
  const bytesOf = (name) => readFileSync(resolve(LIGHT, name));
  for (const name of Object.keys(entry.files)) lightFiles.set(`figures/${name}`, bytesOf(name));
  const at = (name) => [`figures/${name}?v=${fingerprint(lightFiles.get(`figures/${name}`))}`, lightFiles.get(`figures/${name}`).length];
  const json = glbJson(gunzipSync(bytesOf(`${stem}.glb.gz`)));
  const pictures = json.images.map((img, index) => {
    const names = [img.uri, ...Object.values((img.extras && img.extras.larger) || {})];
    return { index, slot: img.name, sizes: Object.fromEntries(names.map((name) => [Number(/\.[cnm](\d+)\.webp$/.exec(name)[1]), at(name)])) };
  });
  // the movements it borrows and how it sits (src/client/figure-moves.js), beside it: fetched with it
  const moves = Buffer.from(JSON.stringify({ borrowed: MOVES.borrowed[f.file] || {}, seat: MOVES.seats[f.file] || null }));
  lightFiles.set(`figures/${stem}.moves.json`, moves);
  // its turntable (tools/characters/previews.mjs), made from this very copy
  const turn = turns.figures[f.file];
  const sha = createHash('sha256').update(bytesOf(`${stem}.glb.gz`)).digest('hex').slice(0, 16);
  if (!turn || turn.madeFrom !== sha || !existsSync(resolve(LIGHT, `${stem}.turn.webp`))) staleTurns.push(f.id);
  else lightFiles.set(`figures/${stem}.turn.webp`, bytesOf(`${stem}.turn.webp`));
  const [model, bytes] = at(`${stem}.glb.gz`);
  lightTable[f.id] = { file: f.file, model, bytes, pictures, moves: at(`${stem}.moves.json`), ...(lightFiles.has(`figures/${stem}.turn.webp`) ? { turn: at(`${stem}.turn.webp`) } : {}) };
}
// a figure whose turntable is missing or was made from an older copy: made again (it needs Playwright), and the build
// is begun again so that it carries it
if (staleTurns.length) {
  console.log(`making the turntables of ${staleTurns.join(', ')} (tools/characters/previews.mjs)`);
  const run = spawnSync('node', [resolve(root, 'tools/characters/previews.mjs'), 'turn', ...staleTurns], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`the turntables of ${staleTurns.join(', ')} could not be made: run node tools/characters/previews.mjs turn ${staleTurns.join(' ')}`);
  const again = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit' });
  process.exit(again.status);
}

// ---- the owner's buildings, the town's vehicles and the market's watch, as lighter copies (20 October 2026, the
// owner's brief: "No 8K picture is ever sent to any device") ----
// Each of these files is almost all one picture of 8192 pixels square, which the game never draws larger than 2048 on
// a computer or 1024 on a phone (budget.js). The website sends copies tools/models/lighter.py makes from the owner's
// files: under each file's own name, its pictures made no larger than a computer draws them; beside it (.lite.glb),
// no larger than a phone draws them, which a phone fetches instead (window.__PCW_MODELS; budget.js, modelFile). Nothing
// but the pictures differs, byte for byte. The owner's files are never sent, and never changed. The copies are kept in
// the repository (assets/models-light/), and made again only from a file that has changed (they need Python and Pillow).
const MODELS_LIGHT = resolve(root, 'assets/models-light');
const lighterTool = /^TOOL = '([^']+)'/m.exec(readFileSync(resolve(root, 'tools/models/lighter.py'), 'utf8'))[1];
// [the name on the website, the owner's file, the most across for a computer's copy (0: his file as it is), for a phone's]
const SUPPLIED_MODELS = [
  ['powerbike.glb', 'assets/buildings/powerbike/skyscraper.glb', 2048, 1024],
  ...[['carshow-showroom.glb', 'tall_glass_skyscraper_3d_model.glb'], ['carshow-stacked.glb', 'modern_skyscraper_3d_model_4.glb'], ['carshow-twisting.glb', 'twisting_skyscraper_3d_model.glb'], ['carshow-deck.glb', 'architectural_3d_model_1.glb'], ['carshow-villa.glb', 'modern_villa_3d_model.glb']].map(([name, from]) => [name, `assets/buildings/carshow/${from}`, 2048, 1024]),
  ...Object.values(SUPPLIED_VEHICLES).map((v) => [v.file, `assets/vehicles/town/${v.source}`, 2048, 1024]),
  ...Object.values(TOWN_MODELS).map((m) => [m.file, `assets/buildings/town/${m.source}`, 2048, 1024]),
  // (the watch is looked at close to, on its own: at 4096 on a computer, as supplied, and at 2048 on a phone: budget.js, inspect)
  ['assets/watch.glb', 'assets/market/watch.glb', 0, 2048],
];
const modelsMade = () => (existsSync(resolve(MODELS_LIGHT, 'made.json')) ? JSON.parse(readFileSync(resolve(MODELS_LIGHT, 'made.json'), 'utf8')) : { copies: {} });
const copyName = (site, most) => `${site.replace(/\//g, '__').replace(/\.glb$/, '')}.${most}.glb`;
const modelJobs = [];
for (const [site, from, full, lite] of SUPPLIED_MODELS) {
  const md5 = createHash('md5').update(readFileSync(resolve(root, from))).digest('hex');
  for (const most of [full, lite].filter(Boolean)) modelJobs.push({ site, from, most, md5, out: copyName(site, most) });
}
const staleModel = (made, job) => { const e = made.copies[job.out]; return !e || e.tool !== lighterTool || e.md5 !== job.md5 || e.most !== job.most || !existsSync(resolve(MODELS_LIGHT, job.out)) || e.sha256 !== createHash('sha256').update(readFileSync(resolve(MODELS_LIGHT, job.out))).digest('hex'); };
{
  let made = modelsMade();
  const stale = modelJobs.filter((job) => staleModel(made, job));
  if (stale.length) {
    mkdirSync(MODELS_LIGHT, { recursive: true });
    console.log(`making the lighter copies of ${stale.map((j) => j.out).join(', ')} (tools/models/lighter.py)`);
    const jobsFile = resolve(MODELS_LIGHT, '.jobs.json');
    writeFileSync(jobsFile, JSON.stringify(stale.map((j) => ({ source: resolve(root, j.from), out: resolve(MODELS_LIGHT, j.out), most: j.most }))));
    const run = spawnSync('python3', ['-I', resolve(root, 'tools/models/lighter.py'), jobsFile], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1048576 });
    rmSync(jobsFile, { force: true });
    if (run.status !== 0) throw new Error('the lighter copies could not be made: run python3 tools/models/lighter.py (it needs Pillow)');
    const lines = run.stdout.toString('utf8').trim().split('\n');
    for (const line of lines.slice(0, -1)) console.log(`  ${line.replace(MODELS_LIGHT + '/', '')}`);
    const report = JSON.parse(lines[lines.length - 1]);
    for (const job of stale) {
      const bytes = readFileSync(resolve(MODELS_LIGHT, job.out));
      const one = report.made.find((m) => m.out === resolve(MODELS_LIGHT, job.out));
      made.copies[job.out] = { tool: report.tool, from: job.from, md5: job.md5, most: job.most, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), pictures: one ? one.pictures : [] };
    }
    made.copies = Object.fromEntries(Object.entries(made.copies).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(resolve(MODELS_LIGHT, 'made.json'), `${JSON.stringify(made, null, 1)}\n`);
    made = modelsMade();
    const still = modelJobs.filter((job) => staleModel(made, job));
    if (still.length) throw new Error(`the lighter copies of ${still.map((j) => j.out).join(', ')} were not made`);
  }
}
const modelFiles = new Map();              // site path -> bytes: each model as the website sends it
const modelsTable = {};                    // the owner's file's name on the website -> its phone's copy (window.__PCW_MODELS)
for (const [site, from, full, lite] of SUPPLIED_MODELS) {
  modelFiles.set(site, full ? readFileSync(resolve(MODELS_LIGHT, copyName(site, full))) : readFileSync(resolve(root, from)));
  const liteName = site.replace(/\.glb$/, '.lite.glb');
  modelFiles.set(liteName, readFileSync(resolve(MODELS_LIGHT, copyName(site, lite))));
  modelsTable[site] = liteName;
}

const gameBody = templateFor({ turn: { frames: turns.frames, cols: turns.cols, frame: turns.frame, band: turns.band }, figures: lightTable }).replace(/^<title>[^<]*<\/title>\n/, '');      // the document's head carries the title
// The character kit and the vehicle kit are two-thirds of the game's script: numbers, written as text. On the
// website they are files of their own beside the page, as numbers (not base64 text), each byte of every two kept
// together (which compresses better) and gzip'd, and fetched only when they are wanted (packs.js): the town is built
// from them, and nothing before it needs them. The borrowed movements are written beside each figure instead (above).
let siteBundle = bundle;
const packFiles = {};
const planes = (bytes, k) => { const out = Buffer.alloc(bytes.length); let at = 0; for (let p = 0; p < k; p += 1) for (let i = p; i < bytes.length; i += k) out[at++] = bytes[i]; return out; };
for (const [name, constant] of [['kit', 'KIT_B64'], ['vehicles', 'VEHICLE_B64'], ['moves', 'MOVES_B64']]) {
  const found = new RegExp(`const ${constant} = '([A-Za-z0-9+/=]+)';`).exec(siteBundle);
  if (!found) throw new Error(`the bundle has no ${constant} to take out`);
  if (siteBundle.indexOf(`const ${constant} = '`, found.index + 1) !== -1) throw new Error(`the bundle has ${constant} twice`);
  siteBundle = siteBundle.slice(0, found.index) + `const ${constant} = '';` + siteBundle.slice(found.index + found[0].length);
  if (name === 'moves') continue;
  const packed = gzipSync(planes(Buffer.from(found[1], 'base64'), 2), { level: 9 });
  put(`${name}.bin.gz`, packed);
  packFiles[name] = { url: `${name}.bin.gz?v=${fingerprint(packed)}`, gz: true, planes: 2, bytes: packed.length };
}
for (const [name, bytes] of lightFiles) put(name, bytes);
// The cover's four pictures (brand-data.js carries them in the page as data): on the website, files of their own
// beside the page, fetched as soon as the page starts arriving (preloaded, below) beside the game's script, and kept.
const coverFound = /const COVER = (\{.*\});\n/.exec(siteBundle);
if (!coverFound) throw new Error('the bundle has no COVER to take the pictures out of');
const cover = JSON.parse(coverFound[1]);
const coverFiles = [];
const coverFile = (dataUrl, name) => {
  const m = /^data:image\/(jpeg|webp|png);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error(`the cover's ${name} is not a picture written as data`);
  const bytes = Buffer.from(m[2], 'base64');
  const path = `cover/${name}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  put(path, bytes);
  coverFiles.push(`${path}?v=${fingerprint(bytes)}`);
  return coverFiles[coverFiles.length - 1];
};
cover.plate = coverFile(cover.plate, 'plate');
for (const piece of ['logo', 'words', 'play']) cover[piece].src = coverFile(cover[piece].src, piece);
siteBundle = siteBundle.replace(coverFound[0], `const COVER = ${JSON.stringify(cover)};\n`);
// The townspeople's reactions (reaction-data.js, 0.7 MB of it): needed only in town, so fetched with the town
// (main.js, prepareTown), not carried in the game's script.
const reactionsFound = /const REACTIONS = (\{.*\});\n/.exec(siteBundle);
if (!reactionsFound) throw new Error('the bundle has no REACTIONS to take out');
JSON.parse(reactionsFound[1]);
put('reactions.json', reactionsFound[1]);
siteBundle = siteBundle.replace(reactionsFound[0], 'const REACTIONS = {};\n');
const extras = { reactions: `reactions.json?v=${fingerprint(siteFiles.get('reactions.json'))}` };
const packScript = `<script>window.__PCW_PACK_FILES = ${JSON.stringify(packFiles)}; window.__PCW_FILES = ${JSON.stringify(extras)}; window.__PCW_MODELS = ${JSON.stringify(modelsTable)};</script>\n${coverFiles.map((f) => `<link rel="preload" as="image" href="${f}" fetchpriority="low">`).join('\n')}\n`;
// the game's own script, a file of its own beside the page, read once the page has been (defer): the page itself
// is then small, and the opening is on the screen before the script has even arrived. It goes without the source's
// comments (whole lines of them: a fifth less to fetch), where it is certain that no line taken out is inside a piece
// of text written over several lines (checked with TypeScript's own reader of JavaScript, where this machine has it;
// without it the script goes as it is). Either way it is read here first, so that a script that would not even start
// is never written out.
siteBundle = stripCommentLines(siteBundle);
for (const [name, script] of [['the page\'s script', bundle], ['game.js', siteBundle]]) { try { new Function(script); } catch (error) { throw new Error(`${name} does not read: ${error.message}`); } }
const three = readFileSync(resolve(root, 'vendor/three.min.js'));
put('three.min.js', three);
put('game.js', siteBundle);
// (each moves the line under the name on the splash as it comes: template.html, __pcwStage)
put('index.html', `<!doctype html>\n<html lang="en">\n<head>\n${head}${packScript}</head>\n<body>\n${gameBody}\n<script defer src="three.min.js?v=${fingerprint(three)}" fetchpriority="high" onload="window.__pcwStage && __pcwStage(0.35)"></script>\n<script defer src="game.js?v=${fingerprint(Buffer.from(siteBundle))}" fetchpriority="high"></script>\n</body>\n</html>\n`);
put('THREE-LICENSE.txt', readFileSync(resolve(root, 'vendor/THREE-LICENSE.txt')));
const manifest = readFileSync(resolve(root, 'src/site/manifest.webmanifest'), 'utf8');
JSON.parse(manifest);
put('manifest.webmanifest', manifest);
for (const name of readdirSync(resolve(root, 'assets/brand/icons')).sort()) put(name, readFileSync(resolve(root, 'assets/brand/icons', name)));
for (const icon of JSON.parse(manifest).icons) if (!siteFiles.has(icon.src)) throw new Error(`manifest.webmanifest: no file ${icon.src}`);
// Things that can be owned (asset-view.js): the owner's model (as supplied for a computer, 64 MB, and a copy with its
// pictures at 2048 for a phone: the lighter copies, above), fetched only when a player asks to see it, and the
// photographs taken of it.
for (const [name, from] of [['assets/watch-turn.webp', 'assets/market/watch-turn.webp'], ['assets/watch-poster.webp', 'assets/market/watch-poster.webp']]) put(name, readFileSync(resolve(root, from)));
// PostCivilWar PowerBike (16 October 2026): the owner's skyscraper (its lighter copies, above), beside the page, where
// render-powerbike.js fetches it once the town is ready. The pictures of the motorcycles from all round that stand in
// for those across its hall (tools/vehicles/bike_impostors.mjs) go up with the market's photographs, below.
// The owner's twelve motorcycles (13 October 2026): their parts as the game draws them (tools/vehicles/bikes.py
// sorted the triangles of each supplied file into body, fork and wheels, every one kept) and their pictures, at
// 2048 for phones and 4096 elsewhere; and the market's photographs of each. A player's device fetches a motorcycle's
// files only to ride it or look at it. The supplied files themselves are in assets/vehicles/bikes/ and are not sent.
for (const name of readdirSync(resolve(root, 'assets/vehicles/bikes/game')).sort()) put(`bikes/${name}`, readFileSync(resolve(root, 'assets/vehicles/bikes/game', name)));
// the owner's engine recordings (16 October 2026), cut into the loops and the start and stop the game plays
// (tools/audio/bike_sounds.py; bike-audio.js, BIKE_RECORDINGS). The supplied files are in sound/original/ and are not sent.
for (const name of readdirSync(resolve(root, 'assets/vehicles/bikes/sound/game')).filter((n) => n.endsWith('.wav')).sort()) put(`bikes/sound-${name}`, readFileSync(resolve(root, 'assets/vehicles/bikes/sound/game', name)));
for (const name of readdirSync(resolve(root, 'assets/market')).filter((n) => /^bike-.*\.webp$/.test(n)).sort()) put(`assets/${name}`, readFileSync(resolve(root, 'assets/market', name)));
// The Post Civil War Car Showroom (17 October 2026): the owner's five buildings for its compound (their lighter copies,
// above), beside the page, where render-carshow.js fetches each as someone comes near (the villa only from close by);
// and the owner's twenty cars, their parts as the game draws them (tools/vehicles/cars.py sorted the triangles of
// each supplied file into body and wheels, every one kept) and their pictures at 2048 and 4096, with the market's
// photographs of each and the pictures from all round that stand in for those across the hall. The supplied car
// files themselves are in assets/vehicles/cars/ and are not sent.
for (const name of readdirSync(resolve(root, 'assets/vehicles/cars/game')).sort()) put(`cars/${name}`, readFileSync(resolve(root, 'assets/vehicles/cars/game', name)));
// The owner's ambulance, private jet and two trucks (17 October 2026), beside the page, where render-supplied.js
// fetches each: the parked ones as someone comes near them, the ambulance once the town is ready; and his houses and
// towers in town (17 October 2026), where render-town-buildings.js fetches each model as the first building drawn from
// it comes within sight. These, the car showroom's buildings, PowerBike's tower and the watch: their lighter copies.
for (const [name, bytes] of modelFiles) put(name, bytes);
// The habitation at the far end of the River Niger (20 October 2026): the owner's 49 models made real by
// tools/habitation/dress.py (each made from his own file, which stays in assets/habitation/ exactly as he sent it), a
// computer's copy and a phone's (.lite.glb), and the leaves' pictures they share, beside the page, where
// render-habitation.js fetches them as the player comes up the road to it. Made again by tools/habitation/dress-all.py
// (it needs Python, numpy and Pillow); made.json says from which file each was made, and a copy whose file has changed
// since is not sent.
{
  const dressed = resolve(root, 'assets/habitation-dressed');
  const made = JSON.parse(readFileSync(resolve(dressed, 'made.json'), 'utf8'));
  for (const [name, copy] of Object.entries(made.copies)) {
    const md5 = createHash('md5').update(readFileSync(resolve(root, 'assets/habitation', copy.source))).digest('hex');
    if (md5 !== copy.md5) throw new Error(`assets/habitation-dressed/${name}.glb was made from another ${copy.source}: run python3 tools/habitation/dress-all.py`);
    if (!existsSync(resolve(dressed, `${name}.glb`))) throw new Error(`assets/habitation-dressed/${name}.glb is missing: run python3 tools/habitation/dress-all.py`);
  }
  // (and the wood of the boardwalks and bridges, cut from his boardwalk model's own picture: tools/habitation/deck-wood.py)
  for (const [name, copy] of Object.entries(made.decks || {})) {
    const md5 = createHash('md5').update(readFileSync(resolve(root, 'assets/habitation', copy.source))).digest('hex');
    if (md5 !== copy.md5) throw new Error(`assets/habitation-dressed/${name}.webp was made from another ${copy.source}: run python3 tools/habitation/deck-wood.py`);
    if (!existsSync(resolve(dressed, `${name}.webp`))) throw new Error(`assets/habitation-dressed/${name}.webp is missing: run python3 tools/habitation/deck-wood.py`);
  }
  // (only the models the habitation places: a rock made but not put anywhere is not sent; every shared picture is)
  const placed = new Set(HABITATION_STANDING.map((p) => p.m));
  const wanted = (n) => n.endsWith('.webp') || placed.has(n.replace(/\.(full|lite)\.glb$/, ''));
  for (const name of readdirSync(dressed).filter((n) => /\.(glb|webp)$/.test(n) && wanted(n)).sort()) put(`habitation/${name}`, readFileSync(resolve(dressed, name)));
  for (const m of placed) for (const v of ['full', 'lite']) if (!existsSync(resolve(dressed, `${m}.${v}.glb`))) throw new Error(`assets/habitation-dressed/${m}.${v}.glb is missing (the habitation places ${m})`);
}
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
const NOT_KEPT = new Set(['index.html', 'THREE-LICENSE.txt', 'share.png', 'assets/watch.glb', 'assets/watch.lite.glb', 'version.json']);
// songs are streamed, a piece at a time, and the list of them is always asked for afresh: neither is kept by the worker
const kept = (name) => !NOT_KEPT.has(name) && !name.startsWith('music/');
// What the worker keeps as soon as it is installed: the page, the 3D library, the game's script, the cover's pictures and
// the small files. The rest it keeps as the page fetches them: the two kits (fetched on the character screen), the
// townspeople's reactions (with the town), the owner's buildings as they come into sight.
// (the cover's pictures too: the page has them before its worker is there to keep them, and they are not asked for
// again, so the worker keeps them as it is installed, from the browser's cache, as the page asked for them)
const KEPT_FIRST = ['', 'three.min.js', 'game.js', ...coverFiles.map((f) => f.split('?')[0]), 'manifest.webmanifest', 'favicon.svg', 'icon-192.png'];
// the figures: each is kept only when the page asks for it (the player's own figure), never just for being looked at
const ASKED = [...lightFiles.keys()];
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
