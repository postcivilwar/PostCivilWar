// Real glass in the cars' windows (5 November 2026, the owner's brief, part 2: "Every car's windscreen, side windows and
// back window must be real glass you can see through ... cut them out of the body cleanly along the painted edge (no
// ragged triangles), and draw real glass in their place, curved as the car's own glass is. The door windows belong to
// the doors and swing open with them").
//
// Each car's windows are a small picture beside its others ('<id>-windows-1k.png', and '-512' for a phone; written by
// tools/vehicles/windows.py from the game's copy of the car): white where its colour picture is painted glass, its edge
// eased. Nothing in the owner's files is changed: the car's body is drawn without what that picture marks (no point of
// it is drawn there, so the cut follows the painted edge wherever the triangles under it run), and the triangles that
// carry any glass are drawn a second time as glass, only where the picture marks it. A door's window is part of the
// door's own shape, so it is drawn with the door and swings with it. The body is drawn from inside as well (its inside
// the car's dark trim): the pillars, the roof and the doors as seen from a seat, and never the town through them.
//
// The glass (the brief's words): "clear with a slight grey-green tint; the windscreen and the front side windows the
// clearest; the back side windows and the back window darker on the SUVs, the State Limousine and the luxury cars
// (privacy glass that still shows who sits there); the sky and the street reflected in it, more at a slant than
// straight on; a little dust along the bottom edges; ... in the rain, drops on the glass and streaks running back as
// the car moves (Medium and above)". Seen from inside as from outside (both its faces drawn).
//
//   const glass = carGlass(spec, picture, { lite, privacy, belt, behind, inside })   one for each model and set of
//                                                                                    pictures, shared by every car of it
//   glass.body(material)          the body's own material, made to leave its glass out and to show its inside dark
//   glass.pane(geometry)          a mesh of glass for one part of the body (the whole body's, the body's without its
//                                 doors', a door's), to be put beside that part's own mesh
//   setGlassWeather({ wet, daylight, t })   each frame: how wet the cars are, how light the sky is, the time
//   glass.dispose()

const weather = { uWet: { value: 0 }, uTime: { value: 0 }, uDay: { value: 1 } };
const live = new Set();

// The tint, and how much of what is behind the glass it lets through (its opacity: the less, the clearer): face on,
// and at a slant (then it mostly gives back the sky). Privacy glass (the glass behind the front doors on the SUVs, the
// limousine and the luxury cars): darker, still seen through. `inside`: the body's inside, a dark trim.
// (the tint is the glass's own colour where light falls on it: dark, so that it mostly darkens what is behind it a little
// and gives back the sky, a slight grey-green)
export const GLASS = Object.freeze({
  tint: 0x2f3a36, clear: 0.2, privacy: 0.55, slant: 0.82, roughness: 0.04, dust: 0.22, edge: 0.012,
  inside: 0x1c1c1e,
});

// Drops on glass in the rain: a picture of them (and of the streaks they run into), slid back over the glass with the
// car's speed (`uTime` carries how far it has gone).
let dropsPicture = null;
function drops() {
  if (dropsPicture) return dropsPicture;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i += 1) {
    const x = rnd() * 128, y = rnd() * 128, r = 0.8 + rnd() * 2.2;
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (rnd() < 0.25) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - 0.4, y, 0.8, 6 + rnd() * 14); }
  }
  dropsPicture = new THREE.CanvasTexture(c);
  dropsPicture.wrapS = dropsPicture.wrapT = THREE.RepeatWrapping;
  return dropsPicture;
}

// A car's windows picture, as the graphics card keeps it: one number a point (its red), not four.
export function windowsPicture(image) {
  const t = new THREE.Texture(image);
  t.flipY = false;
  t.format = THREE.RedFormat;
  t.internalFormat = 'R8';
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  t.name = 'car-windows';
  return t;
}

