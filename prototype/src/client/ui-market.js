// Property on the phone: what the player owns, what is for sale, and the conversation in which a thing is
// bought or sold.
//
// Everything shown here is the shared market's own record, asked for when the page is opened and again as it
// changes: nothing is invented on this side. What it cannot show (no connection, nobody signed in, a copy of
// the game with no server) it says plainly, and offers only the buttons that will do something.
//
//   the Property page   the things owned, the way into the market, conversations, land, history
//   the market          every open listing, searched by name; each can be turned by hand
//   one listing         a larger look, the model itself on request, and the way to the seller's marker
//   the deal            a conversation on the handset, as in any messaging app, with the offer and the sale in it
//
// kit: the pieces the phone is made of (ui-phone.js). go(state) moves about inside the app.

import { createTurntable, createModelView, ASSET_MODELS } from './asset-view.js';
import { createActionButton } from './action-button.js';

const SEARCHES = Object.freeze(['Watch', 'Car', 'Yacht', 'Bike', 'Motorcycle', 'Gun', 'Clothes']);
const POLL = 1300;                    // how often an open conversation asks for what is new (milliseconds)

export function createMarketUI(kit) {
  const { app, h, redraw, section, line, tr, trPlain, trIn } = kit;
  const m = {
    loaded: false, loading: false, mine: null, mineError: '', query: '', searchTimer: 0, searching: false,
    note: null,                     // { good, text }: what the last action answered
    viewer: null,                   // the model drawn live: { view, id }
    deal: null,                     // the open conversation
    tables: [],                     // turntables on the page, to be stopped when it is redrawn
  };
  const market = () => app.market;
  const online = () => app.online;
  const here = () => !!(market() && online() && online().available);
  const signedIn = () => here() && online().signedIn;
  const balance = () => app.view().self.balance;
  // what can be spent on a thing to own: TR that was earned (the arrival money does not buy assets)
  const spendable = () => { const f = app.view().self.funds; return f && Number.isSafeInteger(f.eligible) ? f.eligible : balance(); };
  const say = (good, text) => { m.note = { good, text }; };
  const noteBox = () => { if (!m.note) return null; const n = m.note; m.note = null; return h('div', { class: `notice${n.good ? ' good' : ''}`, role: 'status' }, n.text); };

  function tidy() {
    for (const t of m.tables) t.dispose();
    m.tables = [];
  }
  function dropViewer() { if (m.viewer) { m.viewer.view.dispose(); m.viewer = null; } }
  const turntable = (model, size, still) => { const t = createTurntable(model, { size, still }); m.tables.push(t); return t.el; };

  // a server that has answered, signed in or not
  const up = () => here() && ['in', 'out'].includes(online().status().state);

  async function refresh(force) {
    if (!up() || m.loading) return;
    if (m.loaded && !force) return;
    m.loading = true;
    const jobs = [market().list(m.query)];
    if (signedIn()) jobs.push(market().mine());
    const [, mine] = await Promise.all(jobs);
    if (mine) { if (mine.ok) { m.mine = mine; m.mineError = ''; } else m.mineError = mine.message; }
    m.loading = false; m.loaded = true;
    redraw();
  }

  // ---- the page ----

  // A motorcycle's engine, heard before it is bought or before it is ridden (audio.js previewBike): its key (the
  // starter, then idle; pressed again, it is switched off), Rev (held: the revs climb to its red line; let go: back
  // to idle) and Horn (held for as long as it sounds). One engine at a time: another bike's page, getting on a bike
  // or leaving the page stops it. Rev and Horn are action buttons (action-button.js): they let go however the finger
  // leaves them, so nothing is left revving.
  const bikeOf = (model) => (typeof model === 'string' && model.startsWith('bike:') ? model.slice(5) : null);
  function engineControls(bikeId) {
    const mine = () => (m.sound && m.sound.id === bikeId ? m.sound : null);
    const ensure = () => { if (!mine()) { quiet(); m.sound = app.bikeSound(bikeId); } return mine(); };
    const key = h('button', { class: 'btn', type: 'button', id: 'bike-ignition' });
    const rev = createActionButton({ id: 'bike-rev', kind: 'hold', onDown: () => { const c = mine(); if (c) c.revHold(true); }, onUp: () => { const c = mine(); if (c) c.revHold(false); } });
    const horn = createActionButton({ id: 'bike-horn', kind: 'hold', onDown: () => { const c = ensure(); if (c) c.hornHold(true); }, onUp: () => { const c = mine(); if (c) c.hornHold(false); } });
    rev.el.id = 'bike-rev'; horn.el.id = 'bike-horn';
    for (const [b, label] of [[rev, 'Rev'], [horn, 'Horn']]) { b.el.className = 'btn hold'; b.el.textContent = label; b.el.title = `Hold to ${label.toLowerCase()}`; }
    const show = () => {
      const on = !!mine() && mine().running;
      key.textContent = on ? 'Switch off' : 'Start engine';
      key.classList.toggle('primary', on);
      key.setAttribute('aria-pressed', String(on));
      rev.el.disabled = !on;
      if (!on) rev.release();
    };
    key.onclick = () => { const c = ensure(); if (c) c.ignite(); show(); };
    show();
    return h('div', { class: 'actions', id: 'bike-engine' }, key, rev.el, horn.el);
  }
  function quiet() { if (m.sound) { m.sound.stop(); m.sound = null; } else app.stopBikeSound(); }

  function page(root, view, sub, go) {
    tidy();
    // the engine stops when its page is left
    { const l = sub.asset ? market().state.listings.find((x) => x.id === sub.asset) : null; const own = sub.own && m.mine ? m.mine.holdings.find((x) => x.id === sub.own) : null; const here = bikeOf((l || own || { asset: {} }).asset.model); if (m.sound && m.sound.id !== here) quiet(); }
    if (!sub.asset && !sub.own) dropViewer();
    const box = noteBox();
    if (box) root.append(box);
    if (sub.market) { if (sub.asset) listingPage(root, sub, go); else marketPage(root, sub, go); return; }
    if (sub.own) { ownedPage(root, view, sub, go); return; }
    if (sub.admin) { adminPage(root, view, go); return; }
    home(root, view, sub, go);
  }

  function accountPrompt(text) {
    return h('div', { class: 'callout' }, h('p', null, text),
      h('div', { class: 'hxrow' },
        h('button', { class: 'hx', type: 'button', id: 'market-signup', onclick: () => app.account.open('signup') }, 'Create account'),
        h('button', { class: 'hx', type: 'button', id: 'market-login', onclick: () => app.account.open('login') }, 'Log in')));
  }

  function home(root, view, sub, go) {
    if (up() && !m.loaded) refresh();
    root.append(h('div', { class: 'propertyhead' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Property'), h('div', { class: 'big' }, 'What you own')),
      signedIn() ? h('div', { class: 'who' }, h('span', { class: 'eyebrow' }, 'Account'), h('b', null, online().account.username)) : null));

    root.append(section('Assets'));
    if (!here()) root.append(h('p', { class: 'small' }, 'Things are bought and sold in a market that every player shares. It is on postcivilwar.com; this copy of the game has no connection to it.'));
    else if (!up()) root.append(h('p', { class: 'small' }, online().status().state === 'checking' ? 'Asking the server...' : `The market cannot be reached just now. ${online().status().message || ''}`));
    else if (!signedIn()) root.append(accountPrompt('What you buy belongs to your account, so that it is yours on any device. Make one, or log in, to own and to sell. Anyone may look at what is for sale.'));
    else if (m.mineError) root.append(h('div', { class: 'notice' }, m.mineError), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => refresh(true) }, 'Try again')));
    else if (!m.mine) root.append(h('p', { class: 'small' }, 'Asking the market what is yours...'));
    else if (!m.mine.holdings.length) root.append(h('p', { class: 'small', id: 'no-assets' }, 'You own nothing from the market yet.'));
    else root.append(h('div', { class: 'assetgrid', id: 'my-assets' }, m.mine.holdings.map((item) => h('button', { class: 'assetcard', type: 'button', 'data-holding': item.id, onclick: () => go({ own: item.id }) },
      turntable(item.asset.model, 112, true),
      h('span', { class: 'what' }, h('b', null, item.asset.name), item.serial ? h('span', { class: 'serial' }, `No. ${item.serial} of ${item.edition}`) : null,
        h('span', { class: 'eyebrow' }, item.listing ? `For sale at ${tr(item.listing.price)}` : item.paid ? `Bought for ${tr(item.paid)}` : 'Yours')))))) ;

    const held = market() ? market().held() : { held: 0, holds: [] };
    if (held.held > 0) root.append(line('Set aside for your offers', tr(held.held)));
    if (up()) root.append(h('button', { class: 'hx primary wide', type: 'button', id: 'buy-asset', onclick: () => go({ market: true }) }, 'Buy asset'));

    if (signedIn() && m.mine && m.mine.threads.length) {
      root.append(section('Conversations'));
      root.append(h('div', { class: 'rows' }, m.mine.threads.map((t) => h('button', { class: 'threadrow', type: 'button', 'data-thread': t.id, onclick: () => app.openDeal({ thread: t.id }) },
        h('span', { class: 'avatar' }, (t.other || '?').slice(0, 1).toUpperCase()),
        h('span', { class: 'what' }, h('b', null, t.other), h('span', { class: 'eyebrow' }, t.name), h('span', { class: 'last' }, lastLine(t))),
        t.offer && t.role === 'seller' ? h('span', { class: 'tag hot' }, `Offer ${tr(t.offer.amount)}`) : t.unread ? h('span', { class: 'count' }, String(t.unread)) : null))));
    }

    root.append(section('Land and buildings'));
    kit.legacy.property(root);

    if (signedIn() && m.mine && m.mine.history.length) {
      root.append(section('Bought and sold'));
      root.append(h('div', { class: 'rows', id: 'market-history' }, m.mine.history.map((row) => h('div', { class: 'line' },
        h('span', null, row.name, h('div', { class: 'eyebrow plain' }, `${row.side === 'bought' ? 'Bought from' : 'Sold to'} ${row.other} · ${new Date(row.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`)),
        h('span', { class: row.side === 'sold' ? 'pos' : 'neg' }, `${row.side === 'sold' ? '+' : '−'}${tr(row.amount)}`)))));
    }
    if (signedIn() && online().account.admin) root.append(section('Administrator'), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'admin-list', onclick: () => go({ admin: true }) }, 'Put something new on the market')));
  }

  const lastLine = (t) => {
    const l = t.last || {};
    if (l.kind === 'offer') return `Offer: ${tr(l.amount)}`;
    if (l.kind === 'accepted') return l.body || 'Sold';
    if (l.kind === 'declined') return l.body || 'Offer refused';
    if (l.kind === 'withdrawn') return 'Offer withdrawn';
    return l.body || '';
  };

  // ---- the market ----

  function search(value) {
    m.query = value;
    clearTimeout(m.searchTimer);
    m.searchTimer = setTimeout(async () => { m.searching = true; await market().list(m.query); m.searching = false; redrawList(); }, 260);
  }
  let listBox = null;
  function redrawList() { if (listBox && listBox.isConnected) drawListings(listBox, m.go); else redraw(); }

  function drawListings(box, go) {
    for (const t of m.tables) t.dispose();
    m.tables = [];
    box.replaceChildren();
    const s = market().state;
    if (s.error) { box.append(h('div', { class: 'notice' }, s.error)); return; }
    if (!m.loaded && !s.listings.length) { box.append(h('p', { class: 'small' }, 'Asking the market what is for sale...')); return; }
    if (!s.listings.length) {
      box.append(h('p', { class: 'empty', id: 'market-empty' }, m.query ? `Nothing for sale matches "${m.query}".` : 'Nothing is for sale just now.'));
      if (m.query) box.append(h('p', { class: 'small' }, 'Only things that are really for sale are listed. New things come to the market when the government puts them there or a player sells what they own.'));
      return;
    }
    for (const l of s.listings) {
      box.append(h('div', { class: 'listing', 'data-listing': l.id },
        turntable(l.asset.model, 132, false),
        h('div', { class: 'what' },
          h('b', null, l.name),
          h('span', { class: 'price' }, tr(l.price)),
          h('span', { class: 'eyebrow plain' }, `${l.mine ? 'Your listing' : `Sold by ${l.seller}`} · ${l.place.label}`),
          l.kind === 'primary' ? h('span', { class: 'tag' }, l.asset.category === 'motorcycle' ? 'New' : `${l.left} of ${l.stock} left`) : null,
          h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => go({ market: true, asset: l.id }) }, 'View')))));
    }
  }

  function marketPage(root, sub, go) {
    m.go = go;
    if (!m.loaded) refresh();
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, 'The market'), h('div', { class: 'big' }, 'For sale'))));
    const input = h('input', { class: 'field', id: 'market-search', type: 'search', placeholder: 'Search: watch, car, yacht, bike...', value: m.query, maxlength: '60', autocapitalize: 'none', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Search what is for sale' });
    input.addEventListener('input', () => search(input.value.trim()));
    root.append(h('div', { class: 'searchbar' }, input));
    root.append(h('div', { class: 'chips', role: 'group', 'aria-label': 'Search for' },
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!m.query), onclick: () => { input.value = ''; search(''); redrawChips(); } }, 'All'),
      SEARCHES.map((word) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(m.query.toLowerCase() === word.toLowerCase()), onclick: () => { input.value = word; search(word); redrawChips(); } }, word))));
    const redrawChips = () => { for (const chip of root.querySelectorAll('.chip')) chip.setAttribute('aria-pressed', String(chip.textContent === 'All' ? !m.query : m.query.toLowerCase() === chip.textContent.toLowerCase())); };
    listBox = h('div', { class: 'listings', id: 'listings', 'aria-live': 'polite' });
    root.append(listBox);
    drawListings(listBox, go);
  }

  // The thing itself, larger: turned by hand from its photographs, or, asked for, the model itself.
  function viewerBox(modelId, key) {
    const stage = h('div', { class: 'viewer' });
    const model = ASSET_MODELS[modelId];
    if (m.viewer && m.viewer.id === key) { stage.append(m.viewer.view.canvas); stage.classList.add('live'); return h('div', { class: 'viewerwrap' }, stage, h('p', { class: 'small' }, 'This is the model itself. Drag to turn it any way; pinch or use the wheel to come closer.')); }
    stage.append(turntable(modelId, 300, false));
    const wrap = h('div', { class: 'viewerwrap' }, stage);
    if (model) {
      const status = h('p', { class: 'small', id: 'model-status' }, `Drag to turn it. These are photographs of the model; the model itself is ${model.megabytes} MB.`);
      const button = h('button', { class: 'btn', type: 'button', id: 'load-model', onclick: async () => {
        button.disabled = true;
        const canvas = h('canvas', { class: 'modelcanvas', 'aria-label': 'The model, drag to turn' });
        let view;
        try {
          view = createModelView(canvas);
          status.textContent = 'Fetching the model: 0%';
          await view.load(modelId, (got, total) => { status.textContent = `Fetching the model: ${Math.min(99, Math.round((got / total) * 100))}% of ${model.megabytes} MB`; });
          dropViewer();
          m.viewer = { view, id: key };
          view.start();
          redraw();
        } catch (error) {
          if (view) view.dispose();
          status.textContent = `${error.message || 'The model could not be shown on this device.'} The photographs above are of the same model.`;
          button.disabled = false;
        }
      } }, `See the model itself in 3D (${model.megabytes} MB)`);
      wrap.append(status, h('div', { class: 'actions' }, button));
    }
    return wrap;
  }

  function listingPage(root, sub, go) {
    const l = market().state.listings.find((x) => x.id === sub.asset);
    if (!l) { root.append(h('p', { class: 'empty' }, 'That is no longer for sale.'), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => go({ market: true }) }, 'Back to the market'))); return; }
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, l.asset.category), h('div', { class: 'big' }, l.name))));
    root.append(viewerBox(l.asset.model, `listing:${l.id}`));
    root.append(h('div', { class: 'rows' },
      line('Price', tr(l.price), 'strong'),
      line(l.kind === 'primary' ? 'Sold by' : 'Owner', l.seller),
      l.kind === 'primary' && l.asset.category !== 'motorcycle' ? line('Left', `${l.left} of ${l.stock}`) : null,
      line('Where', l.place.label)));
    if (l.asset.blurb) root.append(h('p', null, l.asset.blurb));
    const bike = bikeOf(l.asset.model);
    if (bike) {
      // its engine, and what pays for it
      root.append(engineControls(bike));
      const owned = m.mine && m.mine.holdings.some((x) => x.asset.id === l.asset.id);
      root.append(h('p', { class: 'small', id: 'bike-terms' }, owned ? 'You own this motorcycle. One of each to an account: ride yours from Property.' : l.kind === 'primary' ? 'A motorcycle may be paid for with any of your TR, the arrival money included. One of each motorcycle to an account.' : 'Bought from another player, a motorcycle is paid for with TR you have earned.'));
    }
    const self = app.view().self;
    const far = Math.round(Math.hypot(l.place.x - self.x, l.place.z - self.z));
    if (l.mine) {
      root.append(h('p', { class: 'small' }, 'This is your own listing. A buyer who comes to its marker will write to you, and their offer will appear under Conversations.'));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn danger', type: 'button', onclick: async () => { const r = await market().unlist(l.id); say(r.ok, r.ok ? 'It is off the market.' : r.message); await refresh(true); go({}); } }, 'Take it off the market')));
      return;
    }
    root.append(h('p', { class: 'small' }, `Things are bought face to face. ${l.kind === 'primary' ? `Go to ${l.seller}` : `Go to where ${l.seller} is selling it`}: a pink marker stands there, ${far} m from you. Step into it to talk about the price and to buy.`));
    root.append(h('div', { class: 'hxrow' },
      h('button', { class: 'hx primary', type: 'button', id: 'go-there', onclick: () => app.goToListing(l) }, 'Show the way'),
      h('button', { class: 'hx', type: 'button', onclick: () => app.openPhone('map', { place: { x: l.place.x, z: l.place.z, label: l.place.label } }) }, 'See it on the map')));
  }

  // ---- something owned ----

  function ownedPage(root, view, sub, go) {
    const item = m.mine ? m.mine.holdings.find((x) => x.id === sub.own) : null;
    if (!item) { root.append(h('p', { class: 'empty' }, 'That is not among your things.'), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => go({}) }, 'Back'))); return; }
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, 'Yours'), h('div', { class: 'big' }, item.name))));
    root.append(viewerBox(item.asset.model, `own:${item.id}`));
    root.append(h('div', { class: 'rows' },
      item.serial ? line('Number', `${item.serial} of ${item.edition}`) : null,
      item.paid ? line('You paid', tr(item.paid)) : null,
      line('Yours since', new Date(item.acquiredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))));
    const bike = bikeOf(item.asset.model);
    if (bike && !item.listing) {
      // riding it: from where the player stands, or where they left it
      root.append(h('div', { class: 'hxrow' },
        h('button', { class: 'hx primary', type: 'button', id: 'ride-bike', onclick: () => { quiet(); const r = app.rideBike(bike); if (r && !r.ok) { say(false, r.message); redraw(); } } }, 'Ride it')));
      root.append(engineControls(bike));
      root.append(h('p', { class: 'small' }, 'It is brought to you where you stand, outdoors; or, if you are beside where you left it, you get on it there. Get off with the button you got on with.'));
    }
    if (item.listing) {
      root.append(h('div', { class: 'notice good' }, `It is for sale at ${tr(item.listing.price)}. A buyer who comes to its marker will write to you.`));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn danger', type: 'button', id: 'unlist', onclick: async () => { const r = await market().unlist(item.listing.id); say(r.ok, r.ok ? 'It is off the market.' : r.message); await refresh(true); } }, 'Take it off the market')));
      return;
    }
    root.append(section('Sell it'));
    const where = app.placeName(view.self.x, view.self.z);
    const price = h('input', { class: 'field', id: 'sell-price', type: 'number', inputmode: 'decimal', min: '0.5', step: '0.5', placeholder: item.paid ? trPlain(item.paid) : '100', 'aria-label': 'Your price in TR' });
    root.append(h('p', { class: 'small' }, `Name your price. A pink marker will stand where you are now (${where}); a buyer steps into it to write to you and to make an offer. Nothing is sold until you say yes to an offer.`));
    root.append(h('div', { class: 'sellrow' }, h('label', { class: 'pricefield' }, price, h('span', null, 'TR')),
      h('button', { class: 'hx primary', type: 'button', id: 'sell-here', onclick: async (event) => {
        const units = trIn(price.value);
        if (!units || units <= 0) { say(false, 'Type a price in TR.'); redraw(); return; }
        event.currentTarget.disabled = true;
        const self = app.view().self;
        const r = await market().sell(item.id, units, { x: self.x, z: self.z, label: where });
        say(r.ok, r.ok ? `It is for sale at ${tr(units)}. Your marker stands here.` : r.message);
        await refresh(true);
        if (r.ok) app.marketChanged();
      } }, 'Put it up for sale')));
  }

  // ---- the administrator ----

  function adminPage(root, view, go) {
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, 'Administrator'), h('div', { class: 'big' }, 'A new listing'))));
    root.append(h('p', { class: 'small' }, 'Only an administrator can put something new into the market. It is sold by the shop you name, at the price you set, from a marker where you are standing now, until the number you give have been sold.'));
    const box = h('div', { class: 'adminform' }, h('p', { class: 'small' }, 'Reading the catalogue...'));
    root.append(box);
    market().adminAssets().then((r) => {
      if (!box.isConnected) return;
      box.replaceChildren();
      if (!r.ok) { box.append(h('div', { class: 'notice' }, r.message)); return; }
      const asset = h('select', { class: 'field', id: 'admin-asset' }, r.assets.map((a) => h('option', { value: a.id }, a.name)));
      const shop = h('input', { class: 'field', id: 'admin-shop', maxlength: '40', placeholder: 'Shop name', value: 'Government Store' });
      const price = h('input', { class: 'field', id: 'admin-price', type: 'number', inputmode: 'decimal', min: '0.5', step: '0.5', placeholder: 'Price in TR' });
      const stock = h('input', { class: 'field', id: 'admin-stock', type: 'number', inputmode: 'numeric', min: '1', step: '1', placeholder: 'How many', value: '1' });
      const where = app.placeName(view.self.x, view.self.z);
      box.append(h('label', null, h('span', { class: 'eyebrow' }, 'What'), asset), h('label', null, h('span', { class: 'eyebrow' }, 'Sold by'), shop), h('label', null, h('span', { class: 'eyebrow' }, 'Price (TR)'), price), h('label', null, h('span', { class: 'eyebrow' }, 'How many'), stock),
        line('Marker', where),
        h('button', { class: 'hx primary wide', type: 'button', id: 'admin-submit', onclick: async () => {
          const self = app.view().self;
          const made = await market().adminList({ asset: asset.value, price: trIn(price.value) || 0, stock: Number(stock.value), shopName: shop.value.trim(), shop: shop.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24), place: { x: self.x, z: self.z, label: `${shop.value.trim()}, ${where}` } });
          say(made.ok, made.ok ? 'It is on the market.' : made.message);
          await refresh(true);
          if (made.ok) { app.marketChanged(); go({}); } else redraw();
        } }, 'Put it on the market'));
    });
  }

  // ---- the deal ----
  // A conversation on the handset. It is opened by stepping into a listing's marker (the buyer), or from
  // Conversations (either side). What is in it comes from the market and is asked for again every second or so.

  async function openDeal({ listing = null, thread = null, at = null }) {
    closeDeal();
    const d = { id: thread, listing, thread: null, messages: [], last: 0, error: '', loading: true, draft: '', asking: null, busy: false, timer: 0, done: null };
    m.deal = d;
    const answer = thread ? await market().read(thread, 0) : await market().open(listing, at);
    if (m.deal !== d) return;
    d.loading = false;
    if (!answer.ok) { d.error = answer.message; redraw(); return answer; }
    take(d, answer);
    d.timer = setInterval(() => poll(d), POLL);
    redraw();
    return answer;
  }
  // Something has been bought or sold: what this device believed was owned is no longer shown. Property asks
  // the market afresh the next time it is opened, and says it is asking until the answer is there.
  function changedHands() { m.loaded = false; m.mine = null; app.marketChanged(); }
  function closeDeal() { if (m.deal && m.deal.timer) clearInterval(m.deal.timer); m.deal = null; }

  function take(d, answer) {
    d.thread = answer.thread; d.id = answer.thread.id;
    let grew = false;
    let decided = false;
    for (const msg of answer.messages || []) if (msg.id > d.last) { d.messages.push(msg); d.last = msg.id; grew = true; if (msg.kind === 'accepted') decided = true; }
    // a sale read here is not told again by the round (the conversation has now been seen), so what this
    // device believes is owned is asked for afresh: the thing sold has changed hands
    if (decided) { changedHands(); }
    return grew;
  }

  async function poll(d) {
    if (m.deal !== d || d.busy || !d.id || document.hidden) return;
    const before = d.thread && d.thread.offer ? d.thread.offer.id : null;
    const answer = await market().read(d.id, d.last);
    if (m.deal !== d || !answer.ok) return;
    const grew = take(d, answer);
    const after = d.thread.offer ? d.thread.offer.id : null;
    // something was decided: this world's money is brought into step at once
    if (grew && d.messages.slice(-4).some((x) => x.kind === 'accepted' || x.kind === 'declined')) market().sync();
    if (grew || before !== after) { if (grew) app.chime('tap'); drawDeal(); }
  }

  let dealRoot = null;
  function deal(root) {
    dealRoot = root;
    drawDeal(true);
  }

  function bubble(msg, d) {
    const me = msg.from === 'me';
    const who = msg.from === 'shop' ? 'shop' : me ? 'me' : 'them';
    const t = new Date(msg.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (msg.kind === 'offer') return h('div', { class: `msg offer ${who}` }, h('span', { class: 'eyebrow' }, me ? 'Your offer' : `${d.thread.other} offers`), h('b', null, tr(msg.amount)), h('time', null, t));
    if (msg.kind === 'accepted') return h('div', { class: 'msg sys good' }, msg.body || 'Sold.');
    if (msg.kind === 'declined') return h('div', { class: 'msg sys' }, msg.body || (me ? `You refused ${tr(msg.amount)}.` : `${d.thread.other} refused ${tr(msg.amount)}.`));
    if (msg.kind === 'withdrawn') return h('div', { class: 'msg sys' }, me ? `You withdrew your offer of ${tr(msg.amount)}.` : `${d.thread.other} withdrew the offer of ${tr(msg.amount)}.`);
    return h('div', { class: `msg ${who}` }, msg.body, h('time', null, t));
  }

  // `fresh`: the phone is drawing its screen now, and has not yet put it on the page
  function drawDeal(fresh = false) {
    const root = dealRoot;
    const d = m.deal;
    if (!root || (!fresh && !root.isConnected)) return;
    const typing = root.querySelector('#deal-text');
    const hadFocus = typing && document.activeElement === typing;
    if (typing) d.draft = typing.value;
    root.replaceChildren();
    root.classList.add('chat');
    if (!d) { root.append(h('p', { class: 'small' }, 'No conversation is open.')); return; }
    const l = d.thread ? d.thread.listing : null;
    root.append(h('div', { class: 'chathead' },
      h('button', { class: 'chatback', type: 'button', id: 'deal-back', 'aria-label': 'Leave the conversation', onclick: () => app.leaveDeal() }, kit.glyph('back', false)),
      h('span', { class: 'avatar' }, d.thread ? d.thread.other.slice(0, 1).toUpperCase() : '·'),
      h('span', { class: 'who' }, h('b', null, d.thread ? d.thread.other : 'The seller'), h('span', null, d.thread ? (d.thread.automatic ? 'Shop attendant · automatic' : d.thread.role === 'buyer' ? 'Seller' : 'Buyer') : ''))));
    if (d.loading) { root.append(h('div', { class: 'chatlog' }, h('div', { class: 'msg sys' }, 'Opening the conversation...'))); return; }
    if (d.error) {
      root.append(h('div', { class: 'chatlog' }, h('div', { class: 'msg sys' }, d.error)));
      if (!signedIn()) root.append(h('div', { class: 'dealbar' }, h('button', { class: 'hx small', type: 'button', onclick: () => app.account.open('signup') }, 'Create account'), h('button', { class: 'hx small', type: 'button', onclick: () => app.account.open('login') }, 'Log in')));
      return;
    }
    root.append(h('div', { class: 'dealitem' }, h('span', { class: 'pic', style: ASSET_MODELS[l.asset.model] ? `background-image:url("${ASSET_MODELS[l.asset.model].poster}")` : '' }),
      h('span', { class: 'what' }, h('b', null, l.name), h('span', null, `${l.kind === 'primary' ? 'Price' : 'Asking'} ${tr(l.price)}${l.kind === 'primary' && l.status === 'open' ? ` · ${l.left} left` : ''}${l.status !== 'open' ? ' · no longer for sale' : ''}`))));
    const log = h('div', { class: 'chatlog', id: 'deal-log', 'aria-live': 'polite' }, d.messages.map((msg) => bubble(msg, d)));
    if (!d.messages.length) log.append(h('div', { class: 'msg sys' }, d.thread.role === 'buyer' ? `Say hello to ${d.thread.other}, or make an offer.` : 'Nothing has been said yet.'));
    if (d.done) log.append(h('div', { class: 'msg sys good big', id: 'deal-done' }, d.done));
    root.append(log);

    // what can be done about the price, above the place to type
    const bar = h('div', { class: 'dealbar', id: 'deal-bar' });
    const offer = d.thread.offer;
    const open = l.status === 'open';
    if (d.asking) {
      const a = d.asking;
      bar.classList.add('asking');
      bar.append(h('p', null, a.text),
        h('button', { class: 'hx small on cta', type: 'button', id: 'deal-yes', disabled: d.busy, onclick: a.yes }, a.label),
        h('button', { class: 'hx small', type: 'button', id: 'deal-no', disabled: d.busy, onclick: () => { d.asking = null; drawDeal(); } }, 'Not now'));
    } else if (d.thread.role === 'seller') {
      if (offer && open) bar.append(h('span', { class: 'offerline' }, h('span', { class: 'eyebrow' }, `${d.thread.other} offers`), h('b', null, tr(offer.amount))),
        h('button', { class: 'hx small on cta', type: 'button', id: 'deal-sell', onclick: () => { d.asking = { text: `Sell your ${l.name} to ${d.thread.other} for ${tr(offer.amount)}? It leaves your property and ${tr(offer.amount)} is added to your balance.`, label: `Yes, sell for ${tr(offer.amount)}`, yes: () => answerOffer(d, offer, true) }; drawDeal(); } }, 'Sell property'),
        h('button', { class: 'hx small', type: 'button', id: 'deal-refuse', onclick: () => answerOffer(d, offer, false) }, 'Refuse'));
      else bar.append(h('span', { class: 'offerline quiet' }, open ? `Asking ${tr(l.price)}. Waiting for an offer.` : 'This is no longer for sale.'));
    } else if (!open) bar.append(h('span', { class: 'offerline quiet' }, 'This is no longer for sale.'));
    else if (offer) bar.append(h('span', { class: 'offerline' }, h('span', { class: 'eyebrow' }, 'Your offer is with the seller'), h('b', null, tr(offer.amount))),
      h('button', { class: 'hx small', type: 'button', id: 'deal-withdraw', disabled: d.busy, onclick: async () => { d.busy = true; drawDeal(); await market().withdraw(offer.id); d.busy = false; await poll(d); drawDeal(); } }, 'Withdraw'));
    else if (d.thread.automatic) bar.append(h('span', { class: 'offerline' }, h('span', { class: 'eyebrow' }, 'Price'), h('b', null, tr(l.price))),
      h('button', { class: 'hx small on cta', type: 'button', id: 'deal-buy', onclick: () => { d.asking = { text: l.asset && l.asset.category === 'motorcycle' ? `Pay ${tr(l.price)} for the ${l.name}? You have ${tr(balance())}, and any of it may pay for a motorcycle.` : `Pay ${tr(l.price)} for the ${l.name}? You have ${tr(spendable())} of earned TR.`, label: `Pay ${tr(l.price)}`, yes: () => makeOffer(d, l.price) }; drawDeal(); } }, 'Buy'));
    else {
      const amount = h('input', { class: 'field', id: 'deal-amount', type: 'number', inputmode: 'decimal', min: '0.5', step: '0.5', value: d.amount || trPlain(l.price), 'aria-label': 'Your offer in TR' });
      amount.addEventListener('input', () => { d.amount = amount.value; });
      bar.append(h('label', { class: 'pricefield' }, amount, h('span', null, 'TR')),
        h('button', { class: 'hx small on cta', type: 'button', id: 'deal-buy', onclick: () => {
          const units = trIn(amount.value);
          if (!units || units <= 0) { d.note = 'Type what you will pay, in TR.'; drawDeal(); return; }
          d.asking = { text: `Offer ${tr(units)} for the ${l.name}? It is set aside from your ${tr(spendable())} of earned TR until ${d.thread.other} answers, and is paid only if they say yes.`, label: `Offer ${tr(units)}`, yes: () => makeOffer(d, units) }; drawDeal();
        } }, 'Buy'));
    }
    if (d.note) { root.append(h('div', { class: 'dealnote', role: 'alert' }, d.note)); d.note = ''; }
    root.append(bar);

    const text = h('input', { class: 'field', id: 'deal-text', type: 'text', maxlength: '400', placeholder: 'Message', value: d.draft || '', autocomplete: 'off', enterkeyhint: 'send', 'aria-label': `Message to ${d.thread.other}` });
    const send = async () => {
      const body = text.value.trim();
      if (!body || d.sending) return;
      d.sending = true; text.value = ''; d.draft = '';
      const answer = await market().say(d.id, body, d.last);
      d.sending = false;
      if (m.deal !== d) return;
      if (answer.ok) take(d, answer); else d.note = answer.message;
      drawDeal();
      const again = dealRoot && dealRoot.querySelector('#deal-text');
      if (again) again.focus({ preventScroll: true });
    };
    text.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); send(); } });
    text.addEventListener('input', () => { d.draft = text.value; });
    text.addEventListener('focus', () => { d.focused = true; });
    text.addEventListener('blur', () => { setTimeout(() => { if (text.isConnected && document.activeElement !== text) d.focused = false; }, 0); });
    root.append(h('form', { class: 'composer', onsubmit: (event) => { event.preventDefault(); send(); } }, text, h('button', { class: 'sendbtn', type: 'submit', id: 'deal-send', 'aria-label': 'Send' }, kit.glyph('send'))));
    log.scrollTop = log.scrollHeight;
    if (hadFocus || d.focused) text.focus({ preventScroll: true });
  }

  async function makeOffer(d, units) {
    if (d.busy) return;
    d.busy = true; drawDeal();
    const l = d.thread.listing;
    const answer = await market().offer(d.id, units, l.name, d.last);
    d.busy = false; d.asking = null;
    if (m.deal !== d) return;
    if (answer.ok) {
      take(d, answer);
      if (answer.sale) { d.done = `It is yours: ${answer.sale.what}. Find it in Property.`; app.chime('paid'); changedHands(); }
    } else if (answer.code === 'INSUFFICIENT') d.note = `You have ${tr(balance())}. That is not enough for ${tr(units)}.`;
    else if (answer.code === 'OFFLINE') d.note = 'The connection failed as the offer was sent. The money is set aside and safe; in a moment the game will learn whether the offer arrived, and return it if not.';
    else d.note = answer.message;
    drawDeal();
  }

  async function answerOffer(d, offer, accept) {
    if (d.busy) return;
    d.busy = true; drawDeal();
    const answer = await market().decide(offer.id, accept, offer.amount, d.last);
    d.busy = false; d.asking = null;
    if (m.deal !== d) return;
    if (answer.ok) {
      take(d, answer);
      if (answer.sale) { d.done = `Sold for ${tr(answer.sale.amount)}. It has been added to your balance.`; app.chime('paid'); changedHands(); }
    } else d.note = answer.message;
    drawDeal();
  }

  return {
    page, deal, openDeal, closeDeal,
    get dealOpen() { return !!m.deal; },
    // the market's own record changed (a sale, a listing): what is shown is asked for again
    stale() { m.loaded = false; },
    signedOut() { m.mine = null; m.loaded = false; closeDeal(); },
    leave() { tidy(); dropViewer(); quiet(); },
  };
}
