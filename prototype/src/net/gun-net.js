// The guns' word with the website's server (25 October 2026): the rounds this player's game has fired, sent with its
// next word about where the player is (online.js, `presence`), and what the server answers: which it counted, which it
// refused and why, which of those that struck another player it agrees hit them; and the hits on this player from
// other players' rounds that the server has agreed and this game has not yet taken (`struck`), with the number of the
// last one it has taken (`ack`), so that none is taken twice and none lost on the way.
//
// Each round: [its number in this session (from 1), when it was fired by this page's clock (seconds), the gun, where
// from [x, y, z], which way [x, y, z], and, where this game saw it strike another player, { who, at }]. The session
// (`sid`) is this page's: opened again, the page starts a new one, and the server counts from 1 again (api/_lib/guns.js).
// A reload, once it is done here, goes the same way, in its place among the rounds (`reload`): [the number of the last
// round fired before it, when it began, the gun]; the server counts it there, after those rounds and before the next,
// however late the word comes. (One stopped part way, the gun put away, is never told: nothing was moved.)
//
// Rounds not yet answered are sent again with the next word if a word is lost; the server counts each only once (by
// its number). Rounds too old to matter (not answered within STALE seconds, the connection lost) are let go: two
// minutes, so that a slow connection (words taking seconds, lost and sent again) still has every round counted.

const STALE = 120;            // seconds a round waits to be told before it is let go
const MOST = 24;              // rounds in one word (the server takes no more)
const MOST_WAITING = 64;

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

export function createGunNet({ now = () => performance.now() / 1000, random = Math.random } = {}) {
  const sid = `s${Date.now().toString(36)}${Math.floor(random() * 1e9).toString(36)}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30);
  let seq = 0;
  let waiting = [];            // [{ shot, at }]
  let flying = [];             // sent, not yet answered
  let reloads = [];            // [{ ev: [after, t, gun], at }] done here, not yet answered
  let reloadsFlying = [];
  let ack = 0;                 // the last hit on this player this game has taken
  let armed = false;           // the gun is out (the word goes more often)
  const handlers = new Set();
  const stats = { sent: 0, answered: 0, ok: 0, refused: 0, hits: 0, struck: 0, lost: 0, reloads: 0, codes: {} };

  // A round fired: queued for the next word. Gives its number.
  function fire({ t, gun, o, d, hit = null }) {
    seq += 1;
    const shot = [seq, r4(t), gun, o.map(r2), d.map(r4)];
    if (hit && /^u[0-9a-f]{20}$/.test(hit.who || '')) shot.push({ who: hit.who, at: hit.at.map(r2) });
    waiting.push({ shot, at: now() });
    if (waiting.length > MOST_WAITING) { waiting.splice(0, waiting.length - MOST_WAITING); stats.lost += 1; }
    return seq;
  }
  // A reload done here (`after`: the number of the last round fired before it; `t`: when it began, by this page's clock)
  function reload({ gun, t, after = seq }) {
    reloads.push({ ev: [after, r4(t), gun], at: now() });
    if (reloads.length > 8) reloads.splice(0, reloads.length - 8);
  }
  // What goes with the next word: the rounds waiting (the oldest first), the reloads among them (each only once every
  // round before it goes with it or has gone), and the last hit taken.
  function body() {
    const t = now();
    const before = waiting.length;
    waiting = waiting.filter((w) => t - w.at < STALE);
    stats.lost += before - waiting.length;
    reloads = reloads.filter((r) => t - r.at < STALE);
    flying = waiting.splice(0, MOST);
    const next = waiting.length ? waiting[0].shot[0] : Infinity;
    reloadsFlying = reloads.filter((r) => r.ev[0] < next);
    reloads = reloads.filter((r) => r.ev[0] >= next);
    const out = { ack };
    if (flying.length || reloadsFlying.length) {
      out.fire = { sid, s: flying.map((w) => w.shot) };
      if (reloadsFlying.length) out.fire.r = reloadsFlying.map((r) => r.ev);
      stats.sent += flying.length;
    }
    return out;
  }
  // The server's answer (null: the word was lost; what was sent goes again with the next).
  function answer(reply) {
    if (!reply) { if (flying.length) waiting.unshift(...flying); flying = []; if (reloadsFlying.length) reloads.unshift(...reloadsFlying); reloadsFlying = []; return; }
    const sent = flying; flying = [];
    const sentReloads = reloadsFlying; reloadsFlying = [];
    stats.answered += 1;
    const fire = reply.fire && typeof reply.fire === 'object' ? reply.fire : null;
    // (the server could not take the rounds just now, too many at once, or busy: they go again with a later word; ones
    // it could never take, a word it could not read, are let go)
    if (fire && fire.error) {
      stats.codes[fire.error] = (stats.codes[fire.error] || 0) + 1;
      if (fire.error !== 'BAD_REQUEST') { if (sent.length) waiting.unshift(...sent); if (sentReloads.length) reloads.unshift(...sentReloads); }
    } else if (sentReloads.length) {
      // each reload answered (counted, or refused with its reason) is done with; one the answer says nothing of goes again
      const told = new Map((fire && Array.isArray(fire.r) ? fire.r : []).filter(Array.isArray).map(([after, code]) => [after, code]));
      for (const r of sentReloads) {
        if (!told.has(r.ev[0])) { reloads.unshift(r); continue; }
        const code = told.get(r.ev[0]);
        if (code === 'ok') stats.reloads += 1; else { stats.refused += 1; stats.codes[code] = (stats.codes[code] || 0) + 1; }
      }
    }
    if (fire) {
      stats.ok += Array.isArray(fire.ok) ? fire.ok.length : 0;
      for (const [, code] of Array.isArray(fire.no) ? fire.no : []) { stats.refused += 1; stats.codes[code] = (stats.codes[code] || 0) + 1; }
      stats.hits += Array.isArray(fire.hit) ? fire.hit.length : 0;
    }
    const struck = Array.isArray(reply.struck) ? reply.struck.filter((s) => s && Number.isSafeInteger(s.id) && s.id > ack) : [];
    stats.struck += struck.length;
    for (const fn of handlers) fn({ fire, struck, sent: sent.map((w) => w.shot), waiting: waiting.length });
  }
  return {
    sid, fire, reload, body, answer, stats,
    // (the number of the last round fired)
    get seq() { return seq; },
    // (the hits on this player are taken: the next word says so)
    took(id) { if (Number.isSafeInteger(id) && id > ack) ack = id; },
    get ack() { return ack; },
    // should the next word go soon? (rounds or a reload are waiting to be told)
    urgent: () => waiting.length > 0 || reloads.length > 0,
    // the gun is out: the words go as often as for someone moving fast, so that the others see the aim follow
    get armed() { return armed; },
    set armed(on) { armed = !!on; },
    get waiting() { return waiting.length + flying.length + reloads.length + reloadsFlying.length; },
    onAnswer(fn) { handlers.add(fn); return () => handlers.delete(fn); },
  };
}
