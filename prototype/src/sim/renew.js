// A town saved with the people it had before (22 October 2026: every townsperson taken out of the game but the
// police, who are sixteen women now, and the named people at the counters). The save held things about its people by
// their numbers; those numbers belong to other people now, or to nobody. What it held about them is let go here,
// before anything is made from the save, so that no number points at someone it was not about and nothing is left
// half done: a ride on an okada that is gone, a fight with somebody who is not there, a witness who no longer exists,
// an officer sent to a call who was someone else.
//
// What the players did and own is kept as it was: their money, their land and what is built on it, their vehicles,
// their record with the police (an arrest stands; what they are wanted for stands, unless it was against a townsperson
// nobody had yet missed), what they owe.
//
// population.js says when a save is from before (`renewed`: ZONE_POPULATION.edition); sim.js calls this then.

export function renewTown(state) {
  for (const id of Object.keys(state.players || {})) {
    const p = state.players[id];
    if (typeof p.riding === 'number') p.riding = null;                     // on the back of an okada
    if (typeof p.astride === 'number') p.astride = null;                   // on a rider's motorcycle (a string is one of their own, kept)
    if (p.fight && p.fight.target && p.fight.target.kind === 'npc') p.fight = null;
    if (p.involvedNpc) p.involvedNpc = null;
    if (p.hijack && (p.hijack.kind === 'okada' || p.hijack.kind === 'car')) p.hijack = null;
    // at the wheel of a car of the town's (traffic.js): its owner is somebody else now, or nobody; it goes back
    if (p.pcar && Number.isInteger(p.pcar.taken)) { p.incar = null; p.pcar = null; }
  }
  // the town's motorists and their cars: made again for the town's people as they now are
  delete state.traffic;
  // people taken out of their day, and how townspeople were moving
  delete state.actors;
  delete state.reactions;
  // the okadas and their riders: gone, with their journeys; the fares not yet paid over are not owed to anyone now
  const o = state.okada;
  if (o) {
    const outstanding = (o.owed || []).reduce((sum, amount) => sum + amount, 0);
    o.fareTotal = (o.fareTotal || 0) - outstanding;
    o.riders = []; o.trips = {}; o.owed = []; o.cursor = -1;
  }
  if (state.conflict) { state.conflict.npc = {}; state.conflict.events = []; }
  if (state.impact) { state.impact.npc = {}; state.impact.events = []; }
  if (state.talk) { state.talk.busy = {}; state.talk.next = {}; state.talk.lines = []; }
  const J = state.justice;
  if (J) {
    J.officers = {};
    for (const c of Object.values(J.crimes || {})) {
      if (c.status !== 'open') continue;
      c.witnesses = (c.witnesses || []).filter((w) => w.kind !== 'npc');
      // something done to a townsperson that nobody had yet found out about: there is nobody left to find it out
      if (c.victim && c.victim.kind === 'npc' && c.detection !== 'identified') { c.status = 'lapsed'; c.reportAt = null; c.discoverAt = null; }
    }
    // a prisoner a constable had handed to an officer of the town: that officer is gone (the town's police fetch them)
    for (const a of Object.values(J.arrests || {})) delete a.handedTo;
    J.picked = {};
  }
}
