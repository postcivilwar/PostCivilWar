// The whole site in real browsers: the built page, the server and a database, as a player meets them.
//
//   node prototype/build.mjs
//   server/with-postgres.sh node server/test/site.mjs [output-directory]
//
// Two players, each in a browser of their own. Nobody plays without an account: the first thing checked is that
// the town is shut until one is made. A new account is asked hero or villain once, chooses a character once
// (and is asked to be sure), and arrives with 2,000 TR of starter TR, which buys nothing to own and cannot be
// sent: both are tried, and refused in the words a player is owed. Then each is paid TR they can spend (by a
// third account, the test's own, whose earnings the bank is told of as a game tells it). One buys a watch at
// HOLARIS Watch and puts it up for sale. The other, on a phone, finds it in the market, walks into the seller's
// marker, talks, and offers; the seller says yes. Then TR is sent from one to the other in the Wallet; the same
// account on a second device (straight into town, the same character, nothing asked); the characters looked at,
// an upgrade that cannot be afforded and one that can; logging out (asked first) and erasing a saved game
// (asked first; the TR and the character stay).
// Everything is done by pressing what a player presses; what is checked is what the player sees, what each
// game's own ledger holds, and what the bank holds. Needs Playwright with Chromium. Not part of the unit tests.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDevServer } from '../dev.mjs';
import { overTown } from '../../prototype/test/start.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const out = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '../../prototype/dist/shots-site'));
mkdirSync(out, { recursive: true });

const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const bad = (text) => { problems.push(text); console.log(`   PROBLEM: ${text}`); };
const say = (text) => console.log(text);
const TR = 2;
const tag = Math.random().toString(36).slice(2, 6);

async function device(label, size, mobile = false) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => {});
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => bad(`${label}: ${e.message}`));
  let hush = null;                    // (an error the test itself is causing just now, and so expects)
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*40[01349]|status of 4(00|01|03|04|09|29)/.test(m.text()) && !(hush && hush.test(m.text()))) bad(`${label}: console: ${m.text()}`); });
  await page.goto(`${origin}/#nointro-lite`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await page.waitForFunction(() => window.__nlw.online.status().state !== 'checking');
  { const st = await page.evaluate(() => { const x = window.__nlw.online.status(); return { state: x.state, message: x.message }; }); if (st.state === 'down') { bad(`${label}: on opening the page the game says the server cannot be reached ("${st.message}")`); await page.click('#account-retry'); await page.waitForFunction(() => window.__nlw.online.status().state !== 'down', null, { timeout: 60000 }); } }
  const press = (selector) => (mobile ? page.tap(selector) : page.click(selector));
  const d = {
    label, page, context, press,
    hush: (pattern) => { hush = pattern; },
    shot: async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: resolve(out, `${label}-${name}.png`) }); },
    game: (fn, arg) => page.evaluate(fn, arg),
    balance: () => page.evaluate(() => window.__nlw.view.self.balance),
    bank: () => page.evaluate(() => window.__nlw.wallet.state.balance),
    // the town's purse and the bank agree, and both say this many TR
    async has(tr, when) {
      await page.waitForFunction((want) => window.__nlw.view.self.balance === want && window.__nlw.wallet.state.balance === want, tr * 2, { timeout: 30000 }).catch(() => {});
      const got = await page.evaluate(() => [window.__nlw.view.self.balance / 2, window.__nlw.wallet.state.balance / 2]);
      if (got[0] !== tr || got[1] !== tr) bad(`${label}: ${when}: the purse holds ${got[0]} TR and the bank ${got[1]} TR; it should be ${tr} TR`);
    },
    openWallet: async () => { await page.evaluate(() => window.__nlw.ui.openPhone('wallet')); await page.waitForSelector('.page[data-app="wallet"]'); await page.waitForFunction(() => document.querySelector('#wallet-balance') && !document.querySelector('#wallet-balance').classList.contains('wl-wait')); },
    async signUp(username, password) {
      await press('#open-signup');
      await page.fill('#account-username', username); await page.fill('#account-password', password);
      await press('#account-submit');
      await page.waitForFunction(() => window.__nlw.online.status().state === 'in');
      await page.waitForSelector('#account', { state: 'hidden' });
    },
    // hero or villain: put once to an account that has never answered, before a character is made
    asking: () => page.evaluate(() => window.__nlw.intro.asking()),
    async answer(path) {
      await page.waitForFunction(() => window.__nlw.intro.asking(), null, { timeout: 30000 });
      await page.waitForTimeout(500);
      await press(`.pick[data-path="${path}"]`);
      // (the answer is the account's once the server has it)
      await page.waitForFunction((want) => !window.__nlw.intro.asking() && document.querySelector('#intro').hidden && document.querySelector('#start').dataset.screen === 'create' && window.__nlw.online.account && window.__nlw.online.account.path === want, path, { timeout: 30000 }).catch(() => bad(`${label}: the answer "${path}" did not reach the account`));
    },
    // Enter. Someone choosing a character is asked to be sure (and may go back); someone who has one is not
    // asked anything. Gives what was asked, or null.
    async enter(name, { unsure = false } = {}) {
      await page.waitForFunction(() => { const s = document.querySelector('#start'); const b = document.querySelector('#enter'); return !s.hidden && s.dataset.screen === 'create' && !window.__nlw.intro.asking() && b && !b.disabled; });
      await page.fill('#name', name); await press('#enter');
      await page.waitForFunction(() => !document.querySelector('#confirm').hidden || !document.querySelector('#hud').hidden);
      let asked = null;
      if (await page.isVisible('#confirm')) {
        asked = await page.evaluate(() => ({ title: document.querySelector('#confirm-title').textContent, body: document.querySelector('#confirm-body').textContent, yes: document.querySelector('#confirm-yes').textContent.trim(), no: document.querySelector('#confirm-no').textContent.trim() }));
        if (unsure) {
          await press('#confirm-no'); await page.waitForSelector('#confirm', { state: 'hidden' }); await page.waitForTimeout(400);
          asked.backed = await page.evaluate(() => ({ hud: !document.querySelector('#hud').hidden, player: window.__nlw.playerId || null, figure: window.__nlw.online.account.figure || null }));
          await press('#enter'); await page.waitForSelector('#confirm:not([hidden])');
        }
        await press('#confirm-yes');
      }
      await page.waitForFunction(() => window.__nlw.view && !document.querySelector('#hud').hidden);
      await page.waitForTimeout(1200);
      await clearTown(d, 'after Enter');
      return asked;
    },
    // what the bank says the wallet is made of, in TR: { total, starter, eligible }
    async parts() { await page.evaluate(() => window.__nlw.wallet.refresh()); return page.evaluate(() => { const w = window.__nlw.wallet.state; return { total: w.balance / 2, starter: w.starter / 2, eligible: w.eligible / 2 }; }); },
    // ...and that it is this much, of which this much is starter TR
    async made(total, starter, when) {
      const got = await d.parts();
      if (got.total !== total || got.starter !== starter || got.eligible !== total - starter) bad(`${label}: ${when}: the wallet is ${JSON.stringify(got)}; it should be ${total} TR, ${starter} of it starter TR`);
      const town = await page.evaluate(() => { const f = window.__nlw.host.game.view(window.__nlw.playerId).self.funds; return { total: f.total / 2, starter: f.starter / 2, eligible: f.eligible / 2 }; }).catch(() => null);
      if (town && (town.total !== total || town.starter !== starter)) bad(`${label}: ${when}: the town's own count of the wallet is ${JSON.stringify(town)}; the bank's is ${total} TR, ${starter} of it starter TR`);
    },
    // the server, asked directly from this browser with whatever it likes to say: { status, code, body }
    api: (body) => page.evaluate(async (b) => { const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1' }, body: JSON.stringify(b) }); const json = await r.json().catch(() => null); return { status: r.status, code: json && (json.code || (json.error && json.error.code)) || null, body: json }; }, body),
    // stands the player just outside a marker and walks them in: by the W key, or on a phone by the stick
    async walkInto(x, z) {
      await page.evaluate(([px, pz]) => { const n = window.__nlw; n.place(px, pz + 4.2); n.cam.yaw = Math.PI; n.cam.pitch = 0.2; n.cam.dist = 8; n.face(Math.PI); }, [x, z]);
      await page.waitForTimeout(1500);
      let lift = async () => { await page.keyboard.up('w'); };
      if (mobile) {
        const stick = await page.locator('#stick').boundingBox();
        const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - 40, id: 1 }] });
        lift = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
      } else await page.keyboard.down('w');
      await page.waitForFunction(() => document.querySelector('#fade').classList.contains('on'), null, { timeout: 120000, polling: 50 });
      await lift();
    },
    // (the page first says it is asking the market what is the player's; it is open once the market has answered)
    openProperty: async () => { await page.evaluate(() => window.__nlw.ui.openPhone('property')); await page.waitForSelector('.page[data-app="property"]'); await page.waitForFunction(() => !!document.querySelector('#no-assets, #my-assets, .page[data-app="property"] .notice'), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(300); },
  };
  return d;
}

// While someone who has a character is on their way into the town: was the screen where one is made, the
// question, or a button to continue as someone ever put in front of them? Started before they log in; read after.
const watchStart = (d) => d.page.evaluate(() => {
  window.__offered = [];
  const note = (what) => { if (!window.__offered.includes(what)) window.__offered.push(what); };
  const seen = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  window.__offering = setInterval(() => {
    const start = document.querySelector('#start');
    if (window.__nlw.intro.asking()) note('hero or villain');
    if (start && !start.hidden && start.dataset.gate === 'open') { if (seen('#enter')) note('Enter'); if (seen('#name')) note('a name'); if (seen('#fig-next')) note('a choice of character'); if (seen('#continue') || seen('#continue-top')) note('Continue'); }
  }, 40);
});
const offered = (d) => d.page.evaluate(() => { clearInterval(window.__offering); return window.__offered; });
const rowsOf = (d) => d.page.evaluate(() => { const out = {}; const dts = [...document.querySelectorAll('#confirm-rows dt')]; for (const dt of dts) out[dt.textContent.trim()] = dt.nextElementSibling.textContent.trim(); return out; });
const asked = (d) => d.page.evaluate(() => ({ title: document.querySelector('#confirm-title').textContent, body: document.querySelector('#confirm-body').textContent, note: document.querySelector('#confirm-note').hidden ? '' : document.querySelector('#confirm-note').textContent, yes: document.querySelector('#confirm-yes').hidden ? null : document.querySelector('#confirm-yes').textContent.trim(), no: document.querySelector('#confirm-no').textContent.trim() }));
// In town with nothing of the start screen left over it (test/start.mjs says what "over it" means).
const clearTown = async (d, when) => { const over = await d.page.evaluate(overTown).catch((e) => `could not be looked at (${e.message})`); if (over) bad(`${d.label}: ${when}: ${over}`); };
// who the player is, everywhere it is kept
const who = (d) => d.page.evaluate(() => ({ account: window.__nlw.online.account.figure, town: window.__nlw.playerId ? window.__nlw.host.game.view(window.__nlw.playerId).self.look.figure : null, drawn: window.__nlw.me ? window.__nlw.me.figure : null }));
const openCharacters = async (d) => {
  await d.page.evaluate(() => window.__nlw.ui.openPhone('settings')); await d.page.waitForSelector('#open-gallery');
  await d.page.evaluate(() => document.querySelector('#open-gallery').scrollIntoView({ block: 'center' }));
  await d.press('#open-gallery');
  await d.page.waitForFunction(() => window.__nlw.gallery && !document.querySelector('#gallery').hidden);
  await d.page.waitForTimeout(600);
};

