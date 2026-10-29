// The website's server, as the game sees it: an account, the character kept with it, and the other players.
//
// Only the website has a server (api/game.js). Anywhere else (the page opened from a disk, the page published
// as an artifact) `available` is false, nothing here ever asks the network for anything, and the game is
// exactly what it was: one device, one character, kept on that device.
//
// Nothing secret is here or can be: the page holds no key. A signed-in browser carries a session cookie that
// this code cannot read; the server knows who is asking from that and from nothing the page says.

// How often this game tells the server where it stands and asks who else is in town (seconds): often with
// someone close enough to be watched walking, seldom with nobody about. Every asking is a request the site's
// host counts, so it is no more often than what is on screen needs.
export const ONLINE = Object.freeze({ timeout: 12000, presenceNear: 1.2, presenceMoving: 0.3, presenceFar: 4, presenceAlone: 10, near: 70, presenceStep: 0.15, carryOn: 2.2, settle: 0.3, fadeAfter: 1 });

// ---- a character, made small enough to send ----

const toBase64 = (bytes) => { let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(text); };
const fromBase64 = (text) => { const raw = atob(text); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i); return bytes; };
async function through(stream, bytes) {
  const writer = stream.writable.getWriter();
  writer.write(bytes); writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

// A saved game as text for the server: squeezed where the browser can (a tenth the size), plain where it cannot.
export async function packSave(save) {
  const json = JSON.stringify(save);
  if (typeof CompressionStream === 'function') {
    try { return { enc: 'gzip-b64', data: toBase64(await through(new CompressionStream('gzip'), new TextEncoder().encode(json))) }; } catch (error) { /* send it plain */ }
  }
  return { enc: 'json', data: json };
}

export async function unpackSave(packed) {
  if (!packed || typeof packed.data !== 'string') return null;
  try {
    if (packed.enc === 'json') return JSON.parse(packed.data);
    if (packed.enc === 'gzip-b64' && typeof DecompressionStream === 'function') return JSON.parse(new TextDecoder().decode(await through(new DecompressionStream('gzip'), fromBase64(packed.data))));
  } catch (error) { /* not a character */ }
  return null;
}

// ---- the server ----

// `ask(op, body)` never throws: it answers { ok: true, ... } or { ok: false, code, message }.
export function createOnline({ available = false, address = 'api/game', fetcher = null, timeout = ONLINE.timeout } = {}) {
  const send = fetcher || ((...args) => fetch(...args));
  const listeners = new Set();
  // state: 'off' (no server here), 'checking', 'out' (a server, nobody signed in), 'in', 'down' (a server that cannot be reached or has no database)
  const status = { state: available ? 'checking' : 'off', account: null, save: null, message: '' };
  const changed = () => { for (const fn of [...listeners]) fn(status); };
  const set = (patch) => { Object.assign(status, patch); changed(); };

  // A device that says it has no connection is believed: nothing is sent that is bound to fail.
  const cutOff = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  const OFFLINE = { ok: false, code: 'OFFLINE', message: 'The server could not be reached. Check the connection and try again.' };

  async function ask(op, body = {}, options = {}) {
    if (!available) return { ok: false, code: 'NO_SERVER', message: 'This copy of the game has no server.' };
    if (cutOff()) return OFFLINE;
    const control = typeof AbortController === 'function' ? new AbortController() : null;
    const wait = options.timeout || timeout;
    let timer = control ? setTimeout(() => control.abort(), wait) : 0;
    try {
      const response = await send(address, { method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: !!options.keepalive, headers: { 'Content-Type': 'application/json', 'X-PCW': '1' }, body: JSON.stringify({ op, ...body }), signal: control ? control.signal : undefined });
      // the server has answered: reading what it said has its own time, and is not cut short by the first clock
      if (control) { clearTimeout(timer); timer = setTimeout(() => control.abort(), wait); }
      let answer = null;
      try { answer = await response.json(); } catch (error) { answer = null; }
      if (!answer || typeof answer !== 'object' || typeof answer.ok !== 'boolean') return { ok: false, code: 'SERVER', message: 'The server did not answer properly. Try again in a moment.' };
      // the session ended somewhere else (signed out, or thirty days went by)
      if (!answer.ok && answer.code === 'SIGNED_OUT' && status.state === 'in') set({ state: 'out', account: null, save: null });
      return answer;
    } catch (error) {
      return OFFLINE;
    } finally {
      clearTimeout(timer);
    }
  }

  // Is there a server, and is this browser signed in?
  async function check() {
    if (!available) return status;
    let here = null;
    if (cutOff()) { set({ state: 'down', account: null, save: null, message: 'There is no connection.' }); return status; }
    try { const response = await send(address, { method: 'GET', cache: 'no-store', credentials: 'same-origin' }); here = await response.json(); } catch (error) { here = null; }
    if (!here || !here.ok || !here.accounts) { set({ state: 'down', account: null, save: null, message: here && here.ok ? 'Accounts are not set up on this site yet.' : 'The server could not be reached.' }); return status; }
    // (The first asking is made while the town is being built. On a slow device the page may not get round to
    // the answer before its own clock runs out, though the server answered at once: the request is then cut off
    // before the answer or half-way through reading it. One failure of that kind is not a server out of reach:
    // it is asked again, with longer to answer, before anyone is told so.)
    let me = await ask('me');
    if (!me.ok && (me.code === 'OFFLINE' || me.code === 'SERVER') && !cutOff()) me = await ask('me', {}, { timeout: 30000 });
    if (!me.ok) set({ state: 'down', account: null, save: null, message: me.message });
    else set(me.account ? { state: 'in', account: me.account, save: me.save || null, wallet: me.wallet || null, message: '' } : { state: 'out', account: null, save: null, wallet: null, message: '' });
    return status;
  }

  async function enter(op, username, password, extra) {
    const answer = await ask(op, { username, password, ...(extra || {}) }, { timeout: 20000 });
    if (answer.ok) set({ state: 'in', account: answer.account, save: answer.save || null, wallet: answer.wallet || null, message: '' });
    return answer;
  }

  return {
    available,
    status: () => status,
    get signedIn() { return status.state === 'in'; },
    get account() { return status.account; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ask, check,
    signUp: (username, password, save) => enter('signup', username, password, save ? { save } : null),
    logIn: (username, password) => enter('login', username, password),
    async logOut() { const answer = await ask('logout'); if (answer.ok || answer.code !== 'OFFLINE') set({ state: available ? 'out' : 'off', account: null, save: null }); return answer; },
    // the character kept with the account is now at this revision (or, `erased`: there is none, as of this one)
    noteSave(rev, erased = false) { if (status.state === 'in') status.save = erased ? { rev, erased: true } : { ...(status.save && !status.save.erased ? status.save : {}), rev }; },
    // the account's own character and path, as the server has just said they are
    noteCharacter(character) { if (status.state === 'in' && status.account && character) { status.account = { ...status.account, figure: character.figure || status.account.figure || null, path: character.path || status.account.path || null }; changed(); } },
  };
}

// ---- the other players ----

// A transport for the link (see transport.js): this player's state goes to the server about once a second, and
// what comes back is everyone else signed in and in the same town. Between two answers each of them is moved
// evenly from where they were to where they are, so that they walk and do not jump.
// `gun` (gun-net.js): the rounds this player has fired go with each word, the server's answer to them comes back with
// it, and the word goes soon after a round is fired, and as often as for someone moving fast while the gun is out.
// `voice` (voice-chat.js): the handshakes of voice chat go with each word too, and those for this player come back with it.
export function createWebTransport({ online, zone, now = () => Date.now() / 1000, every = setInterval, never = clearInterval, visible = () => true, gun = null, voice = null }) {
  let mine = null;                      // this player's latest state
  let handler = null;
  let busy = false, failed = false, closed = false;
  let last = -10;                       // when the server was last asked
  // (how often it has been asked and has answered, and when it last did: what the link reports, for the tests)
  const counts = { asked: 0, answered: 0, answeredAt: -1 };
  const peers = new Map();              // id -> { from, to, at, span }
  const lerp = (a, b, k) => a + (b - a) * k;
  const turn = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

  // Where a peer is shown now. Someone in or on a vehicle is carried on from where they were last heard (for up to
  // ONLINE.carryOn seconds, slowing after ONLINE.fadeAfter if nothing more is heard) the way they were going: at the speed they said, turning as they were turning, and
  // gathering or losing speed as they were (both worked out from the last two words), so that a fast vehicle is
  // shown where it is now and not where it was a second ago, round a bend as well as along a straight, and it stops
  // where it stops. The difference from where it was being shown when the word came is let go over ONLINE.settle
  // seconds (longer for a bigger difference), so it never jumps. Someone on foot (who can stop dead, and would be carried past where they stopped)
  // is moved from where they were shown to where they were heard, over the time between two words, as is anyone
  // whose game does not say how fast it is going.
  const speedOf = (st) => (Array.isArray(st.vl) ? Math.hypot(Number(st.vl[0]) || 0, Number(st.vl[1]) || 0) : 0);
  // (a keke or an okada, one of their own motorcycles, or one of their own cars: 18 October 2026, the cars were left
  // out when they came, and another player's car was moved in steps from where it had been heard to where it was)
  const carriedOn = (st) => Array.isArray(st.vl) && !!(st.vh || st.mb || st.mc);
  // from a state, `ahead` seconds on: { x, z, vx, vz }
  function carry(st, ahead, motion) {
    let x = st.x, z = st.z;
    let sp = speedOf(st), ang = Math.atan2(Number(st.vl[0]) || 0, Number(st.vl[1]) || 0);
    const steps = Math.max(1, Math.ceil(ahead / 0.05)), h = ahead / steps;
    for (let i = 0; i < steps; i += 1) {
      // (heard of no more for over a second: it is let slow to a stop, rather than run on and then be pulled back)
      const late = (i + 0.5) * h > ONLINE.fadeAfter ? 8 : 0;
      const next = Math.max(0, sp + (motion.accel - late) * h);
      const mid = (sp + next) / 2;
      ang += motion.turn * Math.exp(-((i + 0.5) * h) / 0.7) * h;        // (a bend ends: the turning is let go)
      x += Math.sin(ang) * mid * h; z += Math.cos(ang) * mid * h;
      sp = next;
      if (sp === 0) break;
    }
    return { x, z, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, turned: ang - Math.atan2(Number(st.vl[0]) || 0, Number(st.vl[1]) || 0) };
  }
  function placeOf(p, t) {
    const dt = Math.max(0, t - p.at);
    if (carriedOn(p.to)) {
      const settle = p.settle || ONLINE.settle, ahead = Math.min(dt + p.age, ONLINE.carryOn), fade = Math.exp(-dt / settle);
      const c = carry(p.to, ahead, p.motion);
      // (with the speed and way it is going now, the settling included, so the game carries it on from here the same way;
      // and facing the way it has turned since, round a bend as it goes)
      return { x: c.x + p.err.x * fade, z: c.z + p.err.z * fade, h: turn(p.from.h || 0, (p.to.h || 0) + c.turned, Math.min(1, dt / 0.25)), vl: [Math.round((c.vx - (p.err.x * fade) / settle) * 100) / 100, Math.round((c.vz - (p.err.z * fade) / settle) * 100) / 100] };
    }
    const k = Math.max(0, Math.min(1, dt / p.span));
    return { x: lerp(p.from.x, p.to.x, k), z: lerp(p.from.z, p.to.z, k), h: turn(p.from.h || 0, p.to.h || 0, k) };
  }
  function shown() {
    const t = now();
    const out = [];
    for (const [id, p] of peers) {
      const at = placeOf(p, t);
      out.push({ id, state: { ...p.to, x: Math.round(at.x * 100) / 100, z: Math.round(at.z * 100) / 100, h: at.h, ...(at.vl ? { vl: at.vl } : {}) } });
    }
    return out;
  }
  // How a vehicle was turning (radians a second) and gathering speed (m/s each second), from two words about it
  // `span` seconds apart; kept within what a vehicle can do, and only for one moving.
  function motionOf(before, after, span, was) {
    if (!before || !carriedOn(before) || !carriedOn(after) || span < 0.12 || span > 3) return { turn: 0, accel: 0 };
    const s0 = speedOf(before), s1 = speedOf(after);
    let accel = Math.max(-14, Math.min(9, (s1 - s0) / span));
    let d = Math.atan2(Number(after.vl[0]) || 0, Number(after.vl[1]) || 0) - Math.atan2(Number(before.vl[0]) || 0, Number(before.vl[1]) || 0);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    let turnRate = s0 > 2 && s1 > 2 ? Math.max(-1.6, Math.min(1.6, d / span)) : 0;
    if (Math.abs(accel) < 0.4) accel = 0;
    // a little of what it was doing before, so that one rough word does not throw it
    if (was) { turnRate = turnRate * 0.7 + was.turn * 0.3; accel = accel * 0.7 + was.accel * 0.3; }
    return { turn: turnRate, accel };
  }

  async function exchange() {
    if (busy || closed || !mine || !online.signedIn) return;
    busy = true; last = now();
    const asked = last;
    counts.asked += 1;
    const extra = gun ? gun.body() : null;
    const spoken = voice ? voice.body() : null;
    // (a word carrying rounds is given longer to be answered: the rounds are counted by the server only once each, so a
    // slow answer waited for is better than the same rounds sent again)
    const answer = await online.ask('presence', { zone, state: mine, ...(extra || {}), ...(spoken ? { voice: spoken } : {}) }, { timeout: extra && extra.fire ? 15000 : 6000 });
    busy = false;
    if (gun) gun.answer(answer.ok ? answer : null);
    if (voice) { if (answer.ok) voice.answer(answer.voice || null); else if (spoken && spoken.out && spoken.out.length) voice.unsent(spoken.out); }
    if (closed) return;
    failed = !answer.ok;
    // (an answer lost on the way: asked again at once, not after the usual wait)
    if (!answer.ok) { last = -10; return; }
    const t = now();
    counts.answered += 1; counts.answeredAt = t;
    const here = new Set();
    for (const peer of Array.isArray(answer.peers) ? answer.peers : []) {
      if (!peer || typeof peer.id !== 'string' || !peer.state || typeof peer.state !== 'object') continue;
      here.add(peer.id);
      const old = peers.get(peer.id);
      const at = old ? { ...old.to, ...placeOf(old, t) } : peer.state;
      // how old what they said is: as long ago as the server says it was told, and the way back here (half the
      // time the asking took); and when they said it, by this game's clock
      const age = Math.max(0, Math.min(3, (Number.isFinite(Number(peer.age)) ? Number(peer.age) : 0) + (t - asked) / 2));
      const said = t - age;
      const same = old && old.said !== undefined && Math.abs(said - old.said) < 0.05 && JSON.stringify(old.to) === JSON.stringify(peer.state);
      const motion = same ? old.motion : motionOf(old && old.to, peer.state, old ? said - old.said : 0, old && old.motion);
      const target = carriedOn(peer.state) ? carry(peer.state, Math.min(age, ONLINE.carryOn), motion) : peer.state;
      // (a jump further than they could have gone: shown there at once)
      const err = { x: at.x - target.x, z: at.z - target.z };
      const jumped = old && Math.hypot(err.x, err.z) > Math.max(25, speedOf(peer.state) * 3);
      if (same) continue;
      // (a bigger difference is let go over longer, so that it is never seen to snap)
      const settle = Math.min(0.9, ONLINE.settle + Math.hypot(err.x, err.z) / 15);
      // (a fall begun: shown where they are at once, not slid back from where they were carried on to; the game shows
      // the fall itself, falls.js)
      const fell = !!peer.state.dn && !(old && old.to && old.to.dn);
      peers.set(peer.id, { from: jumped || !old || fell ? peer.state : at, to: peer.state, at: t, age, said, motion, settle, span: Math.max(0.4, Math.min(4.5, old ? t - old.heard : 1)), heard: t, err: jumped || !old || fell ? { x: 0, z: 0 } : err });
    }
    for (const id of [...peers.keys()]) if (!here.has(id)) peers.delete(id);
  }

  const timer = every(() => {
    if (closed) return;
    if (handler) handler(online.signedIn ? shown() : []);
    if (!visible()) return;
    let wait = ONLINE.presenceAlone;
    if (peers.size) {
      wait = ONLINE.presenceFar;
      // (near someone with a gun out, or with one's own out, as often as for someone moving fast: aims and rounds)
      if (mine) for (const p of peers.values()) if (Math.hypot(p.to.x - mine.x, p.to.z - mine.z) < ONLINE.near) { wait = ONLINE.presenceNear; if (speedOf(p.to) > 2 || speedOf(mine) > 2 || p.to.gn || p.to.sh || (gun && gun.armed)) wait = ONLINE.presenceMoving; break; }
    }
    // rounds fired wait no longer than a moment to be told (the server counts them; another player may have been hit)
    if (gun && gun.urgent()) wait = Math.min(wait, ONLINE.presenceStep);
    // a voice chat handshake on its way, or one awaited: as soon as can be (and, with voice on and someone near, the
    // word goes as often as for someone moving, so that the voices are put in touch within a second or two)
    if (voice && voice.urgent()) wait = Math.min(wait, ONLINE.presenceStep * 2);
    else if (voice && voice.active && peers.size) wait = Math.min(wait, ONLINE.presenceNear);
    if (now() - last >= wait) exchange();
  }, ONLINE.presenceStep * 1000);

  return {
    kind: 'web',
    get failed() { return failed; },
    get counts() { return { asked: counts.asked, answered: counts.answered, quiet: counts.answeredAt < 0 ? null : Math.round((now() - counts.answeredAt) * 10) / 10 }; },
    // (a fall begun or ended, getting on or off a vehicle: told at once, not at the next usual time, so that the others
    // see it as soon as can be)
    publish(state) {
      const was = mine;
      mine = state;
      if (was && state && (!!was.dn !== !!state.dn || !!was.mb !== !!state.mb || !!was.mc !== !!state.mc || !!was.vh !== !!state.vh)) last = -10;
    },
    subscribe(fn) { handler = fn; return () => { handler = null; }; },
    close() { closed = true; never(timer); peers.clear(); if (online.signedIn) online.ask('presence', { zone, state: null }, { keepalive: true, timeout: 4000 }); },
  };
}
