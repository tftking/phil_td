import { standardDeck } from '../cards/card';
import { createDeck } from '../cards/deck';
import { Rng } from '../core/rng';
import { secondsToTicks } from '../core/time';
import { startingLives } from '../rules/formulas';
import { contextOf, data } from './context';
import type { MatchSettings, MatchState, PlayerState, PlayerStats } from './types';

export function emptyStats(): PlayerStats {
  return {
    handsPlayed: 0,
    handCounts: new Array<number>(11).fill(0),
    bestHand: -1,
    goldEarned: 0,
    damage: 0,
    kills: 0,
    leaks: 0,
    towersPlaced: 0,
    raiseGold: 0,
    leaksCaused: 0,
  };
}

/** Creates a new match. Throws on invalid settings (unknown map, bad player count). */
export function createMatch(settings: MatchSettings): MatchState {
  const shell = { settings: JSON.parse(JSON.stringify(settings)) as MatchSettings };
  const ctx = contextOf(shell);
  if (ctx.map.mode !== settings.mode) {
    throw new Error(`Map ${ctx.map.name} is a ${ctx.map.mode} map, not ${settings.mode}`);
  }
  const ids = new Set(settings.players.map((p) => p.id));
  if (ids.size !== settings.players.length) throw new Error('Duplicate player ids');

  const { rules } = data;
  const n = settings.players.length;
  const players: Record<string, PlayerState> = {};
  settings.players.forEach((setup, lane) => {
    const rngState = Rng.streamState(settings.seed, 'deck', setup.id);
    const deck = createDeck(standardDeck(), Rng.bound(rngState));
    players[setup.id] = {
      id: setup.id,
      name: setup.name,
      team: settings.mode === 'coop' ? 0 : (setup.team ?? lane),
      lane,
      gold: rules.economy.startingGold,
      lives: settings.mode === 'showdown' ? rules.showdown.lives : 0,
      busted: false,
      bustedWave: 0,
      deck,
      rng: rngState,
      hand: null,
      blueprints: [],
      benchSlots: rules.cards.benchSlots,
      freeRedraws: 1,
      research: [0, 0, 0, 0],
      researching: null,
      income: rules.showdown.startingIncome,
      raises: [],
      lastAllInWave: -99,
      riverCards: 0,
      slipWave: -1,
      slipIncoming: null,
      shopOffers: null,
      shopBought: [],
      stats: emptyStats(),
    };
  });

  return {
    version: 1,
    settings: shell.settings,
    tick: 0,
    phase: 'countdown',
    wave: {
      n: 0,
      nextAt: secondsToTicks(data.waves.timing.firstWaveDelaySeconds),
      modifiers: [],
      spawns: [],
      final: false,
    },
    lives: settings.mode === 'coop' ? startingLives(ctx.diff, n) : 0,
    players,
    order: settings.players.map((p) => p.id),
    towers: [],
    creeps: [],
    nextId: 1,
    towersVersion: 0,
    rng: {
      waves: Rng.streamState(settings.seed, 'waves'),
      combat: Rng.streamState(settings.seed, 'combat'),
      shop: Rng.streamState(settings.seed, 'shop'),
    },
    pot: { gold: 0, target: rules.coop.potPerPlayer * n },
    shop: { openUntil: 0 },
    pause: { votes: [], paused: false, budget: secondsToTicks(rules.coop.pauseSecondsPerMatch) },
    winner: null,
    events: [],
  };
}
