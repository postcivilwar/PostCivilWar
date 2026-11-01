// The townspeople out walking in Oganiru City (the owner's brief of 31 October 2026, Stage 2, 1 November:
// "Townspeople walk the pavements and use the crossings, never the expressway or flyovers (players may).").
//
// By day some of the town's people (traders, hawkers, students, those out of work and those who keep house) are out in
// the city: each comes out of one of its towers' doors, strolls along its pavements a while (city-walks.js), crossing
// its roads only at the zebra crossings, and there at a junction with lights only while the traffic on that road is held
// at red (the town's cars stop for anyone on foot in the road besides, traffic.js), and goes in at another door. Only
// someone whose own day has them indoors in the town for at least as long as the walk takes, so that nobody is ever in
// two places, and nobody is seen to appear from nothing: they come out of a door and go in at a door.
//
// Kept with the town (`state.strollers`): who is out, between which doors, by which turn, and how far along.
import { signalState } from './zone.js';
import { POSE } from './population.js';
import { cityRoute, cityWalks, prepareCityWalks } from './city-walks.js';
import { chooseRiders } from './sport-riders.js';

export const STROLLERS = Object.freeze({
  most: 26,                 // out at once at the busiest of the day
  pool: 130,                // the townspeople who go into the city now and then
  hours: Object.freeze([7.5, 19]),     // when (by the town's clock) anyone sets out
  kerb: 0.5,                // metres short of the road a walker waits at a crossing
  every: 1.5,               // real seconds between looks at whether someone sets out
});
const JOBS = new Set(['trader', 'hawker', 'unemployed', 'homemaker', 'labourer']);
const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function createCityStrollers({ state, population, hub = {}, timeScale = 30 }) {
  const people = population.people;
  // who may go: the n-th of those of walking age with a day of their own to step out of; not the police, the motorists,
  // the town's riders or anyone on an okada
  const riders = new Set(chooseRiders(people));
  const pool = people.filter((p) => p && JOBS.has(p.job) && p.age >= 15 && p.age <= 72 && p.transport !== 'okada' && !riders.has(p.index)).map((p) => p.index);
  const chosen = [];
  for (let k = 0; chosen.length < Math.min(STROLLERS.pool, pool.length) && k < pool.length * 4; k += 1) { const i = pool[Math.floor(hash(k, 911) * pool.length)]; if (!chosen.includes(i)) chosen.push(i); }
  if (!state.strollers || typeof state.strollers !== 'object') state.strollers = { out: {}, walks: 0, crossed: 0 };
  const book = state.strollers;
  const ways = new Map();       // each walker's way (made again from its doors and turn when the town is opened)
  const real = () => state.real;
  let nextLook = 0;

  // How long someone's own day keeps them indoors from `t` (game seconds), or 0 if they are out now.
  function indoorsFor(i, t) {
    const day = Math.floor(t / 86400), s = t - day * 86400;
    const plan = population.planOf(i, day);
    const legs = plan.legs;
    let k = -1;
    for (let n = 0; n < legs.length; n += 1) if (legs[n].t0 <= s) k = n; else break;
    const leg = k >= 0 ? legs[k] : null;
    if (leg && leg.path && s < leg.t1) return 0;
    const spot = population.spot(leg ? leg.spot : plan.start);
    if (!spot || !spot.inside) return 0;
    return (k + 1 < legs.length ? legs[k + 1].t0 : 86400) - s;
  }
  // A walk: out of one door, round by a turn somewhere along the pavements, in at another.
  function wayOf(w) {
    let way = ways.get(w.i);
    if (way) return way;
    const W = cityWalks();
    const a = W.doors[w.from], b = W.doors[w.to], turn = W.nodes[w.turn];
    if (!a || !b || !turn) return null;
    const there = cityRoute({ x: a.x, z: a.z, y: W.nodes[a.k].y }, { x: turn.x, z: turn.z, y: turn.y }, { foot: true });
    const back = there && cityRoute({ x: turn.x, z: turn.z, y: turn.y }, { x: b.x, z: b.z, y: W.nodes[b.k].y }, { foot: true });
    if (!there || !back) return null;
    const pts = [[a.x, a.z, W.nodes[a.k].y], ...there, ...back];
    // the crossings on it: where a walker waits at the kerb for the light, and which light
    const xs = [], zs = [], ys = [], cum = [0], cross = [];
    for (const [x, z, y] of pts) { const n = xs.length; if (n && Math.hypot(x - xs[n - 1], z - zs[n - 1]) < 0.05) continue; xs.push(x); zs.push(z); ys.push(y); if (n) cum.push(cum[n - 1] + Math.hypot(x - xs[n - 1], z - zs[n - 1])); }
    for (const zb of W.zebras) {
      const A = W.nodes[zb.a], B = W.nodes[zb.b];
      for (let n = 0; n + 1 < xs.length; n += 1) {
        const fwd = Math.hypot(xs[n] - A.x, zs[n] - A.z) < 0.1 && Math.hypot(xs[n + 1] - B.x, zs[n + 1] - B.z) < 0.1;
        const rev = Math.hypot(xs[n] - B.x, zs[n] - B.z) < 0.1 && Math.hypot(xs[n + 1] - A.x, zs[n + 1] - A.z) < 0.1;
        if (fwd || rev) cross.push({ at: cum[n], crossing: zb.crossing });
      }
    }
    cross.sort((p, q) => p.at - q.at);
    way = { xs, zs, ys, cum, len: cum[cum.length - 1], cross };
    ways.set(w.i, way);
    return way;
  }

  // Someone sets out, where the day is for it.
  function setOut(t) {
    const W = cityWalks();
    if (W.doors.length < 2) return;
    const hour = (t % 86400) / 3600;
    if (hour < STROLLERS.hours[0] || hour > STROLLERS.hours[1]) return;
    // (fewer early and late, most about midday)
    const want = Math.round(STROLLERS.most * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, Math.max(0, (hour - STROLLERS.hours[0]) / (STROLLERS.hours[1] - STROLLERS.hours[0]))))));
    if (Object.keys(book.out).length >= want) return;
    const k = Math.floor(hash(book.walks + 17, Math.floor(real())) * chosen.length);
    for (let n = 0; n < chosen.length; n += 1) {
      const i = chosen[(k + n) % chosen.length];
      if (book.out[i] || (hub.actors && hub.actors.has(i)) || people[i].gone) continue;
      // indoors long enough: a stroll of a few minutes (real), the town's day going thirty times as fast
      // (indoors for a while yet, by their own day: a walk to fit, out and back to a door near, as far as that allows)
      const indoors = indoorsFor(i, t);
      const pace = people[i].pace || 1.6;
      const most = (indoors / (1.15 * Math.max(1, timeScale)) - 60) * pace;
      if (most < 90) continue;
      const from = Math.floor(hash(i, book.walks) * W.doors.length);
      let to = Math.floor(hash(i, book.walks + 1) * (W.doors.length - 1));
      if (to >= from) to += 1;
      // a turn somewhere along the pavements not far from downtown (half the way out, half back, give or take)
      const turns = W.near(W.doors[from].x, W.doors[from].z, Math.min(260, most / 2.6), (q) => q.foot && q.kind === 'walk');
      if (!turns.length) continue;
      const turn = turns[Math.floor(hash(i, book.walks + 2) * turns.length)][0];
      const w = { i, from, to, turn, d: 0, wait: 0, since: real() };
      ways.delete(i);
      const way = wayOf(w);
      // (and long enough for this one: its length at their pace, a wait at each crossing, and a margin)
      const takes = (way ? way.len / pace + way.cross.length * 25 : Infinity) * 1.15 * Math.max(1, timeScale);
      if (!way || way.len < 60 || way.len > 900 || takes > indoors) { ways.delete(i); continue; }
      book.out[i] = w;
      book.walks += 1;
      return;
    }
  }

  function tick(dt, t) {
    // (the city's ways on foot are worked out a little at a time first, so that no one moment of the game waits on it)
    if (!prepareCityWalks(3)) return;
    if (real() >= nextLook) { nextLook = real() + STROLLERS.every; setOut(t); }
    for (const key of Object.keys(book.out)) {
      const w = book.out[key];
      // (taken out of it: knocked down, sent running; theirs to look after now; or nobody of the town's now)
      if (!people[w.i] || (hub.actors && hub.actors.has(w.i))) { delete book.out[key]; ways.delete(w.i); continue; }
      const way = wayOf(w);
      if (!way) { delete book.out[key]; continue; }
      const pace = people[w.i].pace || 1.6;
      let go = pace * dt;
      // a crossing coming: at the kerb, wait while the road's traffic has a green (or amber) light
      const next = way.cross.find((c) => c.at >= w.d - 0.01);
      w.waiting = false;
      if (next && next.crossing.signals && next.at - w.d < go + STROLLERS.kerb && signalState(next.crossing.phase, real() + next.crossing.offset) !== 'red') {
        go = Math.max(0, next.at - STROLLERS.kerb - w.d);
        w.waiting = go < 0.01;
      }
      // (someone who has stepped off the kerb goes on over, whatever the light does meanwhile)
      const was = w.d;
      w.d = Math.min(way.len, w.d + go);
      if (next && was < next.at + 0.01 && w.d > next.at + 0.01) book.crossed += 1;
      if (w.d >= way.len - 0.01) { delete book.out[key]; ways.delete(w.i); }
    }
  }

  // Tells the population where someone out walking in the city is.
  const probe = {};
  function hook(i, t, out) {
    const w = book.out[i];
    if (!w || !people[i]) return false;
    const way = wayOf(w);
    if (!way) return false;
    population.planned(i, t, out);
    let a = 0, b = way.cum.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (way.cum[m] <= w.d) a = m; else b = m; }
    const span = way.cum[b] - way.cum[a] || 1, f = Math.max(0, Math.min(1, (w.d - way.cum[a]) / span));
    out.x = way.xs[a] + (way.xs[b] - way.xs[a]) * f;
    out.z = way.zs[a] + (way.zs[b] - way.zs[a]) * f;
    out.y = way.ys[a] + (way.ys[b] - way.ys[a]) * f;
    out.h = Math.atan2(way.xs[b] - way.xs[a], way.zs[b] - way.zs[a]);
    out.pose = w.waiting ? POSE.stand : POSE.walk;
    out.moving = !w.waiting;
    out.leg = null;
    out.act = w.waiting ? 'Waiting to cross' : 'Out walking in the city';
    return true;
  }
  population.addHook(hook);
  void probe;

  const api = {
    tick, hook,
    out: () => Object.values(book.out).map((w) => ({ ...w })),
    wayOf: (i) => (book.out[i] ? wayOf(book.out[i]) : null),
    audit: () => ({ out: Object.keys(book.out).length, walks: book.walks, crossed: book.crossed, pool: chosen.length }),
    chosen,
  };
  hub.strollers = api;
  return api;
}
