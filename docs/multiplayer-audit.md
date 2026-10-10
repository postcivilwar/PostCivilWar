# Multiplayer interaction system: audit and plan

PostCivilWar · prototype of Atani · written for Phase 1 of the multiplayer brief

This is the audit the brief asks for before anything is rewritten: what exists, what is broken, what is
reused, what must change, what the database needs, and what could go wrong. It ends with what was built in
this pass (the core physics, Phase 2) and what the remaining phases need decided before they start.

The short version:

- **Most of the rules the brief describes already exist, and they are already decided by the simulation, not
  by the screen.** Health, fights, theft, witnesses, wanted, arrest, custody, fines, a friend paying a fine,
  contacts, messages, calls and proximity speech are all there and are covered by tests. They are kept and
  built on, not rebuilt.
- **What does not exist is one shared world.** Each open page runs its own copy of the town. Two players on
  two devices can see and hear each other, and now cannot walk through each other, but one cannot hurt, rob,
  arrest, bail, befriend or call the other, because their money, health and police are in two different
  worlds. That is the one thing every remaining phase depends on.
- **Nothing in this pass pretends otherwise.** The new rules (bodies, vehicle impacts, knockdown, death,
  health privacy) are proved with two or more players in one simulation. Between two devices they need the
  shared world, which is not built.

## 1. The architecture as it is

```
 browser page (one per player, today)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  client: three.js scene, controls, phone, HUD                            │
 │     │  requests ("intents")            ▲  what this player may see       │
 │     ▼                                  │  ("view")                       │
 │  host ── game simulation (src/sim) ────┘                                 │
 │     │      rules for movement, work, vehicles, fights, law, care, phone  │
 │     ├── ledger (double entry, append only, idempotency keys)             │
 │     └── settlement portal (sandbox BTC only; separate front door)        │
 │  link ── transport ("room": everyone with the page open)                 │
 └──────────│───────────────────────────────────────────────────────────────┘
            ▼ position, name, look, last thing said  (nothing else travels)
        other pages, each with its own host, simulation and ledger
```

What matters for this brief:

| Part | State |
|---|---|
| **Authority** | The client sends requests such as `move`, `combat.act`, `vehicle.drive`, `custody.pay`. The simulation decides and answers. The client holds no balance, health, arrest state, fine or police role of its own; it draws what the view says. |
| **Requests accepted** | 81 kinds besides `move`. None of them says "I hit", "I killed", "I picked up", "I paid", "I arrested" or "my health is". |
| **Money** | Internal currency (cowries) only, in a double-entry ledger. Every payment is one transaction with a key made from the thing paid for, so a repeated request pays once. Sandbox BTC is behind a separate door that the game cannot open. |
| **Saving** | The whole world of one page is saved in that browser. There are no accounts and nothing is stored on a server. |
| **Database** | PostgreSQL migrations 0001–0003 exist for the ledger, settlement, and "paid once" rules for fines and treatment, with 85 contract tests. **No running service uses them yet**; the browser ledger is a JavaScript model of the same rules. |
| **Network** | The `room` transport carries where a player stands, their name and look, and what they last said. The receiving simulation treats that as an untrusted visitor: it checks every field and decides for itself who is near and what is heard. |
| **Tests** | 170 headless tests of the simulation, 85 database contract tests, and browser play-throughs. |

## 2. The brief, section by section

**Exists** means the rule is in the simulation, decided there, and tested. **Shared world** means it works
among players in one simulation today and needs the zone server to work between devices.

