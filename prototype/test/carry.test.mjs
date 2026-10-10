// Taking a character from one browser or device to another as a code (src/client/carry.js): what can be
// checked without a browser. Two real browsers that share nothing are joined by it in test/carry.mjs.
//
//   node --test test/carry.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { packCharacter, unpackCharacter, checkCharacter, CarryError } from '../src/client/carry.js';
import { createHost, SAVE_VERSION } from '../src/sim/host.js';
import { ZONE } from '../src/sim/zone.js';

const rules = { zone: ZONE.id, version: SAVE_VERSION, createHost };
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');

// A player who has been in town a little while: a name, a path, money spent.
function played(name = 'Adaeze Okeke') {
  const host = createHost();
  const playerId = host.game.join({ name, path: 'villain', look: { figure: 'W1' } });
  for (let i = 0; i < 300; i += 1) host.tick(0.1);
  return { host, playerId, save: () => ({ host: host.save(), playerId }) };
}

test('a character goes out as a code and comes back the same character, with everything they own', async () => {
  const there = played();
  const before = there.host.game.view(there.playerId);
  const code = await packCharacter({ zone: ZONE.id, save: there.save(), prefs: { look: { figure: 'W1', top: 3 }, path: 'villain', sound: false, detail: 2 } });
  assert.match(code, /^PCW1\.[A-Za-z0-9_-]+$/, 'letters, figures, - and _ only: it survives being copied anywhere');
  const found = checkCharacter(await unpackCharacter(code), rules);
  assert.equal(found.ok, true);
  assert.equal(found.name, 'Adaeze Okeke');
  // loaded here, it is the same person in the same place with the same purse, on the same day
  const here = createHost({ saved: found.save.host });
  const after = here.game.view(found.save.playerId);
  assert.equal(after.self.name, before.self.name);
  assert.equal(after.self.balance, before.self.balance);
  assert.deepEqual([after.self.x, after.self.z], [before.self.x, before.self.z]);
  assert.equal(after.self.path, 'villain');
  assert.deepEqual(after.calendar, before.calendar);
  // the figure and the answer come too; how this device likes its sound and detail does not
  assert.deepEqual(found.prefs, { path: 'villain', look: { figure: 'W1', top: 3 } });
});

test('the code is small enough to copy: under a third the size of the save it holds', async () => {
  const there = played();
  const json = JSON.stringify(there.save()).length;
  const code = await packCharacter({ zone: ZONE.id, save: there.save() });
  assert.ok(json > 40000, `the save is ${json} characters`);
  assert.ok(code.length < json / 3, `the code is ${code.length} characters`);
});

test('a code that a message app has broken over lines or put spaces round still reads', async () => {
  const there = played('Nonso Obi');
  const code = await packCharacter({ zone: ZONE.id, save: there.save() });
  const mangled = `  \n${code.match(/.{1,64}/g).join('\r\n')}\n  `;
  assert.equal(checkCharacter(await unpackCharacter(mangled), rules).name, 'Nonso Obi');
});

test('a browser that cannot gzip still writes a code, and any browser reads it', async () => {
  const there = played('Ifeoma Eze');
  const kept = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  let code;
  try { code = await packCharacter({ zone: ZONE.id, save: there.save() }); } finally { globalThis.CompressionStream = kept; }
  assert.match(code, /^PCW0\./);
  assert.equal(checkCharacter(await unpackCharacter(code), rules).name, 'Ifeoma Eze');
});

test('what is not a character code is refused, in words a player can act on', async () => {
  const there = played();
  const code = await packCharacter({ zone: ZONE.id, save: there.save() });
  const refused = async (text, words) => { await assert.rejects(unpackCharacter(text), (error) => error instanceof CarryError && words.test(error.message)); };
  await refused('', /no code there yet/);
  await refused('   \n ', /no code there yet/);
  await refused('hello, this is my shopping list', /not a character code/);
  await refused('https://postcivilwar.com/', /not a character code/);
  await refused(code.slice(0, code.length - 200), /damaged/);              // not all of it was copied
  await refused(`${code.slice(0, 40)}!!${code.slice(42)}`, /damaged/);
  await refused(`PCW1.${b64(Buffer.from('not gzip at all'))}`, /damaged/);
  await refused(`PCW1.${b64(gzipSync('{"kind":"something-else","v":1}'))}`, /not a character code/);
  await refused(`PCW1.${b64(gzipSync('[1,2,3'))}`, /damaged/);
  await refused(`PCW0.${b64(Buffer.from('null'))}`, /not a character code/);
});

test('a code cannot be made to fill the device: one that unpacks to more than a browser will hold is stopped', async () => {
  // 40 MB of the same letter is 40 KB gzipped
  const bomb = `PCW1.${b64(gzipSync(Buffer.alloc(40 * 1024 * 1024, 0x61)))}`;
  assert.ok(bomb.length < 80000);
  await assert.rejects(unpackCharacter(bomb), (error) => error instanceof CarryError && /too large/.test(error.message));
  await assert.rejects(unpackCharacter(`PCW0.${'A'.repeat(7 * 1024 * 1024)}`), (error) => error instanceof CarryError && /too large/.test(error.message));
});

test('a code that unpacks is still only kept if a simulation loaded from it really has that player', async () => {
  const there = played();
  const good = { kind: 'pcw-character', v: 1, zone: ZONE.id, save: there.save(), prefs: {} };
  const copy = () => JSON.parse(JSON.stringify(good));
  assert.equal(checkCharacter(copy(), rules).ok, true);
  const why = (data) => { const r = checkCharacter(data, rules); assert.equal(r.ok, false); return r.why; };
  assert.match(why(null), /not a character code/);
  assert.match(why({ ...copy(), save: null }), /not a character code/);
  assert.match(why({ ...copy(), zone: 'NG-LA-IKJ-Z9' }), /different town/);
  { const d = copy(); d.save.host.version = SAVE_VERSION - 1; assert.match(why(d), /different version/); }
  { const d = copy(); d.save.playerId = 'someone-who-is-not-there'; assert.match(why(d), /no character/); }
  { const d = copy(); d.save.playerId = 42; assert.match(why(d), /not a character code/); }
  { const d = copy(); d.save.host.game = { players: 'none' }; assert.match(why(d), /damaged|no character/); }
  { const d = copy(); d.save.host.ledger = null; assert.match(why(d), /damaged|no character/); }
  // what goes with it is taken only when it is what it should be
  { const d = copy(); d.prefs = { path: 'emperor', look: 'a string', sound: false }; assert.deepEqual(checkCharacter(d, rules).prefs, {}); }
  { const d = copy(); d.prefs = { look: { note: 'x'.repeat(5000) } }; assert.deepEqual(checkCharacter(d, rules).prefs, {}); }
});

test('checking a character does not play with the copy that is kept', async () => {
  const there = played();
  const data = await unpackCharacter(await packCharacter({ zone: ZONE.id, save: there.save() }));
  const before = JSON.stringify(data.save);
  const found = checkCharacter(data, rules);
  assert.equal(JSON.stringify(found.save), before);
});
