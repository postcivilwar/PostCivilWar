// What the page holds on the graphics card, counted as it is handed over (20 October 2026, the owner's brief: "an
// overall texture budget", and a readout he can open on his own phones). A browser does not say how much graphics
// memory a page uses, and three.js counts only how many pictures it has made (renderer.info.memory.textures), not how
// large they are. So the page's one drawing surface (its WebGL context) is watched as pictures are handed to it: each
// picture's size and kind as it goes over (texImage2D, or texStorage2D with all its levels), its smaller copies when
// they are made (generateMipmap, for a picture handed over by texImage2D), and
// each picture deleted. The drawing buffers made for pictures drawn off the screen (renderbuffers) are counted too.
//
//   const count = countGraphics(gl)   count.pictures (bytes), count.buffers (bytes), count.screen (bytes, the canvas's
//                                     own drawing buffer, an estimate), count.held (how many pictures), count.peak
//   count.lost()                      the drawing surface was taken away: everything on it went with it
//
// It counts only: every call goes on to the graphics card exactly as it was made.

// bytes for each pixel, by the format the picture is kept in on the graphics card (an RGB picture is kept as RGBA)
const BYTES = { 6408: 4, 6407: 4, 32856: 4, 32849: 4, 35907: 4, 35905: 4, 34842: 8, 34843: 8, 34836: 16, 34837: 16, 33321: 1, 33323: 2, 33325: 2, 33326: 4, 33327: 4, 33328: 8, 33329: 4, 33330: 8, 6409: 1, 6410: 2, 6406: 1, 33189: 4, 33190: 4, 36012: 4, 35056: 4, 36013: 8, 6402: 4, 34041: 4, 36168: 1, 32854: 2, 32855: 2, 36194: 2 };
const TEXTURE0 = 33984, TEXTURE_2D = 3553, CUBE = 34067, FACE0 = 34069, FACE5 = 34074;

export function countGraphics(gl, { antialias = false } = {}) {
  const count = { pictures: 0, buffers: 0, held: 0, peak: 0, get screen() { return screenBytes(); }, lost, unwatched: false };
  if (!gl || typeof gl.texImage2D !== 'function') { count.unwatched = true; return count; }
  const textures = new Map();          // a picture on the graphics card -> { levels: Map(level*8+face -> bytes), mips }
  const buffers = new Map();           // a drawing buffer -> bytes
  const bound2D = [], boundCube = [];  // by texture unit: the picture bound there
  let unit = 0, buffer = null;
  const sum = () => {
    let p = 0;
    for (const t of textures.values()) { let base = 0, all = 0; for (const [key, b] of t.levels) { all += b; if (key < 8) base += b; } p += all + (t.mips ? Math.round(base / 3) : 0); }
    let b = 0;
    for (const v of buffers.values()) b += v;
    count.pictures = p; count.buffers = b; count.held = textures.size;
    count.peak = Math.max(count.peak, p + b + screenBytes());
  };
  const boundTo = (target) => (target === TEXTURE_2D ? bound2D[unit] : boundCube[unit]);
  const entry = (texture) => { let t = textures.get(texture); if (!t) { t = { levels: new Map(), mips: false }; textures.set(texture, t); } return t; };
  function screenBytes() {
    try { const w = gl.drawingBufferWidth || 0, h = gl.drawingBufferHeight || 0; return w * h * 8 * (antialias ? 4 : 1); } catch (error) { return 0; }
  }
  // each call is counted first, then made as it was asked
  const wrap = (name, before) => {
    const made = gl[name];
    if (typeof made !== 'function') return;
    gl[name] = function counted(...a) { try { before(a); } catch (error) { /* counting only */ } return made.apply(gl, a); };
  };
  wrap('activeTexture', (a) => { unit = a[0] - TEXTURE0; });
  wrap('bindTexture', (a) => { if (a[0] === TEXTURE_2D) bound2D[unit] = a[1]; else if (a[0] === CUBE) boundCube[unit] = a[1]; });
  wrap('deleteTexture', (a) => { if (textures.delete(a[0])) sum(); });
  const level = (target, lvl, bytes) => {
    const cube = target >= FACE0 && target <= FACE5;
    const texture = boundTo(cube ? CUBE : target);
    if (!texture) return;
    entry(texture).levels.set(lvl * 8 + (cube ? target - FACE0 : 0), bytes);
    sum();
  };
  wrap('texImage2D', (a) => {
    let w, h;
    // (target, level, format, width, height, border, format, type, pixels[, offset]) or (target, level, format, format, type, source)
    if (a.length >= 8 && typeof a[3] === 'number' && typeof a[4] === 'number' && a.length !== 6) { w = a[3]; h = a[4]; } else { const s = a[5]; w = (s && (s.videoWidth || s.naturalWidth || s.width)) || 0; h = (s && (s.videoHeight || s.naturalHeight || s.height)) || 0; }
    level(a[0], a[1], w * h * (BYTES[a[2]] || 4));
  });
  wrap('compressedTexImage2D', (a) => { const data = a[6]; level(a[0], a[1], data && data.byteLength ? data.byteLength : 0); });
  wrap('texStorage2D', (a) => {
    const texture = boundTo(a[0]);
    if (!texture) return;
    // (all its levels made at once, its smaller copies with it: generateMipmap then fills them, adding nothing; three.js
    // r186 makes nearly every picture so)
    const t = entry(texture); t.levels.clear(); t.mips = false; t.stored = true;
    let w = a[3], h = a[4], total = 0;
    for (let l = 0; l < a[1]; l += 1) { total += Math.max(1, w) * Math.max(1, h) * (BYTES[a[2]] || 4); w >>= 1; h >>= 1; }
    t.levels.set(0, total * (a[0] === CUBE ? 6 : 1)); sum();
  });
  wrap('generateMipmap', (a) => { const texture = boundTo(a[0]); if (texture) { const t = entry(texture); if (!t.stored) { t.mips = true; sum(); } } });
  wrap('bindRenderbuffer', (a) => { buffer = a[1]; });
  wrap('deleteRenderbuffer', (a) => { if (buffers.delete(a[0])) sum(); });
  wrap('renderbufferStorage', (a) => { if (buffer) { buffers.set(buffer, a[2] * a[3] * (BYTES[a[1]] || 4)); sum(); } });
  wrap('renderbufferStorageMultisample', (a) => { if (buffer) { buffers.set(buffer, a[3] * a[4] * (BYTES[a[2]] || 4) * Math.max(1, a[1])); sum(); } });
  function lost() { textures.clear(); buffers.clear(); bound2D.length = 0; boundCube.length = 0; unit = 0; buffer = null; sum(); }
  // (for the measuring: every picture on the card with what it holds, in bytes, to be matched to what drew it)
  count.list = () => [...textures.entries()].map(([texture, t]) => { let base = 0, all = 0; for (const [key, b] of t.levels) { all += b; if (key < 8) base += b; } return { texture, bytes: all + (t.mips ? Math.round(base / 3) : 0) }; });
  return count;
}

export const MB = (bytes) => bytes / 1048576;
