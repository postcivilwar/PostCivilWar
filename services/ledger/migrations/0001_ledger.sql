-- Nigeria Life World: financial ledger, migration 0001.
--
-- An append-only, double-entry ledger. Every balance change is a transaction
-- whose entries sum to zero per asset. Balances are a cache of the entries and
-- can always be rebuilt from them.
--
-- Callers never write to tables. Each service role may execute only the
-- functions granted to it at the bottom of this file. That is how the rule
-- "gameplay code has no path to bitcoin balances" is enforced: by the
-- database, not by convention.
--
-- Two classes of value are kept apart:
--   external  a real-world asset held for a player. At launch the only one is
--             bitcoin, and in every environment that exists today that means
--             sandbox test bitcoin (asset code TBTC).
--   game      the in-game currency (asset code CWR, working name "cowrie").
-- Adding another external asset later is a new row in ledger.assets and a new
-- rail in the settlement service. Nothing in the game economy changes.
--
-- Apply with:  psql --single-transaction -v ON_ERROR_STOP=1 -f 0001_ledger.sql
-- Developed and tested on PostgreSQL 16. Uses the built-in gen_random_uuid
-- and sha256, so no extensions are needed.

-- ---------------------------------------------------------------------------
-- Roles. NOLOGIN groups; a deployment creates one LOGIN user per service and
-- makes it a member of exactly one of these.
-- ---------------------------------------------------------------------------
DO $roles$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'nlw_gameplay',      -- economy service: moves in-game currency between players, businesses, government
    'nlw_monetary',      -- operator monetary authority: issues and retires in-game currency
    'nlw_settlement',    -- settlement service: bitcoin deposits, withdrawals, conversion and redemption
    'nlw_ledger_admin',  -- reviewed corrections: reversals only
    'nlw_auditor'        -- read-only: reconciliation and reporting
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$roles$;

CREATE SCHEMA ledger;
REVOKE ALL ON SCHEMA ledger FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- 'external' is a real-world asset held one-for-one by the operator.
-- 'game' is in-game currency. The two never mix except in a 'bridge' kind.
CREATE TYPE ledger.value_class AS ENUM ('external', 'game');
CREATE TYPE ledger.owner_kind  AS ENUM ('player', 'business', 'government', 'system');
CREATE TYPE ledger.kind_scope  AS ENUM ('game', 'external', 'bridge');
CREATE TYPE ledger.leg         AS (line int, account_id uuid, amount bigint);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

-- One row. 'sandbox' means no asset on a live network may exist in this
-- database. Moving to 'production' is not a setting to flip: this table is
-- append-only, so it takes a reviewed migration.
CREATE TABLE ledger.environment (
  only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  name     text NOT NULL CHECK (name IN ('sandbox', 'production'))
);
INSERT INTO ledger.environment (name) VALUES ('sandbox');

CREATE TABLE ledger.assets (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z]{3,8}$'),
  class       ledger.value_class NOT NULL,
  minor_units smallint NOT NULL CHECK (minor_units BETWEEN 0 AND 8),
  -- 'internal' for game currency; for external assets, the network they live on.
  network     text NOT NULL CHECK (network IN ('internal', 'regtest', 'testnet', 'mainnet')),
  description text NOT NULL,
  CONSTRAINT game_assets_are_internal CHECK ((class = 'game') = (network = 'internal'))
);

CREATE TABLE ledger.transaction_kinds (
  kind        text PRIMARY KEY CHECK (kind ~ '^[a-z][a-z0-9_]{2,47}$'),
  scope       ledger.kind_scope NOT NULL,
  description text NOT NULL
);

-- ---------------------------------------------------------------------------
-- Accounts and balances
-- ---------------------------------------------------------------------------

