'use strict';
// The tables, as numbered steps. A step is never edited once it has been applied to the live database: a change
// is a new step.
//
// Everything is in its own schema, `pcw`, which the database host's public web interface does not serve; and
// every table has row-level security switched on with no rule that lets anyone in, so that even if the schema
// were one day served, the public keys could read and write nothing. The site's own server connects as the
// owner of the tables and is the only thing that touches them.
//
// Money is in ledger units, whole numbers, as in the game: two units are one TR.

const SCHEMA = 'pcw';
const S = SCHEMA;

const TABLES = ['migrations', 'accounts', 'sessions', 'limits', 'saves', 'assets', 'listings', 'holdings', 'threads', 'messages', 'offers', 'sales', 'presence'];

// The shop the first listing is sold from. Its place is the pink marker before the door of the HOLARIS Watch
// building in Atani (see ZONE_SHOPS in the game); the game puts the marker where its own map says the shop is.
// The bank's numbers, in ledger units (two to a TR).
//   grant      what every account is given once: the arrival money, £20 as 2,000 TR
//   earnBurst  the most in-game earnings the bank will take from one account at once
//   earnHour   and how much more of them it will take for each hour that passes
//   earnStart  how much of them it will take from an account that has only just been made
// A game's earnings are told to the bank by the game itself (the town runs in the player's own browser), so the
// bank takes them only up to what a person playing could have earned. See api/_lib/wallet.js.
const WALLET = { grant: 4000, earnBurst: 20000, earnHour: 6000, earnStart: 1000 };

// The characters an account may be: the owner's supplied figures, by the names the game knows them by
// (prototype/src/sim/figures.js; a test holds the two lists together).
const FIGURES = {
  W1: 'Adaeze', M1: 'Emeka', W2: 'Ngozi', W3: 'Amaka', M4: 'Ikenna', M5: 'Uche',
  // the eighteen of 16 October 2026: ten women and eight men
  W4: 'Chioma', W5: 'Ifeoma', W6: 'Nneka', W7: 'Chiamaka', W8: 'Obiageli', W9: 'Ebele', W10: 'Adanna', W11: 'Ujunwa', W12: 'Chinwe', W13: 'Ifeyinwa',
  M6: 'Chinedu', M7: 'Obinna', M8: 'Nnamdi', M9: 'Kelechi', M10: 'Okechukwu', M11: 'Tobenna', M12: 'Chukwudi', M13: 'Ifeanyi',
  // the six of 17 October 2026: two women and four men
  W14: 'Nkiru', W15: 'Uloma', M14: 'Chidi', M15: 'Ebuka', M16: 'Obiora', M17: 'Somto',
};
// the figures an account could be when migration 5 was run (it is kept as it was run)
const FIGURES_OF_12_OCTOBER = ['W1', 'M1', 'W2', 'W3', 'M4', 'M5'];
// and when migration 9 was run
const FIGURES_OF_16_OCTOBER = [...FIGURES_OF_12_OCTOBER, 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12', 'W13', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13'];
// the figures there were when the account's character was first kept (migration 1 is as it was run)
const FIRST_FIGURES = ['W1', 'M1'];

// The motorcycle showroom (13 October 2026): the owner's twelve motorcycles, sold new, one of each to an account.
// Its markers stand in two rows of six on open ground by Waterside Road, west of the motor park.
// The list is the game's own (prototype/src/sim/power-bikes.js: names and prices in TR); it is copied here because
// the server is not built from the game's code. A test checks the two agree. (The prices are the owner's of 18 October
// 2026, set on the showroom's listings by migration 14: a database made new has them from the first.)
// A motorcycle may be paid for with starter TR (the owner's word, 13 October 2026), and since 18 October 2026 so may a
// car from the car showroom: they are the things to own that arrival money buys. What starter TR paid for one is
// starter TR again if it is sold on (holdings.starter_basis).
const SHOWROOM = { shop: 'motors', name: 'Motorcycle Showroom', x0: -63, z: 98, step: 4, zone: 'NG-AN-OGB-Z1' };
const MOTORCYCLES = [
  ['streetfighter', 'Streetfighter', 300, 'A light naked street bike in red and white, upright and quick to turn.'],
  ['cafe-racer', 'Café Racer', 300, 'A grey café racer with an orange seat and an open frame.'],
  ['white-sport', 'White Sport Tourer', 300, 'A white half-faired sport tourer, easy to live with.'],
  ['black-cruiser', 'Black Cruiser', 450, 'A classic black cruiser with chrome, wire wheels and a low seat.'],
  ['chopper', 'Chopper', 450, 'A long chopper with high bars and a stepped seat.'],
  ['purple-sport', 'Purple Sport', 450, 'A fully faired sport bike in deep purple.'],
  ['olive-cruiser', 'Olive Muscle Cruiser', 750, 'A heavy muscle cruiser in military olive.'],
  ['yellow-adventure', 'Yellow Adventure Tourer', 750, 'A tall adventure tourer in yellow, at home off the tar as on it.'],
  ['red-superbike', 'Red Superbike', 1200, 'A red superbike with a full race fairing.'],
  ['black-gold-superbike', 'Black & Gold Superbike', 1200, 'A black superbike on gold wheels.'],
  ['gold-tourer', 'Gold Grand Tourer', 1800, 'A full-dress touring bike in gold, with a fairing and hard luggage.'],
  ['chrome-concept', 'Chrome V-Concept', 3000, 'A chrome show machine with twin wheels at each end and an engine down its length.'],
  // the owner's three of 16 October 2026, in a third row
  ['gold-roadster', 'Gold Muscle Roadster', 1200, 'A big gold muscle roadster with a three-pipe engine on show.'],
  ['black-bobber', 'Black Bobber', 450, 'A black bobber with a fat front tyre, a solid tank and a low solo seat.'],
  ['power-cruiser', 'Dark Power Cruiser', 750, 'A long, low custom power cruiser in black on gold-spoked wheels.'],
  // the owner's two of 17 October 2026, in a fourth row at the back of PowerBike's hall (migration 12)
  ['midnight-cruiser', 'Midnight Cruiser', 450, 'A dark cruiser on spoked wheels, low and wide, its twin-cylinder engine in black and chrome.'],
  ['civil-war-tourer', 'PostCivilWar Tourer', 450, 'A white touring bike in the PostCivilWar colours, with a tall screen and hard luggage at the back.'],
].map(([id, name, tr, blurb], i) => ({ id, name, price: tr * 2, blurb, asset: `motorcycle-${id}`, listing: `00000000-0000-4000-8000-0000000002${String(i + 1).padStart(2, '0')}`, x: SHOWROOM.x0 + (i % 6) * SHOWROOM.step, z: SHOWROOM.z + (i < 6 ? -2.5 : i < 12 ? 2.5 : 7.5) }));
const MOTORCYCLE_STOCK = 1000000;          // new from the showroom: not a numbered edition, and not going to run out