// ------------------------------------------------------------------ the test's own account --
// TR that can be spent on things to own, or sent, is TR that was earned. The two players are paid theirs by a
// third account, which the test controls: the bank is told that account earned it in town, exactly as a game
// tells it with a save (and is first given the room to be believed, which only the database can give), and
// the account then sends it in the ordinary way. No player's TR is used, and nobody's balance is written to.
const teller = await (async () => {
  let cookie = '';
  const call = async (op, body = {}) => {
    const r = await fetch(`${origin}/api/game`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1', origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ op, ...body }) });
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const json = await r.json();
    if (!json.ok) throw new Error(`the test's own account: ${op}: ${r.status} ${json.code || ''} ${json.message || ''}`);
    return json;
  };
  const username = `Teller_${tag}`;
  await call('signup', { username, password: 'a password for the teller' });
  const { database } = require('../../api/_lib/db.js');
  const sql = await database();
  const units = 4000 * TR;
  await sql.unsafe('update pcw.wallets w set earn_room = earn_room + $2 from pcw.accounts a where a.id = w.account_id and a.username_key = $1', [username.toLowerCase(), units]);
  const now = await call('save.get');
  const kept = await call('save.put', { baseRev: now.rev || 0, enc: 'json', data: JSON.stringify({ host: { test: true } }), summary: { name: 'The Teller', figure: 'W1' }, wallet: { v: 2, from: now.wallet.mark, upto: now.wallet.mark + 1, in: { lawful: units, illicit: 0 }, out: { cost: 0, restitution: 0, asset: 0 } } });
  if (kept.wallet.refused) throw new Error('the bank refused what the test\'s own account said it earned');
  return { username, pay: (to, tr, note) => call('wallet.send', { username: to, amount: String(tr), note, key: crypto.randomUUID() }) };
})();

// ------------------------------------------------------------------ the seller, on a computer --
say('1. A player on a computer makes an account');
const seller = await device('seller', { width: 1280, height: 760 });
const sellerName = `Seller_${tag}`;
{
  const p = seller.page;
  // the town is shut: a welcome, Create Account and Log In, and no way in beside them
  const seen = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const row = await seller.game(`(() => { const seen = ${seen.toString()}; return { gate: document.querySelector('#start').dataset.gate, title: document.querySelector('#gate-title').textContent, card: seen('#gate'), signup: document.querySelector('#open-signup').getBoundingClientRect(), login: document.querySelector('#open-login').getBoundingClientRect(), labels: [document.querySelector('#open-signup').textContent, document.querySelector('#open-login').textContent], enter: seen('#enter'), name: seen('#name'), cont: seen('#resume') || seen('#stage-view'), may: window.__nlw.mayEnter(), words: document.querySelector('#start').innerText }; })()`);
  if (row.gate !== 'shut' || !row.card) bad(`with nobody signed in the start screen's gate is "${row.gate}"`);
  if (row.labels.join('|') !== 'Create Account|Log In') bad(`the two buttons read ${JSON.stringify(row.labels)}`);
  if (Math.abs(row.signup.top - row.login.top) > 2 || row.login.left <= row.signup.right) bad('Create Account and Log In are not side by side');
  if (row.enter || row.name || row.cont) bad(`with nobody signed in the way into the town is on show (${JSON.stringify({ enter: row.enter, name: row.name, cont: row.cont })})`);
  if (row.may) bad('with nobody signed in the game says the town may be entered');
  if (/without an account|no account|guest|skip/i.test(row.words)) bad(`the welcome speaks of playing without an account: "${row.words}"`);
  // ...and not only hidden: asking the game itself to begin opens nothing
  const forced = await seller.game(() => { const b = document.querySelector('#enter'); document.querySelector('#name').value = 'Nobody'; b.click(); return new Promise((r) => setTimeout(() => r({ hud: !document.querySelector('#hud').hidden, player: window.__nlw.playerId || null, start: !document.querySelector('#start').hidden }), 900)); });
  if (forced.hud || forced.player || !forced.start) bad(`pressing Enter from outside the page's own buttons let someone in: ${JSON.stringify(forced)}`);
  if (await p.isVisible('#account')) await p.click('#account-back');
  await seller.shot('01-start');
  await seller.press('#open-signup');
  // what is typed is checked before anything is sent
  for (const [u, pw, want] of [['ab', 'long enough here', /3 to 16/], ['two words', 'long enough here', /no spaces/], [sellerName, 'short', /at least 8/], [sellerName, sellerName.toLowerCase(), /must not be the username/]]) {
    await p.fill('#account-username', u); await p.fill('#account-password', pw); await p.click('#account-submit');
    const told = await p.textContent('#account-error');
    if (!want.test(told)) bad(`"${u}" / "${pw}" was answered "${told}"`);
  }
  if ((await p.getAttribute('#account-password', 'type')) !== 'password') bad('the password is shown as it is typed');
  await seller.shot('02-signup');
  await p.click('#account-back');
  await seller.signUp(sellerName, 'a password for the seller');
  const who = await p.textContent('#account-name');
  if (who !== sellerName) bad(`the start screen says the account is "${who}"`);
  // nothing of the password is kept by the page
  const kept = await seller.game(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))) + document.cookie + document.querySelector('#account-password').value);
  if (kept.includes('a password for the seller')) bad('the password is kept somewhere in the page');
  const cookies = await seller.context.cookies();
  const session = cookies.find((c) => c.name === 'pcw_session');
  if (!session || !session.httpOnly || session.sameSite !== 'Lax') bad(`the session cookie is ${JSON.stringify(session)}`);
  // a new account is asked hero or villain, once, before anything else; the screen where the character is made
  // does not ask it again
  if (!(await seller.asking())) { await p.waitForFunction(() => window.__nlw.intro.asking(), null, { timeout: 30000 }).catch(() => bad('a new account is not asked hero or villain')); }
  await seller.shot('02b-question');
  await seller.answer('villain');
  const made = await seller.game(() => ({ text: document.querySelector('#start').innerText, heading: document.querySelector('#start-title').textContent, paths: !!document.querySelector('#paths'), account: window.__nlw.online.account.path, figure: window.__nlw.online.account.figure || null, shown: window.__creator.shown.id }));
  if (made.paths || /your path/i.test(made.text) || /\b(hero|villain)\b/i.test(made.text)) bad(`the screen where a character is made asks for the path again: "${made.text.slice(0, 300)}"`);
  if (made.account !== 'villain') bad(`the account keeps the answer as "${made.account}"`);
  if (made.figure) bad(`the account has a character (${made.figure}) before one was chosen`);
  if (!/Create your character/.test(made.heading)) bad(`the heading reads "${made.heading}"`);
  await seller.shot('02c-character');
  // Enter asks to be sure, and Go Back chooses nothing
  const sure = await seller.enter('Seller Eze', { unsure: true });
  if (!sure || sure.title !== 'Choose Adaeze?' || sure.yes !== 'Choose This Character' || sure.no !== 'Go Back' || !/from now on/.test(sure.body) || !/character upgrade/.test(sure.body)) bad(`choosing a character asks ${JSON.stringify(sure)}`);
  if (sure && (sure.backed.hud || sure.backed.player || sure.backed.figure)) bad(`Go Back chose a character anyway: ${JSON.stringify(sure.backed)}`);
  const mine = await seller.game(() => ({ account: window.__nlw.online.account.figure, town: window.__nlw.view.self.look.figure, path: window.__nlw.view.self.path }));
  if (mine.account !== 'W1' || mine.town !== 'W1' || mine.path !== 'villain') bad(`after choosing Adaeze the account and the town have ${JSON.stringify(mine)}`);
  // it is chosen once: the server will not take another from this browser, whatever it is sent
  const again = await seller.api({ op: 'character.choose', figure: 'M1', path: 'hero' });
  if (again.status !== 409 || again.code !== 'CHOSEN') bad(`choosing a second character directly was answered ${JSON.stringify(again)}`);
  const still = await seller.api({ op: 'character.get' });
  if (!still.body || !still.body.character || still.body.character.figure !== 'W1' || still.body.character.path !== 'villain') bad(`after a second choice was sent the account's character is ${JSON.stringify(still.body)}`);
  // the arrival money is starter TR, all of it
  await seller.made(2000, 2000, 'on arrival');
  // the town keeps this device's own time and date, and Settings says where the time and the weather come from
  const time = await seller.game(() => { const d = new Date(); const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; return { day: document.querySelector('#hud-day').textContent, want: `${names[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`, clock: window.__nlw.view.clock.label, now: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; });
  if (time.day.toLowerCase() !== time.want.toLowerCase()) bad(`in town the date reads "${time.day}"; the device says ${time.want}`);
  if (time.clock !== time.now) { const [a1, b1] = time.clock.split(':').map(Number); const [a2, b2] = time.now.split(':').map(Number); if (Math.abs(a1 * 60 + b1 - (a2 * 60 + b2)) > 1) bad(`in town the clock reads ${time.clock}; the device's reads ${time.now}`); }
  await seller.game(() => window.__nlw.ui.openPhone('settings')); await p.waitForSelector('#settings-time');
  const said = await p.textContent('#settings-time');
  if (!/This device's own clock/.test(said) || !/Today/.test(said) || !/Weather/.test(said)) bad(`Settings says of the time and weather "${said}"`);
  await seller.game(() => window.__nlw.ui.close());
}

say('2. ...walks into the pink marker at HOLARIS Watch and buys a watch');
{
  const p = seller.page;
  const markers = await seller.game(async () => { await window.__nlw.refreshDealMarkers(); return [...window.__nlw.dealMarkers.values()].filter((m) => !(m.listing.asset && m.listing.asset.category === 'motorcycle')).map((m) => ({ name: m.listing.name, x: m.x, z: m.z, visible: m.marker.group.visible })); });
  // (the motorcycle showroom's twelve are checked by prototype/test/motorcycles.mjs: here, the rest)
  if (markers.length !== 1 || markers[0].name !== 'HOLARIS Wristwatch') bad(`the markers in town are ${JSON.stringify(markers)}`);
  await seller.openProperty();
  if (!(await p.isVisible('#no-assets'))) bad('a new player is not told they own nothing from the market');
  if ((await p.getAttribute('.pageback', 'id')) !== 'page-back') bad('the Property page has no way back at the top left');
  const back = await p.locator('#page-back').boundingBox();
  if (back.x > 30 || back.y > 30) bad(`the way back is at ${Math.round(back.x)}, ${Math.round(back.y)}`);
  await p.click('#buy-asset'); await p.waitForSelector('.listing');
  await seller.shot('03-market');
  const listed = await seller.game(() => [...document.querySelectorAll('.listing')].map((l) => l.textContent).filter((t) => !/Motorcycle Showroom/.test(t)));
  if (listed.length !== 1 || !/HOLARIS Wristwatch/.test(listed[0]) || !/100 TR/.test(listed[0]) || !/10 of 10 left/.test(listed[0])) bad(`the market lists ${JSON.stringify(listed)}`);
  // the photographs are there, and dragging turns the watch
  const turned = await seller.game(async () => { const t = document.querySelector('.listing .turntable'); const before = t.style.backgroundPosition; const r = t.getBoundingClientRect(); const fire = (type, x) => t.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: r.top + 40, pointerId: 7, bubbles: true })); fire('pointerdown', r.left + 100); fire('pointermove', r.left + 20); fire('pointerup', r.left + 20); const img = new Image(); const ok = await new Promise((res) => { img.onload = () => res(img.naturalWidth); img.onerror = () => res(0); img.src = 'assets/watch-turn.webp'; }); return { before, after: t.style.backgroundPosition, width: ok }; });
  if (turned.width !== 2304) bad(`the watch's photographs did not load (${turned.width})`);
  if (turned.before === turned.after) bad('dragging the watch does not turn it');
  // searching: what is there is found; what is not is said not to be there, and nothing is made up
  for (const [q, n] of [['yacht', 0], ['gun', 0], ['helicopter', 0], ['watch', 1], ['WATCHES', 1], ['holaris', 1]]) {
    await p.fill('#market-search', q);
    await p.waitForFunction(([want, query]) => window.__nlw.market.state.query === query && document.querySelectorAll('.listing').length === want, [n, q], { timeout: 15000 }).catch(() => bad(`searching "${q}" does not show ${n}`));
  }
  await p.fill('#market-search', 'yacht'); await p.waitForSelector('#market-empty'); await seller.shot('04-search-yacht');
  await p.fill('#market-search', ''); await p.waitForSelector('.listing .btn');
  await p.locator('.listing', { hasText: 'HOLARIS' }).locator('.btn').click(); await p.waitForSelector('#go-there'); await seller.shot('05-listing');
  await p.click('#go-there'); await p.waitForTimeout(600);
  const way = await seller.game(() => ({ open: window.__nlw.ui.isOpen(), mark: document.querySelector('#waypoint') && !document.querySelector('#waypoint').hidden }));
  if (way.open || !way.mark) bad(`"Show the way" left the phone ${way.open ? 'open' : 'away'} and the place ${way.mark ? 'marked' : 'unmarked'}`);
  await seller.walkInto(-26, 55.4);
  await p.waitForSelector('#deal-text'); await p.waitForTimeout(900);
  await seller.shot('06-deal');
  const first = await p.textContent('#deal-log');
  if (!/Welcome to HOLARIS Watch\. The HOLARIS Wristwatch is 100 TR\. 10 of 10 are left\./.test(first)) bad(`the attendant opens with "${first}"`);
  if (!/automatic/.test(await p.textContent('.chathead'))) bad('the shop\'s attendant is not said to be automatic');
  // with the phone out only the feet move
  const mode = await seller.game(() => ({ mode: window.__nlw.mode, out: window.__nlw.ui.phoneOut() }));
  if (mode.mode !== 'panel' || !mode.out) bad(`dealing, the game is in ${JSON.stringify(mode)}`);
  await p.fill('#deal-text', 'Can you do 80?'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /It is not reduced/.test(document.querySelector('#deal-log').textContent), null, { timeout: 15000 }).catch(() => bad('the attendant did not answer a lower price'));
  // with nothing but the arrival money the watch cannot be bought: the reason given is the actual one (not "you
  // have too little": there are 2,000 TR there), nothing is taken, and no watch changes hands
  await p.click('#deal-buy');
  if (!/Pay 100 TR for the HOLARIS Wristwatch\? You have 0 TR of earned TR\./.test(await p.textContent('#deal-bar'))) bad(`with only starter TR, buying asks "${await p.textContent('#deal-bar')}"`);
  await p.click('#deal-yes');
  await p.waitForSelector('.dealnote', { timeout: 20000 }).catch(() => bad('buying with starter TR was not answered'));
  const refused = (await p.textContent('.dealnote').catch(() => '')).trim();
  await seller.shot('06b-starter-refused');
  if (refused !== 'Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases.') bad(`buying with starter TR is answered "${refused}"`);
  if (/not enough|insufficient|do not have that much/i.test(refused)) bad('buying with starter TR is answered as if the balance were too small');
  if (await p.isVisible('#deal-done')) bad('a watch was bought with starter TR');
  await seller.has(2000, 'after starter TR was refused for a watch');
  await seller.made(2000, 2000, 'after starter TR was refused for a watch');
  const left = await seller.game(async () => { await window.__nlw.market.sync(); return [...document.querySelectorAll('.dealitem .what')].map((e) => e.textContent).join(' '); });
  if (!/10 left/.test(left)) bad(`after the refusal the shop has "${left}"`);
  // paid 500 TR for work (by the test's own account): now there is TR that buys things
  await teller.pay(sellerName, 500, 'for the work');
  await seller.game(() => window.__nlw.wallet.refresh());
  await seller.has(2500, 'after being paid 500 TR');
  await seller.made(2500, 2000, 'after being paid 500 TR');
  await p.click('#deal-buy');
  if (!/Pay 100 TR for the HOLARIS Wristwatch\? You have 500 TR of earned TR\./.test(await p.textContent('#deal-bar'))) bad(`buying asks "${await p.textContent('#deal-bar')}"`);
  await p.click('#deal-yes'); await p.waitForSelector('#deal-done');
  await seller.shot('07-bought');
  if (!/It is yours: HOLARIS Wristwatch No\. 1 of 10/.test(await p.textContent('#deal-done'))) bad(`after buying: "${await p.textContent('#deal-done')}"`);
  await seller.has(2400, 'after buying a watch for 100 TR');
  // the watch was paid for out of what was earned: the arrival money is untouched
  await seller.made(2400, 2000, 'after buying a watch for 100 TR');
  if (!/2,400/.test(await p.textContent('#hud-balance'))) bad(`the purse reads ${await p.textContent('#hud-balance')}`);
  await p.click('#deal-back'); await p.waitForTimeout(700);
  const after = await seller.game(() => ({ open: window.__nlw.ui.isOpen(), mode: window.__nlw.mode }));
  if (after.open || after.mode !== 'walking') bad(`after leaving the deal: ${JSON.stringify(after)}`);
}