| # | Brief | Status | What is there, and what is missing |
|---|---|---|---|
| 1 | Player collision | **Built this pass** · shared world | Players are bodies 0.3 m in radius. A step into another player is refused; a step is checked along its whole length, so there is no tunnelling; two players who somehow overlap can always step apart, so nobody is pinned. A visitor from another page blocks too. |
| 2 | Vehicle hits player | **Built this pass** · shared world | The simulation sweeps the nose of a moving keke or motorcycle each step. Harm rises with speed; the person struck is thrown, lies for a few seconds, gets up, and has control back. The vehicle stalls. A vehicle starting from rest cannot strike. |
| 3 | Repeated impacts, death | **Built this pass** · shared world | Each pass is one blow, however many requests it took. A blow on someone already down counts for less. Health reaching 0 is death; the dead player comes round at the General Hospital, critical, after 8 s. |
| 4 | Health privacy | **Built this pass** | A player's health is sent only to that player and to someone in a fight or a collision with them, and for 10 s afterwards. Before this pass every nearby player's health was sent to everyone near. |
| 5 | Death and money drop | **Not built** · needs a decision | Death exists; nothing is dropped. See §6: this is the one item that touches real value and it needs a rule from the owner. |
| 6 | Witnesses → police | **Exists** · shared world | An offence is recorded when it happens. People within 30 m with a clear view may notice, by how grave it was and what sort of person they are. Word takes 3–8 s to reach the police. Officers walk or run from where they are; nobody appears from nowhere. An unseen crime is not known. The new driving offences use this unchanged. |
| 7 | Picking up dropped money as a crime | **Not built** | Follows 5. The offence, witness and wanted steps are ready to take it. |
| 8 | Custody | **Exists** · shared world | A prisoner cannot walk, drive, fight, steal or trade; the simulation refuses those requests. Reason, fine, what must be given back and time left are shown. Custody is part of the saved world, so reloading does not end it. |
| 9 | Friend-based bail | **Exists** · shared world | From custody a player may ask the officer for a call, ring a friend, and the friend is shown the way to the Police Post and pays there (`bail.pay`). A townsperson who knows the player can be asked too, and is then owed the money. |
| 10 | Bail rules, overnight release | **Partly** | Paying is immediate, checked against the ledger, recorded, and releases at once. Someone who cannot pay stays in. **Different from the brief:** time is served by the hour (1–8 game hours by offence) rather than "until next morning", and a player with the money may pay their own fine. Both are one-line rule changes; see decisions. |
| 11 | Police phone call | **Partly** | The request to the officer, the allowance and the limit to known people exist. A call arrives as a notice with a sound, not as a ringing screen with Answer and Decline. |
| 12 | Username accounts | **Not built** | No accounts of any kind. Needs the server. |
| 13 | Identity | **Partly** | A player has a display name and a stable id inside one world. Names are not unique. |
| 14 | Proximity menu | **Partly** | Standing next to another player offers Talk, Fight, and "take their number". There is no single menu listing every action on a player. |
| 15 | Friend requests | **Partly** | Taking a number makes each a contact of the other at once. There is no pending request, accept, decline, cancel or block. |
| 16 | Contacts | **Exists** · shared world | Kept by the simulation: emergency numbers, businesses, townspeople spoken to, other players. Friend or family tags; remove. |
| 17 | Real-time calling | **Partly** | A call is a single request with a result. There is no ringing, answer, decline, missed or busy state, and no call between two devices. |
| 18 | Proximity chat | **Exists**, between devices too | Heard within range, cleaned and length-limited by the hearing simulation, rate-limited (one line every 1.2 s), shown as bubbles. |
| 19 | Phone chat UI | **Exists** · shared world | Threads, bubbles, unread counts, 160 characters. No delivered/read marks or typing indicator. |
| 20 | Notifications | **Exists** | Small dark cards at the top since this pass; kinds for law, alarm, call, message, government. |
| 21 | Smart proximity | **Partly** | Prompts are by distance and facing, with one primary action. Line of sight is used for witnesses but not for prompts. |
| 22 | Polish | **Partly** | Knockdown and lying poses, a jolt and flash for the victim, impact sounds. No dedicated death animation: the body lies where it fell. |
| 23 | Security | **Exists** as a rule; **not yet real** across devices | See §1. With no server there is no attacker to defend against except the player's own browser; the rules are written as the server's so that they move unchanged. |
| 24 | Database | **Partly** | Ledger and settlement schemas exist. Nothing for profiles, friendships, messages, calls, crimes, arrests or drops. See §5. |
| 25 | State machine | **Exists** | Law: normal, suspicious, wanted, pursuit, arrested, custody, released. Body: up, down, rising, dead. Mode: walking, driving, riding, combat, custody, carried. |
| 26 | Edge cases | **Partly** | Covered: double payment, double blow, blow on the ground, death in custody (comes round where held), reload while down or held. Not covered: anything about disconnecting, because there is no connection. |
| 27 | Anti-exploit | **Partly** | Speed limits on every move, rate limits on speech and blows, idempotent payments. Flood limits per connection belong to the server. |
| 28 | UI standard | **Done this pass** | See the UI brief. |
| 29 | Performance | **Partly** | Bodies and impacts are checked only against people within a few metres, townspeople at about 10 Hz. Frame rate on real phones is still unmeasured. |

## 3. What is broken or misleading today

1. **Two devices are two towns.** This is the real gap. A player met through the room link has no wallet,
   health or record in your world. You cannot fight, rob, run down, arrest, bail, befriend or call them.
   The phone's "take their number" works only for players in the same simulation, which outside the tests
   means nobody.
2. **A player's world lives in one browser.** Clearing site data, or opening the game on another phone,
   starts again. Custody "survives a reconnect" only in the sense that the saved world is loaded again.
3. **The clock and the townspeople differ between pages.** Two players standing together see different
   crowds, weather and time of day.
