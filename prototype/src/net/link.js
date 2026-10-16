// The link between this copy of the world and the others.
//
// It sends out where this player stands and what they last said, and hands
// what it hears from other copies to the simulation as visitors. The
// simulation checks every field of a visitor and decides for itself who is
// near and what is heard; the link decides nothing.
//
// In this prototype each page runs its own world, so a visitor is a person
// seen from another world: they can be met and spoken with, but the town
// around them, its clock and its money are each page's own. With a zone
// server the simulation holds every player directly, and this file goes.

export const LINK_VERSION = 1;

// The few fields that travel. Short names, because presence is small.
export function encodePlayer(self, zoneId) {
  const out = { v: LINK_VERSION, zn: zoneId, n: self.name, x: Math.round(self.x * 10) / 10, z: Math.round(self.z * 10) / 10, h: Math.round(self.heading * 100) / 100, lg: self.lang || 'en', lk: { s: self.look.skin, t: self.look.top, b: self.look.bottom, f: self.look.body === 'f' ? 1 : 0 } };
  // a supplied figure and its colours: checked again by whoever hears it
  if (self.look.figure) { out.lk.g = self.look.figure; out.lk.c = self.look.colours; }
  if (self.said) out.say = { q: self.said.seq, t: self.said.text, l: self.said.lang };
  // on one of their own motorcycles: which, and what it is doing (lamps, flames and the engine's note follow it)
  const a = self.astride;
  if (a && a.model) { const r = a.ride || {}; out.mb = { i: a.model, l: r.lean || 0, s: r.speed || 0, t: r.throttle || 0, k: r.brake ? 1 : 0, r: r.rev || 0, hn: a.horns || 0 }; }
  // Vehicles. Each copy of the town has its own; what this player drives, rides or has left standing exists only in
  // theirs. So it travels with them, and every other player's game draws it where they are: the keke they drive
  // (its plate and paint), the okada they ride or sit on the back of, and their own motorcycles and kekes standing
  // near them. With it, how fast they are going, so that the others can carry it on between one word and the next.
  const r2 = (v) => Math.round(v * 100) / 100;
  if (self.driving) out.vh = { k: 'keke', id: self.driving.id, pl: self.driving.plate, lk: packLook(self.driving.look), f: self.driving.ownerName && !self.driving.owned ? 1 : 0, hn: self.horns || 0 };
  else if (a && !a.model) out.vh = { k: 'okada', hn: self.horns || 0 };
  else if (self.riding) out.vh = { k: 'okada', b: 1, dp: self.riding.i };
  const near = (list) => (list || []).map((v) => ({ v, d: Math.hypot(v.x - self.x, v.z - self.z) })).filter((e) => e.d < PARKED_NEAR).sort((p, q) => p.d - q.d).map((e) => e.v);
  const bikes = near(self.ownBikes && self.ownBikes.parked).slice(0, 3);
  if (bikes.length) out.pk = bikes.map((b) => [b.bike, r2(b.x), r2(b.z), r2(b.h), b.fallen ? 1 : 0]);
  const kekes = near(self.parkedKekes).slice(0, 2);
  if (kekes.length) out.pv = kekes.map((v) => ({ id: v.id, x: r2(v.x), z: r2(v.z), h: r2(v.heading), pl: v.plate, lk: packLook(v.look), f: v.fleet ? 1 : 0 }));
  if (self.vel) out.vl = [r2(self.vel[0]), r2(self.vel[1])];
  return out;
}

// A player's parked vehicles are told to others within this many metres of the player.
export const PARKED_NEAR = 70;

// A keke's look, in short (vehicle-looks.js): its trim, paint, canopy, seat, floor, wear, dirt, slogan, number, extras.
function packLook(l) {
  if (!l || typeof l !== 'object') return null;
  return { t: l.trim, p: l.paint, c: l.canopy, s: l.seat, f: l.floor, w: l.wear, d: l.dirt, g: l.slogan || null, u: l.number || null, x: l.extras && l.extras.length ? l.extras : undefined };
}
export function unpackLook(k) {
  if (!k || typeof k !== 'object') return null;
  return { model: 'keke', trim: k.t, paint: k.p, canopy: k.c, seat: k.s, floor: k.f, wear: k.w, dirt: k.d, slogan: k.g || null, number: k.u || null, extras: Array.isArray(k.x) ? k.x : [] };
}

