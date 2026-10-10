# Ledger and settlement

Two PostgreSQL schemas:

- `ledger` — an append-only, double-entry record of every movement of value.
- `settlement` — everything to do with bitcoin deposits, conversion, withdrawals,
  redemption and compliance. It is the only caller of the ledger's bitcoin functions.

**Status: working and tested at the database level.** 85 contract tests pass (38 ledger,
18 settlement, 29 for fines, restitution and medical fees). There is no network service, Bitcoin node, wallet or signer in front of
this yet (see "Not built yet"). Everything runs on test bitcoin.

## The money model

| | Asset | Class | Units | Notes |
| --- | --- | --- | --- | --- |
| Test bitcoin | `TBTC` | `external` | satoshis | Network `regtest`. The only external asset. |
| Game currency | `CWR` | `game` | whole cowries | Internal. Not naira, not legal tender. |

There is no fiat asset and no other cryptocurrency. Adding an asset later is a row in
`ledger.assets`; transaction kinds are named for what happens (`deposit`, `conversion`),
not for bitcoin, and a test adds a second test asset without touching the game economy.

**Sandbox guard.** `ledger.environment` holds one row, `sandbox`, and cannot be updated.
While it says `sandbox`, an asset on a live network is refused (`NL010`). Going live is
a reviewed migration, never a setting.

A transaction kind has a scope, and each role may post only its own scopes:

| Scope | Kinds | Touches |
| --- | --- | --- |
| `game` | `transfer`, `wage`, `goods_purchase`, `land_purchase`, `government_fee`, `issuance`, `retirement`, and from migration 0003 `theft`, `restitution`, `fine`, `medical_fee` | Cowrie accounts only |
| `external` | `deposit`, `withdrawal_hold`, `withdrawal_release`, `withdrawal_settle`, `reserve_release` | Bitcoin accounts only |
| `bridge` | `conversion`, `redemption_hold`, `redemption_release`, `redemption` | Both |

Operator accounts:

| Account | Asset | Meaning |
| --- | --- | --- |
| `chain_custody` | TBTC | Mirror of what the wallet holds on chain. May go negative. |
| `conversion_reserve` | TBTC | Bitcoin players have converted. Backs the cowries issued for it. |
| `withdrawal_pending` | TBTC | Held between a withdrawal request and its confirmation. |
| `revenue` | TBTC | Withdrawal fees less network fees. |
| `issuance` | CWR | Mirror of all cowries in circulation. May go negative. |
| `redemption_escrow` | CWR | Held while a redemption waits for a decision. |

## What the ledger guarantees

Each line is checked by a test in `tests/test_ledger_contract.py`.

| Guarantee | How it is enforced |
| --- | --- |
| Every transaction sums to zero for each asset | Checked when posting, and again by a deferred constraint trigger at commit |
| A balance never goes below zero, except the two mirror accounts | Checked when posting, and by a `CHECK` constraint on `ledger.balances` |
| A retried request has no second effect | Unique idempotency key plus a hash of the request; a different request under the same key is refused |
| Concurrent spends of the same funds produce one payment | Row locks on the balances involved, always taken in account-id order, so there are no deadlocks |
| History cannot be edited | Triggers refuse `UPDATE`, `DELETE` and `TRUNCATE` on transactions, entries, accounts, assets and the environment, for every user |
| Gameplay cannot touch bitcoin or create game currency | Database roles: each service may execute only its own functions and has no table privileges |
| Corruption is detectable | `ledger.reconcile()` rebuilds every balance from the entries and reports any difference |

There is no "pending" status in the ledger. A posted transaction is final. A correction
is a new transaction that reverses the original and links to it.

## Fines, stolen money and hospital bills (migration 0003)

Money that moves because of a crime, an arrest or a hospital bill goes through
`ledger.post_game` like any other payment. For these four kinds the ledger also refuses,
whoever asks:

