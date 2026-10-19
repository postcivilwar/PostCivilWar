// The picture watched (19 October 2026, the owner: on his phone the game played on, the bar and the buttons there,
// behind a picture purely black). What the town needs in order to be seen is checked while it is played:
//  - that frames are drawn (the browser may stop calling, or every frame may fail part way);
//  - that drawing a frame does not fail (the error is kept);
//  - that the browser still lets the page draw (its WebGL context not lost);
//  - that the camera is somewhere real (a position or a turn that is not a number draws nothing);
//  - every few seconds, a few points of the picture just drawn are read back: black at every point, time after time,
//    is not the town at any hour (the night sky and the lamps are never black to the last bit).
// When the town cannot be seen the player is told on the screen, with what was found (the error the browser gave, the
// device's graphics, what was drawn), so that it can be photographed and sent; reloading the page is offered and is
// theirs to choose (the game never reloads itself). Errors written to the console and errors nothing caught are kept
// too (the last few), since a shader the device could not build is only ever written there.
const LOOK_EVERY = 3000;     // ms between reading the picture back
const BLACK_LOOKS = 4;       // looks in a row black at every point before it is said
const STILL_FOR = 6000;      // ms with nothing drawn, while the town should be, before it is said
const FAILS_FOR = 3;         // frames failed in a row before it is said

export function watchPicture({ renderer, camera, canvas, reload, lost, errors }) {
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

  const state = { lastDrawn: 0, wanted: 0, failsInRow: 0, lastError: '', black: 0, lookAt: 0, said: '', hidden: false, shown: 0, shownAt: 0 };
  const pixel = new Uint8Array(4);
  // (five points: the middle and the four quarters; read back straight after drawing, before the browser shows it)
  const looksBlack = () => {
    if (!gl || gl.isContextLost()) return false;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!w || !h) return false;
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[0] + pixel[1] + pixel[2] > 3) return false;
    }
    return true;
  };

  let box = null;
  const show = (reason) => {
    state.said = reason;
    if (state.hidden) return;
    if (!box) {
      box = document.createElement('div');
      box.id = 'picture-watch';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:100000;max-width:min(560px,calc(100vw - 32px));box-sizing:border-box;padding:14px 16px;border-radius:12px;background:rgba(20,22,28,0.94);color:#f4f1ea;font:14px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,0.5);pointer-events:auto;';
      box.innerHTML = '<div style="font-weight:600;font-size:16px;margin-bottom:4px">The town is not showing</div>'
        + '<div data-say style="margin-bottom:8px"></div>'
        + '<div style="margin-bottom:8px">Your game is saved. Reloading the page usually brings the town back. If it keeps happening, take a screenshot of this message: the lines below say what went wrong on this device.</div>'
        + '<div data-detail style="font:11px/1.35 ui-monospace,Menlo,monospace;opacity:0.8;word-break:break-word;max-height:30vh;overflow:auto;margin-bottom:10px"></div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end"><button data-hide type="button" style="padding:8px 14px;border-radius:8px;border:1px solid #666;background:transparent;color:inherit;font:inherit">Hide</button><button data-reload type="button" style="padding:8px 14px;border-radius:8px;border:0;background:#e8a23a;color:#1a1a1a;font:inherit;font-weight:600">Reload the page</button></div>';
      for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown', 'keyup', 'wheel']) box.addEventListener(type, (event) => event.stopPropagation());
      box.querySelector('[data-hide]').addEventListener('click', () => { state.hidden = true; box.hidden = true; });
      box.querySelector('[data-reload]').addEventListener('click', () => reload());
      document.body.appendChild(box);
    }
    box.querySelector('[data-say]').textContent = reason;
    const p = camera.position;
    const info = renderer.info && renderer.info.render ? renderer.info.render : {};
    box.querySelector('[data-detail]').textContent = [
      `graphics: ${device}`,
      `drawn: ${info.calls || 0} calls, ${info.triangles || 0} triangles; context ${gl && gl.isContextLost() ? 'LOST' : 'kept'} (lost ${lost()} times); frames failed ${errors()}`,
      `camera: ${[p.x, p.y, p.z].map((v) => (Number.isFinite(v) ? v.toFixed(1) : String(v))).join(', ')}; screen ${canvas.width}x${canvas.height} at ${(window.devicePixelRatio || 1).toFixed(2)}`,
      state.lastError ? `error: ${state.lastError}` : '',
      ...kept.filter((k) => k !== state.lastError).map((k) => `console: ${k}`),
      `browser: ${navigator.userAgent}`,
    ].filter(Boolean).join('\n');
    box.style.whiteSpace = 'normal';
    box.querySelector('[data-detail]').style.whiteSpace = 'pre-wrap';
    box.hidden = false;
    state.shown += 1;
  };
  const clear = () => { state.said = ''; if (box) box.hidden = true; };

  return {
    // a frame drawn: read back now and then (the read is made straight after drawing, while the picture is there)
    drawn(now) {
      state.lastDrawn = now;
      state.failsInRow = 0;
      if (now >= state.lookAt) { state.lookAt = now + LOOK_EVERY; try { state.black = looksBlack() ? state.black + 1 : 0; } catch (e) { state.black = 0; } }
    },
    failed(error) { state.failsInRow += 1; state.lastError = describe(error); },
    // every frame: should the town be on the screen, and is it?
    frame(now, wanted) {
      if (!wanted) { state.wanted = 0; if (state.said && !lost()) clear(); return; }
      if (!state.wanted) { state.wanted = now; state.lastDrawn = Math.max(state.lastDrawn, now); state.black = 0; }
      const p = camera.position;
      let reason = '';
      if (lost() || (gl && gl.isContextLost())) reason = 'The browser took the game\'s graphics away (this device ran short of memory for them).';
      else if (state.failsInRow >= FAILS_FOR) reason = 'Drawing the town failed on this device.';
      else if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) reason = 'The camera was lost (its position is not a number).';
      else if (now - state.lastDrawn > STILL_FOR) reason = 'The town stopped being drawn.';
      else if (state.black >= BLACK_LOOKS) reason = 'The town is being drawn black on this device.';
      // (what was found is written afresh every two seconds while it is up)
      if (reason) { if (reason !== state.said || now - state.shownAt > 2000) { state.shownAt = now; show(reason); } }
      else if (state.said) clear();
    },
    get said() { return state.said; },
    get kept() { return kept.slice(); },
    get black() { return state.black; },
    device,
  };
}
