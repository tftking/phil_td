# Mechanics & Balance Spec

All numbers are **starting values** for a first playable. They live in data
files (`packages/sim/data/*.json`) and are tuned from bot simulations and
playtests. A "tile" is one grid cell. Time is in seconds, and the sim runs at 20 ticks/s.

---

## 1. Cards and deck

- Each player owns a **personal deck**: a standard 52-card deck, plus Jokers
  added via the Shop or House Rules.
- Cards drawn and not kept go to the **discard pile**. When the draw pile
  runs out, the discard pile is reshuffled into it. The UI shows a "Reshuffle" notice.
- The deck state is **server-side**. The client sees only its own hand and the
  public counts (remaining ranks/suits in the draw pile), which enables
  card counting without leaking the order.
- The RNG is seeded per match and per player (see Technical Design §5).

### 1.1 Dealing

| Action     | Cost                                       | Rule                                                                   |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| **Deal**   | 50 g                                       | Draw 5 cards. You can hold only one unlocked hand at a time.           |
| **Redraw** | 1st free, then 20 g, 40 g, 80 g (per hand) | Replace any subset of the 5 cards.                                     |
| **Lock**   | free                                       | Evaluate the best hand and get a tower in placement mode.              |
| **Fold**   | free                                       | Discard the hand. There is no refund, but it clears your hand quickly. |

- The **Deal cost** stays flat. Power scaling comes from waves, research and card
  quality, which keeps the core "one deal = one tower" feel.
- A locked tower must be placed within 20 s, or it goes to the **Bench** (2
  slots) and can be placed later. This stops the timer from punishing players who are busy fighting a wave.

### 1.2 Jokers

- **Joker:** a wild card that becomes the best possible card for the hand.
- A Joker enables **Five of a Kind** (the only way to get it).
- Sources: Card Shop (rare), a reward for a perfect boss wave, and House Rules.
- Max 2 Jokers in a deck.

---

## 2. Hand → tower

The best 5-card poker hand determines the **tower type**. Only the **scoring
cards** (e.g. the two cards of a Pair) determine **power** and **suit**.

### 2.1 Base odds (5 cards, no redraw)

| Hand            | Probability | With 1 optimal redraw (approx.) |
| --------------- | ----------: | ------------------------------: |
| High Card       |       50.1% |                            ~30% |
| Pair            |       42.3% |                            ~45% |
| Two Pair        |       4.75% |                            ~12% |
| Three of a Kind |       2.11% |                             ~7% |
| Straight        |       0.39% |                           ~1.5% |
| Flush           |       0.20% |                             ~2% |
| Full House      |       0.14% |                           ~1.2% |
| Four of a Kind  |      0.024% |                           ~0.3% |
| Straight Flush  |     0.0014% |                          ~0.03% |
| Royal Flush     |    0.00015% |                         ~0.004% |

> The redraw column is a rough estimate. It is computed exactly by the `sim`
> odds tool in M1 and drives the balance targets below.

### 2.2 Tower table

"DPS" is a reference value at power ×1.0, level 1, with no suit effects. Range is in tiles.

| Hand            | Tower         | Role          |  Dmg |      Atk/s | Range | Air | Special                                                  |    Ref DPS |
| --------------- | ------------- | ------------- | ---: | ---------: | ----: | :-: | -------------------------------------------------------- | ---------: |
| High Card       | **Plinker**   | Filler        |   10 |        1.0 |   3.0 |  ✔  | none                                                     |         10 |
| Pair            | **Twin**      | Early carry   |   12 |        1.0 |   3.0 |  ✔  | Hits 2 targets                                           |         24 |
| Two Pair        | **Sentry**    | Reliable DPS  |   22 |        1.4 |   3.5 |  ✔  | none                                                     |         31 |
| Three of a Kind | **Sniper**    | Boss killer   |   90 |        0.5 |   6.0 |  ✔  | Targets highest HP. +50% vs bosses                       |         45 |
| Straight        | **Chain**     | Wave clear    |   30 |        1.2 |   3.5 |  ✔  | Bounces 4× (−15% per bounce)                             |  36 → ~110 |
| Flush           | **Elemental** | Suit carry    |   40 |        1.0 |   3.5 |  ✔  | Splash 1.0 tile. **Suit effect ×2**                      |        40+ |
| Full House      | **Mortar**    | AoE           |  120 |        0.4 |   5.0 |  ✘  | Splash 1.5 tiles. Min range 1.5                          |  48 → ~250 |
| Four of a Kind  | **Laser**     | Single-target | beam | continuous |   4.0 |  ✔  | Beam ramps 60 → 300 DPS over 3 s on one target           |     60–300 |
| Straight Flush  | **Storm**     | Late carry    |   70 |        2.0 |   4.5 |  ✔  | Chain 6×. Suit effect ×2                                 | 140 → ~500 |
| Royal Flush     | **Crown**     | Game changer  |  400 |        1.0 |   5.0 |  ✔  | Splash 2 tiles. **Aura:** towers within 3 tiles +25% dmg |       400+ |
| Five of a Kind  | **Jester**    | Wildcard      |  n/a |        n/a |   n/a | n/a | Copies the strongest adjacent tower at ×1.5 power        |        n/a |