CREATE TABLE ledger.accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind     ledger.owner_kind NOT NULL,
  owner_id       text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 128),
  purpose        text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_]{1,47}$'),
  asset          text NOT NULL REFERENCES ledger.assets (code),
  allow_negative boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_kind, owner_id, purpose, asset),
  UNIQUE (id, asset),
  UNIQUE (id, allow_negative),
  -- Only the operator's issuance and settlement accounts may go below zero.
  CONSTRAINT only_system_may_go_negative CHECK (NOT allow_negative OR owner_kind = 'system')
);

CREATE TABLE ledger.balances (
  account_id     uuid PRIMARY KEY,
  balance        bigint NOT NULL DEFAULT 0,
  allow_negative boolean NOT NULL,
  entry_count    bigint NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, allow_negative) REFERENCES ledger.accounts (id, allow_negative),
  CONSTRAINT balance_non_negative CHECK (allow_negative OR balance >= 0)
);

-- ---------------------------------------------------------------------------
-- Transactions and entries (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE ledger.transactions (
  id              uuid PRIMARY KEY,
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash    bytea NOT NULL,
  kind            text NOT NULL REFERENCES ledger.transaction_kinds (kind),
  initiator       text NOT NULL CHECK (length(initiator) BETWEEN 1 AND 128),
  reason          text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  reverses        uuid UNIQUE REFERENCES ledger.transactions (id),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
                    CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 4096),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- amount is in minor units and signed: positive credits the account,
-- negative debits it. balance_after is the account balance once this entry
-- was applied.
CREATE TABLE ledger.entries (
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  txn_id        uuid NOT NULL REFERENCES ledger.transactions (id),
  line          int NOT NULL CHECK (line >= 1),
  account_id    uuid NOT NULL,
  asset         text NOT NULL,
  amount        bigint NOT NULL CHECK (amount <> 0),
  balance_after bigint NOT NULL,
  PRIMARY KEY (txn_id, line),
  UNIQUE (txn_id, account_id),
  FOREIGN KEY (account_id, asset) REFERENCES ledger.accounts (id, asset)
);
CREATE INDEX entries_account_seq ON ledger.entries (account_id, seq);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

CREATE FUNCTION ledger._deny_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'ledger.% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'NL009';
END
$fn$;

CREATE TRIGGER transactions_append_only BEFORE UPDATE OR DELETE ON ledger.transactions
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER transactions_no_truncate BEFORE TRUNCATE ON ledger.transactions
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER entries_append_only BEFORE UPDATE OR DELETE ON ledger.entries
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER entries_no_truncate BEFORE TRUNCATE ON ledger.entries
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER environment_fixed BEFORE INSERT OR UPDATE OR DELETE ON ledger.environment
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER environment_no_truncate BEFORE TRUNCATE ON ledger.environment
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER assets_append_only BEFORE UPDATE OR DELETE ON ledger.assets
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();

-- Sandbox guard: a live-network asset cannot be created outside production.
CREATE FUNCTION ledger._guard_assets() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.network = 'mainnet' AND (SELECT name FROM ledger.environment) <> 'production' THEN
    RAISE EXCEPTION 'asset % is on a live network and this ledger is a sandbox', NEW.code
      USING ERRCODE = 'NL010';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER assets_sandbox_guard BEFORE INSERT ON ledger.assets
  FOR EACH ROW EXECUTE FUNCTION ledger._guard_assets();

CREATE TRIGGER accounts_append_only BEFORE UPDATE OR DELETE ON ledger.accounts
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER accounts_no_truncate BEFORE TRUNCATE ON ledger.accounts
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();

-- Balances change only inside ledger._post. Service roles have no UPDATE
-- privilege at all; this trigger additionally stops a privileged user from
-- editing a balance by hand without going through a transaction. It is a
-- guard against mistakes, not against a hostile superuser.
CREATE FUNCTION ledger._guard_balances() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance <> 0 OR NEW.entry_count <> 0 THEN
      RAISE EXCEPTION 'a balance row must start at zero' USING ERRCODE = 'NL009';
    END IF;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('ledger.posting', true), '') <> 'on' THEN
    RAISE EXCEPTION 'ledger.balances may only change through a posted transaction'
      USING ERRCODE = 'NL009';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger.balances rows are never deleted' USING ERRCODE = 'NL009';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER balances_guard BEFORE INSERT OR UPDATE OR DELETE ON ledger.balances
  FOR EACH ROW EXECUTE FUNCTION ledger._guard_balances();