// PostCivilWar PowerBike (16 October 2026): the showroom is the owner's skyscraper beside HOLARIS Watch, and the
// fifteen motorcycles stand in its hall, each on its own stand, where each is now sold (migration 10). The places are
// the game's own (prototype/src/sim/zones/atani-powerbike.js, `displays`), copied here because the server is not
// built from the game's code; a test checks they agree. With them, each bike's engine and top speed, which the
// showroom's salesman tells a buyer (market.js): the game's own figures (power-bikes.js), and a test checks those too.
const POWERBIKE = { shop: 'motors', name: 'PostCivilWar PowerBike', salesman: 'Obi', label: 'PostCivilWar PowerBike, north of the motor park, Asaba' };          // (not "beside HOLARIS Watch": a search for a watch would find every motorcycle)
const POWERBIKE_STANDS = {
  'streetfighter': [-74.8, 48.4, 650, 108], 'cafe-racer': [-69.2, 48.4, 600, 106], 'red-superbike': [-63.6, 48.4, 2500, 212], 'white-sport': [-58.0, 48.4, 500, 100], 'purple-sport': [-52.4, 48.4, 1000, 128],
  'black-cruiser': [-74.8, 43.2, 1500, 156], 'chopper': [-69.2, 43.2, 1400, 150], 'chrome-concept': [-63.6, 43.2, 3000, 240], 'black-bobber': [-58.0, 43.2, 1650, 164], 'olive-cruiser': [-52.4, 43.2, 1750, 170],
  'yellow-adventure': [-74.8, 38.0, 1200, 139], 'power-cruiser': [-69.2, 38.0, 1850, 176], 'gold-tourer': [-63.6, 38.0, 2800, 229], 'gold-roadster': [-58.0, 38.0, 2300, 201], 'black-gold-superbike': [-52.4, 38.0, 2000, 184],
  'midnight-cruiser': [-66.4, 32.8, 750, 114], 'civil-war-tourer': [-60.8, 32.8, 700, 111],
};

// The Post Civil War Car Showroom (17 October 2026): the owner's twenty cars, sold new, one of each to an account,
// each from its own stand in the hall of the showroom's glass tower by the Kwale road. Two salesmen keep the floor,
// Tochi the west side and Oluchi the east, and a car is sold by the one whose side it stands on. The list (names,
// prices in TR, classes and the market's line for each) is the game's own (prototype/src/sim/power-cars.js), and so
// are the stands, their sides and each car's top speed (prototype/src/sim/zones/asaba-carshow.js, `displays`); they
// are copied here because the server is not built from the game's code, and a test checks they agree.
// Until 18 October 2026 a car was paid for with earned TR only; since then (the owner's brief: a newcomer can buy a car
// or a motorcycle with the money they start with, the 2,000 TR of arrival money included) starter TR pays for a car
// from the showroom as it does for a motorcycle (migration 14). The prices are the owner's of that day, set on the
// listings by migration 14.
const CARSHOW = { shop: 'cars', name: 'Post Civil War Car Showroom', label: 'Post Civil War Car Showroom, Kwale Road, Asaba', zone: 'NG-AN-OGB-Z1', salesmen: { west: 'Tochi', east: 'Oluchi' } };
const CARS = [
  ['grey-saloon', 'Grey Saloon', 600, 'saloon', 'A modern grey saloon with a fastback roof: easy, comfortable, and the place to start.'],
  ['classic-two-tone', 'Classic Two-Tone', 750, 'classic', 'A long fifties saloon in black and white, chrome bumpers, a big grille and tail fins.'],
  ['black-pickup', 'Black Pickup', 950, 'pickup', 'A full-size black pickup with a hard top over its load bed: works all week, still looks sharp.'],
  ['yellow-classic-roadster', 'Yellow Classic Roadster', 1100, 'classic', 'A classic open roadster in pale yellow, long bonnet, chrome and white-wall tyres.'],
  ['blue-off-roader', 'Blue Off-Roader', 1300, 'offroad', 'A wild blue off-roader on huge tyres, roof rack and lamps: built for the bush tracks.'],
  ['black-square-suv', 'Black Square SUV', 1450, 'suv', 'A square-cut black SUV, boxy and tough, with a wide stance and dark wheels.'],
  ['camo-expedition', 'Camo Expedition SUV', 1600, 'offroad', 'An expedition SUV in camouflage, a tent box on its roof, spot lamps and a snorkel.'],
  ['mint-sports-coupe', 'Mint Sports Coupé', 1600, 'sports', 'A low mint-green sports coupé with a dark roof: light, quick and sharp in the turns.'],
  ['white-roadster', 'White Roadster', 1800, 'sports', 'A white two-seat convertible, roof down, red-trimmed wheels and a sculpted tail.'],
  ['peach-suv', 'Peach Luxury SUV', 1950, 'suv', 'A tall luxury SUV in peach, its wheels painted to match, smooth as a saloon on the road.'],
  ['black-luxury-suv', 'Black Luxury SUV', 2100, 'suv', 'A full-size black luxury SUV, three rows, a chrome grille and room for everyone.'],
  ['white-square-suv', 'White Square SUV', 2300, 'suv', 'A white square-cut SUV with a black bonnet, a spare wheel on its back door and a bull bar.'],
  ['grey-grand-tourer', 'Grey Grand Tourer', 2450, 'luxury', 'A grey grand tourer coupé: long, low and fast, for crossing the country in comfort.'],
  ['black-grand-convertible', 'Black Grand Convertible', 2650, 'luxury', 'A black grand convertible with white leather and white wheels: quiet, stately, roof down.'],
  ['pearl-convertible', 'Pearl Convertible', 2800, 'luxury', 'A pearl-white luxury convertible with a dark bonnet and black wheels.'],
  ['midnight-saloon', 'Midnight Saloon', 3300, 'luxury', 'A midnight-blue grand saloon, chrome on its grille and its flanks: the quietest car on the floor.'],
  ['state-limousine', 'State Limousine', 4000, 'limousine', 'A black armoured state limousine with flags on its wings: heavy, slow to stop, and impressive.'],
  ['bronze-spyder', 'Bronze Spyder', 4000, 'super', 'A bronze open supercar, low and wide, with flying buttresses behind its seats.'],
  ['red-winged-supercar', 'Red Winged Supercar', 4650, 'super', 'A legend in red: a low wedge of a supercar with a great wing across its tail.'],
  ['gold-hypercar', 'Gold Hypercar', 6000, 'super', 'A gold hypercar with its doors raised to the sky: the crown of the showroom, and the fastest car in town.'],
].map(([id, name, tr, cls, blurb], i) => ({ id, name, price: tr * 2, class: cls, blurb, asset: `car-${id}`, listing: `00000000-0000-4000-8000-0000000003${String(i + 1).padStart(2, '0')}` }));
const CAR_STOCK = 1000000;                 // new from the showroom: not a numbered edition, and not going to run out
// Where each car stands in the hall (x, z), its top speed in km/h (which its salesman tells a buyer: market.js), and
// whose side of the floor its stand is on.
const CAR_STANDS = {
  'grey-saloon': [-426.11, -164.39, 170, 'west'],
  'classic-two-tone': [-414.16, -164.39, 145, 'west'],
  'black-pickup': [-390.28, -164.39, 165, 'east'],
  'yellow-classic-roadster': [-402.22, -164.39, 200, 'west'],
  'blue-off-roader': [-378.33, -164.39, 175, 'east'],
  'black-square-suv': [-438.05, -176.39, 190, 'west'],
  'camo-expedition': [-366.39, -164.39, 165, 'east'],
  'mint-sports-coupe': [-438.05, -188.09, 260, 'west'],
  'white-roadster': [-426.11, -188.09, 250, 'west'],
  'peach-suv': [-414.16, -176.39, 220, 'west'],
  'black-luxury-suv': [-390.28, -176.39, 200, 'east'],
  'white-square-suv': [-426.11, -176.39, 220, 'west'],
  'grey-grand-tourer': [-366.39, -188.09, 300, 'east'],
  'black-grand-convertible': [-378.33, -188.09, 250, 'east'],
  'pearl-convertible': [-414.16, -188.09, 290, 'west'],
  'midnight-saloon': [-366.39, -176.39, 250, 'east'],
  'state-limousine': [-378.33, -176.39, 180, 'east'],
  'bronze-spyder': [-390.28, -188.09, 330, 'east'],
  'red-winged-supercar': [-402.22, -188.09, 320, 'east'],
  'gold-hypercar': [-402.22, -176.39, 350, 'east'],
};

// A character upgrade: offered only above the arrival money, for one part in `parts` of the whole wallet.
const UPGRADE = { above: WALLET.grant, parts: 4 };

const HOLARIS = { shop: 'holaris', asset: 'holaris-watch', listing: '00000000-0000-4000-8000-000000000001', x: -26, z: 55.4, price: 200, stock: 10 };

