// The words a player reads: the About text, the two questions asked before something that cannot be taken
// back, and the names the game must not be given. These are the owner's own words, kept here letter for letter,
// so a change to any of them is seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { ABOUT } from '../src/client/ui.js';

const here = (p) => resolve(dirname(fileURLToPath(import.meta.url)), '..', p);
const read = (p) => readFileSync(here(p), 'utf8');
const sources = (dir, out = []) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) sources(p, out); else if (/\.(js|mjs|html|css|json)$/.test(name)) out.push(p); } return out; };

const WANTED = [
  "Step into a rich, immersive world set in post-civil war Nigeria, after the Biafran conflict. This open-world life simulation invites players from all backgrounds, worldwide, to experience a journey of reinvention. Set in the Eastern region of Nigeria after the 1970 ceasefire, you begin with just £20, having lost everything in the aftermath of the war.",
  "In this game, you forge your own path: will you rise as a hero, helping rebuild your community or take a darker route as a villain? Whether you choose to work as a teacher, engineer, pastor or engage in crime—car theft, smuggling or other high-stakes risks, your choices shape your destiny. Build wealth by trading land, cars, and assets; or lose yourself in the struggle for survival. Every action has consequences—police, soldiers and justice will follow.",
  "Powered by TR as your currency, the game blends historical authenticity with limitless freedom. Anyone can experience the rich culture, the triumphs, and the challenges of rebuilding life in post-war Nigeria. Your story, your choices—start today."
];

test('About is the three paragraphs, letter for letter', () => {
  assert.equal(ABOUT.length, 3);
  for (let i = 0; i < 3; i += 1) assert.equal(ABOUT[i], WANTED[i], `paragraph ${i + 1}`);
  // and Settings shows those, each as a paragraph of its own
  const ui = read('src/client/ui.js');
  assert.match(ui, /id: 'about'/);
  assert.match(ui, /ABOUT\.map\(/);
});

test('logging out and erasing ask with the words that were asked for', () => {
  const all = sources(here('src/client')).map((p) => readFileSync(p, 'utf8')).join('\n');
  for (const words of [
    'Log out of your account?',
    'You will be signed out of the game. Your saved progress will remain available when you log in again.',
    'Log Out',
    'Erase your saved game?',
    "This will permanently delete the selected game\\'s saved progress and start a new journey. This action cannot be undone.",
    'Erase Save and Restart',
    'Username copied',
    'Confirm Transfer',
  ]) assert.ok(all.includes(words) || all.includes(words.replace("\\'", "'")), `"${words}" is not in the game`);
  const server = readFileSync(here('../api/_lib/wallet.js'), 'utf8');
  assert.ok(server.includes('Username not found. You can only send TR to registered users.'), 'the answer for a username nobody has');
});

test('the game is given no name it does not have, and no way to make TR out of nothing', () => {
  const files = [...sources(here('src')), here('../api/game.js'), ...sources(here('../api/_lib')).filter((p) => !/postgres/.test(p))];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/LagosLife|Lagos Game|Lagos Life/i.test(text), `${file} names the game something it is not called`);
    assert.ok(!/Add funds|\(sandbox\)|faucet/i.test(text), `${file} still speaks of adding funds`);
  }
  const page = read('src/client/template.html');
  assert.ok(!/without an account|no account needed|play as a guest/i.test(page), 'the page still offers play without an account');
});

// Starter TR and the character upgrade: the words a player is given, exactly as they were asked for, said the
// same by the town (src/sim/funds.js) and by the bank (api/_lib/wallet.js).
test('starter TR is refused in the words that were asked for, by the town and by the bank alike', async () => {
  const { FUND_WORDS } = await import('../src/sim/funds.js');
  const { createRequire } = await import('node:module');
  const bank = createRequire(import.meta.url)('../../api/_lib/wallet.js').WORDS;
  const wanted = {
    transfer: 'Starter TR cannot be transferred. Earn TR through gameplay to send money to other players.',
    asset: 'Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases.',
    short: 'You do not have enough eligible TR for this transaction.',
  };
  for (const [key, words] of Object.entries(wanted)) {
    assert.equal(FUND_WORDS[key], words, `the town's "${key}"`);
    assert.equal(bank[key], words, `the bank's "${key}"`);
  }
  // the Wallet says the first of them before anything is typed, and names the parts of a balance
  const wallet = read('src/client/ui-wallet.js');
  assert.ok(wallet.includes(wanted.transfer), 'the send form does not say that starter TR cannot be transferred');
  for (const label of ["'Total'", "'Starter TR'", "'Earned TR (eligible)'"]) assert.ok(wallet.includes(label), `the Wallet's breakdown has no ${label}`);
});

test('a character upgrade is confirmed in the words that were asked for', () => {
  const main = read('src/client/main.js');
  for (const words of [
    'Upgrading changes your permanent character. You will need to pay another upgrade fee to change it again.',
    "'Confirm Upgrade'", "cancel: 'Cancel'",
    "'Current character'", "'New character'", "'Current balance'", "'Upgrade fee'", "'Balance after upgrade'",
  ]) assert.ok(main.includes(words), `${words} is not in the upgrade's confirmation`);
});

test('the screen where a character is made does not ask hero or villain', () => {
  const page = read('src/client/template.html');
  const from = page.indexOf('<div id="start"'), to = page.indexOf('id="intro"', from);
  assert.ok(from > 0 && to > from, 'the start screen was not found in the page');
  const start = page.slice(from, to);
  assert.ok(start.length > 500, 'the start screen was not found in the page');
  assert.ok(!/id="paths"|data-path=|Your path/i.test(start), 'the start screen still has the path on it');
  assert.ok(!/id="continue"|id="continue-top"/.test(page), 'the start screen still has a Continue button');
  // the question itself is still there, in the opening, where it is asked once
  assert.match(page, /class="pick"[^>]*data-path="hero"|data-path="hero"[^>]*class="pick"/);
});

test('the upgrade fee is a quarter of the whole balance, offered only above 2,000 TR: the same sum in the town and at the bank', async () => {
  const sim = await import('../src/sim/sim.js');
  const { createRequire } = await import('node:module');
  const bank = createRequire(import.meta.url)('../../api/_lib/character.js');
  assert.deepEqual({ ...sim.UPGRADE }, { ...bank.UPGRADE });
  assert.equal(bank.UPGRADE.above, 4000);            // 2,000 TR, at two units to the TR
  // the examples that were given, in TR
  for (const [total, fee] of [[2400, 600], [4000, 1000], [8000, 2000], [12000, 3000]]) {
    assert.equal(sim.upgradeFee(total * 2) / 2, fee, `${total} TR in the town`);
    assert.equal(bank.upgradeFee(total * 2) / 2, fee, `${total} TR at the bank`);
  }
  // a balance that does not divide: to the half TR, rounded down, and the same in both places
  for (const units of [4001, 4003, 5581, 4899, 99999, 1]) assert.equal(sim.upgradeFee(units), bank.upgradeFee(units));
  assert.equal(bank.upgradeFee(5581), 1395);
});