| Refused | Code | How |
| --- | --- | --- |
| Paying the same thing twice under a different idempotency key: one `fine` for an arrest, one `medical_fee` for a quote or an ambulance call, one `theft` for a crime | `NL011` | `ledger.paid_once`, written by a trigger in the same database transaction as the payment. Two payers at the same instant: one waits, then is refused |
| A fine that goes to the wrong people. After an arrest by a police officer (`officer` is not `player:…`) the whole fine goes to one government account. After an arrest by a player constable, government has `fine_government_parts_per_hundred` (1) parts in a hundred, rounded up and never less than one unit, that constable has the rest, and nobody else has anything | `NL012` | A deferred constraint trigger at commit, like the zero-sum rule |
| A constable paying their own prisoner's fine | `NL012` | The same trigger |
| Treatment paid to a player's account; a bill with two payees | `NL012` | The same trigger, from `ledger.kind_rules` |
| A transaction of these kinds that does not name its crime, arrest and officer, or quote or call, in its metadata | `NL012` | A trigger on the transaction row |

A retry with the same key is still answered with the first result and does nothing. A
payment that fails (not enough money) leaves the arrest or the quote unpaid and payable.
A reversal by the admin role is exempt from the shape rules and leaves the arrest spent.

The rules are rows in `ledger.kind_rules` and `ledger.policy`. Nobody updates them in
place, not even the owner; a change is a migration. The auditor reads them, and two
views: `ledger.fine_distribution` (each fine, what went to government and what to the
constable, whether it was reversed) and `ledger.medical_fees`.

Each line above is checked by a test in `tests/test_justice_care_contract.py`.

## Settlement

Policy lives in one immutable row, `settlement.policy`:

| Setting | Value |
| --- | --- |
| Confirmations before a deposit is credited | 3 |
| Conversion rate | 1 cowrie per 2 satoshis (placeholder) |
| Quote lifetime | 60 seconds, single use |
| Minimum withdrawal | 10,000 satoshis |
| Withdrawal fee | 1,000 satoshis |
| Daily withdrawal limit | 500,000 satoshis |
| Manual review above | 300,000 satoshis, and for unverified accounts |
| Redemption of cowries for bitcoin | **Off** |
| Accepted address form | Test networks only (`bcrt1…`, `tb1…`) |

Flows:

- **Deposit.** The chain watcher calls `observe_deposit` each time it sees an output to
  one of our addresses. It is credited once, at the required confirmations, under the
  key `deposit:<asset>:<txid>:<vout>`. An output cannot change its address or amount
  once seen. A deposit that compliance has flagged, or one to a frozen account, is not
  credited. There is no function to clear a flag yet.
- **Conversion.** `request_quote` fixes the rate; `accept_quote` is one bridge
  transaction that moves the bitcoin to `conversion_reserve` and issues the cowries.
- **Withdrawal.** `request_withdrawal` holds the amount and fee at once. It is approved
  automatically or sent to `manual_review`; then `next_to_sign` → `mark_broadcast` →
  `observe_withdrawal` settles it. A rejection returns the amount and the fee.
- **Redemption.** Refused with `ST010` while the policy is off. When on, each request
  is held in escrow until a named officer authorises or declines it, and it is refused
  if the conversion reserve does not cover it.
- **Proof of reserves.** `proof_of_reserves(wallet_sats)` compares what the wallet
  reports with the ledger, allowing for withdrawals in flight.

Every decision is written to `settlement.audit_log`, which is append-only. The schema
has no column that could hold a private key, and a test checks that.

## Roles

These are group roles. A deployment creates one login per service and adds it to one.