say('3. ...and puts it up for sale on Market Road');
let spot = null;
{
  const p = seller.page;
  await seller.game(() => window.__nlw.place(12, 60)); await p.waitForTimeout(900);
  await seller.openProperty(); await p.waitForSelector('.assetcard');
  if (!/HOLARIS Wristwatch/.test(await p.textContent('.assetcard')) || !/No\. 1 of 10/.test(await p.textContent('.assetcard'))) bad(`Property shows "${await p.textContent('.assetcard')}"`);
  await p.click('.assetcard'); await p.waitForSelector('#sell-price');
  await p.fill('#sell-price', '150'); await seller.shot('08-sell');
  await p.click('#sell-here'); await p.waitForSelector('#unlist');
  spot = await seller.game(async () => { await window.__nlw.refreshDealMarkers(); const m = [...window.__nlw.dealMarkers.values()].find((x) => x.listing.mine); return m ? { x: m.x, z: m.z, price: m.listing.price, label: m.listing.place.label } : null; });
  if (!spot || spot.price !== 150 * TR || Math.hypot(spot.x - 12, spot.z - 60) > 1) bad(`the seller's marker is ${JSON.stringify(spot)}`);
  await seller.game(() => window.__nlw.ui.close()); await p.waitForTimeout(600);
  await seller.shot('09-own-marker');
}

