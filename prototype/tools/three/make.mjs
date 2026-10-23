// The game's 3D library, vendor/three.min.js, made from three.js's own ES modules (vendor/three-r186/, as the
// three.js authors publish them, unchanged): one script that gives `THREE` to a page, as three.min.js always has, and
// to Node's `require` (the headless tests), holding only what the game, its pages and its tests use. The rest of the
// library is left out by the bundler (esbuild): r186 whole would be 743 KB, this about 630 KB, r128 was 603.
//
//   node tools/three/make.mjs [esbuild]          (esbuild: its path; by default the one on this machine)
//
// The names used are found by reading every `THREE.Name` in src/, test/ and tools/ (and the few below, used by name only in
// the library's own setup); a name the library does not have stops it. vendor/three.symbols.json lists what the
// script holds, and build.mjs refuses to build a game that uses a name the script does not hold (run this again).
//
// The colours. Since r152 three.js reads a colour written in a script (0xRRGGBB, '#rrggbb') as sRGB and turns it into
// linear light before lighting it; until then it took the numbers as they were. Every colour in the game was chosen
// and judged on the screen the old way, so the script turns that conversion off (ColorManagement.enabled = false):
// a colour means what it meant. Pictures are still read as sRGB where they are marked so (colorSpace), and what is
// drawn is still written out as sRGB (renderer.outputColorSpace): both as before.
//
// The light a surface gives back. Since r155 three.js takes the share of the light that a surface's gloss reflects out of
// the light it scatters (its colour: by the gloss's reflectance at that angle in sunlight, and by its whole reflectance
// under the sky's light all round), and adds a little to the gloss of a rough metal; every surface of the game would
// be a few per cent darker than it was chosen to be (measured: the town's ground and walls 1.5% in the picture). The
// script lights them as r128 did: three lines of three.js's lights_physical_pars_fragment (LIGHTS_AS_R128, as-r128.mjs),
// and the script stops with an error if a later three.js no longer has them as they are written there.
//
// See-through things seen from both sides. Since r151 three.js draws each of them twice, its far side and then its
// near side (Material.forceSinglePass false); r128 drew them once. Every one in the game (glass, a waterfall's sheet,
// the chain-link fence, a torch's beam...) is drawn once, as before, so that none costs twice what it did: the script
// makes forceSinglePass true for every material.
//
// Two more things r186 does differently from r128, both seen in the before-and-after pictures (23 October 2026), put
// back as r128 had them by changing the renderer's own code as it is bundled (RENDERER_AS_R128, as-r128.mjs; the script stops
// if a later three.js no longer has it as written here):
//  - the order see-through things are drawn in. r186 orders them by the middle of each one's shape; r128 ordered them
//    by where each stands (its origin). The town's glass, fences and water are drawn in large pieces made in the town's
//    own place, whose origins are all the same, and were drawn in the order they were made: at the airport the
//    chain-link fence outside the terminal was drawn over its glass, and seen plainly through it; ordered by their
//    middles, the glass was drawn over the fence and the fence was barely seen.
//  - a solid surface's alpha. r186 writes 1 for every surface that is not see-through (its OPAQUE define); r128 wrote
//    what the surface's picture had there (the habitation's pictures of its far trees, taken of each tree as it
//    arrives, keep their leaves' edges so). And with the define gone, a surface no longer needs a program of its own for
//    being solid: as many programs to compile as r128 had, not a dozen or more more (a slower start).
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { LIGHTS_AS_R128, RENDERER_AS_R128, timesIn } from './as-r128.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lib = resolve(root, 'vendor/three-r186');
const esbuild = process.argv[2] || ['/opt/npm-tools/node_modules/.bin/esbuild', 'esbuild'].find((p) => p === 'esbuild' || existsSync(p));
const EXTRA = ['REVISION', 'ColorManagement', 'SRGBColorSpace', 'LinearSRGBColorSpace', 'NoColorSpace', 'ShaderChunk', 'Material'];

