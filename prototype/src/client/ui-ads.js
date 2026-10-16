// ADS and Admin on the phone: booking a billboard, and (for administrators) reviewing what is booked and seeing
// the bank's figures.
//
// Everything that matters is the server's (api/_lib/ads.js): the price, the days, whether the billboard is free,
// whether the player has the earned TR, whether a picture will do, and every movement of TR. This page only asks,
// shows the answer, and offers the buttons that will do something. A picture is checked here first only so that a
// player is told at once what is wrong with it; the server checks it again from its own bytes.
//
//   ADS    home      the prices, what is held, the player's campaigns (status, dates, feedback, cancel)
//          browse    the 50 billboards: where, kind, size, category, and whether each is free
//          board     one billboard: its size and the shape a picture must be, the length, the server's quote
//          form      brand, link, the picture (or 3 to 10 slides)
//          review    the whole price, the terms, the checkbox, submit
//          terms     the Advertising Terms and Conditions
//   Admin  review    campaigns waiting, their pictures, approve, or not with a reason
//          all       every campaign
//          money     the advertising tax and fees, what is held, players' TR, recent payments, sales, the books
//
// kit: the pieces the phone is made of (ui-phone.js). go(state) moves about inside the app.

import { ZONE_BILLBOARDS } from '../sim/zones/atani-billboards.js';
import { AD_CATEGORIES, AD_DURATIONS, BILLBOARD_TYPES, aspectOf } from '../sim/billboards.js';
import { AD_TERMS, AD_TERMS_TITLE, AD_TERMS_VERSION, AD_TERMS_CHECKBOX } from '../sim/ad-terms.js';

const TR = 2;
const BOARD = new Map(ZONE_BILLBOARDS.map((b) => [b.id, b]));
const REGIONS = Object.freeze({ airport: 'Asaba Airport', road: 'Kwale road', town: 'Asaba town' });
const STAGE = Object.freeze({ draft: 'Draft', pending: 'Pending Review', approved: 'Approved', scheduled: 'Scheduled', active: 'Active', expired: 'Expired', rejected: 'Rejected', cancelled: 'Cancelled' });
const AVAIL = Object.freeze({ free: 'Available', reserved: 'Reserved', review: 'Under review', occupied: 'Occupied' });
const RULES = Object.freeze({ maxBytes: 2400000, minSide: 300, maxSide: 4096, aspectSlack: 0.04, tvMin: 3, tvMax: 10, types: ['image/png', 'image/jpeg', 'image/webp'] });
const PAGE = 30;

const sizeText = (b) => `${b.width} m × ${b.height} m`;
const dayText = (at) => new Date(at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
// the last day a campaign runs (its end is the midnight after it)
const lastDay = (at) => dayText(new Date(at).getTime() - 1000);
const whenText = (at) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));
// a picture's best size for a board: its shape, 1,200 pixels high (or wide, for a tall one)
const bestPixels = (b) => (b.width >= b.height ? `${Math.round(1200 * b.width / b.height)} × 1200` : `1200 × ${Math.round(1200 * b.height / b.width)}`);

// What a picture is, read in the browser: its kind and size, before it is sent.
function readPicture(file) {
  return new Promise((resolve) => {
    if (!RULES.types.includes(file.type)) { resolve({ problem: 'A picture must be a PNG, JPEG or WebP image.' }); return; }
    if (file.size > RULES.maxBytes) { resolve({ problem: `That picture is ${(file.size / 1e6).toFixed(1)} MB. A picture may be ${(RULES.maxBytes / 1e6).toFixed(1)} MB at most.` }); return; }
    const reader = new FileReader();
    reader.onerror = () => resolve({ problem: 'That file could not be read.' });
    reader.onload = () => {
      const url = String(reader.result);
      const img = new Image();
      img.onload = () => resolve({ url, data: url.slice(url.indexOf(',') + 1), width: img.naturalWidth, height: img.naturalHeight, type: file.type, bytes: file.size });
      img.onerror = () => resolve({ problem: 'That file is not a picture that can be shown.' });
      img.src = url;
    };
    reader.readAsDataURL(file);
  });
}

