// What a round fired is seen to do (25 October 2026, the owner's brief: "Show a brief muzzle flash at the correct muzzle
// position. Add a short-lived, properly oriented gunshot effect ... Add subtle casing ejection ... a clear but restrained
// visual distinction between hitting an enemy and hitting an environmental object"; and of 22 October: "realistic blood:
// a spray where the bullet hits ... and drops on the ground that fade after a while. Keep it light on phones").
//
//   flash     at the muzzle, along the barrel: a star of fire across it and a tongue of it ahead, for a few hundredths
//             of a second, and the light of it on what is ahead of it (`lamp`: the town's own lamp for a vehicle's
//             headlamps and the torch, main.js, which none of them uses while a gun is out; a lamp of its own, always
//             in the scene, would be one more light worked out for every pixel of everything at every hour: 25 October
//             2026, measured, a frame a little longer and every surface's program larger to prepare)
//   streak    each round's path, a short bright streak travelling from the muzzle to where it stops
//   strike    where it stops: a puff of dust and grit off a wall or the ground (and a dark mark on the ground), sparks off
//             a vehicle, and off someone, a spray of blood (a red mist, drops thrown on, which fall and leave spots)
//   cases     the spent cases thrown from the port to the right, spinning, bouncing once on the ground and lying a moment
//   magazine  dropped in a reload: it falls, tumbling, and lies a while
// Everything is drawn from a few shared things made once (one draw for all the sparks, one for all the cases and so
// on), each with a fixed most at once: nothing is made or let go as rounds are fired. A phone has fewer of each.

const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

function canvasTexture(size, paint) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// a star of fire: a hot middle and four to six uneven points
const flashPicture = () => canvasTexture(128, (g, n) => {
  const c = n / 2;
  const glow = g.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,250,225,1)'); glow.addColorStop(0.18, 'rgba(255,214,120,0.95)'); glow.addColorStop(0.45, 'rgba(255,140,40,0.35)'); glow.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = glow; g.fillRect(0, 0, n, n);
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + (k % 2) * 0.2, len = c * (k % 2 ? 0.62 : 0.95);
    g.save(); g.translate(c, c); g.rotate(a);
    const ray = g.createLinearGradient(0, 0, len, 0);
    ray.addColorStop(0, 'rgba(255,240,200,0.9)'); ray.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = ray; g.beginPath(); g.moveTo(0, -c * 0.07); g.lineTo(len, 0); g.lineTo(0, c * 0.07); g.closePath(); g.fill();
    g.restore();
  }
});
// the tongue of fire ahead of the muzzle, seen from the side: long, hot at its root
const tonguePicture = () => canvasTexture(128, (g, n) => {
  const grad = g.createLinearGradient(0, 0, n, 0);
  grad.addColorStop(0, 'rgba(255,245,215,1)'); grad.addColorStop(0.35, 'rgba(255,190,90,0.85)'); grad.addColorStop(1, 'rgba(255,110,30,0)');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(0, n * 0.5); g.quadraticCurveTo(n * 0.3, n * 0.18, n, n * 0.5); g.quadraticCurveTo(n * 0.3, n * 0.82, 0, n * 0.5); g.fill();
});
// a soft round puff, white (dust and smoke are tinted by the sprite's colour)
const puffPicture = () => canvasTexture(64, (g, n) => {
  const c = n / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, n, n);
});

export const FX_MOST = Object.freeze({
  full: Object.freeze({ flashes: 6, streaks: 32, puffs: 36, sparks: 120, drops: 160, spots: 140, marks: 60, cases: 48 }),
  lite: Object.freeze({ flashes: 4, streaks: 16, puffs: 16, sparks: 48, drops: 60, spots: 60, marks: 30, cases: 16 }),
});

