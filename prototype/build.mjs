// Bundles the prototype into one self-contained HTML page.
//
//   node build.mjs
//
// Writes dist/index.html (loads three.js from cdnjs; this is the published
// page) and dist/local.html (loads the vendored copy; works offline).
// There are no build dependencies. Source files are ES modules that use only
// single-line named imports, `export function|const|class` and
// `export * from`, so a module
// can be turned into a function that returns its exports.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const template = readFileSync(resolve(root, 'src/client/template.html'), 'utf8').replace('@@PCW_FONT@@', font).replaceAll('@@PCW_MARK@@', mark);
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
const FIGURE_FILES = [['man', 'muscular_male.glb', '__PCW_MAN_B64'], ['woman', 'woman.glb', '__PCW_WOMAN_B64']];
let inline = '';
for (const [name, file, global] of FIGURE_FILES) {
  const bytes = readFileSync(resolve(root, `assets/characters/figures/animated/${file}`));
  writeFileSync(resolve(root, `dist/${name}.glb`), bytes);
  writeFileSync(resolve(root, `dist/${name}.b64.txt`), bytes.toString('base64'));
  inline += `<script>window.${global} = "${bytes.toString('base64')}";</script>\n`;
}
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
