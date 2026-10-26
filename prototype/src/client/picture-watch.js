// The picture watched (19 October 2026, the owner: on his phone the game played on, the bar and the buttons there,
// behind a picture purely black). What the town needs in order to be seen is checked while it is played:
//  - that frames are drawn (the browser may stop calling, or every frame may fail part way);
//  - that drawing a frame does not fail (the error is kept);
//  - that the camera is somewhere real (a position or a turn that is not a number draws nothing);
//  - every few seconds, a few points of the picture just drawn are read back: black at every point, time after time,
//    is not the town at any hour (the night sky and the lamps are never black to the last bit).
// When the town cannot be seen, `tell` is told so, and the game says it on its own calm card, in plain words, with one
// thing to press (20 October 2026, the owner's brief: never a wall of text, never the words for how the browser
// works). What was found in detail (the error the browser gave, the device's graphics, what was drawn) is kept here,
// for the readout the owner can open on a phone (#stats). A drawing surface taken away is not this watch's to tell:
// the game brings it back itself (main.js), and `lost` says when it is away. Errors written to the console and errors
// nothing caught are kept too (the last few), since a shader the device could not build is only ever written there.
const LOOK_EVERY = 3000;     // ms between reading the picture back, the first minute the town is wanted
// (and after it, LOOK_LATER: each reading back makes the page wait for the graphics card to finish the frame, a frame
// lost on a phone; 26 October 2026, the owner's brief: the game hung on his phones)
const LOOK_LATER = 15000;
const BLACK_LOOKS = 4;       // looks in a row black at every point before it is said
const STILL_FOR = 6000;      // ms with nothing drawn, while the town should be, before it is said
const FAILS_FOR = 3;         // frames failed in a row before it is said