Design intent:

- **High Card is never a total loss.** Plinkers are weak, but a stack of
  Ace-high Plinkers can still hold early waves.
- **Pair/Two Pair** carry waves 1–12. **Trips/Straight/Flush** carry the mid game.
  **Full House and above** carry the late game, supported by research.
- **Air waves** punish Mortar-heavy builds. **Armored waves** punish Chain spam.

### 2.3 Card power (rank)

```
avgRank  = mean rank of scoring cards      (2..14, where A = 14)
power    = 1.0 + 0.05 × (avgRank − 2)      → 2s = ×1.00, Aces = ×1.60
kicker   = for High Card only: power uses the single highest card
```

`power` multiplies **damage**. So a pair of Aces Twin (×1.6) beats a
pair of 2s Twin (×1.0). The difference is meaningful but doesn't beat a
higher hand tier, which keeps chasing hand tiers the main goal.

### 2.4 Suit affinity

The tower's suit is the **most common suit among the scoring cards**. On a
tie, the suit of the highest scoring card wins. Flush/Straight Flush/Royal
are pure-suit, and their suit effect is doubled.

| Suit       | Name       | Effect (base)                    | Research per level (+5 levels)            |
| ---------- | ---------- | -------------------------------- | ----------------------------------------- |
| ♠ Spades   | **Pierce** | Ignore 3 armor                   | +3 armor ignored                          |
| ♥ Hearts   | **Crit**   | 10% chance for ×2 damage         | +4% chance                                |
| ♦ Diamonds | **Greed**  | +1 gold per kill                 | +1 gold per kill (max +6, +12 on a Flush) |
| ♣ Clubs    | **Chill**  | 15% slow for 1.5 s (no stacking) | +5% slow                                  |

---

## 3. Upgrades and research

### 3.1 Tower levels (local)

- Each tower can go to **Level 3**. Each level gives +35% damage and +10% range.
- Cost is `0.6 × tower value` per level, where tower value is 50 g plus the
  redraw gold spent on that hand.
- **Sell** refunds 60% of the total spent (100% if sold within 10 s of placing,
  so misclicks are forgiven).

### 3.2 Suit research (global, per player)

- There are 4 tracks (♠♥♦♣), each with 5 levels. The costs are 100, 200, 350, 550 and 800 g.
- Only one research can run at a time. Each takes 15 s, and it can be queued during waves.
- This makes players commit to a suit strategy. It pairs with Card Shop
  deck-thinning ("remove non-Hearts") to build toward Flushes.

### 3.3 Targeting modes

First (default), Last, Strongest, Weakest, Closest, Flying-first. They can be set per tower.

---

## 4. Card Shop

The shop opens after every **5th wave** for 20 s (the wave timer pauses in solo
and continues in multiplayer). It offers 3 random picks per player, and each
can be bought once.

| Item             |  Cost | Effect                                            |
| ---------------- | ----: | ------------------------------------------------- |
| **Burn**         |  60 g | Permanently remove one chosen card from your deck |
| **Mark**         |  80 g | Duplicate one chosen card                         |
| **Paint**        | 100 g | Change a card's suit                              |
| **Promote**      | 100 g | Raise a card's rank by 1 (A stays A)              |
| **Joker**        | 300 g | Add a Joker (max 2)                               |
| **Extra Redraw** | 150 g | +1 free redraw per hand for the rest of the match |
| **Bench Slot**   | 120 g | +1 Bench slot (max 4)                             |

The deck must always contain at least **30 cards**, so Burn can't make degenerate thin decks.

---

## 5. Enemies

### 5.1 Stats

```
hp(w)      = 60 × 1.13^(w − 1) × typeMult × diffMult
             w1 ≈ 60 · w10 ≈ 180 · w20 ≈ 610 · w30 ≈ 2,100 · w40 ≈ 7,000
armor(w)   = floor(w / 4) × armorMult
speed      = 1.0 tiles/s × typeSpeed
bounty(w)  = 2 + floor(w / 3)          (per kill, before Diamonds)
damage     = armor reduces each hit by a flat amount, min 20% of the hit
```

### 5.2 Archetypes

