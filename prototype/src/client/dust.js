// Dust on dirt roads (the owner's brief of 23 October, its third stage: "Haze in the distance, dust on dirt roads, heat
// shimmer at midday (MEDIUM+)"): the red laterite of the town's lanes and its bare ground, on a dry day,
//   - lifted by a vehicle going over it: puffs behind its wheels, growing and thinning as they drift off on the air
//     (more the faster it goes), not on tarmac, not in the rain or while the ground is wet;
//   - and in the air round the player standing or walking on it in the sun: a few motes, seen most against the light.
// Each is one set of points (two draws in all), drawn only where there is something of it to see.
//
//   const dust = createDust(scene, { lite })
//   dust.update(dt, { amount, eye, sunDir, daylight, wet, dirt(x, z), ground(x, z), movers, wind })
//     amount     the level's (0: none drawn)
//     movers     [{ key, x, z, heading, kind: 'car' | 'keke' | 'bike' | 'foot' }] (only the vehicles lift dust)
//   dust.state()  (the tests)

const PUFF_VERT = `attribute float aSize; attribute float aAlpha; uniform float pxPerMetre; varying float vAlpha; varying float vSeed;
void main() {
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	float d = max( 0.5, - mv.z );
	gl_PointSize = clamp( aSize * pxPerMetre / d, 1.0, 380.0 );
	/* (thinned close to the eye: the eye is not in the cloud, and a puff over the whole screen costs a phone dearly) */
	vAlpha = aAlpha * smoothstep( 2.2, 5.5, d ) * ( 1.0 - smoothstep( 70.0, 95.0, d ) );
	vSeed = fract( position.x * 0.37 + position.z * 0.61 );
	gl_Position = projectionMatrix * mv;
}`;
const PUFF_FRAG = `uniform vec3 colour; varying float vAlpha; varying float vSeed;
void main() {
	vec2 p = gl_PointCoord - 0.5;
	float r = length( p ) * 2.0;
	/* a soft round puff, a little lumpy */
	float lump = 0.85 + 0.15 * sin( atan( p.y, p.x ) * 3.0 + vSeed * 6.28 ) * r;
	float a = vAlpha * smoothstep( 1.0, 0.15, r / lump );
	if ( a < 0.004 ) discard;
	gl_FragColor = vec4( colour, a );
}`;
const MOTE_VERT = `attribute float aPhase; uniform float pxPerMetre; uniform float time; uniform vec3 sunDir; uniform float amount; varying float vAlpha;
void main() {
	vec4 world = modelMatrix * vec4( position, 1.0 );
	vec4 mv = viewMatrix * world;
	float d = max( 0.3, - mv.z );
	gl_PointSize = clamp( 0.045 * pxPerMetre / d, 1.0, 6.0 );
	/* seen most against the light (the sun behind them, looking towards it), and twinkling as they turn */
	float towards = max( 0.0, dot( normalize( world.xyz - cameraPosition ), sunDir ) );
	float glint = 0.55 + 0.45 * sin( time * ( 1.3 + aPhase * 2.1 ) + aPhase * 40.0 );
	vAlpha = amount * ( 0.18 + 1.1 * pow( towards, 5.0 ) ) * glint * smoothstep( 0.6, 1.6, d ) * ( 1.0 - smoothstep( 9.0, 14.0, d ) );
	gl_Position = projectionMatrix * mv;
}`;
const MOTE_FRAG = `uniform vec3 colour; varying float vAlpha;
void main() { float r = length( gl_PointCoord - 0.5 ) * 2.0; float a = vAlpha * smoothstep( 1.0, 0.3, r ); if ( a < 0.004 ) discard; gl_FragColor = vec4( colour, a ); }`;

const PUFFS = { full: 56, lite: 36 };
const MOTES = { full: 220, lite: 120 };
const KINDS = { car: { rear: 1.35, track: 1.55, every: 1.1 }, keke: { rear: 0.9, track: 1.15, every: 1.3 }, bike: { rear: 0.7, track: 0, every: 1.5 } };
const BOX = 22;                         // the motes' box round the player, metres across

