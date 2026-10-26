// What a newly built part of the world needs from the graphics card (its programs: one for each kind of surface it is
// drawn with), made ready before it is shown (26 October 2026, the owner's brief: the game hung on his phones).
//
// Shown at once, a part's first frame waits for every new program to be compiled and linked: two dozen of them for the
// habitation, seconds on a phone, the town standing still. So a part built while playing (the land beyond the town and
// its billboards, the road up the river, the habitation) is kept out of sight until its programs are ready:
//   - where the browser compiles programs beside the page (the KHR_parallel_shader_compile extension: Safari on iPhones
//     and Chrome on Android phones have it), three.js's compileAsync asks for all of them at once and the part is shown
//     once the browser says they are done: the page is not held at all;
//   - elsewhere, one program at a time, a frame each (compiled, and made ready by asking for its inputs, which waits for
//     that one): a short wait a frame instead of all of them in one.
// A part is never kept from sight longer than `most` ms, whatever the browser does.
//
//   const ready = programsReady(renderer, object, camera, scene)
//   ready.step(budgetMs)    each frame: true once the part may be shown
//   ready.stats             { programs, frames, longestMs, parallel }

export function programsReady(renderer, object, camera, scene, { most = 6000 } = {}) {
  const stats = { programs: 0, frames: 0, longestMs: 0, parallel: false, timedOut: false };
  const t0 = performance.now();
  if (!renderer || !camera || !object) return { step: () => true, stats };
  let parallel = false;
  try { parallel = !!(renderer.extensions && renderer.extensions.has('KHR_parallel_shader_compile')) && typeof renderer.compileAsync === 'function'; } catch (error) { parallel = false; }
  stats.parallel = parallel;
  if (parallel) {
    let done = false;
    renderer.compileAsync(object, camera, scene).then(() => { done = true; }, () => { done = true; });
    return { stats, step() { stats.frames += 1; if (!done && performance.now() - t0 > most) { stats.timedOut = true; done = true; } return done; } };
  }
  // one mesh for each material not yet ready, in the order they are met
  const queue = [];
  const seen = new Set();
  object.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !seen.has(m)) { seen.add(m); queue.push([o, m]); }
  });
  let finished = false;
  return {
    stats,
    step(budgetMs = 6) {
      if (finished) return true;
      stats.frames += 1;
      const s0 = performance.now();
      while (queue.length) {
        const [o, m] = queue.shift();
        const p0 = performance.now();
        try {
          // (the program this surface needs as it will be drawn here: compiled, then made ready)
          const was = o.material;
          o.material = m;
          renderer.compile(o, camera, scene);
          o.material = was;
          const program = renderer.properties.get(m).currentProgram;
          if (program && typeof program.getUniforms === 'function') program.getUniforms();
          stats.programs += 1;
        } catch (error) { /* drawn as it comes, as before */ }
        stats.longestMs = Math.max(stats.longestMs, Math.round(performance.now() - p0));
        if (performance.now() - s0 >= budgetMs) break;
      }
      if (!queue.length || performance.now() - t0 > most) { stats.timedOut = queue.length > 0; finished = true; }
      return finished;
    },
  };
}
