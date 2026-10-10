-- Nigeria Life World: ledger, migration 0003.
--
-- Money that moves because of a crime, an arrest or a hospital bill.
--
-- Four kinds of transaction are added: theft, restitution, fine and
-- medical_fee. They are ordinary in-game transactions and go through
-- ledger.post_game like any other, so everything migration 0001 promises
-- still holds for them: nothing is created, a retried request has no second
-- effect, a payment larger than the balance leaves no trace.
--
-- On top of that, the ledger itself now refuses three things that the game
-- service must never do, whether through a bug, a retry storm or a
-- compromised client talking it into something:
--
--   1. Paying the same thing twice under two different idempotency keys.
--      A fine is paid once for an arrest; a hospital bill once for a quote;
--      an ambulance once for a call; a theft is recorded once for a crime.
--   2. Paying a fine to the wrong people. After an arrest by a police
--      officer the whole fine goes to one government account. After an
--      arrest by a player who is a special constable, the government has
--      its share (one part in a hundred, rounded up, never less than one
--      unit), the constable has the rest, and nobody else has anything, all
--      in the one transaction.
--   3. A transaction of these kinds that does not say which crime, arrest,
--      quote or call it belongs to.
--
-- The rules are data (ledger.kind_rules, ledger.policy), readable by the
-- auditor and changed only by a migration.
--
-- New error codes (SQLSTATE):
--   NL011 already paid: a transaction of this kind exists for this subject
--   NL012 the transaction does not have the shape its kind requires

-- ---------------------------------------------------------------------------
-- Kinds
-- ---------------------------------------------------------------------------

INSERT INTO ledger.transaction_kinds (kind, scope, description) VALUES
  ('theft',       'game', 'In-game currency taken from a victim by a culprit; recorded so that it can be recovered'),
  ('restitution', 'game', 'Stolen currency returned to a victim, or compensation paid to one, after an arrest'),
  ('fine',        'game', 'Fine paid for an arrest: to government, with the arresting constable''s share when a player made the arrest'),
  ('medical_fee', 'game', 'Hospital or clinic treatment, or an ambulance call-out');

-- ---------------------------------------------------------------------------
-- Rules for a kind
-- ---------------------------------------------------------------------------

CREATE TABLE ledger.kind_rules (
  kind          text PRIMARY KEY REFERENCES ledger.transaction_kinds (kind),
  -- metadata keys that must all be present, each a non-empty string
  required_meta text[] NOT NULL DEFAULT '{}',
  -- metadata keys of which at least one must be present
  any_meta      text[] NOT NULL DEFAULT '{}',
  -- metadata keys: for each one present, at most one transaction of this kind may ever carry that value
  once_per      text[] NOT NULL DEFAULT '{}',
  -- how many accounts may be debited and credited
  max_payers    int NOT NULL DEFAULT 1 CHECK (max_payers >= 1),
  max_payees    int NOT NULL DEFAULT 1 CHECK (max_payees >= 1),
  -- who may be paid
  payee_kinds   ledger.owner_kind[] NOT NULL DEFAULT ARRAY['player', 'business', 'government']::ledger.owner_kind[],
  note          text NOT NULL
);

INSERT INTO ledger.kind_rules (kind, required_meta, any_meta, once_per, max_payers, max_payees, payee_kinds, note) VALUES
  ('theft',       ARRAY['crime'],            '{}',                   ARRAY['crime'],         1, 1, ARRAY['player']::ledger.owner_kind[],
     'One culprit, one victim, recorded once for the crime.'),
  ('restitution', ARRAY['crime', 'arrest'],  '{}',                   '{}',                   1, 1, ARRAY['player', 'business']::ledger.owner_kind[],
     'From the culprit to the victim. May be paid in parts, each under its own idempotency key.'),
  ('fine',        ARRAY['arrest', 'officer'], '{}',                  ARRAY['arrest'],        1, 2, ARRAY['player', 'government']::ledger.owner_kind[],
     'One payer. To government in full, or split with the arresting constable by ledger.policy.'),
  ('medical_fee', '{}',                      ARRAY['quote', 'call'], ARRAY['quote', 'call'], 1, 1, ARRAY['business', 'government']::ledger.owner_kind[],
     'One patient, one hospital, clinic or government account, once for the quote or the call.');

