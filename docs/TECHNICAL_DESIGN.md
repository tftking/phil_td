# Technical Design

## 1. Goals and constraints

- **Online multiplayer first:** 1–6 co-op and 2–8 versus, over the public internet.
- **Server authoritative:** hidden decks, no client-trusted gold or damage.
- **Zero-install entry:** someone shares a lobby link and a friend plays in the browser.
- **Deterministic simulation:** needed for replays, bot balance testing,
  desync debugging and the Daily Deal.
- **Solo-dev friendly:** one language end to end and minimal ops.

## 2. Stack decision

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript** (strict) everywhere | Shared sim code for client and server, one toolchain |
| Monorepo | **pnpm workspaces** + Turborepo | Simple package boundaries, cached builds |
| Simulation | Plain TS package, **no dependencies** | Runs in Node, in the browser, and in test workers |
| Server | **Node 22** + `ws` (raw WebSocket) + a small room manager | Full control of the tick loop. Colyseus is a fallback if lobby work grows |
| Client rendering | **PixiJS v8** (WebGL/WebGPU) | Fast 2D, handles hundreds of sprites and particles |
| Client UI | **Preact** + signals overlay (HTML/CSS) | Menus, the hand UI and tooltips are easier in the DOM than on canvas |
| Build | **Vite** | Fast dev server with HMR |
| Schemas | **Zod** for message validation, `msgpackr` for the wire format | Safe server input, compact packets |
| Tests | **Vitest**, plus a headless bot-sim CLI | Unit tests for sim rules and batch balance runs |
| Persistence (M5) | **Postgres** (accounts, stats) + Redis optional | Only needed once accounts and matchmaking exist |
| Desktop (M6) | **Tauri** wrapper | Small binary, Steam distribution |
| Hosting | One VPS / Fly.io region to start | A single Node process handles many rooms (each is ~1% of a CPU) |

**Alternative considered:** Godot 4 (the previous prototype). Its web export
and multiplayer story are weaker for browser join links, and GDScript can't be
shared with a web backend. We keep the prototype's lessons (hand evaluation,
placement UX, float-text throttling) and not its code.

## 3. Repository layout

```
/
├─ apps/
│  ├─ client/          # Vite + PixiJS + Preact
│  │  ├─ src/render/   # map, towers, creeps, VFX (reads sim state)
│  │  ├─ src/ui/       # hand, HUD, shop, lobby, menus
│  │  ├─ src/net/      # socket, interpolation, prediction of UI-only actions
│  │  └─ src/local/    # offline mode: runs sim in a Web Worker
│  └─ server/          # Node room server
│     ├─ src/rooms/    # Room lifecycle, tick loop, broadcast
│     ├─ src/lobby/    # lobby codes, ready-up, host settings
│     └─ src/persist/  # (M5) accounts, match results
├─ packages/
│  ├─ sim/             # deterministic game rules (THE game)
│  │  ├─ src/cards/    # deck, hand eval, odds tool
│  │  ├─ src/entities/ # towers, creeps, projectiles (logic only)
│  │  ├─ src/systems/  # movement, targeting, combat, economy, waves
│  │  └─ data/         # towers.json, enemies.json, waves.json, maps/*.json
│  ├─ protocol/        # message types + zod schemas + encode/decode
│  └─ bots/            # AI players for balance runs and bot allies
├─ tools/
│  ├─ balance/         # CLI: run N matches with bot configs → CSV report
│  └─ map-editor/      # (later) simple grid painter → maps/*.json
└─ docs/
```

**The rule:** `packages/sim` never imports the client, the server, `Date`,
`Math.random`, or anything async. All randomness goes through the seeded
RNG, and all time is ticks.

## 4. Simulation model

- **Fixed timestep:** 20 ticks/s (50 ms). All durations are stored in ticks.
- **State** is a plain serializable object (ECS-lite: arrays of structs keyed by id).