export function createAdsUI(kit) {
  const { app, h, redraw, section, line, tr } = kit;
  const a = {
    catalog: null, catalogAt: 0, catalogError: '',
    mine: null, mineError: '', loading: false,
    filter: { category: 'all', region: 'all', free: false, shown: PAGE },
    quote: null, quoting: '', quoteError: '',
    form: null,                 // { board, duration, key, brand, link, campaign, art: [{index, id, url, width, height}], problem, busy }
    agreed: false, submitting: false, result: null,
    note: null,
    // the administrator's
    admin: { list: null, status: 'pending', error: '', overview: null, overviewError: '', art: new Map(), notes: {}, busy: '' },
  };
  const online = () => app.online;
  const here = () => !!(online() && online().available);
  const signedIn = () => here() && online().signedIn;
  const isAdmin = () => signedIn() && !!(online().account && online().account.admin);
  const ask = (op, body = {}, options) => online().ask(op, body, options);
  const say = (good, text) => { a.note = { good, text }; };
  const noteBox = () => { if (!a.note) return null; const n = a.note; a.note = null; return h('div', { class: `notice${n.good ? ' good' : ''}`, role: 'status' }, n.text); };

  async function loadCatalog(force) {
    if (!here() || (a.catalog && !force && Date.now() - a.catalogAt < 60000)) return;
    const answer = await ask('ads.catalog');
    if (answer.ok) { a.catalog = answer; a.catalogAt = Date.now(); a.catalogError = ''; } else a.catalogError = answer.message;
    redraw();
  }
  async function loadMine(force) {
    if (!signedIn() || a.loading || (a.mine && !force)) return;
    a.loading = true;
    const answer = await ask('ads.mine');
    a.loading = false;
    if (answer.ok) { a.mine = answer.campaigns; a.mineError = ''; } else a.mineError = answer.message;
    redraw();
  }
  const availability = (id) => {
    const s = a.catalog && a.catalog.state[id];
    return s ? { status: s.status, until: s.until } : { status: 'free' };
  };
  const funds = () => (app.wallet && app.wallet.state ? app.wallet.state : null);

  function away(root) {
    if (!here()) { root.append(h('p', { class: 'small' }, 'Advertising on the billboards is booked on postcivilwar.com, where every player has an account and a wallet kept by the game\'s server. This copy of the game has no connection to it. Every billboard here says PLACE YOUR ADS.')); return true; }
    if (!signedIn()) {
      const state = online().status().state;
      root.append(h('div', { class: 'callout' }, h('p', null, state === 'out' ? 'A campaign belongs to your account and is paid from its wallet. Log in, or make an account, to book a billboard. Anyone may look at the billboards and their prices.' : state === 'checking' ? 'Asking the server...' : `The server cannot be reached just now. ${online().status().message || ''}`),
        state === 'out' ? h('div', { class: 'hxrow' }, h('button', { class: 'hx', type: 'button', onclick: () => app.account.open('signup') }, 'Create account'), h('button', { class: 'hx', type: 'button', onclick: () => app.account.open('login') }, 'Log in')) : null));
      return false;
    }
    return false;
  }

  function priceTable() {
    return h('div', { class: 'adprices', id: 'ad-prices', role: 'table' },
      h('div', { class: 'adprice head', role: 'row' }, h('span', null, 'Category'), h('span', null, 'Fee / day'), h('span', null, 'Tax / day'), h('span', null, 'Total / day')),
      Object.values(AD_CATEGORIES).map((c) => h('div', { class: 'adprice', role: 'row', 'data-category': c.id }, h('span', null, c.name), h('span', null, `${c.fee} TR`), h('span', null, `${c.tax} TR`), h('b', null, `${c.fee + c.tax} TR`))));
  }

  // ---- the page ----

  function page(root, view, sub, go) {
    const box = noteBox();
    if (box) root.append(box);
    loadCatalog();
    if (sub.terms) { terms(root); return; }
    if (sub.browse) { browse(root, go); return; }
    if (sub.board && sub.step === 'review') { review(root, sub, go); return; }
    if (sub.board && sub.step === 'form') { form(root, sub, go); return; }
    if (sub.board) { board(root, sub, go); return; }
    home(root, go);
  }

  function home(root, go) {
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, 'ADS'), h('div', { class: 'big' }, 'Advertise on a billboard')),
      signedIn() ? h('div', { class: 'who' }, h('span', { class: 'eyebrow' }, 'Account'), h('b', null, online().account.username)) : null));
    root.append(h('p', { class: 'small' }, `There are ${ZONE_BILLBOARDS.length} billboards in Asaba, on the Kwale road and at Asaba Airport, ${ZONE_BILLBOARDS.filter((b) => b.tv).length} of them digital screens. Choose one, how long, and your picture. It is reviewed before it is shown, and paid for with TR you have earned.`));
    const offline = away(root);
    root.append(h('button', { class: 'hx primary wide', type: 'button', id: 'ads-browse', onclick: () => go({ browse: true }) }, 'Choose a billboard'));
    root.append(section('Prices'), priceTable(), h('p', { class: 'small' }, 'A campaign costs (fee + tax) × its days. A week is 7 days and a month 30. The tax goes to the Delta State agency for signage and advertising.'));
    if (signedIn()) {
      loadMine();
      const w = funds();
      if (w && Number.isSafeInteger(w.balance)) {
        const earned = w.balance - (w.starter || 0) - (w.illicit || 0);
        root.append(section('Your TR'), line('Earned TR (can pay for advertising)', tr(Math.max(0, earned))), line('Starter TR (cannot)', tr(w.starter || 0)), w.adHeld > 0 ? line('Held for campaigns under review', tr(w.adHeld)) : null);
      }
      root.append(section('Your campaigns'));
      if (a.mineError) root.append(h('div', { class: 'notice' }, a.mineError));
      else if (!a.mine) root.append(h('p', { class: 'small' }, 'Asking the server...'));
      else if (!a.mine.filter((c) => c.status !== 'draft').length) root.append(h('p', { class: 'small', id: 'ads-none' }, 'You have no campaigns yet.'));
      else root.append(h('div', { class: 'rows', id: 'ads-mine' }, a.mine.filter((c) => c.status !== 'draft').map((c) => campaignCard(c))));
    } else if (offline) return;
    root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', id: 'ads-terms', onclick: () => go({ terms: true }) }, AD_TERMS_TITLE)));
  }

  function campaignCard(c) {
    const b = BOARD.get(c.billboard) || {};
    return h('div', { class: 'adcard', 'data-campaign': c.id, 'data-stage': c.stage },
      h('div', { class: 'adcardhead' }, h('b', null, c.brand), h('span', { class: `tag stage-${c.stage}` }, STAGE[c.stage] || c.stage)),
      h('div', { class: 'eyebrow plain' }, `${c.billboard} · ${b.place || c.place} · ${sizeText(c.size)}${c.tv ? ' · digital screen' : ''}`),
      line('Days', `${c.days}: ${dayText(c.start)} to ${lastDay(c.end)}`),
      line('Total', tr(c.price.total)),
      c.price.refunded ? line('Returned (days already gone when approved)', tr(c.price.refunded)) : null,
      c.feedback ? h('p', { class: 'adfeedback' }, h('b', null, c.status === 'rejected' ? 'Not approved: ' : 'Reviewer: '), c.feedback) : null,
      c.status === 'pending' ? h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', 'data-cancel': c.id, onclick: async (e) => {
        e.target.disabled = true;
        const answer = await ask('ads.cancel', { campaign: c.id });
        if (answer.ok) { say(true, `Cancelled. ${tr(c.price.total)} is back in your earned TR.`); if (app.wallet) app.wallet.refresh(); } else say(false, answer.message);
        a.mine = null; loadMine(true);
      } }, 'Cancel and return my TR')) : null);
  }

  // ---- the billboards ----

  function browse(root, go) {
    const f = a.filter;
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, 'ADS'), h('div', { class: 'big' }, 'The billboards'))));
    if (a.catalogError) root.append(h('div', { class: 'notice' }, `Whether each billboard is free cannot be read just now: ${a.catalogError}`));
    const chip = (group, id, label) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(f[group] === id), 'data-filter': `${group}:${id}`, onclick: () => { f[group] = id; f.shown = PAGE; redraw(); } }, label);
    root.append(h('div', { class: 'adchips', role: 'group', 'aria-label': 'Category' }, chip('category', 'all', 'All'), Object.values(AD_CATEGORIES).map((c) => chip('category', c.id, c.id === 'tv' ? 'Digital TV' : c.name))));
    root.append(h('div', { class: 'adchips', role: 'group', 'aria-label': 'Where' }, chip('region', 'all', 'Everywhere'), Object.entries(REGIONS).map(([id, name]) => chip('region', id, name)),
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(f.free), id: 'ads-free-only', onclick: () => { f.free = !f.free; f.shown = PAGE; redraw(); } }, 'Available only')));
    const list = ZONE_BILLBOARDS.filter((b) => (f.category === 'all' || b.category === f.category) && (f.region === 'all' || b.region === f.region) && (!f.free || availability(b.id).status === 'free'));
    root.append(h('p', { class: 'small', id: 'ads-count' }, `${list.length} billboard${list.length === 1 ? '' : 's'}`));
    root.append(h('div', { class: 'rows', id: 'ads-boards' }, list.slice(0, f.shown).map((b) => {
      const s = availability(b.id), c = AD_CATEGORIES[b.category];
      return h('button', { class: 'adboard', type: 'button', 'data-board': b.id, onclick: () => { a.quote = null; go({ board: b.id }); } },
        h('span', { class: `adface${b.tv ? ' tv' : ''}`, style: `aspect-ratio:${b.width}/${b.height}` }, h('i', null, 'PLACE YOUR ADS')),
        h('span', { class: 'what' }, h('b', null, `${b.id} · ${b.place}`), h('span', { class: 'eyebrow plain' }, `${BILLBOARD_TYPES[b.type].name} · ${sizeText(b)}`),
          h('span', null, h('span', { class: `tag avail-${s.status}` }, AVAIL[s.status]), ` ${c.fee + c.tax} TR a day`)));
    })));
    if (list.length > f.shown) root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'ads-more', onclick: () => { f.shown += PAGE * 2; redraw(); } }, `Show more (${list.length - f.shown} left)`)));
  }

  async function quote(boardId, duration) {
    const tag = `${boardId}|${duration}`;
    if (a.quoting === tag) return;
    a.quoting = tag; a.quoteError = '';
    const answer = await ask('ads.quote', { billboard: boardId, duration });
    if (a.quoting !== tag) return;
    a.quoting = '';
    if (answer.ok) a.quote = { tag, ...answer }; else a.quoteError = answer.message;
    redraw();
  }

  function breakdown(q, b) {
    const c = AD_CATEGORIES[b.category];
    return h('div', { class: 'adbreak', id: 'ad-breakdown' },
      line('Billboard', `${b.id}, ${b.place}`), line('Category', c.name), line('Size', sizeText(b)),
      line('Days', `${q.quote.days}`), line('Starts', dayText(q.quote.start)), line('Last day', lastDay(q.quote.end)),
      line('Advertising fee a day', tr(q.quote.feeDay)), line('Tax a day', tr(q.quote.taxDay)),
      line('Advertising fee', tr(q.quote.fee)), line('Tax', tr(q.quote.tax)),
      h('div', { class: 'line total' }, h('span', null, 'Total'), h('b', { id: 'ad-total' }, tr(q.quote.total))),
      line('Your earned TR available', tr(q.funds.earned)),
      line('Held while it is reviewed', tr(q.quote.total)));
  }

  function board(root, sub, go) {
    const b = BOARD.get(sub.board);
    if (!b) { root.append(h('p', { class: 'small' }, 'There is no such billboard.')); return; }
    const t = BILLBOARD_TYPES[b.type], s = availability(b.id);
    const duration = sub.duration || '1w';
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, `${b.id} · ${AD_CATEGORIES[b.category].name}`), h('div', { class: 'big' }, b.place))));
    root.append(h('div', { class: `adface big${b.tv ? ' tv' : ''}`, style: `aspect-ratio:${b.width}/${b.height}` }, h('i', null, 'PLACE YOUR ADS'), h('small', null, `${b.tv ? 'Digital screen' : 'Billboard'} size: ${sizeText(b)}`)));
    root.append(line('Structure', t.name), line(b.tv ? 'Screen size' : 'Face size', sizeText(b)), line('Picture shape', `${aspectOf(b.width, b.height)} (for example ${bestPixels(b)} pixels)`),
      b.sides > 1 ? line('Faces', `${b.sides}, the same picture on each`) : null,
      line('Pictures', b.tv ? `${RULES.tvMin} to ${RULES.tvMax} slides, shown in turn, silent` : 'One flier'),
      line('Now', s.status === 'free' ? AVAIL.free : `${AVAIL[s.status]} until ${dayText(s.until)}`));
    root.append(section('How long'));
    root.append(h('div', { class: 'adchips', role: 'group', 'aria-label': 'How long' }, AD_DURATIONS.map((d) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(d.id === duration), 'data-duration': d.id, onclick: () => go({ board: b.id, duration: d.id }) }, d.label))));
    if (!signedIn()) {
      const c = AD_CATEGORIES[b.category], days = AD_DURATIONS.find((d) => d.id === duration).days;
      root.append(line('Price', `(${c.fee} + ${c.tax}) × ${days} days = ${((c.fee + c.tax) * days).toLocaleString('en-GB')} TR`));
      away(root);
      return;
    }
    const tag = `${b.id}|${duration}`;
    if (!a.quote || a.quote.tag !== tag) { quote(b.id, duration); root.append(h('p', { class: 'small' }, a.quoteError || 'Asking the server for the price and the first free days...')); return; }
    const q = a.quote;
    if (s.status !== 'free') root.append(h('p', { class: 'small' }, `This billboard is booked until ${dayText(s.until)}: the first free days are the ones below.`));
    root.append(breakdown(q, b));
    if (q.funds.short > 0) root.append(h('div', { class: 'notice', id: 'ad-short' }, `Advertising is paid for with TR you have earned. You have ${tr(q.funds.earned)} of earned TR: ${tr(q.funds.short)} short.${q.funds.starter > 0 ? ' Starter TR cannot pay for advertising.' : ''}`));
    root.append(h('button', { class: 'hx primary wide', type: 'button', id: 'ads-continue', onclick: () => {
      if (!a.form || a.form.board !== b.id || a.form.duration !== duration) a.form = { board: b.id, duration, key: newKey(), brand: a.form ? a.form.brand : '', link: a.form ? a.form.link : '', campaign: null, art: [], problem: '', busy: false };
      a.agreed = false; a.result = null;
      go({ board: b.id, duration, step: 'form' });
    } }, 'Continue'));
  }

  // ---- the campaign ----

  async function saveDraft() {
    const f = a.form;
    const answer = await ask('ads.draft', { key: f.key, billboard: f.board, duration: f.duration, brand: f.brand, link: f.link });
    if (!answer.ok) { f.problem = answer.message; return false; }
    f.campaign = answer.campaign.id; f.problem = '';
    return true;
  }

  function form(root, sub, go) {
    const f = a.form, b = BOARD.get(sub.board);
    if (!f || !b || f.board !== b.id) { go({ board: sub.board, duration: sub.duration }); return; }
    if (a.result) { done(root, go); return; }
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, `${b.id} · ${sizeText(b)}`), h('div', { class: 'big' }, 'Your campaign'))));
    const brand = h('input', { class: 'field', id: 'ad-brand', maxlength: '60', placeholder: 'Brand or business name', value: f.brand, autocomplete: 'organization' });
    const link = h('input', { class: 'field', id: 'ad-link', maxlength: '300', type: 'url', inputmode: 'url', placeholder: 'Website or App Store / Google Play link', value: f.link, autocapitalize: 'none', autocomplete: 'url' });
    brand.addEventListener('input', () => { f.brand = brand.value; });
    link.addEventListener('input', () => { f.link = link.value; });
    root.append(h('label', { class: 'adfield' }, h('span', null, 'Brand or business'), brand), h('label', { class: 'adfield' }, h('span', null, 'Website or app link'), link));
    root.append(section(b.tv ? `Slides (${RULES.tvMin} to ${RULES.tvMax})` : 'Your flier'));
    root.append(h('p', { class: 'small', id: 'ad-art-rule' }, `${b.tv ? 'Each slide' : 'The flier'} must be ${aspectOf(b.width, b.height)} in shape, the shape of this ${b.tv ? 'screen' : 'billboard'} (${sizeText(b)}): for example ${bestPixels(b)} pixels. PNG, JPEG or WebP, at least ${RULES.minSide} pixels on the short side, ${(RULES.maxBytes / 1e6).toFixed(1)} MB at most. No animation, sound or other files.`));
    const slots = b.tv ? RULES.tvMax : 1;
    const used = f.art.length;
    const grid = h('div', { class: 'adart', id: 'ad-art' });
    for (const art of f.art) grid.append(h('div', { class: 'adslide', 'data-slide': String(art.index) }, h('img', { src: art.url, alt: `${b.tv ? `Slide ${art.index + 1}` : 'Your flier'}` }), h('span', null, `${art.width} × ${art.height}`),
      h('button', { class: 'btn quiet', type: 'button', 'data-remove': String(art.index), disabled: f.busy, onclick: async () => {
        f.busy = true; redraw();
        // the slides stay numbered from the first without a gap: the later ones move up
        const keep = f.art.filter((x) => x.index !== art.index);
        let ok = true;
        for (const x of keep.filter((y) => y.index > art.index)) { const r = await ask('ads.upload', { campaign: f.campaign, index: x.index - 1, data: x.data }, { timeout: 60000 }); if (!r.ok) { ok = false; f.problem = r.message; break; } x.index -= 1; }
        if (ok) { const last = f.art.length - 1; const r = await ask('ads.unupload', { campaign: f.campaign, index: last }); if (!r.ok) f.problem = r.message; else f.art = keep; }
        f.busy = false; redraw();
      } }, 'Remove')));
    if (used < slots) {
      const input = h('input', { type: 'file', accept: RULES.types.join(','), id: 'ad-file', class: 'adfile', ...(b.tv ? { multiple: true } : {}) });
      input.addEventListener('change', async () => {
        const files = [...input.files].slice(0, slots - f.art.length);
        if (!files.length) return;
        f.brand = brand.value.trim(); f.link = link.value.trim();
        f.busy = true; f.problem = ''; redraw();
        if (!f.campaign && !(await saveDraft())) { f.busy = false; redraw(); return; }
        for (const file of files) {
          const pic = await readPicture(file);
          if (pic.problem) { f.problem = `${file.name}: ${pic.problem}`; break; }
          if (Math.min(pic.width, pic.height) < RULES.minSide || Math.max(pic.width, pic.height) > RULES.maxSide) { f.problem = `${file.name} is ${pic.width} × ${pic.height} pixels: a picture must be at least ${RULES.minSide} on its short side and at most ${RULES.maxSide} on its long side.`; break; }
          if (Math.abs((pic.width / pic.height) / (b.width / b.height) - 1) > RULES.aspectSlack) { f.problem = `${file.name} is ${pic.width} × ${pic.height} pixels, which is not the shape of this ${b.tv ? 'screen' : 'billboard'}. It must be ${aspectOf(b.width, b.height)}: for example ${bestPixels(b)}.`; break; }
          const index = f.art.length;
          const answer = await ask('ads.upload', { campaign: f.campaign, index, data: pic.data }, { timeout: 60000 });
          if (!answer.ok) { f.problem = answer.message; break; }
          f.art.push({ index, id: answer.art.id, url: pic.url, data: pic.data, width: answer.art.width, height: answer.art.height });
        }
        f.busy = false; redraw();
      });
      grid.append(h('label', { class: `adslide add${f.busy ? ' busy' : ''}`, for: 'ad-file' }, input, h('b', null, f.busy ? 'Sending...' : '+'), h('span', null, b.tv ? `Add slide ${used + 1}` : 'Add your flier')));
    }
    root.append(grid);
    if (f.problem) root.append(h('div', { class: 'notice', id: 'ad-problem', role: 'alert' }, f.problem));
    const enough = b.tv ? f.art.length >= RULES.tvMin : f.art.length === 1;
    root.append(h('button', { class: 'hx primary wide', type: 'button', id: 'ads-review', disabled: f.busy || !enough, onclick: async () => {
      f.brand = brand.value.trim(); f.link = link.value.trim();
      f.busy = true; redraw();
      const ok = await saveDraft();
      f.busy = false;
      if (ok) { a.quote = null; go({ board: b.id, duration: f.duration, step: 'review' }); } else redraw();
    } }, enough ? 'Review and pay' : b.tv ? `Add ${RULES.tvMin - f.art.length} more slide${RULES.tvMin - f.art.length === 1 ? '' : 's'}` : 'Add your flier'));
  }

  function review(root, sub, go) {
    const f = a.form, b = BOARD.get(sub.board);
    if (!f || !f.campaign) { go({ board: sub.board, duration: sub.duration, step: 'form' }); return; }
    if (a.result) { done(root, go); return; }
    const tag = `${b.id}|${f.duration}`;
    if (!a.quote || a.quote.tag !== tag) { quote(b.id, f.duration); root.append(h('p', { class: 'small' }, a.quoteError || 'Asking the server for the price...')); return; }
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, 'Check and submit'), h('div', { class: 'big' }, f.brand))));
    root.append(line('Link', f.link), line(b.tv ? 'Slides' : 'Flier', b.tv ? `${f.art.length}` : '1'));
    root.append(h('div', { class: 'adart small' }, f.art.map((x) => h('img', { src: x.url, alt: '' }))));
    root.append(breakdown(a.quote, b));
    if (a.quote.funds.short > 0) root.append(h('div', { class: 'notice', id: 'ad-short' }, `You have ${tr(a.quote.funds.earned)} of earned TR: ${tr(a.quote.funds.short)} short. Starter TR cannot pay for advertising.`));
    root.append(h('p', { class: 'small' }, 'Submitting holds the total from your earned TR while the campaign is reviewed. Approved, it is charged and shown from its first day; not approved, or cancelled while it waits, the whole of it is returned to your earned TR. The days shown are the first free ones; approved after its first day, the days already gone are returned.'));
    root.append(h('button', { class: 'btn quiet', type: 'button', id: 'ads-read-terms', onclick: () => go({ terms: true, from: { ...sub } }) }, `Read the ${AD_TERMS_TITLE}`));
    const box = h('input', { type: 'checkbox', id: 'ad-agree', checked: a.agreed });
    box.addEventListener('change', () => { a.agreed = box.checked; redraw(); });
    root.append(h('label', { class: 'adagree' }, box, h('span', null, AD_TERMS_CHECKBOX)));
    if (f.problem) root.append(h('div', { class: 'notice', id: 'ad-problem', role: 'alert' }, f.problem));
    root.append(h('button', { class: 'hx primary wide', type: 'button', id: 'ads-submit', disabled: !a.agreed || a.submitting || a.quote.funds.short > 0, onclick: async () => {
      a.submitting = true; redraw();
      const answer = await ask('ads.submit', { campaign: f.campaign, terms: AD_TERMS_VERSION, accepted: a.agreed === true, rights: a.agreed === true }, { timeout: 30000 });
      a.submitting = false;
      if (answer.ok) { a.result = answer; a.mine = null; if (app.wallet) app.wallet.refresh(); loadCatalog(true); } else { f.problem = answer.message; if (answer.code === 'TERMS') a.agreed = false; }
      redraw();
    } }, a.submitting ? 'Submitting...' : `Submit and hold ${tr(a.quote.quote.total)}`));
  }

  function done(root, go) {
    const c = a.result.campaign;
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, STAGE[c.stage] || c.status), h('div', { class: 'big' }, 'Submitted for review'))));
    root.append(h('div', { class: 'notice good', id: 'ad-done' }, `${tr(c.price.total)} of your earned TR is held while your campaign is reviewed. Nothing is shown on the billboard until it is approved.`));
    root.append(line('Reference', a.result.ref), line('Billboard', `${c.billboard}, ${c.place}`), line('Days', `${c.days}: ${dayText(c.start)} to ${lastDay(c.end)}`), line('Fee', tr(c.price.fee)), line('Tax', tr(c.price.tax)), line('Total held', tr(c.price.total)));
    root.append(h('button', { class: 'hx primary wide', type: 'button', id: 'ads-home', onclick: () => { a.form = null; a.result = null; a.agreed = false; go({}); } }, 'Done'));
  }

  function terms(root) {
    root.append(h('div', { class: 'adterms', id: 'ad-terms-text' }, h('h4', null, AD_TERMS_TITLE),
      AD_TERMS.map((s, i) => h('section', null, h('h5', null, `${i + 1}. ${s.title}`), s.paras.map((p) => (Array.isArray(p) ? h('ul', null, p.map((x) => h('li', null, x))) : h('p', null, p))))),
      h('p', { class: 'small' }, `Version ${AD_TERMS_VERSION}.`)));
  }

  function back(sub) {
    if (sub.terms) return sub.from || {};
    if (sub.step === 'review') return { board: sub.board, duration: sub.duration, step: 'form' };
    if (sub.step === 'form') return { board: sub.board, duration: sub.duration };
    if (sub.board) return { browse: true };
    return {};
  }
  const deep = (sub) => !!(sub.terms || sub.browse || sub.board);

  // ---- the administrator ----

  async function loadAdmin(force) {
    const m = a.admin;
    if (!isAdmin() || m.busy === 'list' || (m.list && !force)) return;
    m.busy = 'list';
    const answer = await ask('admin.ads', { status: m.status === 'all' ? null : m.status });
    m.busy = '';
    if (answer.ok) { m.list = answer.campaigns; m.error = ''; } else m.error = answer.message;
    redraw();
  }
  async function loadOverview(force) {
    const m = a.admin;
    if (!isAdmin() || m.busy === 'money' || (m.overview && !force)) return;
    m.busy = 'money';
    const answer = await ask('admin.overview', {}, { timeout: 30000 });
    m.busy = '';
    if (answer.ok) { m.overview = answer; m.overviewError = ''; } else m.overviewError = answer.message;
    redraw();
  }
  async function artUrl(id) {
    const m = a.admin;
    if (m.art.has(id)) return;
    m.art.set(id, '');
    const answer = await ask('ads.art', { id }, { timeout: 30000 });
    if (answer.ok) { m.art.set(id, `data:${answer.mime};base64,${answer.data}`); redraw(); }
  }

  function adminPage(root, view, sub, go, openApp) {
    const box = noteBox();
    if (box) root.append(box);
    if (!isAdmin()) { root.append(h('p', { class: 'small' }, 'Only an administrator can open this.')); return; }
    const tab = sub.tab || 'review';
    const tabBtn = (id, label) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(tab === id), 'data-tab': id, onclick: () => { if (id === 'review') a.admin.status = 'pending'; if (id === 'all') a.admin.status = 'all'; a.admin.list = null; go({ tab: id }); } }, label);
    root.append(h('div', { class: 'propertyhead' }, h('div', null, h('div', { class: 'eyebrow' }, 'Administrator'), h('div', { class: 'big' }, online().account.username))));
    root.append(h('div', { class: 'adchips', role: 'tablist' }, tabBtn('review', 'Ads to review'), tabBtn('all', 'All campaigns'), tabBtn('money', 'Taxes and payments'), tabBtn('market', 'Market')));
    if (tab === 'money') { money(root); return; }
    if (tab === 'market') {
      root.append(h('p', { class: 'small' }, 'New things are put on the market from Property, where you stand.'), h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', id: 'admin-to-market', onclick: () => openApp('property', { admin: true }) }, 'Put something new on the market')));
      return;
    }
    loadAdmin();
    const m = a.admin;
    if (m.error) { root.append(h('div', { class: 'notice' }, m.error)); return; }
    if (!m.list) { root.append(h('p', { class: 'small' }, 'Asking the server...')); return; }
    if (!m.list.length) { root.append(h('p', { class: 'small', id: 'admin-ads-none' }, tab === 'review' ? 'Nothing is waiting for review.' : 'No campaigns have been submitted yet.')); return; }
    root.append(h('div', { class: 'rows', id: 'admin-ads' }, m.list.map((c) => adminCard(c))));
  }

  function adminCard(c) {
    const m = a.admin;
    for (const art of c.art) artUrl(art.id);
    const note = h('textarea', { class: 'field', rows: '2', maxlength: '400', placeholder: 'Feedback for the advertiser (needed to not approve)', 'data-note': c.id }, m.notes[c.id] || '');
    note.addEventListener('input', () => { m.notes[c.id] = note.value; });
    const decide = async (approve) => {
      m.busy = c.id; redraw();
      const answer = await ask('admin.ad.decide', { campaign: c.id, approve, note: m.notes[c.id] || '' });
      m.busy = '';
      if (answer.ok) { say(true, approve ? `Approved: ${c.brand} on ${c.billboard}. ${tr(c.price.fee)} fee and ${tr(c.price.tax)} tax charged.` : `Not approved: ${c.brand}. ${tr(c.price.total)} returned to ${c.advertiser}.`); delete m.notes[c.id]; m.overview = null; if (app.refreshAdverts) app.refreshAdverts(); } else say(false, answer.message);
      m.list = null; loadAdmin(true);
    };
    return h('div', { class: 'adcard', 'data-review': c.id },
      h('div', { class: 'adcardhead' }, h('b', null, c.brand), h('span', { class: `tag stage-${c.stage}` }, STAGE[c.stage] || c.stage)),
      h('div', { class: 'eyebrow plain' }, `${c.advertiser} · ${c.billboard}, ${c.place} · ${sizeText(c.size)}${c.tv ? ' · digital screen' : ''}`),
      h('div', { class: 'adart small' }, c.art.map((x) => (m.art.get(x.id) ? h('a', { href: m.art.get(x.id), target: '_blank', rel: 'noopener' }, h('img', { src: m.art.get(x.id), alt: `Picture ${x.index + 1}, ${x.width} × ${x.height}` })) : h('span', { class: 'adslide loading' }, '...')))),
      line('Link', h('a', { href: c.link, target: '_blank', rel: 'noopener noreferrer nofollow' }, c.link)),
      line('Days', `${c.days}: ${dayText(c.start)} to ${lastDay(c.end)}`),
      line('Fee', tr(c.price.fee)), line('Tax', tr(c.price.tax)), line(c.status === 'pending' ? 'Held' : 'Total', tr(c.price.total)),
      line('Terms', `${c.termsVersion || ''}, accepted ${c.termsAt ? whenText(c.termsAt) : ''}${c.rights ? '; rights confirmed' : ''}`),
      line('Submitted', c.submitted ? whenText(c.submitted) : ''),
      c.reviewed ? line('Decided', whenText(c.reviewed)) : null,
      c.feedback ? h('p', { class: 'adfeedback' }, c.feedback) : null,
      c.status === 'pending' ? h('div', null, note, h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', 'data-approve': c.id, disabled: !!m.busy, onclick: () => decide(true) }, 'Approve'),
        h('button', { class: 'btn danger', type: 'button', 'data-reject': c.id, disabled: !!m.busy, onclick: () => decide(false) }, 'Do not approve'))) : null);
  }

  function money(root) {
    loadOverview();
    const m = a.admin;
    if (m.overviewError) { root.append(h('div', { class: 'notice' }, m.overviewError)); return; }
    const o = m.overview;
    if (!o) { root.append(h('p', { class: 'small' }, 'Asking the server...')); return; }
    root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', id: 'admin-refresh', onclick: () => { m.overview = null; loadOverview(true); } }, 'Refresh')));
    root.append(section('Advertising'), h('div', { id: 'admin-money' },
      line('Advertising tax collected (Delta State agency)', tr(o.bank.adTax)),
      line('Advertising fees taken', tr(o.bank.adFees)),
      line('Held for campaigns under review', tr(o.bank.adHeld)),
      Object.entries(o.campaigns).map(([status, v]) => line(`${STAGE[status] || status}`, `${v.count} (${tr(v.total)})`))));
    root.append(section('The bank'),
      line('Accounts', `${o.players.accounts} (${o.players.admins} administrator${o.players.admins === 1 ? '' : 's'})`),
      line('TR in players\' wallets', tr(o.players.balance)), line('of which starter', tr(o.players.starter)), line('of which earned', tr(o.players.earned)), line('of which taken from others', tr(o.players.illicit)),
      line('Set aside for market offers', tr(o.bank.offersHeld)), line('Issued by the bank in all', tr(o.bank.issued)),
      o.audit.length ? h('div', { class: 'notice', id: 'admin-audit' }, `The books disagree: ${o.audit.join('; ')}`) : h('div', { class: 'notice good', id: 'admin-audit' }, 'The books agree: every balance matches its entries and every movement sums to nothing.'));
    root.append(section('Advertising tax, entry by entry'));
    root.append(o.tax.length ? h('div', { class: 'rows' }, o.tax.map((t) => line(`${t.ref} · ${t.advertiser || ''} · ${t.billboard || ''}`, `${t.amount < 0 ? '−' : '+'}${tr(Math.abs(t.amount))}`))) : h('p', { class: 'small' }, 'None yet.'));
    root.append(section('Recent payments'));
    root.append(h('div', { class: 'rows', id: 'admin-payments' }, o.recent.map((r) => h('div', { class: 'line' }, h('span', null, `${r.kind} · ${r.who || 'the bank'}`, h('div', { class: 'eyebrow plain' }, `${r.ref} · ${whenText(r.at)}${r.note ? ` · ${r.note}` : ''}`)),
      h('span', null, r.credited ? `+${tr(r.credited)} ` : '', r.debited ? `−${tr(r.debited)}` : '')))));
    root.append(section('Market sales'));
    root.append(o.sales.length ? h('div', { class: 'rows' }, o.sales.map((s) => line(`${s.what} · ${s.seller} → ${s.buyer}`, tr(s.amount)))) : h('p', { class: 'small' }, 'None yet.'));
    if (o.upgrades.length) { root.append(section('Character upgrades')); root.append(h('div', { class: 'rows' }, o.upgrades.map((u) => line(`${u.who}: ${u.from} → ${u.to}`, tr(u.fee))))); }
    root.append(section('Advertising history'));
    root.append(o.events.length ? h('div', { class: 'rows' }, o.events.map((e) => line(`${e.action} · ${e.actor || 'the server'}${e.note ? ` · ${e.note}` : ''}`, whenText(e.at)))) : h('p', { class: 'small' }, 'None yet.'));
  }
  const adminBack = () => ({});

  return { page, back, deep, adminPage, adminBack, leave() {}, isAdmin, refresh: () => { a.mine = null; loadMine(true); loadCatalog(true); } };
}

