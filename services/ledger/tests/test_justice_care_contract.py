"""Contract tests for money that moves because of a crime, an arrest or a hospital bill.

Migration 0003 adds four kinds of transaction (theft, restitution, fine,
medical_fee) and makes the ledger itself refuse the mistakes that matter
most: charging twice for one thing, and sending a fine to the wrong people.

Each test states one promise and checks it against a real PostgreSQL
database, connected as the gameplay service, which is the only role that
posts these. Run with scripts/run-tests.sh.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import pg
from pg import PgError, lit
from test_ledger_contract import LedgerCase, key


def ref(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class JusticeCase(LedgerCase):
    def player(self, amount=0):
        """A player and their wallet: (player id, account)."""
        who = uuid.uuid4().hex
        account = self.wallet(owner=who)
        if amount:
            self.issue(account, amount)
        return who, account

    def treasury(self, code=None) -> str:
        """A government account of its own, so that one test's fines are not counted in another's."""
        return self.wallet(owner=code or ref("NG"), kind="government", purpose="treasury")

    def business(self, name=None) -> str:
        return self.wallet(owner=name or ref("biz"), kind="business", purpose="till")

    def fine(self, payer, amount, arrest, officer, legs, **kw):
        return self.game("fine", [(payer, -amount), *legs], meta={"arrest": arrest, "officer": officer}, **kw)


class Fines(JusticeCase):
    def test_a_fine_after_an_arrest_by_a_police_officer_goes_to_government_in_full(self):
        _, culprit = self.player(5_000)
        government = self.treasury()
        self.fine(culprit, 400, ref("A"), "npc:17", [(government, 400)])
        self.assertEqual((self.balance(culprit), self.balance(government)), (4_600, 400))
        self.assertConsistent()

    def test_no_player_is_paid_when_a_police_officer_made_the_arrest(self):
        _, culprit = self.player(5_000)
        _, bystander = self.player()
        government = self.treasury()
        before = self.count("transactions")
        self.assertRefused("NL012", self.fine, culprit, 400, ref("A"), "npc:17", [(government, 396), (bystander, 4)])
        self.assertEqual((self.balance(culprit), self.balance(government), self.balance(bystander)), (5_000, 0, 0))
        self.assertEqual(self.count("transactions"), before)

    def test_a_constables_fine_is_split_ninety_nine_to_one_in_one_transaction(self):
        _, culprit = self.player(5_000)
        constable_id, constable = self.player()
        government = self.treasury()
        txn, _ = self.fine(culprit, 1_000, ref("A"), f"player:{constable_id}", [(constable, 990), (government, 10)])
        self.assertEqual((self.balance(culprit), self.balance(constable), self.balance(government)), (4_000, 990, 10))
        # one transaction, three entries, nothing made and nothing lost
        self.assertEqual(pg.one(self.db, f"SELECT count(*) FROM ledger.entries WHERE txn_id = {lit(txn)}"), "3")
        self.assertEqual(pg.one(self.db, f"SELECT sum(amount) FROM ledger.entries WHERE txn_id = {lit(txn)}"), "0")
        self.assertConsistent()

    def test_the_governments_share_is_rounded_up_and_is_never_nothing(self):
        constable_id, constable = self.player()
        government = self.treasury()
        _, culprit = self.player(10_000)
        #        fine, government, constable
        cases = [(250, 3, 247), (50, 1, 49), (101, 2, 99), (100, 1, 99), (2, 1, 1)]
        for amount, tax, reward in cases:
            g0, c0 = self.balance(government), self.balance(constable)
            self.fine(culprit, amount, ref("A"), f"player:{constable_id}", [(constable, reward), (government, tax)])
            self.assertEqual((self.balance(government) - g0, self.balance(constable) - c0), (tax, reward), amount)
        # a fine of one unit is all government's: there is nothing left to share
        g0 = self.balance(government)
        self.fine(culprit, 1, ref("A"), f"player:{constable_id}", [(government, 1)])
        self.assertEqual(self.balance(government) - g0, 1)
        self.assertConsistent()

    def test_any_other_split_of_a_constables_fine_is_refused(self):
        _, culprit = self.player(5_000)
        constable_id, constable = self.player()
        government = self.treasury()
        officer = f"player:{constable_id}"
        for reward, tax in [(1_000 - 9, 9), (1_000 - 11, 11), (500, 500)]:
            self.assertRefused("NL012", self.fine, culprit, 1_000, ref("A"), officer, [(constable, reward), (government, tax)])
        # all of it to the constable, or all of it to government when a constable is owed a share
        self.assertRefused("NL012", self.fine, culprit, 1_000, ref("A"), officer, [(constable, 1_000)])
        self.assertRefused("NL012", self.fine, culprit, 1_000, ref("A"), officer, [(government, 1_000)])
        self.assertEqual((self.balance(culprit), self.balance(constable), self.balance(government)), (5_000, 0, 0))

    def test_the_constables_share_goes_to_the_constable_who_made_the_arrest_and_nobody_else(self):
        _, culprit = self.player(5_000)
        constable_id, _ = self.player()
        _, friend = self.player()
        shop = self.business()
        government = self.treasury()
        officer = f"player:{constable_id}"
        self.assertRefused("NL012", self.fine, culprit, 1_000, ref("A"), officer, [(friend, 990), (government, 10)])
        self.assertRefused("NL012", self.fine, culprit, 1_000, ref("A"), officer, [(shop, 990), (government, 10)])
        self.assertEqual((self.balance(friend), self.balance(shop), self.balance(government)), (0, 0, 0))

    def test_a_constable_cannot_pay_their_own_prisoners_fine_and_collect_the_share(self):
        constable_id, constable = self.player(5_000)
        _, second = self.player()
        government = self.treasury()
        # an account may appear only once in a transaction, so the share would have to go to a second account
        self.assertRefused("NL012", self.fine, constable, 1_000, ref("A"), f"player:{constable_id}", [(second, 990), (government, 10)])
        self.assertRefused("NL012", self.fine, constable, 1, ref("A"), f"player:{constable_id}", [(government, 1)])
        self.assertEqual(self.balance(constable), 5_000)

    def test_a_fine_must_say_which_arrest_and_which_officer(self):
        _, culprit = self.player(5_000)
        government = self.treasury()
        self.assertRefused("NL012", self.game, "fine", [(culprit, -400), (government, 400)], meta={"officer": "npc:1"})
        self.assertRefused("NL012", self.game, "fine", [(culprit, -400), (government, 400)], meta={"arrest": ref("A")})
        self.assertRefused("NL012", self.game, "fine", [(culprit, -400), (government, 400)], meta={"arrest": "", "officer": "npc:1"})
        self.assertRefused("NL012", self.game, "fine", [(culprit, -400), (government, 400)], meta={"arrest": 7, "officer": "npc:1"})
        self.assertEqual(self.balance(culprit), 5_000)

    def test_someone_else_may_pay_the_fine(self):
        _, friend = self.player(2_000)
        _, culprit = self.player(0)
        government = self.treasury()
        self.fine(friend, 400, ref("A"), "npc:3", [(government, 400)])
        self.assertEqual((self.balance(friend), self.balance(culprit), self.balance(government)), (1_600, 0, 400))


class PaidOnce(JusticeCase):
    def test_a_retried_fine_is_answered_and_not_charged_again(self):
        _, culprit = self.player(5_000)
        government = self.treasury()
        arrest, idem = ref("A"), key()
        first = self.fine(culprit, 400, arrest, "npc:1", [(government, 400)], idem=idem)
        again = self.fine(culprit, 400, arrest, "npc:1", [(government, 400)], idem=idem)
        self.assertEqual((first[0], first[1], again[1]), (again[0], False, True))
        self.assertEqual((self.balance(culprit), self.balance(government)), (4_600, 400))

    def test_the_same_arrest_cannot_be_fined_twice_under_another_key(self):
        _, culprit = self.player(5_000)
        _, friend = self.player(5_000)
        government = self.treasury()
        arrest = ref("A")
        self.fine(culprit, 400, arrest, "npc:1", [(government, 400)])
        self.assertRefused("NL011", self.fine, culprit, 400, arrest, "npc:1", [(government, 400)])
        self.assertRefused("NL011", self.fine, friend, 400, arrest, "npc:1", [(government, 400)])      # nor by someone else
        self.assertRefused("NL011", self.fine, culprit, 900, arrest, "npc:1", [(government, 900)])     # nor for another amount
        self.assertEqual((self.balance(culprit), self.balance(friend), self.balance(government)), (4_600, 5_000, 400))
        self.assertConsistent()

    def test_twenty_people_paying_one_fine_at_the_same_instant_pay_it_once(self):
        payers = [self.player(1_000)[1] for _ in range(20)]
        government = self.treasury()
        arrest = ref("A")
        gate = pg.Gate(self.db, 7103)
        gate.close()

        def attempt(payer):
            try:
                self.fine(payer, 400, arrest, "npc:1", [(government, 400)], before=(gate.wait_statement(),))
                return "paid"
            except PgError as error:
                return error.sqlstate

        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = [pool.submit(attempt, payer) for payer in payers]
            gate.wait_for_queue(20)
            gate.open()
            outcomes = sorted(future.result() for future in futures)
        self.assertEqual(outcomes, ["NL011"] * 19 + ["paid"])
        self.assertEqual(self.balance(government), 400)
        self.assertEqual(sorted(self.balance(p) for p in payers), [600] + [1_000] * 19)
        self.assertConsistent()

    def test_a_fine_that_could_not_be_paid_can_still_be_paid_later(self):
        _, culprit = self.player(100)
        government = self.treasury()
        arrest = ref("A")
        self.assertRefused("NL001", self.fine, culprit, 400, arrest, "npc:1", [(government, 400)])
        self.assertEqual(pg.one(self.db, f"SELECT count(*) FROM ledger.paid_once WHERE subject = {lit('arrest:' + arrest)}"), "0")
        self.issue(culprit, 1_000)
        self.fine(culprit, 400, arrest, "npc:1", [(government, 400)])
        self.assertEqual((self.balance(culprit), self.balance(government)), (700, 400))

    def test_a_hospital_bill_is_paid_once_for_its_quote(self):
        _, patient = self.player(5_000)
        hospital = self.treasury()
        quote = ref("Q")
        meta = {"quote": quote, "place": "hospital", "from": "20", "to": "60"}
        self.game("medical_fee", [(patient, -540), (hospital, 540)], meta=meta)
        self.assertRefused("NL011", self.game, "medical_fee", [(patient, -540), (hospital, 540)], meta=meta)
        self.assertRefused("NL011", self.game, "medical_fee", [(patient, -780), (hospital, 780)], meta={**meta, "to": "80"})
        self.assertEqual((self.balance(patient), self.balance(hospital)), (4_460, 540))

    def test_an_ambulance_is_paid_once_for_its_call(self):
        _, patient = self.player(5_000)
        hospital = self.treasury()
        call = ref("C")
        self.game("medical_fee", [(patient, -150), (hospital, 150)], meta={"call": call})
        self.assertRefused("NL011", self.game, "medical_fee", [(patient, -150), (hospital, 150)], meta={"call": call})
        self.assertEqual(self.balance(patient), 4_850)

    def test_a_theft_is_recorded_once_for_its_crime(self):
        _, victim = self.player(1_000)
        _, culprit = self.player()
        crime = ref("CR")
        self.game("theft", [(victim, -200), (culprit, 200)], meta={"crime": crime})
        self.assertRefused("NL011", self.game, "theft", [(victim, -200), (culprit, 200)], meta={"crime": crime})
        self.assertEqual((self.balance(victim), self.balance(culprit)), (800, 200))


class Shapes(JusticeCase):
    def test_treatment_is_paid_to_a_hospital_clinic_or_government_never_to_a_player(self):
        _, patient = self.player(5_000)
        _, someone = self.player()
        clinic = self.business("clinic")
        self.assertRefused("NL012", self.game, "medical_fee", [(patient, -300), (someone, 300)], meta={"quote": ref("Q")})
        self.game("medical_fee", [(patient, -300), (clinic, 300)], meta={"quote": ref("Q")})
        self.assertEqual((self.balance(patient), self.balance(someone), self.balance(clinic)), (4_700, 0, 300))

    def test_a_bill_for_treatment_must_name_its_quote_or_call(self):
        _, patient = self.player(5_000)
        clinic = self.business()
        self.assertRefused("NL012", self.game, "medical_fee", [(patient, -300), (clinic, 300)], meta={"place": "clinic"})
        self.assertEqual(self.balance(patient), 5_000)

    def test_a_bill_for_treatment_has_one_patient_and_one_payee(self):
        _, patient = self.player(5_000)
        clinic, other = self.business(), self.business()
        self.assertRefused("NL012", self.game, "medical_fee", [(patient, -300), (clinic, 200), (other, 100)], meta={"quote": ref("Q")})
        self.assertEqual(self.balance(patient), 5_000)

    def test_stolen_money_goes_back_to_the_victim_and_never_exceeds_what_the_culprit_has(self):
        _, victim = self.player(1_000)
        _, culprit = self.player()
        crime, arrest = ref("CR"), ref("A")
        self.game("theft", [(victim, -200), (culprit, 200)], meta={"crime": crime})
        self.assertRefused("NL001", self.game, "restitution", [(culprit, -201), (victim, 201)], meta={"crime": crime, "arrest": arrest})
        self.game("restitution", [(culprit, -200), (victim, 200)], meta={"crime": crime, "arrest": arrest})
        self.assertEqual((self.balance(victim), self.balance(culprit)), (1_000, 0))
        self.assertConsistent()

    def test_restitution_may_be_paid_in_parts_but_each_part_only_once(self):
        _, victim = self.player()
        _, culprit = self.player(120)
        crime, arrest, first = ref("CR"), ref("A"), key()
        meta = {"crime": crime, "arrest": arrest}
        self.game("restitution", [(culprit, -120), (victim, 120)], meta=meta, idem=first)
        self.assertEqual(self.game("restitution", [(culprit, -120), (victim, 120)], meta=meta, idem=first)[1], True)
        self.issue(culprit, 80)
        self.game("restitution", [(culprit, -80), (victim, 80)], meta=meta)
        self.assertEqual((self.balance(victim), self.balance(culprit)), (200, 0))

    def test_restitution_and_theft_must_name_the_crime(self):
        _, a = self.player(500)
        _, b = self.player()
        self.assertRefused("NL012", self.game, "theft", [(a, -100), (b, 100)], meta={})
        self.assertRefused("NL012", self.game, "restitution", [(a, -100), (b, 100)], meta={"crime": ref("CR")})
        self.assertEqual(self.balance(a), 500)

    def test_none_of_this_creates_money(self):
        _, culprit = self.player(3_000)
        government = self.treasury()
        self.assertRefused("NL004", self.game, "fine", [(self.issuance, -400), (government, 400)], meta={"arrest": ref("A"), "officer": "npc:1"})
        self.assertRefused("NL003", self.fine, culprit, 400, ref("A"), "npc:1", [(government, 401)])
        self.assertEqual((self.balance(culprit), self.balance(government)), (3_000, 0))

    def test_ordinary_transactions_are_untouched_by_these_rules(self):
        payer, payee = self.funded_wallet(1_000), self.wallet()
        self.game("transfer", [(payer, -100), (payee, 100)], meta={"arrest": "A-1"})
        self.game("transfer", [(payer, -100), (payee, 100)], meta={"arrest": "A-1"})
        self.assertEqual(self.balance(payee), 200)


class Oversight(JusticeCase):
    def test_the_game_service_cannot_change_the_rules_or_the_record_of_what_was_paid(self):
        for statement in (
            "UPDATE ledger.policy SET value = 50",
            "UPDATE ledger.kind_rules SET once_per = '{}'",
            "DELETE FROM ledger.paid_once",
            "INSERT INTO ledger.paid_once (kind, subject, txn_id) VALUES ('fine', 'arrest:x', gen_random_uuid())",
            "SELECT * FROM ledger.fine_distribution",
        ):
            with self.assertRaises(PgError) as caught:
                pg.sql(self.db, statement, role="t_gameplay")
            self.assertEqual(caught.exception.sqlstate, "42501", statement)

    def test_not_even_the_owner_edits_the_rules_in_place(self):
        for statement in ("UPDATE ledger.policy SET value = 50", "DELETE FROM ledger.kind_rules", "DELETE FROM ledger.paid_once"):
            with self.assertRaises(PgError) as caught:
                pg.sql(self.db, statement)
            self.assertEqual(caught.exception.sqlstate, "NL009", statement)

    def test_the_auditor_can_see_where_every_fine_went(self):
        constable_id, constable = self.player()
        _, culprit = self.player(5_000)
        government = self.treasury()
        a1, a2 = ref("A"), ref("A")
        self.fine(culprit, 400, a1, "npc:9", [(government, 400)])
        self.fine(culprit, 1_000, a2, f"player:{constable_id}", [(constable, 990), (government, 10)])
        rows = pg.sql(self.db, f"SELECT arrest, amount, to_government, to_constable, reversed FROM ledger.fine_distribution WHERE arrest IN ({lit(a1)}, {lit(a2)}) ORDER BY amount", role="t_auditor")
        self.assertEqual(rows, [[a1, "400", "400", "0", "f"], [a2, "1000", "10", "990", "f"]])
        totals = pg.sql(self.db, "SELECT sum(amount), sum(to_government) + sum(to_constable) FROM ledger.fine_distribution WHERE NOT reversed", role="t_auditor")
        self.assertEqual(totals[0][0], totals[0][1])

    def test_a_fine_charged_in_error_can_be_reversed_by_the_admin_and_stays_on_the_record(self):
        constable_id, constable = self.player()
        _, culprit = self.player(5_000)
        government = self.treasury()
        arrest = ref("A")
        txn, _ = self.fine(culprit, 1_000, arrest, f"player:{constable_id}", [(constable, 990), (government, 10)])
        pg.sql(self.db, f"SELECT * FROM ledger.post_reversal({lit(key())}, {lit(txn)}, 'ops:reviewer', 'wrong person arrested')", role="t_admin")
        self.assertEqual((self.balance(culprit), self.balance(constable), self.balance(government)), (5_000, 0, 0))
        self.assertEqual(pg.one(self.db, f"SELECT reversed FROM ledger.fine_distribution WHERE arrest = {lit(arrest)}", role="t_auditor"), "t")
        # the arrest is spent: a fresh fine needs a fresh arrest record
        self.assertRefused("NL011", self.fine, culprit, 1_000, arrest, f"player:{constable_id}", [(constable, 990), (government, 10)])
        self.assertConsistent()

    def test_every_one_of_these_payments_carries_who_what_when_and_why(self):
        _, patient = self.player(5_000)
        hospital = self.treasury("NG-AN-" + uuid.uuid4().hex[:6])
        quote, idem = ref("Q"), key()
        txn, _ = self.game("medical_fee", [(patient, -540), (hospital, 540)], idem=idem, reason="Treatment at Atani General Hospital, to 60% health", meta={"quote": quote, "place": "hospital"})
        row = pg.sql(self.db, f"SELECT idempotency_key, kind, initiator, reason, metadata ->> 'quote', created_at IS NOT NULL FROM ledger.transactions WHERE id = {lit(txn)}")
        self.assertEqual(row, [[idem, "medical_fee", "svc:test", "Treatment at Atani General Hospital, to 60% health", quote, "t"]])
        seen = pg.sql(self.db, f"SELECT subject, amount, paid_to FROM ledger.medical_fees WHERE transaction_id = {lit(txn)}", role="t_auditor")
        self.assertEqual(seen[0][:2], [quote, "540"])
        self.assertTrue(seen[0][2].startswith("government:NG-AN-"), seen)
