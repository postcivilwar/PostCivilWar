// The panels for the hospital and the clinic, the Police Post, and for a
// player who is under arrest.
//
// Every figure on a bill here is the simulation's own: the fee comes from a
// quote it issued and holds, the balance from its ledger. A Pay button sends
// one request with one id; pressed twice, the same request goes twice and the
// simulation answers it once.

import { zoneService } from '../sim/zone.js';
import { HEALTH } from '../sim/conflict.js';
import { BUSINESSES } from '../sim/economy.js';

const CALL_WORDS = Object.freeze({ none: 'Not asked', asked: 'Asked. Waiting for the officer\'s answer', allowed: 'Allowed', denied: 'Refused. You may ask again in a minute' });

export function createPanels(kit) {
  const { app, h, open, redraw, line, section, money, amt, tr, trPlain, trIn, when, refused, live } = kit;
  const send = (intent) => app.send(intent);
  const say = (result, good) => { app.chime(result.ok ? 'tap' : 'error'); redraw(result.ok ? (good ? { good: true, text: typeof good === 'function' ? good(result) : good } : null) : { text: result.message }); return result; };
  const row = (label, value, cls) => h('div', { class: `row${cls ? ` ${cls}` : ''}` }, h('span', null, label), h('span', null, value));
  const vital = (health) => h('div', { class: `vital${health <= HEALTH.critical ? ' critical' : health < 50 ? ' low' : ''}`, style: 'background:none;padding:0' }, h('span', { class: 'eyebrow' }, 'Health'), h('div', { class: 'bar' }, h('i', { style: `width:${health}%` })), h('span', { class: 'mono' }, `${health}%`));

  // --- treatment ---------------------------------------------------------------------------

  function openCare(placeId) {
    const service = zoneService(placeId);
    let q = null;              // the quote the desk has given, held by the simulation
    let got = 0;
    let chosen = null;         // the level picked from it
    let payId = null;          // one id for one payment, however many times the button is pressed
    let offer = '';
    let said = null;
    let paid = null;
    const stale = () => !!q && performance.now() - got > q.expiresIn * 1000;
    const ask = () => { const r = send({ type: 'care.quote', place: placeId }); q = r.ok ? r.quote : null; got = performance.now(); chosen = null; payId = null; said = null; offer = ''; return r; };
    const pick = (level) => { chosen = level; payId = app.requestId('care'); offer = ''; said = null; redraw(); };

    const tariff = send({ type: 'care.tariff', place: placeId });
    const government = tariff.ok && tariff.kind === 'government';
    open(government ? 'Government hospital · fixed prices' : 'Private clinic · the owner\'s prices', service.name, (root) => {
      const self = app.view().self;
      live(() => { const s = app.view().self; return `${s.health}|${s.balance}|${stale()}`; });
      root.append(vital(self.health));
      if (paid) root.append(h('div', { class: 'bill' }, h('h4', null, 'Receipt'), row('Treated to', `${paid.level}%`), row('Restored', `+${paid.restored}`), row('Paid', tr(paid.fee)), row('Entry', paid.txn)));
      if (self.health >= HEALTH.max) root.append(h('p', null, 'You are in full health. There is nothing to treat.'));
      else {
        let problem = null;
        if (!q || q.used || q.health !== self.health || stale()) { const r = ask(); if (!r.ok) problem = r; }
        if (problem) root.append(refused(problem));
        else treatment(root, self);
      }
      if (placeId === 'clinic') {
        root.append(section('Rest and a tonic'));
        root.append(h('p', { class: 'small' }, 'For tiredness, not for injuries: it restores your energy in full and leaves your health as it is.'));
        root.append(line('Price', tr(BUSINESSES.clinic.fee)), line('Your energy', `${Math.round(self.energy)} of 100`));
        root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', disabled: self.energy >= 100 || self.balance < BUSINESSES.clinic.fee, onclick: () => say(send({ type: 'clinic.treat', requestId: app.requestId('tonic') }), 'Rested. You feel well.') }, self.energy >= 100 ? 'You are not tired' : `Pay ${tr(BUSINESSES.clinic.fee)}`)));
      }
      if (tariff.ok) {
        root.append(section('How the price is made'));
        root.append(line('Seeing you', tr(tariff.prices.consult)), line('Each point of health restored', tr(tariff.prices.perPoint)), line('Paid to', tariff.paidTo));
        root.append(h('p', { class: 'small' }, government ? 'These are the government\'s prices. They are the same for everyone and are not open to bargaining.' : 'These are the owner\'s prices. You may name a lower one; the owner may take it, or meet you part of the way.'));
      }
    });

    function treatment(root, self) {
      root.append(self.health <= HEALTH.critical ? h('div', { class: 'banner red' }, h('strong', null, 'Critical. '), 'Choose how far you want to be treated.') : h('p', null, 'Choose how far you want to be treated. You pay for what is restored.'));
      root.append(h('div', { class: 'levels', role: 'group', 'aria-label': 'Level of treatment' }, q.options.map((o) => h('button', { class: 'level', type: 'button', 'aria-pressed': String(chosen === o.level), onclick: () => pick(o.level) },
        h('small', null, `${q.health}% to`), h('b', null, `${o.level}%`), h('span', { class: 'mono' }, amt(o.fee)), o.fee < o.list ? h('small', null, `was ${amt(o.list)}`) : null))));
      const o = q.options.find((x) => x.level === chosen);
      if (!o) { root.append(h('p', { class: 'small' }, `Prices are held for you for ${Math.round(q.expiresIn / 60)} minutes.`)); return; }
      const after = self.balance - o.fee;
      root.append(h('div', { class: 'bill' }, h('h4', null, 'Bill'),
        row('Current health', `${q.health}%`), row('Treatment level', `${o.level}%`), row('Amount restored', `+${o.restored}`),
        row(government ? 'Hospital fee' : 'Clinic fee', tr(o.fee)),
        row('Current balance', tr(self.balance)), row('Balance after payment', after < 0 ? `short by ${amt(-after)}` : tr(after), `total${after < 0 ? ' bad' : ''}`)));
      if (said) root.append(h('div', { class: 'said' }, said));
      root.append(h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', disabled: after < 0, onclick: () => {
          const r = send({ type: 'care.pay', quoteId: q.id, level: o.level, requestId: payId });
          if (r.ok) { paid = r; q = null; chosen = null; app.chime('paid'); redraw({ good: true, text: `Treated. Your health is now ${r.health}%.` }); } else { app.chime('error'); redraw({ text: r.message }); }
        } }, after < 0 ? 'Not enough TR' : `Pay ${tr(o.fee)}`),
        h('button', { class: 'btn quiet', type: 'button', onclick: () => { chosen = null; redraw(); } }, 'Choose again')));
      if (q.bargain) {
        root.append(section('Name your price'));
        if (q.bargain.roundsLeft <= 0) root.append(h('p', { class: 'small' }, `${amt(o.fee)} is the last price.`));
        else {
          const input = h('input', { class: 'field mono', type: 'number', inputmode: 'decimal', min: '0.5', max: trPlain(o.fee), step: '0.5', value: offer, placeholder: trPlain(Math.round(o.fee * 0.85 / 10) * 10), 'aria-label': 'Your offer in TR', oninput: (e) => { offer = e.target.value; } });
          const make = () => {
            const r = send({ type: 'care.bargain', quoteId: q.id, level: o.level, offer: trIn(offer) });
            if (r.ok) { q = r.quote; got = performance.now(); said = r.said; offer = ''; payId = app.requestId('care'); app.chime(r.accepted ? 'ok' : 'tap'); redraw(); } else { app.chime('error'); redraw({ text: r.message }); }
          };
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
          root.append(h('div', { class: 'qty' }, h('span', { class: 'small' }, `${q.bargain.roundsLeft} offer${q.bargain.roundsLeft === 1 ? '' : 's'} left`), input, h('button', { class: 'btn', type: 'button', onclick: make }, 'Offer')));
        }
      }
    }
  }

  // --- under arrest ----------------------------------------------------------------------------

  // What an arrested player is shown, here and on the phone: the charge, the fine and where it goes, and what can be done.
  let fineId = null;             // one id for paying one arrest's fine
  function lawBlock(law, view) {
    const a = law.arrest;
    if (!a) return [];
    if (!fineId || fineId.arrest !== a.id) fineId = { arrest: a.id, id: app.requestId('fine') };
    const out = [];
    out.push(line('Arrest', a.no), line('Officer', a.byConstable ? `${a.officer}, special constable` : a.officer));
    out.push(h('div', { class: 'rows' }, a.offences.map((o) => line(o.name, o.against ? `against ${o.against}` : ''))));
    out.push(line('Where you are', a.status === 'escort' ? 'Being walked to the Police Post' : `Held at the ${a.station.name}`));
    if (a.status === 'custody') out.push(line('Held until', `${when(a.until)}, unless the fine is paid`));
    else out.push(line('If the fine is not paid', `${a.hours} hours in the cell`));
    for (const r of a.restitution) out.push(line(r.kind === 'compensation' ? `Compensation to ${r.victim}` : `Returned to ${r.victim}`, r.paid >= r.due ? tr(r.paid) : `${amt(r.paid)} of ${amt(r.due)}`));
    if (law.owed > 0) out.push(line('Still owed to those you wronged', tr(law.owed), 'neg'));
    const balance = view.self.balance;
    if (a.fine.confirmed) {
      const after = balance - a.fine.amount;
      out.push(h('div', { class: 'bill' }, h('h4', null, 'Fine'),
        h('div', { class: 'row' }, h('span', null, 'Fine'), h('span', null, tr(a.fine.amount))),
        h('div', { class: 'row' }, h('span', null, 'It goes to'), h('span', null, a.byConstable ? 'the constable, less 1% to government' : 'the Federal Government')),
        h('div', { class: 'row' }, h('span', null, 'Current balance'), h('span', null, tr(balance))),
        h('div', { class: `row total${after < 0 ? ' bad' : ''}` }, h('span', null, 'Balance after payment'), h('span', null, after < 0 ? `short by ${amt(-after)}` : tr(after)))));
    } else out.push(line('Fine', `The officer has not set it yet. The scale says ${amt(a.fine.scale)}.`));
    const buttons = [];
    buttons.push(h('button', { class: 'btn primary', type: 'button', disabled: !law.canPay, onclick: () => {
      const r = send({ type: 'custody.pay', arrestId: a.id, requestId: fineId.id });
      if (r.ok) app.chime('paid');
      say(r, (x) => `Paid ${tr(x.amount)}. You are free to go.`);
    } }, a.status !== 'custody' ? 'Pay at the Police Post' : !a.fine.confirmed ? 'Fine not set yet' : law.canPay ? `Pay ${tr(a.fine.amount)}` : 'Not enough TR'));
    if (a.call.status === 'none' || a.call.status === 'denied') buttons.push(h('button', { class: 'btn', type: 'button', onclick: () => say(send({ type: 'custody.requestCall' }), (x) => (x.call.status === 'allowed' ? 'The officer nods. You may use your phone.' : 'You have asked. Wait for the answer.')) }, 'Ask for a phone call'));
    if (a.call.status === 'allowed') buttons.push(h('button', { class: 'btn', type: 'button', onclick: () => app.openPhone('contacts') }, 'Call someone'));
    if (a.status === 'custody') buttons.push(h('button', { class: 'btn quiet', type: 'button', onclick: () => say(send({ type: 'custody.wait' }), (x) => `${Math.round(x.hours * 10) / 10} hours pass in the cell.`) }, 'Sit out the time'));
    out.push(h('div', { class: 'actions' }, buttons));
    out.push(line('Phone call', CALL_WORDS[a.call.status] || a.call.status));
    if (view.self.phone.surety) out.push(h('div', { class: 'banner' }, `${view.self.phone.surety} is on the way to the Police Post to pay for you. You will owe them the money.`));
    return out;
  }

  function openCustody() {
    open('Nigeria Police', 'Under arrest', (root) => {
      const view = app.view();
      live(() => { const s = app.view().self; const a = s.law.arrest; return `${s.law.state}|${a ? `${a.status}|${a.fine.confirmed}|${a.call.status}|${a.payment.status}` : ''}|${s.balance}|${s.phone.surety}`; });
      const r = send({ type: 'police.status' });
      if (!r.ok) { root.append(refused(r)); return; }
      if (!r.law.arrest) { root.append(h('p', null, 'Nothing holds you here now. The door is open.')); if (r.law.owed > 0) root.append(line('Still owed to those you wronged', tr(r.law.owed), 'neg')); return; }
      root.append(...lawBlock(r.law, view));
      root.append(section('While you are held'));
      root.append(h('p', { class: 'small' }, 'You may look at your contacts and the map. You may call or message people you know once the officer allows it. You cannot fight, take a vehicle, work or trade until you are released.'));
    });
  }

  // --- the Police Post ------------------------------------------------------------------------

  function openPoliceDesk() {
    let draft = '';
    const payIds = {};
    open('Nigeria Police', zoneService('police').name, (root, tab) => {
      const view = app.view();
      live(() => { const s = app.view().self; return `${s.law.state}|${s.law.seen.length}|${s.law.owed}|${!!s.law.role}|${s.phone.requests.map((x) => `${x.arrest}${x.ready}`).join()}|${s.balance}`; });
      const r = send({ type: 'police.status' });
      if (!r.ok) { root.append(refused(r)); return; }
      const law = r.law;
      if (tab === 'record') {
        root.append(section('The scale of fines'));
        root.append(h('div', { class: 'rows' }, Object.values(r.scale).map((o) => line(o.name, `${amt(o.fine)} or ${o.hours} h`))));
        root.append(section('Where fines have gone'));
        root.append(line('Fines paid, in all', tr(r.treasury.fines)), line('To the government', tr(r.treasury.toGovernment)), line('To special constables', tr(r.treasury.toConstables)), line('Returned to victims', tr(r.treasury.restitution)));
        root.append(h('p', { class: 'small' }, 'A fine after an arrest by a police officer goes to the government in full. After an arrest by a special constable, ninety-nine parts in a hundred go to the constable and one to the government, in a single entry.'));
        if (r.record.arrests.length) {
          root.append(section('Your record'));
          root.append(h('div', { class: 'rows' }, r.record.arrests.map((a) => line(`${a.no}: ${a.offences.map((o) => o.name.toLowerCase()).join(', ')}`, a.payment.status === 'paid' ? `${amt(a.fine.amount)} paid` : a.payment.status === 'served' ? 'time served' : a.status))));
        }
        return;
      }
      if (law.wanted.length) {
        root.append(h('div', { class: 'banner red' }, `You are wanted for: ${law.wanted.map((w) => w.name.toLowerCase()).join(', ')}.`));
        root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', disabled: law.surrendered, onclick: () => say(send({ type: 'police.surrender' }), 'Stand still. An officer is coming to you.') }, law.surrendered ? 'An officer is coming' : 'Give myself up')));
      }
      if (law.owed > 0) {
        root.append(section('Owed to people you wronged'));
        root.append(line('Still to pay back', tr(law.owed), 'neg'));
        root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', disabled: view.self.balance < 1, onclick: () => say(send({ type: 'police.settle', requestId: app.requestId('settle') }), (x) => `Paid back ${tr(x.paid)}.`) }, 'Pay it back now')));
      }
      for (const req of view.self.phone.requests) {
        if (!payIds[req.arrest]) payIds[req.arrest] = app.requestId('bail');
        root.append(section(`${req.from} asks you to pay a fine`));
        root.append(h('div', { class: 'bill' }, h('h4', null, req.no), row('Fine', tr(req.amount)), row('Current balance', tr(view.self.balance)), row('Balance after payment', view.self.balance < req.amount ? `short by ${amt(req.amount - view.self.balance)}` : tr(view.self.balance - req.amount), `total${view.self.balance < req.amount ? ' bad' : ''}`)));
        root.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: !req.ready || !req.canPay, onclick: () => { const out = send({ type: 'bail.pay', arrestId: req.arrest, requestId: payIds[req.arrest] }); if (out.ok) app.chime('paid'); say(out, `Paid. ${req.from} is free to go.`); } }, !req.ready ? 'Not brought in yet' : req.canPay ? `Pay ${tr(req.amount)}` : 'Not enough cowries')));
      }
      root.append(section('Report what you saw'));
      if (!law.seen.length) root.append(h('p', { class: 'small' }, 'You have seen nothing the police do not already know about.'));
      for (const s of law.seen) root.append(h('div', { class: 'actions' }, h('span', null, `${s.name} (${s.no})`), h('button', { class: 'btn primary', type: 'button', onclick: () => say(send({ type: 'police.reportSeen', crimeId: s.id }), (x) => (x.identified ? 'Reported. Officers are being sent.' : 'Reported. An officer will look into it.')) }, 'Report it')));
      root.append(section('Special constables'));
      if (law.role) {
        root.append(line('Your badge', law.role.badge), line('Arrests made', String(law.role.arrests)));
        root.append(h('p', { class: 'small' }, 'Open Police on your phone to see who is wanted, to arrest a wanted player within reach, to set the fine and to answer a prisoner who asks for a call. A badge gives no other powers: it cannot touch anyone\'s money, records or land.'));
        root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => say(send({ type: 'police.resign' }), 'Badge handed in.') }, 'Hand in the badge')));
      } else {
        root.append(h('p', { class: 'small' }, 'Someone with a clean record can be sworn in. A constable may arrest a wanted player, set the fine within the limits on the scale and bring the prisoner in. The fine is the constable\'s, less one part in a hundred to the government.'));
        root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => say(send({ type: 'police.enlist' }), (x) => `Sworn in. Your badge is ${x.role.badge}.`) }, 'Be sworn in')));
      }
      root.append(section('Write a report'));
      root.append(h('textarea', { class: 'field', id: 'report-text', rows: '3', maxlength: '240', placeholder: 'What happened, and where?', 'aria-label': 'Your report', oninput: (e) => { draft = e.target.value; } }, draft));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { const out = send({ type: 'police.report', text: draft }); if (out.ok) draft = ''; say(out, (res) => `Recorded as ${res.report.no}.`); } }, 'File the report')));
      const list = send({ type: 'police.reports' });
      if (list.ok && list.reports.length) root.append(h('div', { class: 'rows' }, list.reports.map((x) => line(`${x.no}: ${x.text}`, when(x.at)))));
    }, [{ id: 'desk', label: 'Desk' }, { id: 'record', label: 'Fines and records' }]);
  }

  return { openCare, openCustody, openPoliceDesk, lawBlock };
}
