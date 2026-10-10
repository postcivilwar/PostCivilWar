"""Contract tests for the settlement schema: bitcoin deposits, conversion,
withdrawals and redemption, on sandbox test bitcoin.

There is no Bitcoin node here. The tests play the part of the chain watcher
and the signer by calling the same functions those services would call, with
made-up transaction ids. What is under test is the accounting and the controls,
not chain integration.

Run with scripts/run-tests.sh.
"""

from __future__ import annotations

import secrets
import unittest

import pg
from pg import PgError, lit

BECH32 = "02345679acdefghjklmnpqrstuvwxyz"


def address(prefix="bcrt1") -> str:
    return prefix + "q" + "".join(secrets.choice(BECH32) for _ in range(38))


def txid() -> str:
    return secrets.token_hex(32)


class SettlementCase(unittest.TestCase):
    db: str
    counter = 0

    @classmethod
    def setUpClass(cls):
        cls.db = pg.create_ledger_database()

    @classmethod
    def tearDownClass(cls):
        problems = pg.sql(cls.db, "SELECT * FROM ledger.reconcile()", role="t_auditor")
        pg.drop_database(cls.db)
        assert problems == [], f"ledger reconciliation failed: {problems}"

    # -- helpers ----------------------------------------------------------

    def call(self, role, statement):
        return pg.sql(self.db, statement, role=role)

    def refused(self, sqlstate, role, statement):
        with self.assertRaises(PgError) as caught:
            self.call(role, statement)
        self.assertEqual(caught.exception.sqlstate, sqlstate, caught.exception.raw)
        return caught.exception

    def player(self, verified=False):
        SettlementCase.counter += 1
        owner = f"p-{secrets.token_hex(4)}"
        btc, game = self.call("t_settlement", f"SELECT btc_account, game_account FROM settlement.open_account({lit(owner)})")[0]
        addr = address()
        self.call("t_settlement", f"SELECT settlement.register_address({lit(owner)}, {lit(addr)}, {secrets.randbelow(2**40)})")
        if verified:
            self.call("t_compliance", f"SELECT settlement.set_verification({lit(owner)}, 'basic', 'provider-ref-1', 'ops:kyc-officer')")
        return {"owner": owner, "btc": btc, "game": game, "address": addr}

    def observe(self, tx, addr, sats, confirmations, height=800_000, vout=0):
        return pg.one(self.db, f"SELECT settlement.observe_deposit({lit(tx)}, {vout}, {lit(addr)}, {sats}, {height if confirmations else 'NULL'}, {confirmations})", role="t_watcher")

    def deposit(self, p, sats):
        tx = txid()
        self.assertEqual(self.observe(tx, p["address"], sats, 3), "credited")
        return tx

    def balance(self, account) -> int:
        return int(pg.one(self.db, f"SELECT balance FROM ledger.balances WHERE account_id = {lit(account)}"))

    def system(self, purpose) -> int:
        return int(pg.one(self.db, f"SELECT b.balance FROM ledger.balances b JOIN ledger.accounts a ON a.id = b.account_id WHERE a.owner_kind = 'system' AND a.purpose = {lit(purpose)}"))

    def convert(self, p, sats):
        quote = pg.one(self.db, f"SELECT id FROM settlement.request_quote({lit(p['owner'])}, {sats})", role="t_settlement")
        return pg.one(self.db, f"SELECT settlement.accept_quote({lit(p['owner'])}, {lit(quote)})", role="t_settlement")

    def withdraw(self, p, sats, to=None):
        return self.call("t_settlement", f"SELECT id, status FROM settlement.request_withdrawal({lit(p['owner'])}, {lit(to or address())}, {sats})")[0]

    def reserves_difference(self, wallet_sats) -> int:
        return int(pg.one(self.db, f"SELECT difference FROM settlement.proof_of_reserves({wallet_sats})", role="t_auditor"))