// ------------------------------------------------------------------ the buyer, on a phone --
say('4. A second player, on a phone, makes an account and finds it in the market');
const buyer = await device('buyer', { width: 390, height: 844 }, true);
const buyerName = `Buyer_${tag}`;
{
  const p = buyer.page;
  await buyer.shot('01-start');
  const wide = await buyer.game(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (wide) bad('on a phone the start screen scrolls sideways');
  // a name that is taken, in other capitals
  await buyer.press('#open-signup');
  await p.fill('#account-username', sellerName.toUpperCase()); await p.fill('#account-password', 'a password for the buyer'); await buyer.press('#account-submit');
  await p.waitForFunction(() => /taken/.test(document.querySelector('#account-error').textContent), null, { timeout: 20000 }).catch(() => bad('a taken username is not refused'));
  await p.fill('#account-username', buyerName); await p.fill('#account-password', 'a password for the buyer'); await buyer.press('#account-submit');
  await p.waitForFunction(() => window.__nlw.online.status().state === 'in');
  await p.waitForSelector('#account', { state: 'hidden' });
  await buyer.answer('hero');
  await buyer.shot('01b-character');
  const chose = await buyer.enter('Buyer Okafor');
  if (!chose || chose.title !== 'Choose Adaeze?') bad(`the buyer, choosing, was asked ${JSON.stringify(chose)}`);
  await buyer.made(2000, 2000, 'on arrival');
  await buyer.openProperty(); await buyer.press('#buy-asset'); await p.waitForSelector('.listing');
  await p.waitForFunction(() => [...document.querySelectorAll('.listing')].filter((l) => !/Motorcycle Showroom/.test(l.textContent)).length === 2, null, { timeout: 15000 }).catch(() => bad('the buyer does not see two listings'));
  await buyer.shot('02-market');
  await p.fill('#market-search', sellerName); await p.waitForFunction(() => document.querySelectorAll('.listing').length === 1);
  const card = await p.textContent('.listing');
  if (!/No\. 1 of 10/.test(card) || !/150 TR/.test(card) || !card.includes(`Sold by ${sellerName}`)) bad(`the seller's listing reads "${card}"`);
  await buyer.press('.listing .btn'); await p.waitForSelector('#go-there'); await buyer.shot('03-listing');
  await buyer.press('#go-there'); await p.waitForTimeout(600);
}

say('5. ...goes there: the two see each other, each under the other\'s username');
{
  await buyer.game(async () => { await window.__nlw.refreshDealMarkers(); const n = window.__nlw; n.place(12, 66); n.cam.yaw = Math.PI; n.face(Math.PI); });
  const sees = (d, name) => d.page.waitForFunction((want) => window.__nlw.view.players.some((q) => q.visitor && q.name === want), name, { timeout: 30000 }).then(() => true, () => false);
  if (!(await sees(buyer, sellerName))) bad(`the buyer does not see ${sellerName} (${JSON.stringify(await buyer.game(() => window.__nlw.view.players.map((q) => q.name)))})`);
  if (!(await sees(seller, buyerName))) bad(`the seller does not see ${buyerName}`);
  await buyer.page.waitForTimeout(1500);
  await buyer.shot('04-near'); await seller.shot('10-buyer-near');
  const link = await buyer.game(() => window.__nlw.link);
  if (!link || link.kind !== 'web' || link.peers !== 1) bad(`the buyer's link is ${JSON.stringify(link)}`);
}

say('6. ...steps into the marker: black, then the conversation; they talk and the buyer offers 140 TR');
let offerShown = false;
{
  const p = buyer.page, s = seller.page;
  await buyer.walkInto(spot.x, spot.z);
  await p.waitForSelector('#deal-text'); await p.waitForTimeout(800); await buyer.shot('05-deal');
  if (!(await p.textContent('.chathead')).includes(sellerName)) bad(`the conversation is headed "${await p.textContent('.chathead')}"`);
  const fits = await buyer.game(() => { const r = document.querySelector('#sheet').getBoundingClientRect(); const f = document.querySelector('#deal-text').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, field: f.height, w: innerWidth, h: innerHeight }; });
  if (fits.left < -1 || fits.right > fits.w + 1 || fits.top < -1 || fits.bottom > fits.h + 1) bad(`on a phone the conversation is at ${JSON.stringify(fits)}`);
  if (fits.field < 40) bad(`the place to type is ${Math.round(fits.field)} px tall`);
  await p.fill('#deal-text', 'Good afternoon. Will you take 140?'); await buyer.press('#deal-send');
  await p.waitForFunction(() => /Will you take 140/.test(document.querySelector('#deal-log').textContent));
  // the seller is told without doing anything, opens the conversation and answers
  await seller.game(() => window.__nlw.market.sync());
  await s.waitForFunction(() => window.__nlw.market.state.unread === 1, null, { timeout: 15000 }).catch(() => bad('the seller is not told of a message'));
  await seller.openProperty(); await s.waitForSelector('.threadrow');
  await seller.shot('11-conversations');
  await s.click(`.threadrow:has-text("${buyerName}")`); await s.waitForSelector('#deal-text');
  await s.waitForFunction(() => /Will you take 140/.test(document.querySelector('#deal-log').textContent));
  await s.fill('#deal-text', '140 is fine.'); await s.keyboard.press('Enter');
  // ...and the buyer reads it without doing anything
  await p.waitForFunction(() => /140 is fine/.test(document.querySelector('#deal-log').textContent), null, { timeout: 15000 }).catch(() => bad('the seller\'s words did not reach the buyer'));
  // an offer made with nothing but the arrival money is refused in the same words, and nothing is set aside
  await p.fill('#deal-amount', '140'); await buyer.press('#deal-buy');
  await buyer.press('#deal-yes');
  await p.waitForSelector('.dealnote', { timeout: 20000 }).catch(() => bad('an offer of starter TR was not answered'));
  const no = (await p.textContent('.dealnote').catch(() => '')).trim();
  if (no !== 'Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases.') bad(`an offer of starter TR is answered "${no}"`);
  if (await p.isVisible('#deal-withdraw')) bad('an offer was made with starter TR');
  await buyer.has(2000, 'after an offer of starter TR was refused');
  await buyer.shot('05b-starter-refused');
  // paid 840 TR for work: 2,000 of starter TR and 840 earned
  await teller.pay(buyerName, 840, 'for the work');
  await buyer.game(() => window.__nlw.wallet.refresh());
  await buyer.has(2840, 'after being paid 840 TR');
  await buyer.made(2840, 2000, 'after being paid 840 TR');
  await p.fill('#deal-amount', '140'); await buyer.press('#deal-buy');
  const ask = await p.textContent('#deal-bar');
  if (!/Offer 140 TR for the HOLARIS Wristwatch No\. 1 of 10\?/.test(ask) || !/your 840 TR of earned TR/.test(ask)) bad(`offering asks "${ask}"`);
  await buyer.shot('06-confirm');
  await buyer.press('#deal-yes'); await p.waitForSelector('#deal-withdraw');
  const held = await buyer.game(() => ({ balance: window.__nlw.view.self.balance, held: window.__nlw.market.held().held }));
  if (held.balance !== 2700 * TR || held.held !== 140 * TR) bad(`with 140 TR offered the buyer has ${held.balance / TR} TR and ${held.held / TR} TR set aside`);
  await buyer.has(2700, 'with 140 TR set aside for an offer');
  // what is set aside came out of what was earned
  await buyer.made(2700, 2000, 'with 140 TR set aside for an offer');
  await buyer.shot('07-waiting');
  offerShown = await s.waitForSelector('#deal-sell', { timeout: 20000 }).then(() => true, () => false);
  if (!offerShown) bad('the seller is not shown the offer');
}

say('7. The seller presses Sell property and confirms: the watch and the 140 TR change hands, once');
if (offerShown) {
  const p = buyer.page, s = seller.page;
  await seller.shot('12-offer');
  await s.click('#deal-sell');
  const ask = await s.textContent('#deal-bar');
  if (!ask.includes(`Sell your HOLARIS Wristwatch No. 1 of 10 to ${buyerName} for 140 TR?`)) bad(`selling asks "${ask}"`);
  await seller.shot('13-confirm');
  await s.click('#deal-yes'); await s.waitForSelector('#deal-done');
  await seller.shot('14-sold');
  await seller.has(2540, 'after selling for 140 TR (2,500 - 100 + 140)');
  await seller.made(2540, 2000, 'after selling for 140 TR');
  await p.waitForFunction(() => window.__nlw.market.held().held === 0, null, { timeout: 30000 }).catch(() => bad('the buyer\'s game did not learn of the sale'));
  await p.waitForTimeout(600); await buyer.shot('08-bought');
  await buyer.has(2700, 'after buying for 140 TR');
  await buyer.made(2700, 2000, 'after buying for 140 TR');
  await buyer.press('#deal-back'); await p.waitForTimeout(600);
  await buyer.openProperty(); await p.waitForSelector('.assetcard');
  if (!/No\. 1 of 10/.test(await p.textContent('.assetcard'))) bad(`the buyer's Property shows "${await p.textContent('.assetcard')}"`);
  await buyer.shot('09-owned');
  await s.click('#deal-back'); await s.waitForTimeout(600);
  await seller.openProperty();
  await s.waitForFunction(() => { const hist = document.querySelector('#market-history'); return hist && /Sold to/.test(hist.textContent); }, null, { timeout: 30000 }).catch(() => {});
  if (await s.isVisible('.assetcard')) bad('the seller still has the watch');
  const history = await s.textContent('#market-history');
  if (!history.includes(`Sold to ${buyerName}`) || !/\+140 TR/.test(history) || !/Bought from HOLARIS Watch/.test(history)) bad(`the seller's history reads "${history}"`);
  await seller.shot('15-history');
  // the marker has gone from both towns; pressing again changes nothing
  for (const d of [seller, buyer]) { const left = await d.game(async () => { await window.__nlw.refreshDealMarkers(); await window.__nlw.market.sync(); await window.__nlw.market.sync(); return { markers: [...window.__nlw.dealMarkers.values()].filter((m) => !(m.listing.asset && m.listing.asset.category === 'motorcycle')).map((m) => m.listing.name), balance: window.__nlw.view.self.balance }; }); if (left.markers.length !== 1) bad(`${d.label}: markers left are ${JSON.stringify(left.markers)}`); if (left.balance !== (d === seller ? 2540 : 2700) * TR) bad(`${d.label}: a second round changed the balance to ${left.balance / TR}`); }
  const ledgers = await Promise.all([seller, buyer].map((d) => d.game(() => window.__nlw.host.auditor.reconcile().length)));
  if (ledgers.some((n) => n)) bad(`a ledger does not reconcile: ${ledgers}`);
}