```ts
interface MatchState {
  tick: number;
  seed: number;
  mode: 'coop' | 'showdown';
  phase: 'lobby' | 'countdown' | 'wave' | 'shop' | 'ended';
  wave: { n: number; nextAtTick: number; spawnQueue: SpawnEntry[] };
  players: Record<PlayerId, PlayerState>;
  towers: Record<EntityId, Tower>;
  creeps: Record<EntityId, Creep>;
  team: { lives: number; pot: number };           // coop
  nextId: number;
}

interface PlayerState {
  id: PlayerId; lane: number; gold: number; lives: number; // lives: showdown
  deck: { draw: Card[]; discard: Card[] };  // SERVER-ONLY, stripped from snapshots
  hand: Hand | null;                         // private to owner
  bench: TowerBlueprint[];
  research: Record<Suit, number>;
  income: number;                            // showdown
  raisesQueued: RaiseEntry[];                // hidden until spawn
}

interface Creep {
  id: EntityId; type: CreepType; pathId: string;
  dist: number;          // distance along path in tiles  ← key to cheap sync
  hp: number; maxHp: number; armor: number; speed: number;
  slowUntil: number; slowPct: number; shield: number;
}
```

- **Creeps live on paths.** Position is `(pathId, dist)`, and the world
  position is derived from the path polyline. Movement is `dist += speed × dt`.
  This makes creep sync one float per creep.
- **Targeting** uses a precomputed coverage map: for each tower, the path
  segments that are in range, turned into `dist` intervals. "Creeps in range"
  then becomes an interval check with no spatial hash needed. Targets are
  rescanned every 4 ticks and staggered by tower id.
- **Projectiles** are resolved **logically** as delayed hits (`hitAtTick`).
  The client draws them from attack events, so the sim doesn't simulate projectile flight.
- **Systems order per tick:** inputs → economy → wave spawner → movement →
  targeting → attacks/damage → status effects → deaths/bounty → leaks → win/loss.