export function watchPicture({ renderer, camera, canvas, lost, errors, tell = () => {} }) {
  const kept = [];
  const keep = (text) => { try { kept.push(String(text).replace(/\s+/g, ' ').slice(0, 240)); if (kept.length > 5) kept.shift(); } catch (e) { /* kept as far as it could be */ } };
  const describe = (value) => (value instanceof Error ? `${value.name}: ${value.message}${value.stack ? ` @ ${String(value.stack).split('\n').find((l) => /\.js|@|at /.test(l) && !/^\w*Error/.test(l)) || ''}` : ''}` : typeof value === 'object' && value ? (() => { try { return JSON.stringify(value).slice(0, 200); } catch (e) { return String(value); } })() : String(value));
  const written = console.error;
  console.error = function (...args) { keep(args.map(describe).join(' ')); return written.apply(this, args); };
  window.addEventListener('error', (event) => keep(`page: ${event.message || ''} ${event.filename ? `${String(event.filename).split('/').pop()}:${event.lineno}` : ''}`));
  window.addEventListener('unhandledrejection', (event) => keep(`promise: ${describe(event.reason)}`));

  let gl = null;
  try { gl = renderer.getContext(); } catch (e) { gl = null; }
  const device = (() => {
    try {
      const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const card = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : 'none';
      return `${card}; ${gl ? `WebGL${typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? '2' : '1'}, textures ${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)}/${gl.getParameter(gl.MAX_TEXTURE_SIZE)}` : ''}`;
    } catch (e) { return 'unknown'; }
  })();

  const state = { lastDrawn: 0, wanted: 0, failsInRow: 0, lastError: '', black: 0, lookAt: 0, said: '', hidden: false, shown: 0, shownAt: 0, told: false, looked: 0 };
  const pixel = new Uint8Array(4);
  // (five points: the middle and the four quarters; read back straight after drawing, before the browser shows it)
  const POINTS = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const looksBlack = () => {
    if (!gl || gl.isContextLost()) return false;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!w || !h) return false;
    for (const [fx, fy] of POINTS) {
      gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[0] + pixel[1] + pixel[2] > 3) return false;
    }
    return true;
  };
  // Read back without waiting (26 October 2026, the owner's brief: the game hung on his phones). Read straight back, the
  // page waits for the graphics card to finish everything it has been given: a frame, and whatever else it is doing
  // (compiling the programs of something just come into sight, taking in a model's pictures), seconds of the page held
  // on a slow device, every few seconds. Where the browser has WebGL 2 (every phone it plays on now), the points are
  // read into a buffer on the card, behind a fence, and taken from it once the card says it has passed the fence, a
  // frame or more later: nothing waits. Elsewhere, read straight back, as before.
  const gl2 = !!gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const packed = new Uint8Array(POINTS.length * 4);
  let pbo = null, fence = null;
  function lookLater() {
    if (!gl || gl.isContextLost()) return false;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!w || !h) return false;
    if (!pbo) { pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, packed.byteLength, gl.STREAM_READ); }
    else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    POINTS.forEach(([fx, fy], k) => gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, k * 4));
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return true;
  }
  // (null while the card has not got there yet; then whether every point was black)
  function lookedAt() {
    if (!fence) return null;
    if (gl.isContextLost()) { fence = null; pbo = null; return null; }
    const status = gl.clientWaitSync(fence, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return null;
    gl.deleteSync(fence); fence = null;
    if (status === gl.WAIT_FAILED) return false;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, packed);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    for (let k = 0; k < POINTS.length; k += 1) if (packed[k * 4] + packed[k * 4 + 1] + packed[k * 4 + 2] > 3) return false;
    return true;
  }

  // what was found, in detail, for the readout
  let detail = '';
  const show = (reason) => {
    state.said = reason;
    const p = camera.position;
    const info = renderer.info && renderer.info.render ? renderer.info.render : {};
    detail = [
      `found: ${reason}`,
      `graphics: ${device}`,
      `drawn: ${info.calls || 0} calls, ${info.triangles || 0} triangles; frames failed ${errors()}`,
      `camera: ${[p.x, p.y, p.z].map((v) => (Number.isFinite(v) ? v.toFixed(1) : String(v))).join(', ')}; screen ${canvas.width}x${canvas.height} at ${(window.devicePixelRatio || 1).toFixed(2)}`,
      state.lastError ? `error: ${state.lastError}` : '',
      ...kept.filter((k) => k !== state.lastError).map((k) => `console: ${k}`),
    ].filter(Boolean).join('\n');
    if (!state.hidden && !state.told) { state.told = true; tell(reason); }
    state.shown += 1;
  };
  const clear = () => { state.said = ''; if (state.told) { state.told = false; tell(''); } };

  return {
    // a frame drawn: read back now and then (the read is made straight after drawing, while the picture is there)
    drawn(now) {
      state.lastDrawn = now;
      state.failsInRow = 0;
      // (a reading back under way: taken once the card has got there)
      if (fence) { try { const black = lookedAt(); if (black !== null) { state.black = black ? state.black + 1 : 0; state.looked += 1; } } catch (e) { fence = null; state.black = 0; } }
      if (now >= state.lookAt && !fence) {
        state.lookAt = now + (state.wanted && now - state.wanted > 60000 && !state.black ? LOOK_LATER : LOOK_EVERY);
        try { if (gl2) lookLater(); else { state.black = looksBlack() ? state.black + 1 : 0; state.looked += 1; } } catch (e) { fence = null; state.black = 0; }
      }
    },
    failed(error) { state.failsInRow += 1; state.lastError = describe(error); },
    // every frame: should the town be on the screen, and is it?
    frame(now, wanted) {
      if (!wanted || lost()) { state.wanted = 0; if (lost()) { fence = null; pbo = null; } if (state.said) clear(); return; }
      if (!state.wanted) { state.wanted = now; state.lastDrawn = Math.max(state.lastDrawn, now); state.black = 0; }
      const p = camera.position;
      let reason = '';
      if (state.failsInRow >= FAILS_FOR) reason = 'Drawing the town failed on this device.';
      else if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) reason = 'The camera was lost (its position is not a number).';
      else if (now - state.lastDrawn > STILL_FOR) reason = 'The town stopped being drawn.';
      else if (state.black >= BLACK_LOOKS) reason = 'The town is being drawn black on this device.';
      // (what was found is written afresh every two seconds while it is up)
      if (reason) { if (reason !== state.said || now - state.shownAt > 2000) { state.shownAt = now; show(reason); } }
      else if (state.said) clear();
    },
    get said() { return state.said; },
    get detail() { return detail; },
    get kept() { return kept.slice(); },
    get black() { return state.black; },
    // (for the tests: how many readings back have been taken, and whether they are taken without waiting)
    get looked() { return state.looked; },
    get waitsNot() { return gl2; },
    device,
  };
}
