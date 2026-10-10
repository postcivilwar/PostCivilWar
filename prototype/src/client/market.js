// The market, from the player's side: what the Property app asks for, and the settling of this world's money
// with what the shared market has recorded.
//
// The market itself is the server's (api/_lib/market.js): it decides what is for sale, who owns what and
// whether a sale happened. This file asks it, and keeps this world's ledger in step with its answers through
// the bridge in the simulation (sim/market.js):
//
//   to offer    the amount is set aside here first; only then is the offer sent. If the market refuses it, the
//               money comes straight back. If the answer never arrives, the money stays aside until the market
//               has said what became of the offer: it is never spent twice and never lost.
//   sync        every little while: each sale this player owes for is paid (once), each sale they are owed for
//               is received (once), and every offer that came to nothing has its money returned.
//
// It draws nothing and touches no page: the interface is ui-market.js.

export const MARKET_CLIENT = Object.freeze({ syncEvery: 45, listFor: 30 });

export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// online: the server (net/online.js). bridge(): the simulation's market bridge, or null with no character.
// playerId(): this player. zone: the town's id. notify(event): things the player should be told.
// saveSoon(): the character should be sent to the server soon, because money has moved.
export function createMarket({ online, bridge, playerId, zone, notify = () => {}, saveSoon = () => {}, id = newId }) {
  const state = { listings: [], all: [], listingsAt: -1e9, query: '', mine: null, unread: 0, toDecide: 0, error: '' };
  const inFlight = new Set();          // offers whose answer has not come back yet
  let syncing = false;
  let since = MARKET_CLIENT.syncEvery;

  const can = () => online.available && online.signedIn && !!bridge() && !!playerId();
  const fail = (code, message) => ({ ok: false, code, message });

  async function list(query = '') {
    const answer = await online.ask('market.list', { q: query });
    if (answer.ok) { state.listings = answer.listings; state.listingsAt = Date.now(); state.query = query; state.error = ''; if (!query) state.all = answer.listings; } else state.error = answer.message;
    return answer;
  }

  // Everything for sale, whatever is being searched for: where the markers stand in town.
  async function all() {
    const answer = await online.ask('market.list', { q: '' });
    if (answer.ok) state.all = answer.listings;
    return answer;
  }

  async function mine() {
    if (!online.signedIn) return fail('SIGNED_OUT', 'You are not signed in.');
    const answer = await online.ask('market.mine');
    if (answer.ok) { state.mine = answer; settle(answer); }
    return answer;
  }

  // Pays what is owed and receives what is due, from a list the market gave. Each is done once by the ledger.
  function settle(dues) {
    const b = bridge(), me = playerId();
    if (!b || !me) return false;
    let moved = false;
    for (const d of dues.debits || []) {
      const done = b.settle(me, { saleId: d.sale, offerId: d.offer, amount: d.amount, what: d.what });
      if (done.ok && !done.replayed) { moved = true; notify({ type: 'bought', what: d.what, amount: d.amount }); }
      if (!done.ok && done.code === 'INSUFFICIENT') notify({ type: 'owing', what: d.what, amount: d.amount });
      if (done.ok) moved = true;
    }
    for (const c of dues.credits || []) {
      const done = b.credit(me, { saleId: c.sale, amount: c.amount, what: c.what });
      if (done.ok && !done.replayed) notify({ type: 'sold', what: c.what, amount: c.amount });
      if (done.ok) moved = true;
    }
    return moved;
  }

  // The round: what became of my offers, what I owe, what I am owed, what is waiting for me.
  async function sync() {
    if (!can() || syncing) return null;
    syncing = true;
    try {
      const b = bridge(), me = playerId();
      const holds = b.view(me).holds.filter((h) => !inFlight.has(h.offerId));
      const answer = await online.ask('market.sync', { offers: holds.map((h) => h.offerId) });
      if (!answer.ok || bridge() !== b) return answer;
      let moved = settle(answer);
      for (const h of holds) {
        let status = answer.offers[h.offerId];
        if (status === 'unknown') {
          // the market never heard of it: have it say so for good, then take the money back
          const gone = await online.ask('market.withdraw', { offer: h.offerId });
          status = gone.ok ? gone.offer.status : 'pending';
        }
        if (status === 'declined' || status === 'withdrawn' || status === 'void') { if (b.release(me, h.offerId).released) { moved = true; notify({ type: 'returned', what: h.what, amount: h.amount, why: status }); } }
      }
      if (answer.unread > state.unread) notify({ type: 'message', count: answer.unread });
      if (answer.toDecide > state.toDecide) notify({ type: 'offer', count: answer.toDecide });
      state.unread = answer.unread; state.toDecide = answer.toDecide;
      if (moved) saveSoon();
      return answer;
    } finally { syncing = false; }
  }

  // A buyer offers `amount` (ledger units) in a conversation. At a shop this is the purchase.
  async function offer(thread, amount, what, after) {
    if (!can()) return fail('SIGNED_OUT', 'Sign in to buy.');
    const b = bridge(), me = playerId();
    const offerId = id();
    const held = b.hold(me, { offerId, amount, what });
    if (!held.ok) return held;
    inFlight.add(offerId);
    let answer;
    try { answer = await online.ask('market.offer', { thread, offer: offerId, amount, after }, { timeout: 20000 }); } finally { inFlight.delete(offerId); }
    if (answer.ok) {
      if (answer.sale) { b.settle(me, { saleId: answer.sale.id, offerId, amount: answer.sale.amount, what: answer.sale.what || what }); saveSoon(); }
      else if (answer.offer.status !== 'pending') b.release(me, offerId);
      else saveSoon();
    } else if (answer.code !== 'OFFLINE' && answer.code !== 'SERVER') b.release(me, offerId);   // a plain refusal: nothing was made
    // (no answer at all: the money stays aside until sync() learns what became of the offer)
    return answer;
  }

  async function withdraw(offerId) {
    const answer = await online.ask('market.withdraw', { offer: offerId });
    const b = bridge(), me = playerId();
    if (answer.ok && b && me && answer.offer.status !== 'pending' && answer.offer.status !== 'accepted') { b.release(me, offerId); saveSoon(); }
    return answer;
  }

  // The seller's answer. Yes is the sale: the money is received here at once.
  async function decide(offerId, accept, amount, after) {
    const answer = await online.ask('market.decide', { offer: offerId, accept: !!accept, amount, after }, { timeout: 20000 });
    const b = bridge(), me = playerId();
    if (answer.ok && answer.sale && b && me) { b.credit(me, { saleId: answer.sale.id, amount: answer.sale.amount, what: answer.sale.what }); saveSoon(); }
    return answer;
  }

  return {
    state, can, list, all, mine, sync, offer, withdraw, decide,
    open: (listing, at) => online.ask('market.open', { listing, at }),
    read: (thread, after) => online.ask('market.read', { thread, after }),
    say: (thread, text, after) => online.ask('market.say', { thread, text, after }),
    sell: (holding, price, place) => online.ask('market.sell', { holding, price, place, zone }),
    unlist: (listing) => online.ask('market.unlist', { listing }),
    adminAssets: () => online.ask('admin.assets'),
    adminList: (what) => online.ask('admin.list', { ...what, zone }),
    // what this world has paid and received, for the market to mark with the next save
    applied() { const b = bridge(), me = playerId(); if (!b || !me) return { debits: [], credits: [] }; const v = b.view(me); return { debits: v.paid.slice(-200), credits: v.credited.slice(-200) }; },
    held() { const b = bridge(), me = playerId(); return b && me ? b.view(me) : { holds: [], held: 0, paid: [], credited: [] }; },
    tick(dt) { since += dt; if (since >= MARKET_CLIENT.syncEvery) { since = 0; sync(); } },
    soon() { since = MARKET_CLIENT.syncEvery - 1.5; },
    reset() { state.mine = null; state.unread = 0; state.toDecide = 0; since = MARKET_CLIENT.syncEvery - 2; },
  };
}

