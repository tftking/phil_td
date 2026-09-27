import { createMatch } from './create';
import { type Intent, applyIntent } from './intents';
import { stepMatch } from './step';
import type { MatchSettings, MatchState, PlayerId } from './types';

/**
 * A replay is the match settings (including the seed) plus every accepted
 * intent with the tick it was applied on. The sim is deterministic, so this
 * reproduces the whole match exactly.
 */
export interface Replay {
  version: 1;
  sim: string;
  settings: MatchSettings;
  /** [tick, player, intent], in application order. */
  inputs: [number, PlayerId, Intent][];
  result?: { phase: MatchState['phase']; wave: number; winner: number | null; ticks: number };
}

export class ReplayRecorder {
  readonly replay: Replay;

  constructor(settings: MatchSettings, simVersion: string) {
    this.replay = { version: 1, sim: simVersion, settings, inputs: [] };
  }

  /** Call for each intent the sim accepted, before stepping that tick. */
  record(tick: number, player: PlayerId, intent: Intent): void {
    this.replay.inputs.push([tick, player, intent]);
  }

  finish(state: MatchState): Replay {
    this.replay.result = {
      phase: state.phase,
      wave: state.wave.n,
      winner: state.winner,
      ticks: state.tick,
    };
    return this.replay;
  }
}

/** Steps through a replay one tick at a time (for the replay viewer). */
export class ReplayPlayer {
  readonly state: MatchState;
  private cursor = 0;

  constructor(readonly replay: Replay) {
    this.state = createMatch(replay.settings);
  }

  get done(): boolean {
    const s = this.state;
    return (
      s.phase === 'won' ||
      s.phase === 'lost' ||
      (this.replay.result !== undefined && s.tick >= this.replay.result.ticks)
    );
  }

  /** Applies this tick's inputs, then advances one tick. */
  step(): void {
    const inputs = this.replay.inputs;
    while (this.cursor < inputs.length && inputs[this.cursor]![0] <= this.state.tick) {
      const [, player, intent] = inputs[this.cursor++]!;
      applyIntent(this.state, player, intent);
    }
    stepMatch(this.state);
  }

  /** Plays to the end (or `maxTicks`) and returns the final state. */
  run(maxTicks = Number.MAX_SAFE_INTEGER): MatchState {
    for (let i = 0; i < maxTicks && !this.done; i++) {
      this.step();
      this.state.events.length = 0;
    }
    return this.state;
  }
}