4. **Names are not unique**, so "Ikenna" may be two people.
5. **Health was sent to everyone nearby.** Fixed in this pass.
6. **Dying costs nothing** yet, and townspeople cannot be killed by a vehicle (they are hurt, lie, and get
   up; children are never struck). The second is deliberate for now.

## 4. What was built in this pass (Phase 2)

New module `src/sim/impact.js`, wired into the existing movement, vehicle, fight and law modules rather than
beside them.

- **Bodies.** `move` asks `impact.clear` before a step. Other players and visitors block; a player inside a
  vehicle is not a body.
- **Impacts.** `vehicle.drive` and `moto.drive` ask `impact.step`, which keeps its own acceleration-limited
  record of the vehicle's pace (the client's claimed speed is not used), sweeps the nose over the step, and
  strikes players every step and townspeople about ten times a second. Townspeople step aside for a vehicle
  they can see coming, always for a horn; children always.
- **Harm, knockdown, death.** `conflict.injure` is the only way health reaches 0. Down for 2.4–3.6 s, rising
  0.7 s, a 0.9 s grace so that one pass is one blow and two vehicles at once are one blow. Death, then the
  hospital door at health 20 after 8 s, or where they are held if in custody. The purse is untouched.
- **The law.** Two offences, "Dangerous driving causing harm" (fine 800, 4 h) and "Causing death by dangerous
  driving" (fine 4,000, 8 h), recorded through the existing `justice.offence`, so witnesses, reports, pursuit,
  arrest and fines follow without new code. A killing nobody saw stays unknown.
- **Privacy.** `health` in another player's view is `null` unless the two are involved.
- **Refusals.** While down or dead every request except those allowed to someone being carried is refused
  with `DOWN` or `DEAD`.
- **Client.** Lying poses for players and townspeople, a jolt and red flash for the victim, impact and fall
  sounds, the "Knocked down / Getting up / Killed by…" line, a horn that warns people, pedals on touch
  screens, and sliding past another player instead of sticking to them.

Tests: `test/impact.test.mjs`, 19 tests, all by sending the requests a client sends. They cover blocking, no
tunnelling, no pinning, harm by speed, knockdown and recovery, that no request can hit, kill or revive, one
blow per pass, two vehicles one blow, repeated blows killing, a blow on the ground counting less, revival
with the purse unchanged and the ledger balanced, save and reload while down, health privacy and its lapse,
townspeople dodging, a townsperson hurt and recovering, a child never struck, the victim's report reaching
the police, an unseen killing staying unknown, and a seen killing ending in arrest and a 4,000 fine.

**Not proved:** any of this between two devices; frame rate on a real phone; behaviour under packet loss.

## 5. What must change, and what the database needs

### The shared world (the zone server)

The simulation was written to be the server. It takes requests and returns views; it never touches the page.
The change is where it runs:

1. Run `src/sim` in one Node process per zone, behind a WebSocket. The client's `host.game.intent` and
   `host.game.view` become messages. `src/net/link.js` and the visitor code are then deleted, as their own
   header says.
2. Put the PostgreSQL ledger behind the simulation in place of the in-page one. The schema, the rules and
   the 85 contract tests are already written for this.
3. Keep the settlement portal a separate service with its own credentials, as the standing rule requires.
4. Add what only a server needs: sessions, per-connection rate limits, reconnect that returns the player to
   the state they were in (down, dead, wanted, held), and snapshots of world state.

This is real work, mainly in operations rather than rules: a host for the process and the database, TLS, a
domain, deployment, backups, monitoring. It cannot be published as the artifact the prototype is today.

### Database structures

Reused as they are: `ledger.*` (accounts, transactions, entries, balances, kind rules, paid-once),
`settlement.*`.

New, proposed as migration `0004_players_and_world.sql`, schema `game`:

| Table | Holds | Notes |
|---|---|---|
| `game.accounts` | id, username, username_key (lower-cased, unique), password_hash (argon2id), created, last_seen, status | No email is required by the brief; say so in recovery rules. |
| `game.sessions` | token hash, account, created, expires, revoked | |
| `game.players` | id, account, display name, look, path, zone, x, z, heading, health, body state, body until, law state, wallet account | The row the simulation loads and saves; health and status live here rather than in separate tables. |
| `game.friend_requests` | id, from, to, status (pending, accepted, declined, cancelled), created, answered | Unique on the unordered pair while pending. |
| `game.friendships` | player_a < player_b, since | One row per pair. |
| `game.blocks` | blocker, blocked, since | |
| `game.contacts` | owner, kind, ref, tag, added | Townspeople and businesses as well as players. |
| `game.messages` | id, from, to, body, sent, delivered, read | Index (to, read), (pair, sent). |
| `game.calls` | id, caller, callee, status (ringing, answered, declined, missed, ended, busy), started, answered, ended, from_custody | |
| `game.notifications` | id, player, kind, body, created, seen | Only those that must outlive a session. |
| `game.crimes` | id, zone, type, culprit, victim, at, x, z, amount, status | Mirrors `state.justice.crimes`. |
| `game.witnesses` | crime, who (townsperson index or player), saw_at, reported_at | |
| `game.arrests` | id, no, culprit, officer, crimes[], fine, hours, status, booked, until, payment txn, paid_by | Custody is a status of an arrest, not a separate table. |
| `game.incidents` | id, zone, at, driver, vehicle, victim, speed, harm, killed | The brief's "vehicle_accidents". |
| `game.drops` | id, zone, x, z, amount, from_player, escrow account, created, expires, status (open, taken, expired), taken_by, taken_txn | Only if the money drop is approved; see §6. |

