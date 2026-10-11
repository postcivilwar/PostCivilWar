// The whole site in real browsers: the built page, the server and a database, as a player meets them.
//
//   node prototype/build.mjs
//   server/with-postgres.sh node server/test/site.mjs [output-directory]
//
// Two players, each in a browser of their own. Nobody plays without an account: the first thing checked is that
// the town is shut until one is made. One makes an account on a computer, buys a watch at HOLARIS Watch, and
// puts it up for sale. The other, on a phone, finds it in the market, walks into the seller's marker, talks, and
// offers; the seller says yes. Then TR is sent from one to the other in the Wallet; the same account on a second
// device, the model itself, logging out (asked first) and erasing a saved game (asked first; the TR stays).
// Everything is done by pressing what a player presses; what is checked is what the player sees, what each
// game's own ledger holds, and what the bank holds. Needs Playwright with Chromium. Not part of the unit tests.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDevServer } from '../dev.mjs';

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
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*40[01349]|status of 4(00|01|03|04|09|29)/.test(m.text())) bad(`${label}: console: ${m.text()}`); });
  await page.goto(`${origin}/#nointro-lite`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await page.waitForFunction(() => window.__nlw.online.status().state !== 'checking');
  const press = (selector) => (mobile ? page.tap(selector) : page.click(selector));
  const d = {
    label, page, context, press,
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
    async enter(name) {
      await page.fill('#name', name); await press('#enter');
      await page.waitForFunction(() => window.__nlw.view && !document.querySelector('#hud').hidden);
      await page.waitForTimeout(1200);
    },
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
    openProperty: async () => { await page.evaluate(() => window.__nlw.ui.openPhone('property')); await page.waitForSelector('.page[data-app="property"]'); },
  };
  return d;
}

// ------------------------------------------------------------------ the seller, on a computer --
say('1. A player on a computer makes an account');
const seller = await device('seller', { width: 1280, height: 760 });
const sellerName = `Seller_${tag}`;
{
  const p = seller.page;
  // the town is shut: a welcome, Create Account and Log In, and no way in beside them
  const seen = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const row = await seller.game(`(() => { const seen = ${seen.toString()}; return { gate: document.querySelector('#start').dataset.gate, title: document.querySelector('#gate-title').textContent, card: seen('#gate'), signup: document.querySelector('#open-signup').getBoundingClientRect(), login: document.querySelector('#open-login').getBoundingClientRect(), labels: [document.querySelector('#open-signup').textContent, document.querySelector('#open-login').textContent], enter: seen('#enter'), name: seen('#name'), cont: seen('#continue') || seen('#continue-top'), may: window.__nlw.mayEnter(), words: document.querySelector('#start').innerText }; })()`);
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
  await seller.enter('Seller Eze');
}

