-- Nigeria Life World: settlement service data model, migration 0002.
--
-- Everything to do with bitcoin lives here: deposit addresses, what the chain
-- has shown us, conversion quotes, the withdrawal pipeline, the redemption
-- gate and the audit trail. Gameplay roles have no access to this schema.
--
-- What is NOT here, by design: private keys, seeds, or anything that can
-- sign. Addresses are derived from an extended PUBLIC key by the wallet
-- service; signing is done by a separate signer that holds the keys in an
-- HSM or an offline device and sees only withdrawals this schema has approved.
--
-- Each kind of actor has its own role and can do only its own step:
--   nlw_settlement     accounts, quotes, conversion, withdrawal requests
--   nlw_chain_watcher  reports what the chain shows; cannot approve anything
--   nlw_signer         fetches approved withdrawals, reports the broadcast
--   nlw_compliance     reviews held withdrawals and redemptions, freezes accounts
--
-- These tables may live in a different database from the ledger. Every call
-- into the ledger carries an idempotency key derived from the chain or from
-- the request id, so a retry after a partial failure cannot post twice.
--
-- SANDBOX ONLY as shipped: the policy row names the regtest network and
-- accepts only regtest/testnet address forms. The ledger refuses to hold a
-- mainnet asset while its environment is 'sandbox'.