-- Numbers the rules use. Whole numbers only.
CREATE TABLE ledger.policy (
  name  text PRIMARY KEY CHECK (name ~ '^[a-z][a-z0-9_]{2,63}$'),
  value bigint NOT NULL,
  note  text NOT NULL
);

INSERT INTO ledger.policy (name, value, note) VALUES
  ('fine_government_parts_per_hundred', 1,
   'Of a fine paid after an arrest by a player constable, this many parts in a hundred go to government, rounded up and never less than one unit. The constable has the rest.');

-- What has been paid once and may not be paid again.
CREATE TABLE ledger.paid_once (
  kind    text NOT NULL REFERENCES ledger.kind_rules (kind),
  subject text NOT NULL,          -- "<metadata key>:<value>", for example "arrest:A-000123"
  -- The transaction that paid it. Written in the same database transaction as that row, by the
  -- trigger below and by nothing else, so it cannot point at nothing. It is not declared as a
  -- foreign key so that the ledger's own guard, not a constraint, is what answers TRUNCATE.
  txn_id  uuid NOT NULL,
  PRIMARY KEY (kind, subject)
);

CREATE TRIGGER kind_rules_fixed BEFORE INSERT OR UPDATE OR DELETE ON ledger.kind_rules
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER kind_rules_no_truncate BEFORE TRUNCATE ON ledger.kind_rules
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER policy_fixed BEFORE INSERT OR UPDATE OR DELETE ON ledger.policy
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER policy_no_truncate BEFORE TRUNCATE ON ledger.policy
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER paid_once_append_only BEFORE UPDATE OR DELETE ON ledger.paid_once
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER paid_once_no_truncate BEFORE TRUNCATE ON ledger.paid_once
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();

-- ---------------------------------------------------------------------------
-- 1 and 3: what the transaction says about itself, and whether it has been
-- paid before. Runs when the transaction row is written, inside the posting
-- function, before any balance moves. A retried request never reaches this:
-- its row is not written a second time.
-- ---------------------------------------------------------------------------

CREATE FUNCTION ledger._check_kind_header() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ledger, pg_temp AS $fn$
DECLARE
  v_rule ledger.kind_rules%ROWTYPE;
  v_key  text;
  v_any  boolean := false;
BEGIN
  IF NEW.reverses IS NOT NULL THEN
    RETURN NULL;                 -- a reversal mirrors its original and is governed by post_reversal
  END IF;
  SELECT * INTO v_rule FROM kind_rules r WHERE r.kind = NEW.kind;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY v_rule.required_meta LOOP
    IF jsonb_typeof(NEW.metadata -> v_key) IS DISTINCT FROM 'string' OR NEW.metadata ->> v_key = '' THEN
      RAISE EXCEPTION 'a % transaction must say which % it is for', NEW.kind, v_key USING ERRCODE = 'NL012';
    END IF;
  END LOOP;

  IF cardinality(v_rule.any_meta) > 0 THEN
    FOREACH v_key IN ARRAY v_rule.any_meta LOOP
      IF jsonb_typeof(NEW.metadata -> v_key) = 'string' AND NEW.metadata ->> v_key <> '' THEN
        v_any := true;
      END IF;
    END LOOP;
    IF NOT v_any THEN
      RAISE EXCEPTION 'a % transaction must name one of: %', NEW.kind, array_to_string(v_rule.any_meta, ', ')
        USING ERRCODE = 'NL012';
    END IF;
  END IF;

  FOREACH v_key IN ARRAY v_rule.once_per LOOP
    IF jsonb_typeof(NEW.metadata -> v_key) = 'string' AND NEW.metadata ->> v_key <> '' THEN
      BEGIN
        -- Two requests for the same subject at the same instant: the second waits here on the
        -- first one's row, and is refused when the first commits.
        INSERT INTO paid_once (kind, subject, txn_id) VALUES (NEW.kind, v_key || ':' || (NEW.metadata ->> v_key), NEW.id);
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'a % has already been posted for % %', NEW.kind, v_key, NEW.metadata ->> v_key
          USING ERRCODE = 'NL011';
      END;
    END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;

