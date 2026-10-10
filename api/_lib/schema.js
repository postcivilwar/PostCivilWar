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
];

module.exports = { SCHEMA, MIGRATIONS, HOLARIS };
