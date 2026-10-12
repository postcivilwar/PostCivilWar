// Everything drawn in HTML over the world: the HUD, the sheet that every
// office and shop opens, receipts, the phone and the map.

import { SOUND_NAMES } from './audio.js';
import { ZONE, ZONE_TEXT, zoneResident, zoneParcel, zoneService } from '../sim/zone.js';
import { LANGUAGES } from '../sim/culture.js';
import { NIGERIA_STATES, NIGERIA_ZONES } from '../sim/nigeria.js';
import { geoToWorld } from '../sim/geo.js';
import { createTownMap } from './town-map.js';
import { GOODS, DESIGNS, PAINT_COLOURS, MASON_RATE, BUSINESSES, countOf } from '../sim/economy.js';
import { clockOf, dateOf } from '../sim/sim.js';
import { lowerFirst } from '../sim/vehicles.js';
import { KEKE_TRIMS } from '../sim/vehicle-looks.js';
import { HEALTH } from '../sim/conflict.js';
import { trAmount, trText, trPlain, trIn, poundsOf, TR } from '../sim/ledger.js';
import { createPhone } from './ui-phone.js';
import { createPanels } from './ui-panels.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === false || value == null) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style') el.style.cssText = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const $ = (id) => document.getElementById(id);
export const money = (n) => Math.round(n).toLocaleString('en-GB');
// amounts of money are ledger units, two to a TR (src/sim/ledger.js)
// What the game is, in its owner's words. (The three paragraphs are theirs, and are shown as they wrote them.)
export const ABOUT = Object.freeze([
  'Step into a rich, immersive world set in post-civil war Nigeria, after the Biafran conflict. This open-world life simulation invites players from all backgrounds, worldwide, to experience a journey of reinvention. Set in the Eastern region of Nigeria after the 1970 ceasefire, you begin with just \u00a320, having lost everything in the aftermath of the war.',
  'In this game, you forge your own path: will you rise as a hero, helping rebuild your community or take a darker route as a villain? Whether you choose to work as a teacher, engineer, pastor or engage in crime\u2014car theft, smuggling or other high-stakes risks, your choices shape your destiny. Build wealth by trading land, cars, and assets; or lose yourself in the struggle for survival. Every action has consequences\u2014police, soldiers and justice will follow.',
  'Powered by TR as your currency, the game blends historical authenticity with limitless freedom. Anyone can experience the rich culture, the triumphs, and the challenges of rebuilding life in post-war Nigeria. Your story, your choices\u2014start today.',
]);