// `drawn`: how many times the picture has been drawn so far (the renderer's own count, main.js): a flash is seen whole the
// first time it is drawn, however long that frame takes, and only then dies away by the clock. (Timed from when it was
// made, a phone at thirty frames a second drew it once at a third of its strength, and a slow one not at all: 26
// October 2026.) Without it, the effects' own count of their updates.
export function createGunFx(scene, { lite = false, ground = () => 0, light = true, drawn = null } = {}) {
  const most = FX_MOST[lite ? 'lite' : 'full'];
  let updates = 0;
  const frameNow = typeof drawn === 'function' ? drawn : () => updates;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const stats = { flashes: 0, streaks: 0, strikes: 0, blood: 0, cases: 0 };

  // ---- the flash ----
  const flashMap = flashPicture(), tongueMap = tonguePicture(), puffMap = puffPicture();
  const flashes = [];
  for (let i = 0; i < most.flashes; i += 1) {
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashMap, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    // the tongue: two planes crossed along the barrel, so that it is seen from any side
    const tongue = new THREE.Group();
    for (const turn of [0, Math.PI / 2]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.32), new THREE.MeshBasicMaterial({ map: tongueMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      plane.position.x = 0.5; plane.rotation.x = turn;
      tongue.add(plane);
    }
    star.visible = false; tongue.visible = false;
    scene.add(star, tongue);
    flashes.push({ star, tongue, age: 1, life: 0.05, size: 1, frame: -1 });
  }
  let nextFlash = 0;
  // (the flash's light: where it is, the way it shines, and how long since it was first drawn; lit by main.js with the
  // town's own lamp)
  const lampAt = new THREE.Vector3(), lampDir = new THREE.Vector3(0, 0, 1);
  let lampAge = 1, lampFrame = -1;
  // a flash at its whole strength, as it is first drawn
  const flashLook = (f, k) => {
    const s = (0.22 + 0.1 * Math.random()) * f.size * (0.6 + 0.4 * k);
    f.star.scale.set(s, s, s);
    f.star.material.opacity = k;
    f.tongue.scale.set(0.34 * f.size * (0.7 + 0.5 * Math.random()), 0.5 * f.size, 0.5 * f.size);
    for (const c of f.tongue.children) c.material.opacity = k;
  };

  // ---- the streaks: thin bright rods, stretched along the way each round goes ----
  const rod = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  rod.rotateZ(-Math.PI / 2);          // along +x
  rod.translate(0.5, 0, 0);           // from its back end
  const streakMesh = new THREE.InstancedMesh(rod, new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), most.streaks);
  streakMesh.frustumCulled = false; streakMesh.count = 0; streakMesh.visible = false;
  scene.add(streakMesh);
  const streaks = [];

  // ---- puffs (dust, grit, blood mist, smoke at the muzzle) ----
  const puffs = [];
  for (let i = 0; i < most.puffs; i += 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffMap, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s);
    puffs.push({ sprite: s, age: 1, life: 1, from: 0.1, to: 0.5, rise: 0, vx: 0, vy: 0, vz: 0, alpha: 0.6 });
  }
  let nextPuff = 0;
  function puff(at, colour, { size = 0.25, grow = 3, life = 0.6, alpha = 0.6, rise = 0.3, v = null } = {}) {
    const p = puffs[nextPuff]; nextPuff = (nextPuff + 1) % puffs.length;
    p.sprite.position.copy(at); p.sprite.material.color.setHex(colour); p.sprite.material.rotation = Math.random() * 6.28;
    p.age = 0; p.life = life; p.from = size; p.to = size * grow; p.rise = rise; p.alpha = alpha;
    p.vx = v ? v.x : 0; p.vy = v ? v.y : 0; p.vz = v ? v.z : 0;
    p.sprite.visible = true;
  }

  // ---- small things thrown: sparks, grit, blood drops (one draw each) ----
  // (each kept out of the picture while it has none to draw: drawn with none, it still cost a draw's setting up each
  // frame, and its list was sent to the graphics card again: 26 October 2026, six more draws a frame at the habitation)
  const bits = (count, geometry, material) => { const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; scene.add(mesh); return { mesh, list: [] }; };
  const sparks = bits(most.sparks, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }));
  const drops = bits(most.drops, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const BLOOD = new THREE.Color(0x6e0710), GRIT = new THREE.Color();
  // spots of blood dried on the ground, and the marks rounds leave in it: flat discs, each fading
  const disc = new THREE.CircleGeometry(1, 10); disc.rotateX(-Math.PI / 2);
  const spotMaterial = new THREE.MeshBasicMaterial({ color: 0x4a050a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const spots = bits(most.spots, disc, spotMaterial);
  const marks = bits(most.marks, disc, new THREE.MeshBasicMaterial({ color: 0x1c1712, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // spent cases: brass
  const caseGeometry = new THREE.CylinderGeometry(0.0052, 0.0052, 0.045, 6); caseGeometry.rotateZ(Math.PI / 2);
  const cases = bits(most.cases, caseGeometry, new THREE.MeshStandardMaterial({ color: 0xb98a3e, metalness: 0.85, roughness: 0.35 }));

  const add = (pool, item, max) => { if (pool.list.length >= max) pool.list.shift(); pool.list.push(item); };

  // A round fired: its flash at the muzzle (`at`, the barrel's way `dir`); `near`: the player's own or close by (its
  // light thrown on what is round it).
  function flash(at, dir, { near = false, size = 1 } = {}) {
    const f = flashes[nextFlash]; nextFlash = (nextFlash + 1) % flashes.length;
    f.age = 0; f.life = 0.045 + Math.random() * 0.02; f.size = size * (0.85 + Math.random() * 0.35); f.frame = frameNow();
    f.star.position.copy(at).addScaledVector(dir, 0.03);
    f.star.material.rotation = Math.random() * 6.28;
    f.tongue.position.copy(at);
    Q.setFromUnitVectors(X, A.copy(dir).normalize());
    f.tongue.quaternion.copy(Q);
    f.tongue.rotateX(Math.random() * 3.14);
    f.star.visible = true; f.tongue.visible = true;
    flashLook(f, 1);
    if (light && near) { lampAt.copy(at).addScaledVector(dir, 0.2); lampDir.copy(dir).normalize(); lampAge = 0; lampFrame = frameNow(); }
    // a breath of smoke from the muzzle, drifting
    if (!lite || near) puff(at, 0xb9b4ac, { size: 0.06, grow: 6, life: 0.7, alpha: 0.18, rise: 0.25, v: A.copy(dir).multiplyScalar(0.8) });
    stats.flashes += 1;
    last.flash = [at.x, at.y, at.z];
  }
  const last = { flash: null };

  // A round's path, from the muzzle to where it stopped.
  function streak(from, to) {
    const length = from.distanceTo(to);
    if (length < 0.5) return;
    add({ list: streaks }, { from: from.clone(), dir: to.clone().sub(from).normalize(), length, at: 0, speed: 380, size: 0.009 + Math.random() * 0.004 }, most.streaks);
    stats.streaks += 1;
  }

  // Where a round stopped, and what it struck: 'wall', 'ground', 'vehicle', 'person' (`dir`: the way it was going).
  function strike(what, at, dir, { calm = false } = {}) {
    stats.strikes += 1;
    const back = A.copy(dir).normalize().multiplyScalar(-1);
    if (what === 'person') { blood(at, dir, { calm }); return; }
    if (what === 'air') return;
    if (what === 'vehicle') {
      // sparks off the metal, and a little grey dust
      const n = lite ? 5 : 10;
      for (let i = 0; i < n; i += 1) add(sparks, { p: at.clone(), v: back.clone().multiplyScalar(2 + Math.random() * 4).add(B.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(4)), age: 0, life: 0.15 + Math.random() * 0.2, size: 0.008 }, most.sparks);
      puff(at, 0x9a9a98, { size: 0.05, grow: 4, life: 0.35, alpha: 0.35, rise: 0.1 });
      return;
    }
    // a wall or the ground: dust and grit, the colour of what it struck
    const earth = what === 'ground' ? 0x9b7b5b : 0xb3aa9c;
    puff(at, earth, { size: 0.07, grow: 5, life: 0.7, alpha: 0.55, rise: 0.25, v: back.clone().multiplyScalar(0.6) });
    if (!lite) puff(at, earth, { size: 0.04, grow: 3, life: 0.4, alpha: 0.7, rise: 0.1, v: back.clone().multiplyScalar(1.4) });
    const n = lite ? 3 : 7;
    for (let i = 0; i < n; i += 1) add(drops, { p: at.clone(), v: back.clone().multiplyScalar(1.5 + Math.random() * 2.5).add(B.set(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).multiplyScalar(2.2)), age: 0, life: 0.6, size: 0.006 + Math.random() * 0.006, grit: true, colour: earth }, most.drops);
    if (what === 'ground') add(marks, { p: at.clone().setY(ground(at.x, at.z) + 0.012), size: 0.03 + Math.random() * 0.015, age: 0, life: 40, turn: Math.random() * 6.28 }, most.marks);
  }

  // Blood where a round struck someone: a red mist where it went in, drops thrown on the way it was going and down,
  // falling and leaving spots on the ground that dry and fade (calm: less of it, for the setting that softens it).
  function blood(at, dir, { calm = false, amount = 1 } = {}) {
    stats.blood += 1;
    const on = A.copy(dir).normalize();
    puff(at, 0x8a0b14, { size: 0.08, grow: calm ? 2.5 : 4, life: calm ? 0.35 : 0.6, alpha: calm ? 0.35 : 0.6, rise: -0.05, v: on.clone().multiplyScalar(0.7) });
    const n = Math.round((calm ? 3 : lite ? 6 : 14) * amount);
    for (let i = 0; i < n; i += 1) {
      const v = on.clone().multiplyScalar(1 + Math.random() * 2.2).add(B.set(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).multiplyScalar(2));
      add(drops, { p: at.clone(), v, age: 0, life: 2.5, size: 0.006 + Math.random() * 0.008, blood: true }, most.drops);
    }
  }

  // A spent case from the port (`at`), thrown out to the gun's right (`right`) and up, spinning.
  function eject(at, right, up) {
    const v = right.clone().multiplyScalar(1.6 + Math.random() * 0.9).addScaledVector(up, 1.2 + Math.random() * 0.8);
    add(cases, { p: at.clone(), v, age: 0, life: 2.2, spin: new THREE.Vector3(Math.random() * 30, Math.random() * 30, Math.random() * 30), turn: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3), bounced: 0 }, most.cases);
    stats.cases += 1;
  }

  // A magazine let fall in a reload: a copy of the gun's own, falling and tumbling, lying a while.
  const fallen = [];
  function dropMagazine(mag, at, quaternion, scale) {
    if (!mag || !mag.geometry) return;
    if (fallen.length >= (lite ? 1 : 3)) { const old = fallen.shift(); scene.remove(old.mesh); }
    const mesh = new THREE.Mesh(mag.geometry, mag.material);
    mesh.position.copy(at); mesh.quaternion.copy(quaternion); mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    scene.add(mesh);
    fallen.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.5, (Math.random() - 0.5) * 0.4), spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), age: 0, lie: false });
  }

  function update(dt) {
    // flashes
    const now = frameNow();
    for (const f of flashes) {
      if (f.age >= f.life) { if (f.star.visible) { f.star.visible = false; f.tongue.visible = false; } continue; }
      // (not yet drawn: drawn whole, this once; then dying away by the clock)
      if (f.frame === now) continue;
      f.age += dt;
      if (f.age >= f.life) { f.star.visible = false; f.tongue.visible = false; continue; }
      flashLook(f, 1 - f.age / f.life);
    }
    if (light && lampFrame !== now) lampAge += dt;
    updates += 1;
    // streaks: a short rod moving along its path
    let n = 0;
    for (let i = streaks.length - 1; i >= 0; i -= 1) {
      const s = streaks[i];
      s.at += s.speed * dt;
      if (s.at - 2.4 > s.length) { streaks.splice(i, 1); continue; }
      const head = Math.min(s.length, s.at), tail = Math.max(0, s.at - 2.4);
      if (head - tail < 0.02) continue;
      P.copy(s.from).addScaledVector(s.dir, tail);
      Q.setFromUnitVectors(X, s.dir);
      S.set(head - tail, s.size, s.size);
      M.compose(P, Q, S);
      streakMesh.setMatrixAt(n, M); n += 1;
    }
    streakMesh.count = n; streakMesh.visible = n > 0; if (n) streakMesh.instanceMatrix.needsUpdate = true;
    // puffs
    for (const p of puffs) {
      if (p.age >= p.life) { if (p.sprite.visible) p.sprite.visible = false; continue; }
      p.age += dt;
      const u = p.age / p.life;
      const size = p.from + (p.to - p.from) * smooth(Math.sqrt(u));
      p.sprite.scale.set(size, size, size);
      p.sprite.position.x += p.vx * dt; p.sprite.position.y += (p.vy + p.rise) * dt; p.sprite.position.z += p.vz * dt;
      p.vx *= Math.exp(-dt * 3); p.vy *= Math.exp(-dt * 3); p.vz *= Math.exp(-dt * 3);
      p.sprite.material.opacity = p.alpha * (1 - u) * Math.min(1, u * 12 + 0.3);
    }
    // sparks
    n = 0;
    for (let i = sparks.list.length - 1; i >= 0; i -= 1) {
      const s = sparks.list[i];
      s.age += dt;
      if (s.age > s.life) { sparks.list.splice(i, 1); continue; }
      s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
      Q.setFromUnitVectors(X, A.copy(s.v).normalize());
      S.set(Math.max(0.02, s.v.length() * 0.012), s.size, s.size);
      M.compose(s.p, Q, S);
      sparks.mesh.setMatrixAt(n, M); n += 1;
    }
    sparks.mesh.count = n; sparks.mesh.visible = n > 0; if (n) sparks.mesh.instanceMatrix.needsUpdate = true;
    // drops of blood and grit: thrown, falling; blood leaves a spot where it lands
    n = 0;
    for (let i = drops.list.length - 1; i >= 0; i -= 1) {
      const d = drops.list[i];
      d.age += dt;
      d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
      const g = ground(d.p.x, d.p.z);
      if (d.p.y <= g + 0.01 || d.age > d.life) {
        if (d.blood && d.p.y <= g + 0.05) add(spots, { p: d.p.clone().setY(g + 0.014), size: d.size * (2.4 + Math.random() * 2.5), age: 0, life: lite ? 60 : 120, turn: Math.random() * 6.28 }, most.spots);
        drops.list.splice(i, 1); continue;
      }
      S.setScalar(d.size);
      M.compose(d.p, Q.identity(), S);
      drops.mesh.setMatrixAt(n, M);
      drops.mesh.setColorAt(n, d.blood ? BLOOD : GRIT.setHex(d.colour || 0x8a7a66));
      n += 1;
    }
    drops.mesh.count = n; drops.mesh.visible = n > 0;
    if (n) { drops.mesh.instanceMatrix.needsUpdate = true; if (drops.mesh.instanceColor) drops.mesh.instanceColor.needsUpdate = true; }
    // spots and marks on the ground: drying and fading (shrunk away at the end of their time)
    for (const pool of [spots, marks]) {
      n = 0;
      for (let i = pool.list.length - 1; i >= 0; i -= 1) {
        const s = pool.list[i];
        s.age += dt;
        if (s.age > s.life) { pool.list.splice(i, 1); continue; }
        const fade = 1 - smooth((s.age - s.life * 0.6) / (s.life * 0.4));
        Q.setFromAxisAngle(Y, s.turn);
        S.set(s.size * (0.6 + 0.4 * fade), 1, s.size * (0.6 + 0.4 * fade) * 0.8);
        M.compose(s.p, Q, S);
        pool.mesh.setMatrixAt(n, M); n += 1;
      }
      pool.mesh.count = n; pool.mesh.visible = n > 0; if (n) pool.mesh.instanceMatrix.needsUpdate = true;
    }
    // cases: flying, bouncing once, lying, then gone
    n = 0;
    for (let i = cases.list.length - 1; i >= 0; i -= 1) {
      const c = cases.list[i];
      c.age += dt;
      if (c.age > c.life) { cases.list.splice(i, 1); continue; }
      const g = ground(c.p.x, c.p.z) + 0.006;
      if (c.p.y > g || c.v.y > 0) {
        c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
        c.turn.x += c.spin.x * dt; c.turn.y += c.spin.y * dt; c.turn.z += c.spin.z * dt;
        if (c.p.y <= g) { c.p.y = g; if (c.bounced < 1 && c.v.y < -0.8) { c.bounced += 1; c.v.multiplyScalar(0.35); c.v.y = -c.v.y; c.spin.multiplyScalar(0.4); } else { c.v.set(0, 0, 0); c.turn.x = Math.PI / 2 * Math.round(c.turn.x / (Math.PI / 2)); } }
      }
      Q.setFromEuler(c.turn);
      const k = c.age > c.life - 0.4 ? (c.life - c.age) / 0.4 : 1;
      S.setScalar(Math.max(0.001, k));
      M.compose(c.p, Q, S);
      cases.mesh.setMatrixAt(n, M); n += 1;
    }
    cases.mesh.count = n; cases.mesh.visible = n > 0; if (n) cases.mesh.instanceMatrix.needsUpdate = true;
    // dropped magazines
    for (let i = fallen.length - 1; i >= 0; i -= 1) {
      const f = fallen[i];
      f.age += dt;
      if (f.age > 9) { scene.remove(f.mesh); fallen.splice(i, 1); continue; }
      if (f.lie) continue;
      f.v.y -= 9.8 * dt;
      f.mesh.position.addScaledVector(f.v, dt);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; f.mesh.rotation.z += f.spin.z * dt;
      const g = ground(f.mesh.position.x, f.mesh.position.z) + 0.02;
      if (f.mesh.position.y <= g) { f.mesh.position.y = g; f.lie = true; f.mesh.rotation.set(0, f.mesh.rotation.y, Math.PI / 2); }
    }
  }

  // Everything still in the air or on the ground let go at once (a player left, the town was left).
  function clear() {
    for (const f of flashes) { f.age = f.life; f.star.visible = false; f.tongue.visible = false; }
    streaks.length = 0;
    for (const p of puffs) { p.age = p.life; p.sprite.visible = false; }
    for (const pool of [sparks, drops, spots, marks, cases]) { pool.list.length = 0; pool.mesh.count = 0; pool.mesh.visible = false; }
    streakMesh.count = 0; streakMesh.visible = false;
    for (const f of fallen) scene.remove(f.mesh);
    fallen.length = 0;
  }

  return {
    flash, streak, strike, blood, eject, dropMagazine, update, clear, stats,
    // the flash's light just now, for main.js to give the town's lamp: where, which way, how strong (null: none)
    get lamp() { return light && lampAge < 0.06 ? { at: lampAt, dir: lampDir, intensity: 14 * (1 - lampAge / 0.06) } : null; },
    // (for the tests: where the last flash was, and how much is under way)
    last,
    get busy() { return { streaks: streaks.length, sparks: sparks.list.length, drops: drops.list.length, spots: spots.list.length, marks: marks.list.length, cases: cases.list.length, puffs: puffs.filter((p) => p.age < p.life).length, flashes: flashes.filter((f) => f.age < f.life).length, magazines: fallen.length }; },
  };
}
