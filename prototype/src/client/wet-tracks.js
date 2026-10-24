// Wet footprints and tyre marks after rain (one of the owner's extras of 24 October, for the third stage of his brief):
// while the ground is wet, in the rain and as it dries after it, whoever walks leaves dark footprints, left and right,
// and every vehicle the lines of its wheels; each fades as the ground dries and the next rain washes it out. Two sets of
// marks laid on the ground (two draws), darkening it where they lie, drawn only while there are any, at Medium and up.
//
//   const tracks = createWetTracks(scene, { lite })
//   tracks.update(dt, { amount, wet, raining, ground(x, z), movers, eye })
//     amount   the level's (0: none)
//     wet      how wet the ground is (render-finish.js: 1 in the rain, drying slowly after it)
//     movers   [{ key, x, z, heading, kind: 'foot' | 'car' | 'keke' | 'bike' }]
//   tracks.state()  (the tests)

const VERT = `attribute float aFade; varying vec2 vUv; varying float vFade;
void main() {
	vUv = uv; vFade = aFade;
	gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}`;
// (the ground under a mark darkened by as much as the mark holds: the colour drawn is never seen, only its alpha)
const FRAG = `uniform sampler2D map; uniform float strength; varying vec2 vUv; varying float vFade;
void main() { float a = texture2D( map, vUv ).a * vFade * strength; if ( a < 0.004 ) discard; gl_FragColor = vec4( 0.0, 0.0, 0.0, a ); }`;

// a shoe's sole (the right foot; the left is the same turned over), and a tyre's tread
function sole() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(16.5, 20, 10.5, 17, 0.08, 0, Math.PI * 2); g.fill();                 // the ball and toes
  g.beginPath(); g.ellipse(15, 50, 8, 10.5, 0, 0, Math.PI * 2); g.fill();                        // the heel
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 8; y < 60; y += 6) g.fillRect(4, y, 24, 2);                                      // its grip
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
function tread() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 16, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.2, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.8, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 32);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let y = 0; y < 32; y += 8) { g.beginPath(); g.moveTo(2, y); g.lineTo(14, y + 3); g.lineTo(14, y + 5); g.lineTo(2, y + 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

const LIFE = { foot: 30, wheel: 45 };          // seconds a mark lasts on drying ground (less while it rains)
const KINDS = { car: { rear: 1.35, track: 1.55, width: 0.2 }, keke: { rear: 0.9, track: 1.15, width: 0.15 }, bike: { rear: 0.7, track: 0, width: 0.11 } };

export function createWetTracks(scene, { lite = false } = {}) {
  const make = (count, map, w, h) => {
    // (lying on the ground, its length along the way it was going: +z, as a heading of 0 is)
    const geometry = new THREE.PlaneGeometry(w, h);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI);
    const fade = new Float32Array(count);
    geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { map: { value: map }, strength: { value: 0 } },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      // (darkening: what is there times one less the mark's alpha)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    return { mesh, fade, born: new Float32Array(count), life: new Float32Array(count), next: 0, used: 0 };
  };
  const feet = make(lite ? 220 : 400, sole(), 0.13, 0.28);
  const wheels = make(lite ? 260 : 480, tread(), 1, 1);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const last = new Map();               // a walker's or vehicle's key -> where its last mark was
  let clock = 0, laid = 0;

  function lay(set, x, y, z, heading, width, length, flip, life) {
    const i = set.next;
    set.next = (set.next + 1) % set.fade.length;
    set.used = Math.min(set.fade.length, set.used + 1);
    q.setFromAxisAngle(up, heading);
    s.set(flip ? -width : width, 1, length);
    m.compose(p.set(x, y + 0.02, z), q, s);
    set.mesh.setMatrixAt(i, m);
    set.born[i] = clock; set.life[i] = life;
    set.mesh.instanceMatrix.needsUpdate = true;
    laid += 1;
  }

  function update(dt, { amount = 0, wet = 0, raining = 0, ground = () => 0, movers = [], eye = null } = {}) {
    clock += dt;
    // marks are left while the ground is wet: most as it dries after the rain, washed out quickly while it pours
    const leaving = amount > 0 && wet > 0.12;
    const life = raining > 0.05 ? 0.35 : 1;
    const seen = new Set();
    for (const w of movers) {
      seen.add(w.key);
      let e = last.get(w.key);
      if (!e) { last.set(w.key, { x: w.x, z: w.z, left: false, l: null, r: null }); continue; }
      const step = Math.hypot(w.x - e.x, w.z - e.z);
      if (step > 6 || !leaving || (eye && Math.hypot(w.x - eye.x, w.z - eye.z) > 70)) { e.x = w.x; e.z = w.z; e.l = e.r = null; continue; }
      const sn = Math.sin(w.heading), cs = Math.cos(w.heading);
      if (w.kind === 'foot') {
        // a print each stride, left and right in turn, a hand's width either side of the way
        if (step < 0.72) continue;
        e.x = w.x; e.z = w.z; e.left = !e.left;
        const side = e.left ? 0.1 : -0.1;
        const x = w.x + cs * side, z = w.z - sn * side;
        lay(feet, x, ground(x, z), z, w.heading, 1, 1, e.left, LIFE.foot * life);
        continue;
      }
      const kind = KINDS[w.kind];
      if (!kind) continue;
      if (step < 0.45) continue;
      // each rear wheel's line: from where it was to where it is
      const wheelsNow = kind.track ? [-kind.track / 2, kind.track / 2] : [0];
      const now = wheelsNow.map((side) => ({ x: w.x - sn * kind.rear + cs * side, z: w.z - cs * kind.rear - sn * side }));
      const before = [e.l, e.r];
      now.forEach((at, k) => {
        const from = before[k];
        if (from) {
          const dx = at.x - from.x, dz = at.z - from.z, len = Math.hypot(dx, dz);
          if (len > 0.05 && len < 3) {
            const mx = (at.x + from.x) / 2, mz = (at.z + from.z) / 2;
            lay(wheels, mx, ground(mx, mz), mz, Math.atan2(dx, dz), kind.width, len + 0.04, false, LIFE.wheel * life);
          }
        }
      });
      e.l = now[0]; e.r = now[1] || null;
      e.x = w.x; e.z = w.z;
    }
    for (const key of last.keys()) if (!seen.has(key)) last.delete(key);
    // each mark fades as it ages (and all of them as the ground dries)
    const dryness = Math.max(0, Math.min(1, (wet - 0.05) / 0.35));
    for (const set of [feet, wheels]) {
      let any = 0;
      for (let i = 0; i < set.used; i += 1) {
        const age = clock - set.born[i], t = set.life[i] > 0 ? age / set.life[i] : 1;
        const f = t >= 1 ? 0 : Math.min(1, age * 4) * (1 - t * t);
        set.fade[i] = f;
        if (f > 0) any += 1;
      }
      set.mesh.count = set.used;
      set.mesh.visible = any > 0 && amount > 0;
      if (set.mesh.visible) set.mesh.geometry.attributes.aFade.needsUpdate = true;
      set.mesh.material.uniforms.strength.value = amount * (0.32 + 0.2 * dryness) * (set === feet ? 1 : 0.85);
    }
  }
  return {
    update,
    state: () => ({ feet: feet.mesh.visible ? feet.used : 0, wheels: wheels.mesh.visible ? wheels.used : 0, laid }),
  };
}