Every table gets a primary key, created and updated times, a status where it has a life cycle, and indexes on
the columns it is looked up by. Row-level rules: the game service's role may read and write `game.*` and may
post only the ledger kinds it is allowed; it has no rights on `settlement.*`. Clients never reach the
database.

## 6. Risks

| Risk | Why it matters | What is proposed |
|---|---|---|
| **Money drop and real value** | Cowries can be bought with BTC (sandbox today). A rule that drops a dead player's money lets one player take another's purchased value by running them down. The standing rules say players must not lose real money unknowingly through a game mechanic, and that the game must not become gambling. | Do not ship a drop until the owner has chosen a rule. Proposed: only a small bounded share of what is *carried* (for example 5 %, at most 200 cowries, the same bound a pickpocket already has), never banked or property value; stated on the phone before a player first leaves the motor park; moved by one ledger transaction into an escrow account for the drop, and by a second, keyed by the drop's id, to whoever picks it up, so two people cannot both be paid; unclaimed drops return to the owner after a set time. The marker would read "120 cowries", not "₦": the standing rule forbids calling the currency naira. |
| **Killing for sport** | Vehicles now kill players. Without a cost to the driver beyond a fine nobody may witness, new players can be farmed at the motor park. | A short protection after arriving and after leaving hospital; no drop from a protected player; the killing offence already carries the heaviest fine. Decide before a public server. |
| **Trusting the room link** | It is tempting to "make it work" between devices by sending blows or pickups over the room. That would be exactly the client-trusted state the brief forbids. | Not done, and not proposed. |
| **Server cost and upkeep** | A zone server and a database must be paid for, secured and watched. | Decide the host first; start with one zone. |
| **Accounts without email** | A username and password with no recovery path means a forgotten password is a lost character and, later, lost funds. | Decide: optional recovery email, or recovery codes shown once. |
| **Phones** | Collision checks are cheap, but the frame rate of the whole game on a real phone is still unmeasured. | Measure on two or three real devices before more is added to the scene. |
| **Moving state** | Saved worlds in browsers will not carry over to accounts. | Say so before launch; offer a one-time import only if it can be done without trusting the browser's numbers (it cannot for money). |

## 7. The remaining phases

Each phase ends with its own tests, as Phase 2 did.

| Phase | Work | Depends on |
|---|---|---|
| **A. Shared world** (new; before the brief's Phase 3) | Zone server over a socket; PostgreSQL ledger in service; reconnect; the client talking to it. Two-device tests of everything that exists: collision, impact, fights, theft, arrest, bail by a friend, messages. | Decision 1 |
| **3. Money and death** | Death animation; the drop, its marker, pickup, escrow, expiry; pickup as an offence when it is another's money. | Decisions 2, 3 |
| **4. Police** | Morning release; who may pay; the custody screen brought in line with the brief's wording. Mostly rule changes. | Decision 4 |
| **5. Identity** | Username and password accounts, unique case-insensitively; sessions; display names. | A, decision 5 |
| **6. Social** | The single proximity menu; friend requests with accept, decline, cancel, block; contacts on top. | A, 5 |
| **7. Communication** | Calls with ringing, answer, decline, missed, busy; the police call as one of them; delivered and read marks. | A, 6 |
| **8. Polish** | Animations, sounds, line of sight for prompts, measured performance on phones. | — |

## 8. Decisions needed from the owner

1. **Where the shared world runs.** A hosted Node process and PostgreSQL database (which provider, whose
   account), or keep to the single-page prototype for now. Everything between two devices waits on this.
2. **What dying costs.** Nothing (as now), or a drop. If a drop: what share, what cap, carried money only,
   and how long before it returns to its owner.
3. **Protection for new and recovering players**, and for how long.
4. **Custody rules.** May a player with the money pay their own fine (as now), or must a friend come? Hours
   by offence (as now), or always until the next morning?
5. **Account recovery.** Username and password only, or with an optional email or one-time recovery codes.
6. **Townspeople and vehicles.** They are hurt and get up. Should a vehicle be able to kill one?