export function decodePlayer(state, zoneId) {
  if (!state || typeof state !== 'object' || state.v !== LINK_VERSION || state.zn !== zoneId) return null;
  const lk = state.lk && typeof state.lk === 'object' ? state.lk : {};
  const say = state.say && typeof state.say === 'object' ? { seq: state.say.q, text: state.say.t, lang: state.say.l } : null;
  const mb = state.mb && typeof state.mb === 'object' ? state.mb : null;
  const ride = mb ? { bike: mb.i, lean: mb.l, speed: mb.s, throttle: mb.t, brake: mb.k, rev: mb.r, horns: mb.hn } : null;
  const vh = state.vh && typeof state.vh === 'object' ? state.vh : null;
  const vehicle = vh ? { kind: vh.k, id: vh.id, plate: vh.pl, look: unpackLook(vh.lk), fleet: !!vh.f, back: !!vh.b, driver: vh.dp, horns: vh.hn } : null;
  const parked = Array.isArray(state.pk) ? state.pk.map((b) => (Array.isArray(b) ? { bike: b[0], x: b[1], z: b[2], h: b[3], fallen: !!b[4] } : null)) : [];
  const kekes = Array.isArray(state.pv) ? state.pv.map((v) => (v && typeof v === 'object' ? { id: v.id, x: v.x, z: v.z, heading: v.h, plate: v.pl, look: unpackLook(v.lk), fleet: !!v.f } : null)) : [];
  const vel = Array.isArray(state.vl) ? state.vl : null;
  return { name: state.n, x: state.x, z: state.z, heading: state.h, lang: state.lg, look: { skin: lk.s, top: lk.t, bottom: lk.b, body: lk.f ? 'f' : 'm', figure: lk.g, colours: lk.c }, say, ride, vehicle, parked, kekes, vel };
}

export function createLink({ transport, game, zoneId, self, interval = 0.15 }) {
  let since = interval;
  let last = '';
  let known = new Set();
  let peers = 0;
  const off = transport.subscribe((others) => {
    const here = new Set();
    for (const other of others.slice(0, 64)) {
      const data = decodePlayer(other.state, zoneId);
      if (!data) continue;
      if (game.visitors.seen(other.id, data)) here.add(other.id);
    }
    for (const id of known) if (!here.has(id)) game.visitors.gone(id);
    known = here;
    peers = here.size;
  });
  let clock = 0, lastAt = null;
  const vel = [0, 0];
  return {
    tick(dt) {
      since += dt; clock += dt;
      if (since < interval) return;
      const me = self();
      if (!me) return;
      // how fast it is going, from where it was last time (smoothed a little)
      if (lastAt) { const span = clock - lastAt.t; if (span > 0.05) { const k = Math.min(1, span / 0.4); vel[0] += ((me.x - lastAt.x) / span - vel[0]) * k; vel[1] += ((me.z - lastAt.z) / span - vel[1]) * k; if (Math.hypot(vel[0], vel[1]) > 90) vel[0] = vel[1] = 0; } }
      lastAt = { x: me.x, z: me.z, t: clock };
      const state = encodePlayer({ ...me, vel: Math.hypot(vel[0], vel[1]) > 0.3 ? vel : [0, 0] }, zoneId);
      const text = JSON.stringify(state);
      // a player standing still is re-sent now and then, so that others keep seeing them
      if (text === last && since < 2) return;
      since = 0;
      last = text;
      transport.publish(state);
    },
    status: () => ({ kind: transport.kind, peers, failed: !!transport.failed }),
    close() { off(); for (const id of known) game.visitors.gone(id); known = new Set(); transport.close(); },
  };
}
