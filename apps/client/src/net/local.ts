import type { C2S, S2C } from '@pokertd/protocol';
import { type Bot, type BotStyle, createBot } from '@pokertd/bots';
import {
  type GameEvent,
  type Intent,
  type MatchSettings,
  type MatchState,
  type Replay,
  FixedStepper,
  ReplayPlayer,
  ReplayRecorder,
  SIM_VERSION,
  applyIntent,
  buildSnapshot,
  createMatch,
  deltaTowers,
  eventsFor,
  stepMatch,
} from '@pokertd/sim';
import { Emitter, type Link } from './link';

/**
 * Offline host: runs the match in the browser and speaks the same messages
 * as the server. Used for solo play, bot practice and the tutorial.
 */
export class LocalLink implements Link {
  readonly kind = 'local' as const;
  protected readonly messages = new Emitter<S2C>();
  protected state!: MatchState;
  private bots = new Map<string, Bot>();
  private queue: { intent: Intent; ref: number | undefined }[] = [];
  private events: GameEvent[] = [];
  private stepper: FixedStepper | null = null;
  private raf = 0;
  private last = 0;
  private towerCache = new Map<number, string>();
  private towersVersion = -1;
  private recorder!: ReplayRecorder;
  /** Game speed multiplier (solo only). */
  speed = 1;
  /** Solo pauses freely (e.g. when the tab is hidden or a menu is open). */
  paused = false;
  /** Tutorial: hold the first wave until the player is ready. */
  holdWaves = false;
  onReplay: ((r: Replay) => void) | null = null;

  constructor(
    private readonly settings: MatchSettings,
    readonly you: string,
    private readonly botStyles: Record<string, BotStyle>,
  ) {
    queueMicrotask(() => this.start());
  }

