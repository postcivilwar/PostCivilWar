// The town's voices (28 October 2026): the script (assets/voices/script.csv) read into what the game uses
// (src/sim/voices.js): { cast, talks, reactions }. `lengths`: line id -> seconds of its recording; a line with no
// length is left out (not recorded yet), unless `estimated`, when the script's own estimate is used (for the tests).
import { readFileSync } from 'node:fs';
import { createHost } from '../../src/sim/host.js';
import { zoneResident } from '../../src/sim/zone.js';

const root = new URL('../../', import.meta.url);

function rows(s) {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

const WHEN = { 'any time they meet': 'any', 'in the morning': 'morning', 'in the evening': 'evening', 'at night': 'night', 'in market hours': 'market', 'after a fight near them': 'fight', 'after a vehicle crash near them': 'crash', 'after a crash near them': 'crash', 'after gunshots near them': 'gunshot', 'when police walk past': 'police', 'after a player buys a car': 'car', 'when a player is building near them': 'building' };

export function readScript({ lengths = {}, estimated = false } = {}) {
  const [head, ...body] = rows(readFileSync(new URL('assets/voices/script.csv', root), 'utf8').replace(/^﻿/, ''));
  const col = (name) => { const i = head.indexOf(name); if (i < 0) throw new Error(`script.csv: no column "${name}"`); return i; };
  const C = { id: col('line ID (file name)'), kind: col('kind'), conv: col('conversation'), turn: col('turn'), character: col('character'), voice: col('voice'), words: col('the words (subtitle)'), meaning: col('meaning of non-English words'), seconds: col('about how many seconds'), when: col('when it is heard') };
  // who in the game speaks with each voice: the town's people by their names, the people at the counters by theirs
  const host = createHost();
  const people = host.game.internals.population.people;
  const residents = host.game.internals.residents.all().map((r) => ({ id: r.id, ...zoneResident(r.id) }));
  const strip = (n) => n.replace(/^(Cpl\.|Insp\.|Sgt\.|Mrs|Mr|Nurse|Mama)\s+/, '').replace(/\s*\(proposed name\)$/, '').trim();
  const whoIs = (name) => {
    const plain = strip(name);
    const p = people.find((q) => `${q.first} ${q.surname}` === plain);
    if (p) return `n:${p.index}`;
    const r = residents.find((q) => strip(q.name) === plain);
    return r ? `r:${r.id}` : null;                    // a figure still to come
  };
  const cast = {}, convs = new Map(), reactions = {};
  let total = 0, recorded = 0;
  for (const r of body) {
    if (!r[C.id]) continue;
    total += 1;
    const id = r[C.id], voice = r[C.voice];
    if (!cast[voice]) cast[voice] = { who: whoIs(r[C.character]), name: r[C.character].replace(/\s*\(proposed name\)$/, '') };
    const seconds = lengths[id] || (estimated ? Number(r[C.seconds]) : 0);
    if (!seconds) continue;
    recorded += 1;
    const line = [voice, id, Math.round(seconds * 100) / 100, r[C.words], r[C.meaning] || ''];
    if (r[C.kind] === 'conversation') {
      const cid = r[C.conv];
      if (!convs.has(cid)) convs.set(cid, { id: cid, when: WHEN[r[C.when]] || 'any', lines: [] });
      convs.get(cid).lines[Number(r[C.turn]) - 1] = line;
    } else {
      const trigger = id.slice(voice.length + 1).replace(/_\d+$/, '');
      ((reactions[voice] = reactions[voice] || {})[trigger] = reactions[voice][trigger] || []).push(line.slice(1));
    }
  }
  const all = [...convs.values()];
  // a conversation is only used whole: every one of its lines recorded
  const talks = all.filter((c) => c.lines.length && c.lines.every(Boolean) && c.lines.length === Math.max(...body.filter((r) => r[C.conv] === c.id).map((r) => Number(r[C.turn]))));
  return { cast, talks, reactions, total, recorded, conversations: new Set(body.filter((r) => r[C.conv]).map((r) => r[C.conv])).size };
}
