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
  if (a && a.model) { const r = a.ride || {}; out.mb = { i: a.model, l: r.lean || 0, s: r.speed || 0, t: r.throttle || 0, k: r.brake ? 1 : 0, r: r.rev || 0, st: r.steer || 0, hn: a.horns || 0 }; }
  // the phone in their hand (18 October 2026): 1 held to be read, 2 on a call, 3 held up to take a picture; so that
  // others see them take it out and hold it as they do, on foot, on a motorcycle or at the wheel
  if (self.phone) out.ph = self.phone;
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
  // (one that came down in a crash: how long ago, so that the others see it go over then, and one long down lying)
  if (bikes.length) out.pk = bikes.map((b) => (b.fallen && Number.isFinite(b.ago) ? [b.bike, r2(b.x), r2(b.z), r2(b.h), 1, Math.min(600, r2(b.ago))] : [b.bike, r2(b.x), r2(b.z), r2(b.h), b.fallen ? 1 : 0]));
  const kekes = near(self.parkedKekes).slice(0, 2);
  if (kekes.length) out.pv = kekes.map((v) => ({ id: v.id, x: r2(v.x), z: r2(v.z), h: r2(v.heading), pl: v.plate, lk: packLook(v.look), f: v.fleet ? 1 : 0 }));
  // in one of their own cars (17 October 2026): which, and what it is doing (its lamps, brake lamps and the engine's
  // note follow it); and their own cars standing near them
  const c = self.incar;
  if (c && c.car) { const d = c.drive || {}; out.mc = { i: c.car, s: d.steer || 0, v: d.speed || 0, t: d.throttle || 0, k: d.brake ? 1 : 0, r: d.rev || 0, l: d.lamps ? 1 : 0, hn: c.horns || 0 }; }
  const cars = near(self.ownCars && self.ownCars.parked).slice(0, 3);
  if (cars.length) out.pc = cars.map((p) => [p.car, r2(p.x), r2(p.z), r2(p.h)]);
  if (self.vel) out.vl = [r2(self.vel[0]), r2(self.vel[1])];
  // in the PostCivilWar PowerBike showroom, asking the salesman about one of its motorcycles: which, and for how long
  // (the salesman goes to whoever began first: salesman.js)
  if (self.talk && typeof self.talk.bike === 'string') out.tk = [self.talk.bike, Math.round(Math.max(0, self.talk.ago || 0) * 10) / 10];
  // and in the car showroom, asking a salesman about one of its cars
  if (self.carTalk && typeof self.carTalk.car === 'string') out.tc = [self.carTalk.car, Math.round(Math.max(0, self.carTalk.ago || 0) * 10) / 10];
  // knocked down, thrown from a motorcycle, or killed (19 October 2026): how (0 struck, 1 thrown, 2 killed), how long
  // ago, how long on the ground and getting up, which way the blow sent them, a hard blow, and where it began, so that
  // the others see them fall and get up as they do (falls.js) rather than walk from where they were struck
  const d = self.down, k = self.dead;
  // (and, thrown over something low on the way down, where along the way it lay: the body is lifted over it)
  if (d && Number.isFinite(d.age)) out.dn = [d.by === 'crash' ? 1 : 0, Math.round(d.age * 100) / 100, Math.round((d.lie || 0) * 100) / 100, Math.round((d.rise || 0) * 100) / 100, r2(d.h || 0), d.hard ? 1 : 0, d.from ? r2(d.from.x) : null, d.from ? r2(d.from.z) : null, ...(d.over ? [r2(d.over.a), r2(d.over.b)] : [])];
  else if (k && Number.isFinite(k.age)) out.dn = [2, Math.round(k.age * 100) / 100, 0, 0, 0, 0, null, null];
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
  const ride = mb ? { bike: mb.i, lean: mb.l, speed: mb.s, throttle: mb.t, brake: mb.k, rev: mb.r, steer: mb.st, horns: mb.hn } : null;
  const vh = state.vh && typeof state.vh === 'object' ? state.vh : null;
  const vehicle = vh ? { kind: vh.k, id: vh.id, plate: vh.pl, look: unpackLook(vh.lk), fleet: !!vh.f, back: !!vh.b, driver: vh.dp, horns: vh.hn } : null;
  const parked = Array.isArray(state.pk) ? state.pk.map((b) => (Array.isArray(b) ? { bike: b[0], x: b[1], z: b[2], h: b[3], fallen: !!b[4], ...(b[4] && Number.isFinite(b[5]) ? { ago: b[5] } : {}) } : null)) : [];
  const kekes = Array.isArray(state.pv) ? state.pv.map((v) => (v && typeof v === 'object' ? { id: v.id, x: v.x, z: v.z, heading: v.h, plate: v.pl, look: unpackLook(v.lk), fleet: !!v.f } : null)) : [];
  const vel = Array.isArray(state.vl) ? state.vl : null;
  const talk = Array.isArray(state.tk) ? { bike: state.tk[0], ago: state.tk[1] } : null;
  const mc = state.mc && typeof state.mc === 'object' ? state.mc : null;
  const car = mc ? { car: mc.i, steer: mc.s, speed: mc.v, throttle: mc.t, brake: mc.k, rev: mc.r, lamps: mc.l, horns: mc.hn } : null;
  const cars = Array.isArray(state.pc) ? state.pc.map((p) => (Array.isArray(p) ? { car: p[0], x: p[1], z: p[2], h: p[3] } : null)) : [];
  const carTalk = Array.isArray(state.tc) ? { car: state.tc[0], ago: state.tc[1] } : null;
  const phone = [1, 2, 3].includes(state.ph) ? state.ph : 0;
  const dn = Array.isArray(state.dn) ? state.dn : null;
  const down = dn ? { kind: ['knock', 'crash', 'dead'][dn[0]] || null, age: dn[1], lie: dn[2], rise: dn[3], push: dn[4], hard: !!dn[5], from: Number.isFinite(dn[6]) && Number.isFinite(dn[7]) ? { x: dn[6], z: dn[7] } : null, over: Number.isFinite(dn[8]) && Number.isFinite(dn[9]) ? { a: dn[8], b: dn[9] } : null } : null;
  return { down, name: state.n, x: state.x, z: state.z, heading: state.h, lang: state.lg, look: { skin: lk.s, top: lk.t, bottom: lk.b, body: lk.f ? 'f' : 'm', figure: lk.g, colours: lk.c }, say, ride, vehicle, parked, kekes, vel, talk, car, cars, carTalk, phone };
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
      if (lastAt) { const span = clock - lastAt.t; if (span > 0.05) { const k = Math.min(1, span / 0.4); vel[0] += ((me.x - lastAt.x) / span - vel[0]) * k; vel[1] += ((me.z - lastAt.z) / span - vel[1]) * k; if (Math.hypot(vel[0], vel[1]) > 110) vel[0] = vel[1] = 0; } }
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