// ---- the character and its account ----

// Keeps the character on this device and the copy with the account in step.
//   online           the server
//   read()           the saved game as it is now ({ host, playerId }), or null with no character
//   adopt(saved)     make this the game being played (and keep it on this device)
//   forget()         there is no character on this device any more
//   summary()        { name, figure, tr } for the account's own record
//   applied()        what the market is to be told has been paid and received
//   mark             { get(), set(value) }: kept on this device: which account its character belongs to, at which revision
//   pack / unpack    packSave and unpackSave
export function createAccountSync({ online, read, adopt, forget, summary, applied, mark, pack, unpack, notify = () => {}, every = 60 }) {
  let since = 0, busy = false, soonAt = 0;
  const who = () => (online.account ? online.account.username.toLowerCase() : null);
  const marked = () => { const m = mark.get(); return m && m.user === who() ? m : null; };

  async function fetchAndAdopt(why) {
    const answer = await online.ask('save.get', {}, { timeout: 30000 });
    if (!answer.ok) return answer;
    if (!answer.save) return { ok: true, adopted: false };
    const saved = await unpack(answer.save);
    if (!saved || !saved.host) return { ok: false, code: 'UNREADABLE', message: 'The character kept with your account could not be read on this device.' };
    // a character written by a newer version of the game than this page is: left alone, and never overwritten
    if (adopt(saved, why) === false) return { ok: false, code: 'UNREADABLE', message: 'The character kept with your account was made by a newer version of the game. Reload the page to play it.' };
    mark.set({ user: who(), rev: answer.save.rev });
    return { ok: true, adopted: true };
  }

  async function upload(options = {}) {
    if (busy || !online.signedIn) return null;
    const saved = read();
    if (!saved) return null;
    busy = true;
    try {
      const m = marked();
      const packed = await pack(saved);
      const answer = await online.ask('save.put', { baseRev: m ? m.rev : 0, ...packed, summary: summary(), applied: applied() }, { keepalive: !!options.keepalive && packed.data.length < 60000, timeout: 30000 });
      if (answer.ok) { mark.set({ user: who(), rev: answer.rev }); online.noteSave(answer.rev); }
      else if (answer.code === 'NEWER') { const got = await fetchAndAdopt('newer'); if (got.ok && got.adopted) notify({ type: 'newer' }); }
      return answer;
    } finally { busy = false; since = 0; }
  }

  // Signed in (just now, or found to be on opening the page): which copy of the character is the one to play?
  async function settle() {
    if (!online.signedIn) return { ok: true };
    const server = online.status().save;
    const m = marked();
    if (server && (!m || server.rev > m.rev)) return fetchAndAdopt(m ? 'newer' : 'account');
    if (!server && read()) return (await upload()) || { ok: true };
    return { ok: true, adopted: false };
  }

  return {
    upload, settle,
    get rev() { const m = marked(); return m ? m.rev : 0; },
    // a new account takes the character already on this device with it
    async signUp(username, password) {
      const saved = read();
      const packed = saved ? { ...(await pack(saved)), summary: summary() } : null;
      const answer = await online.signUp(username, password, packed);
      if (answer.ok) mark.set({ user: who(), rev: answer.save ? answer.save.rev : 0 });
      return answer;
    },
    async logIn(username, password) {
      const answer = await online.logIn(username, password);
      if (!answer.ok) return answer;
      const settled = await settle();
      return settled.ok ? { ...answer, adopted: !!settled.adopted } : { ...answer, warning: settled.message };
    },
    // the character goes to the account first; only then is this device signed out and cleared
    async logOut() {
      if (read()) { const sent = await upload(); if (sent && !sent.ok && sent.code !== 'NEWER') return { ok: false, code: sent.code, message: `Your character could not be saved to your account just now, so you are still signed in. ${sent.message}` }; }
      const answer = await online.logOut();
      if (answer.ok) { mark.set(null); forget(); }
      return answer;
    },
    soon() { soonAt = 4; },
    tick(dt) {
      if (!online.signedIn) return;
      since += dt;
      if (soonAt > 0) { soonAt -= dt; if (soonAt <= 0) { upload(); return; } }
      if (since >= every) upload();
    },
  };
}
