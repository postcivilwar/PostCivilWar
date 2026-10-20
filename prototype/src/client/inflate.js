// Unzipping, for a browser that has no DecompressionStream of its own (Safari before 16.4): the figures' light copies
// are gzip'd GLB files (tools/characters/light.py), and a browser that can unzip them itself does (figure-worker.js).
// This is DEFLATE as RFC 1951 lays it down, read the plain way: slower than the browser's own, and only ever used where
// there is none. Pure: runs without a page (test/inflate.test.mjs checks it against Node's own zlib).
//
// The worker's source is put together from this file and figure-worker.js by build.mjs: nothing here may use
// anything outside it.

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// A Huffman code as a table: for every 9-bit (or shorter) prefix the symbol and its length; longer codes are found
// by walking the counts, as RFC 1951's canonical codes allow.
function huffman(lengths, n) {
  const counts = new Uint16Array(16), offs = new Uint16Array(16), symbols = new Uint16Array(n);
  for (let i = 0; i < n; i += 1) counts[lengths[i]] += 1;
  counts[0] = 0;
  for (let i = 1; i < 16; i += 1) offs[i] = offs[i - 1] + counts[i - 1];
  for (let i = 0; i < n; i += 1) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}

// Inflates raw DEFLATE data. `size`, if known (the gzip trailer gives it), is the output's length.
export function inflateRaw(src, size = 0) {
  let out = new Uint8Array(size || Math.max(1024, src.length * 4));
  let at = 0;                     // where the next byte goes
  let pos = 0, bits = 0, have = 0;  // the input: next byte, the bits held, how many
  const need = (n) => { while (have < n) { if (pos >= src.length) throw new Error('inflate: the data ends early'); bits |= src[pos++] << have; have += 8; } };
  const take = (n) => { need(n); const v = bits & ((1 << n) - 1); bits >>>= n; have -= n; return v; };
  const room = (n) => {
    if (at + n <= out.length) return;
    let len = out.length * 2; while (len < at + n) len *= 2;
    const grown = new Uint8Array(len); grown.set(out.subarray(0, at)); out = grown;
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len += 1) {
      code |= take(1);
      const count = h.counts[len];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count; first += count; first <<= 1; code <<= 1;
    }
    throw new Error('inflate: a bad code');
  };
  let fixedLit = null, fixedDist = null;
  for (;;) {
    const last = take(1);
    const type = take(2);
    if (type === 0) {
      bits = 0; have = 0;                       // (to the next byte)
      if (pos + 4 > src.length) throw new Error('inflate: the data ends early');
      const len = src[pos] | (src[pos + 1] << 8);
      const nlen = src[pos + 2] | (src[pos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) throw new Error('inflate: a stored block\'s length does not check');
      pos += 4;
      if (pos + len > src.length) throw new Error('inflate: the data ends early');
      room(len); out.set(src.subarray(pos, pos + len), at); at += len; pos += len;
    } else if (type === 1 || type === 2) {
      let lit, dist;
      if (type === 1) {
        if (!fixedLit) {
          const l = new Uint8Array(288);
          for (let i = 0; i < 144; i += 1) l[i] = 8;
          for (let i = 144; i < 256; i += 1) l[i] = 9;
          for (let i = 256; i < 280; i += 1) l[i] = 7;
          for (let i = 280; i < 288; i += 1) l[i] = 8;
          fixedLit = huffman(l, 288);
          fixedDist = huffman(new Uint8Array(30).fill(5), 30);
        }
        lit = fixedLit; dist = fixedDist;
      } else {
        const nlen = take(5) + 257, ndist = take(5) + 1, ncode = take(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < ncode; i += 1) cl[ORDER[i]] = take(3);
        const ch = huffman(cl, 19);
        const lengths = new Uint8Array(nlen + ndist);
        for (let i = 0; i < nlen + ndist;) {
          const sym = decode(ch);
          if (sym < 16) { lengths[i++] = sym; continue; }
          let rep = 0, val = 0;
          if (sym === 16) { if (i === 0) throw new Error('inflate: a repeat with nothing before it'); val = lengths[i - 1]; rep = 3 + take(2); }
          else if (sym === 17) rep = 3 + take(3);
          else rep = 11 + take(7);
          if (i + rep > nlen + ndist) throw new Error('inflate: too many lengths');
          while (rep--) lengths[i++] = val;
        }
        lit = huffman(lengths.subarray(0, nlen), nlen);
        dist = huffman(lengths.subarray(nlen), ndist);
      }
      for (;;) {
        const sym = decode(lit);
        if (sym < 256) { room(1); out[at++] = sym; continue; }
        if (sym === 256) break;
        const s = sym - 257;
        if (s >= 29) throw new Error('inflate: a bad length');
        const len = LENGTH_BASE[s] + take(LENGTH_EXTRA[s]);
        const d = decode(dist);
        if (d >= 30) throw new Error('inflate: a bad distance');
        const back = DIST_BASE[d] + take(DIST_EXTRA[d]);
        if (back > at) throw new Error('inflate: a distance before the start');
        room(len);
        for (let i = 0; i < len; i += 1) { out[at] = out[at - back]; at += 1; }
      }
    } else throw new Error('inflate: a bad block type');
    if (last) break;
  }
  return at === out.length ? out : out.slice(0, at);
}

// A gzip file's contents (RFC 1952): its header read past, its data inflated, and its length checked.
export function gunzip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] !== 0x1f || b[1] !== 0x8b || b[2] !== 8) throw new Error('not a gzip file');
  const flags = b[3];
  let at = 10;
  if (flags & 4) at += 2 + (b[at] | (b[at + 1] << 8));           // extra
  if (flags & 8) { while (b[at] !== 0) at += 1; at += 1; }         // name
  if (flags & 16) { while (b[at] !== 0) at += 1; at += 1; }        // comment
  if (flags & 2) at += 2;                                          // header check
  const size = (b[b.length - 4] | (b[b.length - 3] << 8) | (b[b.length - 2] << 16) | (b[b.length - 1] << 24)) >>> 0;
  const out = inflateRaw(b.subarray(at, b.length - 8), size);
  if (out.length !== size) throw new Error('inflate: the length does not check');
  return out;
}