// ------------------------------------------------------------------ the Wallet --
say('8. The buyer sends 250.5 TR to the seller in the Wallet');
{
  const p = buyer.page, s = seller.page;
  await buyer.openWallet(); await p.waitForTimeout(600);
  await buyer.shot('10-wallet');
  const home = await buyer.game(() => ({ balance: document.querySelector('#wallet-balance').textContent, username: document.querySelector('#wallet-username').textContent, send: document.querySelector('#wallet-send').textContent.trim(), receive: document.querySelector('#wallet-receive').textContent.trim(), history: document.querySelector('#wallet-history').getAttribute('aria-label'), copy: document.querySelector('#wallet-copy').getAttribute('aria-label'), words: document.querySelector('.page[data-app="wallet"]').innerText }));
  if (!/2,700/.test(home.balance)) bad(`the Wallet shows "${home.balance}"; the buyer has 2,700 TR`);
  // what the balance is made of, small, under it: the total, the starter TR, and what can be sent or spent
  const made = await buyer.game(() => { const box = document.querySelector('#wallet-parts'); if (!box) return null; const line = document.querySelector('#wallet-eligible-line').textContent; box.open = true; const t = (id) => (document.querySelector(id) ? document.querySelector(id).textContent.trim() : null); const out = { line, total: t('#wallet-total'), starter: t('#wallet-starter'), eligible: t('#wallet-eligible'), words: box.innerText }; return out; });
  if (!made) bad('the Wallet does not say what the balance is made of');
  else {
    if (!/^700 TR can be sent or spent on assets$/.test(made.line.trim())) bad(`under the balance the Wallet says "${made.line}"`);
    if (made.total !== '2,700 TR' || made.starter !== '2,000 TR' || made.eligible !== '700 TR') bad(`the Wallet sets the balance out as ${JSON.stringify(made)}`);
    if (!/Total/.test(made.words) || !/Starter TR/.test(made.words) || !/Earned TR \(eligible\)/.test(made.words)) bad(`the breakdown is labelled "${made.words.slice(0, 200)}"`);
  }
  await buyer.shot('10b-wallet-parts');
  await buyer.game(() => { document.querySelector('#wallet-parts').open = false; });
  if (home.username.replace(/^@/, '') !== buyerName) bad(`the Wallet names the account "${home.username}"`);
  if (!/^send$/i.test(home.send) || !/^receive$/i.test(home.receive)) bad(`the Wallet's two buttons read "${home.send}" and "${home.receive}"`);
  if (!home.history || !home.copy) bad('the history and copy buttons have no names for a screen reader');
  if (/sandbox|add funds|faucet/i.test(home.words)) bad('the Wallet still speaks of adding funds');
  await buyer.press('#wallet-copy');
  await p.waitForFunction(() => /Username copied/.test(document.querySelector('#wallet-copied').textContent), null, { timeout: 10000 }).catch(() => bad('copying the username does not say "Username copied"'));
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  if (clip !== null && clip !== buyerName) bad(`what was copied is "${clip}"`);
  await buyer.press('#wallet-receive'); await p.waitForSelector('#receive-username');
  if ((await p.textContent('#receive-username')).replace(/^@/, '') !== buyerName) bad(`Receive shows "${await p.textContent('#receive-username')}"`);
  await buyer.shot('11-receive');
  await buyer.press('#page-back'); await p.waitForSelector('#wallet-send');
  await buyer.press('#wallet-send'); await p.waitForSelector('#send-form');
  const told = async () => p.evaluate(() => { const e = document.querySelector('#send-problem'); return e && !e.hidden ? e.textContent : ''; });
  // nothing typed; nobody of that name; oneself; more than there is; not an amount
  await buyer.press('#send-continue'); await p.waitForTimeout(300);
  if (!(await told())) bad('sending with nothing typed is not answered');
  await p.fill('#send-username', `nobody_${tag}`); await p.fill('#send-amount', '10'); await buyer.press('#send-continue');
  await p.waitForFunction(() => { const e = document.querySelector('#send-problem'); return e && !e.hidden && /Username not found/.test(e.textContent); }, null, { timeout: 15000 }).catch(() => {});
  if ((await told()) !== 'Username not found. You can only send TR to registered users.') bad(`a username nobody has is answered "${await told()}"`);
  await buyer.shot('12-nobody');
  for (const [who, amount, why] of [[buyerName, '10', 'oneself'], [sellerName, '5000', 'more than there is'], [sellerName, '0', 'nothing'], [sellerName, '-5', 'less than nothing'], [sellerName, '1.25', 'a quarter of a TR']]) {
    await p.fill('#send-username', who); await p.fill('#send-amount', amount); await buyer.press('#send-continue');
    await p.waitForTimeout(1200);
    if (await p.isVisible('#send-confirm')) { bad(`sending to ${why} got as far as the confirmation`); await buyer.press('#send-cancel'); await p.waitForSelector('#send-form'); } else if (!(await told())) bad(`sending ${why} is not answered`);
  }
  await buyer.has(2700, 'after five refused sends');
  // The form says what can be sent before anything is typed. 800 TR is less than the balance (2,700) and more
  // than what was earned (700): it is refused, and the reason given is the starter TR, not the balance.
  const can = await buyer.game(() => ({ can: document.querySelector('#send-can') ? document.querySelector('#send-can').textContent : '', note: document.querySelector('#send-starter-note') ? document.querySelector('#send-starter-note').textContent : '' }));
  if (!/You can send 700 TR/.test(can.can) || !/2,000 TR of it is starter TR, which cannot be transferred/.test(can.note)) bad(`the send form says ${JSON.stringify(can)}`);
  await p.fill('#send-username', sellerName); await p.fill('#send-amount', '800'); await buyer.press('#send-continue');
  await p.waitForFunction(() => { const e = document.querySelector('#send-problem'); return e && !e.hidden && e.textContent.length > 0; }, null, { timeout: 15000 }).catch(() => {});
  const over = await told();
  await buyer.shot('12b-eligible');
  if (await p.isVisible('#send-confirm')) { bad('sending 800 TR with 700 TR earned got as far as the confirmation'); await buyer.press('#send-cancel'); await p.waitForSelector('#send-form'); }
  if (!over.startsWith('You do not have enough eligible TR for this transaction.') || !over.includes('Starter TR cannot be transferred. Earn TR through gameplay to send money to other players.')) bad(`sending 800 TR with 700 TR earned is answered "${over}"`);
  if (/do not have that much|balance is too|insufficient/i.test(over)) bad(`sending 800 TR with 2,700 TR in the wallet is answered as if the balance were too small: "${over}"`);
  await buyer.has(2700, 'after a send of more than was earned was refused');
  // the real one: the capitals in the name do not matter, and nothing moves until it is confirmed
  await p.fill('#send-username', sellerName.toUpperCase()); await p.fill('#send-amount', '250.5'); await p.fill('#send-note', 'for the cement');
  await buyer.press('#send-continue'); await p.waitForSelector('#send-confirm');
  await buyer.shot('13-confirm');
  const sum = await p.textContent('#send-summary');
  if (!sum.includes(sellerName) || !/250\.5 TR/.test(sum) || !/Fee/i.test(sum) || !/Total/i.test(sum)) bad(`the confirmation reads "${sum}"`);
  if (!/Fee\D*0 TR|No fee|None/i.test(sum)) bad(`the confirmation's fee is not "none": "${sum}"`);
  if ((await p.textContent('#send-confirm')).trim() !== 'Confirm Transfer' || (await p.textContent('#send-cancel')).trim() !== 'Cancel') bad('the confirmation\'s buttons are not Confirm Transfer and Cancel');
  await buyer.has(2700, 'with a transfer waiting to be confirmed');
  await buyer.press('#send-cancel'); await p.waitForSelector('#send-form');
  await buyer.has(2700, 'after cancelling a transfer');
  await buyer.press('#send-continue'); await p.waitForSelector('#send-confirm');
  // pressed twice in a hurry: one transfer
  await p.evaluate(() => { const b = document.querySelector('#send-confirm'); b.click(); b.click(); });
  await p.waitForSelector('#send-done'); await buyer.shot('14-sent');
  const done = await p.textContent('.page[data-app="wallet"]');
  if (!/250\.5 TR sent/.test(done) || !done.includes(sellerName) || !/TR-[0-9A-Z]{10}/.test(done) || !/for the cement/.test(done)) bad(`the receipt reads "${done}"`);
  await buyer.has(2449.5, 'after sending 250.5 TR');
  // what was sent was earned TR: the arrival money has not moved
  await buyer.made(2449.5, 2000, 'after sending 250.5 TR');
  await buyer.press('#send-keep'); await p.waitForTimeout(800);
  await buyer.press('#send-finish'); await p.waitForSelector('#wallet-people');
  if (!(await p.textContent('#wallet-people')).includes(sellerName)) bad(`the saved beneficiaries are "${await p.textContent('#wallet-people')}"`);
  await buyer.press('#wallet-history'); await p.waitForSelector('#wallet-entries');
  await buyer.shot('15-history');
  const lines = await p.textContent('#wallet-entries');
  if (!lines.includes(sellerName) || !/250\.5/.test(lines) || !/Arriv|Welcome|2,000/i.test(lines)) bad(`the buyer's history reads "${lines}"`);
  // the seller is told, and has it: in the bank and in the purse
  await seller.game(() => window.__nlw.ui.close()); await seller.game(() => window.__nlw.market.sync());
  await seller.has(2790.5, 'after receiving 250.5 TR (2,540 + 250.5)');
  // TR received from another player is earned TR: it arrives as what it was when it left
  await seller.made(2790.5, 2000, 'after receiving 250.5 TR');
  await seller.openWallet(); await s.waitForTimeout(600); await seller.shot('16-received');
  if (!/2,790\.5/.test(await s.textContent('#wallet-balance'))) bad(`the seller's Wallet shows "${await s.textContent('#wallet-balance')}"`);
  await seller.press('#wallet-history'); await s.waitForSelector('#wallet-entries');
  const got = await s.textContent('#wallet-entries');
  if (!got.includes(buyerName) || !/\+\s?250\.5/.test(got) || !/for the cement/.test(got)) bad(`the seller's history reads "${got}"`);
  await seller.game(() => window.__nlw.ui.close()); await buyer.game(() => window.__nlw.ui.close());
  // a browser that says it has more than it has: the bank goes by its own books, not by what it is told
  const lie = await buyer.game(async (to) => { const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1' }, body: JSON.stringify({ op: 'wallet.send', username: to, amount: '5000', balance: 99999999, key: crypto.randomUUID() }) }); return { status: r.status, body: await r.json().catch(() => null) }; }, sellerName);
  if (lie.status !== 409 || !lie.body || (lie.body.code || (lie.body.error && lie.body.error.code)) !== 'FUNDS') bad(`sending 5,000 TR with a made-up balance was answered ${JSON.stringify(lie)}`);
  await buyer.has(2449.5, 'after a send the bank refused');
  // ...and nor by what it is told the TR is: 800 TR, said to be earned, from a wallet with 449.5 TR earned
  const dressed = await buyer.api({ op: 'wallet.send', username: sellerName, amount: '800', eligible: 99999999, starter: 0, bucket: 'earned', source: 'earned', key: crypto.randomUUID() });
  if (dressed.status !== 409 || dressed.code !== 'ELIGIBLE_FUNDS') bad(`sending 800 TR said to be earned was answered ${JSON.stringify(dressed)}`);
  await buyer.made(2449.5, 2000, 'after a send of starter TR dressed as earned');
  await seller.made(2790.5, 2000, 'after the buyer\'s refused sends');
  const all = await Promise.all([seller, buyer].map((d) => d.game(() => window.__nlw.host.auditor.reconcile().length)));
  if (all.some((n) => n)) bad(`after the transfer a ledger does not reconcile: ${all}`);
}

// ------------------------------------------------------------------ the same account elsewhere --
say('9. The buyer logs in on a computer: straight into town as the same character, the watch, the same money');
{
  await buyer.game(() => window.__nlw.accountSync.upload());
  // (the buyer's first device is done with: closed, so that this machine draws two towns at a time, not three)
  await buyer.context.close();
  const other = await device('buyer2', { width: 1280, height: 760 });
  const p = other.page;
  await p.click('#open-login');
  await p.fill('#account-username', buyerName); await p.fill('#account-password', 'not the password'); await p.click('#account-submit');
  await p.waitForFunction(() => /do not match/.test(document.querySelector('#account-error').textContent), null, { timeout: 20000 }).catch(() => bad('a wrong password is not refused'));
  if ((await other.game(() => window.__nlw.online.status().state)) !== 'out') bad('a wrong password signed someone in');
  // someone who has a character is taken into the town: nothing to choose, nothing to answer, nothing to press
  await watchStart(other);
  await p.fill('#account-password', 'a password for the buyer'); await p.click('#account-submit');
  await p.waitForFunction(() => window.__nlw.online.status().state === 'in');
  await p.waitForTimeout(300); await other.shot('01-logged-in');
  await p.waitForFunction(() => window.__nlw.view && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 120000 }).catch(() => bad('after logging in, someone with a character was not taken into the town'));
  await p.waitForTimeout(1000);
  await clearTown(other, 'after logging in on a second device');
  const shown = await offered(other);
  if (shown.length) bad(`logging in with a character, the player was offered: ${shown.join(', ')}`);
  const home = await other.game(() => ({ name: window.__nlw.view.self.name, path: window.__nlw.view.self.path, figure: window.__nlw.view.self.look.figure, account: window.__nlw.online.account.figure }));
  if (home.name !== 'Buyer Okafor' || home.path !== 'hero' || home.figure !== 'W1' || home.account !== 'W1') bad(`on the second device the player is ${JSON.stringify(home)}`);
  await other.has(2449.5, 'on the second device');
  await other.made(2449.5, 2000, 'on the second device');
  await other.openProperty(); await p.waitForSelector('.assetcard');
  // the model itself, fetched only when asked for
  await p.click('.assetcard'); await p.waitForSelector('#load-model');
  const fetched = [];
  p.on('request', (r) => { if (/watch\.glb/.test(r.url())) fetched.push(r.url()); });
  await p.click('#load-model');
  const live = await p.waitForSelector('.viewer.live canvas', { timeout: 420000 }).then(() => true, () => false);
  if (!live) bad(`the model itself was not shown: "${await p.textContent('#model-status').catch(() => '')}"`);
  else { await p.waitForTimeout(3500); await other.shot('02-model'); }
  if (fetched.length !== 1) bad(`the model was asked for ${fetched.length} times`);
  await other.game(() => window.__nlw.ui.close()); await p.waitForTimeout(500);

  // ---- the characters: looking is free and changes nothing; an upgrade that cannot be paid for is not had ----
  say('9b. ...looks at the other character, and asks for an upgrade there is not the earned TR for');
  const spot0 = await other.game(() => ({ x: window.__nlw.view.self.x, z: window.__nlw.view.self.z }));
  await openCharacters(other);
  await other.shot('02b-characters');
  const own = await other.game(() => ({ tag: document.querySelector('#gallery-tag').textContent, text: document.querySelector('#gallery-text').textContent, upgrade: !document.querySelector('#gallery-upgrade').hidden, back: document.querySelector('#gallery-back').textContent.trim(), rule: document.querySelector('#gallery-rule').textContent, shown: window.__creator.shown.id, name: [...document.querySelectorAll('#start input')].some((e) => e.getBoundingClientRect().width > 0), enter: document.querySelector('#enter').getBoundingClientRect().width > 0 }));
  if (own.tag !== 'Your character' || own.shown !== 'W1' || own.upgrade) bad(`the characters open on ${JSON.stringify(own)}`);
  if (own.name || own.enter) bad('looking at the characters offers a name to type or a way to enter as one');
  if (!/more than 2,000 TR/.test(own.rule) || !/a quarter of your whole balance/.test(own.rule) || !/starter TR pays none of it/.test(own.rule)) bad(`the rule for upgrading reads "${own.rule}"`);
  await p.click('#fig-dots button[aria-label^="Emeka,"]'); await p.waitForFunction(() => !document.querySelector('#gallery-upgrade').hidden);      // (Emeka: one of the other characters, there are six) await p.waitForTimeout(500);
  await other.shot('02c-another');
  const another = await other.game(() => ({ tag: document.querySelector('#gallery-tag').textContent, text: document.querySelector('#gallery-text').textContent, upgrade: document.querySelector('#gallery-upgrade').textContent.trim(), shown: window.__creator.shown.id }));
  if (another.tag !== 'Looking only' || another.shown !== 'M1' || another.upgrade !== 'Upgrade to Emeka' || !/You are still Adaeze's/.test(another.text)) bad(`the other character is shown as ${JSON.stringify(another)}`);
  // looked at, turned, left: the player is who they were, at the bank, in the town and on this device
  const lookedAt = { ...(await who(other)), kept: await other.game(() => JSON.parse(localStorage.getItem('nlw-prefs-v1') || '{}').look) };
  if (lookedAt.account !== 'W1' || lookedAt.town !== 'W1' || (lookedAt.kept && lookedAt.kept.figure && lookedAt.kept.figure !== 'W1')) bad(`looking at Emeka changed who the player is: ${JSON.stringify(lookedAt)}`);
  // 2,449.5 TR is more than 2,000, so an upgrade may be asked for: it is 612 TR (a quarter of 2,449.5, to the
  // half TR, rounded down), and only 449.5 TR of the balance was earned. It is not to be had, the figures and
  // the actual reason are shown, and there is nothing to confirm.
  await p.click('#gallery-upgrade'); await p.waitForSelector('#confirm:not([hidden])'); await p.waitForTimeout(400);
  await other.shot('02d-upgrade-refused');
  const no = { ...(await asked(other)), rows: await rowsOf(other) };
  if (no.title !== 'Upgrade Character' || no.yes !== null || no.no !== 'Close') bad(`an upgrade that cannot be paid for offers ${JSON.stringify({ title: no.title, yes: no.yes, no: no.no })}`);
  if (!no.body.startsWith('You do not have enough eligible TR for this transaction.') || !/The upgrade is 612 TR, and 449\.5 TR of what you have is TR you have earned\./.test(no.body) || !/Starter TR cannot pay for a character upgrade/.test(no.body)) bad(`an upgrade that cannot be paid for is explained "${no.body}"`);
  if (/do not have that much|insufficient balance/i.test(no.body)) bad('an upgrade short of earned TR is explained as too small a balance');
  if (no.rows['Current character'] !== 'Adaeze' || no.rows['New character'] !== 'Emeka' || no.rows['Current balance'] !== '2,449.5 TR' || no.rows['Upgrade fee'] !== '612 TR' || no.rows['Balance after upgrade'] !== '1,837.5 TR' || no.rows['TR you have earned'] !== '449.5 TR') bad(`the upgrade's figures read ${JSON.stringify(no.rows)}`);
  await p.click('#confirm-no'); await p.waitForSelector('#confirm', { state: 'hidden' });
  // asked of the server directly, with the fee it would be, with a fee of nothing, and with a made-up balance
  for (const [what, body] of [['the fee it would be', { fee: 1224 }], ['a fee of half a TR', { fee: 1 }], ['a made-up balance', { fee: 1224, balance: 99999999, eligible: 99999999, starter: 0 }]]) {
    const direct = await other.api({ op: 'character.upgrade', figure: 'M1', key: crypto.randomUUID(), ...body });
    if (direct.status !== 409 || direct.code !== 'ELIGIBLE_FUNDS') bad(`an upgrade asked for directly with ${what} was answered ${JSON.stringify({ status: direct.status, code: direct.code })}`);
  }
  const free = await other.api({ op: 'character.choose', figure: 'M1' });
  if (free.status !== 409 || free.code !== 'CHOSEN') bad(`choosing another character directly was answered ${JSON.stringify({ status: free.status, code: free.code })}`);
  await other.made(2449.5, 2000, 'after an upgrade that could not be paid for');
  const unchanged = await who(other);
  if (unchanged.account !== 'W1' || unchanged.town !== 'W1') bad(`after an upgrade that could not be paid for the player is ${JSON.stringify(unchanged)}`);
  await p.click('#gallery-back');
  await p.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.mode === 'walking'); await p.waitForTimeout(600);
  const back0 = await other.game(() => ({ x: window.__nlw.view.self.x, z: window.__nlw.view.self.z, figure: window.__nlw.me.figure }));
  if (back0.figure !== 'W1' || Math.hypot(back0.x - spot0.x, back0.z - spot0.z) > 3) bad(`coming back from the characters, the player is ${JSON.stringify(back0)} (was at ${JSON.stringify(spot0)})`);

  // logging out is asked first: Cancel and Escape leave everything as it was
  say('10. Logging out asks first');
  await other.game(() => window.__nlw.ui.openPhone('settings')); await p.waitForSelector('#settings-logout');
  if ((await p.textContent('#settings-username')) !== buyerName) bad('Settings does not say who is signed in');
  await p.click('#settings-logout'); await p.waitForSelector('#confirm:not([hidden])');
  await other.shot('03-logout-asked');
  const asked2 = await other.game(() => ({ title: document.querySelector('#confirm-title').textContent, body: document.querySelector('#confirm-body').textContent, no: document.querySelector('#confirm-no').textContent.trim(), yes: document.querySelector('#confirm-yes').textContent.trim(), role: document.querySelector('#confirm [role]') ? document.querySelector('#confirm [role]').getAttribute('role') : document.querySelector('#confirm').getAttribute('role'), state: window.__nlw.online.status().state }));
  if (asked2.title !== 'Log out of your account?') bad(`logging out asks "${asked2.title}"`);
  if (asked2.body !== 'You will be signed out of the game. Your saved progress will remain available when you log in again.') bad(`logging out explains "${asked2.body}"`);
  if (asked2.no !== 'Cancel' || asked2.yes !== 'Log Out') bad(`logging out offers "${asked2.no}" and "${asked2.yes}"`);
  if (asked2.state !== 'in') bad('the account was signed out before the question was answered');
  await p.click('#confirm-no'); await p.waitForSelector('#confirm', { state: 'hidden' });
  await p.waitForTimeout(500);
  if ((await other.game(() => window.__nlw.online.status().state)) !== 'in') bad('Cancel signed the account out');
  await p.click('#settings-logout'); await p.waitForSelector('#confirm:not([hidden])');
  await p.keyboard.press('Escape'); await p.waitForSelector('#confirm', { state: 'hidden' });
  if ((await other.game(() => window.__nlw.online.status().state)) !== 'in') bad('Escape signed the account out');
  await p.click('#settings-logout'); await p.waitForSelector('#confirm:not([hidden])');
  await p.click('#confirm-yes');
  await p.waitForFunction(() => window.__nlw.online.status().state === 'out', null, { timeout: 30000 });
  await p.waitForTimeout(800); await other.shot('04-logged-out');
  const gone = await other.game(() => ({ playerId: window.__nlw.playerId, start: !document.querySelector('#start').hidden, kept: !!localStorage.getItem('nlw-save-v5-NG-AN-OGB-Z1'), signup: !document.querySelector('#open-signup').hidden, gate: document.querySelector('#start').dataset.gate, may: window.__nlw.mayEnter(), bank: window.__nlw.wallet.state.balance }));
  if (gone.playerId || !gone.start || gone.kept || !gone.signup) bad(`after logging out: ${JSON.stringify(gone)}`);
  if (gone.gate !== 'shut' || gone.may) bad(`after logging out the town is not shut (${gone.gate})`);
  if (await p.isVisible('#account')) await p.click('#account-back');
  // signed out, the server gives nothing: not the save, not the wallet, not the character
  const shut = await other.game(async () => { const ask = async (op) => { const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1' }, body: JSON.stringify({ op, figure: 'M1', key: crypto.randomUUID(), fee: 1 }) }); return r.status; }; return { save: await ask('save.get'), wallet: await ask('wallet.get'), history: await ask('wallet.history'), character: await ask('character.get'), upgrade: await ask('character.upgrade') }; });
  if (shut.save !== 401 || shut.wallet !== 401 || shut.history !== 401 || shut.character !== 401 || shut.upgrade !== 401) bad(`signed out, the server answered ${JSON.stringify(shut)}`);
  // the back button does not bring the town back
  await p.goBack().catch(() => {}); await p.waitForTimeout(800);
  const backed = await p.evaluate(() => ({ hud: !!(document.querySelector('#hud') && !document.querySelector('#hud').hidden), nlw: !!window.__nlw })).catch(() => ({ hud: false, nlw: false }));
  if (backed.hud) bad('after logging out, going back shows the town');
  // logging in again: the same character and the progress, and again nothing is asked
  await p.goto(`${origin}/#nointro-lite`, { timeout: 300000 });
  await p.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await p.waitForFunction(() => window.__nlw.online.status().state === 'out', null, { timeout: 300000 });
  await watchStart(other);
  await p.click('#open-login'); await p.fill('#account-username', buyerName); await p.fill('#account-password', 'a password for the buyer'); await p.click('#account-submit');
  await p.waitForFunction(() => window.__nlw.view && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 120000 }).catch(() => bad('after logging in again the player was not taken into the town'));
  await clearTown(other, 'after logging in again');
  const again = await offered(other);
  if (again.length) bad(`logging in again, the player was offered: ${again.join(', ')}`);
  const same = await other.game(() => (window.__nlw.view ? { name: window.__nlw.view.self.name, figure: window.__nlw.view.self.look.figure, path: window.__nlw.view.self.path } : null));
  if (!same || same.name !== 'Buyer Okafor' || same.figure !== 'W1' || same.path !== 'hero') bad(`after logging in again the player is ${JSON.stringify(same)}`);
  await other.context.close();
}

// ------------------------------------------------------------------ a character upgrade, paid for --
say('10b. The seller, with 2,790.5 TR of which 790.5 TR was earned, upgrades from Adaeze to Emeka for 697.5 TR');
{
  const p = seller.page;
  await seller.game(() => window.__nlw.ui.close());
  await seller.made(2790.5, 2000, 'before the upgrade');
  await openCharacters(seller);
  await p.click('#fig-dots button[aria-label^="Emeka,"]'); await p.waitForFunction(() => !document.querySelector('#gallery-upgrade').hidden);      // (Emeka: one of the other characters, there are six) await p.waitForTimeout(400);
  await p.click('#gallery-upgrade'); await p.waitForSelector('#confirm:not([hidden])'); await p.waitForTimeout(400);
  await seller.shot('16b-upgrade-asked');
  const ask = { ...(await asked(seller)), rows: await rowsOf(seller) };
  if (ask.title !== 'Upgrade Character' || ask.yes !== 'Confirm Upgrade' || ask.no !== 'Cancel') bad(`the upgrade offers ${JSON.stringify({ title: ask.title, yes: ask.yes, no: ask.no })}`);
  if (ask.body !== 'Upgrading changes your permanent character. You will need to pay another upgrade fee to change it again.') bad(`the upgrade is explained "${ask.body}"`);
  // a quarter of 2,790.5 TR is 697.625 TR: to the half TR, rounded down, 697.5 TR
  const want = { 'Current character': 'Adaeze', 'New character': 'Emeka', 'Current balance': '2,790.5 TR', 'Upgrade fee': '697.5 TR', 'Balance after upgrade': '2,093 TR' };
  for (const [label, value] of Object.entries(want)) if (ask.rows[label] !== value) bad(`the upgrade's "${label}" reads "${ask.rows[label]}"; it should be "${value}"`);
  // Cancel: nothing is charged and nobody changes
  await p.click('#confirm-no'); await p.waitForSelector('#confirm', { state: 'hidden' });
  await seller.made(2790.5, 2000, 'after cancelling an upgrade');
  let now = await who(seller);
  if (now.account !== 'W1' || now.town !== 'W1') bad(`after cancelling an upgrade the player is ${JSON.stringify(now)}`);
  // the price is the server's: a fee of the browser's own choosing changes nothing and charges nothing
  for (const fee of [1, 2, 1394]) {
    const cheap = await seller.api({ op: 'character.upgrade', figure: 'M1', key: crypto.randomUUID(), fee });
    if (cheap.status !== 409 || cheap.code !== 'QUOTE_CHANGED') bad(`an upgrade asked for directly at ${fee / 2} TR was answered ${JSON.stringify({ status: cheap.status, code: cheap.code })}`);
  }
  const nofee = await seller.api({ op: 'character.upgrade', figure: 'M1', key: crypto.randomUUID() });
  if (nofee.status !== 400) bad(`an upgrade asked for directly with no fee was answered ${nofee.status} ${nofee.code}`);
  await seller.made(2790.5, 2000, 'after upgrades asked for at made-up fees');
  now = await who(seller);
  if (now.account !== 'W1' || now.town !== 'W1') bad(`after upgrades asked for at made-up fees the player is ${JSON.stringify(now)}`);
  // the real one, pressed twice in a hurry: one upgrade, one fee
  await p.click('#gallery-upgrade'); await p.waitForSelector('#confirm:not([hidden])'); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.querySelector('#confirm-yes'); b.click(); b.click(); });
  await p.waitForFunction(() => !document.querySelector('#hud').hidden && document.querySelector('#confirm').hidden, null, { timeout: 60000 }).catch(() => bad('after Confirm Upgrade the player was not returned to the town'));
  await p.waitForTimeout(1200); await seller.shot('16c-upgraded');
  now = await who(seller);
  if (now.account !== 'M1' || now.town !== 'M1' || now.drawn !== 'M1') bad(`after the upgrade the player is ${JSON.stringify(now)}`);
  await seller.has(2093, 'after an upgrade costing 697.5 TR');
  // the fee came out of what was earned; the arrival money is as it was
  await seller.made(2093, 2000, 'after an upgrade costing 697.5 TR');
  const record = await seller.api({ op: 'character.get' });
  const changes = (record.body && record.body.changes) || [];
  if (changes.length !== 1 || changes[0].from !== 'W1' || changes[0].to !== 'M1' || changes[0].fee !== 697.5 * TR || changes[0].total !== 2790.5 * TR || !/^TR-[0-9A-Z]{10}$/.test(changes[0].ref || '') || !changes[0].at) bad(`the record of the upgrade is ${JSON.stringify(changes)}`);
  await seller.openWallet(); await seller.press('#wallet-history'); await p.waitForSelector('#wallet-entries');
  const lines = await p.textContent('#wallet-entries');
  await seller.shot('16d-upgrade-history');
  if (!/Character upgrade/.test(lines) || !/Adaeze to Emeka/.test(lines) || !/697\.5 TR/.test(lines) || (changes[0] && !lines.includes(changes[0].ref))) bad(`the seller's history does not show the upgrade: "${lines}"`);
  await seller.game(() => window.__nlw.ui.close());
  // changing back is another upgrade, at another fee: it is not free, and not at the fee already paid
  const backFree = await seller.api({ op: 'character.choose', figure: 'W1' });
  if (backFree.status !== 409 || backFree.code !== 'CHOSEN') bad(`changing back by choosing was answered ${JSON.stringify({ status: backFree.status, code: backFree.code })}`);
  const quote = await seller.api({ op: 'character.quote', figure: 'W1' });
  if (!quote.body || !quote.body.quote || quote.body.quote.fee !== 1046 || quote.body.quote.ok !== false || quote.body.quote.code !== 'ELIGIBLE_FUNDS') bad(`changing back is quoted ${JSON.stringify(quote.body && quote.body.quote)}`);
  // after a reload: straight into town, the new character
  await seller.game(() => window.__nlw.accountSync.upload());
  await p.reload({ timeout: 300000 });
  await p.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await p.waitForFunction(() => window.__nlw.view && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 120000 }).catch(() => bad('after a reload the upgraded player was not taken into the town'));
  now = await who(seller);
  if (now.account !== 'M1' || now.town !== 'M1' || now.drawn !== 'M1') bad(`after a reload the upgraded player is ${JSON.stringify(now)}`);
  await clearTown(seller, 'after a reload with a character');
  await seller.has(2093, 'after a reload');
}

