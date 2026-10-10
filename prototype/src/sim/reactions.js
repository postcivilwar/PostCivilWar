// What a townsperson's body does when something happens to them: the supplied figures' own animations,
// carried onto the townspeople (src/client/reaction-data.js). Struck, they cower or are afraid and then run;
// kicked, they are hurt and then cry or are sad; fighting back, they box, jab and kick; beaten, they sit and
// cry; knocked down by a vehicle and up again, they hold their head; a vehicle bearing down, they leap clear;
// greeted, they wave or say hello; and now and then, about the town, they laugh, clap, agree, take a call.
//
// Only townspeople. Other players are never made to play these: they have their own figures and their own
// animations. Which reaction plays is decided here, in the simulation, and drawn by every client the same.

export const REACT = Object.freeze({
  // seconds each plays for, unless it is held longer (a loop, while running away or sitting hurt)
  lengths: Object.freeze({ afraid: 2.4, scared: 2.2, cry: 4.5, sad: 4.5, defeat: 3.2, slump: 3.2, hurt: 2.2, flee: 3.0, jump: 1.6, hop: 1.4, punch: 1.0, jab: 0.9, box: 1.6, kick: 1.3, stomp: 1.3, wave: 2.6, greet: 2.4, hello: 2.4, bow: 2.0, cheer: 2.6, clap: 2.6, laugh: 2.8, giggle: 2.4, agree: 2.2, call: 4.0, scratch: 2.6, dance: 4.0, sway: 4.0 }),
  ambient: Object.freeze(['laugh', 'giggle', 'clap', 'agree', 'call', 'scratch', 'cheer', 'wave']),
  range: 60,               // metres from a player within which reactions are told
  everyday: 0.25,          // chance, each second, that someone standing near a player does something everyday
  witness: 12,             // metres within which people who see a blow land are frightened by it
});

export function createReactions({ state, population, rng }) {
  if (!state.reactions) state.reactions = {};
  const book = state.reactions;
  const real = () => state.real;

  // Someone plays `name` from now, for `seconds` (or its own length). `upper`: only the body above the hips
  // (someone sitting, crying); `loop`: round and round until it is ended.
  function react(i, name, { seconds = 0, upper = false, loop = false } = {}) {
    if (!REACT.lengths[name]) return null;
    const now = real();
    book[i] = { name, at: now, until: now + (seconds || REACT.lengths[name]), upper: !!upper, loop: !!loop };
    return book[i];
  }
  const end = (i) => { delete book[i]; };
  const pick = (list) => list[Math.floor(rng.next() * list.length) % list.length];

  // those near (x, z) playing something just now: [index, name, seconds since it began, upper, loop]
  function near(x, z, range = REACT.range) {
    const now = real();
    const out = [];
    const probe = {};
    for (const key of Object.keys(book)) {
      const r = book[key];
      if (now >= r.until) { delete book[key]; continue; }
      population.locate(Number(key), state.t, probe);
      if (Math.abs(probe.x - x) > range || Math.abs(probe.z - z) > range) continue;
      out.push([Number(key), r.name, Math.round((now - r.at) * 100) / 100, r.upper ? 1 : 0, r.loop ? 1 : 0]);
    }
    return out;
  }

  // Everyday life about the players: now and then someone standing near does something ordinary.
  let wait = 1;
  function tick(dt, players) {
    wait -= dt;
    if (wait > 0) return;
    wait = 1;
    for (const p of players) {
      if (rng.next() > REACT.everyday) continue;
      const rows = population.within(`life:${p.id}`, p.x, p.z, 22, state.t, real());
      const idle = rows.filter((r) => r[3] === 0 && !book[r[0]] && Math.hypot(r[1] - p.x, r[2] - p.z) > 2.5);
      if (!idle.length) continue;
      const [i] = pick(idle);
      const who = population.people[i];
      if (!who || who.age < 6) continue;
      react(i, pick(REACT.ambient));
    }
  }

  // People who saw a blow land near them are frightened by it; a few back off.
  function witnessed(x, z, exclude = []) {
    const rows = population.within(`saw:${Math.round(x)}:${Math.round(z)}`, x, z, REACT.witness, state.t, real());
    for (const [i, , , pose] of rows) {
      if (exclude.includes(i) || pose !== 0 || book[i]) continue;
      if (rng.next() < 0.45) react(i, pick(['afraid', 'scared']));
    }
  }

  return { react, end, near, tick, witnessed, playing: (i) => (book[i] && real() < book[i].until ? book[i] : null), pick };
}
