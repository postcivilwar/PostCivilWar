// The town's people on their bicycles, skateboards and skates (31 October 2026; src/sim/sport-riders.js says where each
// is and what they are doing): each near enough drawn as their own figure (the owner's townspeople's figures) on the
// owner's model of what they ride, ridden as a player rides it (sport-view.js: the cyclist's feet on the pedals going
// round, the skateboarder's push, the skater's stride, each leaning into the turns, the wheels turning); one taken and
// left standing, or lying where it fell, drawn there. Further off than a rider can be made out, nothing.
//
//   const riders = createSportRidersView(scene, { lite });
//   riders.update(dt, { list, known, eye, ahead, groundY });    each frame (`list`: the town's view, `sportRiders`)
import { makeCharacter, animateCharacter, seatCharacter, standCharacter } from './character.js';
import { createSportView } from './sport-view.js';
import { SPORT_HANDLING, sportSeated } from '../sim/sport-ride.js';

// how many are drawn at once, and within how far (a phone fewer and nearer); a new figure made at most this often
export const RIDERS_SEEN = Object.freeze({ full: Object.freeze({ most: 6, sight: 95 }), lite: Object.freeze({ most: 3, sight: 55 }), every: 0.35 });

const angleGap = (to, from) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export function createSportRidersView(scene, { lite = false } = {}) {
  const limits = lite ? RIDERS_SEEN.lite : RIDERS_SEEN.full;
  const view = createSportView(scene, { lite, priority: 'low', most: limits.most, sight: limits.sight + 10 });
  const riders = new Map();        // n -> { n, x, z, h, rig, person, item, seen }
  const spare = [];                // figures let go but kept for the next (a few)
  let making = 0, stamp = 0;
  const stats = { made: 0, drawn: 0, seated: 0 };

  function letGo(s) {
    if (!s.rig) return;
    scene.remove(s.rig.group);
    if (spare.length < 2) spare.push({ key: s.rigKey, rig: s.rig }); else s.rig.dispose();
    s.rig = null; s.rigKey = null;
  }
  function dress(who) {
    const key = who.look && who.look.figure ? who.look.figure : JSON.stringify(who.look || {});
    const k = spare.findIndex((q) => q.key === key);
    if (k >= 0) { const { rig } = spare.splice(k, 1)[0]; return { rig, key }; }
    stats.made += 1;
    return { rig: makeCharacter(who.look, null, false, 2), key };
  }

  // list: [{ n, item, person, x, z, h, speed, lean, phase, mode, fallen }]; known: the town's people as told to this page
  // (main.js learnFaces); eye: { x, z }; ahead: seconds since the town's last word (each is carried on at its speed)
  function update(dt, { list = [], known = new Map(), eye = { x: 0, z: 0 }, ahead = 0, groundY = () => 0, now = 0 }) {
    stamp += 1;
    making -= dt;
    const dist = (q) => Math.hypot(q.x - eye.x, q.z - eye.z);
    // where each is now: from the town's last word, carried on at its speed, and come to smoothly
    for (const o of list) {
      if (!SPORT_HANDLING[o.item]) continue;
      let s = riders.get(o.n);
      const riding = typeof o.person === 'number';
      const tx = o.x + (riding ? Math.sin(o.h) * (o.speed || 0) * Math.min(0.3, ahead) : 0), tz = o.z + (riding ? Math.cos(o.h) * (o.speed || 0) * Math.min(0.3, ahead) : 0);
      if (!s) { s = { n: o.n, x: tx, z: tz, h: o.h, rig: null, rigKey: null, person: null, item: o.item, seen: 0 }; riders.set(o.n, s); }
      if (Math.hypot(s.x - tx, s.z - tz) > 6 || s.item !== o.item) { s.x = tx; s.z = tz; s.h = o.h; }
      s.x += (tx - s.x) * Math.min(1, dt * 8); s.z += (tz - s.z) * Math.min(1, dt * 8);
      s.h += angleGap(o.h, s.h) * Math.min(1, dt * 8);
      s.o = o; s.seen = stamp; s.item = o.item;
      if (s.person !== o.person) { letGo(s); s.person = o.person; }
    }
    for (const [n, s] of riders) if (s.seen !== stamp) { letGo(s); riders.delete(n); }
    // the nearest few riding within sight get their figures (one made at a time); the rest let theirs go
    const near = [...riders.values()].filter((s) => typeof s.person === 'number' && known.get(s.person) && dist(s) <= limits.sight).sort((a, b) => dist(a) - dist(b)).slice(0, limits.most);
    const wanted = new Set(near.map((s) => s.n));
    for (const s of riders.values()) if (s.rig && (!wanted.has(s.n) || dist(s) > limits.sight + 10)) letGo(s);
    for (const s of near) {
      if (s.rig || making > 0) continue;
      const who = known.get(s.person);
      const made = dress(who);
      s.rig = made.rig; s.rigKey = made.key;
      scene.add(s.rig.group);
      making = RIDERS_SEEN.every;
    }
    // what is drawn: each with a figure, ridden; and each taken and left standing (or lying), where it is
    const rides = [], parked = [];
    for (const s of riders.values()) {
      const o = s.o;
      if (s.rig) rides.push({ key: s.n, id: s.item, x: s.x, z: s.z, h: s.h, lean: o.lean || 0, speed: o.speed || 0, steer: 0, phase: o.phase || 0, throttle: s.item === 'bicycle' ? ((o.speed || 0) > 0.3 ? 1 : 0) : o.phase % 1 > 0.001 ? 1 : 0, brake: 0, rig: s.rig });
      else if (typeof o.person !== 'number') parked.push({ key: `npc-left:${s.n}`, item: s.item, x: s.x, z: s.z, h: s.h, fallen: !!o.fallen });
    }
    view.update(dt, { rides, parked, parkedMost: 4, groundY, from: eye, now });
    stats.drawn = rides.length; stats.seated = 0;
    for (const r of rides) {
      animateCharacter(r.rig, dt, 0, false);
      if (sportSeated(r.id)) seatCharacter(r.rig); else standCharacter(r.rig);
      r.rig.group.visible = true;
      if (view.seat(r.rig, r, groundY, `peer:${r.key}`)) stats.seated += 1;
      // (its thing not here yet: they are not shown standing on nothing)
      else r.rig.group.visible = false;
    }
  }

  return {
    update, view, stats,
    // the figure on rider n, if one is drawn (the tests)
    rigOf: (n) => { const s = riders.get(n); return s ? s.rig : null; },
    shown: () => [...riders.values()].filter((s) => s.rig).map((s) => s.n),
    dispose() { for (const s of riders.values()) letGo(s); riders.clear(); for (const q of spare) q.rig.dispose(); spare.length = 0; view.dispose(); },
  };
}
