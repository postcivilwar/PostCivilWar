"""Contract tests for the ledger.

Each test states one promise the ledger makes and checks it against a real
PostgreSQL database, connected as the service role that the promise is about.
Any service, in any language, can rely on what passes here.

Run with scripts/run-tests.sh.
"""

from __future__ import annotations

import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor

import pg
from pg import PgError, lit

def key() -> str:
    return "test-" + uuid.uuid4().hex


class LedgerCase(unittest.TestCase):
    """One fresh database per test class."""

    db: str

    @classmethod
    def setUpClass(cls):
        cls.db = pg.create_ledger_database()
        cls.issuance = pg.one(cls.db, "SELECT id FROM ledger.accounts WHERE owner_kind = 'system' AND purpose = 'issuance'")
        system = lambda purpose: pg.one(cls.db, f"SELECT id FROM ledger.accounts WHERE owner_kind = 'system' AND purpose = {lit(purpose)}")
        cls.custody = system("chain_custody")
        cls.reserve = system("conversion_reserve")
        cls.pending = system("withdrawal_pending")
        cls.revenue = system("revenue")

    @classmethod
    def tearDownClass(cls):
        pg.drop_database(cls.db)

    # -- helpers ----------------------------------------------------------

    def post(self, function, role, kind, legs, idem=None, reason="test", meta=None, before=()):
        entries = [{"account": account, "amount": amount} for account, amount in legs]
        statement = (
            f"SELECT transaction_id, replayed FROM ledger.{function}("
            f"{lit(idem or key())}, {lit(kind)}, 'svc:test', {lit(reason)}, {lit(entries)}::jsonb, {lit(meta or {})}::jsonb)"
        )
        rows = pg.sql(self.db, *before, statement, role=role)
        self.assertEqual(len(rows), 1)
        return rows[0][0], rows[0][1] == "t"

    def game(self, kind, legs, **kw):
        return self.post("post_game", "t_gameplay", kind, legs, **kw)

    def wallet(self, owner=None, kind="player", purpose="wallet") -> str:
        owner = owner or uuid.uuid4().hex
        return pg.one(self.db, f"SELECT ledger.open_game_account({lit(kind)}, {lit(owner)}, {lit(purpose)}, 'CWR')", role="t_gameplay")

    def btc_account(self, owner=None) -> str:
        owner = owner or uuid.uuid4().hex
        return pg.one(self.db, f"SELECT ledger.open_external_account('player', {lit(owner)}, 'settlement', 'TBTC')", role="t_settlement")

    def settle(self, kind, legs, **kw):
        return self.post("post_settlement", "t_settlement", kind, legs, **kw)

    def issue(self, account, amount):
        return self.post("post_monetary", "t_monetary", "issuance", [(self.issuance, -amount), (account, amount)])

    def funded_wallet(self, amount) -> str:
        account = self.wallet()
        self.issue(account, amount)
        return account

    def balance(self, account) -> int:
        return int(pg.one(self.db, f"SELECT balance FROM ledger.balances WHERE account_id = {lit(account)}"))

    def count(self, table) -> int:
        return int(pg.one(self.db, f"SELECT count(*) FROM ledger.{table}"))

    def assertRefused(self, sqlstate, call, *args, **kwargs):
        with self.assertRaises(PgError) as caught:
            call(*args, **kwargs)
        self.assertEqual(caught.exception.sqlstate, sqlstate, caught.exception.raw)
        return caught.exception

    def assertConsistent(self):
        problems = pg.sql(self.db, "SELECT * FROM ledger.reconcile()", role="t_auditor")
        self.assertEqual(problems, [], "reconciliation found problems")