### 4.1 Hand evaluation
- Bitmask evaluator (ranks as a 13-bit mask, plus suit counts). It's under 1 µs per hand.
- Handles Jokers by trying substitutions (at most 2 Jokers, so at most 52² tries, cached).
- The **odds tool** (`sim/src/cards/odds.ts`) runs Monte Carlo for the current
  hand plus redraw choices. It powers the optional client hint ("~18% to hit a
  flush") and the balance docs.

## 5. Randomness and hidden information

- The match seed is generated by the server. The RNG is **per stream**:
  `rng(seed, 'deck', playerId)`, `rng(seed, 'waves')`, `rng(seed, 'crit')`, and so on
  (PCG32 or xoshiro128**). Streams are independent, so adding a feature doesn't shift other outcomes.
- Deck order is **never sent** to clients. The client receives:
  - its own hand (private message),
  - public deck counts (remaining cards by rank and suit),
  - the tower blueprint after a lock (public).
- Showdown raises are sent to targets as a gold total only until spawn.

## 6. Networking

### 6.1 Model
**Server-authoritative simulation with snapshot broadcast.** Clients send
*intents* and render interpolated snapshots. There is no client-side game
prediction; it isn't needed, because TD input isn't twitch input. UI actions like
toggling cards for redraw are local until they're submitted.

```
Client ──intent (msgpack/ws)──► Room.inputQueue ──► sim.step() @20Hz
Client ◄──snapshot delta @10Hz + events (immediate)── Room.broadcast
```

- **Snapshots** go out at 10 Hz with delta compression against the last acked snapshot:
  - creeps: `id, type, dist, hpPct` (about 8 bytes each after quantization),
  - towers: sent only on change (placed, upgraded, sold, target mode),
  - player public state: gold, lives, research, income.
- **Events** are sent immediately and reliably, in order: `attack`, `death`, `leak`,
  `bigHand`, `waveStart`, `shopOpen`, `chat`.
- **Budget:** 300 creeps × 8 B × 10 Hz ≈ 24 KB/s worst case per client. Typical is under 8 KB/s.
- **Client interpolation** renders about 100 ms behind the latest snapshot and
  lerps `dist` along the path.

### 6.2 Protocol (initial)

```ts
// client → server
type C2S =
  | { t: 'join'; room: string; name: string; token?: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'deal' }
  | { t: 'redraw'; idx: number[] }           // indices 0..4
  | { t: 'lock' } | { t: 'fold' }
  | { t: 'place'; blueprint: number; x: number; y: number }
  | { t: 'upgrade'; tower: EntityId } | { t: 'sell'; tower: EntityId }
  | { t: 'target'; tower: EntityId; mode: TargetMode }
  | { t: 'research'; suit: Suit }
  | { t: 'shopBuy'; item: number; card?: CardId; arg?: number }
  | { t: 'slip'; card: number; to: PlayerId }       // coop
  | { t: 'pot'; amount: number }                    // coop
  | { t: 'raise'; send: SendType; count: number }   // showdown
  | { t: 'ping'; kind: PingKind; x: number; y: number }
  | { t: 'chat'; text: string }
  | { t: 'ack'; snap: number };

// server → client
type S2C =
  | { t: 'welcome'; you: PlayerId; token: string; static: MatchStatic }
  | { t: 'snap'; n: number; base: number; delta: Uint8Array }
  | { t: 'hand'; cards: Card[]; redrawsUsed: number; eval: HandEval } // private
  | { t: 'deckCounts'; ranks: number[]; suits: number[] }             // private
  | { t: 'event'; e: GameEvent }
  | { t: 'reject'; reason: string; ref?: string }                    // invalid intent
  | { t: 'lobby'; state: LobbyState };
```

- Every intent is **validated** by schema, then by rules (enough gold? tile free?
  your lane or a free center slot?). Invalid intents get a `reject` and an
  "invalid" sound on the client.
- **Rate limits:** 30 intents/s per client, and chat has a separate limit.

### 6.3 Rooms and lobbies
- A room is one match: `Room { id, code, state, sockets, inputQueue, tickTimer }`.
- **Lobby codes** are 5 letters (`FELT7`). Joining via URL: `/play/FELT7`.
- The host picks the mode, map, difficulty and House Rules. Everyone readies up and the match starts.
- **Reconnect:** a session token is kept in localStorage. On reconnect the
  server sends a full snapshot plus the private hand. The grace period is 3 min (§9 of Mechanics).
- **Pause:** co-op only. Any player may call a vote, and the majority pauses for up to 2 min per match.

### 6.4 Scaling
- Each process runs N rooms on one event loop. Each room's tick costs roughly 0.3–1 ms.
- M5 adds horizontal scaling with a small **matchmaker** service that assigns
  rooms to processes. Clients connect to `wss://gs-{n}.domain`.
- The room state machine is independent of the transport, so it can move to
  worker threads if a process gets hot.

## 7. Replays and debugging
- A replay is `{ version, seed, settings, inputs: [tick, playerId, intent][] }`.
  Replays are small (tens of KB) because the sim is deterministic.
- The server saves replays for every match (M5) and on crash or desync reports.
- **State hash** checks: in dev builds the client runs a shadow sim in offline
  replay mode and compares hashes, which catches non-determinism early.
- A version-locked replay needs the matching `sim` version, so the `sim`
  package version is stamped into the replay.

## 8. Testing and balance

| Layer | What |
|-------|------|
| Unit | Hand evaluator (exhaustive over all 2.6M 5-card hands against known frequencies), damage/armor math, economy formulas |
| Sim integration | Scripted inputs, then asserting state at tick N (e.g. "Twin kills wave 1 Grunts") |
| Determinism | The same seed and inputs run twice must give an identical state hash |
| Protocol | Zod round trips, fuzzed intents never crash the room |
| Bot balance | `pnpm balance --bots greedy,smart --runs 1000 --map felt` produces a CSV of wave reached, damage share by tower family, and gold curves. It runs in CI nightly and the guardrails in Mechanics §7 fail the job |
| Load | A headless client swarm: 200 rooms × 6 bots on one box, with p99 tick time under 5 ms |

## 9. Client rendering notes
- Layers: felt/map, then path decals, then towers, creeps, projectiles/VFX,
  health bars, floating text, and the DOM UI on top.
- Sprite batching and object pools for creeps, projectiles and float text.
  Float text is throttled (a lesson from the prototype).
- Programmer art until M6: vector shapes via Pixi Graphics cached to
  textures. The asset pipeline (spritesheets via TexturePacker or free-tex-packer) comes in M6.
- Audio via Howler.js, with per-category volume and throttling of repeated SFX.

## 10. Security and fair play
- The server owns all state. Clients can't send positions, damage or gold.
- Hidden info (deck order, raises) is never serialized to non-owners.
- Chat has a profanity filter toggle, mute, and report (M5).
- Before M5 accounts, there is simple anti-abuse: per-IP room creation limits and max 2 rooms per IP.

## 11. Observability
- Structured logs (pino) with match id and player id.
- Metrics (M5): rooms active, tick p50/p99, bytes per client, disconnect rate, match completion rate.
- Client errors are sent to a lightweight endpoint (or Sentry).