say('2. ...walks into the pink marker at HOLARIS Watch and buys a watch');
{
  const p = seller.page;
  const markers = await seller.game(async () => { await window.__nlw.refreshDealMarkers(); return [...window.__nlw.dealMarkers.values()].map((m) => ({ name: m.listing.name, x: m.x, z: m.z, visible: m.marker.group.visible })); });
  if (markers.length !== 1 || markers[0].name !== 'HOLARIS Wristwatch') bad(`the markers in town are ${JSON.stringify(markers)}`);
  await seller.openProperty();
  if (!(await p.isVisible('#no-assets'))) bad('a new player is not told they own nothing from the market');
  if ((await p.getAttribute('.pageback', 'id')) !== 'page-back') bad('the Property page has no way back at the top left');
  const back = await p.locator('#page-back').boundingBox();
  if (back.x > 30 || back.y > 30) bad(`the way back is at ${Math.round(back.x)}, ${Math.round(back.y)}`);
  await p.click('#buy-asset'); await p.waitForSelector('.listing');
  await seller.shot('03-market');
  const listed = await seller.game(() => [...document.querySelectorAll('.listing')].map((l) => l.textContent));
  if (listed.length !== 1 || !/HOLARIS Wristwatch/.test(listed[0]) || !/100 TR/.test(listed[0]) || !/10 of 10 left/.test(listed[0])) bad(`the market lists ${JSON.stringify(listed)}`);
  // the photographs are there, and dragging turns the watch
  const turned = await seller.game(async () => { const t = document.querySelector('.listing .turntable'); const before = t.style.backgroundPosition; const r = t.getBoundingClientRect(); const fire = (type, x) => t.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: r.top + 40, pointerId: 7, bubbles: true })); fire('pointerdown', r.left + 100); fire('pointermove', r.left + 20); fire('pointerup', r.left + 20); const img = new Image(); const ok = await new Promise((res) => { img.onload = () => res(img.naturalWidth); img.onerror = () => res(0); img.src = 'assets/watch-turn.webp'; }); return { before, after: t.style.backgroundPosition, width: ok }; });
  if (turned.width !== 2304) bad(`the watch's photographs did not load (${turned.width})`);
  if (turned.before === turned.after) bad('dragging the watch does not turn it');
  // searching: what is there is found; what is not is said not to be there, and nothing is made up
  for (const [q, n] of [['car', 0], ['yacht', 0], ['gun', 0], ['watch', 1], ['WATCHES', 1], ['holaris', 1]]) {
    await p.fill('#market-search', q);
    await p.waitForFunction(([want, query]) => window.__nlw.market.state.query === query && document.querySelectorAll('.listing').length === want, [n, q], { timeout: 15000 }).catch(() => bad(`searching "${q}" does not show ${n}`));
  }
  await p.fill('#market-search', 'car'); await p.waitForSelector('#market-empty'); await seller.shot('04-search-car');
  await p.fill('#market-search', ''); await p.waitForSelector('.listing .btn');
  await p.click('.listing .btn'); await p.waitForSelector('#go-there'); await seller.shot('05-listing');
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
  await p.click('#deal-buy');
  if (!/Pay 100 TR for the HOLARIS Wristwatch\? You have 2,000 TR\./.test(await p.textContent('#deal-bar'))) bad(`buying asks "${await p.textContent('#deal-bar')}"`);
  await p.click('#deal-yes'); await p.waitForSelector('#deal-done');
  await seller.shot('07-bought');
  if (!/It is yours: HOLARIS Wristwatch No\. 1 of 10/.test(await p.textContent('#deal-done'))) bad(`after buying: "${await p.textContent('#deal-done')}"`);
  await seller.has(1900, 'after buying a watch for 100 TR');
  if (!/1,900/.test(await p.textContent('#hud-balance'))) bad(`the purse reads ${await p.textContent('#hud-balance')}`);
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
  await buyer.enter('Buyer Okafor');
  await buyer.openProperty(); await buyer.press('#buy-asset'); await p.waitForSelector('.listing');
  await p.waitForFunction(() => document.querySelectorAll('.listing').length === 2, null, { timeout: 15000 }).catch(() => bad('the buyer does not see two listings'));
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
  await p.fill('#deal-amount', '140'); await buyer.press('#deal-buy');
  const ask = await p.textContent('#deal-bar');
  if (!/Offer 140 TR for the HOLARIS Wristwatch No\. 1 of 10\?/.test(ask) || !/2,000 TR/.test(ask)) bad(`offering asks "${ask}"`);
  await buyer.shot('06-confirm');
  await buyer.press('#deal-yes'); await p.waitForSelector('#deal-withdraw');
  const held = await buyer.game(() => ({ balance: window.__nlw.view.self.balance, held: window.__nlw.market.held().held }));
  if (held.balance !== 1860 * TR || held.held !== 140 * TR) bad(`with 140 TR offered the buyer has ${held.balance / TR} TR and ${held.held / TR} TR set aside`);
  await buyer.has(1860, 'with 140 TR set aside for an offer');
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
  await seller.has(2040, 'after selling for 140 TR (2,000 - 100 + 140)');
  await p.waitForFunction(() => window.__nlw.market.held().held === 0, null, { timeout: 30000 }).catch(() => bad('the buyer\'s game did not learn of the sale'));
  await p.waitForTimeout(600); await buyer.shot('08-bought');
  await buyer.has(1860, 'after buying for 140 TR');
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
  for (const d of [seller, buyer]) { const left = await d.game(async () => { await window.__nlw.refreshDealMarkers(); await window.__nlw.market.sync(); await window.__nlw.market.sync(); return { markers: [...window.__nlw.dealMarkers.values()].map((m) => m.listing.name), balance: window.__nlw.view.self.balance }; }); if (left.markers.length !== 1) bad(`${d.label}: markers left are ${JSON.stringify(left.markers)}`); if (left.balance !== (d === seller ? 2040 : 1860) * TR) bad(`${d.label}: a second round changed the balance to ${left.balance / TR}`); }
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
  if (!/1,860/.test(home.balance)) bad(`the Wallet shows "${home.balance}"; the buyer has 1,860 TR`);
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
  await buyer.has(1860, 'after five refused sends');
  // the real one: the capitals in the name do not matter, and nothing moves until it is confirmed
  await p.fill('#send-username', sellerName.toUpperCase()); await p.fill('#send-amount', '250.5'); await p.fill('#send-note', 'for the cement');
  await buyer.press('#send-continue'); await p.waitForSelector('#send-confirm');
  await buyer.shot('13-confirm');
  const sum = await p.textContent('#send-summary');
  if (!sum.includes(sellerName) || !/250\.5 TR/.test(sum) || !/Fee/i.test(sum) || !/Total/i.test(sum)) bad(`the confirmation reads "${sum}"`);
  if (!/Fee\D*0 TR|No fee|None/i.test(sum)) bad(`the confirmation's fee is not "none": "${sum}"`);
  if ((await p.textContent('#send-confirm')).trim() !== 'Confirm Transfer' || (await p.textContent('#send-cancel')).trim() !== 'Cancel') bad('the confirmation\'s buttons are not Confirm Transfer and Cancel');
  await buyer.has(1860, 'with a transfer waiting to be confirmed');
  await buyer.press('#send-cancel'); await p.waitForSelector('#send-form');
  await buyer.has(1860, 'after cancelling a transfer');
  await buyer.press('#send-continue'); await p.waitForSelector('#send-confirm');
  // pressed twice in a hurry: one transfer
  await p.evaluate(() => { const b = document.querySelector('#send-confirm'); b.click(); b.click(); });
  await p.waitForSelector('#send-done'); await buyer.shot('14-sent');
  const done = await p.textContent('.page[data-app="wallet"]');
  if (!/250\.5 TR sent/.test(done) || !done.includes(sellerName) || !/TR-[0-9A-Z]{10}/.test(done) || !/for the cement/.test(done)) bad(`the receipt reads "${done}"`);
  await buyer.has(1609.5, 'after sending 250.5 TR');
  await buyer.press('#send-keep'); await p.waitForTimeout(800);
  await buyer.press('#send-finish'); await p.waitForSelector('#wallet-people');
  if (!(await p.textContent('#wallet-people')).includes(sellerName)) bad(`the saved beneficiaries are "${await p.textContent('#wallet-people')}"`);
  await buyer.press('#wallet-history'); await p.waitForSelector('#wallet-entries');
  await buyer.shot('15-history');
  const lines = await p.textContent('#wallet-entries');
  if (!lines.includes(sellerName) || !/250\.5/.test(lines) || !/Arriv|Welcome|2,000/i.test(lines)) bad(`the buyer's history reads "${lines}"`);
  // the seller is told, and has it: in the bank and in the purse
  await seller.game(() => window.__nlw.ui.close()); await seller.game(() => window.__nlw.market.sync());
  await seller.has(2290.5, 'after receiving 250.5 TR (2,040 + 250.5)');
  await seller.openWallet(); await s.waitForTimeout(600); await seller.shot('16-received');
  if (!/2,290\.5/.test(await s.textContent('#wallet-balance'))) bad(`the seller's Wallet shows "${await s.textContent('#wallet-balance')}"`);
  await seller.press('#wallet-history'); await s.waitForSelector('#wallet-entries');
  const got = await s.textContent('#wallet-entries');
  if (!got.includes(buyerName) || !/\+\s?250\.5/.test(got) || !/for the cement/.test(got)) bad(`the seller's history reads "${got}"`);
  await seller.game(() => window.__nlw.ui.close()); await buyer.game(() => window.__nlw.ui.close());
  // a browser that says it has more than it has: the bank goes by its own books, not by what it is told
  const lie = await buyer.game(async (to) => { const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1' }, body: JSON.stringify({ op: 'wallet.send', username: to, amount: '5000', balance: 99999999, key: crypto.randomUUID() }) }); return { status: r.status, body: await r.json().catch(() => null) }; }, sellerName);
  if (lie.status !== 409 || !lie.body || (lie.body.code || (lie.body.error && lie.body.error.code)) !== 'FUNDS') bad(`sending 5,000 TR with a made-up balance was answered ${JSON.stringify(lie)}`);
  await buyer.has(1609.5, 'after a send the bank refused');
  const all = await Promise.all([seller, buyer].map((d) => d.game(() => window.__nlw.host.auditor.reconcile().length)));
  if (all.some((n) => n)) bad(`after the transfer a ledger does not reconcile: ${all}`);
}

// ------------------------------------------------------------------ the same account elsewhere --
say('9. The buyer logs in on a computer: the same character, the watch, the same money');
{
  await buyer.game(() => window.__nlw.accountSync.upload());
  const other = await device('buyer2', { width: 1280, height: 760 });
  const p = other.page;
  await p.click('#open-login');
  await p.fill('#account-username', buyerName); await p.fill('#account-password', 'not the password'); await p.click('#account-submit');
  await p.waitForFunction(() => /do not match/.test(document.querySelector('#account-error').textContent), null, { timeout: 20000 }).catch(() => bad('a wrong password is not refused'));
  if ((await other.game(() => window.__nlw.online.status().state)) !== 'out') bad('a wrong password signed someone in');
  await p.fill('#account-password', 'a password for the buyer'); await p.click('#account-submit');
  await p.waitForFunction(() => window.__nlw.online.status().state === 'in');
  await p.waitForSelector('#continue-top:not([hidden])', { timeout: 20000 }).catch(() => bad('after logging in there is no Continue'));
  await other.shot('01-logged-in');
  if (!/Continue as Buyer Okafor/.test(await p.textContent('#continue-top'))) bad(`Continue reads "${await p.textContent('#continue-top')}"`);
  await p.click('#continue-top');
  await p.waitForFunction(() => window.__nlw.view && !document.querySelector('#hud').hidden); await p.waitForTimeout(1000);
  await other.has(1609.5, 'on the second device');
  await other.openProperty(); await p.waitForSelector('.assetcard');
  // the model itself, fetched only when asked for
  await p.click('.assetcard'); await p.waitForSelector('#load-model');
  const asked = [];
  p.on('request', (r) => { if (/watch\.glb/.test(r.url())) asked.push(r.url()); });
  await p.click('#load-model');
  const live = await p.waitForSelector('.viewer.live canvas', { timeout: 420000 }).then(() => true, () => false);
  if (!live) bad(`the model itself was not shown: "${await p.textContent('#model-status').catch(() => '')}"`);
  else { await p.waitForTimeout(3500); await other.shot('02-model'); }
  if (asked.length !== 1) bad(`the model was asked for ${asked.length} times`);
  await other.game(() => window.__nlw.ui.close()); await p.waitForTimeout(500);
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
  // signed out, the server gives nothing: not the save, not the wallet
  const shut = await other.game(async () => { const ask = async (op) => { const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1' }, body: JSON.stringify({ op }) }); return r.status; }; return { save: await ask('save.get'), wallet: await ask('wallet.get'), history: await ask('wallet.history') }; });
  if (shut.save !== 401 || shut.wallet !== 401 || shut.history !== 401) bad(`signed out, the server answered ${JSON.stringify(shut)}`);
  // the back button does not bring the town back
  await p.goBack().catch(() => {}); await p.waitForTimeout(800);
  const backed = await p.evaluate(() => ({ hud: !!(document.querySelector('#hud') && !document.querySelector('#hud').hidden), nlw: !!window.__nlw })).catch(() => ({ hud: false, nlw: false }));
  if (backed.hud) bad('after logging out, going back shows the town');
  // logging in again: the progress is there
  await p.goto(`${origin}/#nointro-lite`, { timeout: 300000 });
  await p.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await p.waitForFunction(() => window.__nlw.online.status().state === 'out');
  await p.click('#open-login'); await p.fill('#account-username', buyerName); await p.fill('#account-password', 'a password for the buyer'); await p.click('#account-submit');
  await p.waitForSelector('#continue-top:not([hidden])', { timeout: 30000 }).catch(() => bad('after logging in again there is no Continue'));
  if (!/Buyer Okafor/.test(await p.textContent('#continue-top'))) bad(`after logging in again Continue reads "${await p.textContent('#continue-top')}"`);
  await other.context.close();
}

// ------------------------------------------------------------------ erasing a saved game --
say('11. Erasing a saved game asks first; the character goes, the TR and the watch\'s history stay');
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
  const after = await seller.game(async () => { const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pcw': '1' }, body: JSON.stringify({ op: 'save.get' }) }); const save = await r.json(); return { state: window.__nlw.online.status().state, player: window.__nlw.playerId || null, local: localStorage.getItem('nlw-save-v5-NG-AN-OGB-Z1') === null, bank: window.__nlw.wallet.state.balance, cont: document.querySelector('#continue').hidden && document.querySelector('#continue-top').hidden, server: { erased: !!save.erased, data: save.save === null } }; });
  if (after.state !== 'in') bad('erasing signed the account out');
  if (after.player || !after.local || !after.cont) bad(`after erasing: ${JSON.stringify(after)}`);
  if (!after.server.erased || !after.server.data) bad(`the server still has the saved game: ${JSON.stringify(after.server)}`);
  if (after.bank !== 2290.5 * TR) bad(`erasing changed the bank balance to ${after.bank / TR} TR`);
  // a new journey on the same account: the TR is what the bank holds, not a new 2,000
  await seller.enter('Seller Again');
  await seller.has(2290.5, 'on a new journey after erasing');
  await seller.openWallet(); await seller.press('#wallet-history'); await p.waitForSelector('#wallet-entries');
  const lines = await p.textContent('#wallet-entries');
  if (!lines.includes(buyerName) || !/250\.5/.test(lines)) bad(`after erasing, the history lost the transfer: "${lines}"`);
  await seller.shot('19-new-journey');
  // reloading does not bring the erased game back
  await seller.game(() => window.__nlw.accountSync.upload());
  await p.reload({ timeout: 300000 });
  await p.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await p.waitForSelector('#continue-top:not([hidden])', { timeout: 30000 }).catch(() => bad('after a reload the new journey is not offered'));
  if (!/Seller Again/.test(await p.textContent('#continue-top'))) bad(`after a reload Continue reads "${await p.textContent('#continue-top')}"`);
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
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.map((x) => ` - ${x}`).join('\n')}` : '\nThe site: the account before play, the market, the deal, the Wallet, the second device, logging out and erasing all as they should be.');
process.exit(problems.length ? 1 : 0);
