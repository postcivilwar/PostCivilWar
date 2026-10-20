// The page's worker (made by the page's first script, template.html): what is fetched and unpacked away from the
// page's own thread, so that the screen keeps moving while it is done.
//
//   pack      one of the game's packs (the character kit, the vehicle kit, the borrowed movements): its bytes, from
//             base64 text or from a file of its own, unzipped if it is gzip'd
//   figure    a figure's light copy (tools/characters/light.py): the model fetched, unzipped and read into arrays of
//             its own (glb-read.js), and its pictures fetched and decoded, all handed to the page in one message;
//             the bytes as they arrive are told (`progress`), for the loading line
//   cancel    a figure no longer wanted (the player has moved on): its fetching stops at once
//   warm      files fetched ahead of being wanted (the figures either side of the one looked at), quietly, one at a
//             time, and held here: a figure asked for whose files are on their way, or here, takes them as they are
//             (nothing is fetched twice); a file no longer wanted is stopped where it is
//
// The worker's source is put together from inflate.js, glb-read.js and this file by build.mjs (as one script, inlined
// into the page): nothing here may use anything outside them.

const jobs = new Map();                  // id -> AbortController
const ahead = new Map();                 // url -> { control, bytes: promise, got, told }: fetched (or being fetched) ahead
let wanted = [];                         // the files to fetch ahead, in order
let warming = false;

// A file's bytes, with how many have come so far told as they come: taken from what was fetched ahead if it is
// there or on its way, otherwise fetched.
async function bytesOf(url, signal, told) {
  const early = ahead.get(url);
  if (early) {
    ahead.delete(url);
    if (told) { early.told = told; if (early.got) told(early.got); }
    const stop = () => early.control.abort();
    if (signal) signal.addEventListener('abort', stop, { once: true });
    try { return await early.bytes; } finally { if (signal) signal.removeEventListener('abort', stop); }
  }
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  if (!told || !response.body || typeof response.body.getReader !== 'function') return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length; told(value.length);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// Unzipped: by the browser's own DecompressionStream where it has one, otherwise by inflate.js.
async function unzipped(bytes) {
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) { /* a browser whose stream could not: the plain way below */ }
  }
  return gunzip(bytes);
}

const fromBase64 = (text) => { const raw = atob(text.trim()); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i); return out; };

async function pack(d) {
  // (fetched again once, a moment later, if the first try failed; what has come told as it comes)
  let toldAt = 0;
  const told = (n) => { told.got = (told.got || 0) + n; const now = Date.now(); if (now - toldAt > 150) { toldAt = now; postMessage({ id: d.id, progress: told.got, of: d.bytes || 0 }); } };
  const get = () => { told.got = 0; return d.text ? Promise.resolve(fromBase64(d.text)) : d.b64 ? fetch(d.url, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(`${d.url}: ${r.status}`); return r.text().then(fromBase64); }) : bytesOf(d.url, undefined, told); };
  let bytes = await get().catch(() => new Promise((y) => setTimeout(y, 1500)).then(get));
  if (d.gz) bytes = await unzipped(bytes);
  if (d.planes) bytes = unplane(bytes, d.planes);
  if (bytes.byteOffset || bytes.byteLength !== bytes.buffer.byteLength) bytes = bytes.slice();
  postMessage({ id: d.id, buf: bytes.buffer }, [bytes.buffer]);
}
// (a pack is stored with each byte of every two together, which compresses better: put back in order, as packs.js does)
function unplane(bytes, k) {
  const n = bytes.length, out = new Uint8Array(n);
  let at = 0;
  for (let p = 0; p < k; p += 1) for (let i = p; i < n; i += k) out[i] = bytes[at++];
  return out;
}

async function figure(d) {
  // (whatever is being fetched ahead for something else stops: this comes first)
  const mine = new Set([d.model, ...d.pictures.map((p) => p.url)]);
  for (const [url, early] of ahead) if (!mine.has(url)) { early.control.abort(); ahead.delete(url); }
  wanted = wanted.filter((url) => mine.has(url));
  const control = new AbortController();
  jobs.set(d.id, control);
  let got = 0, toldAt = 0;
  const told = (n) => { got += n; const now = Date.now(); if (now - toldAt > 120) { toldAt = now; postMessage({ id: d.id, progress: got, of: d.bytes || 0 }); } };
  try {
    const model = bytesOf(d.model, control.signal, told);
    model.catch(() => {});
    // the pictures are fetched beside the model, and each is decoded as soon as it has come
    const pictures = Promise.all(d.pictures.map(async (p) => {
      const bytes = await bytesOf(p.url, control.signal, told);
      const blob = new Blob([bytes], { type: p.type || 'image/webp' });
      let bitmap = null;
      if (typeof createImageBitmap === 'function') {
        try { bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch (error) { bitmap = null; }
      }
      return { index: p.index, blob, bitmap };
    }));
    pictures.catch(() => {});
    const glb = await unzipped(await model);
    const { json, arrays } = splitGLB(glb.buffer.byteLength === glb.length ? glb.buffer : glb.slice().buffer);
    const pics = await pictures;
    if (control.signal.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' });
    const transfer = Object.values(arrays).map((a) => a.buffer);
    for (const p of pics) if (p.bitmap) transfer.push(p.bitmap);
    postMessage({ id: d.id, figure: { json, arrays, pictures: pics }, got }, transfer);
  } catch (error) {
    postMessage({ id: d.id, error: String((error && error.message) || error), stopped: !!(error && error.name === 'AbortError') || control.signal.aborted });
  } finally {
    jobs.delete(d.id);
    // (what was to be fetched ahead, and was held back while this was fetched, goes on)
    if (!jobs.size && wanted.length && !warming) warmNext();
  }
}

// Files fetched ahead of being wanted, one at a time, while no figure is being fetched; each held here until it is
// taken (bytesOf) or no longer wanted (the next `warm`, or a figure that does not need it).
function warm(urls) {
  const keep = new Set(urls);
  for (const [url, early] of ahead) if (!keep.has(url)) { early.control.abort(); ahead.delete(url); }
  wanted = urls.filter((url) => !ahead.has(url));
  if (!warming) warmNext();
}
async function warmNext() {
  warming = true;
  try {
    while (wanted.length && !jobs.size) {
      const url = wanted.shift();
      if (ahead.has(url)) continue;
      const early = { control: new AbortController(), got: 0, told: null, bytes: null };
      early.bytes = (async () => {
        const response = await fetch(url, { signal: early.control.signal, credentials: 'same-origin', priority: 'low' });
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        if (!response.body || typeof response.body.getReader !== 'function') return new Uint8Array(await response.arrayBuffer());
        const reader = response.body.getReader();
        const parts = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); early.got += value.length;
          if (early.told) early.told(value.length);
        }
        const out = new Uint8Array(early.got);
        let at = 0;
        for (const part of parts) { out.set(part, at); at += part.length; }
        return out;
      })();
      early.bytes.catch(() => { if (ahead.get(url) === early) ahead.delete(url); });
      ahead.set(url, early);
      await early.bytes.catch(() => {});
    }
  } finally { warming = false; }
}

onmessage = (e) => {
  const d = e.data || {};
  if (d.type === 'figure') figure(d);
  else if (d.type === 'cancel') { const job = jobs.get(d.id); if (job) job.abort(); }
  else if (d.type === 'warm') warm(d.urls || []);
  else if (d.type === 'pack') pack(d).catch((error) => postMessage({ id: d.id, error: String((error && error.message) || error) }));
};