CREATE TRIGGER transactions_kind_header AFTER INSERT ON ledger.transactions
  FOR EACH ROW EXECUTE FUNCTION ledger._check_kind_header();

-- ---------------------------------------------------------------------------
-- 2: who pays and who is paid. Checked at commit, like the zero-sum rule,
-- whatever wrote the entries.
-- ---------------------------------------------------------------------------

CREATE FUNCTION ledger._check_kind_shape() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ledger, pg_temp AS $fn$
DECLARE
  v_txn        record;
  v_rule       ledger.kind_rules%ROWTYPE;
  v_payers     int;
  v_payees     int;
  v_total      bigint;
  v_bad        text;
  v_parts      bigint;
  v_officer    text;
  v_government bigint;
  v_n_gov      int;
  v_n_other    int;
  v_expected   bigint;
BEGIN
  SELECT t.kind, t.metadata, t.reverses INTO v_txn FROM transactions t WHERE t.id = NEW.txn_id;
  IF v_txn.reverses IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_rule FROM kind_rules r WHERE r.kind = v_txn.kind;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) FILTER (WHERE e.amount < 0), count(*) FILTER (WHERE e.amount > 0),
         coalesce(sum(e.amount) FILTER (WHERE e.amount > 0), 0)
    INTO v_payers, v_payees, v_total
    FROM entries e WHERE e.txn_id = NEW.txn_id;
  IF v_payers > v_rule.max_payers OR v_payees > v_rule.max_payees THEN
    RAISE EXCEPTION 'a % transaction debits at most % and credits at most % accounts; this one has % and %',
      v_txn.kind, v_rule.max_payers, v_rule.max_payees, v_payers, v_payees USING ERRCODE = 'NL012';
  END IF;

  SELECT a.owner_kind::text INTO v_bad
    FROM entries e JOIN accounts a ON a.id = e.account_id
   WHERE e.txn_id = NEW.txn_id AND e.amount > 0 AND NOT (a.owner_kind = ANY (v_rule.payee_kinds))
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'a % transaction may not pay a % account', v_txn.kind, v_bad USING ERRCODE = 'NL012';
  END IF;

  IF v_txn.kind = 'fine' THEN
    v_officer := v_txn.metadata ->> 'officer';
    SELECT coalesce(sum(e.amount) FILTER (WHERE a.owner_kind = 'government'), 0),
           count(*) FILTER (WHERE a.owner_kind = 'government'),
           count(*) FILTER (WHERE a.owner_kind <> 'government')
      INTO v_government, v_n_gov, v_n_other
      FROM entries e JOIN accounts a ON a.id = e.account_id
     WHERE e.txn_id = NEW.txn_id AND e.amount > 0;
    IF v_n_gov <> 1 THEN
      RAISE EXCEPTION 'a fine pays exactly one government account' USING ERRCODE = 'NL012';
    END IF;

    IF v_officer LIKE 'player:%' THEN
      SELECT p.value INTO v_parts FROM policy p WHERE p.name = 'fine_government_parts_per_hundred';
      v_expected := least(v_total, greatest(1, (v_total * v_parts + 99) / 100));
      IF v_government <> v_expected THEN
        RAISE EXCEPTION 'of a fine of %, government is due % and was given %', v_total, v_expected, v_government
          USING ERRCODE = 'NL012';
      END IF;
      -- whatever is left goes to the constable who made the arrest, and to nobody else
      IF EXISTS (
        SELECT 1 FROM entries e JOIN accounts a ON a.id = e.account_id
         WHERE e.txn_id = NEW.txn_id AND e.amount > 0 AND a.owner_kind <> 'government'
           AND NOT (a.owner_kind = 'player' AND a.owner_id = substr(v_officer, 8))
      ) THEN
        RAISE EXCEPTION 'the rest of a fine goes to the constable who made the arrest and to nobody else'
          USING ERRCODE = 'NL012';
      END IF;
      -- and the constable does not pay the fine of their own prisoner
      IF EXISTS (
        SELECT 1 FROM entries e JOIN accounts a ON a.id = e.account_id
         WHERE e.txn_id = NEW.txn_id AND e.amount < 0 AND a.owner_kind = 'player' AND a.owner_id = substr(v_officer, 8)
      ) THEN
        RAISE EXCEPTION 'the arresting constable may not pay the fine' USING ERRCODE = 'NL012';
      END IF;
    ELSIF v_n_other <> 0 THEN
      RAISE EXCEPTION 'a fine after an arrest by a police officer goes to government in full' USING ERRCODE = 'NL012';
    END IF;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER entries_kind_shape AFTER INSERT ON ledger.entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger._check_kind_shape();

