// The beam of a phone's torch as others see it (20 October 2026, the owner's brief: "others see your beam").
//
// The player's own torch is a real lamp (main.js: the one lamp the headlamps use). Every other player's is drawn: a
// soft cone of light in the night air from the back of their phone, brightest at the phone and fading along its
// length and toward its edges, and a pool of light on the ground where it falls. A light of their own for each would
// have every surface in sight worked out again for each one, every frame; a phone could not keep that up.
//
//   const beams = createTorchBeams(scene, { lite });
//   beams.update([{ key, from: Vector3, dir: Vector3, ground: y }], night)     each frame: the torches that are on
//   beams.dispose()

const LENGTH = 11;         // metres: how far the beam is seen to reach
const SPREAD = 0.42;       // radians: half the cone's width

function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { strength: { value: 0 }, colour: { value: new THREE.Color(0.95, 0.96, 1.0) } },
    vertexShader: `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = position.z / ${LENGTH.toFixed(1)};
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float strength;
      uniform vec3 colour;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        /* brightest by the phone, fading along the beam; soft at its edges (where the cone is seen side-on it is thin) */
        float along = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.6);
        float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.5);
        gl_FragColor = vec4(colour * strength * along * edge * 0.22, 1.0);
      }`,
  });
}
function poolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createTorchBeams(scene, { lite = false } = {}) {
  const MOST = lite ? 4 : 8;
  // the cone: its point at the phone, opening along +z
  const cone = new THREE.ConeGeometry(Math.tan(SPREAD) * LENGTH, LENGTH, lite ? 14 : 22, 1, true);
  cone.translate(0, -LENGTH / 2, 0); cone.rotateX(-Math.PI / 2);
  const disc = new THREE.PlaneGeometry(1, 1); disc.rotateX(-Math.PI / 2);
  const poolMap = poolTexture();
  const pool = [];
  for (let i = 0; i < MOST; i += 1) {
    const material = beamMaterial();
    const beam = new THREE.Mesh(cone, material);
    beam.name = 'torch-beam'; beam.visible = false; beam.renderOrder = 3; beam.frustumCulled = false;
    const patch = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ map: poolMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xf2f4ff, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false, toneMapped: false }));
    patch.name = 'torch-pool'; patch.visible = false; patch.renderOrder = 2;
    scene.add(beam, patch);
    pool.push({ beam, patch, material });
  }
  const look = new THREE.Vector3(), hit = new THREE.Vector3();
  let shown = 0;
  function update(list, night) {
    shown = 0;
    // (by day a torch is hardly seen: the beam shows as the light goes)
    const k = 0.15 + 0.85 * Math.max(0, Math.min(1, night));
    for (let i = 0; i < MOST; i += 1) {
      const slot = pool[i], t = list[i];
      if (!t) { slot.beam.visible = false; slot.patch.visible = false; continue; }
      slot.beam.position.copy(t.from);
      slot.beam.lookAt(look.copy(t.from).add(t.dir));
      slot.material.uniforms.strength.value = k * (t.self ? 0.45 : 1);
      slot.beam.visible = true;
      // where the beam meets the ground: a pool of light, longer the flatter the beam falls
      const down = -t.dir.y;
      if (down > 0.05) {
        const reach = Math.min(LENGTH * 1.2, (t.from.y - t.ground) / down);
        hit.copy(t.from).addScaledVector(t.dir, reach);
        slot.patch.position.set(hit.x, t.ground + 0.03, hit.z);
        const width = Math.max(1.2, Math.tan(SPREAD) * reach * 2);
        slot.patch.scale.set(width, 1, width / Math.max(0.35, down));
        slot.patch.rotation.y = Math.atan2(t.dir.x, t.dir.z);
        slot.patch.material.opacity = k * 0.5 * Math.max(0.25, 1 - reach / (LENGTH * 1.2));
        slot.patch.visible = true;
      } else slot.patch.visible = false;
      shown += 1;
    }
  }
  return {
    update,
    get shown() { return shown; },
    dispose() { for (const s of pool) { scene.remove(s.beam, s.patch); s.material.dispose(); s.patch.material.dispose(); } cone.dispose(); disc.dispose(); poolMap.dispose(); },
  };
}
