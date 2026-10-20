// The game's packs on the website (build.mjs takes them out of the page): the character kit and the vehicle kit, which
// the town is built from, and each figure's borrowed movements. Each is fetched when it is first wanted, not before
// (20 October 2026, the owner's brief: the opening fetched all three before PLAY could even appear): the kits once
// the player is choosing a character (quietly, behind the figure being looked at) or entering the town; a figure's
// movements with the figure. Each is fetched and unpacked on the page's worker (figure-worker.js).
//
// In a copy of the game that carries everything inside it (the copy on disk), there is nothing to fetch: every
// promise here is already kept.

const files = () => (typeof window !== 'undefined' && window.__PCW_PACK_FILES) || null;
const started = new Map();         // name -> promise of its bytes
const progress = new Map();        // name -> { got, of }: bytes come of it, and how many there are

// A kit's bytes (a Uint8Array), fetched once; null where the page carries the kit inside it.
export function loadPack(name) {
  const table = files();
  if (!table || !table[name]) return Promise.resolve(null);
  if (!started.has(name)) {
    const entry = table[name];
    const worker = typeof window !== 'undefined' && window.__PCW_WORKER;
    const url = new URL(entry.url, location.href).href;
    progress.set(name, { got: 0, of: entry.bytes || 0 });
    const job = worker
      ? worker.ask({ type: 'pack', url, gz: !!entry.gz, planes: entry.planes || 0, bytes: entry.bytes || 0 }, (got, of) => progress.set(name, { got, of: of || entry.bytes || 0 })).then((buf) => new Uint8Array(buf))
      : fetch(url).then((r) => { if (!r.ok) throw new Error(`${entry.url}: ${r.status}`); return r.arrayBuffer(); }).then((b) => unpackHere(new Uint8Array(b), entry));
    const done = job.then((bytes) => {
      progress.set(name, { got: entry.bytes || 1, of: entry.bytes || 1 });
      window.__PCW_PACK_BYTES = window.__PCW_PACK_BYTES || {};
      window.__PCW_PACK_BYTES[name] = bytes;
      return bytes;
    });
    // (a pack that did not come can be asked for again)
    done.catch(() => { if (started.get(name) === done) started.delete(name); });
    started.set(name, done);
  }
  return started.get(name);
}
// Has it come?
export const packHere = (name) => !files() || !files()[name] || !!(typeof window !== 'undefined' && window.__PCW_PACK_BYTES && window.__PCW_PACK_BYTES[name]);
// How much of a pack has come, for the loading line: { got, of } in bytes (both 0 where there is nothing to fetch).
export const packProgress = (name) => {
  if (packHere(name)) { const b = files() && files()[name] ? files()[name].bytes || 1 : 1; return { got: b, of: b }; }
  return progress.get(name) || { got: 0, of: files() && files()[name] ? files()[name].bytes || 0 : 0 };
};

// (without a worker: unzipped and put back together here, the slow way)
async function unpackHere(bytes, entry) {
  let out = bytes;
  if (entry.gz) {
    if (typeof DecompressionStream === 'function') out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    else throw new Error('this browser can neither run the game\'s worker nor unzip a file');
  }
  return entry.planes ? unplane(out, entry.planes) : out;
}
// A pack is stored with each byte of every two (or four) bytes together, which compresses better: put back in order.
export function unplane(bytes, k) {
  const n = bytes.length, out = new Uint8Array(n);
  let at = 0;
  for (let p = 0; p < k; p += 1) for (let i = p; i < n; i += k) out[i] = bytes[at++];
  return out;
}