class Deposits(SettlementCase):
    def test_a_deposit_is_credited_once_after_three_confirmations(self):
        p = self.player()
        tx = txid()
        self.assertEqual(self.observe(tx, p["address"], 250_000, 0), "seen")
        self.assertEqual(self.observe(tx, p["address"], 250_000, 1), "confirming")
        self.assertEqual(self.observe(tx, p["address"], 250_000, 2), "confirming")
        self.assertEqual(self.balance(p["btc"]), 0)
        self.assertEqual(self.observe(tx, p["address"], 250_000, 3), "credited")
        for confirmations in (3, 4, 9, 30):
            self.assertEqual(self.observe(tx, p["address"], 250_000, confirmations), "credited")
        self.assertEqual(self.balance(p["btc"]), 250_000)
        self.assertEqual(self.balance(p["game"]), 0)
        self.assertEqual(pg.one(self.db, f"SELECT count(*) FROM ledger.transactions WHERE idempotency_key = {lit(f'deposit:TBTC:{tx}:0')}"), "1")

    def test_two_outputs_of_one_transaction_are_two_deposits(self):
        p = self.player()
        tx = txid()
        self.observe(tx, p["address"], 10_000, 3, vout=0)
        self.observe(tx, p["address"], 15_000, 3, vout=1)
        self.assertEqual(self.balance(p["btc"]), 25_000)

    def test_an_output_cannot_change_its_story(self):
        p, q = self.player(), self.player()
        tx = txid()
        self.observe(tx, p["address"], 10_000, 1)
        self.refused("ST005", "t_watcher", f"SELECT settlement.observe_deposit({lit(tx)}, 0, {lit(p['address'])}, 999999, 800000, 3)")
        self.refused("ST005", "t_watcher", f"SELECT settlement.observe_deposit({lit(tx)}, 0, {lit(q['address'])}, 10000, 800000, 3)")
        self.refused("ST002", "t_watcher", f"SELECT settlement.observe_deposit({lit(txid())}, 0, {lit(address())}, 10000, 800000, 3)")
        self.assertEqual((self.balance(p["btc"]), self.balance(q["btc"])), (0, 0))

    def test_a_flagged_deposit_and_a_frozen_account_are_not_credited(self):
        p = self.player()
        tx = txid()
        self.observe(tx, p["address"], 40_000, 1)
        self.call("t_compliance", f"SELECT settlement.flag_deposit({lit(tx)}, 0, 'ops:analyst', 'source of funds query')")
        self.assertEqual(self.observe(tx, p["address"], 40_000, 6), "confirming")
        self.assertEqual(self.balance(p["btc"]), 0)

        q = self.player()
        self.call("t_compliance", f"SELECT settlement.set_account_status({lit(q['owner'])}, 'frozen', 'ops:analyst', 'under review')")
        tx2 = txid()
        self.assertEqual(self.observe(tx2, q["address"], 40_000, 6), "confirming")
        self.assertEqual(self.balance(q["btc"]), 0)
        self.call("t_compliance", f"SELECT settlement.set_account_status({lit(q['owner'])}, 'active', 'ops:analyst', 'cleared')")
        self.assertEqual(self.observe(tx2, q["address"], 40_000, 7), "credited")
        self.assertEqual(self.balance(q["btc"]), 40_000)

    def test_a_credited_deposit_that_leaves_the_chain_freezes_the_account(self):
        p = self.player()
        tx = self.deposit(p, 70_000)
        self.assertEqual(self.observe(tx, p["address"], 70_000, 0), "reorg_after_credit")
        self.assertEqual(pg.one(self.db, f"SELECT status FROM settlement.accounts WHERE owner_id = {lit(p['owner'])}"), "frozen")
        self.refused("ST001", "t_settlement", f"SELECT settlement.request_quote({lit(p['owner'])}, 1000)")
        self.refused("ST001", "t_settlement", f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 20000)")
        self.assertEqual(self.balance(p["btc"]), 70_000, "the ledger is not rewritten automatically")
        self.assertEqual(pg.one(self.db, f"SELECT count(*) FROM settlement.audit_log WHERE action = 'reorg_after_credit' AND subject = {lit(p['owner'])}"), "1")


