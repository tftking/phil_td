# Roadmap

Milestones are ordered by **risk**. The first goal is proving that the
card-to-tower loop is fun offline. Only then do we pay for netcode, and only
after that do we build content and meta. Sizes assume a solo developer part
time, using S (about 1 week), M (2–3 weeks) and L (4–6 weeks). Each milestone
has **exit criteria**, and we don't move on until they're met.

```
M0 Foundations ─► M1 Offline slice ─► M2 Online co-op ─► M3 Content ─► M4 Showdown ─► M5 Online platform ─► M6 Launch
     S                 M                    M               L              M                  M                  L
```

---

## M0: Foundations (S)
- [ ] pnpm monorepo: `packages/sim`, `packages/protocol`, `apps/client`, `apps/server`
- [ ] TS strict, ESLint + Prettier, Vitest, GitHub Actions CI (lint, typecheck, test)
- [ ] Seeded RNG with streams, fixed-tick loop, state hash util
- [ ] Card model, deck (draw/discard/reshuffle), **hand evaluator** with exhaustive test
- [ ] Odds tool CLI (`pnpm odds "AH KH 7H 2C 9H" --redraw 2C`)
- [ ] Data loading for `towers.json`, `enemies.json`, `waves.json`, and `maps/felt.json`

**Exit:** CI green. The evaluator matches known 5-card frequencies exactly. The same seed gives the same deal sequence.

## M1: Offline vertical slice (M)
The goal is to find the fun. The sim runs in a Web Worker in the browser, with no server.
- [ ] Map "The Felt" (1 lane), path rendering, build tiles, the Vault
- [ ] Deal → redraw → lock → place flow, with hand UI, live hand preview and deck tracker
- [ ] Towers: Plinker, Twin, Sentry, Sniper, Chain, Mortar (6 of 11)
- [ ] Creeps: Grunt, Runner, Brute, Flyer. Waves 1–15 with a boss at w10
- [ ] Card power (rank) and suit affinity. Suit effects for ♠♥♦♣
- [ ] Tower levels, sell, targeting modes
- [ ] Economy: bounty, wave bonus, interest
- [ ] Basic VFX/SFX: hits, deaths, a big-hand banner
- [ ] `tools/balance` with a **greedy bot**, and a first balance report

**Exit:** 5 or more external playtesters play 15 waves, and most want "one more run".
The median playtest has at least 3 "redraw or lock?" decisions per wave.
Balance guardrails for w1–15 pass.

> **Kill/pivot checkpoint:** if the loop isn't fun here, iterate on M1
> (deal cost, redraw rules, hand→tower spread) before any netcode work.

## M2: Online co-op (M)
- [ ] Node room server, `ws` transport, msgpack plus Zod-validated intents
- [ ] Lobby codes, join by URL, ready-up, host settings
- [ ] Snapshot and delta broadcast at 10 Hz, client interpolation, private hand messages
- [ ] Multi-lane map with the **Center Table** and shared lives
- [ ] Reconnect with token and full resync. AFK/disconnect handling
- [ ] Pings and basic chat
- [ ] Offline mode reuses the same room code in-process (single code path)
- [ ] Deploy to one VPS/Fly region with TLS

**Exit:** 4 players on different networks finish a 15-wave match with no
desync or crash. p99 server tick is under 5 ms. A reconnect mid-wave works.

## M3: Content complete for co-op (L)
- [ ] All 11 towers, including Laser, Storm, Crown and Jester. Jokers
- [ ] All creep types plus modifiers. 40-wave schedule, bosses at w10/20/30, and the final boss "The House"
- [ ] Suit research tracks. Card Shop (Burn, Mark, Paint, Promote, Joker, Redraw, Bench)
- [ ] Co-op tools: **Slip** and **The Pot / River Card**
- [ ] Bench slots and the placement timeout
- [ ] Maps: The Felt (1–6), Riverboat (2–4), Back Room (1–3)
- [ ] Difficulty presets, Endless mode
- [ ] Smart bot, bot allies in solo, and the full nightly balance CI with guardrails
- [ ] Interactive tutorial

**Exit:** a full 40-wave co-op match is winnable, and about 30–50% of
Standard lobbies win in playtests. All guardrails pass nightly, and no tower
family is over 50% of damage share.

## M4: Showdown (versus) (M)
- [ ] Raise/sends with the income system, hidden raise composition (Bluff)
- [ ] FFA targeting (clockwise) and team modes (2v2, 3v3, 4v4)
- [ ] Bust, spectate, Sudden Death after w25
- [ ] Map: Vegas Strip (2–8)
- [ ] Bot opponents that raise
- [ ] End-of-match scoreboard: damage, leaks caused, best hand, raise value

**Exit:** 8-player FFA runs stably. No dominant send strategy in bot sims
(win-rate spread under 10% across 4 raise-style bots). Median match length is 15–25 min.

## M5: Online platform (M)
- [ ] Accounts: guest by default, optional OAuth (Discord/Google/Steam later)
- [ ] Postgres: profiles, match history, stats, Hand Book collection
- [ ] Quick-play matchmaking for co-op (fill to 4) and Showdown (fill to 6)
- [ ] Replays: stored per match, with an in-client replay viewer
- [ ] Daily Deal with leaderboard
- [ ] Moderation: mute, report, chat filter. Rate limits per account
- [ ] Metrics dashboards, error reporting
- [ ] Decide monetization (see GDD §9)

**Exit:** a public beta keeps 100 or more concurrent players on one region
without incidents for a week. Day-7 retention is measured.

## M6: Polish and launch (L)
- [ ] Art pass: casino-noir felt, tower and creep sprites, card art, big-hand cinematics
- [ ] Audio pass: music (lobby, waves, boss), SFX set, stingers
- [ ] Accessibility: 4-color deck, colorblind modes, reduced motion, rebindable keys, UI scale
- [ ] Performance: 300+ creeps at 60 fps on integrated GPUs, and mobile-browser sanity check
- [ ] Unlocks and cosmetics, account levels
- [ ] Tauri desktop build, Steam page, achievements, Steam lobby/invite integration
- [ ] Localization-ready strings (EN first)
- [ ] Trailer and store assets. Launch

**Exit:** ship v1.0 to the web and Steam.

---

## Post-launch backlog
- **Hold'em mode** (community cards)
- Ranked Showdown with seasons and ELO/Glicko
- House Rules editor and custom lobbies browser
- Map editor (`tools/map-editor`) and community maps
- New tower families via special hands (e.g. "Flush House", "Five Aces")
- Weekly mutator events
- Spectator mode with casting tools

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Loop feels like pure luck | Core fun fails | Redraws, deck tracker, Card Shop deck-shaping, odds hints. Test in M1 before netcode |
| Balance explodes with 11 towers × 4 suits × research | Degenerate strategies | Data-driven numbers, nightly bot sims with guardrails, damage-share telemetry |
| Netcode complexity | Delays | Server-authoritative snapshots (no prediction/rollback). Creeps synced as a single path distance |
| Too few players to fill lobbies | Dead queues | Bots in solo and fill, lobby links for friend groups, Daily Deal for async play |
| Scope creep (modes, maps) | Never shipping | Strict milestone exits. Hold'em and ranked are post-launch |
| IP confusion with the original maps | Legal/branding | Original name, art and content. "Inspired by" only. No Blizzard assets |