const amt = trAmount;
const tr = trText;
// (a time on the real clock is a date; on the game's own short days, a day's number)
const when = (t) => { const c = clockOf(t); if (t > 365 * 86400) { const d = dateOf(t); return `${d.day} ${d.month}, ${c.label}`; } return `Day ${c.day}, ${c.label}`; };
const WEATHER_WORD = { clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', storm: 'Storm' };

export function createUI(app) {
  const sheet = $('sheet');
  const body = $('sheet-body');
  const tabsBar = $('sheet-tabs');
  let current = null;       // { render, refresh? }
  let lastNext = '';

  // ---------------------------------------------------------------- sheet --

  function open(eyebrow, title, render, tabs, options) {
    $('sheet-eyebrow').textContent = eyebrow;
    $('sheet-title').textContent = title;
    sheet.hidden = false;
    sheet.classList.toggle('device', !!(options && options.device));
    sheet.classList.remove('mini', 'page', 'big');
    current = { render, tabs, tab: tabs ? tabs[0].id : null, live: false };
    drawTabs();
    redraw();
    $('sheet-close').focus({ preventScroll: true });
  }

  // The phone is used in two ways (ui-phone.js): in the hand, small, at the lower right with the town in view
  // ('mini'), or as a page over the whole screen ('page'). In the hand it is drawn at one size and scaled to
  // fit: as tall as the screen allows under the top band, and never so wide that the stick is covered.
  const HANDSET = { w: 320, h: 692 };
  function fitPhone() {
    if (!sheet.classList.contains('mini')) return;
    const game = $('game');
    const W = game.clientWidth || window.innerWidth, H = game.clientHeight || window.innerHeight;
    const upright = H > W;
    const room = H - (upright ? 150 : 62) - 14;                       // upright, the purse and the clock stay in view above it
    let k = Math.max(0.3, Math.min(1, room / HANDSET.h, (W * (upright ? 0.6 : 0.3)) / HANDSET.w, 620 / HANDSET.h));
    // A conversation is typed in, so for that the handset is brought close: as large as the screen allows. On a
    // phone the keyboard comes up over the foot of the page; the handset is fitted into what is left above it.
    sheet.style.removeProperty('bottom');
    if (sheet.classList.contains('big')) {
      const vv = window.visualViewport;
      const seen = vv ? vv.height : H;
      const lifted = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      k = Math.max(0.3, Math.min(1.35, (seen - (lifted ? 8 : upright ? 62 : 24)) / HANDSET.h, (W * (upright ? 1 : 0.42) - 12) / HANDSET.w));
      if (lifted) sheet.style.bottom = `${Math.round(lifted + 4)}px`;
    }
    sheet.style.setProperty('--pk', k.toFixed(4));
    sheet.style.width = `${Math.round(HANDSET.w * k)}px`;
    sheet.style.height = `${Math.round(HANDSET.h * k)}px`;
  }
  function mode(next, options) {
    const was = sheet.classList.contains('mini') ? 'mini' : sheet.classList.contains('page') ? 'page' : '';
    const big = !!(options && options.big) && next === 'mini';
    const wasBig = sheet.classList.contains('big');
    sheet.classList.toggle('big', big);
    if (was === next) { if (next === 'mini' && big !== wasBig) fitPhone(); else if (next === 'mini') fitPhone(); return; }
    sheet.classList.toggle('mini', next === 'mini');
    sheet.classList.toggle('page', next === 'page');
    if (next === 'mini') fitPhone(); else { sheet.style.removeProperty('width'); sheet.style.removeProperty('height'); }
  }
  for (const type of ['resize', 'orientationchange']) window.addEventListener(type, () => setTimeout(fitPhone, 60));
  if (window.visualViewport) for (const type of ['resize', 'scroll']) window.visualViewport.addEventListener(type, () => fitPhone());
  const usingPhone = () => !sheet.hidden && sheet.classList.contains('device');
  const phoneOut = () => usingPhone() && sheet.classList.contains('mini');
  // how much of the screen the handset covers on its right, for the game to keep the character clear of it
  const phoneWidth = () => (phoneOut() ? sheet.getBoundingClientRect().width + 14 : 0);

  function drawTabs() {
    tabsBar.replaceChildren();
    tabsBar.hidden = !current.tabs;
    if (!current.tabs) return;
    for (const tab of current.tabs) {
      tabsBar.append(h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(tab.id === current.tab), onclick: () => { current.tab = tab.id; drawTabs(); redraw(); } }, tab.label));
    }
  }

  function redraw(message) {
    if (!current) return;
    // where the reader had got to: the panel itself scrolls, or on the phone the screen inside the handset
    const inner = body.querySelector('.screen');
    const scroll = body.scrollTop, innerScroll = inner ? inner.scrollTop : 0;
    body.replaceChildren();
    current.live = false;
    current.refresh = null;
    current.render(body, current.tab);
    const screen = body.querySelector('.screen');
    // what an action answered: at the head of the panel, or of the handset's screen
    if (message) (screen || body).prepend(h('div', { class: `notice pinned${message.good ? ' good' : ''}`, role: 'status' }, message.text));
    body.scrollTop = scroll;
    // the same screen drawn again keeps its place; a screen just opened starts at its head
    if (screen) screen.scrollTop = message || screen.classList.contains('opening') ? 0 : innerScroll;
  }

  function close() {
    sheet.hidden = true;
    sheet.classList.remove('mini', 'page', 'big');
    sheet.style.removeProperty('width'); sheet.style.removeProperty('height'); sheet.style.removeProperty('bottom');
    if (phone && phone.market.dealOpen) phone.market.closeDeal();
    if (phone) { phone.market.leave(); phone.wallet.leave(); }
    current = null;
    $('view').focus({ preventScroll: true });
    if (app.closed) app.closed();
  }
  $('sheet-close').addEventListener('click', close);

  // Runs an action and redraws with its outcome.
  function act(intent, successText) {
    const result = app.send(intent);
    redraw(result.ok ? (successText ? { good: true, text: typeof successText === 'function' ? successText(result) : successText } : null) : { text: result.message });
    return result;
  }

  const refused = (result) => h('div', { class: 'notice' }, result.message);
  const section = (title) => h('h3', null, title);
  const line = (label, value, cls) => h('div', { class: 'line' }, h('span', null, label), h('span', { class: cls || '' }, value));
  // A panel that says what it depends on is drawn again when that changes.
  const live = (fn) => { current.live = fn; current.signature = fn(); };
  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));

  // ------------------------------------------------------------ residents --

  // Speaking to a resident no longer opens a panel. The simulation makes the
  // lines, and they appear as speech over the two people talking.
  function openDialogue(residentId) {
    const result = app.send({ type: 'talk', residentId });
    if (!result.ok) toast({ type: 'note', text: result.message });
  }

  function talkToPerson(index) {
    const result = app.send({ type: 'talk.person', index });
    if (!result.ok) toast({ type: 'note', text: result.message });
  }

  // Asking an okada rider to take you somewhere.
  function openOkada(n) {
    open('Okada', 'Where to?', (root) => {
      const r = app.send({ type: 'okada.options', n });
      if (!r.ok) { root.append(refused(r)); return; }
      root.append(h('p', null, `${r.rider.name} will take you there on the back of his motorcycle. You pay before you set off.`));
      const balance = app.view().self.balance;
      root.append(h('div', { class: 'rows' }, r.stops.map((stop) => h('button', { class: 'rowbtn', type: 'button', disabled: balance < stop.fare, onclick: () => { const out = app.send({ type: 'okada.ride', n, stop: stop.id }); if (out.ok) close(); else redraw({ text: out.message }); } },
        h('strong', null, `${amt(stop.fare)}`), h('span', null, stop.name), h('span', { class: 'eyebrow' }, `${stop.metres} m`)))));
      if (r.stops.every((stop) => balance < stop.fare)) root.append(h('div', { class: 'notice' }, `The shortest ride is ${tr(Math.min(...r.stops.map((stop) => stop.fare)))}. You have ${tr(balance)}.`));
    });
  }


  // -------------------------------------------------------------- services --

  function openService(id) {
    const opener = { registry: openRegistry, secretariat: openSecretariat, yard: () => openShop('yard'), store: () => openShop('store'), kitchen: openKitchen, clinic: () => panels.openCare('clinic'), hospital: () => panels.openCare('hospital'), school: openSchool, police: () => panels.openPoliceDesk(), park: openPark }[id];
    opener();
  }

  function deed(p) {
    return h('div', { class: 'deed' },
      h('h4', null, 'Certificate of Title'),
      h('div', { class: 'sub' }, `Lands Registry, ${ZONE.name} · ${ZONE.stateName} State`),
      kv([['Title no.', p.titleNo], ['Property ID', p.id], ['Plot', `${p.plot}, ${p.scheme}`], ['Holder', p.ownerName], ['Area', `${money(p.area)} m²`], ['Zoning', `${p.zoning} ${p.zoningName}`], ['Position', `${p.lat.toFixed(5)}° N, ${p.lon.toFixed(5)}° E`]]),
      h('div', { class: 'stamp' }, 'Registered'));
  }

  function parcelDetails(p) {
    return [
      kv([
        ['Property ID', h('span', { class: 'mono' }, p.id)],
        ['Plot', `${p.plot}, ${p.scheme}`],
        ['State and LGA', `${p.state}, ${p.lga}`],
        ['Zoning', `${p.zoning} ${p.zoningName}`],
        ['Permitted use', p.permittedUses.length ? p.permittedUses.map((u) => DESIGNS[u].name).join(', ') : 'Farming only. No buildings in this build.'],
        ['Area', `${money(p.area)} m²`],
        ['Position', `${p.lat.toFixed(5)}° N, ${p.lon.toFixed(5)}° E`],
        ['Owner', p.ownerName],
        p.titleNo && ['Title', p.titleNo],
        ['Development', p.development],
        p.permit && ['Building permit', p.permit.no],
      ]),
      section('Record'),
      h('div', { class: 'rows' }, p.history.map((row) => line(row.detail, row.at ? when(row.at) : 'Survey'))),
    ];
  }

  function openRegistry() {
    let selected = null;
    let confirming = false;
    open(ZONE.government.state.short, 'Lands Registry', (root, tab) => {
      if (tab === 'account') return publicAccount(root, ZONE.government.state.code, `${ZONE.government.state.short} land account`);
      const result = app.send({ type: 'registry.list' });
      if (!result.ok) { root.append(refused(result)); return; }
      const chosen = result.parcels.find((p) => p.id === selected);
      if (chosen) {
        root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => { selected = null; confirming = false; redraw(); } }, 'Back to the register')));
        if (chosen.yours) root.append(deed(chosen));
        root.append(...parcelDetails(chosen));
        if (chosen.status === 'available') {
          root.append(section('Purchase'), line('Price', tr(chosen.price)), line('Registration fee, 3%', tr(chosen.fee)), line('Total', tr(chosen.total)));
          const balance = app.view().self.balance;
          if (balance < chosen.total) root.append(h('div', { class: 'notice' }, `You have ${tr(balance)}. You need ${tr(chosen.total - balance)} more.`));
          root.append(h('div', { class: 'actions' }, h('button', {
            class: 'btn primary', type: 'button', disabled: balance < chosen.total,
            onclick: () => {
              if (!confirming) { confirming = true; redraw(); return; }
              confirming = false;
              act({ type: 'registry.buy', parcelId: chosen.id }, (r) => `Plot ${r.parcel.plot} is yours. Title ${r.titleNo} has been entered in the register.`);
            },
          }, confirming ? `Confirm: pay ${tr(chosen.total)}` : 'Buy this plot')));
        }
        return;
      }
      root.append(h('p', null, `The register of the ${ZONE.scheme}. Choose a plot to see its record.`));
      for (const [code, label] of [['R1', 'Residential'], ['C1', 'Commercial'], ['A1', 'Agricultural']]) {
        root.append(section(label));
        root.append(h('div', { class: 'rows' }, result.parcels.filter((p) => p.zoning === code).map((p) => h('button', { class: 'rowbtn', type: 'button', onclick: () => { selected = p.id; confirming = false; redraw(); } },
          h('strong', null, p.plot),
          h('span', null, `${money(p.area)} m² · ${p.status === 'available' ? tr(p.total) : p.ownerName}`),
          h('span', { class: `chip ${p.yours ? 'yours' : p.status === 'available' ? 'sale' : 'taken'}` }, p.yours ? 'Yours' : p.status === 'available' ? 'For sale' : 'Taken')))));
      }
    }, [{ id: 'register', label: 'Register' }, { id: 'account', label: 'Public account' }]);
  }

  function publicAccount(root, code, title) {
    const result = app.send({ type: 'treasury.public', code });
    if (!result.ok) { root.append(refused(result)); return; }
    root.append(h('p', null, `${title}. Anyone may read it.`));
    root.append(line('Balance', tr(result.balance)), line('Received since opening', tr(result.income), 'pos'), line('Paid out since opening', tr(result.spending), 'neg'));
    root.append(section('By purpose'));
    root.append(h('div', { class: 'rows' }, result.lines.length ? result.lines.map((row) => line(row.label, `${row.amount > 0 ? '+' : '−'}${amt(Math.abs(row.amount))}`, row.amount > 0 ? 'pos' : 'neg')) : h('p', null, 'Nothing has been received or paid yet.')));
  }

  function openSecretariat() {
    open(ZONE.government.local.short, 'Secretariat', (root, tab) => {
      if (tab === 'account') return publicAccount(root, ZONE.government.local.code, `${ZONE.government.local.short} council account`);
      const result = app.send({ type: 'permit.options' });
      if (!result.ok) { root.append(refused(result)); return; }
      root.append(h('p', null, 'A building permit is issued to the registered owner of a plot, for a use its zoning allows.'));
      if (!result.plots.length) { root.append(h('div', { class: 'notice' }, 'You do not own any land. Buy a plot at the Lands Registry first.')); return; }
      for (const plot of result.plots) {
        root.append(section(`Plot ${plot.plot} · ${plot.zoningName}`));
        if (plot.permit) { root.append(h('p', null, `Permit ${plot.permit.no} is in force for a ${DESIGNS[plot.permit.design].name.toLowerCase()}.`)); continue; }
        for (const design of result.designs) {
          const allowed = plot.permittedUses.includes(design.id);
          root.append(h('div', { class: 'qty' },
            h('div', null, h('strong', null, design.name), h('div', { class: 'eyebrow' }, `${design.size} · ${design.zoning} zoning`)),
            h('span', { class: 'mono' }, amt(design.fee)),
            h('button', { class: 'btn primary', type: 'button', disabled: !allowed, title: allowed ? '' : 'Not a permitted use on this plot', onclick: () => act({ type: 'permit.apply', parcelId: plot.id, design: design.id }, (r) => `Permit ${r.permitNo} issued. You may build.`) }, allowed ? 'Apply' : 'Not allowed')));
        }
        if (!plot.permittedUses.length) root.append(h('p', null, 'This plot is farmland. No building permits are issued for it in this build.'));
      }
    }, [{ id: 'permits', label: 'Permits' }, { id: 'account', label: 'Council account' }]);
  }

  function openShop(businessId) {
    const quantities = {};
    let deliverTo = null;
    let carry = null;
    open(businessId === 'yard' ? 'Block yard' : 'Building materials', BUSINESSES[businessId].name, (root) => {
      const result = app.send({ type: 'shop.catalogue', businessId });
      if (!result.ok) { root.append(refused(result)); return; }
      if (businessId === 'yard') {
        const job = app.send({ type: 'job.info' });
        root.append(section('Work'));
        root.append(h('p', null, `${zoneResident(BUSINESSES.yard.owner).short} pays ${tr(job.ok ? job.wage : BUSINESSES.yard.wagePerBlock)} for every block you mould. Stand at one of the two free moulds in the yard and hold E. You have moulded ${job.ok ? job.moulded : 0} so far.`));
        root.append(section('Buy'));
      }
      if (carry && !result.carriers.some((c) => c.id === carry)) carry = null;
      if (!result.plots.length && !result.carriers.length) root.append(h('div', { class: 'notice' }, 'Materials are delivered to a plot you own, or loaded into your own keke if it is standing outside. Buy a plot first.'));
      else {
        if (!carry && (!deliverTo || !result.plots.some((p) => p.id === deliverTo))) deliverTo = result.plots.length ? result.plots[0].id : null;
        if (!deliverTo && !carry) carry = result.carriers[0].id;
        const choice = carry ? `carry:${carry}` : deliverTo;
        root.append(h('label', null, h('span', { class: 'eyebrow' }, 'How it gets there'), h('select', { class: 'field', id: 'deliver-to', onchange: (e) => { const value = e.target.value; if (value.startsWith('carry:')) carry = value.slice(6); else { carry = null; deliverTo = value; } redraw(); } },
          result.plots.map((p) => h('option', { value: p.id, selected: p.id === choice }, `Delivered to Plot ${p.plot}`)),
          result.carriers.map((c) => h('option', { value: `carry:${c.id}`, selected: `carry:${c.id}` === choice }, `Carry it in my keke ${c.plate}`)))));
        if (carry) { const c = result.carriers.find((x) => x.id === carry); root.append(h('p', { class: 'eyebrow' }, `No delivery charge · room for ${c.free} of ${c.capacity} load units · a block is ${result.loadUnits.block}, a bag of cement ${result.loadUnits.cement}`)); }
      }
      for (const item of result.items) {
        if (quantities[item.item] == null) quantities[item.item] = item.item === 'block' ? 30 : 1;
        const input = h('input', { class: 'field mono', id: `qty-${item.item}`, type: 'number', min: '1', max: '500', value: String(quantities[item.item]), 'aria-label': `Quantity of ${item.name}`, oninput: (e) => { quantities[item.item] = Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1))); } });
        root.append(h('div', { class: 'qty' },
          h('div', null, h('strong', null, item.name), h('div', { class: 'eyebrow' }, `${amt(item.price)} per ${item.unit} · ${money(item.stock)} in stock`)),
          input,
          h('button', { class: 'btn primary', type: 'button', disabled: !result.plots.length && !carry, onclick: () => act({ type: 'shop.buy', businessId, item: item.item, qty: quantities[item.item], parcelId: carry ? null : deliverTo, carry }, (r) => (r.carried ? `Paid ${tr(r.total)}. It is loaded in keke ${r.plate}.` : `Paid ${tr(r.total)} including delivery. It reaches the plot in about ${r.dueMinutes} minutes.`)) }, 'Buy')));
      }
      if (!carry) root.append(h('p', { class: 'eyebrow' }, `Delivery ${tr(result.business.delivery)} per order`));
    });
  }

  function openKitchen() {
    open('Food', BUSINESSES.kitchen.name, (root) => {
      const energy = app.view().self.energy;
      root.append(h('p', null, `${ZONE.dish}, served hot. A plate restores your strength.`));
      root.append(line('One plate', tr(BUSINESSES.kitchen.sells.meal)), line('Your energy', `${Math.round(energy)} of 100`));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => act({ type: 'eat' }, 'You eat. That is better.') }, 'Buy a plate')));
    });
  }

  // The motor park: hire, purchase and petrol.
  function vehicleLines(v) {
    const state = v.owned ? 'yours' : v.usable ? `on hire until ${when(v.hiredUntil)}` : 'hire ended';
    const cargo = Object.entries(v.cargo).filter(([, qty]) => qty > 0).map(([item, qty]) => countOf(item, qty)).join(', ');
    return [line(`Keke ${v.plate} · ${state}`, `${v.fuel.toFixed(1)} of ${v.tank} litres`), cargo ? h('p', { class: 'eyebrow' }, `Carrying ${cargo}`) : null];
  }

  function openPark() {
    let confirming = false;
    const wanted = { paint: 'yellow', trim: 'modern' };
    open('Motor park', zoneService('park').name, (root) => {
      const r = app.send({ type: 'vehicle.options' });
      if (!r.ok) { root.append(refused(r)); return; }
      const k = r.kind;
      root.append(h('p', null, `${r.dealer} hires kekes out by the day and sells them new, brought down from ${r.madeIn}. A keke carries your own materials home with no delivery charge, and it earns: paid delivery runs are listed on your phone.`));
      if (r.mine.length) {
        root.append(section('Your kekes'));
        for (const v of r.mine) {
          root.append(...vehicleLines(v).filter(Boolean));
          const room = Math.floor((v.tank - v.fuel) * 10) / 10;
          if (v.usable) root.append(h('div', { class: 'actions' },
            h('button', { class: 'btn', type: 'button', disabled: room < 0.1, onclick: () => act({ type: 'vehicle.refuel', vehicleId: v.id, litres: 2 }, (x) => `${x.litres.toFixed(1)} litres of petrol for ${tr(x.cost)}.`) }, `Petrol, 2 litres: ${tr(Math.ceil(Math.min(2, room) * r.fuelPrice))}`),
            h('button', { class: 'btn', type: 'button', disabled: room < 0.1, onclick: () => act({ type: 'vehicle.refuel', vehicleId: v.id, litres: 99 }, (x) => `Tank filled: ${x.litres.toFixed(1)} litres for ${tr(x.cost)}.`) }, `Fill the tank: ${tr(Math.ceil(room * r.fuelPrice))}`)));
        }
      }
      const hiring = r.mine.some((v) => !v.owned);
      root.append(section('Hire for the day'));
      root.append(line('Fee', tr(k.hirePerDay)), line('Free to hire now', String(r.forHire)));
      root.append(h('p', null, 'Yours until six tomorrow morning. Petrol is extra. Leave it anywhere when you are done and it will be taken back to the park.'));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: hiring || r.forHire < 1, onclick: () => act({ type: 'vehicle.hire' }, (x) => `Keke ${x.vehicle.plate} is yours for the day. It is standing in the park with a yellow ring under it.`) }, hiring ? 'You have one on hire' : `Hire a keke: ${tr(k.hirePerDay)}`)));
      root.append(section('Buy one'));
      root.append(line('Price', tr(k.price)), line('State registration and plate', tr(k.registration)), line('In all', tr(k.total)));
      // the same keke in any of the dealer's colours, with any of the three fronts
      if (!r.paints.some((c) => c.id === wanted.paint)) wanted.paint = 'yellow';
      if (!r.trims.includes(wanted.trim)) wanted.trim = r.trims[0];
      root.append(h('div', { class: 'eyebrow' }, `Colour: ${r.paints.find((c) => c.id === wanted.paint).name}`));
      root.append(h('div', { class: 'swatches' }, r.paints.map((c) => h('button', { class: 'swatch', type: 'button', title: c.name, 'aria-label': c.name, 'aria-pressed': String(wanted.paint === c.id), style: `background:#${c.colour.toString(16).padStart(6, '0')}`, onclick: () => { wanted.paint = c.id; confirming = false; redraw(); } }))));
      root.append(h('div', { class: 'eyebrow' }, 'Front'));
      root.append(h('div', { class: 'actions' }, r.trims.map((t) => h('button', { class: wanted.trim === t ? 'btn primary' : 'btn', type: 'button', 'aria-pressed': String(wanted.trim === t), onclick: () => { wanted.trim = t; confirming = false; redraw(); } }, KEKE_TRIMS[t] || t))));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => {
        if (!confirming) { confirming = true; redraw(); return; }
        confirming = false;
        act({ type: 'vehicle.buy', paint: wanted.paint, trim: wanted.trim }, (x) => `Keke ${x.vehicle.plate} is registered in your name. It is standing in the park.`);
      } }, confirming ? `Confirm: pay ${tr(k.total)}` : 'Buy a new keke')));
      root.append(h('p', { class: 'eyebrow' }, `Tank ${k.tank} litres · carries ${k.capacity} load units · petrol ${tr(r.fuelPrice)} a litre`));
    });
  }

  function openSchool() {
    open('Education', BUSINESSES.school.name, (root) => {
      const certified = app.view().self.skills.blocklaying;
      root.append(h('p', null, 'Block-laying certificate. One class of two hours. With it, each spell of work you do on your own site counts double.'));
      root.append(line('Course fee', tr(BUSINESSES.school.fee)), line('Certificate', certified ? 'Held' : 'Not held'));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: certified, onclick: () => act({ type: 'school.enrol' }, 'You sat the class and passed. Two hours have gone by.') }, certified ? 'Already certified' : 'Enrol and attend')));
    });
  }

  // ------------------------------------------------------ plots and sites --

  function openBoard(parcelId) {
    const p0 = zoneParcel(parcelId);
    open('Survey board', `Plot ${p0.plot}`, (root) => {
      const result = app.send({ type: 'parcel.inspect', parcelId });
      if (!result.ok) { root.append(refused(result)); return; }
      const p = result.parcel;
      const s = result.site;
      if (p.status === 'available') {
        root.append(h('p', null, `For sale by the State. ${tr(p.price)} plus a 3% registration fee: ${tr(p.total)} in all.`));
        root.append(h('div', { class: 'notice good' }, ZONE_TEXT.toRegistry));
      }
      if (p.yours) root.append(...siteBlock(s, parcelId));
      root.append(...parcelDetails(p));
    });
  }

  function siteBlock(s, parcelId) {
    const out = [];
    if (!s.permit) {
      out.push(h('div', { class: 'notice' }, 'This is your land. Before you build, get a building permit at the Local Government Secretariat on Registry Road.'));
      return out;
    }
    const site = s.site;
    out.push(section(`${site.designName} · permit ${s.permit.no}`));
    s.stages.forEach((st, index) => {
      const done = index < site.stage;
      const now = index === site.stage && !site.complete;
      const needs = Object.entries(st.needs).map(([item, qty]) => countOf(item, qty)).join(', ');
      out.push(h('div', { class: `stage${done ? ' done' : ''}${now ? ' now' : ''}` }, h('span', { class: 'dot' }),
        h('div', null, h('strong', null, st.name), done ? ' · done' : now && site.started ? ` · ${site.labour} of ${st.labour} units of labour` : '', h('small', null, `${needs} · ${st.labour} units of labour`))));
    });
    if (site.complete) {
      out.push(h('div', { class: 'notice good' }, 'The building is finished. Stand at the door and press E to sleep here.'));
      out.push(section('Wall colour'));
      out.push(h('div', { class: 'swatches' }, Object.entries(PAINT_COLOURS).map(([name, hex]) => h('button', { class: 'swatch', type: 'button', title: name, 'aria-label': name, 'aria-pressed': String(site.paint === name), style: `background:#${hex.toString(16).padStart(6, '0')}`, onclick: () => act({ type: 'site.paint', parcelId, colour: name }) }))));
      return out;
    }
    out.push(section('On site'));
    const items = Object.keys(GOODS).filter((item) => item !== 'meal');
    out.push(h('div', { class: 'rows' }, items.map((item) => {
      const have = s.stock[item] || 0;
      const coming = s.transit[item] || 0;
      const need = s.current.needs[item] || 0;
      return line(GOODS[item].name, `${have}${coming ? ` (+${coming} on the way)` : ''}${need && !site.started ? ` / ${need} needed` : ''}`, need && !site.started && have < need ? 'neg' : '');
    })));
    const missing = Object.entries(s.current.short);
    if (!site.started && missing.length) {
      out.push(h('div', { class: 'notice' }, `${s.current.name} cannot start yet. Still needed: ${missing.map(([item, qty]) => countOf(item, qty)).join(', ')}. ${ZONE_TEXT.materials}`));
    } else {
      const units = s.current.labour - site.labour;
      out.push(h('p', null, `Ready for ${s.current.name.toLowerCase()}. Work it yourself: stand at the yellow marker beside the pad and hold E. Or pay the mason to do this stage.`));
      out.push(h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: !!site.mason, onclick: () => act({ type: 'site.hire', parcelId }, (r) => `${zoneResident('mason').name} is engaged for ${r.stage.toLowerCase()} and is walking over.`) }, site.mason ? 'Mason at work' : `Hire the mason: ${tr(units * MASON_RATE)}`)));
      if (s.current.dry) out.push(h('p', { class: 'eyebrow' }, 'This stage stops when it rains'));
    }
    return out;
  }

  // ---------------------------------------------------------------- phone --

  let mapMode = 'town';
  const noticeLog = [];        // what the player has been told, kept for the Notices app

  // The handset and its apps are in ui-phone.js. The screens that existed before it are handed over as they were.
  let phone = null;
  let panels = null;
  function openPhone(appId, state) { phone.show(appId === 'help' ? 'settings' : appId || null, state); }

  // This world's own entries: all there is to show in a copy of the game with no server (ui-wallet.js).
  function wallet(root) {
    const result = app.send({ type: 'wallet.history' });
    if (!result.rows.length) { root.append(h('p', null, 'Nothing yet. Earn a wage at the block yard.')); return; }
    root.append(h('div', { class: 'rows' }, result.rows.map((row) => h('div', { class: 'line' },
      h('span', null, row.reason, h('div', { class: 'eyebrow mono' }, `${row.id} · ${when(row.at)}`)),
      h('span', { class: row.amount > 0 ? 'pos' : 'neg' }, `${row.amount > 0 ? '+' : '−'}${amt(Math.abs(row.amount))}`)))));
  }

  function property(root) {
    const result = app.send({ type: 'property.list' });
    if (!result.parcels.length) { root.append(h('p', null, 'You hold no land. Plots are sold at the Lands Registry on Registry Road.')); return; }
    for (const entry of result.parcels) {
      root.append(deed(entry.parcel));
      root.append(...siteBlock(entry.site, entry.parcel.id));
    }
  }

  function journal(root) {
    root.append(h('p', null, 'Nothing here is an order. It is what most newcomers do, in roughly this sequence.'));
    for (const step of app.view().journal) root.append(h('div', { class: `stage${step.done ? ' done' : ''}` }, h('span', { class: 'dot' }), h('div', null, step.text)));
  }

  // Delivery work for anyone with a keke.
  function runs(root) {
    const r = app.send({ type: 'run.list' });
    current.live = () => JSON.stringify(app.send({ type: 'run.list' }));
    current.signature = JSON.stringify(r);
    root.append(h('p', null, 'Businesses and neighbours pay to have things carried across town. A run goes to whoever takes it first. If nobody does, the dealer at the motor park does it himself.'));
    if (!r.hasVehicle) root.append(h('div', { class: 'notice' }, 'You need a keke for this. Hire or buy one at the motor park.'));
    if (r.mine) {
      root.append(section('Your run'));
      root.append(line(r.mine.what, tr(r.mine.fee)));
      root.append(h('p', null, r.mine.state === 'accepted' ? `Collect it at ${r.mine.from.label}. A yellow beacon marks the spot. Drive into the ring and press E.` : `Loaded. Take it to ${r.mine.to.label}, drive into the ring and press E. You are paid on delivery.`));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => act({ type: 'run.drop' }, 'You gave the run up.') }, 'Give up this run')));
    }
    root.append(section('Open runs'));
    if (!r.open.length) root.append(h('p', null, 'Nothing open just now. Runs are posted through the day, from half past six in the morning.'));
    for (const run of r.open) {
      root.append(h('div', { class: 'qty' },
        h('div', null, h('strong', null, run.what), h('div', { class: 'eyebrow' }, `${run.from.label} to ${run.to.label} · open until ${clockOf(run.closesAt).label}`)),
        h('span', { class: 'mono' }, amt(run.fee)),
        h('button', { class: 'btn primary', type: 'button', disabled: !r.hasVehicle || !!r.mine, onclick: () => act({ type: 'run.accept', runId: run.id }, (x) => `Taken. Collect it at ${x.run.from.label}.`) }, 'Take it')));
    }
    root.append(line('Runs you have delivered', String(r.done)));
    const mine = app.send({ type: 'vehicle.mine' });
    if (mine.ok && mine.vehicles.length) {
      root.append(section('Your kekes'));
      for (const v of mine.vehicles) root.append(...vehicleLines(v).filter(Boolean));
    }
  }

  // Language, other players, and the town's numbers.
  function peopleTab(root) {
    const view = app.view();
    const link = app.link();
    current.live = () => `${app.view().players.length}|${app.link().peers}|${app.view().chat.near.length}`;
    current.signature = current.live();
    root.append(section('Your language'));
    root.append(h('p', null, 'What you say to other players is marked with this language. Townspeople who speak it will greet you in it.'));
    root.append(h('div', { class: 'actions' }, Object.values(LANGUAGES).map((lang) => h('button', { class: 'btn choice', type: 'button', 'aria-pressed': String(view.self.lang === lang.id), onclick: () => { app.send({ type: 'settings.language', lang: lang.id }); redraw(); } }, lang.short))));
    root.append(h('div', { class: 'setrow' }, h('span', null, 'Show a translation under speech in another language'), toggle('translate-on', app.settings.translate(), 'Translate speech in another language', (on) => { app.settings.setTranslate(on); redraw(); })));
    root.append(h('p', { class: 'eyebrow' }, app.settings.machine() ? 'What was said is always shown as it was said · common phrases come from the built-in phrase book · anything else can be translated by Claude when you tap Translate' : 'What was said is always shown as it was said · translations come from the built-in phrase book of common phrases'));

    root.append(section('Other players'));
    root.append(line('Connection', link.kind === 'room' ? (link.failed ? 'Not connected' : 'This page, live') : link.kind === 'none' ? 'Playing alone' : link.kind));
    root.append(line('Players elsewhere in town', String(view.players.length)));
    root.append(line('Close enough to talk', String(view.chat.near.length)));
    root.append(h('p', null, link.kind === 'none'
      ? 'This copy of the page cannot reach other players, so you are alone in town. The townspeople are still here.'
      : `Anyone who has this page open at the same time is in ${ZONE.name} with you. Walk within ${view.chat.radius} metres of another player and a Chat button appears. Each of you still has your own copy of the town: its clock, its money and its people are not shared yet.`));
    for (const q of view.players) root.append(line(q.name, `${Math.round(Math.hypot(q.x - view.self.x, q.z - view.self.z))} m · ${LANGUAGES[q.lang] ? LANGUAGES[q.lang].short : q.lang}`));

    root.append(section('The town'));
    root.append(line('People living here', money(view.population)), line('Today', `${view.calendar.weekday}${view.calendar.school ? '' : ' · no school'}`), line('In sight just now', String(view.people.length)), line('Okadas on the road', String(view.okadas.length)));
    root.append(h('p', null, 'Everyone in town has a name, a home, a family and something to do with the day. Walk up to anyone and press E to greet them.'));
  }

  // A switch: on or off. It says which in three ways (where the knob is, the colour of the track, and the word
  // beside it), says so to a screen reader, and is worked by a press, a click, Enter or the space bar. What it
  // shows is the setting itself: it moves when the setting has changed, and the caller draws it again from that.
  function toggle(id, on, label, change) {
    const word = h('span', { class: 'switchword', 'aria-hidden': 'true' }, on ? 'On' : 'Off');
    const el = h('button', { class: 'switch', type: 'button', id, role: 'switch', 'aria-checked': String(!!on), 'aria-label': label });
    el.addEventListener('click', () => {
      const next = el.getAttribute('aria-checked') !== 'true';
      el.setAttribute('aria-checked', String(next)); word.textContent = next ? 'On' : 'Off';
      change(next);
    });
    return h('span', { class: 'switchbox' }, word, el);
  }

  function settings(root, viewNames) {
    // On the website: the account this character is kept with. (Nobody plays there without one.)
    if (app.online && app.online.available) {
      const st = app.online.status();
      const who = st.account ? st.account.username : app.accountName ? app.accountName() : '';
      root.append(section('Account'));
      if (st.state === 'in') {
        root.append(h('div', { class: 'rows' }, h('div', { class: 'setrow' }, h('span', null, 'Signed in as ', h('b', { id: 'settings-username' }, st.account.username)), h('button', { class: 'btn', type: 'button', id: 'settings-logout', onclick: () => app.account.logOut() }, 'Log out'))));
        root.append(h('p', { class: 'small' }, 'Your character, your TR and what you own are kept with your account, so they are the same on any device you log in on. Other players near you see your username over your head.'));
      } else root.append(h('p', { class: 'small', id: 'settings-offline' }, st.state === 'checking' ? 'Asking the server...' : `The game's server cannot be reached just now. ${st.message || ''} ${who ? `You are playing as ${who}: ` : ''}your character is kept on this device and goes to your account when the connection is back. Nothing can be sent, received, bought or sold until then.`));
    }
    // The character: who the player is, and the way to look at the others. (Looking changes nothing.)
    const mine = app.character ? app.character() : null;
    if (mine && app.gallery) {
      root.append(section('Character'));
      root.append(h('div', { class: 'rows' }, h('div', { class: 'setrow' }, h('span', null, 'Your character: ', h('b', { id: 'settings-character' }, mine.name)), h('button', { class: 'btn', type: 'button', id: 'open-gallery', onclick: () => app.gallery() }, 'View characters'))));
      root.append(h('p', { class: 'small' }, 'Your character was chosen when you arrived and stays yours. You can look at the others at any time; changing to one of them is a character upgrade, which is paid for.'));
    }
    root.append(section('Sound'));
    root.append(h('div', { class: 'rows' }, h('div', { class: 'setrow' }, h('span', null, 'Sound'), toggle('sound-on', app.soundOn(), 'Sound', () => { app.sound(); redraw(); }))));
    const levels = app.volumes();
    root.append(h('div', { class: 'rows faders' }, Object.keys(SOUND_NAMES).map((name) => {
      const shown = h('span', { class: 'mono' }, `${Math.round(levels[name] * 100)}`);
      const slider = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(levels[name] * 100)), 'aria-label': `${SOUND_NAMES[name]} volume` });
      const fill = () => slider.style.setProperty('--fill', `${slider.value}%`);
      fill();
      slider.addEventListener('input', () => { shown.textContent = slider.value; fill(); app.setVolume(name, Number(slider.value) / 100); });
      return h('label', { class: 'fader' }, h('span', null, SOUND_NAMES[name]), slider, shown);
    })));
    root.append(h('p', { class: 'small' }, 'Each kind of sound has its own volume. Music and background step back by themselves when something needs to be heard.'));

    // The town keeps the player's own time and, on the website, the real weather where they are
    {
      const v = app.view();
      const w = app.realWeather ? app.realWeather() : null;
      root.append(section('Time and weather'));
      const rows = [line('Time', app.realClock ? 'This device\'s own clock' : 'The game\'s own day, forty-eight minutes long')];
      if (v && v.date) rows.push(line('Today', `${v.calendar.weekday} ${v.date.day} ${v.date.month}`));
      rows.push(line('Weather', w ? `${WEATHER_WORD[w.kind]}${Number.isFinite(w.temperature) ? `, ${Math.round(w.temperature)}°C` : ''}${w.place ? ` in ${w.place}` : ''}` : 'The town\'s own', 'settings-weather'));
      root.append(h('div', { class: 'rows', id: 'settings-time' }, ...rows));
      root.append(h('p', { class: 'small' }, w
        ? 'Morning, afternoon and night come when they come where you are, and the sky is the real one there: weather data from The Norwegian Meteorological Institute (MET Norway, CC BY 4.0), for the approximate place your connection comes from. Where you are is not kept.'
        : 'Morning, afternoon and night come when they come where you are. When the real weather where you are cannot be had, the town has weather of its own.'));
    }

    const perf = app.perf();
    root.append(section('Detail'));
    root.append(h('div', { class: 'segment', role: 'group', 'aria-label': 'Detail' }, [['auto', 'Auto'], [0, 'Full'], [1, 'Reduced'], [2, 'Low'], [3, 'Lowest']].map(([value, label]) => h('button', { type: 'button', 'aria-pressed': String(perf.detail === value), onclick: () => { app.setDetail(value); redraw(); } }, label))));
    root.append(h('p', { class: 'small' }, 'Auto lowers detail only when frames are slow for several seconds on end, and raises it again when there is room. A single hitch never changes it.'));

    // On the website only: the game on this device. Each line is there only when it is true.
    if (app.webapp && app.webapp.site) {
      const WAYS = { yes: 'Yes', 'not yet': 'Not yet', no: 'No' };
      const cells = h('div', { class: 'rows', id: 'ondevice' });
      const note = h('p', { class: 'small' });
      const draw = () => {
        const now = app.webapp.state();
        const rows = [];
        if (now.way === 'installed') rows.push(line('Installed on this device', 'Yes'));
        // the browser has offered: one press, and the browser asks its own question
        if (now.way === 'prompt') rows.push(h('div', { class: 'setrow' }, h('span', null, 'Install on this device'), h('button', { class: 'btn primary', type: 'button', id: 'install-app', onclick: () => { app.webapp.install().then(() => { if (cells.isConnected) draw(); }); } }, 'Install')));
        rows.push(line('Plays without a connection', WAYS[now.offline]));
        cells.replaceChildren(...rows);
        const said = [];
        if (now.way === 'prompt') said.push('Installed, the game opens from its own icon, on the whole screen, without the browser round it.');
        if (now.way === 'share') said.push('To install: tap Share in the browser, then Add to Home Screen. The game then opens from its own icon, on the whole screen. Installed, it keeps its own characters: one made here in the browser stays here.');
        said.push(now.offline === 'no'
          ? 'This browser does not keep the game, so it needs a connection each time it is opened.'
          : 'Once it has loaded, the game is kept on this device and opens with no connection. With a connection it is always the newest.');
        note.textContent = said.join(' ');
      };
      draw();
      root.append(section('This device'), cells, note);
      app.webapp.refresh().then(() => { if (cells.isConnected) draw(); });
    }

    root.append(section('Controls'));
    root.append(h('div', { class: 'rows' }, [
      ['Walk', 'W A S D or arrow keys · the stick'], ['Run', 'Hold Shift · the Run button switches it on and off'], ['Look around', 'Drag on the world'], ['Zoom', 'Mouse wheel or pinch'],
      ['Act, talk, work, enter', 'E (hold to work)'], ['Change the view', `C: ${viewNames.map((n) => n.toLowerCase()).join(', ')}`],
      ['Fight', 'F, facing someone close: you square up. Then F punch, G heavy punch, R kick, hold Q to block, Space to dodge, Z shove, X grab, V to step away'],
      ['Take a vehicle', 'G, standing at the rider\'s side of a waiting motorcycle or the driver\'s side of an unlocked keke'], ['Pick a pocket', 'B, close behind someone'],
      ['Give yourself up', 'U, when you are wanted'], ['Drive a keke or a motorcycle', 'W and S to go and brake, A and D to steer, H for the horn, E to step out or get off'],
      ['Okada', 'E beside a waiting rider; E again to get down'], ['Chat', 'T, when another player is close'], ['Phone', 'Tab or P'], ['Map', 'M'], ['Sound on and off', 'N'], ['Close', 'Esc'],
    ].map(([a, b]) => line(a, b))));
    root.append(h('p', { class: 'small' }, 'Only the buttons that can be used just now are on screen. On a keyboard each has a key, shown beside it at the foot of the screen.'));

    // What the device is managing. These figures change every second; only they are drawn again, so a
    // slider being dragged or a place scrolled to is left alone.
    root.append(section('Measured on this device'));
    const LEVELS = ['Full', 'Reduced', 'Low', 'Lowest'];
    const measured = h('div', { class: 'rows' });
    const hitches = h('p', { class: 'small' });
    const measure = () => {
      const now = app.perf();
      const f = now.frame;
      const slowest = Object.entries(f.sections).sort((a, b) => b[1].max - a[1].max)[0];
      const changed = now.changes[now.changes.length - 1];
      measured.replaceChildren(...[
        ['Frames a second', now.fps.toFixed(0)],
        ['Typical frame · the slowest in twenty', `${f.ms.median} ms · ${f.ms.p95} ms`],
        [`Hitches over ${now.hitchMs} ms · freezes over ${now.freezeMs} ms`, `${f.hitches} · ${f.freezes} in ${f.seconds < 120 ? `${f.seconds} s` : `${Math.round(f.seconds / 60)} min`}`],
        ['Longest single part of a frame', slowest ? `${slowest[0]}, ${slowest[1].max} ms` : 'nothing yet'],
        ['Draw calls · triangles', `${now.calls} · ${money(now.triangles)}`],
        ['People: near · middle · far', `${now.near} · ${now.middle} · ${money(now.far)}`],
        ['Full figures · simple figures', `${now.rigs} · ${now.figures}`],
        ['Simulation, each view', `${now.viewMs.toFixed(2)} ms`], ['Simulation, each scan of the town', `${now.scanMs.toFixed(2)} ms`],
        ['Drawing', now.lite ? 'The lighter way, for a phone or tablet' : 'In full, for a desktop'],
        ['Detail level', `${LEVELS[now.quality]}${now.detail === 'auto' ? ', chosen automatically' : ', set by you'}`],
        ['Last change', changed ? `${LEVELS[changed.from]} to ${LEVELS[changed.to]}: ${changed.why}` : 'none'],
        ['Sound', now.sound]].map(([a, b]) => line(a, b)));
      hitches.hidden = !f.recent.length;
      hitches.textContent = f.recent.length ? `Latest hitches: ${f.recent.slice(-3).map((x) => `${x.ms} ms (${x.where})`).join('; ')}.` : '';
    };
    measure();
    current.refresh = measure;
    root.append(measured, hitches);

    root.append(section('Saved game'));
    root.append(h('p', { class: 'small' }, 'Erasing puts this character away for good and begins a new journey. Your account, your username, your TR and everything you own in the market are kept.'));
    root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', id: 'erase-save', onclick: () => app.erase() }, 'Erase this save and start again')));

    root.append(section('About'));
    root.append(h('div', { class: 'about', id: 'about' }, ABOUT.map((text) => h('p', null, text))));
  }

  // ------------------------------------------------------------------ map --

  // The Map app. The town is a map to find the way by (town-map.js): it is moved and zoomed with the hand, the
  // player is on it, and the way to a place is drawn along the town's own roads. `pick(place)` is called when a
  // name on the map is pressed; `fitTo` is a route to bring wholly into view, the first time it is shown.
  const townMapState = {};
  let townMap = null;
  function map(root, way, { pick = null, fitTo = null, live: liveWay = null } = {}) {
    root.append(h('div', { class: 'segment', role: 'group', 'aria-label': 'Which map' },
      h('button', { type: 'button', 'aria-pressed': String(mapMode === 'town'), onclick: () => { mapMode = 'town'; redraw(); } }, ZONE.name),
      h('button', { type: 'button', 'aria-pressed': String(mapMode === 'nation'), onclick: () => { mapMode = 'nation'; redraw(); } }, 'Nigeria')));
    if (townMap) { townMap.dispose(); townMap = null; }
    if (mapMode === 'town') {
      townMap = createTownMap({
        h, state: townMapState, onPick: pick,
        view: () => app.view(),
        way: () => (liveWay ? liveWay() : way),
        waypoint: () => app.waypoint(),
        listings: () => (app.market && app.online && app.online.signedIn ? app.market.state.all.filter((l) => l.place && l.place.zone === ZONE.id).map((l) => ({ x: l.place.x, z: l.place.z })) : []),
      });
      root.append(townMap.el);
      if (fitTo) requestAnimationFrame(() => { if (townMap) townMap.fit(fitTo); });
      root.append(h('div', { class: 'maplegend' },
        h('span', null, h('i', { class: 'lg me' }), 'You'), h('span', null, h('i', { class: 'lg route' }), 'The way'), h('span', null, h('i', { class: 'lg major' }), 'Tarred road'),
        h('span', null, h('i', { class: 'lg minor' }), 'Laterite road'), h('span', null, h('i', { class: 'lg mine' }), 'Your land'), h('span', null, h('i', { class: 'lg sale' }), 'Plot for sale')));
      root.append(h('p', { class: 'small' }, 'Drag to move the map. Pinch, or use + and −, to bring it closer. The round button brings it back to where you are. North is up.'));
    } else {
      const canvas = h('canvas', { class: 'map nation', width: '840', height: '720', role: 'img', 'aria-label': `The state capitals of Nigeria, with ${ZONE.name} marked` });
      root.append(canvas);
      drawNation(canvas);
      root.append(h('p', null, `All 36 states and the Federal Capital Territory are registered in the world model at 1:10 scale. Only ${ZONE.name} is built. Capitals are shown at approximate positions; state boundaries arrive with the map data.`));
    }
  }

  // The country: the state capitals where the world model has them, coloured by their zone. There are no
  // boundaries or coastline in the game's data yet, and none is drawn.
  const MAP_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  function drawNation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e9efdd'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const pts = NIGERIA_STATES.map((s) => ({ ...s, ...geoToWorld(s.lat, s.lon) }));
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x)), minZ = Math.min(...pts.map((p) => p.z)), maxZ = Math.max(...pts.map((p) => p.z));
    const pad = 64;
    const scale = Math.min((canvas.width - pad * 2) / (maxX - minX), (canvas.height - pad * 2 - 20) / (maxZ - minZ));
    const X = (x) => pad + (x - minX) * scale;
    const Z = (z) => pad + 20 + (z - minZ) * scale;
    ctx.strokeStyle = '#d3dcc3'; ctx.lineWidth = 1;
    for (let km = 0; km * 1000 <= maxX - minX + 20000; km += 20) { ctx.beginPath(); ctx.moveTo(X(minX + km * 1000), 0); ctx.lineTo(X(minX + km * 1000), canvas.height); ctx.stroke(); }
    for (let km = 0; km * 1000 <= maxZ - minZ + 20000; km += 20) { ctx.beginPath(); ctx.moveTo(0, Z(minZ + km * 1000)); ctx.lineTo(canvas.width, Z(minZ + km * 1000)); ctx.stroke(); }
    // the six zones each have a colour, and each state carries its own code beside it
    const zoneColour = { NW: '#b3541e', NE: '#7a5195', NC: '#c9930a', SW: '#2f7d4f', SE: '#1a73e8', SS: '#c0392b' };
    ctx.font = `700 14px ${MAP_FONT}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const p of pts) {
      ctx.fillStyle = zoneColour[p.zone]; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), p.code === 'FC' ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.strokeText(p.code, X(p.x), Z(p.z) - 12);
      ctx.fillStyle = '#26331f'; ctx.fillText(p.code, X(p.x), Z(p.z) - 12);
    }
    const here = { x: ZONE.origin.x, z: ZONE.origin.z };
    const text = `${ZONE.name} · you are here`;
    ctx.beginPath(); ctx.arc(X(here.x), Z(here.z), 20, 0, Math.PI * 2); ctx.fillStyle = 'rgba(26,115,232,0.2)'; ctx.fill();
    ctx.beginPath(); ctx.arc(X(here.x), Z(here.z), 9, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(X(here.x), Z(here.z), 6.5, 0, Math.PI * 2); ctx.fillStyle = '#1a73e8'; ctx.fill();
    ctx.textAlign = 'left'; ctx.font = `700 18px ${MAP_FONT}`; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 5; ctx.strokeText(text, X(here.x) + 24, Z(here.z) + 26); ctx.fillStyle = '#12458f'; ctx.fillText(text, X(here.x) + 24, Z(here.z) + 26);
    ctx.fillStyle = '#5a6650'; ctx.font = `500 14px ${MAP_FONT}`; ctx.fillText('Grid squares are 20 game km (200 real km)', pad, canvas.height - 16);
    let lx = 16; ctx.textAlign = 'left'; ctx.font = `600 13px ${MAP_FONT}`;
    for (const [code, name] of Object.entries(NIGERIA_ZONES)) { ctx.fillStyle = zoneColour[code]; ctx.beginPath(); ctx.arc(lx + 6, 22, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#26331f'; ctx.fillText(name, lx + 17, 27); lx += ctx.measureText(name).width + 34; }
  }

  // ------------------------------------------------------------------ HUD --

  const touchEl = $('touch');
  function updateHud(view) {
    $('hud-clock').textContent = view.clock.label;
    // the rings round the buttons turn white after dark
    const night = view.clock.hourFloat < 6.5 || view.clock.hourFloat >= 18.75;
    if (touchEl.classList.contains('night') !== night) touchEl.classList.toggle('night', night);
    $('hud-weather').textContent = WEATHER_WORD[view.weather.kind];
    // the purse: TR, and what that is in the pounds of the story (2,000 TR are £20)
    const balance = amt(view.self.balance);
    if ($('hud-balance').textContent !== balance) {
      $('hud-balance').textContent = balance;
      // (how many characters the balance is: the page sizes the figures from it, so that a great balance still fits)
      $('hud-balance').closest('.purse').style.setProperty('--n', String(balance.length + 2));
      const pounds = poundsOf(view.self.balance);
      $('hud-pounds').textContent = `= £${pounds.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(pounds) ? 0 : 2, maximumFractionDigits: 2 })}`;
    }
    const next = view.journal.find((step) => !step.done);
    const run = view.self.run;
    const text = run ? (run.state === 'accepted' ? `Run: collect ${lowerFirst(run.what)} at ${run.from.label}` : `Run: take the load to ${run.to.label} for ${tr(run.fee)}`)
      : next ? `Next, if you like: ${next.text}` : `You have a home in ${ZONE.name}. The town is yours to live in.`;
    const riding = view.self.riding;
    const shown = riding ? `On ${riding.rider.split(' ')[0]}'s okada to ${riding.to}` : text;
    // said once when it changes, then it fades: it is a suggestion, not a fixture
    // one thing said at a time: the next step waits while a notice is up
    if (shown !== lastNext && !noticeShowing()) { lastNext = shown; const el = $('hud-next'); el.textContent = shown; el.classList.remove('say'); void el.offsetWidth; el.classList.add('say'); }
    // the real date where the player is; on the game's own short days, the day's number
    const day = view.date ? `${view.calendar.weekday} ${view.date.day} ${view.date.month}` : `Day ${view.clock.day} · ${view.calendar.weekday}`;
    if ($('hud-day').textContent !== day) $('hud-day').textContent = day;
    const room = app.room();
    const roomLine = $('hud-room');
    if (roomLine.hidden === !!room) roomLine.hidden = !room;
    if (room && roomLine.textContent !== room) roomLine.textContent = room;
    setChat(view.chat);
  }

  // The chat button is there only while another player is close enough to
  // hear. Tapping it opens one line to type in; what is said appears over
  // the speaker's head like any other speech.
  const chatBar = $('chat-bar');
  const chatInput = $('chat-input');
  let chatNear = 0;
  function setChat(chat) {
    const can = !!chat && chat.can;
    $('chat-btn').hidden = !can || !chatBar.hidden;
    if (!can && !chatBar.hidden) closeChat();
    if (can && chat.near.length !== chatNear) { chatNear = chat.near.length; $('chat-count').textContent = chatNear > 1 ? String(chatNear) : ''; }
    if (!can) chatNear = 0;
  }
  function openChat() {
    const view = app.view();
    if (!view || !view.chat.can) return false;
    chatBar.hidden = false;
    $('chat-btn').hidden = true;
    chatInput.focus({ preventScroll: true });
    return true;
  }
  function closeChat() {
    chatBar.hidden = true;
    chatInput.value = '';
    chatInput.blur();
    $('view').focus({ preventScroll: true });
  }
  $('chat-btn').addEventListener('click', openChat);
  chatBar.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = chatInput.value;
    if (!text.trim()) { closeChat(); return; }
    const result = app.send({ type: 'chat.say', text });
    if (result.ok) chatInput.value = ''; else toast({ type: 'note', text: result.message });
  });
  chatInput.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); closeChat(); } });

  // The driver's readout: plate, speed, fuel and load.
  let dashText = '';
  function setDash(d) {
    const el = $('hud-dash');
    if (!d) { if (!el.hidden) { el.hidden = true; dashText = ''; } return; }
    const text = `${d.plate}|${Math.round(d.kmh)}|${d.fuel === null ? '' : d.fuel.toFixed(1)}|${d.load}`;
    if (text === dashText) return;
    dashText = text;
    el.hidden = false;
    $('dash-plate').textContent = d.fuel === null ? d.plate : `Keke ${d.plate}`;
    $('dash-speed').textContent = `${Math.round(d.kmh)} km/h`;
    const fuel = $('dash-fuel');
    fuel.hidden = d.fuel === null;
    $('dash-load').hidden = d.fuel === null;
    if (d.fuel === null) return;
    fuel.textContent = `Petrol ${d.fuel.toFixed(1)} L`;
    fuel.classList.toggle('low', d.fuel < 1);
    $('dash-load').textContent = d.load ? `Load ${d.load}/${d.capacity}` : 'Empty';
  }

  function setPrompt(prompt, progress) {
    const el = $('prompt');
    if (el.hidden !== !prompt) $('hud').classList.toggle('prompting', !!prompt);
    if (!prompt) { el.hidden = true; return; }
    el.hidden = false;
    $('prompt-text').textContent = prompt.text;
    $('prompt-key').textContent = prompt.key || 'E';
    const ring = $('prompt-ring');
    ring.hidden = !prompt.hold;
    if (prompt.hold) ring.firstElementChild.style.width = `${Math.round((progress || 0) * 100)}%`;
  }

  // The keys that do something just now, for a player at a keyboard. The pad
  // shows the same buttons on a touch screen. The large one is the prompt above.
  let keysShown = '';
  function setKeys(list, onPress) {
    const rows = list.filter((b) => b.id !== 'act' && b.key);
    const signature = rows.map((b) => `${b.id}:${b.label}:${b.pressed ? 1 : 0}:${b.tone || ''}`).join('|');
    if (signature === keysShown) return;
    keysShown = signature;
    $('hud').classList.toggle('crowded', list.length >= 6);
    const box = $('keys');
    box.hidden = !rows.length;
    box.replaceChildren(...rows.map((b) => {
      const el = h('button', { class: `key${b.tone === 'warn' ? ' warn' : ''}`, type: 'button', title: b.hint || b.label, 'aria-pressed': b.kind === 'toggle' || b.kind === 'hold' ? String(!!b.pressed) : null },
        h('span', { class: 'keycap' }, b.key.length === 1 ? b.key.toUpperCase() : b.key), h('span', null, b.label));
      if (b.kind === 'hold') {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); onPress(b.id, 'down'); });
        for (const type of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(type, () => onPress(b.id, 'up'));
      } else el.addEventListener('click', () => { onPress(b.id, 'down'); $('view').focus({ preventScroll: true }); });
      return el;
    }));
  }

  // Health, the other fighter, the law, and what the hands are busy with.
  const LAW_CHIP = { suspicious: 'Watched', wanted: 'Wanted', pursuit: 'Police in pursuit', arrested: 'Under arrest', custody: 'In custody', released: 'Released' };
  const TAKING = { okada: { reach: 'Reaching for the handlebar', pull: 'Pulling the rider off', mount: 'Getting on' }, keke: { door: 'At the driver\'s side', pull: 'Pulling the driver out', enter: 'Climbing into the seat' } };
  let vitalsShown = '';
  let lastLaw = 'normal', arrestTimer = 0, blackoutTimer = 0;
  function lift() { clearTimeout(blackoutTimer); const b = $('blackout'); b.classList.remove('on'); setTimeout(() => { if (!b.classList.contains('on')) b.hidden = true; }, 650); }
  let lastFlash = 0;
  // Notices sit under whatever is in the top corners, however tall that is just now (the purse grows when health is shown).
  const corners = [$('radar'), $('hudr')];
  let under = 0;
  function placeNotices() {
    const hud = $('hud');
    if (hud.hidden) return;
    const top = hud.getBoundingClientRect().top;
    const inset = corners[0].getBoundingClientRect().top - top;
    const low = Math.max(...corners.map((el) => el.getBoundingClientRect().bottom - top));
    // --under is measured from the safe area's edge, as the corners themselves are
    const next = Math.round(low - Math.max(0, inset - 8) + 8);
    if (next !== under && next > 20) { under = next; hud.style.setProperty('--under', `${next}px`); }
  }
  if (typeof ResizeObserver === 'function') { const watch = new ResizeObserver(placeNotices); for (const el of corners) watch.observe(el); }
  window.addEventListener('resize', placeNotices);

  function setVitals(self, flash) {
    if (flash !== lastFlash) { lastFlash = flash; $('flash').style.opacity = flash > 0.01 ? String(Math.min(1, flash) * 0.8) : '0'; }
    // someone else's health is shown only while it is this player's business: a fight, or an accident between them
    const foe = (self.fight && self.fight.target) || (self.involved && self.involved[0]) || null;
    const law = self.law.state;
    const fallen = self.dead ? `dead:${self.dead.left}` : self.down ? `down:${self.down.rising}` : '';
    const taking = self.hijack;
    const unread = self.phone.unread + self.phone.requests.length;
    const signature = `${self.health}|${self.critical}|${foe ? `${foe.name}:${foe.health}` : ''}|${law}|${taking ? `${taking.step}:${Math.round(taking.progress * 40)}` : ''}|${unread}|${self.against.length}|${self.carried || ''}|${fallen}`;
    if (signature === vitalsShown) return;
    vitalsShown = signature;
    // the life bar is there in a fight, when hurt, when someone means harm, and while the police are after the player
    const show = !!self.fight || self.health < HEALTH.max || self.against.length > 0 || !!foe || law === 'pursuit' || law === 'wanted';
    $('vitals').hidden = !show;
    $('hud').classList.toggle('vitals', show);
    $('hud').classList.toggle('critical', show && self.critical);
    $('hud').classList.toggle('busy', !!self.fight || !!taking || !!self.law.arrest || !!self.carried || !!fallen);
    if (show) {
      const mine = $('vital-self');
      // green, orange once it has fallen below three fifths, red at a fifth or when critical
      mine.className = `vital${self.critical || self.health <= 20 ? ' critical' : self.health <= 60 ? ' hurt' : ''}`;
      $('health-fill').style.width = `${self.health}%`;
      $('health-num').textContent = String(self.health);
      $('health-meter').setAttribute('aria-valuenow', String(self.health));
      $('vital-foe').hidden = !foe;
      if (foe) { $('foe-name').textContent = foe.name; $('foe-fill').style.width = `${foe.health}%`; $('foe-num').textContent = foe.dead ? 'dead' : String(foe.health); }
      $('critical').hidden = !self.critical;
    }
    // caught: the handcuffs and ARRESTED for four seconds; after an arrest by the town's police the screen
    // then goes dark until the simulation has the player at the Police Post, and comes up again there
    if (law !== lastLaw) {
      const was = lastLaw; lastLaw = law;
      if (law === 'arrested' && was !== 'arrested') {
        const byPolice = !(self.law.arrest && self.law.arrest.byConstable);
        $('arrested').hidden = false;
        clearTimeout(arrestTimer);
        // the dark comes down over the last half second, so that the move to the Police Post is never seen
        if (byPolice) arrestTimer = setTimeout(() => { $('blackout').hidden = false; requestAnimationFrame(() => $('blackout').classList.add('on')); blackoutTimer = setTimeout(lift, 5000); }, 3400);
        setTimeout(() => { $('arrested').hidden = true; }, 4000);
      }
      if (law === 'custody' && !$('blackout').hidden) { clearTimeout(blackoutTimer); blackoutTimer = setTimeout(lift, 900); }
      if (law !== 'arrested' && law !== 'custody') { $('arrested').hidden = true; lift(); }
    }
    const chip = $('lawchip');
    chip.hidden = law === 'normal';
    if (law !== 'normal') { chip.className = law; chip.textContent = LAW_CHIP[law] || law; }
    $('taking').hidden = !taking && !fallen;
    if (fallen) { $('taking-text').textContent = self.dead ? `Killed by ${self.dead.by}. You come round at the hospital in ${self.dead.left} s` : self.down.rising ? 'Getting up' : 'Knocked down'; $('taking-fill').style.width = self.dead ? `${Math.round((1 - self.dead.left / 8) * 100)}%` : '0%'; } else if (taking) { $('taking-text').textContent = (TAKING[taking.kind] && TAKING[taking.kind][taking.step]) || 'Taking it'; $('taking-fill').style.width = `${Math.round(taking.progress * 100)}%`; }
    const badge = $('phone-badge');
    badge.hidden = !unread;
    if (unread) badge.textContent = String(unread);
  }

  // A place marked from the phone: its name and how far, at the top of the screen. Tapping it takes the mark away.
  let wayShown = '';
  function setWaypoint(mark, metres) {
    const el = $('waypoint');
    const text = mark ? `${mark.label || 'Marked place'} · ${metres < 6 ? 'here' : `${money(Math.round(metres / 5) * 5)} m away`}` : '';
    if (text === wayShown) return;
    wayShown = text;
    el.hidden = !mark;
    $('hud').classList.toggle('marked', !!mark);
    el.textContent = text;
    if (mark) el.setAttribute('aria-label', `${text}. Take the marker away.`);
  }
  $('waypoint').addEventListener('click', () => app.setWaypoint(null));

  // Notices. Three kinds, each small and each its own shape, in one narrow
  // column that never holds more than three:
  //   a hint       one or two lines the game says to the player
  //   a receipt    a slip of paper for money that moved
  //   a notice     from a government, marked as such, with who issued it
  // What people say is not a notice: it is drawn over the speaker's head.
  // One notice at a time, at the top in the middle, each for its time, then the next (10 October 2026: they
  // used to stack). What is urgent (a warning, the police, a call) goes to the front of the queue. A public
  // notice from a government (a levy, a closure) is shown once: not again for a day of real time, and never
  // more than one in a quarter of an hour; it is still kept in the phone's Notices app.
  const queue = [];
  let showingEl = null, showingTimer = null, showingStay = 0, cutShort = null;
  const SEEN_KEY = 'nlw-notices-seen-v1';
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (error) { seen = {}; }
  const remember = () => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (error) { /* nowhere to keep it: it may show again */ } };
  const PUBLIC_AGAIN = 24 * 3600 * 1000, PUBLIC_EVERY = 15 * 60 * 1000;
  function noticeShowing() { return !!showingEl; }
  function showNext() {
    showingTimer = null;
    if (showingEl) { showingEl.remove(); showingEl = null; }
    const next = queue.shift();
    // a notice cut short by something urgent is shown again, in full, straight after it
    if (cutShort) { queue.unshift(cutShort); cutShort = null; }
    if (!next) { if (queue.length) showNext(); return; }
    showingEl = next.el; showingStay = next.stay;
    $('notices').append(next.el);
    showingTimer = setTimeout(showNext, next.stay);
  }
  function toast(event) {
    if (event.type === 'gov' && event.title === 'Public notice' && !event.txn) {
      const now = Date.now();
      const key = `${event.from}|${event.text}`;
      const last = Math.max(0, ...Object.values(seen).filter(Number.isFinite));
      if ((seen[key] && now - seen[key] < PUBLIC_AGAIN) || now - last < PUBLIC_EVERY) { logNotice(event); return; }
      seen[key] = now; seen.__last = now;
      for (const k of Object.keys(seen)) if (now - seen[k] > PUBLIC_AGAIN * 7) delete seen[k];
      remember();
    }
    const built = buildNotice(event);
    if (!built) return;
    const urgent = ['critical', 'alert', 'police', 'call', 'message'].includes(event.type);
    // the same words already waiting, or on screen, are not said twice
    const text = built.el.textContent;
    if ((showingEl && showingEl.textContent === text) || queue.some((q) => q.el.textContent === text)) return;
    if (urgent) queue.unshift(built); else queue.push(built);
    // a long wait helps nobody: passing hints at the back are let go first
    while (queue.length > 5) { const at = queue.map((q) => q.hint).lastIndexOf(true); queue.splice(at >= 0 ? at : queue.length - 1, 1); }
    if (!showingEl) showNext();
    else if (urgent && showingEl.dataset.urgent !== '1' && !cutShort) { clearTimeout(showingTimer); cutShort = { el: showingEl, stay: showingStay, hint: false }; showingTimer = setTimeout(showNext, 900); }
  }
  function logNotice(event) {
    if (event.type !== 'note' && event.type !== 'site' && event.text) { noticeLog.push({ type: event.type, title: event.title || null, text: event.text, amount: event.amount || 0, txn: event.txn || null, at: app.view() ? app.view().t : 0 }); if (noticeLog.length > 60) noticeLog.shift(); }
  }
  function buildNotice(event) {
    const box = $('notices');
    let el;
    let stay = 5200;
    const amount = event.amount != null ? `${event.amount > 0 ? '+' : '−'}${amt(Math.abs(event.amount))}` : null;
    // kept for the Notices app: everything but passing hints
    if (event.type !== 'note' && event.type !== 'site' && event.text) { noticeLog.push({ type: event.type, title: event.title || { witness: 'What you saw', call: `Call from ${event.from}`, message: `Message from ${event.from}`, critical: 'Critical health', alert: 'Alert' }[event.type] || null, text: event.text, amount: event.amount || 0, txn: event.txn || null, at: app.view() ? app.view().t : 0 }); if (noticeLog.length > 60) noticeLog.shift(); }
    if (event.type === 'police') {
      el = h('div', { class: 'law', role: 'status' }, h('div', { class: 'head' }, event.title || 'Nigeria Police'), h('div', null, event.text));
      stay = 9000;
    } else if (event.type === 'critical' || event.type === 'alert') {
      el = h('div', { class: 'alarm', role: 'alert' }, h('b', null, event.title || 'Alert'), event.text, event.txn ? h('div', { class: 'mono', style: 'font-size:10.5px;opacity:.8' }, `${amount || ''} ${event.txn}`) : null);
      stay = 9000;
    } else if (event.type === 'call' || event.type === 'message') {
      el = h('button', { class: 'ringing', type: 'button', style: 'appearance:none;border-top:0;border-right:0;border-bottom:0;text-align:left;width:100%;cursor:pointer;font-family:inherit', onclick: () => openPhone(event.type === 'message' ? 'messages' : 'contacts', event.type === 'message' ? { thread: `ply:${event.by}` } : {}) }, h('b', null, event.type === 'call' ? 'Phone' : `Message · ${event.from}`), event.text);
      stay = 9000;
    } else if (event.type === 'witness') {
      el = h('div', { class: 'law', role: 'status' }, h('div', { class: 'head' }, 'You saw it'), h('div', null, event.text));
      stay = 8000;
    } else if (event.type === 'gov') {
      el = h('div', { class: 'gov', role: 'status' }, h('div', { class: 'head' }, h('span', null, 'Government notice'), amount ? h('span', { class: 'amt' }, amount) : null), h('div', { class: 'from' }, `${event.from}${event.title ? ` · ${event.title}` : ''}`), h('div', null, event.text), event.txn ? h('div', { class: 'mono', style: 'font-size:10.5px;color:#4a5a50' }, event.txn) : null);
      stay = 9000;
    } else if (event.type === 'receipt') {
      el = h('div', { class: 'slip' }, amount ? h('span', { class: 'amt' }, amount) : null, h('b', null, event.title), h('div', null, event.text), event.txn ? h('div', { class: 'ref' }, event.txn) : null);
      stay = 7000;
    } else {
      // the same hint twice in a row is one hint
      const last = box.lastElementChild;
      if (last && last.classList.contains('hint') && last.textContent === event.text) return null;
      el = h('div', { class: 'hint' }, event.text);
      stay = Math.max(3500, Math.min(8000, 2200 + event.text.length * 45));
    }
    const urgent = ['critical', 'alert', 'police', 'call', 'message'].includes(event.type);
    el.dataset.urgent = urgent ? '1' : '0';
    return { el, stay, hint: !event.type || event.type === 'note' || event.type === 'site' };
  }

  // A live panel redraws only when its data has changed, and never while a
  // press is in progress, so a redraw cannot swallow a click.
  let liveTimer = 0;
  let refreshTimer = 0;
  let pressing = false;
  sheet.addEventListener('pointerdown', () => { pressing = true; });
  window.addEventListener('pointerup', () => { pressing = false; });
  window.addEventListener('pointercancel', () => { pressing = false; });
  function tick(dt) {
    if (!current) return;
    // the handset's own clock keeps time without the screen being drawn again
    if (sheet.classList.contains('device')) {
      const seen = app.view();
      const label = seen.clock.label;
      for (const el of body.querySelectorAll('.statusbar .time, .greeting .big, .pagetime')) if (el.textContent !== label) el.textContent = label;
      phone.tick();
      const cell = body.querySelector('.statusbar .cell');
      if (cell) phone.charge(cell, seen.self.energy);
    }
    // figures that change by themselves (see Settings) are written over where they stand
    if (current.refresh) { refreshTimer += dt; if (refreshTimer >= 1 && !pressing) { refreshTimer = 0; current.refresh(); } }
    if (!current.live) return;
    liveTimer += dt;
    if (liveTimer < 0.5 || pressing) return;
    liveTimer = 0;
    const active = document.activeElement;
    if (active && body.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
    const live = current.live;
    const signature = live();
    if (signature !== current.signature) redraw();
  }

  $('btn-phone').addEventListener('click', () => { if (sheet.hidden) openPhone(); else close(); });

  const shared = { app: { ...app, openPhone: (id, state) => openPhone(id, state), openDeal: (args) => phone.openDeal(args), leaveDeal: () => phone.leaveDeal() }, h, open, redraw, close, mode, isOpen: () => !sheet.hidden, isDevice: () => usingPhone(), line, section, money, amt, tr, trPlain, trIn, when, refused, live, toast: (event) => toast(event) };
  panels = createPanels(shared);
  phone = createPhone({ ...shared, legacy: { wallet, property, people: peopleTab, map, runs, journal, settings, vehicleLines: (v) => vehicleLines(v).filter(Boolean) }, lawBlock: panels.lawBlock, log: () => noticeLog });

  function openRest(benchId) {
    open('Bench', 'Sit and rest', (root) => {
      const view = app.view();
      root.append(h('p', null, 'Resting restores a little energy each hour and lets the day go by.'));
      root.append(line('Time', view.clock.label), line('Your energy', `${Math.round(view.self.energy)} of 100`));
      const untilMorning = Math.max(1, Math.min(10, Math.round((24 + 7 - view.clock.hourFloat) % 24) || 1));
      root.append(h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => act({ type: 'rest', benchId, hours: 1 }, 'An hour passes.') }, 'Rest one hour'),
        h('button', { class: 'btn', type: 'button', onclick: () => act({ type: 'rest', benchId, hours: 3 }, 'Three hours pass.') }, 'Rest three hours'),
        view.clock.hour >= 19 || view.clock.hour < 6 ? h('button', { class: 'btn', type: 'button', onclick: () => act({ type: 'rest', benchId, hours: untilMorning }, 'You doze on the bench until morning.') }, 'Wait for morning') : null));
    });
  }

  return { openDialogue, talkToPerson, openOkada, openService, openBoard, openPhone, openCustody: () => panels.openCustody(), openRest, updateHud, setPrompt, setKeys, setVitals, setWaypoint, setDash, toast, tick, close, openChat, closeChat, chatOpen: () => !chatBar.hidden, isOpen: () => !sheet.hidden, usingPhone, phoneOut, phoneWidth, phoneScreen: () => (usingPhone() ? phone.screen : null), calling: () => phone.calling, hangUp: () => phone.hangUp(), openDeal: (args) => phone.openDeal(args), dealOpen: () => phone.market.dealOpen, marketStale: () => phone.market.stale(), walletStale: () => phone.wallet.stale(), signedOut: () => { phone.market.signedOut(); phone.wallet.signedOut(); }, redraw: () => redraw() };
}
