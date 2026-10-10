// Blood on the ground: under someone a vehicle has struck, a pool that spreads while they lie there, more the
// harder and the more often they were hit, with drops falling from them while the wound is fresh. A pool is
// left behind when they get up or are taken away, and dries and fades over a minute or two.
//
// What is drawn here follows the simulation's list of who is bleeding and how much (impact.bleeding in
// src/sim/impact.js); nothing here decides who was hurt.

const MOST_POOLS = 24;
const DROPS = 72;
const FADE = 90;                 // seconds a pool takes to fade once nobody lies in it

// an uneven round shape, the same for the same person every time
function poolGeometry(seed) {
  const g = new THREE.CircleGeometry(1, 28);
  const pos = g.attributes.position;
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const lobes = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  for (let i = 1; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i);
    const a = Math.atan2(y, x);
    const k = 0.78 + 0.16 * Math.sin(a * 3 + lobes[0]) + 0.1 * Math.sin(a * 5 + lobes[1]) + 0.07 * Math.sin(a * 2 + lobes[2]);
    pos.setXY(i, x * k * 1.25, y * k * 0.92);      // longer along the body
  }
  g.rotateX(-Math.PI / 2);
  return g;
}

const hash = (key) => { let h = 7; for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 100003; return h; };

export function createBlood(scene) {
  const pools = new Map();       // key -> { mesh, x, z, h, r, want, gone, opacity }
  const material = () => new THREE.MeshStandardMaterial({ color: 0x5c0509, roughness: 0.28, metalness: 0.05, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0x7a0a0e }), DROPS);
  dropMesh.frustumCulled = false; dropMesh.count = 0;
  scene.add(dropMesh);
  const drops = [];
  const M = new THREE.Matrix4();
  let spawn = 0;

  // `list` is [{ key, x, z, h, blood, lying, dead, since }]
  function update(dt, list) {
    const seen = new Set();
    for (const b of list) {
      seen.add(b.key);
      let p = pools.get(b.key);
      // the pool sits under the middle of the body, which lies along the way it fell
      const cx = b.x + Math.sin(b.h) * (b.lying ? 0.55 : 0), cz = b.z + Math.cos(b.h) * (b.lying ? 0.55 : 0);
      if (!p) {
        if (pools.size >= MOST_POOLS) { const oldest = [...pools.entries()].sort((u, v) => u[1].born - v[1].born)[0]; scene.remove(oldest[1].mesh); oldest[1].mesh.geometry.dispose(); oldest[1].mesh.material.dispose(); pools.delete(oldest[0]); }
        const mesh = new THREE.Mesh(poolGeometry(hash(b.key)), material());
        mesh.renderOrder = 1;
        scene.add(mesh);
        p = { mesh, x: cx, z: cz, h: b.h, r: 0.05, want: 0, gone: 0, born: performance.now() };
        pools.set(b.key, p);
      }
      if (b.lying) { p.x = cx; p.z = cz; p.h = b.h; }
      // how far it can spread: more blood, a wider pool; it keeps spreading while they lie there
      const full = 0.3 + Math.sqrt(b.blood) * 0.085;
      p.want = full * Math.min(1, 0.3 + (b.lying ? b.since / 25 : 0.4));
      p.gone = 0;
      // drops while the wound is fresh, or for as long as they lie there bleeding
      if (b.lying && (b.since < 30 || b.dead && b.since < 90)) {
        spawn += dt * (b.since < 6 ? 14 : 4);
        while (spawn >= 1 && drops.length < DROPS) {
          spawn -= 1;
          const a = Math.random() * 6.28;
          drops.push({ x: cx + Math.cos(a) * 0.25, y: 0.18 + Math.random() * 0.2, z: cz + Math.sin(a) * 0.25, vx: Math.cos(a) * (0.2 + Math.random() * 0.5), vy: 0.6 + Math.random() * 0.9, vz: Math.sin(a) * (0.2 + Math.random() * 0.5) });
        }
      }
    }
    for (const [key, p] of pools) {
      if (!seen.has(key)) p.gone += dt;
      p.r += (p.want - p.r) * Math.min(1, dt * 0.6);
      p.mesh.position.set(p.x, 0.035, p.z);
      p.mesh.rotation.y = p.h;
      p.mesh.scale.set(p.r, 1, p.r);
      // drying: darker, then fading away
      const dry = Math.min(1, p.gone / FADE);
      p.mesh.material.opacity = 0.92 * (1 - dry);
      p.mesh.material.color.setHex(dry > 0.2 ? 0x3e0306 : 0x5c0509);
      if (dry >= 1) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); pools.delete(key); }
    }
    // the drops: thrown out a little, fall, and are gone when they reach the ground
    let n = 0;
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const d = drops[i];
      d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y <= 0.03) { drops.splice(i, 1); continue; }
      M.makeTranslation(d.x, d.y, d.z);
      dropMesh.setMatrixAt(n, M); n += 1;
    }
    dropMesh.count = n;
    dropMesh.instanceMatrix.needsUpdate = true;
  }

  return { update, get pools() { return pools.size; } };
}
