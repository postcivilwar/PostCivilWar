// Knocking down a street lamp (street-lamps.js has the lamps, the rules and the numbers; 31 October 2026, the owner's
// brief for the new city). The driver's page finds the lamp in its car's way and says how fast it was going; the town
// judges it for itself: the car must be at the lamp, on its level, and going fast enough as the town saw it (never more
// than a little over what the town saw). Down, the lamp is told to the other players' games for a while (link.js `kl`),
// and those told of one put it down too, once (`heard`). A lamp nobody raised is up again after LAMP_KNOCK.watched.
// No police stars for it.
import { STREET_LAMPS, LAMP_KNOCK, lampIndexOf, knockLamp, lampDown, lampsDown, knockSpeedOf, raiseLamp, forgetLamp, clearLamps } from './street-lamps.js';
import { POWER_CARS } from './power-cars.js';
import { GameError } from './registry.js';
import { levelAt } from './levels.js';

export function createLamps({ state }) {
  // (a town made afresh has every lamp standing: what was down in the last one is forgotten)
  clearLamps();
  function knock(p, { lamp, speed, heading } = {}) {
    const i = lampIndexOf(String(lamp || ''));
    const l = STREET_LAMPS[i];
    if (!l || !l.knock) throw new GameError('NO_LAMP', 'There is no lamp there.');
    const c = p.pcar;
    if (!c || typeof p.incar !== 'string' || !p.incar.startsWith('pc:')) throw new GameError('NOT_DRIVING', 'Only a car knocks a lamp down.');
    if (lampDown(i)) return { down: true, lamp: l.id, already: true, keep: LAMP_KNOCK.keep };
    const spec = POWER_CARS[c.id] || { length: 4.6, width: 1.9, class: 'saloon' };
    const h = Number.isFinite(heading) ? heading : c.h;
    const way = (Number(speed) || 0) < 0 ? -1 : 1;
    const fx = c.x + Math.sin(h) * (spec.length / 2) * way, fz = c.z + Math.cos(h) * (spec.length / 2) * way;
    if (Math.hypot(fx - l.x, fz - l.z) > LAMP_KNOCK.reach + spec.width / 2 + l.radius) throw new GameError('TOO_FAR', 'That lamp is not in front of the car.');
    if (Math.abs(levelAt(c) - l.y) > 2.5) throw new GameError('TOO_FAR', 'That lamp is not on this level.');
    const seen = Number.isFinite(c.seen) ? c.seen : 0;
    const v = Math.min(Math.abs(Number(speed) || 0), seen * 1.35 + 1.5);
    if (v < knockSpeedOf(spec.class)) return { down: false, lamp: l.id };
    const dir = way > 0 ? h : h + Math.PI;
    knockLamp(i, state.real, dir, p.id);
    p.knocked = (p.knocked || []).filter((k) => state.real - k.at < LAMP_KNOCK.told);
    p.knocked.push({ lamp: l.id, at: state.real, dir });
    if (p.knocked.length > 4) p.knocked.shift();
    return { down: true, lamp: l.id, keep: LAMP_KNOCK.keep };
  }

  // What another player's game says they knocked down: each lamp, how long ago, which way it fell. The same knock told
  // again and again (every word of theirs for six minutes) is taken once.
  const heardOf = new Map();
  function heard(visitorId, list) {
    if (!Array.isArray(list)) return;
    for (const k of list.slice(0, 6)) {
      if (!k || typeof k !== 'object') continue;
      const i = lampIndexOf(String(k.lamp || ''));
      const ago = Number(k.ago);
      if (i < 0 || !Number.isFinite(ago) || ago < 0 || ago > LAMP_KNOCK.told) continue;
      const at = state.real - ago;
      const key = `${visitorId}:${i}`;
      const was = heardOf.get(key);
      if (was !== undefined && Math.abs(was - at) < 4) continue;
      heardOf.set(key, at);
      knockLamp(i, at, Number.isFinite(Number(k.dir)) ? Number(k.dir) : 0, String(visitorId));
    }
  }

  // Each second or so: any lamp down longer than LAMP_KNOCK.watched rises (where nobody's page raised it before), and
  // one long up again is forgotten.
  let lastTick = -1e9;
  function tick() {
    if (state.real - lastTick < 1) return;
    lastTick = state.real;
    for (const [i, d] of lampsDown()) {
      if (!d.up && state.real - d.at >= LAMP_KNOCK.watched) raiseLamp(i, state.real);
      if (d.up && state.real - d.up > LAMP_KNOCK.rise + 2) forgetLamp(i);
    }
    for (const [key, at] of heardOf) if (state.real - at > LAMP_KNOCK.told + 30) heardOf.delete(key);
  }

  // What this player knocked down lately, for their word to the others (link.js `kl`).
  function selfView(p) {
    const now = state.real;
    return (p.knocked || []).filter((k) => now - k.at < LAMP_KNOCK.told).map((k) => ({ lamp: k.lamp, ago: Math.round((now - k.at) * 10) / 10, dir: Math.round(k.dir * 100) / 100 }));
  }

  return { knock, heard, tick, selfView };
}
