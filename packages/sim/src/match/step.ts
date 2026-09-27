import { moveCreeps, processDeaths, runTowers } from './combat';
import { isOver, playersInOrder } from './context';
import { recomputeTowers } from './towers';
import { processSpawns, startWave } from './waves';
import type { MatchState } from './types';

/**
 * Advances the match by one tick (50 ms). Deterministic: the same state and
 * the same intents always produce the same result. Events are appended to
 * `state.events`; the host drains them after each step.
 */
export function stepMatch(state: MatchState): void {
  if (isOver(state)) return;

  if (state.pause.paused) {
    state.pause.budget--;
    if (state.pause.budget <= 0) {
      state.pause.paused = false;
      state.pause.votes = [];
      state.events.push({ kind: 'paused', paused: false });
    }
    return;
  }

  if (state.tick >= state.wave.nextAt) startWave(state);
  processSpawns(state);
  finishResearch(state);
  if (state.shop.openUntil && state.tick === state.shop.openUntil) {
    for (const p of playersInOrder(state)) p.shopOffers = null;
    state.events.push({ kind: 'shopClose' });
  }

  moveCreeps(state);
  runTowers(state);
  processDeaths(state);
  checkBusts(state);
  checkEnd(state);
  state.tick++;
}

function finishResearch(state: MatchState): void {
  let changed = false;
  for (const p of playersInOrder(state)) {
    const r = p.researching;
    if (!r || state.tick < r.doneAt) continue;
    p.research[r.suit]++;
    p.researching = null;
    changed = true;
    state.events.push({ kind: 'research', player: p.id, suit: r.suit, level: p.research[r.suit] });
  }
  if (changed) recomputeTowers(state);
}

function checkBusts(state: MatchState): void {
  if (state.settings.mode !== 'showdown') return;
  for (const p of playersInOrder(state)) {
    if (p.busted || p.lives > 0) continue;
    p.busted = true;
    p.bustedWave = state.wave.n;
    p.hand = null;
    p.raises = [];
    state.creeps = state.creeps.filter((c) => c.lane !== p.lane);
    state.wave.spawns = state.wave.spawns.filter((s) => s.lane !== p.lane);
    state.events.push({ kind: 'bust', player: p.id });
  }
}

function checkEnd(state: MatchState): void {
  if (state.settings.mode === 'coop') {
    if (state.lives <= 0) return end(state, 'lost', null);
    if (state.wave.final && state.wave.spawns.length === 0 && state.creeps.length === 0) {
      end(state, 'won', 0);
    }
    return;
  }
  const alive = new Set(
    playersInOrder(state)
      .filter((p) => !p.busted)
      .map((p) => p.team),
  );
  const teams = new Set(playersInOrder(state).map((p) => p.team));
  if (teams.size > 1 && alive.size <= 1) {
    end(state, 'won', alive.size === 1 ? [...alive][0]! : null);
  } else if (teams.size === 1 && alive.size === 0) {
    // A one-team showdown (practice) ends when everyone busts.
    end(state, 'lost', null);
  }
}

function end(state: MatchState, result: 'won' | 'lost', winner: number | null): void {
  state.phase = result;
  state.winner = winner;
  state.events.push({ kind: 'gameOver', result, winner });
}

/** Runs `ticks` steps (tests and tools). */
export function runTicks(state: MatchState, ticks: number): void {
  for (let i = 0; i < ticks && !isOver(state); i++) stepMatch(state);
}