CREATE TRIGGER balances_no_truncate BEFORE TRUNCATE ON ledger.balances
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();

-- Defence in depth: whatever inserted the entries, a transaction cannot commit
-- unless its entries sum to zero for every asset.
--
-- SECURITY DEFINER because a deferred trigger runs at commit, after the
-- posting function has returned, as the calling service role, which has no
-- right to read ledger.entries.
CREATE FUNCTION ledger._check_zero_sum() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ledger, pg_temp AS $fn$
DECLARE
  v_asset text;
BEGIN
  SELECT e.asset INTO v_asset
    FROM ledger.entries e
   WHERE e.txn_id = NEW.txn_id
   GROUP BY e.asset
  HAVING sum(e.amount) <> 0
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'transaction % does not sum to zero for asset %', NEW.txn_id, v_asset
      USING ERRCODE = 'NL003';
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER entries_zero_sum AFTER INSERT ON ledger.entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger._check_zero_sum();

-- ---------------------------------------------------------------------------
-- Posting
--
-- Error codes raised (SQLSTATE):
--   NL001 insufficient funds          NL005 invalid request
--   NL002 idempotency key reused      NL006 unknown account
--       with a different request      NL007 already reversed / not reversible
--   NL003 entries do not sum to zero  NL009 append-only violation
--   NL004 not permitted for this role   NL010 live-network asset in a sandbox
-- ---------------------------------------------------------------------------

CREATE FUNCTION ledger._post(
  p_idem              text,
  p_kind              text,
  p_initiator         text,
  p_reason            text,
  p_entries           jsonb,
  p_meta              jsonb,
  p_scopes            ledger.kind_scope[],
  p_may_debit_system  boolean,
  p_reverses          uuid DEFAULT NULL
) RETURNS TABLE (transaction_id uuid, replayed boolean)
LANGUAGE plpgsql
SET search_path = ledger, pg_temp
AS $fn$
DECLARE
  v_legs   ledger.leg[];
  v_meta   jsonb := coalesce(p_meta, '{}'::jsonb);
  v_scope  ledger.kind_scope;
  v_hash   bytea;
  v_id     uuid := gen_random_uuid();
  v_prev   record;
  v_n      int;
  v_locked int := 0;
  v_text   text;
  v_new    bigint;
  r        record;
