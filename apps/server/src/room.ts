import { randomBytes, randomInt } from 'node:crypto';
import { type Bot, type BotStyle, createBot } from '@pokertd/bots';
import type { LobbyState, RoomOptions, S2C } from '@pokertd/protocol';
import {
  type GameEvent,
  type Intent,
  type MatchSettings,
  type MatchState,
  FixedStepper,
  GAME_DATA,
  ReplayRecorder,
  SIM_VERSION,
  applyIntent,
  buildSnapshot,
  createMatch,
  deltaTowers,
  eventsFor,
  mapDef,
  stepMatch,
} from '@pokertd/sim';

/** A connected client, as the room sees it. */
export interface Client {
  id: string;
  profileId: string;
  name: string;
  level: number;
  send(msg: S2C): void;
  room: Room | null;
  seat: string | null;
  /** Last towersVersion sent to this client (snapshots skip unchanged towers). */
  towersVersion: number;
  /** Towers this client has, for deltas. */
  towerCache?: Map<number, string>;
}

export interface Seat {
  id: string;
  name: string;
  profileId: string | null;
  level: number;
  /** Secret that lets a client reclaim this seat after a disconnect. */
  token: string;
  ready: boolean;
  team: number;
  bot: BotStyle | null;
  client: Client | null;
  disconnectedAt: number | null;
  /** Bot playing for a disconnected human. */
  takeover: Bot | null;
  botImpl: Bot | null;
}

export interface MatchRecord {
  room: Room;
  state: MatchState;
  replay: ReturnType<ReplayRecorder['finish']>;
  startedAt: number;
}

export interface RoomHooks {
  onEnd(record: MatchRecord): void;
  onEmpty(room: Room): void;
  onMatchStart(): void;
}

// No 0/O/1/I so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = (): string =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const SNAPSHOT_EVERY = 2; // ticks: 10 Hz snapshots
const LOBBY_SEAT_GRACE_MS = 30_000;

export class Room {
  readonly seats: Seat[] = [];
  readonly spectators = new Set<Client>();
  status: 'lobby' | 'playing' | 'ended' = 'lobby';
  state: MatchState | null = null;
  label: string | undefined;
  /** Fixed seed (Daily Deal); otherwise random per match. */
  fixedSeed: number | null = null;
  private recorder: ReplayRecorder | null = null;
  private queue: { seat: string; intent: Intent; client: Client; ref: number | undefined }[] = [];
  private events: GameEvent[] = [];
  private stepper: FixedStepper | null = null;
  private lastAdvance = 0;
  private startedAt = 0;
  private nextSeat = 1;
  lastActivity = Date.now();

  constructor(
    readonly code: string,
    public options: RoomOptions,
    private readonly hooks: RoomHooks,
    readonly now: () => number = Date.now,
  ) {}

  get limits(): { min: number; max: number } {
    const [min, max] = mapDef(this.options.map).players;
    return { min: Math.max(min, this.options.mode === 'showdown' ? 2 : 1), max };
  }

  get humans(): Seat[] {
    return this.seats.filter((s) => !s.bot);
  }

  get host(): Seat | undefined {
    return this.humans.find((s) => s.client) ?? this.humans[0];
  }

  get connectedClients(): Client[] {
    return [...this.seats.flatMap((s) => (s.client ? [s.client] : [])), ...this.spectators];
  }