const MIGRATIONS = [
  {
    id: 1,
    name: 'accounts, saved characters, the market and who is in town',
    statements: [
      // ---- accounts ----
      `create table ${S}.accounts (
         id uuid primary key default gen_random_uuid(),
         username text not null,
         username_key text not null unique,
         pass_hash text not null,
         role text not null default 'player' check (role in ('player', 'admin')),
         created_at timestamptz not null default now(),
         last_seen_at timestamptz not null default now()
       )`,
      `create table ${S}.sessions (
         token_hash text primary key,
         account_id uuid not null references ${S}.accounts(id) on delete cascade,
         created_at timestamptz not null default now(),
         last_used_at timestamptz not null default now(),
         expires_at timestamptz not null
       )`,
      `create index sessions_account on ${S}.sessions(account_id)`,
      // how often something has been tried lately: sign-in failures by name and by address, accounts made, messages sent
      `create table ${S}.limits (
         key text primary key,
         count integer not null,
         window_start timestamptz not null
       )`,
      // ---- a player's character, as their own game last wrote it ----
      `create table ${S}.saves (
         account_id uuid primary key references ${S}.accounts(id) on delete cascade,
         rev integer not null,
         enc text not null check (enc in ('json', 'gzip-b64')),
         data text not null,
         character_name text,
         figure text,
         tr bigint,
         updated_at timestamptz not null default now()
       )`,
      // ---- the market ----
      // what can be owned: one row for each kind of thing
      `create table ${S}.assets (
         id text primary key,
         name text not null,
         category text not null,
         keywords text not null default '',
         model text not null,
         blurb text not null default '',
         created_at timestamptz not null default now()
       )`,
      // something for sale: new from a shop (primary; only an administrator makes these), or one item sold on by its owner
      `create table ${S}.listings (
         id uuid primary key default gen_random_uuid(),
         asset_id text not null references ${S}.assets(id),
         kind text not null check (kind in ('primary', 'resale')),
         seller_id uuid references ${S}.accounts(id),
         shop text,
         shop_name text,
         holding_id uuid,
         price bigint not null check (price > 0),
         stock integer not null check (stock > 0),
         sold integer not null default 0 check (sold >= 0),
         status text not null default 'open' check (status in ('open', 'sold', 'closed')),
         zone text not null,
         place_x real not null,
         place_z real not null,
         place_label text not null,
         created_by uuid references ${S}.accounts(id),
         created_at timestamptz not null default now(),
         closed_at timestamptz,
         check (sold <= stock),
         check ((kind = 'primary' and seller_id is null and shop is not null) or (kind = 'resale' and seller_id is not null and holding_id is not null and stock = 1))
       )`,
      `create index listings_open on ${S}.listings(status, created_at)`,
      // one item, and who owns it
      `create table ${S}.holdings (
         id uuid primary key default gen_random_uuid(),
         asset_id text not null references ${S}.assets(id),
         owner_id uuid not null references ${S}.accounts(id),
         serial integer,
         edition integer,
         origin_listing uuid references ${S}.listings(id),
         acquired_at timestamptz not null default now()
       )`,
      `create index holdings_owner on ${S}.holdings(owner_id)`,
      // an item is in at most one open listing
      `create unique index listings_one_per_item on ${S}.listings(holding_id) where status = 'open'`,
      // a buyer and a seller talking about one listing
      `create table ${S}.threads (
         id uuid primary key default gen_random_uuid(),
         listing_id uuid not null references ${S}.listings(id),
         buyer_id uuid not null references ${S}.accounts(id),
         seller_id uuid references ${S}.accounts(id),
         buyer_read bigint not null default 0,
         seller_read bigint not null default 0,
         created_at timestamptz not null default now(),
         last_at timestamptz not null default now(),
         unique (listing_id, buyer_id)
       )`,
      `create index threads_seller on ${S}.threads(seller_id, last_at)`,
      `create index threads_buyer on ${S}.threads(buyer_id, last_at)`,
      `create table ${S}.messages (
         id bigserial primary key,
         thread_id uuid not null references ${S}.threads(id) on delete cascade,
         sender_id uuid references ${S}.accounts(id),
         kind text not null check (kind in ('text', 'offer', 'accepted', 'declined', 'withdrawn', 'notice', 'attendant')),
         body text not null default '',
         amount bigint,
         offer_id uuid,
         at timestamptz not null default now()
       )`,
      `create index messages_thread on ${S}.messages(thread_id, id)`,
      // an offer to buy at a price. Its id is chosen by the buyer's game, so that asking twice makes one offer.
      `create table ${S}.offers (
         id uuid primary key,
         thread_id uuid references ${S}.threads(id) on delete cascade,
         listing_id uuid references ${S}.listings(id),
         buyer_id uuid not null references ${S}.accounts(id),
         amount bigint not null check (amount >= 0),
         status text not null check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'void')),
         created_at timestamptz not null default now(),
         decided_at timestamptz
       )`,
      `create unique index offers_one_pending on ${S}.offers(thread_id) where status = 'pending'`,
      `create index offers_buyer on ${S}.offers(buyer_id)`,
      // a sale that happened: the item changed hands and this much is owed by the buyer's game to the seller's
      `create table ${S}.sales (
         id uuid primary key default gen_random_uuid(),
         offer_id uuid not null unique references ${S}.offers(id),
         listing_id uuid not null references ${S}.listings(id),
         asset_id text not null references ${S}.assets(id),
         holding_id uuid not null references ${S}.holdings(id),
         buyer_id uuid not null references ${S}.accounts(id),
         seller_id uuid references ${S}.accounts(id),
         amount bigint not null check (amount > 0),
         at timestamptz not null default now(),
         buyer_paid_rev integer,
         seller_credited_rev integer
       )`,
      `create index sales_buyer on ${S}.sales(buyer_id, at)`,
      `create index sales_seller on ${S}.sales(seller_id, at)`,
      // ---- who is in town just now (nothing here is worth keeping through a restart) ----
      `create unlogged table ${S}.presence (
         account_id uuid primary key references ${S}.accounts(id) on delete cascade,
         zone text not null,
         x real not null,
         z real not null,
         state jsonb not null,
         at timestamptz not null default now()
       )`,
      `create index presence_zone on ${S}.presence(zone, at)`,
      // ---- nobody but the site's own server ----
      ...TABLES.map((table) => `alter table ${S}.${table} enable row level security`),
      `do $$ declare r text; begin
         foreach r in array array['anon', 'authenticated'] loop
           if exists (select 1 from pg_roles where rolname = r) then
             execute format('revoke all on schema ${S} from %I', r);
             execute format('revoke all on all tables in schema ${S} from %I', r);
             execute format('revoke all on all sequences in schema ${S} from %I', r);
           end if;
         end loop;
       end $$`,
      // ---- the first thing for sale: the owner's wristwatch, ten of them, at the HOLARIS Watch shop ----
      `insert into ${S}.assets (id, name, category, keywords, model, blurb) values
         ('${HOLARIS.asset}', 'HOLARIS Wristwatch', 'watch', 'watch wristwatch holaris jewellery jewelry time luxury', 'watch',
          'A wristwatch from the HOLARIS Watch house in Atani. Ten were made, each with its own number.')`,
      `insert into ${S}.listings (id, asset_id, kind, shop, shop_name, price, stock, zone, place_x, place_z, place_label) values
         ('${HOLARIS.listing}', '${HOLARIS.asset}', 'primary', '${HOLARIS.shop}', 'HOLARIS Watch', ${HOLARIS.price}, ${HOLARIS.stock}, 'NG-AN-OGB-Z1', ${HOLARIS.x}, ${HOLARIS.z}, 'HOLARIS Watch, Market Road, Atani')`,
    ],
  },
  {
    id: 2,
    name: 'the bank: every account\'s TR, kept here; people sent to often; a character can be erased',
    statements: [
      // ---- wallets ----
      // One for each account, and three of the bank's own:
      //   issuance  the mirror of all TR ever given out (it goes below nothing by exactly that much)
      //   world     the town's side of everything a player earns and spends in the game (also a mirror)
      //   escrow    TR set aside for offers in the market that have not been answered yet
      `create table ${S}.wallets (
         id uuid primary key default gen_random_uuid(),
         kind text not null check (kind in ('player', 'system')),
         account_id uuid unique references ${S}.accounts(id),
         code text unique,
         balance bigint not null default 0,
         overdraw boolean not null default false,
         earn_room bigint not null default 0,
         earn_at timestamptz not null default now(),
         opened_at timestamptz not null default now(),
         check (overdraw or balance >= 0),
         check ((kind = 'player' and account_id is not null and code is null and not overdraw) or (kind = 'system' and account_id is null and code is not null))
       )`,
      // one movement of TR: who asked, what for, and the reference a player can quote
      `create table ${S}.wallet_tx (
         id uuid primary key default gen_random_uuid(),
         ref text not null unique,
         kind text not null check (kind in ('grant', 'transfer', 'game', 'hold', 'release', 'sale', 'refund')),
         actor_id uuid references ${S}.accounts(id),
         idem_key text,
         request_hash text,
         note text not null default '',
         meta jsonb not null default '{}'::jsonb,
         at timestamptz not null default now()
       )`,
      // asked twice (a poor connection, a second press): the same key from the same account is one movement
      `create unique index wallet_tx_once on ${S}.wallet_tx(actor_id, idem_key) where idem_key is not null`,
      // its two or more sides. They always sum to nothing.
      `create table ${S}.wallet_entries (
         id bigserial primary key,
         tx_id uuid not null references ${S}.wallet_tx(id),
         wallet_id uuid not null references ${S}.wallets(id),
         amount bigint not null check (amount <> 0),
         balance_after bigint not null default 0,
         at timestamptz not null default now(),
         unique (tx_id, wallet_id)
       )`,
      `create index wallet_entries_wallet on ${S}.wallet_entries(wallet_id, id desc)`,
      // A balance changes in one way only: by an entry being written. The entry moves the balance and records
      // what it became; a balance that would go below nothing stops the whole movement (the check above).
      `create function ${S}.wallet_entry_applies() returns trigger language plpgsql as $f$
       begin
         update ${S}.wallets set balance = balance + new.amount where id = new.wallet_id returning balance into new.balance_after;
         if not found then raise exception 'no such wallet' using errcode = 'P0001'; end if;
         return new;
       end $f$`,
      `create trigger wallet_entry_applies before insert on ${S}.wallet_entries for each row execute function ${S}.wallet_entry_applies()`,
      // ...and nothing else may touch a balance: not a statement run by hand, not a mistake in the server's code
      `create function ${S}.wallet_balance_guard() returns trigger language plpgsql as $f$
       begin
         if tg_op = 'DELETE' then raise exception 'a wallet is never deleted' using errcode = 'P0001'; end if;
         if new.balance is distinct from old.balance and pg_trigger_depth() < 2 then raise exception 'a balance changes only by a ledger entry' using errcode = 'P0001'; end if;
         if new.id is distinct from old.id or new.kind is distinct from old.kind or new.account_id is distinct from old.account_id or new.code is distinct from old.code or new.overdraw is distinct from old.overdraw then raise exception 'a wallet is not altered' using errcode = 'P0001'; end if;
         return new;
       end $f$`,
      `create trigger wallet_balance_guard before update or delete on ${S}.wallets for each row execute function ${S}.wallet_balance_guard()`,
      // what has been written stays written
      `create function ${S}.wallet_history_is_kept() returns trigger language plpgsql as $f$
       begin raise exception 'the bank''s history is not changed' using errcode = 'P0001'; end $f$`,
      `create trigger wallet_tx_kept before update or delete on ${S}.wallet_tx for each row execute function ${S}.wallet_history_is_kept()`,
      `create trigger wallet_entries_kept before update or delete on ${S}.wallet_entries for each row execute function ${S}.wallet_history_is_kept()`,
      `create trigger wallet_tx_kept_all before truncate on ${S}.wallet_tx for each statement execute function ${S}.wallet_history_is_kept()`,
      `create trigger wallet_entries_kept_all before truncate on ${S}.wallet_entries for each statement execute function ${S}.wallet_history_is_kept()`,
      `create trigger wallets_kept_all before truncate on ${S}.wallets for each statement execute function ${S}.wallet_history_is_kept()`,
      // checked once more as the transaction ends: every movement sums to nothing
      `create function ${S}.wallet_tx_balances() returns trigger language plpgsql as $f$
       declare total bigint; sides integer;
       begin
         select coalesce(sum(amount), 0), count(*) into total, sides from ${S}.wallet_entries where tx_id = new.tx_id;
         if total <> 0 or sides < 2 then raise exception 'a movement of TR must sum to nothing (it sums to %)', total using errcode = 'P0001'; end if;
         return null;
       end $f$`,
      `create constraint trigger wallet_tx_balances after insert on ${S}.wallet_entries deferrable initially deferred for each row execute function ${S}.wallet_tx_balances()`,
      `insert into ${S}.wallets (kind, code, overdraw) values ('system', 'issuance', true), ('system', 'world', true), ('system', 'escrow', false)`,
      // ---- people a player sends to often: kept by who they are, not by a name that could change ----
      `create table ${S}.beneficiaries (
         owner_id uuid not null references ${S}.accounts(id) on delete cascade,
         person_id uuid not null references ${S}.accounts(id) on delete cascade,
         added_at timestamptz not null default now(),
         primary key (owner_id, person_id),
         check (owner_id <> person_id)
       )`,
      // ---- nobody but the site's own server (done before anything is written into the new tables) ----
      ...['wallets', 'wallet_tx', 'wallet_entries', 'beneficiaries'].map((table) => `alter table ${S}.${table} enable row level security`),
      `do $$ declare r text; begin
         foreach r in array array['anon', 'authenticated'] loop
           if exists (select 1 from pg_roles where rolname = r) then
             execute format('revoke all on all tables in schema ${S} from %I', r);
             execute format('revoke all on all sequences in schema ${S} from %I', r);
             execute format('revoke all on all functions in schema ${S} from %I', r);
           end if;
         end loop;
       end $$`,
      // ---- the character: how far its own ledger has been told to the bank, and that it can be erased ----
      `alter table ${S}.saves add column wallet_mark bigint not null default 0`,
      `alter table ${S}.saves add column erased boolean not null default false`,
      // ---- the market's money now moves here ----
      `alter table ${S}.offers add column held bigint not null default 0 check (held >= 0)`,
      // Every account that exists is given its wallet and the arrival money every character begins with (£20,
      // as 2,000 TR): the same amount its own game gave it. What it has earned and spent since is told to the
      // bank by its game the next time it saves.
      `do $$ declare a record; w uuid; t uuid; bank uuid; begin
         select id into bank from ${S}.wallets where code = 'issuance';
         for a in select id from ${S}.accounts order by created_at loop
           insert into ${S}.wallets (kind, account_id, earn_room) values ('player', a.id, ${WALLET.earnBurst}) returning id into w;
           insert into ${S}.wallet_tx (ref, kind, actor_id, idem_key, note) values ('TR-A' || upper(substr(md5(w::text), 1, 9)), 'grant', a.id, 'grant', 'Arrival money: £20') returning id into t;
           insert into ${S}.wallet_entries (tx_id, wallet_id, amount) values (t, w, ${WALLET.grant}), (t, bank, -${WALLET.grant});
         end loop;
       end $$`,
      // A seller whose game had not yet been given the money for a sale is given it here, once.
      `do $$ declare d record; w uuid; t uuid; town uuid; begin
         select id into town from ${S}.wallets where code = 'world';
         for d in select id, seller_id, amount from ${S}.sales where seller_id is not null and seller_credited_rev is null order by at loop
           select id into w from ${S}.wallets where account_id = d.seller_id;
           insert into ${S}.wallet_tx (ref, kind, actor_id, idem_key, note, meta) values ('TR-S' || upper(substr(md5(d.id::text), 1, 9)), 'sale', d.seller_id, 'legacy-sale:' || d.id, 'Sold in the market', jsonb_build_object('sale', d.id)) returning id into t;
           insert into ${S}.wallet_entries (tx_id, wallet_id, amount) values (t, w, d.amount), (t, town, -d.amount);
           update ${S}.sales set seller_credited_rev = 0 where id = d.id;
         end loop;
       end $$`,
      // Offers that were waiting had their money set aside in the buyer's own game, not here: they are closed,
      // and each buyer's game gives the money back.
      `with closed as (update ${S}.offers set status = 'declined', decided_at = now() where status = 'pending' returning id, thread_id, amount)
       insert into ${S}.messages (thread_id, kind, body, amount, offer_id) select thread_id, 'declined', 'The market''s money has moved to the bank. Make the offer again.', amount, id from closed where thread_id is not null`,
      // every movement written in this step is checked now, not left for the end: each sums to nothing
      `set constraints all immediate`,
    ],
  },
  {
    id: 3,
    name: 'starter TR kept apart from earned TR; one character to an account, changed only by a paid upgrade',
    statements: [
      // ---- offers that are waiting are closed first, and their TR goes back ----
      // An offer made before today set its TR aside out of the whole wallet, arrival money included. From here
      // on only earned TR can be set aside, so nothing waits in the old way: each buyer has their TR again
      // before any wallet is looked at, and can make the offer again.
      `do $$ declare o record; w uuid; t uuid; esc uuid; begin
         select id into esc from ${S}.wallets where code = 'escrow';
         for o in select id, buyer_id, held, thread_id, amount from ${S}.offers where status = 'pending' order by created_at loop
           if o.held > 0 and not exists (select 1 from ${S}.wallet_tx where actor_id = o.buyer_id and idem_key = 'release:' || o.id) then
             select id into w from ${S}.wallets where account_id = o.buyer_id;
             insert into ${S}.wallet_tx (ref, kind, actor_id, idem_key, note, meta) values ('TR-R' || upper(substr(md5(o.id::text), 1, 9)), 'release', o.buyer_id, 'release:' || o.id, 'Offer returned', jsonb_build_object('offer', o.id)) returning id into t;
             insert into ${S}.wallet_entries (tx_id, wallet_id, amount) values (t, esc, -o.held), (t, w, o.held);
           end if;
           update ${S}.offers set status = 'declined', decided_at = now() where id = o.id;
           if o.thread_id is not null then insert into ${S}.messages (thread_id, kind, body, amount, offer_id) values (o.thread_id, 'declined', 'Offers are now made with earned TR only. Your TR has been returned: make the offer again.', o.amount, o.id); end if;
         end loop;
       end $$`,
      // (each of those is checked now: the tables are about to be altered, and nothing may be left waiting)
      `set constraints all immediate`,
      `set constraints all deferred`,

      // ---- what each wallet is made of ----
      //   starter   arrival money that is left: it pays the town's charges and costs, and nothing else
      //   illicit   TR that was taken from someone in the game
      //   (earned is the rest: balance - starter - illicit)
      `alter table ${S}.wallets add column starter bigint not null default 0`,
      `alter table ${S}.wallets add column illicit bigint not null default 0`,
      // ...and which of them each entry moved. (Entries written before today say nothing: nobody kept count then.)
      `alter table ${S}.wallet_entries add column bucket text check (bucket in ('starter', 'earned', 'illicit'))`,
      // one movement may now touch a wallet once for each kind of TR in it
      `alter table ${S}.wallet_entries drop constraint wallet_entries_tx_id_wallet_id_key`,
      `create unique index wallet_entries_once on ${S}.wallet_entries(tx_id, wallet_id, coalesce(bucket, ''))`,

      // ---- the wallets that already exist ----
      // Nobody's balance changes. What changes is what the bank will let each part of it do. Until today the
      // bank kept no count of where TR came from, so it is settled here by one rule, the same for everyone and
      // on the cautious side: a wallet's earned TR is what it holds above the arrival money, and no more of
      // that than the town earnings the bank itself took from that account's game. Everything else in it is
      // starter TR. (So TR that reached a wallet from another player before today is not counted as earned:
      // it may have been someone's arrival money.) What was decided for each wallet is written down.
      `create table ${S}.wallet_reconciled (
         wallet_id uuid primary key references ${S}.wallets(id),
         at timestamptz not null default now(),
         balance bigint not null,
         starter bigint not null,
         illicit bigint not null default 0,
         earned bigint not null,
         town_earned bigint not null,
         last_entry bigint not null,
         rule text not null
       )`,
      `insert into ${S}.wallet_reconciled (wallet_id, balance, starter, earned, town_earned, last_entry, rule)
       select w.id, w.balance, w.balance - e.earned, e.earned, e.town, coalesce((select max(id) from ${S}.wallet_entries x where x.wallet_id = w.id), 0),
              'earned = least(greatest(balance - ${WALLET.grant}, 0), town earnings taken by the bank); starter = the rest'
       from ${S}.wallets w
       cross join lateral (select coalesce(sum(case when (t.meta->>'earned') ~ '^[0-9]+$' then (t.meta->>'earned')::bigint else 0 end), 0) as town
                           from ${S}.wallet_entries x join ${S}.wallet_tx t on t.id = x.tx_id where x.wallet_id = w.id and t.kind = 'game') g
       cross join lateral (select least(greatest(w.balance - ${WALLET.grant}, 0), g.town) as earned, g.town as town) e
       where w.kind = 'player'`,
      `update ${S}.wallets w set starter = r.starter from ${S}.wallet_reconciled r where r.wallet_id = w.id`,

      // ---- from here on, an entry says which TR it moves, and the database moves that and nothing else ----
      `create or replace function ${S}.wallet_entry_applies() returns trigger language plpgsql as $f$
       declare whose text; why text;
       begin
         select kind into whose from ${S}.wallets where id = new.wallet_id;
         if not found then raise exception 'no such wallet' using errcode = 'P0001'; end if;
         if whose = 'system' then
           if new.bucket is not null then raise exception 'the bank''s own wallets hold TR of no kind' using errcode = 'P0001'; end if;
           update ${S}.wallets set balance = balance + new.amount where id = new.wallet_id returning balance into new.balance_after;
           return new;
         end if;
         if new.bucket is null then raise exception 'an entry in a player''s wallet says which TR it moves' using errcode = 'P0001'; end if;
         if new.bucket = 'starter' then
           -- starter TR leaves a wallet only for the town's own charges and costs (a save's report), and reaches
           -- one only as arrival money or as the price of something that was itself bought with it
           select kind into why from ${S}.wallet_tx where id = new.tx_id;
           if new.amount < 0 and why <> 'game' then raise exception 'starter TR pays the town''s charges and costs and nothing else' using errcode = 'P0001'; end if;
           if new.amount > 0 and why not in ('grant', 'sale') then raise exception 'starter TR is not made that way' using errcode = 'P0001'; end if;
           update ${S}.wallets set balance = balance + new.amount, starter = starter + new.amount where id = new.wallet_id returning balance into new.balance_after;
         elsif new.bucket = 'illicit' then
           update ${S}.wallets set balance = balance + new.amount, illicit = illicit + new.amount where id = new.wallet_id returning balance into new.balance_after;
         else
           update ${S}.wallets set balance = balance + new.amount where id = new.wallet_id returning balance into new.balance_after;
         end if;
         return new;
       end $f$`,
      `create or replace function ${S}.wallet_balance_guard() returns trigger language plpgsql as $f$
       begin
         if tg_op = 'DELETE' then raise exception 'a wallet is never deleted' using errcode = 'P0001'; end if;
         if (new.balance is distinct from old.balance or new.starter is distinct from old.starter or new.illicit is distinct from old.illicit) and pg_trigger_depth() < 2 then raise exception 'a balance changes only by a ledger entry' using errcode = 'P0001'; end if;
         if new.id is distinct from old.id or new.kind is distinct from old.kind or new.account_id is distinct from old.account_id or new.code is distinct from old.code or new.overdraw is distinct from old.overdraw then raise exception 'a wallet is not altered' using errcode = 'P0001'; end if;
         return new;
       end $f$`,
      // no part of a wallet goes below nothing, and the parts never come to more than the whole
      `alter table ${S}.wallets add constraint wallets_parts check (starter >= 0 and illicit >= 0 and (kind <> 'player' or starter + illicit <= balance))`,
      `alter table ${S}.wallet_tx drop constraint wallet_tx_kind_check`,
      `alter table ${S}.wallet_tx add constraint wallet_tx_kind_check check (kind in ('grant', 'transfer', 'game', 'hold', 'release', 'sale', 'refund', 'upgrade'))`,

      // ---- the market ----
      // how much of an offer's TR was TR that had been taken (so that it goes back as what it was)
      `alter table ${S}.offers add column held_illicit bigint not null default 0 check (held_illicit >= 0)`,
      // Something bought before today may have been bought with arrival money. If it is sold on, that much of
      // what it fetches is starter TR again in the seller's wallet: selling a thing does not turn arrival money
      // into earned TR. (Anything bought from today is bought with earned TR, and carries nothing.)
      `alter table ${S}.holdings add column starter_basis bigint not null default 0 check (starter_basis >= 0)`,
      `update ${S}.holdings h set starter_basis = coalesce((select s.amount from ${S}.sales s where s.holding_id = h.id and s.buyer_id = h.owner_id order by s.at desc limit 1), 0)`,

      // ---- the character ----
      // One to an account, chosen once when the player first arrives, and with it the answer to "hero or
      // villain". Kept here, not in the saved game, so that it is the same on every device, outlives a save that
      // is erased, and cannot be changed by anything a page sends but the upgrade below.
      `alter table ${S}.accounts add column figure text check (figure in (${FIRST_FIGURES.map((id) => `'${id}'`).join(', ')}))`,
      `alter table ${S}.accounts add column figure_at timestamptz`,
      `alter table ${S}.accounts add column path text check (path in ('hero', 'villain'))`,
      // an account that already has a character is that character
      `update ${S}.accounts a set figure = s.figure, figure_at = now() from ${S}.saves s where s.account_id = a.id and not s.erased and s.figure in (${FIRST_FIGURES.map((id) => `'${id}'`).join(', ')})`,
      // every change of character after the first choice: what it was, what it became, what it cost, and the
      // movement at the bank that paid for it
      `create table ${S}.character_changes (
         id uuid primary key default gen_random_uuid(),
         account_id uuid not null references ${S}.accounts(id) on delete cascade,
         from_figure text not null,
         to_figure text not null,
         total bigint not null,
         fee bigint not null check (fee > 0),
         tx_id uuid not null references ${S}.wallet_tx(id),
         idem_key text not null,
         at timestamptz not null default now(),
         unique (account_id, idem_key)
       )`,
      `create index character_changes_account on ${S}.character_changes(account_id, at)`,

      // ---- what was asked for and refused ----
      // The ledger says what moved. This says what was asked to move and did not, because of what the TR was
      // or how much of it there was: who asked, for what, how much, and the reason given. It is written when
      // the refusal is made and is never changed: someone trying one road after another to get starter TR out
      // leaves a line for each.
      `create table ${S}.wallet_refusals (
         id bigserial primary key,
         account_id uuid not null references ${S}.accounts(id),
         op text not null,
         code text not null,
         amount text,
         detail jsonb not null default '{}'::jsonb,
         at timestamptz not null default now()
       )`,
      `create index wallet_refusals_account on ${S}.wallet_refusals(account_id, at)`,
      `create trigger wallet_refusals_kept before update or delete on ${S}.wallet_refusals for each row execute function ${S}.wallet_history_is_kept()`,
      `create trigger wallet_refusals_kept_all before truncate on ${S}.wallet_refusals for each statement execute function ${S}.wallet_history_is_kept()`,

      // ---- nobody but the site's own server ----
      ...['wallet_reconciled', 'character_changes', 'wallet_refusals'].map((table) => `alter table ${S}.${table} enable row level security`),
      `do $$ declare r text; begin
         foreach r in array array['anon', 'authenticated'] loop
           if exists (select 1 from pg_roles where rolname = r) then
             execute format('revoke all on all tables in schema ${S} from %I', r);
             execute format('revoke all on all sequences in schema ${S} from %I', r);
             execute format('revoke all on all functions in schema ${S} from %I', r);
           end if;
         end loop;
       end $$`,
      `set constraints all immediate`,
    ],
  },
  {
    id: 4,
    name: 'the real weather, kept for a while for each place it was asked for',
    statements: [
      // One row a place (rounded to a tenth of a degree, some ten kilometres): what the weather there is and until
      // when that holds. Nothing about who asked is kept.
      `create table ${S}.weather_cache (
         place text primary key,
         kind text not null check (kind in ('clear', 'cloudy', 'rain', 'storm')),
         detail jsonb not null default '{}'::jsonb,
         fetched_at timestamptz not null default now(),
         expires_at timestamptz not null
       )`,
      `alter table ${S}.weather_cache enable row level security`,
      `do $$ declare r text; begin
         foreach r in array array['anon', 'authenticated'] loop
           if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on ${S}.weather_cache from %I', r); end if;
         end loop;
       end $$`,
    ],
  },
  {
    id: 5,
    name: 'four more characters an account may be',
    statements: [
      // The athlete, the police officer, the priest and the hooded warrior (12 October 2026). The check on an
      // account's character is widened to them; every character already kept stays exactly as it is.
      `alter table ${S}.accounts drop constraint if exists accounts_figure_check`,
      `alter table ${S}.accounts add constraint accounts_figure_check check (figure in (${FIGURES_OF_12_OCTOBER.map((id) => `'${id}'`).join(', ')}))`,
    ],
  },
  {
    id: 6,
    name: 'the motorcycle showroom: twelve motorcycles, one of each to an account, which starter TR may pay for',
    statements: [
      // starter TR leaves a wallet for the town's charges and costs, and now also for a motorcycle from the showroom
      // (a sale that says so, made by this server: see market.js, settle). Otherwise this is migration 3's rule.
      `create or replace function ${S}.wallet_entry_applies() returns trigger language plpgsql as $f$
       declare whose text; why text; what text;
       begin
         select kind into whose from ${S}.wallets where id = new.wallet_id;
         if not found then raise exception 'no such wallet' using errcode = 'P0001'; end if;
         if whose = 'system' then
           if new.bucket is not null then raise exception 'the bank''s own wallets hold TR of no kind' using errcode = 'P0001'; end if;
           update ${S}.wallets set balance = balance + new.amount where id = new.wallet_id returning balance into new.balance_after;
           return new;
         end if;
         if new.bucket is null then raise exception 'an entry in a player''s wallet says which TR it moves' using errcode = 'P0001'; end if;
         select kind, coalesce(meta->>'starterFor', '') into why, what from ${S}.wallet_tx where id = new.tx_id;
         -- (a motorcycle's price goes to the town and to no player)
         if what = 'motorcycle' and new.amount > 0 then raise exception 'a motorcycle from the showroom is paid to the town' using errcode = 'P0001'; end if;
         if new.bucket = 'starter' then
           if new.amount < 0 and why <> 'game' and not (why = 'sale' and what = 'motorcycle') then raise exception 'starter TR pays the town''s charges and costs and for a motorcycle, and nothing else' using errcode = 'P0001'; end if;
           if new.amount > 0 and why not in ('grant', 'sale') then raise exception 'starter TR is not made that way' using errcode = 'P0001'; end if;
           update ${S}.wallets set balance = balance + new.amount, starter = starter + new.amount where id = new.wallet_id returning balance into new.balance_after;
         elsif new.bucket = 'illicit' then
           update ${S}.wallets set balance = balance + new.amount, illicit = illicit + new.amount where id = new.wallet_id returning balance into new.balance_after;
         else
           update ${S}.wallets set balance = balance + new.amount where id = new.wallet_id returning balance into new.balance_after;
         end if;
         return new;
       end $f$`,
      ...MOTORCYCLES.map((m) => `insert into ${S}.assets (id, name, category, keywords, model, blurb) values ('${m.asset}', '${m.name.replace(/'/g, "''")}', 'motorcycle', 'motorcycle motorbike bike power ${m.id.replace(/-/g, ' ')}', 'bike:${m.id}', '${m.blurb.replace(/'/g, "''")}') on conflict (id) do nothing`),
      ...MOTORCYCLES.map((m) => `insert into ${S}.listings (id, asset_id, kind, shop, shop_name, price, stock, zone, place_x, place_z, place_label) values ('${m.listing}', '${m.asset}', 'primary', '${SHOWROOM.shop}', '${SHOWROOM.name}', ${m.price}, ${MOTORCYCLE_STOCK}, '${SHOWROOM.zone}', ${m.x}, ${m.z}, '${SHOWROOM.name}, by Waterside Road, west of the motor park') on conflict (id) do nothing`),
      // the town is Asaba, Delta State, now (13 October 2026): the watch shop's address and the watch's words say so
      `update ${S}.listings set place_label = 'HOLARIS Watch, Market Road, Asaba' where id = '${HOLARIS.listing}'`,
      `update ${S}.assets set blurb = 'A wristwatch from the HOLARIS Watch house in Asaba. Ten were made, each with its own number.' where id = '${HOLARIS.asset}'`,
      // one of each motorcycle to an account (the market also refuses a second, with a reason)
      `create unique index holdings_one_motorcycle on ${S}.holdings(owner_id, asset_id) where asset_id like 'motorcycle-%'`,
    ],
  },
  {
    id: 7,
    name: 'advertising on the billboards: campaigns, their pictures, holds of earned TR, the tax, and an admin',
    statements: [
      // three of the bank's own wallets: what is held for campaigns under review, the advertising fees taken, and
      // the advertising tax (for the in-game agency for signage and advertising in Delta State; no player's)
      `insert into ${S}.wallets (kind, code, overdraw) values ('system', 'adhold', false), ('system', 'adverts', false), ('system', 'adtax', false)`,
      `alter table ${S}.wallet_tx drop constraint wallet_tx_kind_check`,
      `alter table ${S}.wallet_tx add constraint wallet_tx_kind_check check (kind in ('grant', 'transfer', 'game', 'hold', 'release', 'sale', 'refund', 'upgrade', 'ad-hold', 'ad-charge', 'ad-release'))`,
      // a campaign: one advertiser, one billboard, a run of whole days, its price as the server worked it out, and
      // where it stands. (Scheduled, active and expired are not kept: they follow from its days and the clock.)
      `create table ${S}.ad_campaigns (
         id uuid primary key default gen_random_uuid(),
         account_id uuid not null references ${S}.accounts(id),
         idem_key text not null,
         billboard_id text not null,
         category text not null check (category in ('small', 'medium', 'large', 'xl', 'tv')),
         brand text not null default '',
         link text not null default '',
         days integer not null check (days > 0 and days <= 366),
         start_at timestamptz,
         end_at timestamptz,
         fee_day bigint not null check (fee_day > 0),
         tax_day bigint not null check (tax_day >= 0),
         fee bigint not null check (fee >= 0),
         tax bigint not null check (tax >= 0),
         total bigint not null check (total = fee + tax),
         refunded bigint not null default 0 check (refunded >= 0),
         status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
         terms_version text,
         terms_at timestamptz,
         rights boolean not null default false,
         reviewer_id uuid references ${S}.accounts(id),
         reviewed_at timestamptz,
         review_note text not null default '',
         created_at timestamptz not null default now(),
         submitted_at timestamptz,
         unique (account_id, idem_key),
         check (status = 'draft' or (start_at is not null and end_at > start_at and terms_version is not null and rights))
       )`,
      `create index ad_campaigns_board on ${S}.ad_campaigns(billboard_id, start_at) where status in ('pending', 'approved')`,
      `create index ad_campaigns_account on ${S}.ad_campaigns(account_id, created_at desc)`,
      // its pictures: one for a printed board, three to ten for a screen; kept here, given out only as allowed
      `create table ${S}.ad_art (
         id uuid primary key default gen_random_uuid(),
         campaign_id uuid not null references ${S}.ad_campaigns(id),
         idx integer not null check (idx >= 0 and idx < 10),
         mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
         width integer not null check (width > 0),
         height integer not null check (height > 0),
         bytes integer not null check (bytes > 0),
         sha256 text not null,
         data bytea not null,
         created_at timestamptz not null default now(),
         unique (campaign_id, idx)
       )`,
      // one row a billboard, locked while a booking on it is made, so that two bookings never take the same days
      `create table ${S}.ad_slots (billboard_id text primary key)`,
      `insert into ${S}.ad_slots (billboard_id) select value->>'id' from jsonb_array_elements('${JSON.stringify(require('./billboards.json').map((b) => ({ id: b.id })))}'::jsonb) on conflict do nothing`,
      // what happened to each campaign, by whom and when: only ever added to
      `create table ${S}.ad_events (
         id bigserial primary key,
         campaign_id uuid not null references ${S}.ad_campaigns(id),
         actor_id uuid references ${S}.accounts(id),
         action text not null,
         note text not null default '',
         meta jsonb not null default '{}'::jsonb,
         at timestamptz not null default now()
       )`,
      `create trigger ad_events_kept before update or delete on ${S}.ad_events for each row execute function ${S}.wallet_history_is_kept()`,
      `create trigger ad_events_kept_all before truncate on ${S}.ad_events for each statement execute function ${S}.wallet_history_is_kept()`,
      ...['ad_campaigns', 'ad_art', 'ad_slots', 'ad_events'].map((table) => `alter table ${S}.${table} enable row level security`),
      `do $$ declare r text; begin
         foreach r in array array['anon', 'authenticated'] loop
           if exists (select 1 from pg_roles where rolname = r) then
             execute format('revoke all on all tables in schema ${S} from %I', r);
             execute format('revoke all on all sequences in schema ${S} from %I', r);
           end if;
         end loop;
       end $$`,
      // the owner's administrator (13 October 2026): the account named Chukwumezie, if it has been made. (Nobody
      // else becomes one by taking that name later: this is done once, now, to the account that has it now.)
      `update ${S}.accounts set role = 'admin' where username_key = 'chukwumezie'`,
    ],
  },
  {
    id: 8,
    name: 'three more of the owner\'s motorcycles in the showroom',
    statements: [
      ...MOTORCYCLES.slice(12).map((m) => `insert into ${S}.assets (id, name, category, keywords, model, blurb) values ('${m.asset}', '${m.name.replace(/'/g, "''")}', 'motorcycle', 'motorcycle motorbike bike power ${m.id.replace(/-/g, ' ')}', 'bike:${m.id}', '${m.blurb.replace(/'/g, "''")}') on conflict (id) do nothing`),
      ...MOTORCYCLES.slice(12).map((m) => `insert into ${S}.listings (id, asset_id, kind, shop, shop_name, price, stock, zone, place_x, place_z, place_label) values ('${m.listing}', '${m.asset}', 'primary', '${SHOWROOM.shop}', '${SHOWROOM.name}', ${m.price}, ${MOTORCYCLE_STOCK}, '${SHOWROOM.zone}', ${m.x}, ${m.z}, '${SHOWROOM.name}, by Waterside Road, west of the motor park') on conflict (id) do nothing`),
    ],
  },
  {
    id: 9,
    name: 'eighteen more characters an account may be',
    statements: [
      // The owner's eighteen figures of 16 October 2026. The check on an account's character is widened to them;
      // every character already kept stays exactly as it is.
      `alter table ${S}.accounts drop constraint if exists accounts_figure_check`,
      `alter table ${S}.accounts add constraint accounts_figure_check check (figure in (${FIGURES_OF_16_OCTOBER.map((id) => `'${id}'`).join(', ')}))`,
    ],
  },
  {
    id: 10,
    name: 'the showroom is PostCivilWar PowerBike: each motorcycle sold from its stand in the hall beside HOLARIS',
    statements: [
      // the same fifteen listings, at the same prices, with what was sold and said kept: only where each is and what
      // the shop is called change
      ...MOTORCYCLES.map((m) => `update ${S}.listings set shop_name = '${POWERBIKE.name}', place_x = ${POWERBIKE_STANDS[m.id][0]}, place_z = ${POWERBIKE_STANDS[m.id][1]}, place_label = '${POWERBIKE.label}' where id = '${m.listing}'`),
    ],
  },
  {
    id: 11,
    name: 'six more characters an account may be',
    statements: [
      // The owner's six figures of 17 October 2026. The check on an account's character is widened to them; every
      // character already kept stays exactly as it is.
      `alter table ${S}.accounts drop constraint if exists accounts_figure_check`,
      `alter table ${S}.accounts add constraint accounts_figure_check check (figure in (${Object.keys(FIGURES).map((id) => `'${id}'`).join(', ')}))`,
    ],
  },
  {
    id: 12,
    name: 'two more of the owner\'s motorcycles, at the back of PostCivilWar PowerBike\'s hall',
    statements: [
      // the Midnight Cruiser and the PostCivilWar Tourer of 17 October 2026, each sold from its own stand
      ...MOTORCYCLES.slice(15).map((m) => `insert into ${S}.assets (id, name, category, keywords, model, blurb) values ('${m.asset}', '${m.name.replace(/'/g, "''")}', 'motorcycle', 'motorcycle motorbike bike power ${m.id.replace(/-/g, ' ')}', 'bike:${m.id}', '${m.blurb.replace(/'/g, "''")}') on conflict (id) do nothing`),
      ...MOTORCYCLES.slice(15).map((m) => `insert into ${S}.listings (id, asset_id, kind, shop, shop_name, price, stock, zone, place_x, place_z, place_label) values ('${m.listing}', '${m.asset}', 'primary', '${POWERBIKE.shop}', '${POWERBIKE.name}', ${m.price}, ${MOTORCYCLE_STOCK}, '${SHOWROOM.zone}', ${POWERBIKE_STANDS[m.id][0]}, ${POWERBIKE_STANDS[m.id][1]}, '${POWERBIKE.label}') on conflict (id) do nothing`),
    ],
  },
  {
    id: 13,
    name: 'the Post Civil War Car Showroom: twenty cars, one of each to an account',
    statements: [
      // the owner's twenty cars of 17 October 2026, each sold from its own stand in the showroom's hall. What starter TR
      // may pay for is not changed: a car is paid for with earned TR, as any thing to own is (market.js, settle), and
      // the database still refuses starter TR for anything but the town's charges and a motorcycle (migration 6).
      ...CARS.map((c) => `insert into ${S}.assets (id, name, category, keywords, model, blurb) values ('${c.asset}', '${c.name.replace(/'/g, "''")}', 'car', 'car motor vehicle ${c.class} ${c.id.replace(/-/g, ' ')}', 'car:${c.id}', '${c.blurb.replace(/'/g, "''")}') on conflict (id) do nothing`),
      ...CARS.map((c) => `insert into ${S}.listings (id, asset_id, kind, shop, shop_name, price, stock, zone, place_x, place_z, place_label) values ('${c.listing}', '${c.asset}', 'primary', '${CARSHOW.shop}', '${CARSHOW.name.replace(/'/g, "''")}', ${c.price}, ${CAR_STOCK}, '${CARSHOW.zone}', ${CAR_STANDS[c.id][0]}, ${CAR_STANDS[c.id][1]}, '${CARSHOW.label.replace(/'/g, "''")}') on conflict (id) do nothing`),
      // one of each car to an account (the market also refuses a second, with a reason)
      `create unique index holdings_one_car on ${S}.holdings(owner_id, asset_id) where asset_id like 'car-%'`,
    ],
  },
  {
    id: 14,
    name: 'the owner\'s prices of 18 October 2026 (cars 600 to 6,000 TR, motorcycles 300 to 3,000 TR), and starter TR pays for a car as for a motorcycle',
    statements: [
      // each showroom listing at the game's price (power-bikes.js, power-cars.js): the same price for everyone, set here
      // and nowhere else; what a player asks for one they own and sell on is theirs, and is not touched
      ...MOTORCYCLES.map((m) => `update ${S}.listings set price = ${m.price} where id = '${m.listing}' and kind = 'primary'`),
      ...CARS.map((c) => `update ${S}.listings set price = ${c.price} where id = '${c.listing}' and kind = 'primary'`),
      // starter TR leaves a wallet for the town's charges and costs, for a motorcycle and now for a car from the showrooms
      // (a sale that says so, made by this server: see market.js, settle); the price of either goes to the town and to
      // no player. Otherwise this is migration 6's rule, unchanged.
      `create or replace function ${S}.wallet_entry_applies() returns trigger language plpgsql as $f$
       declare whose text; why text; what text;
       begin
         select kind into whose from ${S}.wallets where id = new.wallet_id;
         if not found then raise exception 'no such wallet' using errcode = 'P0001'; end if;
         if whose = 'system' then
           if new.bucket is not null then raise exception 'the bank''s own wallets hold TR of no kind' using errcode = 'P0001'; end if;
           update ${S}.wallets set balance = balance + new.amount where id = new.wallet_id returning balance into new.balance_after;
           return new;
         end if;
         if new.bucket is null then raise exception 'an entry in a player''s wallet says which TR it moves' using errcode = 'P0001'; end if;
         select kind, coalesce(meta->>'starterFor', '') into why, what from ${S}.wallet_tx where id = new.tx_id;
         -- (a motorcycle's or a car's price goes to the town and to no player)
         if what in ('motorcycle', 'car') and new.amount > 0 then raise exception 'a motorcycle or a car from the showroom is paid to the town' using errcode = 'P0001'; end if;
         if new.bucket = 'starter' then
           if new.amount < 0 and why <> 'game' and not (why = 'sale' and what in ('motorcycle', 'car')) then raise exception 'starter TR pays the town''s charges and costs and for a motorcycle or a car, and nothing else' using errcode = 'P0001'; end if;
           if new.amount > 0 and why not in ('grant', 'sale') then raise exception 'starter TR is not made that way' using errcode = 'P0001'; end if;
           update ${S}.wallets set balance = balance + new.amount, starter = starter + new.amount where id = new.wallet_id returning balance into new.balance_after;
         elsif new.bucket = 'illicit' then
           update ${S}.wallets set balance = balance + new.amount, illicit = illicit + new.amount where id = new.wallet_id returning balance into new.balance_after;
         else
           update ${S}.wallets set balance = balance + new.amount where id = new.wallet_id returning balance into new.balance_after;
         end if;
         return new;
       end $f$`,
    ],
  },
];

module.exports = { SCHEMA, MIGRATIONS, HOLARIS, WALLET, FIGURES, UPGRADE, SHOWROOM, MOTORCYCLES, POWERBIKE, POWERBIKE_STANDS, CARSHOW, CARS, CAR_STANDS };