-- ---------------------------------------------------------------------------
-- For the auditor: where every fine went, and every bill for treatment.
-- ---------------------------------------------------------------------------

CREATE VIEW ledger.fine_distribution AS
  SELECT t.id                       AS transaction_id,
         t.idempotency_key,
         t.metadata ->> 'arrest'    AS arrest,
         t.metadata ->> 'officer'   AS officer,
         t.initiator                AS paid_by,
         t.created_at,
         (SELECT sum(e.amount) FROM ledger.entries e WHERE e.txn_id = t.id AND e.amount > 0) AS amount,
         (SELECT coalesce(sum(e.amount), 0) FROM ledger.entries e JOIN ledger.accounts a ON a.id = e.account_id
           WHERE e.txn_id = t.id AND e.amount > 0 AND a.owner_kind = 'government')             AS to_government,
         (SELECT coalesce(sum(e.amount), 0) FROM ledger.entries e JOIN ledger.accounts a ON a.id = e.account_id
           WHERE e.txn_id = t.id AND e.amount > 0 AND a.owner_kind = 'player')                 AS to_constable,
         EXISTS (SELECT 1 FROM ledger.transactions r WHERE r.reverses = t.id)                  AS reversed
    FROM ledger.transactions t
   WHERE t.kind = 'fine' AND t.reverses IS NULL;

CREATE VIEW ledger.medical_fees AS
  SELECT t.id                                                     AS transaction_id,
         t.idempotency_key,
         coalesce(t.metadata ->> 'quote', t.metadata ->> 'call')  AS subject,
         t.initiator                                              AS paid_by,
         t.created_at,
         (SELECT sum(e.amount) FROM ledger.entries e WHERE e.txn_id = t.id AND e.amount > 0) AS amount,
         (SELECT a.owner_kind::text || ':' || a.owner_id FROM ledger.entries e JOIN ledger.accounts a ON a.id = e.account_id
           WHERE e.txn_id = t.id AND e.amount > 0 LIMIT 1)                                     AS paid_to,
         EXISTS (SELECT 1 FROM ledger.transactions r WHERE r.reverses = t.id)                  AS reversed
    FROM ledger.transactions t
   WHERE t.kind = 'medical_fee' AND t.reverses IS NULL;

-- ---------------------------------------------------------------------------
-- Privileges: nobody but the owner writes these; the auditor reads them.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ledger.kind_rules, ledger.policy, ledger.paid_once, ledger.fine_distribution, ledger.medical_fees FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger._check_kind_header(), ledger._check_kind_shape() FROM PUBLIC;
GRANT SELECT ON ledger.kind_rules, ledger.policy, ledger.paid_once, ledger.fine_distribution, ledger.medical_fees TO nlw_auditor;