const files = (dir) => readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? files(p) : [p]; });
const used = new Set(EXTRA);
// (the game, its tests, and the tools that draw with the game's own code: the turntables, the vehicles' pictures...)
for (const file of [...files(resolve(root, 'src')), ...files(resolve(root, 'test')), ...files(resolve(root, 'tools')).filter((f) => !f.startsWith(resolve(root, 'tools/three')))].filter((f) => /\.(m?js|html)$/.test(f))) {
  for (const m of readFileSync(file, 'utf8').matchAll(/\bTHREE\.([A-Za-z_][\w$]*)/g)) used.add(m[1]);
}
// (what three.module.js gives: its own names, and those it passes on from three.core.js)
const module = readFileSync(resolve(lib, 'three.module.js'), 'utf8');
const exportLists = [...module.matchAll(/^export\s*\{([^}]+)\}/gm)];
if (!exportLists.length) throw new Error('three.module.js: its export lists were not found');
const exported = new Set(exportLists.flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())).filter(Boolean));
const missing = [...used].filter((n) => !exported.has(n)).sort();
if (missing.length) throw new Error(`three.js r186 has none of: ${missing.join(', ')} (used in src/, test/ or tools/)`);
const names = [...used].sort();
const revision = /const REVISION = '(\d+)'/.exec(readFileSync(resolve(lib, 'three.core.js'), 'utf8'))[1];

// The renderer's own code, as r128 had it in two places (see above, and as-r128.mjs): each found exactly once, or the
// script stops.
const work = mkdtempSync(join(tmpdir(), 'pcw-three-'));
let renderer = readFileSync(resolve(lib, 'three.module.js'), 'utf8');
for (const [was, now] of RENDERER_AS_R128) {
  if (timesIn(renderer, was) !== 1) { rmSync(work, { recursive: true, force: true }); throw new Error(`three.js r${revision}: three.module.js no longer has, once, ${was}`); }
  renderer = renderer.replace(was, now);
}
// (the changed copy bundled from the work folder, beside an unchanged copy of three.core.js, which it imports)
writeFileSync(join(work, 'three.module.js'), renderer);
copyFileSync(resolve(lib, 'three.core.js'), join(work, 'three.core.js'));
const entry = join(work, 'entry.js');
writeFileSync(entry, `export { ${names.join(', ')} } from ${JSON.stringify(join(work, 'three.module.js'))};\n`);
const out = join(work, 'three.min.js');
const core = readFileSync(resolve(lib, 'three.module.js'), 'utf8');
for (const [was] of LIGHTS_AS_R128) if (timesIn(core, was) !== 1) throw new Error(`three.js r${revision}: lights_physical_pars_fragment no longer has "${was}" once`);
const asR128 = `(function(){var c=THREE.ShaderChunk,k="lights_physical_pars_fragment",s=c[k],a=${JSON.stringify(LIGHTS_AS_R128)};for(var i=0;i<a.length;i++){if(s.split(a[i][0]).length!==2)throw new Error("three.js: "+k+" is not as tools/three/make.mjs expects");s=s.split(a[i][0]).join(a[i][1]);}c[k]=s;})();`;
const banner = `/* three.js r${revision} (https://threejs.org), only what PostCivilWar uses; as r128 drew: colours, lights, single pass, order, alpha (tools/three/make.mjs). Copyright 2010-2026 three.js authors. SPDX-License-Identifier: MIT (THREE-LICENSE.txt) */`;
const footer = 'THREE.ColorManagement.enabled=false;' + asR128 + 'Object.defineProperty(THREE.Material.prototype,"forceSinglePass",{get(){return true},set(){},configurable:true});if(typeof module!=="undefined"&&module.exports)module.exports=THREE;';
const run = spawnSync(esbuild, [entry, '--bundle', '--format=iife', '--global-name=THREE', '--minify', '--legal-comments=none', `--banner:js=${banner}`, `--footer:js=${footer}`, `--outfile=${out}`, '--log-level=warning'], { encoding: 'utf8' });
if (run.status !== 0) { rmSync(work, { recursive: true, force: true }); throw new Error(`esbuild: ${run.stderr || run.error}`); }
const script = readFileSync(out);
rmSync(work, { recursive: true, force: true });
writeFileSync(resolve(root, 'vendor/three.min.js'), script);
writeFileSync(resolve(root, 'vendor/three.symbols.json'), `${JSON.stringify({ revision, names }, null, 1)}\n`);
writeFileSync(resolve(root, 'vendor/THREE-LICENSE.txt'), readFileSync(resolve(lib, 'LICENSE')));
console.log(`vendor/three.min.js: three.js r${revision}, ${names.length} names, ${(script.length / 1024).toFixed(0)} KB`);