  private start(): void {
    this.state = createMatch(this.settings);
    this.recorder = new ReplayRecorder(this.state.settings, SIM_VERSION);
    this.bots = new Map(
      Object.entries(this.botStyles).map(([id, style], i) => [
        id,
        createBot(style, this.settings.seed + i),
      ]),
    );
    this.towersVersion = -1;
    this.messages.emit({ t: 'start', settings: this.state.settings, you: this.you });
    this.stepper = new FixedStepper(() => this.tick());
    this.last = performance.now();
    this.emitSnapshot();
    const loop = (now: number): void => {
      const dt = Math.min(250, now - this.last);
      this.last = now;
      if (!this.paused && this.stepper) this.stepper.advance(dt * this.speed);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tick(): void {
    const state = this.state;
    if (state.phase === 'won' || state.phase === 'lost') return;
    for (const q of this.queue.splice(0)) {
      const result = applyIntent(state, this.you, q.intent);
      if (result.ok) this.recorder.record(state.tick, this.you, q.intent);
      this.messages.emit({ t: 'result', ...(q.ref !== undefined ? { ref: q.ref } : {}), result });
    }
    for (const [id, bot] of this.bots) {
      for (const intent of bot.think(state, id)) {
        if (applyIntent(state, id, intent).ok) this.recorder.record(state.tick, id, intent);
      }
    }
    if (this.holdWaves && state.wave.nextAt <= state.tick + 1) state.wave.nextAt = state.tick + 2;
    stepMatch(state);
    this.events.push(...state.events.splice(0));
    const phase: string = state.phase;
    const over = phase === 'won' || phase === 'lost';
    if (state.tick % 2 === 0 || over) this.emitSnapshot();
    if (over) this.finish();
  }

  private emitSnapshot(): void {
    const state = this.state;
    const full = this.towersVersion === -1;
    const snap = buildSnapshot(
      state,
      this.you,
      this.towersVersion,
      full || state.tick % 40 === 0,
      true,
    );
    this.towersVersion = state.towersVersion;
    deltaTowers(snap, this.towerCache, full);
    const events = eventsFor(this.events.splice(0), this.you);
    this.messages.emit({ t: 'snap', snap, events });
  }

  private finish(): void {
    const state = this.state;
    const replay = this.recorder.finish(state);
    this.onReplay?.(replay);
    const won =
      state.settings.mode === 'coop'
        ? state.phase === 'won'
        : state.winner === state.players[this.you]?.team;
    this.messages.emit({
      t: 'end',
      result: {
        result: won ? 'won' : 'lost',
        winner: state.winner,
        wave: state.wave.n,
        replayId: null,
        xpGained: 0,
        profile: null,
      },
    });
  }

  send(msg: C2S): void {
    if (msg.t === 'act') this.queue.push({ intent: msg.intent, ref: msg.ref });
    else if (msg.t === 'rematch') {
      cancelAnimationFrame(this.raf);
      this.settings.seed = (this.settings.seed * 1103515245 + 12345) >>> 1;
      this.queue = [];
      this.events = [];
      this.start();
    } else if (msg.t === 'ping') {
      this.messages.emit({ t: 'ping', from: this.you, kind: msg.kind, x: msg.x, y: msg.y });
    }
  }

  onMessage(cb: (msg: S2C) => void): () => void {
    return this.messages.on(cb);
  }

  /** Read-only access for the tutorial's step checks. */
  get match(): MatchState {
    return this.state;
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    this.stepper = null;
  }
}

/**
 * Replay viewer: plays a recorded match with speed control and lets the
 * viewer look through any seat's eyes.
 */
export class ReplayLink implements Link {
  readonly kind = 'replay' as const;
  private readonly messages = new Emitter<S2C>();
  private player!: ReplayPlayer;
  private stepper: FixedStepper | null = null;
  private raf = 0;
  private last = 0;
  private towerCache = new Map<number, string>();
  private towersVersion = -1;
  private events: GameEvent[] = [];
  speed = 1;
  paused = false;
  seat: string;

  constructor(readonly replay: Replay) {
    this.seat = replay.settings.players[0]!.id;
    queueMicrotask(() => this.restart());
  }

  get tick(): number {
    return this.player.state.tick;
  }

  get totalTicks(): number {
    return this.replay.result?.ticks ?? 0;
  }

  restart(): void {
    cancelAnimationFrame(this.raf);
    this.player = new ReplayPlayer(this.replay);
    this.towersVersion = -1;
    this.messages.emit({ t: 'start', settings: this.player.state.settings, you: this.seat });
    this.stepper = new FixedStepper(() => this.step(), 400);
    this.last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(250, now - this.last);
      this.last = now;
      if (!this.paused && this.stepper) this.stepper.advance(dt * this.speed);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Jumps forward to a tick (replays can only run forward, so earlier ticks restart). */
  seek(tick: number): void {
    if (tick < this.player.state.tick) this.restart();
    while (this.player.state.tick < tick && !this.player.done) {
      this.player.step();
      this.player.state.events.length = 0;
    }
    this.towersVersion = -1;
    this.emitSnapshot();
  }

  watch(seat: string): void {
    this.seat = seat;
    this.towersVersion = -1;
    this.messages.emit({ t: 'start', settings: this.player.state.settings, you: seat });
    this.emitSnapshot();
  }

  private step(): void {
    if (this.player.done) {
      this.paused = true;
      return;
    }
    this.player.step();
    this.events.push(...this.player.state.events.splice(0));
    if (this.player.state.tick % 2 === 0) this.emitSnapshot();
  }

  private emitSnapshot(): void {
    const state = this.player.state;
    const full = this.towersVersion === -1;
    const snap = buildSnapshot(state, this.seat, this.towersVersion, true, true);
    this.towersVersion = state.towersVersion;
    deltaTowers(snap, this.towerCache, full);
    this.messages.emit({ t: 'snap', snap, events: eventsFor(this.events.splice(0), this.seat) });
  }

  send(_msg: C2S): void {}

  onMessage(cb: (msg: S2C) => void): () => void {
    return this.messages.on(cb);
  }

  close(): void {
    cancelAnimationFrame(this.raf);
  }
}
