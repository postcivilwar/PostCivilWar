// His townspeople, ten of each of his figures, and their evenings and nights (30 October 2026, the owner: "the NPC
// seems to be very few. I can't even see them on the street. They are scarce. Maybe you need to multiply them using the
// same NPC characters I gave you. Maybe 1 NPC character should be multiplied into 10 places"; he plays at night).
//   node --test test/nights.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPopulation, POSE } from '../src/sim/population.js';
import { TIME_SCALE } from '../src/sim/sim.js';
import { NPC_FIGURES } from '../src/sim/npc-figures.js';
import { VOICE_CAST } from '../src/sim/voice-lines.js';

const pop = createPopulation({ state: {}, timeScale: TIME_SCALE });
const H = (h, day = 2) => day * 86400 + h * 3600;
const his = pop.people.filter((p) => p.job !== 'police' && NPC_FIGURES[p.look.figure]);
const out = (t) => { const probe = {}; let n = 0; for (const p of his) { pop.locate(p.index, t, probe); if (probe.pose !== POSE.hidden) n += 1; } return n; };

test('ten of each of his figures; the first thirty-five as they were (the voices know them by their names)', () => {
  assert.equal(his.length, 230);
  const by = new Map(); for (const p of his) by.set(p.look.figure, (by.get(p.look.figure) || 0) + 1);
  assert.ok([...by.values()].every((n) => n === 10));
  for (const c of Object.values(VOICE_CAST)) {
    if (!c.who || !c.who.startsWith('n:')) continue;
    const p = pop.people[Number(c.who.slice(2))];
    const plain = c.name.replace(/^(Cpl\.|Insp\.|Sgt\.|Mrs|Mr|Nurse|Mama)\s+/, '');
    assert.equal(`${p.first} ${p.surname}`, plain, `${c.who} is ${c.name}`);
  }
});

test('out of doors by day, and in the evening and at night: at half past nine most, at one in the morning dozens, at three some', () => {
  const at = Object.fromEntries([10, 21.5, 23, 1, 3].map((h) => [h, out(H(h))]));
  assert.ok(at[10] > 180, `10 am: ${at[10]}`);
  assert.ok(at[21.5] > 100, `9.30 pm: ${at[21.5]}`);
  assert.ok(at[23] > 50, `11 pm: ${at[23]}`);
  assert.ok(at[1] > 40, `1 am: ${at[1]}`);
  assert.ok(at[3] > 10, `3 am: ${at[3]}`);
  // and not everyone: most are asleep at three
  assert.ok(at[3] < his.length / 3, `3 am: ${at[3]}`);
});

test('nobody is moved in a jump as one day becomes the next, out late or not', () => {
  const a = {}, b = {};
  let worst = 0, who = null;
  for (let day = 1; day <= 4; day += 1) {
    for (const p of pop.people) {
      pop.locate(p.index, day * 86400 - 2, a);
      pop.locate(p.index, day * 86400 + 2, b);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > worst) { worst = d; who = `${p.name} on day ${day}: ${a.act} -> ${b.act}`; }
    }
  }
  assert.ok(worst < 3, `${worst.toFixed(1)} m: ${who}`);
});

test('the same people out on the same night in every copy of the town', () => {
  const again = createPopulation({ state: {}, timeScale: TIME_SCALE });
  const a = {}, b = {};
  for (const p of his) { pop.locate(p.index, H(1), a); again.locate(p.index, H(1), b); assert.equal(a.spot, b.spot); }
});