// ------------------------------------------------------------------ erasing a saved game --
say('11. Erasing a saved game asks first; the journey goes, the TR, the character and the watch\'s history stay');
{
  const p = seller.page;
  await seller.game(() => window.__nlw.accountSync.upload());
  await seller.game(() => window.__nlw.ui.openPhone('settings')); await p.waitForSelector('#erase-save');
  await p.evaluate(() => document.querySelector('#erase-save').scrollIntoView({ block: 'center' }));
  await p.click('#erase-save'); await p.waitForSelector('#confirm:not([hidden])');
  await seller.shot('17-erase-asked');
  const ask = await seller.game(() => ({ title: document.querySelector('#confirm-title').textContent, body: document.querySelector('#confirm-body').textContent, no: document.querySelector('#confirm-no').textContent.trim(), yes: document.querySelector('#confirm-yes').textContent.trim() }));
  if (ask.title !== 'Erase your saved game?') bad(`erasing asks "${ask.title}"`);
  if (ask.body !== 'This will permanently delete the selected game\'s saved progress and start a new journey. This action cannot be undone.') bad(`erasing explains "${ask.body}"`);
  if (ask.no !== 'Cancel' || ask.yes !== 'Erase Save and Restart') bad(`erasing offers "${ask.no}" and "${ask.yes}"`);
  await p.click('#confirm-no'); await p.waitForSelector('#confirm', { state: 'hidden' }); await p.waitForTimeout(400);
  const kept = await seller.game(() => ({ playing: !document.querySelector('#hud').hidden, name: window.__nlw.view.self.name, local: !!localStorage.getItem('nlw-save-v5-NG-AN-OGB-Z1') }));
  if (!kept.playing || kept.name !== 'Seller Eze' || !kept.local) bad(`after Cancel: ${JSON.stringify(kept)}`);
  await p.click('#erase-save'); await p.waitForSelector('#confirm:not([hidden])');
  await p.click('#confirm-yes');
  await p.waitForFunction(() => document.querySelector('#confirm').hidden && !document.querySelector('#start').hidden, null, { timeout: 30000 }).catch(() => bad('erasing did not go back to the start'));
  await p.waitForTimeout(800); await seller.shot('18-erased');
  const after = await seller.game(async () => { const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1' }, body: JSON.stringify({ op: 'save.get' }) }); const save = await r.json(); const seen = (sel) => { const e = document.querySelector(sel); if (!e) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }; return { state: window.__nlw.online.status().state, player: window.__nlw.playerId || null, local: localStorage.getItem('nlw-save-v5-NG-AN-OGB-Z1') === null, bank: window.__nlw.wallet.state.balance, screen: document.querySelector('#start').dataset.screen, heading: document.querySelector('#start-title').textContent, note: document.querySelector('#locked-note').hidden ? '' : document.querySelector('#locked-note').textContent, shown: window.__creator.shown.id, account: window.__nlw.online.account.figure, asking: window.__nlw.intro.asking(), server: { erased: !!save.erased, data: save.save === null } }; });
  if (after.state !== 'in') bad('erasing signed the account out');
  if (after.player || !after.local) bad(`after erasing: ${JSON.stringify(after)}`);
  if (!after.server.erased || !after.server.data) bad(`the server still has the saved game: ${JSON.stringify(after.server)}`);
  if (after.bank !== 2093 * TR) bad(`erasing changed the bank balance to ${after.bank / TR} TR`);
  // the journey is new; the character is not: it is the account's, and is not chosen again or asked about
  if (after.screen !== 'create' || !/Begin a new journey/.test(after.heading) || after.account !== 'M1' || after.shown !== 'M1' || after.asking) bad(`after erasing, the start screen is ${JSON.stringify({ screen: after.screen, heading: after.heading, account: after.account, shown: after.shown, asking: after.asking })}`);
  if (!/Your character is Emeka's figure/.test(after.note) || !/character upgrade/.test(after.note)) bad(`after erasing, the start screen says of the character: "${after.note}"`);
  // the arrows and the Woman and Man buttons do not make the player someone else
  await p.evaluate(() => { document.querySelector('#fig-next').click(); document.querySelector('#fig-prev').click(); document.querySelector('#genders [data-gender="f"]').click(); });
  await p.waitForTimeout(500);
  if ((await seller.game(() => window.__creator.shown.id)) !== 'M1') bad('on a new journey the arrows changed the account\'s character');
  // a new journey on the same account: the TR is what the bank holds, not a new 2,000, and nobody is asked to choose
  const fresh = await seller.enter('Seller Again');
  if (fresh) bad(`beginning a new journey with a character already chosen asked "${fresh.title}"`);
  const journey = await who(seller);
  if (journey.account !== 'M1' || journey.town !== 'M1' || journey.drawn !== 'M1') bad(`on a new journey the player is ${JSON.stringify(journey)}`);
  await seller.has(2093, 'on a new journey after erasing');
  await seller.made(2093, 2000, 'on a new journey after erasing');
  await seller.openWallet(); await seller.press('#wallet-history'); await p.waitForSelector('#wallet-entries');
  const lines = await p.textContent('#wallet-entries');
  if (!lines.includes(buyerName) || !/250\.5/.test(lines)) bad(`after erasing, the history lost the transfer: "${lines}"`);
  await seller.shot('19-new-journey');
  // reloading does not bring the erased game back: the new journey, straight into town
  await seller.game(() => window.__nlw.accountSync.upload());
  await p.reload({ timeout: 300000 });
  await p.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await p.waitForFunction(() => window.__nlw.view && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 120000 }).catch(() => bad('after a reload the new journey was not gone into'));
  const name = await seller.game(() => (window.__nlw.view ? window.__nlw.view.self.name : null));
  if (name !== 'Seller Again') bad(`after a reload the player is "${name}"`);
  await clearTown(seller, 'after a reload on a new journey');

  // ---- and on a device that has never seen this account: the upgraded character, straight into town ----
  say('11b. The seller logs in on a phone that has never seen the account: Emeka, in town, nothing asked');
  // (the seller's first device is done with: closed, so that this machine draws one town at a time)
  await seller.context.close();
  const phone = await device('seller2', { width: 800, height: 360 }, true);
  const q = phone.page;
  await watchStart(phone);
  // First the character cannot be fetched (the request for it is cut off on the way): the player is told so and
  // given a way to try again. They are not given another character, and are not asked to make one.
  const cut = (route) => { const body = route.request().postData() || ''; return /"op":"save\.get"/.test(body) ? route.abort('failed') : route.continue(); };
  phone.hush(/net::ERR_FAILED/);
  await q.route('**/api/game', cut);
  await phone.press('#open-login');
  await q.fill('#account-username', sellerName); await q.fill('#account-password', 'a password for the seller'); await phone.press('#account-submit');
  await q.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 60000 });
  await q.waitForFunction(() => !document.querySelector('#resume-retry').hidden && document.querySelector('#start').dataset.screen === 'resume', null, { timeout: 90000 }).catch(() => bad('a character that could not be fetched was not answered with a way to try again'));
  await q.waitForTimeout(600); await phone.shot('00-character-not-fetched');
  const trouble = await phone.game(() => { const seen = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; return { text: document.querySelector('#resume-text').textContent, retry: seen('#resume-retry'), enter: seen('#enter'), name: seen('#name'), arrows: seen('#fig-next'), player: window.__nlw.playerId || null, hud: !document.querySelector('#hud').hidden, account: window.__nlw.online.account.figure, top: document.querySelector('#start h1').getBoundingClientRect().top }; });
  if (!/could not be brought to this device/.test(trouble.text) || !/Nothing has been lost, and no new character has been made/.test(trouble.text) || !trouble.retry) bad(`a character that could not be fetched is answered ${JSON.stringify(trouble)}`);
  if (trouble.enter || trouble.name || trouble.arrows || trouble.player || trouble.hud) bad(`with the character not fetched, another was offered or made: ${JSON.stringify(trouble)}`);
  if (trouble.account !== 'M1') bad(`with the character not fetched, the account's character reads ${trouble.account}`);
  // the one thing there is to press looks like something that can be pressed
  const retry = await phone.game(() => { const b = document.querySelector('#resume-retry'); return { color: getComputedStyle(b).color, disabled: b.disabled, text: b.textContent.trim() }; });
  if (retry.color !== 'rgb(255, 255, 255)' || retry.disabled || retry.text !== 'Try again') bad(`the way to try again is ${JSON.stringify(retry)}`);
  const made = await phone.api({ op: 'me' });
  if (!made.body || !made.body.save || made.body.save.name !== 'Seller Again') bad(`with the character not fetched, the account's saved game is ${JSON.stringify(made.body && made.body.save)}`);
  // the connection is back: Retry brings the character, and the player goes in
  await q.unroute('**/api/game', cut);
  phone.hush(null);
  await phone.press('#resume-retry');
  await q.waitForFunction(() => window.__nlw.view && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 180000 }).catch(() => bad('on a new device the seller was not taken into the town'));
  await q.waitForTimeout(1500); await phone.shot('01-in-town');
  await clearTown(phone, 'on a new device, after Retry');
  const seen = await offered(phone);
  if (seen.length) bad(`on a new device the seller was offered: ${seen.join(', ')}`);
  const there = { ...(await who(phone)), name: await phone.game(() => window.__nlw.view.self.name), path: await phone.game(() => window.__nlw.view.self.path) };
  if (there.account !== 'M1' || there.town !== 'M1' || there.drawn !== 'M1' || there.name !== 'Seller Again' || there.path !== 'villain') bad(`on a new device the seller is ${JSON.stringify(there)}`);
  await phone.has(2093, 'on a new device');
  // held sideways, the balance at the top right is whole and clear of the top edge
  const purse = await phone.game(() => { const r = document.querySelector('#hud-balance').getBoundingClientRect(); return { top: r.top, right: innerWidth - r.right, left: r.left, text: document.querySelector('#hud-balance').textContent }; });
  if (purse.top < 5 || purse.right < 0 || purse.left < 0 || !/2,093/.test(purse.text)) bad(`on a phone held sideways the balance is at ${JSON.stringify(purse)}`);
  await phone.context.close();
}

// ------------------------------------------------------------------ the bank's own books --
say('12. The bank\'s books: every movement in two halves, every balance the sum of its lines');
{
  const { database } = require('../../api/_lib/db.js');
  const wallet = require('../../api/_lib/wallet.js');
  const wrong = await wallet.audit(await database());
  if (wrong.length) bad(`the bank does not balance: ${wrong.join('; ')}`);
}

await browser.close();
server.close();
const { closeDatabase } = require('../../api/_lib/db.js');
await closeDatabase();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.map((x) => ` - ${x}`).join('\n')}` : '\nThe site: the account before play, the one question and the one character, starter TR kept from assets and transfers, the market, the deal, the Wallet, the second device, the character upgrade, logging out and erasing all as they should be.');
process.exit(problems.length ? 1 : 0);