| Type         | HP × | Speed × | Armor × | Count × | Notes                                                           |
| ------------ | ---: | ------: | ------: | ------: | --------------------------------------------------------------- |
| **Grunt**    |  1.0 |     1.0 |     1.0 |     1.0 | Baseline                                                        |
| **Runner**   |  0.6 |     1.8 |     0.5 |     1.2 | Punishes slow single-target                                     |
| **Brute**    |  2.5 |     0.7 |     2.0 |     0.5 | Armored. Spades shine                                           |
| **Swarm**    | 0.25 |     1.2 |       0 |     4.0 | Punishes single-target. Chain/Mortar shine                      |
| **Flyer**    |  0.8 |     1.1 |     0.5 |     1.0 | Takes a shortcut path. Mortar can't hit it                      |
| **Regen**    |  1.2 |     0.9 |     1.0 |     0.8 | Regenerates 2% HP/s. Burst checks                               |
| **Shield**   |  1.0 |     1.0 |       0 |     0.8 | Shield absorbs the first 30% HP of damage. Hearts crit bypasses |
| **Splitter** |  1.5 |     0.9 |     1.0 |     0.6 | Splits into 3 Swarm on death                                    |
| **Boss**     |   40 |     0.6 |     3.0 |       1 | Every 10 waves. On the Center Table in co-op                    |

### 5.3 Leaks

- Normal creep: −1 life. Brute, Splitter: −2. Boss: −10, or −5 per 25% HP remaining.
- In co-op, a creep leaking from a lane **enters the Center Table** first
  with its remaining HP. Lives are lost only when it reaches the Vault.

---

## 6. Waves

- **Spawn:** each wave spawns across 12–18 s. The wave timer from one wave's
  start to the next is 40 s, rising to 50 s on boss waves.
- **Base count:** 12 + floor(w / 2) creeps × type count multiplier.
- **Composition schedule (40-wave standard):**

| Waves         | Pattern                                               |
| ------------- | ----------------------------------------------------- |
| 1–4           | Grunts. Runners join at w3                            |
| 5             | **Bonus wave:** "Gold rush" with low HP and 3× bounty |
| 6–9           | Grunt/Runner mix. Brutes join at w8                   |
| 7, 17, 27, 37 | **Air waves** (Flyers only)                           |
| 10, 20, 30    | **Boss** + escort                                     |
| 11–19         | Swarm and Regen appear. Mixed waves of 2–3 types      |
| 21–29         | Shield, Splitter. Some waves roll a modifier          |
| 31–39         | All types, with 2 modifiers on some waves             |
| 40            | **Final Boss:** "The House" (phases, spawns adds)     |

**Wave modifiers** (announced in the preview): _Swarm_ (+50% count), _Surge_
(+30% speed), _Ironclad_ (+2× armor), _Dry Spell_ (no bounty, +50% wave
bonus), _Fog_ (−1 range on all towers).

### 6.1 Difficulty presets

| Preset      | HP × | Starting lives | Bounty × |
| ----------- | ---: | -------------: | -------: |
| Casual      |  0.7 |             30 |      1.3 |
| Standard    |  1.0 |  20 + 5/player |      1.0 |
| High Roller |  1.4 |  10 + 3/player |     0.85 |

---

## 7. Economy

```
starting gold     = 150  (enough for 2 deals + a redraw)
wave clear bonus  = 20 + 5 × w      (paid at wave start, before spawn)
interest          = 4% of banked gold at wave start, cap 30 g/wave
kill bounty       = see §5.1 (+ Diamonds)
```

**Target curve** (a Standard, average player by the end of the wave): about 1.5
deals per wave early (w1–10), 2–3 deals per wave mid (w11–25), and gold split
between deals, research and levels late.

**Balance guardrails** (checked automatically by bot sims, see Technical Design §8):

- A "greedy lock-first-pair" bot clears wave 15 on Standard at least 90% of the time and wave 40 at most 5%.
- A "smart redraw + Hearts research" bot clears wave 40 at least 60% of the time.
- No single tower family should be over 50% of the winning bots' damage dealt.

---

## 8. Showdown-specific rules

### 8.1 Raise (sends)

| Send               |  Cost | Income +/wave | Unlocks               |
| ------------------ | ----: | ------------: | --------------------- |
| 3× Grunt           |  30 g |            +2 | w1                    |
| 3× Runner          |  40 g |            +3 | w3                    |
| 1× Brute           |  60 g |            +4 | w6                    |
| 6× Swarm           |  70 g |            +5 | w9                    |
| 2× Flyer           |  80 g |            +6 | w12                   |
| 1× Regen Brute     | 150 g |           +10 | w16                   |
| "All-in" Mini-boss | 400 g |           +25 | w20, once per 5 waves |

- Sends scale with the current wave's HP formula.
- Sends go to the **next living opponent clockwise** in FFA, or to the
  opposing team's lanes round-robin in team modes.
- Raises lock in when the wave spawns. Targets see a chip-stack indicator
  (gold total) during the countdown, but not the unit types.
- **Income** replaces interest in Showdown and is paid at wave start.

### 8.2 Lives

20 per player. Bust at 0. Busted players' lanes stop being targets.

---

## 9. Disconnects and AFK (co-op)

- A disconnected player's towers keep firing, and their lane is still defended
  by whatever is built.
- Reconnect grace is 3 minutes, with a full state resync.
- After 3 minutes, the lane owner can be replaced by a bot (host setting), or the lane's
  gold is split among teammates, who may then build in that lane.