DO $roles$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['nlw_chain_watcher', 'nlw_signer', 'nlw_compliance'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$roles$;

CREATE SCHEMA settlement;
REVOKE ALL ON SCHEMA settlement FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Policy: one row, changed only by migration.
-- ---------------------------------------------------------------------------

CREATE TABLE settlement.policy (
  only_row                boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  asset                   text NOT NULL REFERENCES ledger.assets (code),
  game_asset              text NOT NULL REFERENCES ledger.assets (code),
  address_pattern         text NOT NULL,
  confirmations_required  int NOT NULL CHECK (confirmations_required >= 1),
  -- Platform conversion rate: cowries = floor(sats * rate_cowries / rate_sats).
  rate_cowries            bigint NOT NULL CHECK (rate_cowries > 0),
  rate_sats               bigint NOT NULL CHECK (rate_sats > 0),
  quote_lifetime          interval NOT NULL,
  min_withdrawal_sats     bigint NOT NULL,
  withdrawal_fee_sats     bigint NOT NULL,
  daily_withdrawal_sats   bigint NOT NULL,
  review_above_sats       bigint NOT NULL,
  -- In-game currency is not redeemable for bitcoin unless this is true AND a
  -- compliance officer authorises each request.
  redemption_enabled      boolean NOT NULL DEFAULT false
);

INSERT INTO settlement.policy (asset, game_asset, address_pattern, confirmations_required, rate_cowries, rate_sats,
                               quote_lifetime, min_withdrawal_sats, withdrawal_fee_sats, daily_withdrawal_sats, review_above_sats)
VALUES ('TBTC', 'CWR', '^(bcrt1|tb1)[02-9ac-hj-np-z]{20,80}$', 3, 1, 2,
        interval '60 seconds', 10000, 1000, 500000, 300000);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE settlement.accounts (
  owner_id      text PRIMARY KEY CHECK (length(owner_id) BETWEEN 1 AND 128),
  btc_account   uuid NOT NULL UNIQUE,
  game_account  uuid NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen')),
  -- Result of identity verification done by an external provider. Only the
  -- level and the provider's reference are kept, never documents.
  verification  text NOT NULL DEFAULT 'none' CHECK (verification IN ('none', 'basic', 'full')),
  provider_ref  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlement.deposit_addresses (
  address           text PRIMARY KEY,
  owner_id          text NOT NULL REFERENCES settlement.accounts (owner_id),
  derivation_index  bigint NOT NULL UNIQUE CHECK (derivation_index >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlement.deposits (
  txid           text NOT NULL CHECK (txid ~ '^[0-9a-f]{64}$'),
  vout           int NOT NULL CHECK (vout >= 0),
  address        text NOT NULL REFERENCES settlement.deposit_addresses (address),
  amount_sats    bigint NOT NULL CHECK (amount_sats > 0),
  block_height   bigint,
  confirmations  int NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  screening      text NOT NULL DEFAULT 'clear' CHECK (screening IN ('clear', 'flagged')),
  status         text NOT NULL DEFAULT 'seen' CHECK (status IN ('seen', 'confirming', 'credited', 'orphaned')),
  ledger_txn     uuid,
  first_seen     timestamptz NOT NULL DEFAULT now(),
  credited_at    timestamptz,
  PRIMARY KEY (txid, vout),
  CONSTRAINT credited_has_ledger_txn CHECK ((status = 'credited') = (ledger_txn IS NOT NULL))
);

CREATE TABLE settlement.quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    text NOT NULL REFERENCES settlement.accounts (owner_id),
  sats        bigint NOT NULL CHECK (sats > 0),
  cowries     bigint NOT NULL CHECK (cowries > 0),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlement.withdrawals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          text NOT NULL REFERENCES settlement.accounts (owner_id),
  address           text NOT NULL,
  amount_sats       bigint NOT NULL CHECK (amount_sats > 0),
  fee_sats          bigint NOT NULL CHECK (fee_sats >= 0),
  status            text NOT NULL CHECK (status IN ('manual_review', 'approved', 'signing', 'broadcast', 'settled', 'rejected')),
  checks            jsonb NOT NULL,
  reviewer          text,
  txid              text UNIQUE CHECK (txid ~ '^[0-9a-f]{64}$'),
  network_fee_sats  bigint CHECK (network_fee_sats >= 0),
  confirmations     int NOT NULL DEFAULT 0,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  settled_at        timestamptz
);
CREATE INDEX withdrawals_owner_time ON settlement.withdrawals (owner_id, requested_at);

CREATE TABLE settlement.redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      text NOT NULL REFERENCES settlement.accounts (owner_id),
  cowries       bigint NOT NULL CHECK (cowries > 0),
  sats          bigint NOT NULL CHECK (sats > 0),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorised', 'declined')),
  officer       text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);

CREATE TABLE settlement.audit_log (
  seq      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor    text NOT NULL,
  action   text NOT NULL,
  subject  text NOT NULL,
  detail   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE FUNCTION settlement._deny_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'settlement.% cannot be changed this way', TG_TABLE_NAME USING ERRCODE = 'ST009';
END
$fn$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON settlement.audit_log
  FOR EACH ROW EXECUTE FUNCTION settlement._deny_mutation();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON settlement.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION settlement._deny_mutation();
CREATE TRIGGER policy_fixed BEFORE INSERT OR UPDATE OR DELETE ON settlement.policy
  FOR EACH ROW EXECUTE FUNCTION settlement._deny_mutation();

-- ---------------------------------------------------------------------------
-- Helpers
--
-- Error codes (SQLSTATE): ST001 unknown or frozen account, ST002 bad address,
-- ST003 amount outside limits, ST004 quote unusable, ST005 wrong state,
-- ST006 reviewer required, ST007 insufficient bitcoin, ST008 reserve short,
-- ST009 immutable, ST010 redemption not enabled.
-- ---------------------------------------------------------------------------

CREATE FUNCTION settlement._log(p_actor text, p_action text, p_subject text, p_detail jsonb DEFAULT '{}') RETURNS void
LANGUAGE sql SET search_path = settlement, pg_temp
AS $fn$ INSERT INTO settlement.audit_log (actor, action, subject, detail) VALUES (p_actor, p_action, p_subject, p_detail); $fn$;

CREATE FUNCTION settlement._system_account(p_purpose text, p_asset text) RETURNS uuid
LANGUAGE sql STABLE SET search_path = settlement, pg_temp
AS $fn$ SELECT id FROM ledger.accounts WHERE owner_kind = 'system' AND owner_id = 'operator' AND purpose = p_purpose AND asset = p_asset; $fn$;

CREATE FUNCTION settlement._active_account(p_owner text) RETURNS settlement.accounts
LANGUAGE plpgsql SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  a settlement.accounts;
BEGIN
  SELECT * INTO a FROM accounts WHERE owner_id = p_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'no settlement account for %', p_owner USING ERRCODE = 'ST001'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'settlement account % is frozen pending review', p_owner USING ERRCODE = 'ST001'; END IF;
  RETURN a;
END
$fn$;

CREATE FUNCTION settlement._entries(VARIADIC p_pairs text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT jsonb_agg(jsonb_build_object('account', p_pairs[i], 'amount', p_pairs[i + 1]::bigint) ORDER BY i)
    FROM generate_series(1, array_length(p_pairs, 1), 2) AS i;
$fn$;

-- ---------------------------------------------------------------------------
-- Accounts and addresses (settlement service)
-- ---------------------------------------------------------------------------

CREATE FUNCTION settlement.open_account(p_owner text) RETURNS settlement.accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  a settlement.accounts;
BEGIN
  SELECT * INTO a FROM accounts WHERE owner_id = p_owner;
  IF FOUND THEN RETURN a; END IF;
  SELECT * INTO pol FROM policy;
  INSERT INTO accounts (owner_id, btc_account, game_account)
  VALUES (p_owner,
          ledger.open_external_account('player', p_owner, 'settlement', pol.asset),
          ledger.open_game_account('player', p_owner, 'wallet', pol.game_asset))
  ON CONFLICT (owner_id) DO NOTHING;
  SELECT * INTO a FROM accounts WHERE owner_id = p_owner;
  PERFORM _log('svc:settlement', 'account_opened', p_owner);
  RETURN a;
END
$fn$;

-- The wallet service derives the address from an extended public key and
-- records it here with its derivation index. No key material is stored.
CREATE FUNCTION settlement.register_address(p_owner text, p_address text, p_index bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
BEGIN
  PERFORM _active_account(p_owner);
  IF p_address IS NULL OR p_address !~ (SELECT address_pattern FROM policy) THEN
    RAISE EXCEPTION 'address is not valid for this network' USING ERRCODE = 'ST002';
  END IF;
  INSERT INTO deposit_addresses (address, owner_id, derivation_index) VALUES (p_address, p_owner, p_index);
  PERFORM _log('svc:wallet', 'address_registered', p_owner, jsonb_build_object('address', p_address, 'index', p_index));
END
$fn$;

-- ---------------------------------------------------------------------------
-- Deposits (chain watcher)
-- ---------------------------------------------------------------------------

-- Called every time the watcher's view of an output changes. Safe to call any
-- number of times with the same facts. A deposit is credited once, when it
-- has enough confirmations, is not flagged, and its account is active.
CREATE FUNCTION settlement.observe_deposit(
  p_txid text, p_vout int, p_address text, p_amount_sats bigint, p_block_height bigint, p_confirmations int
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  d settlement.deposits;
  a settlement.accounts;
  v_txn uuid;
BEGIN
  SELECT * INTO pol FROM policy;
  IF NOT EXISTS (SELECT 1 FROM deposit_addresses WHERE address = p_address) THEN
    RAISE EXCEPTION 'address % is not one of our deposit addresses', p_address USING ERRCODE = 'ST002';
  END IF;
  INSERT INTO deposits (txid, vout, address, amount_sats, block_height, confirmations)
  VALUES (p_txid, p_vout, p_address, p_amount_sats, p_block_height, greatest(p_confirmations, 0))
  ON CONFLICT (txid, vout) DO NOTHING;
  SELECT * INTO d FROM deposits WHERE txid = p_txid AND vout = p_vout FOR UPDATE;
  IF d.address <> p_address OR d.amount_sats <> p_amount_sats THEN
    RAISE EXCEPTION 'output %:% was first seen with a different address or amount', p_txid, p_vout USING ERRCODE = 'ST005';
  END IF;

  IF d.status = 'credited' THEN
    IF p_confirmations <= 0 THEN
      -- A credited deposit has left the chain. The ledger is not rewritten
      -- automatically; the account is frozen and a person decides.
      SELECT * INTO a FROM accounts WHERE owner_id = (SELECT owner_id FROM deposit_addresses WHERE address = d.address);
      UPDATE accounts SET status = 'frozen' WHERE owner_id = a.owner_id;
      PERFORM _log('svc:chain-watcher', 'reorg_after_credit', a.owner_id, jsonb_build_object('txid', p_txid, 'vout', p_vout));
      RETURN 'reorg_after_credit';
    END IF;
    UPDATE deposits SET confirmations = p_confirmations, block_height = p_block_height WHERE txid = p_txid AND vout = p_vout;
    RETURN 'credited';
  END IF;

  UPDATE deposits
     SET confirmations = greatest(p_confirmations, 0), block_height = p_block_height,
         status = CASE WHEN p_confirmations <= 0 AND d.block_height IS NOT NULL THEN 'orphaned' WHEN p_confirmations > 0 THEN 'confirming' ELSE 'seen' END
   WHERE txid = p_txid AND vout = p_vout
  RETURNING * INTO d;

  IF d.confirmations < pol.confirmations_required OR d.screening <> 'clear' THEN RETURN d.status; END IF;
  SELECT acc.* INTO a FROM accounts acc JOIN deposit_addresses da ON da.owner_id = acc.owner_id WHERE da.address = d.address;
  IF a.status <> 'active' THEN RETURN d.status; END IF;

  SELECT transaction_id INTO v_txn FROM ledger.post_settlement(
    format('deposit:%s:%s:%s', pol.asset, p_txid, p_vout), 'deposit', 'svc:settlement', 'Confirmed on-chain deposit',
    _entries(_system_account('chain_custody', pol.asset)::text, (-d.amount_sats)::text, a.btc_account::text, d.amount_sats::text),
    jsonb_build_object('txid', p_txid, 'vout', p_vout, 'confirmations', d.confirmations));
  UPDATE deposits SET status = 'credited', ledger_txn = v_txn, credited_at = now() WHERE txid = p_txid AND vout = p_vout;
  PERFORM _log('svc:settlement', 'deposit_credited', a.owner_id, jsonb_build_object('txid', p_txid, 'vout', p_vout, 'sats', d.amount_sats, 'ledger_txn', v_txn));
  RETURN 'credited';
END
$fn$;

-- ---------------------------------------------------------------------------
-- Conversion: bitcoin into in-game currency (settlement service)
-- ---------------------------------------------------------------------------

CREATE FUNCTION settlement.request_quote(p_owner text, p_sats bigint) RETURNS settlement.quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  q settlement.quotes;
  v_cowries bigint;
BEGIN
  PERFORM _active_account(p_owner);
  SELECT * INTO pol FROM policy;
  IF p_sats IS NULL OR p_sats <= 0 THEN RAISE EXCEPTION 'amount must be a positive number of satoshis' USING ERRCODE = 'ST003'; END IF;
  v_cowries := floor(p_sats::numeric * pol.rate_cowries / pol.rate_sats);
  IF v_cowries < 1 THEN RAISE EXCEPTION 'amount converts to less than one unit of in-game currency' USING ERRCODE = 'ST003'; END IF;
  INSERT INTO quotes (owner_id, sats, cowries, expires_at) VALUES (p_owner, p_sats, v_cowries, now() + pol.quote_lifetime) RETURNING * INTO q;
  RETURN q;
END
$fn$;

-- One ledger transaction moves the bitcoin into the conversion reserve and
-- issues the in-game currency. Either both happen or neither does.
CREATE FUNCTION settlement.accept_quote(p_owner text, p_quote uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  a settlement.accounts;
  q settlement.quotes;
  v_txn uuid;
BEGIN
  a := _active_account(p_owner);
  SELECT * INTO pol FROM policy;
  SELECT * INTO q FROM quotes WHERE id = p_quote AND owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such quote' USING ERRCODE = 'ST004'; END IF;
  IF q.used_at IS NOT NULL THEN RAISE EXCEPTION 'quote has already been used' USING ERRCODE = 'ST004'; END IF;
  IF q.expires_at < now() THEN RAISE EXCEPTION 'quote has expired' USING ERRCODE = 'ST004'; END IF;
  BEGIN
    SELECT transaction_id INTO v_txn FROM ledger.post_settlement(
      format('conversion:%s', q.id), 'conversion', 'svc:settlement', 'Bitcoin converted to in-game currency',
      _entries(a.btc_account::text, (-q.sats)::text, _system_account('conversion_reserve', pol.asset)::text, q.sats::text,
               _system_account('issuance', pol.game_asset)::text, (-q.cowries)::text, a.game_account::text, q.cowries::text),
      jsonb_build_object('quote', q.id, 'rate', format('%s/%s', pol.rate_cowries, pol.rate_sats)));
  EXCEPTION WHEN SQLSTATE 'NL001' THEN
    RAISE EXCEPTION 'not enough confirmed bitcoin for this quote' USING ERRCODE = 'ST007';
  END;
  UPDATE quotes SET used_at = now() WHERE id = q.id;
  PERFORM _log('svc:settlement', 'converted', p_owner, jsonb_build_object('quote', q.id, 'sats', q.sats, 'cowries', q.cowries, 'ledger_txn', v_txn));
  RETURN v_txn;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Withdrawals: request (service) -> review (compliance) -> sign (signer)
--              -> confirm (watcher)
-- ---------------------------------------------------------------------------

CREATE FUNCTION settlement.request_withdrawal(p_owner text, p_address text, p_sats bigint) RETURNS settlement.withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  a settlement.accounts;
  w settlement.withdrawals;
  v_id uuid := gen_random_uuid();
  v_day bigint;
  v_review boolean;
BEGIN
  a := _active_account(p_owner);
  SELECT * INTO pol FROM policy;
  IF p_sats IS NULL OR p_sats < pol.min_withdrawal_sats THEN
    RAISE EXCEPTION 'the minimum withdrawal is % satoshis', pol.min_withdrawal_sats USING ERRCODE = 'ST003';
  END IF;
  IF p_address IS NULL OR p_address !~ pol.address_pattern THEN
    RAISE EXCEPTION 'address is not valid for this network' USING ERRCODE = 'ST002';
  END IF;
  IF EXISTS (SELECT 1 FROM deposit_addresses WHERE address = p_address) THEN
    RAISE EXCEPTION 'that address is one of our own deposit addresses' USING ERRCODE = 'ST002';
  END IF;
  SELECT coalesce(sum(amount_sats), 0) INTO v_day FROM withdrawals
   WHERE owner_id = p_owner AND status <> 'rejected' AND requested_at > now() - interval '24 hours';
  IF v_day + p_sats > pol.daily_withdrawal_sats THEN
    RAISE EXCEPTION 'that would exceed the daily withdrawal limit of % satoshis', pol.daily_withdrawal_sats USING ERRCODE = 'ST003';
  END IF;

  BEGIN
    PERFORM ledger.post_settlement(
      format('withdrawal_hold:%s', v_id), 'withdrawal_hold', 'svc:settlement', 'Withdrawal requested: funds held',
      _entries(a.btc_account::text, (-(p_sats + pol.withdrawal_fee_sats))::text,
               _system_account('withdrawal_pending', pol.asset)::text, (p_sats + pol.withdrawal_fee_sats)::text),
      jsonb_build_object('withdrawal', v_id));
  EXCEPTION WHEN SQLSTATE 'NL001' THEN
    RAISE EXCEPTION 'not enough confirmed bitcoin to cover the amount and the fee' USING ERRCODE = 'ST007';
  END;

  v_review := p_sats > pol.review_above_sats OR a.verification = 'none';
  INSERT INTO withdrawals (id, owner_id, address, amount_sats, fee_sats, status, checks)
  VALUES (v_id, p_owner, p_address, p_sats, pol.withdrawal_fee_sats,
          CASE WHEN v_review THEN 'manual_review' ELSE 'approved' END,
          jsonb_build_object('address_format', true, 'account_active', true, 'within_daily_limit', true,
                             'under_review_threshold', p_sats <= pol.review_above_sats, 'identity_verified', a.verification <> 'none'))
  RETURNING * INTO w;
  PERFORM _log('svc:settlement', 'withdrawal_requested', p_owner, jsonb_build_object('withdrawal', v_id, 'sats', p_sats, 'status', w.status));
  RETURN w;
END
$fn$;

CREATE FUNCTION settlement._release(p_id uuid, p_actor text) RETURNS void
LANGUAGE plpgsql SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  w settlement.withdrawals;
  a settlement.accounts;
BEGIN
  SELECT * INTO pol FROM policy;
  SELECT * INTO w FROM withdrawals WHERE id = p_id;
  SELECT * INTO a FROM accounts WHERE owner_id = w.owner_id;
  PERFORM ledger.post_settlement(
    format('withdrawal_release:%s', p_id), 'withdrawal_release', p_actor, 'Withdrawal not sent: funds returned',
    _entries(_system_account('withdrawal_pending', pol.asset)::text, (-(w.amount_sats + w.fee_sats))::text,
             a.btc_account::text, (w.amount_sats + w.fee_sats)::text),
    jsonb_build_object('withdrawal', p_id));
END
$fn$;

CREATE FUNCTION settlement.review_withdrawal(p_id uuid, p_decision text, p_reviewer text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  w settlement.withdrawals;
BEGIN
  IF p_reviewer IS NULL OR length(trim(p_reviewer)) = 0 THEN RAISE EXCEPTION 'a named reviewer is required' USING ERRCODE = 'ST006'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'decision must be approve or reject' USING ERRCODE = 'ST005'; END IF;
  SELECT * INTO w FROM withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR w.status <> 'manual_review' THEN RAISE EXCEPTION 'withdrawal is not waiting for review' USING ERRCODE = 'ST005'; END IF;
  IF p_decision = 'approve' THEN
    UPDATE withdrawals SET status = 'approved', reviewer = p_reviewer, decided_at = now() WHERE id = p_id;
  ELSE
    PERFORM _release(p_id, p_reviewer);
    UPDATE withdrawals SET status = 'rejected', reviewer = p_reviewer, decided_at = now() WHERE id = p_id;
  END IF;
  PERFORM _log(p_reviewer, 'withdrawal_' || p_decision, w.owner_id, jsonb_build_object('withdrawal', p_id));
  RETURN CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
END
$fn$;

-- The signer takes the oldest approved withdrawal. It is told the address and
-- the amount and nothing else.
CREATE FUNCTION settlement.next_to_sign() RETURNS TABLE (withdrawal_id uuid, address text, amount_sats bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  w settlement.withdrawals;
BEGIN
  SELECT * INTO w FROM withdrawals WHERE status = 'approved' ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE withdrawals SET status = 'signing' WHERE id = w.id;
  PERFORM _log('svc:signer', 'withdrawal_signing', w.owner_id, jsonb_build_object('withdrawal', w.id));
  RETURN QUERY SELECT w.id, w.address, w.amount_sats;
END
$fn$;

CREATE FUNCTION settlement.mark_broadcast(p_id uuid, p_txid text, p_network_fee_sats bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  w settlement.withdrawals;
BEGIN
  SELECT * INTO w FROM withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR w.status <> 'signing' THEN RAISE EXCEPTION 'withdrawal is not being signed' USING ERRCODE = 'ST005'; END IF;
  IF p_network_fee_sats IS NULL OR p_network_fee_sats < 0 OR p_network_fee_sats > w.fee_sats THEN
    RAISE EXCEPTION 'network fee must be between 0 and the fee charged (%)', w.fee_sats USING ERRCODE = 'ST003';
  END IF;
  UPDATE withdrawals SET status = 'broadcast', txid = p_txid, network_fee_sats = p_network_fee_sats WHERE id = p_id;
  PERFORM _log('svc:signer', 'withdrawal_broadcast', w.owner_id, jsonb_build_object('withdrawal', p_id, 'txid', p_txid));
END
$fn$;

CREATE FUNCTION settlement.observe_withdrawal(p_txid text, p_confirmations int) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  w settlement.withdrawals;
  v_txn uuid;
BEGIN
  SELECT * INTO pol FROM policy;
  SELECT * INTO w FROM withdrawals WHERE txid = p_txid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no withdrawal with that transaction id' USING ERRCODE = 'ST005'; END IF;
  IF w.status = 'settled' THEN RETURN 'settled'; END IF;
  IF w.status <> 'broadcast' THEN RAISE EXCEPTION 'withdrawal has not been broadcast' USING ERRCODE = 'ST005'; END IF;
  UPDATE withdrawals SET confirmations = greatest(p_confirmations, 0) WHERE id = w.id;
  IF p_confirmations < pol.confirmations_required THEN RETURN 'broadcast'; END IF;
  SELECT transaction_id INTO v_txn FROM ledger.post_settlement(
    format('withdrawal_settle:%s', w.id), 'withdrawal_settle', 'svc:settlement', 'Withdrawal confirmed on chain',
    CASE WHEN w.fee_sats = w.network_fee_sats THEN
      _entries(_system_account('withdrawal_pending', pol.asset)::text, (-(w.amount_sats + w.fee_sats))::text,
               _system_account('chain_custody', pol.asset)::text, (w.amount_sats + w.network_fee_sats)::text)
    ELSE
      _entries(_system_account('withdrawal_pending', pol.asset)::text, (-(w.amount_sats + w.fee_sats))::text,
               _system_account('chain_custody', pol.asset)::text, (w.amount_sats + w.network_fee_sats)::text,
               _system_account('revenue', pol.asset)::text, (w.fee_sats - w.network_fee_sats)::text)
    END,
    jsonb_build_object('withdrawal', w.id, 'txid', p_txid));
  UPDATE withdrawals SET status = 'settled', settled_at = now() WHERE id = w.id;
  PERFORM _log('svc:settlement', 'withdrawal_settled', w.owner_id, jsonb_build_object('withdrawal', w.id, 'ledger_txn', v_txn));
  RETURN 'settled';
END
$fn$;

-- ---------------------------------------------------------------------------
-- Redemption: in-game currency back into bitcoin. Off unless policy enables
-- it, and then only when a compliance officer authorises each request.
-- ---------------------------------------------------------------------------

CREATE FUNCTION settlement.request_redemption(p_owner text, p_cowries bigint) RETURNS settlement.redemptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  a settlement.accounts;
  r settlement.redemptions;
  v_id uuid := gen_random_uuid();
  v_sats bigint;
BEGIN
  a := _active_account(p_owner);
  SELECT * INTO pol FROM policy;
  IF NOT pol.redemption_enabled THEN
    RAISE EXCEPTION 'in-game currency is not redeemable for bitcoin: the settlement layer has not enabled redemption' USING ERRCODE = 'ST010';
  END IF;
  IF p_cowries IS NULL OR p_cowries <= 0 THEN RAISE EXCEPTION 'amount must be positive' USING ERRCODE = 'ST003'; END IF;
  v_sats := floor(p_cowries::numeric * pol.rate_sats / pol.rate_cowries);
  IF v_sats < 1 THEN RAISE EXCEPTION 'amount is worth less than one satoshi' USING ERRCODE = 'ST003'; END IF;
  BEGIN
    PERFORM ledger.post_settlement(
      format('redemption_hold:%s', v_id), 'redemption_hold', 'svc:settlement', 'Redemption requested: in-game currency held',
      _entries(a.game_account::text, (-p_cowries)::text, _system_account('redemption_escrow', pol.game_asset)::text, p_cowries::text),
      jsonb_build_object('redemption', v_id));
  EXCEPTION WHEN SQLSTATE 'NL001' THEN
    RAISE EXCEPTION 'not enough in-game currency' USING ERRCODE = 'ST007';
  END;
  INSERT INTO redemptions (id, owner_id, cowries, sats) VALUES (v_id, p_owner, p_cowries, v_sats) RETURNING * INTO r;
  PERFORM _log('svc:settlement', 'redemption_requested', p_owner, jsonb_build_object('redemption', v_id, 'cowries', p_cowries, 'sats', v_sats));
  RETURN r;
END
$fn$;

CREATE FUNCTION settlement.decide_redemption(p_id uuid, p_decision text, p_officer text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
DECLARE
  pol settlement.policy;
  r settlement.redemptions;
  a settlement.accounts;
BEGIN
  IF p_officer IS NULL OR length(trim(p_officer)) = 0 THEN RAISE EXCEPTION 'a named officer is required' USING ERRCODE = 'ST006'; END IF;
  IF p_decision NOT IN ('authorise', 'decline') THEN RAISE EXCEPTION 'decision must be authorise or decline' USING ERRCODE = 'ST005'; END IF;
  SELECT * INTO pol FROM policy;
  SELECT * INTO r FROM redemptions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'redemption is not waiting for a decision' USING ERRCODE = 'ST005'; END IF;
  SELECT * INTO a FROM accounts WHERE owner_id = r.owner_id;
  IF p_decision = 'authorise' THEN
    BEGIN
      PERFORM ledger.post_settlement(
        format('redemption:%s', p_id), 'redemption', p_officer, 'Redemption authorised by settlement',
        _entries(_system_account('redemption_escrow', pol.game_asset)::text, (-r.cowries)::text, _system_account('issuance', pol.game_asset)::text, r.cowries::text,
                 _system_account('conversion_reserve', pol.asset)::text, (-r.sats)::text, a.btc_account::text, r.sats::text),
        jsonb_build_object('redemption', p_id));
    EXCEPTION WHEN SQLSTATE 'NL001' THEN
      RAISE EXCEPTION 'the conversion reserve does not cover this redemption' USING ERRCODE = 'ST008';
    END;
    UPDATE redemptions SET status = 'authorised', officer = p_officer, decided_at = now() WHERE id = p_id;
  ELSE
    PERFORM ledger.post_settlement(
      format('redemption_release:%s', p_id), 'redemption_release', p_officer, 'Redemption declined: in-game currency returned',
      _entries(_system_account('redemption_escrow', pol.game_asset)::text, (-r.cowries)::text, a.game_account::text, r.cowries::text),
      jsonb_build_object('redemption', p_id));
    UPDATE redemptions SET status = 'declined', officer = p_officer, decided_at = now() WHERE id = p_id;
  END IF;
  PERFORM _log(p_officer, 'redemption_' || p_decision, r.owner_id, jsonb_build_object('redemption', p_id));
  RETURN CASE WHEN p_decision = 'authorise' THEN 'authorised' ELSE 'declined' END;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Compliance controls
-- ---------------------------------------------------------------------------

CREATE FUNCTION settlement.set_account_status(p_owner text, p_status text, p_officer text, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
BEGIN
  IF p_officer IS NULL OR length(trim(p_officer)) = 0 OR p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'a named officer and a reason are required' USING ERRCODE = 'ST006';
  END IF;
  UPDATE accounts SET status = p_status WHERE owner_id = p_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'no settlement account for %', p_owner USING ERRCODE = 'ST001'; END IF;
  PERFORM _log(p_officer, 'account_' || p_status, p_owner, jsonb_build_object('reason', p_reason));
END
$fn$;

CREATE FUNCTION settlement.set_verification(p_owner text, p_level text, p_provider_ref text, p_officer text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
BEGIN
  IF p_officer IS NULL OR length(trim(p_officer)) = 0 THEN RAISE EXCEPTION 'a named officer is required' USING ERRCODE = 'ST006'; END IF;
  UPDATE accounts SET verification = p_level, provider_ref = p_provider_ref WHERE owner_id = p_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'no settlement account for %', p_owner USING ERRCODE = 'ST001'; END IF;
  PERFORM _log(p_officer, 'verification_set', p_owner, jsonb_build_object('level', p_level));
END
$fn$;

CREATE FUNCTION settlement.flag_deposit(p_txid text, p_vout int, p_officer text, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
BEGIN
  IF p_officer IS NULL OR length(trim(p_officer)) = 0 THEN RAISE EXCEPTION 'a named officer is required' USING ERRCODE = 'ST006'; END IF;
  UPDATE deposits SET screening = 'flagged' WHERE txid = p_txid AND vout = p_vout AND status <> 'credited';
  IF NOT FOUND THEN RAISE EXCEPTION 'no uncredited deposit %:%', p_txid, p_vout USING ERRCODE = 'ST005'; END IF;
  PERFORM _log(p_officer, 'deposit_flagged', format('%s:%s', p_txid, p_vout), jsonb_build_object('reason', p_reason));
END
$fn$;

-- What the books say the operator's wallet must hold, against what the wallet
-- reports it does hold. Any difference is a finding.
CREATE FUNCTION settlement.proof_of_reserves(p_wallet_sats bigint)
RETURNS TABLE (wallet_sats bigint, ledger_sats bigint, uncredited_sats bigint, sent_unsettled_sats bigint, difference bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = settlement, pg_temp
AS $fn$
  WITH pol AS (SELECT * FROM settlement.policy),
  books AS (SELECT -b.balance AS sats FROM ledger.balances b WHERE b.account_id = settlement._system_account('chain_custody', (SELECT asset FROM pol))),
  pending AS (SELECT coalesce(sum(amount_sats), 0)::bigint AS sats FROM settlement.deposits WHERE status = 'confirming'),
  sent AS (SELECT coalesce(sum(amount_sats + network_fee_sats), 0)::bigint AS sats FROM settlement.withdrawals WHERE status = 'broadcast' AND confirmations > 0)
  SELECT p_wallet_sats, books.sats, pending.sats, sent.sats, p_wallet_sats - pending.sats + sent.sats - books.sats
    FROM books, pending, sent;
$fn$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES    IN SCHEMA settlement FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA settlement FROM PUBLIC;
GRANT USAGE ON SCHEMA settlement TO nlw_settlement, nlw_chain_watcher, nlw_signer, nlw_compliance, nlw_auditor;

GRANT EXECUTE ON FUNCTION settlement.open_account(text)                         TO nlw_settlement;
GRANT EXECUTE ON FUNCTION settlement.register_address(text, text, bigint)       TO nlw_settlement;
GRANT EXECUTE ON FUNCTION settlement.request_quote(text, bigint)                TO nlw_settlement;
GRANT EXECUTE ON FUNCTION settlement.accept_quote(text, uuid)                   TO nlw_settlement;
GRANT EXECUTE ON FUNCTION settlement.request_withdrawal(text, text, bigint)     TO nlw_settlement;
GRANT EXECUTE ON FUNCTION settlement.request_redemption(text, bigint)           TO nlw_settlement;
GRANT SELECT ON settlement.accounts, settlement.deposit_addresses, settlement.deposits, settlement.quotes,
                settlement.withdrawals, settlement.redemptions, settlement.policy TO nlw_settlement;

GRANT EXECUTE ON FUNCTION settlement.observe_deposit(text, int, text, bigint, bigint, int) TO nlw_chain_watcher;
GRANT EXECUTE ON FUNCTION settlement.observe_withdrawal(text, int)                         TO nlw_chain_watcher;
GRANT SELECT ON settlement.deposit_addresses TO nlw_chain_watcher;

GRANT EXECUTE ON FUNCTION settlement.next_to_sign()                    TO nlw_signer;
GRANT EXECUTE ON FUNCTION settlement.mark_broadcast(uuid, text, bigint) TO nlw_signer;

GRANT EXECUTE ON FUNCTION settlement.review_withdrawal(uuid, text, text)        TO nlw_compliance;
GRANT EXECUTE ON FUNCTION settlement.decide_redemption(uuid, text, text)        TO nlw_compliance;
GRANT EXECUTE ON FUNCTION settlement.set_account_status(text, text, text, text) TO nlw_compliance;
GRANT EXECUTE ON FUNCTION settlement.set_verification(text, text, text, text)   TO nlw_compliance;
GRANT EXECUTE ON FUNCTION settlement.flag_deposit(text, int, text, text)        TO nlw_compliance;
GRANT SELECT ON ALL TABLES IN SCHEMA settlement TO nlw_compliance, nlw_auditor;
GRANT EXECUTE ON FUNCTION settlement.proof_of_reserves(bigint) TO nlw_auditor, nlw_compliance;
