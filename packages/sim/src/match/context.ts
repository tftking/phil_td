import { GAME_DATA, difficultyDef, mapDef } from '../data/index';
import type { DifficultyDef, MapDef } from '../data/types';
import { type MapLayout, buildLayout } from '../map/geometry';
import { Rng } from '../core/rng';
import type { MatchState, PlayerState, PlayerId } from './types';

/** Data derived from settings. Cached, never stored in state. */
export interface MatchContext {
  map: MapDef;
  layout: MapLayout;
  diff: DifficultyDef;
  /** Path keys in a fixed order, for compact creep encoding. */
  pathKeys: string[];
}

const contexts = new WeakMap<MatchState['settings'], MatchContext>();

export function contextOf(state: Pick<MatchState, 'settings'>): MatchContext {
  const hit = contexts.get(state.settings);
  if (hit) return hit;
  const map = mapDef(state.settings.map);
  const layout = buildLayout(map, state.settings.players.length);
  const ctx: MatchContext = {
    map,
    layout,
    diff: difficultyDef(state.settings.difficulty),
    pathKeys: [...layout.paths.keys()],
  };
  contexts.set(state.settings, ctx);
  return ctx;
}

export const data = GAME_DATA;

export const rngOf = (state: MatchState, stream: keyof MatchState['rng']): Rng =>
  Rng.bound(state.rng[stream]);

export const playerRng = (p: PlayerState): Rng => Rng.bound(p.rng);

export function nextId(state: MatchState): number {
  return state.nextId++;
}

export function isOver(state: MatchState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

/** Players in seat order. */
export function playersInOrder(state: MatchState): PlayerState[] {
  return state.order.map((id) => state.players[id]!);
}

export function laneOwner(state: MatchState, lane: number): PlayerState {
  return state.players[state.order[lane]!]!;
}

/** Showdown: next living opponent clockwise (another team) from a player. */
export function nextOpponent(state: MatchState, from: PlayerId): PlayerState | null {
  const me = state.players[from]!;
  const n = state.order.length;
  const start = state.order.indexOf(from);
  for (let k = 1; k < n; k++) {
    const p = state.players[state.order[(start + k) % n]!]!;
    if (!p.busted && p.team !== me.team) return p;
  }
  return null;
}
