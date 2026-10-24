// The soft dark patch on the ground under a vehicle (the graphics levels, 23 October 2026, the owner's words for Low: "no
// real-time shadows (a soft patch under people and vehicles)"). The figures have always had theirs (character.js); each
// keke, coach, motorcycle and car is given one here, as long and as wide as itself. One picture, one shape and one
// material for all of them. Since stage 3 of the brief ("contact shadows under people and vehicles (all levels)", 24
// October 2026) it is there at every level: as dark as before (PATCH.alone) while the sun casts no shadows, and lighter
// (PATCH.withSun) under the sun's own shadow, where it is the darkening close under a vehicle that a shadow map spread
// over metres does not give (the figures' patch is the same soft picture: `softShadowPicture`).

let material = null, geometry = null, picture = null;
export const PATCH = Object.freeze({ alone: 0.32, withSun: 0.17 });
// (a figure's own: the soft picture at this, its darkness at the middle; about as dark on the whole as the flat disc of
// 0.13 a figure had, but gathered under the feet)
export const FIGURE_PATCH = 0.34;

// the soft round picture (white at its middle, nothing at its rim), for a material's alphaMap
export function softShadowPicture() {
  // (no page to paint it in, as in the headless tests: none, and the patch is flat)
  if (!picture && typeof document !== 'undefined') picture = patchPicture();
  return picture;
}
function patchPicture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function shared() {
  if (!material) {
    // (black, its darkness the picture's: as dark at its middle as a figure's patch, fading to nothing at its rim)
    material = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: softShadowPicture(), transparent: true, opacity: PATCH.alone, depthWrite: false });
    geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  }
  return { material, geometry };
}

// A patch under `group` (a vehicle's own group, so that it goes where the vehicle goes): `length` along its z, `width`
// along its x, metres; `y` a hair above the ground under it.
export function softPatch(group, { length, width, y = 0.035 } = {}) {
  if (!group || !(length > 0) || !(width > 0)) return null;
  const s = shared();
  const mesh = new THREE.Mesh(s.geometry, s.material);
  mesh.name = 'soft-patch';
  mesh.scale.set(width * 1.25, 1, length * 1.15);
  mesh.position.y = y;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  group.add(mesh);
  return mesh;
}
// A patch as long and as wide as `object` is (its box, worked out once from its shapes, as it stands unturned).
export function softPatchUnder(group, object = group) {
  try {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    return softPatch(group, { length: size.z, width: size.x });
  } catch (error) { return null; }
}
// `alone` (true) while the sun casts no shadows: as dark as a patch alone; false: lighter, under the sun's own shadow.
export function showSoftPatches(alone) { shared().material.opacity = alone ? PATCH.alone : PATCH.withSun; }
// (for the tests: whether the patches are drawn, and how dark)
export const softPatchesShown = () => !!(material && material.visible);
export const softPatchOpacity = () => (material ? material.opacity : 0);