class Conversion(SettlementCase):
    def test_a_quote_fixes_the_rate_and_converts_both_sides_at_once(self):
        p = self.player()
        self.deposit(p, 100_000)
        reserve, issued = self.system("conversion_reserve"), self.system("issuance")
        row = self.call("t_settlement", f"SELECT id, sats, cowries FROM settlement.request_quote({lit(p['owner'])}, 60001)")[0]
        self.assertEqual(row[1:], ["60001", "30000"])
        self.call("t_settlement", f"SELECT settlement.accept_quote({lit(p['owner'])}, {lit(row[0])})")
        self.assertEqual((self.balance(p["btc"]), self.balance(p["game"])), (39_999, 30_000))
        self.assertEqual(self.system("conversion_reserve") - reserve, 60_001)
        self.assertEqual(self.system("issuance") - issued, -30_000)
        self.refused("ST004", "t_settlement", f"SELECT settlement.accept_quote({lit(p['owner'])}, {lit(row[0])})")
        self.assertEqual(self.balance(p["game"]), 30_000)

    def test_quotes_expire_belong_to_one_player_and_need_the_bitcoin(self):
        p, other = self.player(), self.player()
        self.deposit(p, 50_000)
        quote = pg.one(self.db, f"SELECT id FROM settlement.request_quote({lit(p['owner'])}, 20000)", role="t_settlement")
        self.refused("ST004", "t_settlement", f"SELECT settlement.accept_quote({lit(other['owner'])}, {lit(quote)})")
        pg.sql(self.db, f"UPDATE settlement.quotes SET expires_at = now() - interval '1 second' WHERE id = {lit(quote)}")
        self.refused("ST004", "t_settlement", f"SELECT settlement.accept_quote({lit(p['owner'])}, {lit(quote)})")
        big = pg.one(self.db, f"SELECT id FROM settlement.request_quote({lit(p['owner'])}, 50001)", role="t_settlement")
        self.refused("ST007", "t_settlement", f"SELECT settlement.accept_quote({lit(p['owner'])}, {lit(big)})")
        self.refused("ST003", "t_settlement", f"SELECT settlement.request_quote({lit(p['owner'])}, 1)")
        self.refused("ST003", "t_settlement", f"SELECT settlement.request_quote({lit(p['owner'])}, -5)")
        self.assertEqual((self.balance(p["btc"]), self.balance(p["game"])), (50_000, 0))