class Transfers(LedgerCase):
    def test_a_transfer_moves_value_and_records_both_sides(self):
        payer, payee = self.funded_wallet(10_000), self.wallet()
        txn, replayed = self.game("transfer", [(payer, -2_500), (payee, 2_500)])
        self.assertFalse(replayed)
        self.assertEqual((self.balance(payer), self.balance(payee)), (7_500, 2_500))
        entries = pg.sql(self.db, f"SELECT account_id, asset, amount, balance_after FROM ledger.entries WHERE txn_id = {lit(txn)} ORDER BY line")
        self.assertEqual(entries, [[payer, "CWR", "-2500", "7500"], [payee, "CWR", "2500", "2500"]])
        header = pg.sql(self.db, f"SELECT kind, initiator, reason FROM ledger.transactions WHERE id = {lit(txn)}")
        self.assertEqual(header, [["transfer", "svc:test", "test"]])
        self.assertConsistent()

    def test_a_payment_larger_than_the_balance_is_refused_and_leaves_no_trace(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        transactions, entries = self.count("transactions"), self.count("entries")
        error = self.assertRefused("NL001", self.game, "transfer", [(payer, -1_001), (payee, 1_001)])
        self.assertIn(payer, error.message)
        self.assertEqual((self.balance(payer), self.balance(payee)), (1_000, 0))
        self.assertEqual((self.count("transactions"), self.count("entries")), (transactions, entries))

    def test_the_whole_balance_can_be_spent_exactly(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        self.game("transfer", [(payer, -1_000), (payee, 1_000)])
        self.assertEqual((self.balance(payer), self.balance(payee)), (0, 1_000))

    def test_one_transaction_can_pay_many_accounts(self):
        employer = self.funded_wallet(100_000)
        staff = [self.wallet() for _ in range(5)]
        legs = [(employer, -50_000)] + [(worker, 10_000) for worker in staff]
        self.game("wage", legs, reason="October payroll")
        self.assertEqual(self.balance(employer), 50_000)
        self.assertEqual([self.balance(worker) for worker in staff], [10_000] * 5)
        self.assertConsistent()

    def test_entries_that_do_not_sum_to_zero_are_refused(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        self.assertRefused("NL003", self.game, "transfer", [(payer, -500), (payee, 501)])
        self.assertRefused("NL003", self.game, "transfer", [(payer, 500), (payee, 500)])
        self.assertEqual((self.balance(payer), self.balance(payee)), (1_000, 0))

    def test_malformed_requests_are_refused(self):
        a, b = self.funded_wallet(1_000), self.wallet()
        ghost = str(uuid.uuid4())
        self.assertRefused("NL005", self.game, "transfer", [(a, -500)])                       # one leg
        self.assertRefused("NL005", self.game, "transfer", [(a, 0), (b, 0)])                  # zero amounts
        self.assertRefused("NL005", self.game, "transfer", [(a, -500), (a, 500)])             # same account twice
        self.assertRefused("NL005", self.game, "transfer", [(a, "-1.5"), (b, "1.5")])         # fractional minor units
        self.assertRefused("NL005", self.game, "transfer", [("not-a-uuid", -5), (b, 5)])      # bad account id
        self.assertRefused("NL005", self.game, "no_such_kind", [(a, -5), (b, 5)])             # unknown kind
        self.assertRefused("NL005", self.game, "transfer", [(a, -5), (b, 5)], idem="short")   # key too short
        self.assertRefused("NL005", self.game, "transfer", [(a, -5), (b, 5)], reason="")      # no reason
        self.assertRefused("NL006", self.game, "transfer", [(a, -5), (ghost, 5)])             # unknown account
        self.assertEqual((self.balance(a), self.balance(b)), (1_000, 0))

    def test_arithmetic_beyond_the_range_of_a_balance_is_an_error_not_a_wraparound(self):
        account = self.wallet()
        # Issue until the issuance account sits at the lowest value a 64-bit balance can hold.
        headroom = 2**63 + self.balance(self.issuance)
        self.issue(account, headroom)
        self.assertEqual(self.balance(self.issuance), -(2**63))
        error = self.assertRefused("22003", self.issue, account, 1)
        self.assertIn("out of range", error.message)
        self.assertEqual(self.balance(account), headroom)
        # Put it back so the supply figure in this database stays sensible.
        self.game("retirement", [(account, -headroom), (self.issuance, headroom)])
        self.assertEqual(self.balance(account), 0)
        self.assertConsistent()

    def test_opening_the_same_account_twice_returns_the_same_account(self):
        owner = uuid.uuid4().hex
        self.assertEqual(self.wallet(owner), self.wallet(owner))
        self.assertNotEqual(self.wallet(owner), self.wallet(owner, purpose="savings"))


class Idempotency(LedgerCase):
    def test_a_retried_request_has_no_second_effect(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        idem = key()
        first, replayed_first = self.game("transfer", [(payer, -400), (payee, 400)], idem=idem)
        again, replayed_again = self.game("transfer", [(payer, -400), (payee, 400)], idem=idem)
        self.assertEqual(first, again)
        self.assertEqual((replayed_first, replayed_again), (False, True))
        self.assertEqual((self.balance(payer), self.balance(payee)), (600, 400))

    def test_a_key_cannot_be_reused_for_a_different_request(self):
        payer, payee, other = self.funded_wallet(1_000), self.wallet(), self.wallet()
        idem = key()
        self.game("transfer", [(payer, -400), (payee, 400)], idem=idem)
        self.assertRefused("NL002", self.game, "transfer", [(payer, -401), (payee, 401)], idem=idem)
        self.assertRefused("NL002", self.game, "transfer", [(payer, -400), (other, 400)], idem=idem)
        self.assertRefused("NL002", self.game, "goods_purchase", [(payer, -400), (payee, 400)], idem=idem)
        self.assertEqual((self.balance(payer), self.balance(payee), self.balance(other)), (600, 400, 0))

    def test_the_same_request_sent_twenty_times_at_once_happens_once(self):
        payer, payee = self.funded_wallet(10_000), self.wallet()
        idem = key()
        gate = pg.Gate(self.db, 7001)
        gate.close()
        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = [
                pool.submit(self.game, "transfer", [(payer, -300), (payee, 300)], idem=idem, before=(gate.wait_statement(),))
                for _ in range(20)
            ]
            gate.wait_for_queue(20)
            gate.open()
            results = [future.result() for future in futures]
        self.assertEqual(len({txn for txn, _ in results}), 1)
        self.assertEqual(sum(1 for _, replayed in results if not replayed), 1)
        self.assertEqual((self.balance(payer), self.balance(payee)), (9_700, 300))
        self.assertConsistent()


class Concurrency(LedgerCase):
    def test_forty_simultaneous_attempts_to_spend_the_same_money_yield_one_payment(self):
        payer = self.funded_wallet(5_000)
        payees = [self.wallet() for _ in range(40)]
        gate = pg.Gate(self.db, 7002)
        gate.close()

        def attempt(payee):
            try:
                self.game("transfer", [(payer, -5_000), (payee, 5_000)], before=(gate.wait_statement(),))
                return "paid"
            except PgError as error:
                return error.sqlstate

        with ThreadPoolExecutor(max_workers=40) as pool:
            futures = [pool.submit(attempt, payee) for payee in payees]
            gate.wait_for_queue(40)
            gate.open()
            outcomes = sorted(future.result() for future in futures)
        self.assertEqual(outcomes, ["NL001"] * 39 + ["paid"])
        self.assertEqual(self.balance(payer), 0)
        self.assertEqual(sum(self.balance(payee) for payee in payees), 5_000)
        self.assertConsistent()

    def test_thousands_of_random_concurrent_transfers_conserve_value_without_deadlock(self):
        accounts, clients, per_client, start = 12, 16, 400, 20_000
        pg.script(self.db, """
            CREATE SCHEMA t;
            CREATE TABLE t.acct (n int PRIMARY KEY, id uuid NOT NULL);
            CREATE TABLE t.outcome (result text NOT NULL);
            -- Runs as the caller, so every post goes through the gameplay role's grants.
            CREATE FUNCTION t.try_transfer(a int, b int, amount bigint) RETURNS text
            LANGUAGE plpgsql AS $$
            DECLARE result text := 'paid';
            BEGIN
              IF a = b THEN
                result := 'same';
              ELSE
                BEGIN
                  PERFORM ledger.post_game(gen_random_uuid()::text, 'transfer', 'svc:bench', 'bench',
                    jsonb_build_array(
                      jsonb_build_object('account', (SELECT id FROM t.acct WHERE n = a), 'amount', -amount),
                      jsonb_build_object('account', (SELECT id FROM t.acct WHERE n = b), 'amount', amount)));
                EXCEPTION WHEN SQLSTATE 'NL001' THEN
                  result := 'refused';
                END;
              END IF;
              INSERT INTO t.outcome VALUES (result);
              RETURN result;
            END $$;
            GRANT USAGE ON SCHEMA t TO t_gameplay;
            GRANT SELECT ON t.acct TO t_gameplay;
            GRANT INSERT ON t.outcome TO t_gameplay;
            GRANT EXECUTE ON FUNCTION t.try_transfer(int, int, bigint) TO t_gameplay;
        """)
        ids = [self.funded_wallet(start) for _ in range(accounts)]
        pg.script(self.db, "INSERT INTO t.acct VALUES " + ", ".join(f"({n + 1}, {lit(i)})" for n, i in enumerate(ids)) + ";")
        before = self.count("transactions")

        # Amounts up to 1.5x the starting balance, so a good share of attempts must be refused.
        report = pg.pgbench(
            self.db, "t_gameplay",
            f"\\set a random(1, {accounts})\n\\set b random(1, {accounts})\n\\set amount random(1, {start * 3 // 2})\n"
            "SELECT t.try_transfer(:a, :b, :amount);\n",
            clients=clients, transactions=per_client, workdir=tempfile.gettempdir(),
        )
        attempts = clients * per_client
        self.assertIn(f"number of transactions actually processed: {attempts}/{attempts}", report)
        self.assertIn("number of failed transactions: 0 ", report)

        outcomes = dict(pg.sql(self.db, "SELECT result, count(*) FROM t.outcome GROUP BY result"))
        paid, refused, same = (int(outcomes.get(name, 0)) for name in ("paid", "refused", "same"))
        self.assertEqual(paid + refused + same, attempts)
        self.assertGreater(paid, attempts // 10, outcomes)
        self.assertGreater(refused, attempts // 10, outcomes)
        self.assertEqual(self.count("transactions") - before, paid)

        balances = [self.balance(account) for account in ids]
        self.assertEqual(sum(balances), accounts * start)
        self.assertGreaterEqual(min(balances), 0)
        self.assertConsistent()


class AppendOnly(LedgerCase):
    """Even the database owner cannot quietly rewrite history."""

    def setUp(self):
        self.payer, self.payee = self.funded_wallet(1_000), self.wallet()
        self.txn, _ = self.game("transfer", [(self.payer, -100), (self.payee, 100)])

    def admin(self, statement):
        return pg.sql(self.db, statement)

    def test_posted_entries_cannot_be_changed_or_removed(self):
        self.assertRefused("NL009", self.admin, f"UPDATE ledger.entries SET amount = amount * 2 WHERE txn_id = {lit(self.txn)}")
        self.assertRefused("NL009", self.admin, f"DELETE FROM ledger.entries WHERE txn_id = {lit(self.txn)}")
        self.assertRefused("NL009", self.admin, "TRUNCATE ledger.entries")

    def test_posted_transactions_cannot_be_changed_or_removed(self):
        self.assertRefused("NL009", self.admin, f"UPDATE ledger.transactions SET reason = 'edited' WHERE id = {lit(self.txn)}")
        self.assertRefused("NL009", self.admin, f"DELETE FROM ledger.transactions WHERE id = {lit(self.txn)}")
        self.assertRefused("NL009", self.admin, "TRUNCATE ledger.transactions, ledger.entries")

    def test_accounts_cannot_be_repointed_or_removed(self):
        self.assertRefused("NL009", self.admin, f"UPDATE ledger.accounts SET owner_id = 'someone-else' WHERE id = {lit(self.payer)}")
        self.assertRefused("NL009", self.admin, f"UPDATE ledger.accounts SET allow_negative = true WHERE id = {lit(self.payer)}")
        self.assertRefused("NL009", self.admin, f"DELETE FROM ledger.accounts WHERE id = {lit(self.payee)}")

    def test_a_balance_cannot_be_edited_by_hand(self):
        self.assertRefused("NL009", self.admin, f"UPDATE ledger.balances SET balance = 1000000 WHERE account_id = {lit(self.payer)}")
        self.assertRefused("NL009", self.admin, f"DELETE FROM ledger.balances WHERE account_id = {lit(self.payer)}")
        self.assertEqual(self.balance(self.payer), 900)

    def test_entries_inserted_around_the_posting_function_still_have_to_balance(self):
        rogue = str(uuid.uuid4())
        with self.assertRaises(PgError) as caught:
            pg.script(self.db, f"""
                BEGIN;
                INSERT INTO ledger.transactions (id, idempotency_key, request_hash, kind, initiator, reason)
                VALUES ({lit(rogue)}, {lit(key())}, '\\x00', 'transfer', 'rogue', 'one-sided credit');
                INSERT INTO ledger.entries (txn_id, line, account_id, asset, amount, balance_after)
                VALUES ({lit(rogue)}, 1, {lit(self.payee)}, 'CWR', 999999, 999999);
                COMMIT;
            """)
        self.assertEqual(caught.exception.sqlstate, "NL003")
        self.assertEqual(pg.one(self.db, f"SELECT count(*) FROM ledger.transactions WHERE id = {lit(rogue)}"), "0")


class RoleWall(LedgerCase):
    """What each service is, and is not, able to do."""

    def as_role(self, role, statement):
        return pg.sql(self.db, statement, role=role)

    def test_the_gameplay_service_cannot_touch_ledger_tables_directly(self):
        account = self.funded_wallet(1_000)
        for statement in (
            "SELECT * FROM ledger.balances",
            "SELECT * FROM ledger.entries",
            f"UPDATE ledger.balances SET balance = 999999 WHERE account_id = {lit(account)}",
            f"INSERT INTO ledger.balances (account_id, allow_negative) VALUES ({lit(str(uuid.uuid4()))}, false)",
            "DELETE FROM ledger.transactions",
            "INSERT INTO ledger.transaction_kinds VALUES ('free_money', 'game', 'x')",
        ):
            self.assertRefused("42501", self.as_role, "t_gameplay", statement)
        self.assertEqual(self.balance(account), 1_000)

    def test_the_gameplay_service_cannot_call_other_services_functions(self):
        a, b = self.funded_wallet(1_000), self.wallet()
        legs = lit([{"account": a, "amount": -1}, {"account": b, "amount": 1}])
        txn, _ = self.game("transfer", [(a, -1), (b, 1)])
        for statement in (
            f"SELECT * FROM ledger.post_monetary({lit(key())}, 'issuance', 'x', 'x', {legs}::jsonb)",
            f"SELECT * FROM ledger.post_settlement({lit(key())}, 'deposit', 'x', 'x', {legs}::jsonb)",
            f"SELECT * FROM ledger.post_reversal({lit(key())}, {lit(txn)}, 'x', 'x')",
            f"SELECT * FROM ledger._post({lit(key())}, 'issuance', 'x', 'x', {legs}::jsonb, '{{}}'::jsonb, ARRAY['game']::ledger.kind_scope[], true)",
            "SELECT * FROM ledger.reconcile()",
            f"SELECT ledger.external_balance({lit(a)})",
        ):
            self.assertRefused("42501", self.as_role, "t_gameplay", statement)

    def test_the_gameplay_service_cannot_create_in_game_currency(self):
        account = self.wallet()
        self.assertRefused("NL004", self.game, "issuance", [(self.issuance, -1_000_000), (account, 1_000_000)])
        self.assertRefused("NL004", self.game, "transfer", [(self.issuance, -1_000_000), (account, 1_000_000)])
        self.assertEqual(self.balance(account), 0)

    def test_the_gameplay_service_can_take_currency_out_of_circulation(self):
        account = self.funded_wallet(1_000)
        supply = int(pg.one(self.db, "SELECT in_circulation FROM ledger.supply WHERE asset = 'CWR'"))
        self.game("retirement", [(account, -250), (self.issuance, 250)])
        self.assertEqual(self.balance(account), 750)
        self.assertEqual(int(pg.one(self.db, "SELECT in_circulation FROM ledger.supply WHERE asset = 'CWR'")), supply - 250)

    def test_the_gameplay_service_cannot_move_or_see_bitcoin(self):
        btc_a, btc_b, wallet = self.btc_account(), self.btc_account(), self.funded_wallet(1_000)
        self.settle("deposit", [(self.custody, -50_000), (btc_a, 50_000)])
        # a bitcoin kind, a game kind pointed at bitcoin accounts, a bridge kind, and a mixed transaction
        self.assertRefused("NL004", self.game, "deposit", [(btc_a, -100), (btc_b, 100)])
        self.assertRefused("NL004", self.game, "transfer", [(btc_a, -100), (btc_b, 100)])
        self.assertRefused("NL004", self.game, "conversion", [(btc_a, -100), (self.reserve, 100)])
        self.assertRefused("NL004", self.game, "transfer", [(btc_a, -100), (btc_b, 100), (wallet, -5), (self.wallet(), 5)])
        self.assertRefused("NL004", self.as_role, "t_gameplay", f"SELECT ledger.game_balance({lit(btc_a)})")
        self.assertRefused("42501", self.as_role, "t_gameplay", "SELECT ledger.open_external_account('player', 'p1', 'settlement', 'TBTC')")
        self.assertRefused("NL004", self.as_role, "t_gameplay", "SELECT ledger.open_game_account('player', 'p1', 'wallet', 'TBTC')")
        self.assertEqual((self.balance(btc_a), self.balance(btc_b)), (50_000, 0))

    def test_no_service_can_create_a_system_account(self):
        self.assertRefused("NL004", self.as_role, "t_gameplay", "SELECT ledger.open_game_account('system', 'operator', 'issuance2', 'CWR')")
        self.assertRefused("NL004", self.as_role, "t_settlement", "SELECT ledger.open_external_account('system', 'operator', 'custody2', 'TBTC')")

    def test_a_conversion_moves_bitcoin_to_the_reserve_and_issues_currency_in_one_transaction(self):
        player = uuid.uuid4().hex
        btc = self.btc_account(player)
        wallet = pg.one(self.db, f"SELECT ledger.open_game_account('player', {lit(player)}, 'wallet', 'CWR')", role="t_settlement")
        reserve_before, issued_before = self.balance(self.reserve), self.balance(self.issuance)

        self.settle("deposit", [(self.custody, -500_000), (btc, 500_000)], meta={"txid": "ab" * 32, "vout": 0})
        self.settle("conversion", [(btc, -200_000), (self.reserve, 200_000), (self.issuance, -100_000), (wallet, 100_000)])

        self.assertEqual(self.balance(btc), 300_000)
        self.assertEqual(self.balance(self.reserve) - reserve_before, 200_000)
        self.assertEqual(self.balance(wallet), 100_000)
        self.assertEqual(self.balance(self.issuance) - issued_before, -100_000)
        self.assertEqual(pg.one(self.db, f"SELECT ledger.external_balance({lit(btc)})", role="t_settlement"), "300000")
        self.assertEqual(pg.one(self.db, f"SELECT ledger.game_balance({lit(wallet)})", role="t_gameplay"), "100000")
        self.assertConsistent()

    def test_each_side_of_a_conversion_has_to_balance_on_its_own(self):
        btc, wallet = self.btc_account(), self.wallet()
        self.settle("deposit", [(self.custody, -1_000), (btc, 1_000)])
        # Bitcoin leaves the player and the same number arrives as game currency: zero in total, wrong per asset.
        self.assertRefused("NL003", self.settle, "conversion", [(btc, -1_000), (wallet, 1_000)])
        self.assertEqual((self.balance(btc), self.balance(wallet)), (1_000, 0))

    def test_the_settlement_service_cannot_post_gameplay_transactions(self):
        a, b = self.funded_wallet(1_000), self.wallet()
        self.assertRefused("NL004", self.settle, "transfer", [(a, -100), (b, 100)])
        self.assertRefused("42501", self.post, "post_game", "t_settlement", "transfer", [(a, -100), (b, 100)])
        self.assertRefused("NL004", self.settle, "deposit", [(a, -100), (b, 100)])
        self.assertRefused("42501", self.post, "post_monetary", "t_settlement", "issuance", [(self.issuance, -100), (b, 100)])

    def test_a_player_cannot_overdraw_bitcoin(self):
        btc = self.btc_account()
        self.settle("deposit", [(self.custody, -1_000), (btc, 1_000)])
        self.assertRefused("NL001", self.settle, "withdrawal_hold", [(btc, -1_001), (self.pending, 1_001)])

    def test_the_auditor_can_read_everything_and_change_nothing(self):
        a, b = self.funded_wallet(1_000), self.wallet()
        self.assertGreater(int(pg.one(self.db, "SELECT count(*) FROM ledger.entries", role="t_auditor")), 0)
        self.assertEqual(pg.sql(self.db, "SELECT * FROM ledger.reconcile()", role="t_auditor"), [])
        self.assertRefused("42501", self.post, "post_game", "t_auditor", "transfer", [(a, -1), (b, 1)])
        self.assertRefused("42501", self.as_role, "t_auditor", f"UPDATE ledger.balances SET balance = 5 WHERE account_id = {lit(a)}")

    def test_a_login_with_no_ledger_role_can_do_nothing(self):
        a, b = self.funded_wallet(1_000), self.wallet()
        self.assertRefused("42501", self.as_role, "t_stranger", "SELECT * FROM ledger.balances")
        self.assertRefused("42501", self.post, "post_game", "t_stranger", "transfer", [(a, -1), (b, 1)])
        self.assertRefused("42501", self.as_role, "t_stranger", f"SELECT ledger.game_balance({lit(a)})")


class Sandbox(LedgerCase):
    """Only test bitcoin exists, and a live-network asset cannot be added."""

    def test_the_only_assets_are_test_bitcoin_and_the_game_currency(self):
        assets = pg.sql(self.db, "SELECT code, class, network FROM ledger.assets ORDER BY code")
        self.assertEqual(assets, [["CWR", "game", "internal"], ["TBTC", "external", "regtest"]])
        self.assertEqual(pg.one(self.db, "SELECT name FROM ledger.environment"), "sandbox")

    def test_a_live_network_asset_is_refused_even_for_the_database_owner(self):
        self.assertRefused("NL010", pg.sql, self.db, "INSERT INTO ledger.assets VALUES ('BTC', 'external', 8, 'mainnet', 'real bitcoin')")
        self.assertRefused("NL009", pg.sql, self.db, "UPDATE ledger.environment SET name = 'production'")
        self.assertRefused("NL009", pg.sql, self.db, "UPDATE ledger.assets SET network = 'mainnet' WHERE code = 'TBTC'")
        self.assertRefused("NL009", pg.sql, self.db, "DELETE FROM ledger.environment")



class MoreAssets(LedgerCase):
    """A further asset is data, not a redesign."""

    def as_role_game_balance(self, account):
        return pg.sql(self.db, f"SELECT ledger.game_balance({lit(account)})", role="t_gameplay")

    def test_another_test_asset_can_be_added_without_touching_the_game_economy(self):
        # Adding an asset is one row. Game-scope kinds still cannot touch it.
        pg.sql(self.db, "INSERT INTO ledger.assets VALUES ('TLTC', 'external', 8, 'testnet', 'a second sandbox asset, for this test only')")
        other = pg.one(self.db, "SELECT ledger.open_external_account('player', 'p-multi', 'settlement', 'TLTC')", role="t_settlement")
        wallet = self.funded_wallet(500)
        self.assertRefused("NL004", self.game, "transfer", [(wallet, -5), (other, 5)])
        self.assertRefused("NL004", self.as_role_game_balance, other)
        # The settlement service can hold it at once, with the same rules as test bitcoin.
        custody = pg.one(self.db, "WITH a AS (INSERT INTO ledger.accounts (owner_kind, owner_id, purpose, asset, allow_negative) VALUES ('system', 'operator', 'chain_custody', 'TLTC', true) RETURNING id), b AS (INSERT INTO ledger.balances (account_id, allow_negative) SELECT id, true FROM a) SELECT id FROM a")
        self.post("post_settlement", "t_settlement", "deposit", [(custody, -700), (other, 700)])
        self.assertEqual(self.balance(other), 700)
        self.assertConsistent()


class Reversals(LedgerCase):
    def reverse(self, txn, idem=None, role="t_admin"):
        rows = pg.sql(self.db, f"SELECT transaction_id, replayed FROM ledger.post_reversal({lit(idem or key())}, {lit(txn)}, 'ops:reviewer', 'duplicate charge')", role=role)
        return rows[0][0], rows[0][1] == "t"

    def test_a_reversal_restores_balances_and_keeps_the_original(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        txn, _ = self.game("goods_purchase", [(payer, -300), (payee, 300)])
        reversal, _ = self.reverse(txn)
        self.assertEqual((self.balance(payer), self.balance(payee)), (1_000, 0))
        self.assertEqual(pg.one(self.db, f"SELECT reverses FROM ledger.transactions WHERE id = {lit(reversal)}"), txn)
        self.assertEqual(pg.one(self.db, f"SELECT count(*) FROM ledger.entries WHERE txn_id = {lit(txn)}"), "2")
        self.assertConsistent()

    def test_a_transaction_can_be_reversed_only_once(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        txn, _ = self.game("transfer", [(payer, -300), (payee, 300)])
        idem = key()
        first, _ = self.reverse(txn, idem=idem)
        self.assertEqual(self.reverse(txn, idem=idem), (first, True))   # a retry of the same reversal
        self.assertRefused("NL007", self.reverse, txn)                  # a second, different reversal
        self.assertRefused("NL007", self.reverse, first)                # reversing the reversal
        self.assertEqual((self.balance(payer), self.balance(payee)), (1_000, 0))

    def test_a_reversal_fails_when_the_money_has_already_been_spent(self):
        payer, payee, third = self.funded_wallet(1_000), self.wallet(), self.wallet()
        txn, _ = self.game("transfer", [(payer, -300), (payee, 300)])
        self.game("transfer", [(payee, -300), (third, 300)])
        self.assertRefused("NL001", self.reverse, txn)
        self.assertEqual((self.balance(payer), self.balance(payee), self.balance(third)), (700, 0, 300))
        self.assertConsistent()

    def test_only_the_admin_role_can_reverse(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        txn, _ = self.game("transfer", [(payer, -300), (payee, 300)])
        for role in ("t_gameplay", "t_settlement", "t_monetary", "t_auditor", "t_compliance"):
            self.assertRefused("42501", self.reverse, txn, role=role)


class Reconciliation(LedgerCase):
    def test_a_balance_altered_behind_the_ledgers_back_is_reported(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        self.game("transfer", [(payer, -100), (payee, 100)])
        self.assertConsistent()
        # A privileged user defeats the guard on purpose. The entries no longer explain the balance.
        pg.script(self.db, f"""
            BEGIN;
            SELECT set_config('ledger.posting', 'on', true);
            UPDATE ledger.balances SET balance = balance + 5000 WHERE account_id = {lit(payee)};
            COMMIT;
        """)
        problems = pg.sql(self.db, "SELECT check_name, subject FROM ledger.reconcile() ORDER BY 1", role="t_auditor")
        self.assertEqual(problems, [
            ["asset_not_conserved", "CWR"],
            ["balance_differs_from_entries", payee],
            ["running_balance_differs", payee],
        ])


def setUpModule():
    pg.require_environment()


if __name__ == "__main__":
    unittest.main()
