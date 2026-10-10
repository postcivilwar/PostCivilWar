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
export const ONLINE = Object.freeze({ timeout: 12000, presenceNear: 1.2, presenceFar: 4, presenceAlone: 10, near: 70, presenceStep: 0.15 });

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
    const timer = control ? setTimeout(() => control.abort(), options.timeout || timeout) : 0;
    try {
      const response = await send(address, { method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: !!options.keepalive, headers: { 'Content-Type': 'application/json', 'X-PCW': '1' }, body: JSON.stringify({ op, ...body }), signal: control ? control.signal : undefined });
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
    const me = await ask('me');
    if (!me.ok) set({ state: 'down', account: null, save: null, message: me.message });
    else set(me.account ? { state: 'in', account: me.account, save: me.save || null, message: '' } : { state: 'out', account: null, save: null, message: '' });
    return status;
  }

  async function enter(op, username, password, extra) {
    const answer = await ask(op, { username, password, ...(extra || {}) }, { timeout: 20000 });
    if (answer.ok) set({ state: 'in', account: answer.account, save: answer.save || null, message: '' });
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
    noteSave(rev) { if (status.state === 'in') status.save = { ...(status.save || {}), rev }; },
  };
}

// ---- the other players ----

// A transport for the link (see transport.js): this player's state goes to the server about once a second, and
// what comes back is everyone else signed in and in the same town. Between two answers each of them is moved
// evenly from where they were to where they are, so that they walk and do not jump.
export function createWebTransport({ online, zone, now = () => Date.now() / 1000, every = setInterval, never = clearInterval, visible = () => true }) {
  let mine = null;                      // this player's latest state
  let handler = null;
  let busy = false, failed = false, closed = false;
  let last = -10;                       // when the server was last asked
  const peers = new Map();              // id -> { from, to, at, span }
  const lerp = (a, b, k) => a + (b - a) * k;
  const turn = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

  function shown() {
    const t = now();
    const out = [];
    for (const [id, p] of peers) {
      const k = Math.max(0, Math.min(1, (t - p.at) / p.span));
      out.push({ id, state: { ...p.to, x: Math.round(lerp(p.from.x, p.to.x, k) * 100) / 100, z: Math.round(lerp(p.from.z, p.to.z, k) * 100) / 100, h: turn(p.from.h || 0, p.to.h || 0, k) } });
    }
    return out;
  }

  async function exchange() {
    if (busy || closed || !mine || !online.signedIn) return;
    busy = true; last = now();
    const answer = await online.ask('presence', { zone, state: mine }, { timeout: 6000 });
    busy = false;
    if (closed) return;
    failed = !answer.ok;
    if (!answer.ok) return;
    const t = now();
    const here = new Set();
    for (const peer of Array.isArray(answer.peers) ? answer.peers : []) {
      if (!peer || typeof peer.id !== 'string' || !peer.state || typeof peer.state !== 'object') continue;
      here.add(peer.id);
      const old = peers.get(peer.id);
      const at = old ? shownOf(old, t) : peer.state;
      const jumped = old && Math.hypot(peer.state.x - at.x, peer.state.z - at.z) > 25;
      peers.set(peer.id, { from: jumped || !old ? peer.state : at, to: peer.state, at: t, span: Math.max(0.4, Math.min(4.5, old ? t - old.heard : 1)), heard: t });
    }
    for (const id of [...peers.keys()]) if (!here.has(id)) peers.delete(id);
  }
  function shownOf(p, t) { const k = Math.max(0, Math.min(1, (t - p.at) / p.span)); return { ...p.to, x: lerp(p.from.x, p.to.x, k), z: lerp(p.from.z, p.to.z, k), h: turn(p.from.h || 0, p.to.h || 0, k) }; }

  const timer = every(() => {
    if (closed) return;
    if (handler) handler(online.signedIn ? shown() : []);
    if (!visible()) return;
    let wait = ONLINE.presenceAlone;
    if (peers.size) {
      wait = ONLINE.presenceFar;
      if (mine) for (const p of peers.values()) if (Math.hypot(p.to.x - mine.x, p.to.z - mine.z) < ONLINE.near) { wait = ONLINE.presenceNear; break; }
    }
    if (now() - last >= wait) exchange();
  }, ONLINE.presenceStep * 1000);

  return {
    kind: 'web',
    get failed() { return failed; },
    publish(state) { mine = state; },
    subscribe(fn) { handler = fn; return () => { handler = null; }; },
    close() { closed = true; never(timer); peers.clear(); if (online.signedIn) online.ask('presence', { zone, state: null }, { keepalive: true, timeout: 4000 }); },
  };
}
