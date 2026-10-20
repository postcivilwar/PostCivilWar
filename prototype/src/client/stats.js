// The readout the owner opens on his own phones (20 October 2026, the owner's brief: "a small readout I can open on my
// own phone (the Help panel, or a #stats address): device, texture memory, JS heap, frame time, and each figure's
// download size and time"). The address ending in #stats shows it in a corner of every screen, from the opening to the
// town, over everything, written afresh every second. It takes no touches: the game is played as usual under it.
// Settings (Measured on this device) shows the same lines (ui.js).
//
//   const clock = frameClock()            times every frame the browser shows, whatever screen is up
//   const box = showStats()               the corner box; box.update(lines), lines as [label, value]
//   statsLines(now)                       the lines, from what main.js measures (`now`: below)

// Frame times as the browser shows them (requestAnimationFrame), on every screen: the town's own monitor counts only the
// town's frames.
export function frameClock() {
  const gaps = [];
  let last = 0, on = false;
  const tick = (t) => {
    if (!on) return;
    if (last && t > last) { gaps.push(t - last); if (gaps.length > 180) gaps.shift(); }
    last = t;
    requestAnimationFrame(tick);
  };
  // (a page out of sight is given no frames: the gap across it is not a frame)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { last = 0; });
  return {
    start() { if (!on) { on = true; last = 0; requestAnimationFrame(tick); } return this; },
    report() {
      if (!gaps.length) return null;
      const sorted = gaps.slice().sort((a, b) => a - b);
      const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      const mean = gaps.reduce((n, g) => n + g, 0) / gaps.length;
      return { median: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1), fps: Math.round(1000 / mean), frames: gaps.length };
    },
  };
}

const mb = (bytes) => (bytes / 1048576).toFixed(1);
const s = (ms) => (ms / 1000).toFixed(1);

// The lines, in plain words. `now`: { build, screen, device, pixelRatio, graphics (graphics-count.js), budgetMB, trims,
// heap ({ used, limit } in bytes, or null where the browser does not say), frames (frameClock().report()), lost,
// restored, figures (animated.js, figureLog) }
export function statsLines(now) {
  const lines = [];
  const scr = typeof screen !== 'undefined' ? `${window.innerWidth}×${window.innerHeight} at ${(window.devicePixelRatio || 1).toFixed(2)}` : '';
  lines.push(['Game', `${now.build || 'this copy'} · ${now.screen}`]);
  lines.push(['Device', `${now.device} · screen ${scr}, drawn at ${(now.pixelRatio || 1).toFixed(2)}`]);
  const g = now.graphics;
  lines.push(['Graphics card', g && !g.unwatched
    ? `pictures ${mb(g.pictures)} MB (${g.held}) · drawing buffers ${mb(g.buffers + g.screen)} MB · most ${mb(g.peak)} MB · budget ${now.budgetMB} MB${now.trims ? ` · let go of what was kept ready ${now.trims} times` : ''}`
    : 'not counted here']);
  lines.push(['Script memory', now.heap ? `${mb(now.heap.used)} MB of the ${mb(now.heap.limit)} MB allowed` : 'not told by this browser']);
  const f = now.frames;
  lines.push(['Frames', f ? `typical ${f.median} ms · slowest in twenty ${f.p95} ms · worst ${f.worst} ms · ${f.fps} a second` : 'none yet']);
  lines.push(['Picture taken away', `${now.lost} times · given back ${now.restored} times`]);
  const done = (now.figures || []).filter((r) => !r.stopped && !r.failed);
  const stopped = (now.figures || []).filter((r) => r.stopped).length;
  const failed = (now.figures || []).filter((r) => r.failed).length;
  lines.push(['Figures fetched', done.length
    ? `${done.slice(-5).reverse().map((r) => `${r.id} ${mb(r.bytes)} MB, came in ${s(r.arrivedMs)} s, ready in ${s(r.readyMs)} s`).join(' · ')}${stopped ? ` · ${stopped} stopped part way by an arrow` : ''}${failed ? ` · ${failed} did not arrive` : ''}`
    : stopped || failed ? `${stopped} stopped part way · ${failed} did not arrive` : 'none yet']);
  if (now.watch) lines.push(['Picture watch', now.watch]);
  return lines;
}

// The corner box (the address ending in #stats).
export function showStats() {
  const box = document.createElement('div');
  box.id = 'stats';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = [
    'position:fixed', 'z-index:200', 'left:max(6px, env(safe-area-inset-left))', 'top:max(6px, env(safe-area-inset-top))',
    'max-width:min(560px, calc(100vw - 12px))', 'padding:6px 8px', 'background:rgba(0,0,0,0.72)', 'color:#f2efe6',
    'font:11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', 'pointer-events:none', 'white-space:normal',
    'border:1px solid rgba(255,183,77,0.45)', 'border-radius:2px',
  ].join(';');
  document.body.appendChild(box);
  return {
    el: box,
    update(lines) {
      box.replaceChildren(...lines.map(([label, value]) => {
        const row = document.createElement('div');
        const b = document.createElement('b'); b.textContent = `${label}: `; b.style.color = '#ffb74d'; b.style.fontWeight = '600';
        row.append(b, document.createTextNode(value));
        return row;
      }));
    },
  };
}
