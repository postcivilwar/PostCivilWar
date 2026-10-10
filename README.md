# PostCivilWar

A persistent multiplayer simulation of Nigeria in which players build the country's
towns, businesses and institutions from undeveloped land. Its home will be
postcivilwar.com. Until the second week of October 2026 the working name was Nigeria
Life World; the folder and a few storage keys still carry it.

The architecture and its reasoning are in the **Architecture Decision Document**
(shared separately). Read that first.

## What exists

| Path | What it is | State |
| --- | --- | --- |
| `prototype/` | A browser-playable prototype of the first vertical slice: Atani, Anambra State, on the River Niger. A town of 1,000 people with homes, jobs and daily routines; a hospital, schools, a university, a polytechnic, a college and two churches to walk into; okada riders who carry passengers for a fare; speech in English, Pidgin, Igbo, Yoruba and Hausa; chat with players who are near; positional sound; health and fighting, witnesses, police who arrest on foot, fines and the return of stolen money, a hospital, a clinic and an ambulance, a phone that is taken out and held, with fifteen apps, a camera and music, vehicles that can be taken, players who cannot walk through each other, vehicles that knock people down and can kill a player, buttons that are pictures and change with what the player is doing, and ten camera views. It opens with the brand, PLAY, a story in five pictures and one question (hero or villain); its interface is black and white and kept small, and people walk and run from the planted foot up. Under it: a land registry, permits, staged construction, shops, jobs, a keke to hire, buy and drive | Playable. 221 headless tests pass, plus scripted browser sessions with keyboard and with real touch input. **Not** the production client. Players who meet can see and talk to each other and block each other's way, but each page still runs its own copy of the world: there is no zone server yet, so nothing involving health, money or the law works between two devices (`docs/multiplayer-audit.md`). On the website, accounts, the market and seeing other players go through `api/`. |
| `api/`, `server/` | The website's server: one function on PostgreSQL. Accounts (a username and a password), each account's character, the shared market (what is for sale, who owns what, the talk and the sale), and where signed-in players are. `server/` runs it on this machine and tests it | Working. 31 tests against a real PostgreSQL, and a scripted session of two players in two browsers. Money is still each player's own game's (see `prototype/README.md`, "The server"). |
| `services/ledger/` | Append-only double-entry ledger in PostgreSQL, and the bitcoin settlement data model beside it | Working at the database level. 85 contract tests pass. No network service in front of it yet. |

The brand's font, mark and the supplied story slides are in `prototype/assets/brand`
with the limits that come with the slides. People in the prototype are built on one supplied character model, in
`prototype/assets/characters` with its notes. Every keke and coach is one of two
supplied vehicle models, in `prototype/assets/vehicles` with theirs. There is no Unreal Engine client, no zone server and no network service in this
repository. `prototype/README.md` lists which parts of the prototype are interfaces
standing in for those, and what replaces each.

## Money

- **Bitcoin is the only real-world asset.** Bitcoin deposits and bitcoin withdrawals.
  No naira, no other fiat, no other cryptocurrency.
- **Everything here runs on test bitcoin.** The ledger is created as a sandbox and
  refuses an asset on the live Bitcoin network. That cannot be changed with an update;
  it takes a reviewed migration.
- **Gameplay uses a separate game currency**, **TR** (2,000 TR are the £20 a newcomer
  arrives with; until 10 October 2026 it was called the cowrie and its asset code `CWR`).
  It is not naira and does not represent legal tender.
- **The game cannot reach bitcoin.** Custody and settlement are a separate schema with
  separate database roles. The gameplay role cannot read or write a bitcoin account.
- **Game funds are not redeemable for bitcoin** unless the settlement policy enables
  it and a named officer authorises each request. The policy is off.
- **No key material is stored anywhere in this repository or its schemas.** There is
  no Bitcoin node, wallet or signer yet; the chain is simulated in tests.

Holding players' bitcoin and paying it out is a licensed activity in Nigeria. Nothing
here should be pointed at the live network before that is resolved with counsel.

## Layout

```
prototype/              (exists) Atani slice: simulation, browser client, tests
site/                   (exists) the website as served: written by `node build.mjs --site`, never edited by hand
api/                    (exists) the website's server: api/game.js and what it is made of (accounts, saved characters, the market)
server/                 (exists) the server on this machine (dev.mjs), a throwaway PostgreSQL for it, and its tests
services/
  ledger/               (exists) ledger and settlement schema, contract tests
docs/
  test-plan-gameplay.md (exists) what is tested for fighting, the law, treatment, the phone and controls, and what still needs a person
  multiplayer-audit.md  (exists) the multiplayer brief against what is built: what exists, what is missing, the database it needs, the risks, the decisions
```

Planned, created when they have working content:

```
client/                 Unreal Engine 5 project: PC client and dedicated zone server
proto/                  Protocol Buffers contracts shared by zone servers and services
services/
  settlement/           settlement service, chain watcher, signer, compliance console
  platform/             identity, registry, economy, government, world directory, social
tools/
  geodata/              pipeline from open geographic data to game terrain and parcels
  loadtest/             simulated clients for zone and handoff testing
infra/                  deployment definitions
docs/                   further design documents, one per system, written with the system
```

## Running things

Play the prototype: open `prototype/dist/local.html` in a browser.

The website (postcivilwar.com) is the `site/` folder, served as it is. It is the
same game as a page that can be installed on a phone or a computer and opens
with no connection. To bring it up to date: `node build.mjs --site` in
`prototype/`, then commit `site/`. What is pushed to `main` is live.

Simulation tests (Node 18 or later, no packages):

```
cd prototype
node --test test/*.test.mjs
```

The website's server (a local PostgreSQL install; nothing downloaded):

```
server/with-postgres.sh node --test server/test/*.test.mjs     # accounts, the market, the game's own client code against it
server/with-postgres.sh node server/dev.mjs                    # the whole site at http://localhost:8787/, accounts and all
```

On the host the server needs one thing: a PostgreSQL address in `POSTGRES_URL` (the
database integration sets it). `PCW_ADMINS` may name the usernames, separated by
commas, who can put new things on the market. No secret is in the repository or in
the page.

Ledger and settlement tests (a local PostgreSQL install and Python 3, nothing
downloaded):

```
cd services/ledger
./scripts/run-tests.sh
```
