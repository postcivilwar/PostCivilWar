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