| Role | May execute | Cannot |
| --- | --- | --- |
| `nlw_gameplay` | `ledger.post_game`, `open_game_account`, `game_balance` | Touch bitcoin accounts, debit operator accounts (so it cannot issue currency), read tables, enter the `settlement` schema |
| `nlw_monetary` | `ledger.post_monetary`, `open_game_account`, `game_balance` | Touch bitcoin accounts |
| `nlw_settlement` | `ledger.post_settlement`, `open_external_account`, `open_game_account`, `external_balance`; `settlement.open_account`, `register_address`, `request_quote`, `accept_quote`, `request_withdrawal`, `request_redemption` | Post gameplay kinds, approve its own withdrawals, sign |
| `nlw_chain_watcher` | `settlement.observe_deposit`, `observe_withdrawal` | Approve, sign, or credit by hand |
| `nlw_signer` | `settlement.next_to_sign`, `mark_broadcast` | Create or approve a withdrawal |
| `nlw_compliance` | `settlement.review_withdrawal`, `decide_redemption`, `set_account_status`, `set_verification`, `flag_deposit`, `proof_of_reserves`; read settlement tables | Move funds directly |
| `nlw_ledger_admin` | `ledger.post_reversal`, `reconcile` | Post anything else |
| `nlw_auditor` | `SELECT` on both schemas, `reconcile`, `proof_of_reserves` | Write anything |

## Calling it

```sql
SELECT transaction_id, replayed
  FROM ledger.post_game(
         'wage:2026-10:employee-481',          -- idempotency key, 8 to 200 characters
         'wage',                               -- transaction kind
         'svc:economy',                        -- initiator
         'October payroll',                    -- reason
         '[{"account": "<employer uuid>", "amount": -150},
           {"account": "<employee uuid>", "amount":  150}]'::jsonb);
```

Errors carry these SQLSTATE codes:

| Code | Meaning |
| --- | --- |
| `NL001` | Insufficient funds |
| `NL002` | Idempotency key already used for a different request |
| `NL003` | Entries do not sum to zero for an asset |
| `NL004` | Not permitted for the calling role |
| `NL005` | Invalid request |
| `NL006` | Unknown account |
| `NL007` | Already reversed, or not reversible |
| `NL009` | Attempt to modify append-only data |
| `NL010` | Asset on a live network refused in a sandbox |
| `NL011` | Already paid: a transaction of this kind exists for this arrest, quote, call or crime |
| `NL012` | The transaction does not have the shape its kind requires |
| `22003` | Arithmetic would exceed the range of a 64-bit balance |
| `ST001` | Unknown or frozen settlement account |
| `ST002` | Bad address |
| `ST003` | Amount outside limits |
| `ST004` | Quote unusable (unknown, used or expired) |
| `ST005` | Wrong state for this step |
| `ST006` | A named reviewer or officer is required |
| `ST007` | Insufficient funds for the request |
| `ST008` | Conversion reserve does not cover the redemption |
| `ST009` | Attempt to change immutable settlement data |
| `ST010` | Redemption is not enabled |

The functions assume the default `READ COMMITTED` isolation level.

## Running the tests

```
./scripts/run-tests.sh
```

This needs a local PostgreSQL install and Python 3. It has been run on PostgreSQL 16.15
only; the tests read `pgbench` output that exists from version 15. It downloads nothing.
It starts a throwaway cluster, runs the tests as the real service roles over
password-authenticated TCP, and deletes the cluster. When run as root it runs the server
as the `postgres` user; if that user cannot reach the default temporary directory, set
`NLW_PG_TMP` to a directory it owns.

The ledger suite includes a 6,400-attempt random transfer run from 16 concurrent
connections (`pgbench`), after which value must be conserved and reconciliation clean.

## Not built yet

- A Bitcoin node, address derivation, the chain watcher, the signer and any key
  handling. The tests play the watcher and signer by calling their functions.
- Identity-verification and transaction-screening providers. The schema records a
  verification level, a provider reference and a deposit flag; nothing calls a provider.
- Regulatory reports.
- A network service (gRPC) in front of these functions.
- A transactional outbox so other services can react to posted transactions.
- Incremental reconciliation. `ledger.reconcile()` scans every row.
- Table partitioning by month and sub-accounts for high-volume operator accounts.
- Periodic hash checkpoints of the transaction log, to make tampering by a database
  superuser evident. The append-only triggers stop mistakes and ordinary roles; a
  superuser can disable triggers.
