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
// A game's earnings are told to the bank by the game itself (the town runs in the player's own browser), so the
// bank takes them only up to what a person playing could have earned. See api/_lib/wallet.js.
const WALLET = { grant: 4000, earnBurst: 20000, earnHour: 6000 };

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
    ],
  },
];

module.exports = { SCHEMA, MIGRATIONS, HOLARIS, WALLET };
