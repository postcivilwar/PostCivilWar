// The whole site in real browsers: the built page, the server and a database, as a player meets them.
//
//   node prototype/build.mjs
//   server/with-postgres.sh node server/test/site.mjs [output-directory]
//
// Two players, each in a browser of their own. One makes an account on a computer, buys a watch at HOLARIS
// Watch, and puts it up for sale. The other, on a phone, finds it in the market, walks into the seller's marker,
// talks, and offers; the seller says yes. Then: the same account on a second device, the model itself, and
// signing out. Everything is done by pressing what a player presses; what is checked is what the player sees
// and what each game's own ledger holds. Needs Playwright with Chromium. Not part of the unit tests.
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
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => bad(`${label}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*40[19]|status of 4(01|09|29)/.test(m.text())) bad(`${label}: console: ${m.text()}`); });
  await page.goto(`${origin}/#nointro-lite`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await page.waitForFunction(() => window.__nlw.online.status().state !== 'checking');
  const press = (selector) => (mobile ? page.tap(selector) : page.click(selector));
  const d = {
    label, page, context, press,
    shot: async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: resolve(out, `${label}-${name}.png`) }); },
    game: (fn, arg) => page.evaluate(fn, arg),
    balance: () => page.evaluate(() => window.__nlw.view.self.balance),
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
  const row = await seller.game(() => ({ shown: !document.querySelector('#account-row').hidden, signup: document.querySelector('#open-signup').getBoundingClientRect(), login: document.querySelector('#open-login').getBoundingClientRect(), story: document.querySelector('#start-intro').getBoundingClientRect().bottom, title: document.querySelector('#start-title').getBoundingClientRect().top }));
  if (!row.shown) bad('the start screen does not offer Create account and Log in');
  if (Math.abs(row.signup.top - row.login.top) > 2 || row.login.left <= row.signup.right) bad('Create account and Log in are not side by side');
  if (!(row.signup.top >= row.story - 1 && row.signup.bottom <= row.title + 1)) bad('the account buttons are not between the story and "Create your character"');
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
  if ((await seller.balance()) !== 1900 * TR) bad(`after buying a watch for 100 TR the seller has ${(await seller.balance()) / TR} TR`);
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
  if ((await seller.balance()) !== 2040 * TR) bad(`the seller has ${(await seller.balance()) / TR} TR; 2,000 - 100 + 140 is 2,040`);
  await p.waitForFunction(() => window.__nlw.market.held().held === 0, null, { timeout: 30000 }).catch(() => bad('the buyer\'s game did not learn of the sale'));
  await p.waitForTimeout(600); await buyer.shot('08-bought');
  if ((await buyer.balance()) !== 1860 * TR) bad(`the buyer has ${(await buyer.balance()) / TR} TR; 2,000 - 140 is 1,860`);
  await buyer.press('#deal-back'); await p.waitForTimeout(600);
  await buyer.openProperty(); await p.waitForSelector('.assetcard');
  if (!/No\. 1 of 10/.test(await p.textContent('.assetcard'))) bad(`the buyer's Property shows "${await p.textContent('.assetcard')}"`);
  await buyer.shot('09-owned');
  await s.click('#deal-back'); await s.waitForTimeout(600);
  await seller.openProperty(); await s.waitForSelector('#market-history');
  if (await s.isVisible('.assetcard')) bad('the seller still has the watch');
  const history = await s.textContent('#market-history');
  if (!history.includes(`Sold to ${buyerName}`) || !/\+140 TR/.test(history) || !/Bought from HOLARIS Watch/.test(history)) bad(`the seller's history reads "${history}"`);
  await seller.shot('15-history');
  // the marker has gone from both towns; pressing again changes nothing
  for (const d of [seller, buyer]) { const left = await d.game(async () => { await window.__nlw.refreshDealMarkers(); await window.__nlw.market.sync(); await window.__nlw.market.sync(); return { markers: [...window.__nlw.dealMarkers.values()].map((m) => m.listing.name), balance: window.__nlw.view.self.balance }; }); if (left.markers.length !== 1) bad(`${d.label}: markers left are ${JSON.stringify(left.markers)}`); if (left.balance !== (d === seller ? 2040 : 1860) * TR) bad(`${d.label}: a second round changed the balance to ${left.balance / TR}`); }
  const ledgers = await Promise.all([seller, buyer].map((d) => d.game(() => window.__nlw.host.auditor.reconcile().length)));
  if (ledgers.some((n) => n)) bad(`a ledger does not reconcile: ${ledgers}`);
}

// ------------------------------------------------------------------ the same account elsewhere --
say('8. The buyer logs in on a computer: the same character, the watch, the same money');
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
  if ((await other.balance()) !== 1860 * TR) bad(`on the second device the buyer has ${(await other.balance()) / TR} TR`);
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
  // signing out: the character goes to the account and leaves this device
  await other.game(() => window.__nlw.ui.openPhone('settings')); await p.waitForSelector('#settings-logout');
  if ((await p.textContent('#settings-username')) !== buyerName) bad('Settings does not say who is signed in');
  await p.click('#settings-logout');
  await p.waitForFunction(() => window.__nlw.online.status().state === 'out', null, { timeout: 30000 });
  await p.waitForTimeout(800); await other.shot('03-logged-out');
  const gone = await other.game(() => ({ playerId: window.__nlw.playerId, start: !document.querySelector('#start').hidden, kept: !!localStorage.getItem('nlw-save-v5-NG-AN-OGB-Z1'), signup: !document.querySelector('#open-signup').hidden }));
  if (gone.playerId || !gone.start || gone.kept || !gone.signup) bad(`after signing out: ${JSON.stringify(gone)}`);
  await other.context.close();
}

await browser.close();
server.close();
const { closeDatabase } = require('../../api/_lib/db.js');
await closeDatabase();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.map((x) => ` - ${x}`).join('\n')}` : '\nThe site: accounts, the market, the deal and the second device all as they should be.');
process.exit(problems.length ? 1 : 0);