class Withdrawals(SettlementCase):
    # One database per test: the signer queue is shared state, and each test
    # needs to know exactly what is in it.
    @classmethod
    def setUpClass(cls):
        pass

    @classmethod
    def tearDownClass(cls):
        pass

    def setUp(self):
        self.db = pg.create_ledger_database()

    def tearDown(self):
        problems = pg.sql(self.db, "SELECT * FROM ledger.reconcile()", role="t_auditor")
        pg.drop_database(self.db)
        self.assertEqual(problems, [])

    def test_the_full_path_hold_review_sign_broadcast_confirm_settle(self):
        p = self.player()                      # identity not verified: every withdrawal is reviewed
        self.deposit(p, 200_000)
        custody, revenue = self.system("chain_custody"), self.system("revenue")
        wid, status = self.withdraw(p, 50_000)
        self.assertEqual(status, "manual_review")
        self.assertEqual(self.balance(p["btc"]), 200_000 - 51_000, "amount and fee are held at once")
        self.assertEqual(self.call("t_signer", "SELECT * FROM settlement.next_to_sign()"), [], "nothing is signable before review")

        self.assertEqual(pg.one(self.db, f"SELECT settlement.review_withdrawal({lit(wid)}, 'approve', 'ops:compliance-officer')", role="t_compliance"), "approved")
        job = self.call("t_signer", "SELECT * FROM settlement.next_to_sign()")
        self.assertEqual(len(job), 1)
        self.assertEqual((job[0][0], job[0][2]), (wid, "50000"))
        self.assertEqual(self.call("t_signer", "SELECT * FROM settlement.next_to_sign()"), [], "a withdrawal is handed to the signer once")

        tx = txid()
        self.refused("ST003", "t_signer", f"SELECT settlement.mark_broadcast({lit(wid)}, {lit(tx)}, 5000)")
        self.call("t_signer", f"SELECT settlement.mark_broadcast({lit(wid)}, {lit(tx)}, 300)")
        self.assertEqual(pg.one(self.db, f"SELECT settlement.observe_withdrawal({lit(tx)}, 1)", role="t_watcher"), "broadcast")
        self.assertEqual(self.system("chain_custody"), custody, "the books do not move until the chain confirms")
        self.assertEqual(pg.one(self.db, f"SELECT settlement.observe_withdrawal({lit(tx)}, 3)", role="t_watcher"), "settled")
        self.assertEqual(pg.one(self.db, f"SELECT settlement.observe_withdrawal({lit(tx)}, 8)", role="t_watcher"), "settled")

        self.assertEqual(self.balance(p["btc"]), 149_000)
        self.assertEqual(self.system("chain_custody") - custody, 50_300)
        self.assertEqual(self.system("revenue") - revenue, 700)
        self.assertEqual(self.system("withdrawal_pending"), 0)

    def test_requests_outside_the_rules_are_refused_before_any_money_moves(self):
        p = self.player(verified=True)
        self.deposit(p, 100_000)
        for statement, code in (
            (f"SELECT settlement.request_withdrawal({lit(p['owner'])}, 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 50000)", "ST002"),   # a mainnet address
            (f"SELECT settlement.request_withdrawal({lit(p['owner'])}, 'not-an-address', 50000)", "ST002"),
            (f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(p['address'])}, 50000)", "ST002"),                           # our own deposit address
            (f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 9999)", "ST003"),                               # below the minimum
            (f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 100000)", "ST007"),                             # amount plus fee exceeds balance
            (f"SELECT settlement.request_withdrawal('nobody', {lit(address())}, 50000)", "ST001"),
        ):
            self.refused(code, "t_settlement", statement)
        self.assertEqual(self.balance(p["btc"]), 100_000)
        self.assertEqual(pg.one(self.db, f"SELECT count(*) FROM settlement.withdrawals WHERE owner_id = {lit(p['owner'])}"), "0")

    def test_small_withdrawals_by_verified_players_skip_review_and_large_ones_do_not(self):
        p = self.player(verified=True)
        self.deposit(p, 900_000)
        _, small = self.withdraw(p, 100_000)
        self.assertEqual(small, "approved")
        big_id, big = self.withdraw(p, 350_000)
        self.assertEqual(big, "manual_review")
        self.refused("ST003", "t_settlement", f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 100000)")   # daily limit
        self.refused("ST006", "t_compliance", f"SELECT settlement.review_withdrawal({lit(big_id)}, 'approve', '')")
        held = self.balance(p["btc"])
        self.assertEqual(pg.one(self.db, f"SELECT settlement.review_withdrawal({lit(big_id)}, 'reject', 'ops:compliance-officer')", role="t_compliance"), "rejected")
        self.assertEqual(self.balance(p["btc"]) - held, 351_000, "a rejected withdrawal returns the amount and the fee")
        self.refused("ST005", "t_compliance", f"SELECT settlement.review_withdrawal({lit(big_id)}, 'approve', 'ops:compliance-officer')")

    def test_the_books_match_the_wallet_at_every_step(self):
        p = self.player(verified=True)
        base_wallet = -self.system("chain_custody")          # what earlier tests in this database left on chain
        tx = txid()
        self.observe(tx, p["address"], 300_000, 1)
        self.assertEqual(self.reserves_difference(base_wallet + 300_000), 0, "mined, not yet credited")
        self.observe(tx, p["address"], 300_000, 3)
        self.assertEqual(self.reserves_difference(base_wallet + 300_000), 0)
        wid, _ = self.withdraw(p, 100_000)
        self.call("t_signer", "SELECT * FROM settlement.next_to_sign()")
        out = txid()
        self.call("t_signer", f"SELECT settlement.mark_broadcast({lit(wid)}, {lit(out)}, 400)")
        self.assertEqual(self.reserves_difference(base_wallet + 300_000), 0, "broadcast, not yet mined")
        self.call("t_watcher", f"SELECT settlement.observe_withdrawal({lit(out)}, 1)")
        self.assertEqual(self.reserves_difference(base_wallet + 300_000 - 100_400), 0, "mined, not yet settled")
        self.call("t_watcher", f"SELECT settlement.observe_withdrawal({lit(out)}, 3)")
        self.assertEqual(self.reserves_difference(base_wallet + 300_000 - 100_400), 0)
        self.assertEqual(self.reserves_difference(base_wallet + 300_000 - 100_400 - 5_000), -5_000, "a shortfall in the wallet shows up as a difference")


