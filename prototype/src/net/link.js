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
  return out;
}

export function decodePlayer(state, zoneId) {
  if (!state || typeof state !== 'object' || state.v !== LINK_VERSION || state.zn !== zoneId) return null;
  const lk = state.lk && typeof state.lk === 'object' ? state.lk : {};
  const say = state.say && typeof state.say === 'object' ? { seq: state.say.q, text: state.say.t, lang: state.say.l } : null;
  return { name: state.n, x: state.x, z: state.z, heading: state.h, lang: state.lg, look: { skin: lk.s, top: lk.t, bottom: lk.b, body: lk.f ? 'f' : 'm', figure: lk.g, colours: lk.c }, say };
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
  return {
    tick(dt) {
      since += dt;
      if (since < interval) return;
      const me = self();
      if (!me) return;
      const state = encodePlayer(me, zoneId);
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
