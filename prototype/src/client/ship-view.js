// The three naval ships on the River Niger (31 October 2026, stage 4 of the owner's brief of 30 October; src/sim/naval.js
// says where each is): the owner's model at the size it is on the river (half the 120 m it was made: a 60 m patrol ship),
// sitting in the water to its waterline, its wake spreading behind it as it goes, its lamps lit at night (a red light on
// its left side, a green one on its right, white at its masthead and stern, as every vessel shows them). Drawn with the
// picture its distance asks for; beyond sight, not at all.
//
//   const ships = createShipView(scene, { lite });
//   ships.update(dt, { list, from, now, night });
import { loadSport } from './sports-model.js';
import { WATER } from '../sim/zone.js';
import { NAVAL } from '../sim/naval.js';

export const SHIP_DRAWN = Object.freeze({ waterline: 4.4, sight: { full: 900, lite: 400 }, near: 160 });

function lamp(colour, size) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
  m.visible = false;
  return m;
}

export function createShipView(scene, { lite = false, base = 'sports/', priority = 'low' } = {}) {
  const shown = new Map();            // n -> { model, tier, loading, x, z, h, lamps, foam }
  const sight = lite ? SHIP_DRAWN.sight.lite : SHIP_DRAWN.sight.full;
  const scale = NAVAL.scale;

  function entry(n, tier) {
    let e = shown.get(n);
    if (e && e.tier !== tier && !e.loading) {
      // a better (or a lighter) picture as it comes nearer or goes away: the new one fetched, then the old let go
      const old = e;
      e = { ...old, tier, loading: true, next: true };
      shown.set(n, e);
      loadSport('naval-ship', { base, tier, priority }).then((m) => { if (shown.get(n) !== e) { m.dispose(); return; } m.group.scale.setScalar(scale); scene.add(m.group); if (e.lamps) for (const L of Object.values(e.lamps)) m.frame.add(L); if (old.model) old.model.dispose(); e.model = m; e.loading = false; }, () => { e.loading = false; });
      return e;
    }
    if (!e) {
      e = { model: null, tier, loading: true, lamps: null, phase: n * 1.7 };
      shown.set(n, e);
      loadSport('naval-ship', { base, tier, priority }).then((m) => {
        if (shown.get(n) !== e) { m.dispose(); return; }
        m.group.scale.setScalar(scale);
        scene.add(m.group);
        e.model = m; e.loading = false;
        // its lamps: on the model, in its own frame (the owner's model is 35 m across and 120 long, at full size)
        const L = { port: lamp(0xff2a2a, 0.5), starboard: lamp(0x22ff66, 0.5), mast: lamp(0xffffff, 0.6), stern: lamp(0xffffff, 0.45) };
        L.port.position.set(14, 30, 10); L.starboard.position.set(-14, 30, 10); L.mast.position.set(0, 52, 12); L.stern.position.set(0, 20, -58);
        for (const x of Object.values(L)) m.frame.add(x);
        e.lamps = L;
      }, () => { e.loading = false; });
    }
    return e;
  }

  // list: [{ n, x, z, h, speed, mode }] (the town's view); from: where the player is; night 0..1
  function update(dt, { list = [], from = { x: 0, z: 0 }, now = 0, night = 0 }) {
    const wanted = new Set();
    for (const s of list) {
      const d = Math.hypot(s.x - from.x, s.z - from.z);
      if (d > sight) continue;
      wanted.add(s.n);
      const e = entry(s.n, d < SHIP_DRAWN.near ? (lite ? '1k' : '2k') : lite ? '512' : '1k');
      // carried smoothly to where the town says it is
      if (e.x === undefined || Math.hypot(e.x - s.x, e.z - s.z) > 20) { e.x = s.x; e.z = s.z; e.h = s.h; }
      e.x += (s.x + Math.sin(s.h) * (s.speed || 0) * 0.1 - e.x) * Math.min(1, dt * 4);
      e.z += (s.z + Math.cos(s.h) * (s.speed || 0) * 0.1 - e.z) * Math.min(1, dt * 4);
      let dh = s.h - e.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      e.h += dh * Math.min(1, dt * 3);
      e.phase += dt;
      if (!e.model) continue;
      const g = e.model.group;
      g.position.set(e.x, WATER - SHIP_DRAWN.waterline + 0.12 * Math.sin(e.phase * 0.5), e.z);
      g.rotation.set(0.004 * Math.sin(e.phase * 0.4), e.h, 0.006 * Math.sin(e.phase * 0.33 + 1), 'YXZ');
      g.visible = true;
      if (e.lamps) for (const x of Object.values(e.lamps)) x.visible = night > 0.3;
    }
    for (const [n, e] of shown) if (!wanted.has(n)) { if (e.model) e.model.dispose(); shown.delete(n); }
  }

  return {
    update,
    model: (n) => { const e = shown.get(n); return e ? e.model : null; },
    shown: () => [...shown.entries()].map(([n, e]) => ({ n, tier: e.tier, drawn: !!e.model })),
    dispose() { for (const e of shown.values()) if (e.model) e.model.dispose(); shown.clear(); },
  };
}
