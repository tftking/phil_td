import {
  type MatchSettings,
  type MatchState,
  type PlayerId,
  GAME_DATA,
  applyIntent,
  createMatch,
  effectiveDef,
  stepMatch,
} from '@pokertd/sim';
import { type Bot, type BotStyle, createBot } from './bot';

export interface SimResult {
  seed: number;
  styles: Record<PlayerId, BotStyle>;
  phase: MatchState['phase'];
  /** Last wave reached. */
  wave: number;
  ticks: number;
  lives: number;
  winner: number | null;
  /** Damage dealt per tower family (effective def id). */
  damageByTower: Record<string, number>;
  handCounts: number[];
  goldEarned: number;
  towers: number;
  rejects: number;
}

/** Lets bots play their seats: applies their intents, ignoring rejections. */
export function driveBots(state: MatchState, bots: Map<PlayerId, Bot>): number {
  let rejects = 0;
  for (const [id, bot] of bots) {
    for (const intent of bot.think(state, id)) {
      if (!applyIntent(state, id, intent).ok) rejects++;
    }
  }
  return rejects;
}

/**
 * Plays a whole match with bots in every seat, headless. Used by the
 * balance tool and tests. Stops at game over or after `maxWaves`.
 */
export function simulate(
  settings: MatchSettings,
  styles: Record<PlayerId, BotStyle>,
  maxWaves = 60,
): SimResult {
  const state = createMatch(settings);
  const bots = new Map<PlayerId, Bot>(
    Object.entries(styles).map(([id, style], i) => [id, createBot(style, settings.seed * 31 + i)]),
  );
  let rejects = 0;
  const damageByTower: Record<string, number> = {};
  const counted = new Map<number, number>();
  const over = (): boolean => state.phase === 'won' || state.phase === 'lost';
  while (!over() && state.wave.n <= maxWaves) {
    rejects += driveBots(state, bots);
    stepMatch(state);
    state.events.length = 0;
    // Track damage per family, including towers sold later.
    if (state.tick % 20 === 0 || over()) {
      for (const t of state.towers) {
        const fam = effectiveDef(t)?.id ?? t.def;
        const prev = counted.get(t.id) ?? 0;
        damageByTower[fam] = (damageByTower[fam] ?? 0) + (t.damageDealt - prev);
        counted.set(t.id, t.damageDealt);
      }
    }
  }
  const players = Object.values(state.players);
  const handCounts = new Array<number>(11).fill(0);
  for (const p of players) p.stats.handCounts.forEach((n, i) => (handCounts[i]! += n));
  return {
    seed: settings.seed,
    styles,
    phase: state.phase,
    wave: state.wave.n,
    ticks: state.tick,
    lives: state.settings.mode === 'coop' ? state.lives : Math.max(...players.map((p) => p.lives)),
    winner: state.winner,
    damageByTower,
    handCounts,
    goldEarned: players.reduce((s, p) => s + p.stats.goldEarned, 0),
    towers: state.towers.length,
    rejects,
  };
}

export const HAND_TOWERS = GAME_DATA.towers.map((t) => t.id);