export function createDust(scene, { lite = false } = {}) {
  const P = lite ? PUFFS.lite : PUFFS.full, M = lite ? MOTES.lite : MOTES.full;
  // ---- the puffs ----
  const pos = new Float32Array(P * 3), size = new Float32Array(P), alpha = new Float32Array(P);
  const puffs = Array.from({ length: P }, () => ({ live: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, a: 0 }));
  const puffGeometry = new THREE.BufferGeometry();
  puffGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  puffGeometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  puffGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const pxPerMetre = { value: 600 };
  const puffColour = { value: new THREE.Color(0.7, 0.5, 0.36) };
  const puffMaterial = new THREE.ShaderMaterial({ vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, uniforms: { pxPerMetre, colour: puffColour }, transparent: true, depthWrite: false, fog: false });
  const puffPoints = new THREE.Points(puffGeometry, puffMaterial);
  puffPoints.frustumCulled = false;
  puffPoints.renderOrder = 2;
  puffPoints.visible = false;
  scene.add(puffPoints);

  // ---- the motes ----
  const mpos = new Float32Array(M * 3), phase = new Float32Array(M);
  for (let i = 0; i < M; i += 1) { mpos[i * 3] = (Math.random() - 0.5) * BOX; mpos[i * 3 + 1] = 0.3 + Math.random() * 2.6; mpos[i * 3 + 2] = (Math.random() - 0.5) * BOX; phase[i] = Math.random(); }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(mpos, 3).setUsage(THREE.DynamicDrawUsage));
  moteGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const moteUniforms = { pxPerMetre, time: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, amount: { value: 0 }, colour: { value: new THREE.Color(1, 0.9, 0.75) } };
  const moteMaterial = new THREE.ShaderMaterial({ vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, uniforms: moteUniforms, transparent: true, depthWrite: false, fog: false });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.frustumCulled = false;
  motes.renderOrder = 2;
  motes.visible = false;
  scene.add(motes);
  let moteLevel = 0;
  const moteCentre = { x: 0, z: 0, y: 0 };

  const last = new Map();               // a vehicle's key -> { x, z, travelled, seen }
  let clock = 0, emitted = 0, alive = 0, next = 0;

  function emit(x, y, z, speed, wind) {
    // (the oldest goes when all are in the air)
    let p = puffs.find((q) => !q.live);
    if (!p) { p = puffs[next]; next = (next + 1) % P; }
    const k = Math.min(1, (speed - 2.5) / 9);
    Object.assign(p, {
      live: true, age: 0, life: 2.0 + 1.4 * Math.random() + 1.2 * k,
      x: x + (Math.random() - 0.5) * 0.5, y: y + 0.25, z: z + (Math.random() - 0.5) * 0.5,
      vx: wind.x * 0.5 + (Math.random() - 0.5) * 0.6, vy: 0.25 + Math.random() * 0.3, vz: wind.z * 0.5 + (Math.random() - 0.5) * 0.6,
      s0: 0.5 + 0.4 * k, s1: 2.2 + 2.6 * k + Math.random() * 0.8, a: 0.16 + 0.22 * k,
    });
    emitted += 1;
  }

  function update(dt, { amount = 0, eye = null, camera = null, height = 1000, sunDir = null, daylight = 1, wet = 0, dirt = () => false, ground = () => 0, movers = [], wind = { x: -1.2, z: -0.5 }, light = 1 } = {}) {
    clock += dt;
    const dry = 1 - Math.min(1, Math.max(0, (wet - 0.03) / 0.12));
    const on = amount > 0 && dry > 0;
    if (camera) pxPerMetre.value = (height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    // the colour of the dust as lit: laterite, lighter in the air, by the light of the hour
    const lit = 0.18 + 0.82 * Math.max(0, Math.min(1, light));
    puffColour.value.setRGB(0.74 * lit, 0.54 * lit, 0.4 * lit);
    // ---- puffs: lifted behind each vehicle going over dirt ----
    const seen = new Set();
    for (const m of movers) {
      const kind = KINDS[m.kind];
      if (!kind) continue;
      seen.add(m.key);
      let e = last.get(m.key);
      if (!e) { e = { x: m.x, z: m.z, travelled: 0, speed: 0 }; last.set(m.key, e); continue; }
      const step = Math.hypot(m.x - e.x, m.z - e.z);
      e.x = m.x; e.z = m.z;
      if (step > 6 || dt <= 0) { e.speed = 0; continue; }          // (carried, not driven)
      e.speed += (step / dt - e.speed) * Math.min(1, dt * 6);
      if (!on || e.speed < 2.5 || (eye && Math.hypot(m.x - eye.x, m.z - eye.z) > 90)) { e.travelled = 0; continue; }
      e.travelled += step;
      while (e.travelled >= kind.every) {
        e.travelled -= kind.every;
        const s = Math.sin(m.heading), c = Math.cos(m.heading);
        const sides = kind.track ? [-kind.track / 2, kind.track / 2] : [0];
        for (const side of sides) {
          const x = m.x - s * kind.rear + c * side, z = m.z - c * kind.rear - s * side;
          if (dirt(x, z) && Math.random() < 0.75) emit(x, ground(x, z), z, e.speed, wind);
        }
      }
    }
    for (const key of last.keys()) if (!seen.has(key)) last.delete(key);
    alive = 0;
    for (let i = 0; i < P; i += 1) {
      const p = puffs[i];
      if (p.live) {
        p.age += dt;
        if (p.age >= p.life) p.live = false;
      }
      if (!p.live) { size[i] = 0; alpha[i] = 0; continue; }
      alive += 1;
      const t = p.age / p.life;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - dt * 0.6; p.vz *= 1 - dt * 0.6; p.vy *= 1 - dt * 0.4;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      size[i] = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      alpha[i] = p.a * amount * dry * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    puffPoints.visible = alive > 0;
    if (alive) { for (const name of ['position', 'aSize', 'aAlpha']) puffGeometry.attributes[name].needsUpdate = true; }

    // ---- motes: round the player on dirt in the sun ----
    const sunny = Math.max(0, Math.min(1, daylight));
    const here = eye && dirt(eye.x, eye.z) ? 1 : 0;
    moteLevel += ((on ? here * sunny * dry : 0) - moteLevel) * Math.min(1, dt * 0.8);
    motes.visible = moteLevel > 0.02 && !!eye;
    if (motes.visible) {
      if (Math.hypot(eye.x - moteCentre.x, eye.z - moteCentre.z) > 60) { moteCentre.x = eye.x; moteCentre.z = eye.z; }
      // (each drifts on the air, slowly, and comes round to the other side of the box when it leaves it)
      const g = ground(eye.x, eye.z);
      moteCentre.y += (g - moteCentre.y) * Math.min(1, dt * 2);
      for (let i = 0; i < M; i += 1) {
        const ph = phase[i] * 6.283;
        let x = mpos[i * 3] + (wind.x * 0.25 + Math.sin(clock * 0.31 + ph) * 0.12) * dt;
        let y = mpos[i * 3 + 1] + Math.sin(clock * 0.47 + ph * 1.7) * 0.05 * dt;
        let z = mpos[i * 3 + 2] + (wind.z * 0.25 + Math.cos(clock * 0.27 + ph) * 0.12) * dt;
        const rx = x - (eye.x - moteCentre.x), rz = z - (eye.z - moteCentre.z);
        if (rx > BOX / 2) x -= BOX; else if (rx < -BOX / 2) x += BOX;
        if (rz > BOX / 2) z -= BOX; else if (rz < -BOX / 2) z += BOX;
        if (y > 3.2) y = 0.3; else if (y < 0.2) y = 3.0;
        mpos[i * 3] = x; mpos[i * 3 + 1] = y; mpos[i * 3 + 2] = z;
      }
      motes.position.set(moteCentre.x, moteCentre.y, moteCentre.z);
      moteGeometry.attributes.position.needsUpdate = true;
      moteUniforms.time.value = clock;
      moteUniforms.amount.value = moteLevel * amount * 0.55;
      if (sunDir) moteUniforms.sunDir.value.copy(sunDir).normalize();
      moteUniforms.colour.value.setRGB(1.0 * lit, 0.88 * lit, 0.72 * lit);
    }
  }
  return {
    update,
    state: () => ({ puffs: alive, emitted, motes: motes.visible ? +moteLevel.toFixed(2) : 0, drawn: (puffPoints.visible ? 1 : 0) + (motes.visible ? 1 : 0) }),
  };
}
