# Poker TD (working title)

A standalone, online multiplayer tower defense game inspired by the classic
**Poker Defense / PokerTD** StarCraft custom maps. You pay gold to be dealt
poker hands, and the hand you make decides which tower you get. You defend
your lane with your team, or you "raise" against rivals by sending creeps into
their lanes.

> Status: **M0 (foundations) done**. Next up is M1, the offline vertical slice
> ([Roadmap](docs/ROADMAP.md)). The earlier single-player Godot prototype is in
> git history (commit `3af8b17`) for reference.

## Design docs

| Doc                                          | What it covers                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| [Game Design](docs/GAME_DESIGN.md)           | Vision, pillars, core loop, game modes, maps, progression, UX             |
| [Mechanics & Balance](docs/MECHANICS.md)     | Cards, hands to towers, suits, upgrades, enemies, waves, economy formulas |
| [Technical Design](docs/TECHNICAL_DESIGN.md) | Stack, architecture, netcode, protocol, data model, testing               |
| [Roadmap](docs/ROADMAP.md)                   | Milestones M0 to M6 with scope and exit criteria                          |

## The pitch in 30 seconds

1. A wave timer counts down. Enemies walk your lane toward the Vault.
2. You spend **50 gold** to be **dealt 5 cards** from your personal deck.
3. You get **redraws** to chase a better hand. It's your deck, so card counting pays off.
4. You **lock** the hand: _Pair_ gives a Twin tower, _Flush_ gives an Elemental,
   _Four of a Kind_ gives a Laser. **Card ranks** set the tower's power and the
   **dominant suit** sets its elemental effect.
5. You place the tower, research suits, and buy deck tweaks in the Card Shop.
6. In **co-op**, up to 6 players hold their own lanes and then share a center
   table and a single life pool. In **Showdown** (versus), you raise gold to
   send hidden creeps at opponents. The last player standing wins.

## Getting started

Requires Node 22.12+ and pnpm 10 (`corepack enable` sets it up).

```sh
pnpm install
pnpm dev            # client on http://localhost:5173, server on :8787
pnpm check          # lint, format check, typecheck, tests
pnpm odds "AH KH 7H 2C 9H" --redraw 2C   # redraw odds for a hand
```

In the client, press `D` to deal, `1`–`5` to mark cards, `R` to redraw and
`Space` to lock.

## Layout

```
packages/sim        deterministic game rules: cards, hand evaluator, RNG, data, formulas
packages/sim/data   tuning data: towers, enemies, waves, rules, maps (JSON)
packages/protocol   client/server messages (zod-validated, msgpack on the wire)
apps/server         Node WebSocket server: rooms and lobbies (match loop in M2)
apps/client         Vite + PixiJS + Preact browser client
```

The sim must stay deterministic. ESLint blocks `Math.random`, `Date` and timers in
`packages/sim/src`, so all randomness goes through `Rng.stream(seed, ...)`.

## Tech

TypeScript monorepo. A pure deterministic simulation package is shared by an
authoritative Node server and a PixiJS browser client, and can later be wrapped
for desktop/Steam. See [Technical Design](docs/TECHNICAL_DESIGN.md).
