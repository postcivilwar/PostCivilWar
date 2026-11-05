// Marks on the ground, and the people and vehicles who stand on them (5 November 2026).
//
// The owner, with a recording of his iPhone at night beside a slip road in Oganiru City: "my character's shoes and the
// bottom of his trousers are washed out, as if under a frosted layer (the floor's texture shows through his shoes), and
// the bottom of the coupé's tyres fades into the same surface"; and his rule since 22 October, now for the whole game:
// "feet are always seen on the surface, never in it ... The same for tyres: they sit on the surface."
//
// The cause: what the game paints on the ground (the pools of the street lamps' light at night, 7 cm up; the soft dark
// patch under every person, 9 cm up, 6 cm under the crowd's; under every vehicle, 3.5 cm up; footprints, tyre tracks,
// blood) was drawn as a see-through sheet a little over the ground, and see-through things are drawn after everything
// solid: each sheet lay over whatever stood on it up to its own height, shoes, trouser hems and the bottoms of the
// tyres, the light's pool brightening them and the patch darkening them. Lifted off the ground so as not to flicker
// against the road's own layers (its paint, its worn tar), the sheets could not simply be laid lower: anything a few
// millimetres over the road flickers with it from far off.
//
// Now they are drawn with the solid things, in their own place in the order: the town and the city first, then the marks
// on them, then whoever and whatever stands there, so that a mark is seen on the ground round a foot or a tyre and never
// over it, however high it is laid. Among the solid things three.js draws by `renderOrder` first: the world keeps 0, a
// mark is DRAW.marks, a person or a vehicle (every part of it) DRAW.standing.
export const DRAW = Object.freeze({ marks: 1, standing: 2 });

// A mark's material, from what it was as a see-through one: drawn with the solid things, writing no depth, blended over
// what is under it as before. `add`: its light added (a lamp's pool); otherwise laid over in its own colour by its alpha
// (premultiplied, so that one blending serves a black patch, blood's red or a footprint's mud).
export function markMaterial(material, { add = false } = {}) {
  material.transparent = false;
  material.depthWrite = false;
  if (add) {
    material.blending = THREE.AdditiveBlending;
  } else if (material.blending !== THREE.CustomBlending) {
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.premultipliedAlpha = true;
  }
  material.needsUpdate = true;
  return material;
}

// A mesh as a mark: drawn after the world and before whoever stands on it.
export function asMark(object) {
  object.renderOrder = DRAW.marks;
  object.userData.mark = true;
  return object;
}

// A person or a vehicle (every part of it that is drawn, but its own marks): drawn after the marks on the ground.
export function standing(object) {
  if (!object) return object;
  object.traverse((o) => {
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !o.userData.mark && o.renderOrder < DRAW.standing) o.renderOrder = DRAW.standing;
  });
  return object;
}
