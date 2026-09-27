# Balance report

Numbers come from `pnpm balance`, which plays full headless matches with bots.
Bots only see what a human in their seat sees (their own hand and deck
contents, never the draw order).

- **greedy**: deals whenever it can, locks any pair, never researches or
  upgrades. It stands in for a new player.
- **smart**: chooses redraws by expected tower value, researches its main suit,
  upgrades once its lane is full, and uses the shop. It stands in for a good player.
- **raiser** (Showdown): smart, plus it invests about 30% of its gold in raises.

Treat bot win rates as an **upper bound** for humans: bots never misclick or hesitate.

## Guardrails (checked nightly in CI)

| Guardrail                              | Target      | Result                    |
| -------------------------------------- | ----------- | ------------------------- |
| Greedy clears wave 15 (solo Standard)  | ≥ 90%       | 100%                      |
| Greedy wins (solo Standard)            | ≤ 5%        | 0% (dies around wave 30)  |
| Smart wins (solo Standard)             | ≥ 60%       | 79–87%                    |
| Top tower family share of smart damage | ≤ 50%       | ~35% (Mortar)             |
| Showdown raise-style win-rate spread   | < 10 points | 4 (4p, 300 games), 3 (8p) |
| Showdown median match length           | 15–25 min   | 18 min                    |

## Co-op win rates (smart bots, 24–60 runs each)

| Setup                         |                                        Win rate |
| ----------------------------- | ----------------------------------------------: |
| The Felt, solo, Casual        |                                            100% |
| The Felt, solo, Standard      |                                          79–87% |
| The Felt, solo, High Roller   |                                             17% |
| The Felt, 4 players, Standard |                                             92% |
| Riverboat, 2 players          | 50% (before the lives change), 75% at 4 players |
| Back Room, 1 player           |                                             54% |
| Back Room, 3 players          |                                             38% |

## Changes made from the first design numbers

| Change                                                                        | Why                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lives: 15 + 10 per player on Standard (was 20 + 5)                            | Every lane leaks into one shared pool, so 4 players won 25% against 87% solo. Now 92%                                                                                                                                                                                                               |
| Casual 25 + 10 per player, High Roller 8 + 5                                  | Same scaling across difficulties                                                                                                                                                                                                                                                                    |
| Final boss HP ×1.25 (was ×2)                                                  | The ×2 version was a wall for every build                                                                                                                                                                                                                                                           |
| Bosses spawn in every lane (not only on the Center Table)                     | Center towers alone could not kill a boss; the Center Table still catches leaks                                                                                                                                                                                                                     |
| Map HP multiplier (Back Room 0.75×)                                           | Short lanes give towers less time; 0% wins without it                                                                                                                                                                                                                                               |
| Back Room gets one more build row (24 tiles)                                  | 18 tiles was not enough at wave 30                                                                                                                                                                                                                                                                  |
| Raised creeps: +10% HP, no bounty for the target (was normal HP, half bounty) | The first nightly run caught raisers at 17% vs 33%: sent creeps almost never leaked and fed the target gold. +50% HP swung it to 33% vs 18%; +10% lands at 27% vs 23% over 300 games (11% vs 14% at 8 players). Doubling raise income alone changed nothing, since late-game gold has nowhere to go |
| Nightly Showdown sample raised to 300 games                                   | 100 games left about ±5 points of noise per style against a 10-point limit                                                                                                                                                                                                                          |

## What the damage mix says

Winning smart runs lean on Mortar (~30–35%), Sniper (~18–21%), Laser (~15%) and
Elemental and Chain (~10% each). Twin and Sentry carry the early waves and fade
later, which matches the design intent. Air waves (7, 17, 27, 37) are the most
common place to lose lives, because Mortars can't hit flyers.

## Reproduce

```sh
pnpm balance --runs 60 --check
pnpm balance --map backroom --players 3 --styles smart
pnpm balance --mode showdown --map vegas --players 8 --runs 24 --check
pnpm balance --difficulty high_roller --csv results.csv
```
