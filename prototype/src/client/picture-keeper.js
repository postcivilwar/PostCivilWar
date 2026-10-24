// On a phone, the pictures painted in the page that nothing drawn has used for a while let go from the graphics card
// (23 October 2026, the owner's brief: a phone at Medium under its 150 MB at the busiest places). Measured on a phone's
// settings at the PowerBike showroom, of the 36 MB the town's signs and boards held on the card (181 pictures: the
// shops' names, the rooms' boards over the doors, the plots' boards, the road signs), 12 MB were for signs far out of
// sight: sent to the card ahead by the warm-up (warmup.js) so that a street corner coming into view does not stall, or
// drawn once and kept. At the car showroom and the habitation, 26 MB.
//
// Each few seconds the scene is walked once. A picture none of whose users is shown (itself and every group it is in
// visible) for `keepMs` is let go from the card (`texture.dispose()`): the page keeps what it was painted from (a canvas,
// an image), and three.js hands it to the card again the next time something using it is drawn, which for a sign is a
// fraction of a millisecond. Only pictures that can be handed over again so (a canvas, an image the page holds); never
// one the game makes again from its file (glb.js: those are let go and made by their own rules), nor one under a group
// marked `userData.keepPictures` (a hall entered through its doors, whose pictures must be there the moment one steps
// in), nor one drawn for something outside the town's own scene.
//
//   const keeper = createPictureKeeper(scene, renderer, { skip })   keeper.step(now): at most once each `everyMs`
//   keeper.state()                                                   what was let go, and when it was last looked at

const handable = (image) => !!image && ((typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement)
  || (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement && image.complete)
  || (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas));
const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'lightMap', 'specularMap'];

export function createPictureKeeper(scene, renderer, { keepMs = 30000, everyMs = 5000, skip = () => false } = {}) {
  const shownAt = new WeakMap();          // a picture -> when one of its users was last seen shown
  const recent = [];                      // (the last few let go: for the tests)
  let next = 0, lastMs = 0, walks = 0;
  const totals = { letGo: 0, bytes: 0 };
  const onCard = (t) => { if (!renderer.properties.has(t)) return false; const p = renderer.properties.get(t); return !!p.__webglTexture; };
  const sizeOf = (t) => { const img = t.image || {}; const w = img.width || 0, h = img.height || 0; return Math.round(w * h * 4 * (t.generateMipmaps ? 4 / 3 : 1)); };

  function step(now) {
    if (now < next) return 0;
    next = now + everyMs;
    const t0 = performance.now();
    const shown = new Set(), hidden = new Set();
    // (the scene walked once, each object knowing whether all of it above is shown, and whether its pictures are kept)
    const walk = (o, visible, keep) => {
      const v = visible && o.visible !== false, k = keep || !!(o.userData && o.userData.keepPictures);
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : null;
      if (mats) for (const m of mats) {
        if (!m) continue;
        const used = v && m.visible !== false;
        for (const key of KEYS) {
          const t = m[key];
          if (!t || !t.isTexture || t.isRenderTargetTexture) continue;
          if (used || k) shown.add(t); else hidden.add(t);
        }
      }
      const children = o.children;
      for (let i = 0; i < children.length; i += 1) walk(children[i], v, k);
    };
    walk(scene, true, false);
    let letGo = 0;
    for (const t of shown) shownAt.set(t, now);
    for (const t of hidden) {
      if (shown.has(t)) continue;
      const at = shownAt.get(t);
      if (at === undefined) { shownAt.set(t, now); continue; }       // (first seen out of sight: from now)
      if (now - at < keepMs || !handable(t.image) || skip(t) || !onCard(t)) continue;
      totals.bytes += sizeOf(t);
      t.dispose();
      letGo += 1;
      recent.push(t); if (recent.length > 8) recent.shift();
      // (counted afresh from here: let go once, not again each walk while it stays out of sight)
      shownAt.set(t, now);
    }
    totals.letGo += letGo;
    walks += 1;
    lastMs = performance.now() - t0;
    return letGo;
  }

  const state = () => ({ letGo: totals.letGo, MB: +(totals.bytes / 1048576).toFixed(1), walks, lastMs: +lastMs.toFixed(2), keepMs, everyMs });
  return { step, state, get recent() { return recent.slice(); } };
}