class Redemption(SettlementCase):
    def enable(self):
        pg.script(self.db, "ALTER TABLE settlement.policy DISABLE TRIGGER policy_fixed; UPDATE settlement.policy SET redemption_enabled = true; ALTER TABLE settlement.policy ENABLE TRIGGER policy_fixed;")

    def test_1_game_funds_are_not_redeemable_by_default(self):
        p = self.player()
        self.deposit(p, 100_000)
        self.convert(p, 100_000)
        self.assertEqual(pg.one(self.db, "SELECT redemption_enabled FROM settlement.policy"), "f")
        error = self.refused("ST010", "t_settlement", f"SELECT settlement.request_redemption({lit(p['owner'])}, 10000)")
        self.assertIn("not redeemable", error.message)
        self.assertEqual((self.balance(p["game"]), self.balance(p["btc"])), (50_000, 0))
        self.refused("ST009", None, "UPDATE settlement.policy SET redemption_enabled = true")

    def test_2_when_enabled_each_redemption_still_needs_an_officer(self):
        self.enable()
        p = self.player()
        self.deposit(p, 100_000)
        self.convert(p, 100_000)
        issued = self.system("issuance")
        rid = pg.one(self.db, f"SELECT id FROM settlement.request_redemption({lit(p['owner'])}, 20000)", role="t_settlement")
        self.assertEqual((self.balance(p["game"]), self.balance(p["btc"])), (30_000, 0), "cowries are held; no bitcoin has moved")
        self.refused("42501", "t_settlement", f"SELECT settlement.decide_redemption({lit(rid)}, 'authorise', 'svc:settlement')")
        self.refused("ST006", "t_compliance", f"SELECT settlement.decide_redemption({lit(rid)}, 'authorise', ' ')")
        self.assertEqual(pg.one(self.db, f"SELECT settlement.decide_redemption({lit(rid)}, 'authorise', 'ops:settlement-officer')", role="t_compliance"), "authorised")
        self.assertEqual((self.balance(p["game"]), self.balance(p["btc"])), (30_000, 40_000))
        self.assertEqual(self.system("issuance") - issued, 20_000, "redeemed cowries leave circulation")
        self.refused("ST005", "t_compliance", f"SELECT settlement.decide_redemption({lit(rid)}, 'decline', 'ops:settlement-officer')")

        declined = pg.one(self.db, f"SELECT id FROM settlement.request_redemption({lit(p['owner'])}, 10000)", role="t_settlement")
        self.call("t_compliance", f"SELECT settlement.decide_redemption({lit(declined)}, 'decline', 'ops:settlement-officer')")
        self.assertEqual(self.balance(p["game"]), 30_000, "a declined request returns the cowries")
        self.refused("ST007", "t_settlement", f"SELECT settlement.request_redemption({lit(p['owner'])}, 30001)")

    def test_3_a_redemption_cannot_exceed_the_bitcoin_held_in_reserve(self):
        self.enable()
        p = self.player()
        self.deposit(p, 100_000)
        self.convert(p, 100_000)
        # The operator takes the whole reserve as revenue. The cowries are now unbacked.
        reserve = self.system("conversion_reserve")
        ids = pg.sql(self.db, "SELECT purpose, id FROM ledger.accounts WHERE owner_kind = 'system' AND purpose IN ('conversion_reserve', 'revenue') ORDER BY purpose")
        legs = lit([{"account": ids[0][1], "amount": -reserve}, {"account": ids[1][1], "amount": reserve}])
        self.call("t_settlement", f"SELECT * FROM ledger.post_settlement({lit('reserve_release:' + secrets.token_hex(6))}, 'reserve_release', 'ops:finance', 'reserve taken as revenue', {legs}::jsonb)")
        rid = pg.one(self.db, f"SELECT id FROM settlement.request_redemption({lit(p['owner'])}, 50000)", role="t_settlement")
        self.refused("ST008", "t_compliance", f"SELECT settlement.decide_redemption({lit(rid)}, 'authorise', 'ops:settlement-officer')")
        self.call("t_compliance", f"SELECT settlement.decide_redemption({lit(rid)}, 'decline', 'ops:settlement-officer')")
        self.assertEqual((self.balance(p["game"]), self.balance(p["btc"])), (50_000, 0))