  lobbyState(): LobbyState {
    const host = this.host;
    return {
      code: this.code,
      status: this.status,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        ready: s.ready || !!s.bot,
        host: s === host,
        connected: !!s.client || !!s.bot,
        bot: s.bot ?? (s.takeover ? 'takeover' : null),
        team: s.team,
        level: s.level,
      })),
      spectators: this.spectators.size,
      options: this.options,
      maxPlayers: this.limits.max,
      minPlayers: this.limits.min,
      ...(this.label ? { label: this.label } : {}),
    };
  }

  broadcast(msg: S2C): void {
    for (const c of this.connectedClients) c.send(msg);
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', state: this.lobbyState() });
  }

  system(text: string): void {
    this.broadcast({ t: 'chat', from: '', name: '', text, system: true });
  }

  /**
   * Seats a client: reclaims a seat by token, takes a free seat in the lobby,
   * or watches as a spectator.
   */
  join(client: Client, seatToken?: string, spectate = false): 'full' | 'ok' {
    this.lastActivity = this.now();
    const reclaim = seatToken ? this.seats.find((s) => s.token === seatToken && !s.bot) : undefined;
    let seat: Seat | null = null;

    if (reclaim) {
      if (reclaim.client && reclaim.client !== client) reclaim.client.room = null;
      reclaim.client = client;
      reclaim.disconnectedAt = null;
      if (reclaim.takeover) this.system(`${reclaim.name} is back.`);
      reclaim.takeover = null;
      seat = reclaim;
    } else if (!spectate && this.status === 'lobby') {
      if (this.seats.length >= this.limits.max) return 'full';
      seat = {
        id: `p${this.nextSeat++}`,
        name: client.name,
        profileId: client.profileId,
        level: client.level,
        token: randomBytes(16).toString('hex'),
        ready: false,
        team: this.options.mode === 'showdown' ? this.seats.length : 0,
        bot: null,
        client,
        disconnectedAt: null,
        takeover: null,
        botImpl: null,
      };
      this.seats.push(seat);
      this.system(`${client.name} joined.`);
    } else {
      this.spectators.add(client);
    }

    client.room = this;
    client.seat = seat?.id ?? null;
    client.towersVersion = -1;
    client.send({
      t: 'welcome',
      room: this.code,
      you: seat?.id ?? null,
      seat: seat?.token ?? null,
      protocol: 2,
    });
    this.broadcastLobby();
    if (this.state) {
      client.send({ t: 'start', settings: this.state.settings, you: seat?.id ?? null });
      this.sendSnapshot(client, []);
    }
    return 'ok';
  }

  /** A client left on purpose (or was kicked). */
  leave(client: Client): void {
    this.spectators.delete(client);
    const seat = this.seats.find((s) => s.client === client);
    client.room = null;
    client.seat = null;
    if (seat) {
      seat.client = null;
      if (this.status === 'lobby') {
        this.seats.splice(this.seats.indexOf(seat), 1);
      } else {
        seat.disconnectedAt = this.now();
        if (this.options.botTakeover !== false)
          seat.takeover = createBot('smart', randomInt(1 << 30));
      }
      this.system(
        seat.takeover ? `${seat.name} left; a bot takes over their lane.` : `${seat.name} left.`,
      );
    }
    this.afterDeparture();
  }

  /** The connection dropped; keep the seat for a reconnect. */
  disconnect(client: Client): void {
    this.spectators.delete(client);
    const seat = this.seats.find((s) => s.client === client);
    if (seat) {
      seat.client = null;
      seat.disconnectedAt = this.now();
      this.system(`${seat.name} disconnected.`);
    }
    this.afterDeparture();
  }

  private afterDeparture(): void {
    this.lastActivity = this.now();
    if (this.connectedClients.length === 0 && this.status !== 'playing') {
      this.hooks.onEmpty(this);
      return;
    }
    this.broadcastLobby();
  }

  /** Housekeeping, called about once a second. */
  maintain(): void {
    const now = this.now();
    const grace = GAME_DATA.rules.coop.disconnectGraceSeconds * 1000;
    for (const seat of [...this.seats]) {
      if (seat.client || seat.bot || seat.disconnectedAt === null) continue;
      const away = now - seat.disconnectedAt;
      if (this.status === 'lobby' && away > LOBBY_SEAT_GRACE_MS) {
        this.seats.splice(this.seats.indexOf(seat), 1);
        this.broadcastLobby();
      } else if (
        this.status === 'playing' &&
        !seat.takeover &&
        away > grace &&
        this.options.botTakeover !== false
      ) {
        seat.takeover = createBot('smart', randomInt(1 << 30));
        this.system(`A bot is covering for ${seat.name}.`);
        this.broadcastLobby();
      }
    }
    // Rooms with nobody connected for 5 minutes are closed, even mid-match.
    if (this.connectedClients.length === 0 && now - this.lastActivity > 5 * 60_000) {
      this.hooks.onEmpty(this);
    }
  }

  isHost(client: Client): boolean {
    return this.host?.client === client;
  }

  setReady(client: Client, ready: boolean): void {
    const seat = this.seats.find((s) => s.client === client);
    if (!seat || this.status !== 'lobby') return;
    seat.ready = ready;
    this.broadcastLobby();
  }

  /** Host changes mode, map, difficulty or flags. Returns false if invalid. */
  setOptions(patch: Partial<RoomOptions>): boolean {
    const next = { ...this.options, ...patch };
    let map;
    try {
      map = mapDef(next.map);
    } catch {
      return false;
    }
    if (map.mode !== next.mode) return false;
    if (!GAME_DATA.rules.difficulties.some((d) => d.id === next.difficulty)) return false;
    if (this.seats.length > map.players[1]) return false;
    this.options = next;
    this.seats.forEach((s, i) => (s.team = next.mode === 'showdown' ? i : 0));
    for (const s of this.humans) s.ready = false;
    this.broadcastLobby();
    return true;
  }

  setTeam(seatId: string, team: number): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat || this.options.mode !== 'showdown') return;
    seat.team = team;
    this.broadcastLobby();
  }

  addBot(style: BotStyle): boolean {
    if (this.status !== 'lobby' || this.seats.length >= this.limits.max) return false;
    const n = this.seats.filter((s) => s.bot).length + 1;
    this.seats.push({
      id: `p${this.nextSeat++}`,
      name: `${style === 'greedy' ? 'Rookie' : style === 'raiser' ? 'Shark' : 'Dealer'} Bot ${n}`,
      profileId: null,
      level: 0,
      token: randomBytes(16).toString('hex'),
      ready: true,
      team: this.options.mode === 'showdown' ? this.seats.length : 0,
      bot: style,
      client: null,
      disconnectedAt: null,
      takeover: null,
      botImpl: null,
    });
    this.broadcastLobby();
    return true;
  }

  kick(seatId: string): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat || this.status !== 'lobby') return;
    if (seat.client) {
      seat.client.send({ t: 'left' });
      seat.client.room = null;
      seat.client.seat = null;
    }
    this.seats.splice(this.seats.indexOf(seat), 1);
    this.broadcastLobby();
  }

  canStart(): 'ok' | 'not_ready' | 'room_full' {
    const { min, max } = this.limits;
    if (this.seats.length < min || this.seats.length > max) return 'room_full';
    const host = this.host;
    if (this.humans.some((s) => s !== host && !s.ready)) return 'not_ready';
    if (this.options.mode === 'showdown' && new Set(this.seats.map((s) => s.team)).size < 2)
      return 'not_ready';
    return 'ok';
  }

  /** Starts the match. */
  start(): void {
    const settings: MatchSettings = {
      seed: this.fixedSeed ?? randomInt(2 ** 31),
      mode: this.options.mode,
      map: this.options.map,
      difficulty: this.options.difficulty,
      players: this.seats.map((s) => ({ id: s.id, name: s.name, team: s.team })),
      ...(this.options.endless ? { endless: true } : {}),
      ...(this.label ? { label: this.label } : {}),
    };
    this.state = createMatch(settings);
    this.recorder = new ReplayRecorder(this.state.settings, SIM_VERSION);
    for (const s of this.seats)
      s.botImpl = s.bot ? createBot(s.bot, settings.seed + s.id.length) : null;
    this.status = 'playing';
    this.startedAt = this.now();
    this.lastAdvance = this.now();
    this.events = [];
    this.stepper = new FixedStepper(() => this.tick());
    for (const c of this.connectedClients) {
      c.towersVersion = -1;
      c.send({ t: 'start', settings: this.state.settings, you: c.seat });
    }
    this.broadcastLobby();
    this.hooks.onMatchStart();
  }

  /** Back to the lobby with the same seats after a match. */
  rematch(): void {
    if (this.status !== 'ended') return;
    this.status = 'lobby';
    this.state = null;
    for (const s of this.humans) s.ready = false;
    // Drop seats of humans who never came back.
    for (const s of [...this.seats])
      if (!s.bot && !s.client) this.seats.splice(this.seats.indexOf(s), 1);
    this.broadcastLobby();
  }

  /** Queues a player intent for the next tick. */
  act(client: Client, intent: Intent, ref: number | undefined): void {
    if (this.status !== 'playing' || !client.seat) return;
    this.lastActivity = this.now();
    this.queue.push({ seat: client.seat, intent, client, ref });
  }

  /** Advances the match by real time elapsed (called by the server loop). */
  advance(): number {
    if (this.status !== 'playing' || !this.stepper) return 0;
    const now = this.now();
    const ran = this.stepper.advance(now - this.lastAdvance);
    this.lastAdvance = now;
    return ran;
  }

  /** One authoritative tick: intents, bots, sim step, snapshots. */
  tick(): void {
    const state = this.state;
    if (!state || this.status !== 'playing') return;

    for (const q of this.queue.splice(0)) {
      const result = applyIntent(state, q.seat, q.intent);
      if (result.ok) this.recorder!.record(state.tick, q.seat, q.intent);
      q.client.send({ t: 'result', ...(q.ref !== undefined ? { ref: q.ref } : {}), result });
    }
    for (const seat of this.seats) {
      const bot = seat.botImpl ?? seat.takeover;
      if (!bot) continue;
      for (const intent of bot.think(state, seat.id)) {
        if (applyIntent(state, seat.id, intent).ok)
          this.recorder!.record(state.tick, seat.id, intent);
      }
    }

    stepMatch(state);
    this.events.push(...state.events.splice(0));

    const over = state.phase === 'won' || state.phase === 'lost';
    if (state.tick % SNAPSHOT_EVERY === 0 || over) {
      const events = this.events;
      this.events = [];
      for (const c of this.connectedClients) this.sendSnapshot(c, events);
    }
    if (over) this.finish();
  }

  private sendSnapshot(client: Client, events: GameEvent[]): void {
    const state = this.state!;
    const seat = client.seat && state.players[client.seat] ? client.seat : null;
    const full = client.towersVersion === -1;
    // Stats, wave preview and deck list every 2 s (and on the first snapshot).
    const detail = full || state.tick % 40 === 0 || state.phase === 'won' || state.phase === 'lost';
    const snap = buildSnapshot(state, seat, client.towersVersion, detail, state.tick % 8 === 0);
    client.towersVersion = state.towersVersion;
    deltaTowers(snap, (client.towerCache ??= new Map()), full);
    client.send({ t: 'snap', snap, events: eventsFor(events, seat) });
  }

  private finish(): void {
    this.status = 'ended';
    const state = this.state!;
    const replay = this.recorder!.finish(state);
    this.stepper = null;
    this.hooks.onEnd({ room: this, state, replay, startedAt: this.startedAt });
    this.broadcastLobby();
  }

  /** Test hook: run ticks without waiting for real time. */
  runTicks(n: number): void {
    for (let i = 0; i < n && this.status === 'playing'; i++) this.tick();
  }
}