// `spec`: the car's measures (car-parts.js); `picture`: its windows picture (windowsPicture); `privacy`: whether its
// glass behind the front doors is privacy glass, `behind` where those begin (the model's units along it: the glass
// further back than that); `belt`: how low its side glass comes (the model's units, for the dust); `inside`: the
// colour of its inside (its cabin's trim).
export function carGlass(spec, picture, { lite = false, privacy = false, belt = null, behind = 0, inside = GLASS.inside, envMap = null } = {}) {
  const env = typeof THREE.MeshPhysicalMaterial === 'function' && !lite;
  const uniforms = {
    uSlant: { value: GLASS.slant }, uBelt: { value: belt === null ? -1 : belt }, uDust: { value: GLASS.dust }, uEdge: { value: GLASS.edge * spec.length },
    uClear: { value: GLASS.clear }, uPrivate: { value: privacy ? GLASS.privacy : GLASS.clear }, uBehind: { value: behind },
    uDrops: { value: drops() }, ...weather,
  };
  const options = {
    color: GLASS.tint, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide,
    roughness: GLASS.roughness, metalness: 0, alphaMap: picture, ...(envMap ? { envMap, envMapIntensity: 1.1 * weather.uDay.value } : {}),
  };
  const material = env ? new THREE.MeshPhysicalMaterial({ ...options, clearcoat: 0, ior: 1.5, specularIntensity: 1 }) : new THREE.MeshStandardMaterial(options);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlassAt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassAt = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGlassAt;
uniform float uSlant; uniform float uBelt; uniform float uDust; uniform float uEdge; uniform float uWet; uniform float uTime; uniform float uDay;
uniform float uClear; uniform float uPrivate; uniform float uBehind;
uniform sampler2D uDrops;`)
      // (only where the windows picture marks glass: elsewhere these triangles are the body's)
      .replace('#include <alphamap_fragment>', `float glassMask = texture2D( alphaMap, vAlphaMapUv ).r;
if ( glassMask < 0.45 ) discard;`)
      // (dust along the bottom of the side windows: lighter, rougher, a centimetre or so up from the sill)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float glassDust = uBelt >= 0.0 ? (1.0 - smoothstep(uBelt, uBelt + uEdge, vGlassAt.y)) * uDust : 0.0;
roughnessFactor = mix(roughnessFactor, 0.6, glassDust);`)
      // (the glass mostly gives back the sky at a slant, and is seen through face on; privacy glass behind the front
      // doors darker; dust and drops a little less clear; the drops, at Medium and up, only in the rain; its edge eased
      // in over the windows picture's eased edge)
      .replace('#include <opaque_fragment>', `float glassFace = abs(dot(normalize(normal), normalize(vViewPosition)));
float glassSlant = pow(1.0 - glassFace, 3.0) * uSlant;
vec2 dropAt = vec2(vGlassAt.x * 14.0 + vGlassAt.y * 3.0, vGlassAt.z * 14.0 + uTime * 0.6);
float glassDrops = uWet * texture2D(uDrops, dropAt).a;
float glassBase = vGlassAt.z < uBehind ? uPrivate : uClear;
outgoingLight = mix(outgoingLight, vec3(0.62, 0.64, 0.62) * (0.35 + 0.65 * uDay), glassDust * 0.5);
outgoingLight += glassDrops * vec3(0.55) * (0.3 + 0.7 * uDay);
diffuseColor.a = clamp(max(glassBase, glassSlant) + glassDust * 0.35 + glassDrops * 0.25, 0.0, 0.97) * smoothstep(0.45, 0.6, glassMask);
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `pcw-car-glass-${env ? 'p' : 's'}`;
  material.userData.glass = true;
  live.add(material);
  const insideColour = new THREE.Color(inside);
  return {
    material,
    body(m) {
      // (the body's own picture of its glass left out: where the windows picture is white nothing of the body is drawn;
      // and its inside drawn, as the car's dark trim, rough, without the paint's shine)
      m.alphaMap = picture;
      m.alphaTest = 0;
      m.side = THREE.DoubleSide;
      const was = m.onBeforeCompile;
      const inner = { uInside: { value: insideColour } };
      m.onBeforeCompile = (shader, renderer) => {
        if (was) was(shader, renderer);
        Object.assign(shader.uniforms, inner);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uInside;')
          .replace('#include <alphamap_fragment>', `#ifdef USE_ALPHAMAP
	if ( texture2D( alphaMap, vAlphaMapUv ).r > 0.5 ) discard;
#endif`)
          .replace('#include <map_fragment>', '#include <map_fragment>\nif ( ! gl_FrontFacing ) diffuseColor.rgb = uInside;')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif ( ! gl_FrontFacing ) roughnessFactor = 0.92;')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif ( ! gl_FrontFacing ) metalnessFactor = 0.0;')
          .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
	if ( ! gl_FrontFacing ) material.clearcoat = 0.0;
#endif`);
      };
      const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
      m.customProgramCacheKey = () => `${key()}|pcw-glass-cut`;
      m.needsUpdate = true;
      return m;
    },
    pane(geometry) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'car-glass'; mesh.castShadow = false; mesh.receiveShadow = false;
      // (after the solid things, the cabin and whoever sits in it: see-through)
      mesh.renderOrder = 3;
      return mesh;
    },
    dispose() { live.delete(material); material.dispose(); },
  };
}

// Each frame: how wet the cars are (0 to 1; the drops shown from Medium up, by whoever calls), how light the sky (0 at
// night: the reflections fade), and the time (the drops slide back).
export function setGlassWeather({ wet = 0, daylight = 1, t = 0 } = {}) {
  weather.uWet.value = wet;
  weather.uDay.value = Math.max(0.05, Math.min(1, daylight));
  weather.uTime.value = t % 1000;
  for (const m of live) m.envMapIntensity = 1.1 * weather.uDay.value;
}
