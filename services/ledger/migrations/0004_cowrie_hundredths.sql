-- Nigeria Life World: ledger, migration 0004.
--
-- The in-game currency is counted in hundredths (8 October 2026).
--
-- The game's economy was rescaled at the owner's request: a new arrival's
-- 40 cowries stand for the £20 of the story, and a fine can be half a
-- cowrie. Every amount the ledger holds was already a whole number; from this
-- migration on, for CWR, that number is hundredths of a cowrie. Nothing that
-- has been posted is changed: the append-only log keeps every row exactly as
-- it was written, and balances, constraints and the zero-sum rule are the
-- same integers they were. What changes is how the asset says its amounts are
-- read, so that a statement printed from the ledger shows 4000 as 40.00.
--
-- ledger.assets is append-only (migration 0001), so its minor_units column
-- keeps the 0 it was created with as the record of how CWR began. The unit
-- in force is written here, once, in a table of its own that is fixed in the
-- same way: from the transaction it names onwards amounts are hundredths.
-- Before this migration no cowrie amount was ever issued outside tests.
--
-- Arrival money is issued per character with the idempotency key
-- arrival:<player id>, kind issuance, initiator ops:monetary, through the
-- operator's monetary role exactly as the opening capital is.
--
-- Cowries that the game issued (the arrival money among them) are not backed
-- by test bitcoin; the settlement service refuses to redeem more than an
-- account converted in.

BEGIN;

CREATE TABLE ledger.asset_units (
  code        text PRIMARY KEY REFERENCES ledger.assets (code),
  minor_units smallint NOT NULL CHECK (minor_units BETWEEN 0 AND 8),
  note        text NOT NULL
);

INSERT INTO ledger.asset_units (code, minor_units, note) VALUES
  ('CWR', 2, 'Cowries are counted in hundredths: 4000 is 40 cowries, the arrival money; 50 is half a cowrie.'),
  ('TBTC', 8, 'Test bitcoin in satoshis, as created.');

CREATE TRIGGER asset_units_fixed BEFORE INSERT OR UPDATE OR DELETE ON ledger.asset_units
  FOR EACH ROW EXECUTE FUNCTION ledger._deny_mutation();
CREATE TRIGGER asset_units_no_truncate BEFORE TRUNCATE ON ledger.asset_units
  FOR EACH STATEMENT EXECUTE FUNCTION ledger._deny_mutation();

GRANT SELECT ON ledger.asset_units TO nlw_auditor;

COMMIT;
