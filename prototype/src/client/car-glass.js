// Real glass in the cars' windows (5 November 2026, the owner's brief, part 2: "Every car's windscreen, side windows and
// back window must be real glass you can see through ... cut them out of the body cleanly along the painted edge (no
// ragged triangles), and draw real glass in their place, curved as the car's own glass is. The door windows belong to
// the doors and swing open with them").
//
// Each car's windows are a small picture beside its others ('<id>-windows.png', tools/vehicles/windows.py): white where
// its colour picture is painted glass. Nothing in the owner's files is changed: the car's body is drawn without what
// that picture marks (no pixel of it is drawn there, so the edge is the painted edge, smoothed, wherever the triangles
// under it run), and the same shape is drawn a second time as glass, only where the picture marks it. A door's window
// is part of the door's own shape, so it is drawn with the door and swings with it.
//
// The glass (the brief's words): "clear with a slight grey-green tint; the windscreen and the front side windows the
// clearest; the back side windows and the back window darker on the SUVs, the State Limousine and the luxury cars
// (privacy glass that still shows who sits there); the sky and the street reflected in it, more at a slant than
// straight on; a little dust along the bottom edges; ... in the rain, drops on the glass and streaks running back as
// the car moves (Medium and above)". Seen from inside as from outside (both its faces drawn).
//
//   const glass = carGlass(spec, picture, { lite, privacy })   one for each model, shared by every car of it
//   glass.body(material)          the body's own material, made to leave its glass out (once, as it is made)
//   glass.pane(geometry)          a mesh of glass for one part of the body (the whole body, the body without its doors,
//                                 a door), to be put beside that part's own mesh, where it is
//   setGlassWeather({ wet, daylight, t })   each frame: how wet the cars are, how light the sky is, the time
//   glass.dispose()

const weather = { uWet: { value: 0 }, uTime: { value: 0 }, uDay: { value: 1 } };
const live = new Set();

// The tint, and how much of what is behind the glass it lets through: face on, and at a slant (then it mostly gives
// back the sky). Privacy glass (the back of the SUVs, the limousine, the luxury cars): darker, still seen through.
export const GLASS = Object.freeze({
  tint: 0x8fa39b, clear: 0.24, privacy: 0.58, slant: 0.86, roughness: 0.035, dust: 0.22,
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

// `spec`: the car's measures (car-parts.js); `picture`: its windows picture (a THREE.Texture, its colour picture's
// layout, flipY false as theirs are); `privacy`: whether its back glass is privacy glass; `belt`: the height of the
// bottom of its side windows, in the model's units (for the dust).
export function carGlass(spec, picture, { lite = false, privacy = false, belt = null } = {}) {
  const env = typeof THREE.MeshPhysicalMaterial === 'function' && !lite;
  const make = (opacity) => {
    const options = {
      color: GLASS.tint, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      roughness: GLASS.roughness, metalness: 0, alphaMap: picture, alphaTest: opacity * 0.4,
    };
    const m = env ? new THREE.MeshPhysicalMaterial({ ...options, clearcoat: 0, ior: 1.5, specularIntensity: 1 }) : new THREE.MeshStandardMaterial(options);
    const uniforms = { uSlant: { value: GLASS.slant }, uBelt: { value: belt === null ? -1 : belt }, uDust: { value: GLASS.dust }, uDrops: { value: drops() }, ...weather };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlassAt;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassAt = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vGlassAt;
uniform float uSlant; uniform float uBelt; uniform float uDust; uniform float uWet; uniform float uTime; uniform float uDay;
uniform sampler2D uDrops;`)
        // (dust along the bottom of the side windows: lighter, rougher, a few centimetres up from the sill)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float glassDust = uBelt >= 0.0 ? (1.0 - smoothstep(uBelt, uBelt + 0.012, vGlassAt.y)) * uDust : 0.0;
roughnessFactor = mix(roughnessFactor, 0.6, glassDust);`)
        // (the glass mostly gives back the sky at a slant, and is seen through face on; dust and drops a little less
        // clear; the drops, at Medium and up, only in the rain)
        .replace('#include <opaque_fragment>', `float glassFace = abs(dot(normalize(normal), normalize(vViewPosition)));
float glassSlant = pow(1.0 - glassFace, 3.0) * uSlant;
vec2 dropAt = vec2(vGlassAt.x * 14.0 + vGlassAt.y * 3.0, vGlassAt.z * 14.0 + uTime * 0.6);
float glassDrops = uWet * texture2D(uDrops, dropAt).a;
outgoingLight = mix(outgoingLight, vec3(0.62, 0.64, 0.62) * (0.35 + 0.65 * uDay), glassDust * 0.5);
outgoingLight += glassDrops * vec3(0.55) * (0.3 + 0.7 * uDay);
diffuseColor.a = clamp(max(diffuseColor.a, glassSlant) + glassDust * 0.35 + glassDrops * 0.25, 0.0, 0.97);
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => `pcw-car-glass-${env ? 'p' : 's'}`;
    m.userData.glass = true;
    live.add(m);
    return m;
  };
  const clear = make(GLASS.clear);
  const dark = privacy ? make(GLASS.privacy) : null;
  return {
    body(material) {
      // (the body's own picture of its glass left out: the picture's white is where nothing of the body is drawn)
      material.alphaMap = picture;
      material.alphaTest = 0.5;
      const was = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        if (was) was(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `#ifdef USE_ALPHAMAP
	diffuseColor.a *= 1.0 - texture2D( alphaMap, vAlphaMapUv ).g;
#endif`);
      };
      const key = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
      material.customProgramCacheKey = () => `${key()}|pcw-glass-cut`;
      material.needsUpdate = true;
      return material;
    },
    // (the back glass darker on a car with privacy glass: the panes behind the front doors, as `behind` says, in the
    // model's units along its length)
    pane(geometry, { behind = false } = {}) {
      const mesh = new THREE.Mesh(geometry, behind && dark ? dark : clear);
      mesh.name = 'car-glass'; mesh.castShadow = false; mesh.receiveShadow = false;
      // (after the solid things, the cabin and whoever sits in it: see-through)
      mesh.renderOrder = 3;
      return mesh;
    },
    dispose() { for (const m of [clear, dark]) if (m) { live.delete(m); m.dispose(); } },
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