class Separation(SettlementCase):
    """Each actor can do its own step and nobody else's."""

    def test_gameplay_and_monetary_roles_cannot_enter_the_settlement_schema(self):
        p = self.player()
        for role in ("t_gameplay", "t_monetary", "t_stranger"):
            for statement in (
                "SELECT * FROM settlement.accounts",
                "SELECT * FROM settlement.deposit_addresses",
                "SELECT * FROM settlement.policy",
                f"SELECT settlement.open_account('x')",
                f"SELECT settlement.request_quote({lit(p['owner'])}, 1000)",
                f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 20000)",
                f"SELECT settlement.observe_deposit({lit(txid())}, 0, {lit(p['address'])}, 1000, 1, 9)",
                "SELECT * FROM settlement.next_to_sign()",
            ):
                self.refused("42501", role, statement)

    def test_no_role_can_do_another_roles_step(self):
        p = self.player(verified=True)
        self.deposit(p, 500_000)
        wid, _ = self.withdraw(p, 350_000)          # held for review
        tx = txid()
        cases = {
            "t_watcher": [f"SELECT settlement.review_withdrawal({lit(wid)}, 'approve', 'x')", "SELECT * FROM settlement.next_to_sign()",
                          f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 20000)", "SELECT * FROM settlement.withdrawals"],
            "t_signer": [f"SELECT settlement.review_withdrawal({lit(wid)}, 'approve', 'x')", f"SELECT settlement.observe_withdrawal({lit(tx)}, 3)",
                         f"SELECT settlement.observe_deposit({lit(tx)}, 0, {lit(p['address'])}, 1000, 1, 9)", "SELECT * FROM settlement.withdrawals",
                         f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 20000)"],
            "t_settlement": [f"SELECT settlement.review_withdrawal({lit(wid)}, 'approve', 'x')", "SELECT * FROM settlement.next_to_sign()",
                             f"SELECT settlement.mark_broadcast({lit(wid)}, {lit(tx)}, 100)", f"SELECT settlement.observe_deposit({lit(tx)}, 0, {lit(p['address'])}, 1000, 1, 9)",
                             f"SELECT settlement.set_account_status({lit(p['owner'])}, 'frozen', 'x', 'y')", "UPDATE settlement.withdrawals SET status = 'approved'"],
            "t_compliance": [f"SELECT settlement.request_withdrawal({lit(p['owner'])}, {lit(address())}, 20000)", "SELECT * FROM settlement.next_to_sign()",
                             f"SELECT settlement.mark_broadcast({lit(wid)}, {lit(tx)}, 100)", f"SELECT settlement.observe_deposit({lit(tx)}, 0, {lit(p['address'])}, 1000, 1, 9)",
                             "UPDATE settlement.withdrawals SET status = 'approved'", f"SELECT settlement.accept_quote({lit(p['owner'])}, {lit('00000000-0000-0000-0000-000000000000')})"],
            "t_auditor": [f"SELECT settlement.review_withdrawal({lit(wid)}, 'approve', 'x')", "UPDATE settlement.accounts SET status = 'frozen'", "DELETE FROM settlement.audit_log"],
        }
        for role, statements in cases.items():
            for statement in statements:
                self.refused("42501", role, statement)
        self.assertEqual(pg.one(self.db, f"SELECT status FROM settlement.withdrawals WHERE id = {lit(wid)}"), "manual_review")

    def test_the_schema_holds_no_key_material_and_the_audit_log_cannot_be_edited(self):
        columns = [row[0] for row in pg.sql(self.db, "SELECT column_name FROM information_schema.columns WHERE table_schema = 'settlement'")]
        for name in columns:
            self.assertNotRegex(name, r"key|seed|secret|xprv|mnemonic|password", f"column {name}")
        p = self.player()
        self.deposit(p, 10_000)
        actors = {row[0] for row in pg.sql(self.db, "SELECT DISTINCT actor FROM settlement.audit_log", role="t_auditor")}
        self.assertTrue({"svc:settlement", "svc:wallet"} <= actors, actors)
        self.refused("ST009", None, "UPDATE settlement.audit_log SET actor = 'nobody'")
        self.refused("ST009", None, "DELETE FROM settlement.audit_log")
        self.refused("ST009", None, "TRUNCATE settlement.audit_log")
        self.refused("ST009", None, "UPDATE settlement.policy SET confirmations_required = 1")

    def test_only_sandbox_addresses_are_accepted(self):
        p = self.player()
        self.assertEqual(pg.one(self.db, "SELECT asset FROM settlement.policy"), "TBTC")
        for bad in ("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"):
            self.refused("ST002", "t_settlement", f"SELECT settlement.register_address({lit(p['owner'])}, {lit(bad)}, {secrets.randbelow(2**40)})")
        self.call("t_settlement", f"SELECT settlement.register_address({lit(p['owner'])}, {lit(address('tb1'))}, {secrets.randbelow(2**40)})")


if __name__ == "__main__":
    unittest.main()