BEGIN
  -- 1. Shape of the request.
  IF p_idem IS NULL OR length(p_idem) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'idempotency key must be 8 to 200 characters' USING ERRCODE = 'NL005';
  END IF;
  IF p_initiator IS NULL OR p_initiator = '' OR p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'initiator and reason are required' USING ERRCODE = 'NL005';
  END IF;
  IF jsonb_typeof(v_meta) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'metadata must be a JSON object' USING ERRCODE = 'NL005';
  END IF;
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'entries must be a JSON array' USING ERRCODE = 'NL005';
  END IF;
  v_n := jsonb_array_length(p_entries);
  IF v_n < 2 OR v_n > 64 THEN
    RAISE EXCEPTION 'a transaction needs 2 to 64 entries, got %', v_n USING ERRCODE = 'NL005';
  END IF;

  BEGIN
    SELECT array_agg(
             ROW(x.ord::int, (x.val ->> 'account')::uuid, (x.val ->> 'amount')::bigint)::ledger.leg
             ORDER BY x.ord)
      INTO v_legs
      FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS x (val, ord);
  EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION 'each entry needs a uuid "account" and a whole-number "amount" in minor units'
      USING ERRCODE = 'NL005';
  END;

  IF EXISTS (SELECT 1 FROM unnest(v_legs) l WHERE l.account_id IS NULL OR l.amount IS NULL OR l.amount = 0) THEN
    RAISE EXCEPTION 'each entry needs an account and a non-zero amount' USING ERRCODE = 'NL005';
  END IF;
  IF (SELECT count(DISTINCT l.account_id) FROM unnest(v_legs) l) <> v_n THEN
    RAISE EXCEPTION 'an account may appear only once in a transaction' USING ERRCODE = 'NL005';
  END IF;

  -- 2. Is this kind of transaction open to the calling role?
  SELECT k.scope INTO v_scope FROM transaction_kinds k WHERE k.kind = p_kind;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown transaction kind %', coalesce(p_kind, '(null)') USING ERRCODE = 'NL005';
  END IF;
  IF NOT (v_scope = ANY (p_scopes)) THEN
    RAISE EXCEPTION 'transaction kind % is not permitted for this role', p_kind USING ERRCODE = 'NL004';
  END IF;

  -- 3. Idempotency. The hash covers everything that defines the request, so a
  --    retry is recognised and a different request under the same key is refused.
  v_hash := sha256(convert_to(jsonb_build_object(
              'kind', p_kind, 'initiator', p_initiator, 'reason', p_reason,
              'meta', v_meta, 'legs', to_jsonb(v_legs), 'reverses', p_reverses)::text, 'UTF8'));

  INSERT INTO transactions (id, idempotency_key, request_hash, kind, initiator, reason, reverses, metadata)
  VALUES (v_id, p_idem, v_hash, p_kind, p_initiator, p_reason, p_reverses, v_meta)
  ON CONFLICT (idempotency_key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT t.id, t.request_hash INTO v_prev FROM transactions t WHERE t.idempotency_key = p_idem;
    IF NOT FOUND THEN
      -- Only reachable above READ COMMITTED isolation: the winning transaction
      -- is not visible to this snapshot. The caller retries.
      RAISE EXCEPTION 'concurrent request with the same idempotency key; retry'
        USING ERRCODE = 'serialization_failure';
    END IF;
    IF v_prev.request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency key % was already used for a different request', p_idem
        USING ERRCODE = 'NL002';
    END IF;
    RETURN QUERY SELECT v_prev.id, true;
    RETURN;
  END IF;

  -- 4. Lock every balance row involved, always in account-id order, so two
  --    transactions that touch the same accounts cannot deadlock.
  FOR r IN
    SELECT b.account_id
      FROM balances b
     WHERE b.account_id = ANY (ARRAY(SELECT l.account_id FROM unnest(v_legs) l))
     ORDER BY b.account_id
       FOR UPDATE
  LOOP
    v_locked := v_locked + 1;
  END LOOP;
  IF v_locked <> v_n THEN
    RAISE EXCEPTION 'one or more accounts do not exist' USING ERRCODE = 'NL006';
  END IF;

  -- 5. Value-class wall and issuance rule.
  IF v_scope <> 'bridge' THEN
    SELECT a.id::text INTO v_text
      FROM unnest(v_legs) l
      JOIN accounts a ON a.id = l.account_id
      JOIN assets s   ON s.code = a.asset
     WHERE s.class::text <> v_scope::text
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'a % transaction may not touch account %, which holds another value class',
        v_scope, v_text USING ERRCODE = 'NL004';
    END IF;
  END IF;

  IF NOT p_may_debit_system THEN
    SELECT a.id::text INTO v_text
      FROM unnest(v_legs) l
      JOIN accounts a ON a.id = l.account_id
     WHERE a.owner_kind = 'system' AND l.amount < 0
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'this role may not debit system account %', v_text USING ERRCODE = 'NL004';
    END IF;
  END IF;

  -- 6. Conservation: entries sum to zero for every asset.
  SELECT a.asset INTO v_text
    FROM unnest(v_legs) l
    JOIN accounts a ON a.id = l.account_id
   GROUP BY a.asset
  HAVING sum(l.amount) <> 0
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'entries do not sum to zero for asset %', v_text USING ERRCODE = 'NL003';
  END IF;

  -- 7. Apply.
  PERFORM set_config('ledger.posting', 'on', true);
  FOR r IN
    SELECT l.line, l.account_id, l.amount, a.asset, b.balance, b.allow_negative
      FROM unnest(v_legs) l
      JOIN accounts a ON a.id = l.account_id
      JOIN balances b ON b.account_id = l.account_id
     ORDER BY l.line
  LOOP
    IF NOT r.allow_negative AND r.amount < 0 AND r.balance + r.amount < 0 THEN
      RAISE EXCEPTION 'insufficient funds in account %', r.account_id
        USING ERRCODE = 'NL001',
              DETAIL = format('balance %s, requested debit %s %s', r.balance, -r.amount, r.asset);
    END IF;

    UPDATE balances b
       SET balance = b.balance + r.amount,
           entry_count = b.entry_count + 1,
           updated_at = now()
     WHERE b.account_id = r.account_id
    RETURNING b.balance INTO v_new;

    INSERT INTO entries (txn_id, line, account_id, asset, amount, balance_after)
    VALUES (v_id, r.line, r.account_id, r.asset, r.amount, v_new);
  END LOOP;
  PERFORM set_config('ledger.posting', 'off', true);

  RETURN QUERY SELECT v_id, false;
END
$fn$;

-- Role-facing entry points. Each is SECURITY DEFINER with a pinned
-- search_path and fixes the scopes its role is allowed.

CREATE FUNCTION ledger.post_game(
  p_idem text, p_kind text, p_initiator text, p_reason text, p_entries jsonb, p_meta jsonb DEFAULT '{}'
) RETURNS TABLE (transaction_id uuid, replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$
  SELECT * FROM ledger._post(p_idem, p_kind, p_initiator, p_reason, p_entries, p_meta,
                             ARRAY['game']::ledger.kind_scope[], false);
$fn$;

CREATE FUNCTION ledger.post_monetary(
  p_idem text, p_kind text, p_initiator text, p_reason text, p_entries jsonb, p_meta jsonb DEFAULT '{}'
) RETURNS TABLE (transaction_id uuid, replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$
  SELECT * FROM ledger._post(p_idem, p_kind, p_initiator, p_reason, p_entries, p_meta,
                             ARRAY['game']::ledger.kind_scope[], true);
$fn$;

CREATE FUNCTION ledger.post_settlement(
  p_idem text, p_kind text, p_initiator text, p_reason text, p_entries jsonb, p_meta jsonb DEFAULT '{}'
) RETURNS TABLE (transaction_id uuid, replayed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$
  SELECT * FROM ledger._post(p_idem, p_kind, p_initiator, p_reason, p_entries, p_meta,
                             ARRAY['external', 'bridge']::ledger.kind_scope[], true);
$fn$;

-- A reversal is a new transaction with every entry negated, linked to the
-- original. The original is never altered. It fails with NL001 if the
-- receiving account no longer holds the funds; recovering those is a
-- separate decision for a human, not something the ledger does silently.
CREATE FUNCTION ledger.post_reversal(
  p_idem text, p_transaction uuid, p_initiator text, p_reason text
) RETURNS TABLE (transaction_id uuid, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$
DECLARE
  v_orig    record;
  v_entries jsonb;
BEGIN
  SELECT t.id, t.kind, t.reverses INTO v_orig FROM transactions t WHERE t.id = p_transaction;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % does not exist', p_transaction USING ERRCODE = 'NL005';
  END IF;
  IF v_orig.reverses IS NOT NULL THEN
    RAISE EXCEPTION 'transaction % is itself a reversal and cannot be reversed', p_transaction
      USING ERRCODE = 'NL007';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('account', e.account_id, 'amount', -e.amount) ORDER BY e.line)
    INTO v_entries
    FROM entries e
   WHERE e.txn_id = p_transaction;

  BEGIN
    RETURN QUERY
      SELECT * FROM ledger._post(p_idem, v_orig.kind, p_initiator, p_reason, v_entries,
                                 jsonb_build_object('reversal_of', p_transaction),
                                 ARRAY['game', 'external', 'bridge']::ledger.kind_scope[], true, p_transaction);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'transaction % has already been reversed', p_transaction USING ERRCODE = 'NL007';
  END;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

CREATE FUNCTION ledger._open_account(
  p_owner_kind ledger.owner_kind, p_owner_id text, p_purpose text, p_asset text, p_class ledger.value_class
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = ledger, pg_temp
AS $fn$
DECLARE
  v_id    uuid;
  v_class ledger.value_class;
BEGIN
  IF p_owner_kind = 'system' THEN
    RAISE EXCEPTION 'system accounts are created by migrations only' USING ERRCODE = 'NL004';
  END IF;
  SELECT s.class INTO v_class FROM assets s WHERE s.code = p_asset;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown asset %', coalesce(p_asset, '(null)') USING ERRCODE = 'NL005';
  END IF;
  IF v_class <> p_class THEN
    RAISE EXCEPTION 'this role may not open accounts in asset %', p_asset USING ERRCODE = 'NL004';
  END IF;

  INSERT INTO accounts (owner_kind, owner_id, purpose, asset)
  VALUES (p_owner_kind, p_owner_id, p_purpose, p_asset)
  ON CONFLICT (owner_kind, owner_id, purpose, asset) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT a.id INTO v_id FROM accounts a
     WHERE a.owner_kind = p_owner_kind AND a.owner_id = p_owner_id
       AND a.purpose = p_purpose AND a.asset = p_asset;
    RETURN v_id;
  END IF;

  INSERT INTO balances (account_id, allow_negative) VALUES (v_id, false);
  RETURN v_id;
END
$fn$;

CREATE FUNCTION ledger.open_game_account(
  p_owner_kind ledger.owner_kind, p_owner_id text, p_purpose text, p_asset text
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$ SELECT ledger._open_account(p_owner_kind, p_owner_id, p_purpose, p_asset, 'game'); $fn$;

CREATE FUNCTION ledger.open_external_account(
  p_owner_kind ledger.owner_kind, p_owner_id text, p_purpose text, p_asset text
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$ SELECT ledger._open_account(p_owner_kind, p_owner_id, p_purpose, p_asset, 'external'); $fn$;

-- Balance reads are scoped the same way as writes: the gameplay role cannot
-- read what a player holds in bitcoin.
CREATE FUNCTION ledger._balance(p_account uuid, p_class ledger.value_class) RETURNS bigint
LANGUAGE plpgsql STABLE
SET search_path = ledger, pg_temp
AS $fn$
DECLARE
  v_balance bigint;
  v_class   ledger.value_class;
BEGIN
  SELECT b.balance, s.class INTO v_balance, v_class
    FROM balances b
    JOIN accounts a ON a.id = b.account_id
    JOIN assets s   ON s.code = a.asset
   WHERE b.account_id = p_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account % does not exist', p_account USING ERRCODE = 'NL006';
  END IF;
  IF v_class <> p_class THEN
    RAISE EXCEPTION 'this role may not read account %', p_account USING ERRCODE = 'NL004';
  END IF;
  RETURN v_balance;
END
$fn$;

CREATE FUNCTION ledger.game_balance(p_account uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$ SELECT ledger._balance(p_account, 'game'); $fn$;

CREATE FUNCTION ledger.external_balance(p_account uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$ SELECT ledger._balance(p_account, 'external'); $fn$;

-- ---------------------------------------------------------------------------
-- Reconciliation. Returns no rows when the ledger is consistent.
-- This version scans everything; an incremental version is needed before the
-- tables grow large.
-- ---------------------------------------------------------------------------

CREATE FUNCTION ledger.reconcile() RETURNS TABLE (check_name text, subject text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ledger, pg_temp
AS $fn$
  -- every transaction sums to zero per asset
  SELECT 'transaction_not_zero_sum', e.txn_id::text, format('asset %s sums to %s', e.asset, sum(e.amount))
    FROM entries e GROUP BY e.txn_id, e.asset HAVING sum(e.amount) <> 0
  UNION ALL
  -- every transaction has at least two entries
  SELECT 'transaction_without_entries', t.id::text, format('%s entries', count(e.txn_id))
    FROM transactions t LEFT JOIN entries e ON e.txn_id = t.id
   GROUP BY t.id HAVING count(e.txn_id) < 2
  UNION ALL
  -- the cached balance equals the sum of the account's entries
  SELECT 'balance_differs_from_entries', b.account_id::text,
         format('balance %s, entries sum to %s', b.balance, coalesce(sum(e.amount), 0))
    FROM balances b LEFT JOIN entries e ON e.account_id = b.account_id
   GROUP BY b.account_id, b.balance
  HAVING b.balance <> coalesce(sum(e.amount), 0)
  UNION ALL
  -- the newest entry's running balance equals the cached balance
  SELECT 'running_balance_differs', b.account_id::text,
         format('balance %s, last entry says %s', b.balance, last.balance_after)
    FROM balances b
    JOIN LATERAL (SELECT e.balance_after FROM entries e
                   WHERE e.account_id = b.account_id ORDER BY e.seq DESC LIMIT 1) last ON true
   WHERE last.balance_after <> b.balance
  UNION ALL
  -- every account has a balance row
  SELECT 'account_without_balance', a.id::text, ''
    FROM accounts a LEFT JOIN balances b ON b.account_id = a.id WHERE b.account_id IS NULL
  UNION ALL
  -- nothing is negative that may not be
  SELECT 'negative_balance', b.account_id::text, format('balance %s', b.balance)
    FROM balances b WHERE b.balance < 0 AND NOT b.allow_negative
  UNION ALL
  -- value is conserved: all balances of an asset sum to zero
  SELECT 'asset_not_conserved', a.asset, format('balances sum to %s', sum(b.balance))
    FROM balances b JOIN accounts a ON a.id = b.account_id
   GROUP BY a.asset HAVING sum(b.balance) <> 0;
$fn$;

-- Amount of each asset in circulation: what everyone other than the
-- operator's two mirror accounts holds. For bitcoin this equals what the
-- operator's wallet must hold on chain.
CREATE VIEW ledger.supply AS
  SELECT a.asset,
         s.class,
         -coalesce(sum(b.balance) FILTER (WHERE b.allow_negative), 0)::bigint AS in_circulation
    FROM ledger.balances b
    JOIN ledger.accounts a ON a.id = b.account_id
    JOIN ledger.assets s   ON s.code = a.asset
   GROUP BY a.asset, s.class;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

-- TBTC is test bitcoin on a private regtest chain. It has no value. There is
-- deliberately no BTC row: creating one is refused while this is a sandbox.
INSERT INTO ledger.assets (code, class, minor_units, network, description) VALUES
  ('TBTC', 'external', 8, 'regtest', 'Sandbox test bitcoin, in satoshis. No value. Development and testing only.'),
  ('CWR',  'game',     0, 'internal', 'In-game currency, whole units. Working name "cowrie". Not legal tender of any country.');

INSERT INTO ledger.transaction_kinds (kind, scope, description) VALUES
  ('transfer',          'game',   'Player-to-player or account-to-account movement of in-game currency'),
  ('wage',              'game',   'Payroll from an employer to an employee'),
  ('goods_purchase',    'game',   'Payment for goods or services'),
  ('land_purchase',     'game',   'Payment for a land title or lease'),
  ('government_fee',    'game',   'Permit, licence, tax or fine paid to a government account'),
  ('issuance',          'game',   'Operator issues in-game currency into circulation'),
  ('retirement',        'game',   'In-game currency removed from circulation'),
  -- Kinds are named for what happens, not for the asset, so a later asset reuses them.
  ('deposit',                'external', 'Confirmed on-chain deposit credited to a player'),
  ('withdrawal_hold',        'external', 'Withdrawal requested: amount and fee held'),
  ('withdrawal_release',     'external', 'Withdrawal not sent: held amount returned'),
  ('withdrawal_settle',      'external', 'Withdrawal confirmed on chain'),
  ('reserve_release',        'external', 'Operator moves bitcoin from the conversion reserve to revenue'),
  ('conversion',             'bridge',   'Player converts deposited bitcoin into in-game currency'),
  ('redemption_hold',        'bridge',   'Redemption requested: in-game currency held'),
  ('redemption_release',     'bridge',   'Redemption declined: in-game currency returned'),
  ('redemption',             'bridge',   'Redemption authorised: in-game currency retired, bitcoin released from reserve');

-- Operator accounts. The two that may go negative mirror everything in
-- circulation: issuance mirrors the in-game currency supply, and chain_custody
-- mirrors the bitcoin the operator's wallet holds on chain.
WITH new_accounts AS (
  INSERT INTO ledger.accounts (owner_kind, owner_id, purpose, asset, allow_negative) VALUES
    ('system', 'operator', 'issuance',           'CWR',  true),
    ('system', 'operator', 'redemption_escrow',  'CWR',  false),
    ('system', 'operator', 'chain_custody',      'TBTC', true),
    ('system', 'operator', 'conversion_reserve', 'TBTC', false),
    ('system', 'operator', 'withdrawal_pending', 'TBTC', false),
    ('system', 'operator', 'revenue',            'TBTC', false)
  RETURNING id, allow_negative
)
INSERT INTO ledger.balances (account_id, allow_negative)
SELECT id, allow_negative FROM new_accounts;

-- ---------------------------------------------------------------------------
-- Privileges. Functions are executable by PUBLIC by default; take that away
-- first, then grant each role exactly what it needs.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES    IN SCHEMA ledger FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ledger FROM PUBLIC;

GRANT USAGE ON SCHEMA ledger TO nlw_gameplay, nlw_monetary, nlw_settlement, nlw_ledger_admin, nlw_auditor;

GRANT EXECUTE ON FUNCTION ledger.post_game(text, text, text, text, jsonb, jsonb)       TO nlw_gameplay;
GRANT EXECUTE ON FUNCTION ledger.open_game_account(ledger.owner_kind, text, text, text) TO nlw_gameplay, nlw_monetary;
GRANT EXECUTE ON FUNCTION ledger.game_balance(uuid)                                     TO nlw_gameplay, nlw_monetary;

GRANT EXECUTE ON FUNCTION ledger.post_monetary(text, text, text, text, jsonb, jsonb)   TO nlw_monetary;

GRANT EXECUTE ON FUNCTION ledger.post_settlement(text, text, text, text, jsonb, jsonb)      TO nlw_settlement;
GRANT EXECUTE ON FUNCTION ledger.open_external_account(ledger.owner_kind, text, text, text) TO nlw_settlement;
GRANT EXECUTE ON FUNCTION ledger.open_game_account(ledger.owner_kind, text, text, text)     TO nlw_settlement;
GRANT EXECUTE ON FUNCTION ledger.external_balance(uuid)                                     TO nlw_settlement;

GRANT EXECUTE ON FUNCTION ledger.post_reversal(text, uuid, text, text)                  TO nlw_ledger_admin;

GRANT SELECT ON ALL TABLES IN SCHEMA ledger TO nlw_auditor;
GRANT EXECUTE ON FUNCTION ledger.reconcile() TO nlw_auditor, nlw_ledger_admin;
