import type { Card, Suit } from '../cards/card';
import type { Deck } from '../cards/deck';
import type { HandCategory } from '../cards/evaluate';
import type { RngState } from '../core/rng';
import type { TargetingMode } from '../data/types';

export type PlayerId = string;
export type EntityId = number;
export type Mode = 'coop' | 'showdown';

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  /** Showdown team. Omit for free-for-all (every player is their own team). */
  team?: number;
}

export interface MatchSettings {
  seed: number;
  mode: Mode;
  map: string;
  difficulty: string;
  players: PlayerSetup[];
  /** Co-op: keep going after wave 40. */
  endless?: boolean;
  /** Daily Deal and other fixed-seed runs. Purely informational. */
  label?: string;
}

/** A tower that has been won from a hand but not placed yet (the Bench). */
export interface Blueprint {
  id: EntityId;
  tower: string;
  category: HandCategory;
  power: number;
  suit: Suit;
  pure: boolean;
  /** Gold spent on the hand (deal + redraws). Sets upgrade cost and sell value. */
  value: number;
  cards: Card[];
}

export interface HandState {
  cards: Card[];
  redrawsUsed: number;
  /** Gold spent on this hand so far (deal + paid redraws). */
  spent: number;
}

export interface PlayerStats {
  handsPlayed: number;
  handCounts: number[];
  bestHand: number;
  goldEarned: number;
  damage: number;
  kills: number;
  leaks: number;
  towersPlaced: number;
  raiseGold: number;
  leaksCaused: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  team: number;
  lane: number;
  gold: number;
  /** Showdown only; co-op uses the shared team lives. */
  lives: number;
  busted: boolean;
  bustedWave: number;
  deck: Deck;
  rng: RngState;
  hand: HandState | null;
  blueprints: Blueprint[];
  benchSlots: number;
  freeRedraws: number;
  research: [number, number, number, number];
  researching: { suit: Suit; doneAt: number } | null;
  /** Showdown income paid at each wave start. */
  income: number;
  /** Showdown raises queued for the next wave. */
  raises: { send: string; count: number; target: PlayerId }[];
  lastAllInWave: number;
  /** Co-op: extra cards on the next deal (River Card from the Pot). */
  riverCards: number;
  slipWave: number;
  /** A card slipped by a teammate, used on the next redraw. */
  slipIncoming: Card | null;
  shopOffers: string[] | null;
  shopBought: string[];
  stats: PlayerStats;
}

export interface Tower {
  id: EntityId;
  owner: PlayerId;
  /** Tower def id (for a Jester: 'jester'; the copied def is in copyOf). */
  def: string;
  x: number;
  y: number;
  /** Lane index, or -1 for the Center Table. */
  zone: number;
  level: number;
  category: HandCategory;
  power: number;
  suit: Suit;
  pure: boolean;
  /** Gold spent on the hand that made it; upgrade cost is based on this. */
  value: number;
  invested: number;
  placedTick: number;
  targeting: TargetingMode;
  cooldown: number;
  beamTarget: EntityId;
  beamTicks: number;
  copyOf: string | null;
  // Derived stats, refreshed by recomputeTowers.
  dmg: number;
  range: number;
  minRange: number;
  period: number;
  hitsAir: boolean;
  pierce: number;
  crit: number;
  greed: number;
  slow: number;
  aura: number;
  damageDealt: number;
  kills: number;
}

export interface Creep {
  id: EntityId;
  type: string;
  /** Lane the creep belongs to (for spawns and leaks). */
  lane: number;
  /** Lane index while in the lane, -1 once on the Center Table. */
  zone: number;
  path: string;
  dist: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  shield: number;
  slow: number;
  slowUntil: number;
  regen: number;
  bounty: number;
  leak: number;
  flying: boolean;
  boss: boolean;
  wave: number;
  /** Showdown: who sent this creep. */
  sender: PlayerId | null;
  lastHitBy: EntityId;
}

export interface SpawnEntry {
  at: number;
  lane: number;
  type: string;
  hp: number;
  armor: number;
  speed: number;
  bounty: number;
  sender: PlayerId | null;
  boss: boolean;
}

export type GameEvent =
  | { kind: 'waveStart'; wave: number; modifiers: string[]; boss: boolean; name?: string }
  | { kind: 'attack'; tower: EntityId; targets: EntityId[]; crit: boolean }
  | { kind: 'beam'; tower: EntityId; target: EntityId; dps: number }
  | { kind: 'death'; creep: EntityId; x: number; y: number; bounty: number; to: PlayerId | null }
  | { kind: 'leak'; creep: EntityId; lives: number; lane: number }
  | { kind: 'spawn'; creep: EntityId; boss: boolean }
  | { kind: 'split'; creep: EntityId; into: EntityId[] }
  | { kind: 'bigHand'; player: PlayerId; category: HandCategory; tower: string }
  | { kind: 'placed'; tower: EntityId; player: PlayerId }
  | { kind: 'sold'; tower: EntityId; player: PlayerId; refund: number }
  | { kind: 'upgraded'; tower: EntityId; level: number }
  | { kind: 'research'; player: PlayerId; suit: Suit; level: number }
  | { kind: 'shopOpen'; until: number }
  | { kind: 'shopClose' }
  | { kind: 'reshuffle'; player: PlayerId }
  | { kind: 'potFilled'; gold: number }
  | { kind: 'slip'; from: PlayerId; to: PlayerId }
  | { kind: 'raise'; from: PlayerId; target: PlayerId; gold: number }
  | { kind: 'bust'; player: PlayerId }
  | { kind: 'paused'; paused: boolean }
  | { kind: 'gameOver'; result: 'won' | 'lost'; winner: number | null };

export type Phase = 'countdown' | 'playing' | 'won' | 'lost';

export interface MatchState {
  version: 1;
  settings: MatchSettings;
  tick: number;
  phase: Phase;
  wave: {
    n: number;
    /** Tick at which the next wave starts. */
    nextAt: number;
    modifiers: string[];
    spawns: SpawnEntry[];
    /** Final wave (non-endless co-op) has started. */
    final: boolean;
  };
  /** Co-op shared lives. */
  lives: number;
  players: Record<PlayerId, PlayerState>;
  order: PlayerId[];
  towers: Tower[];
  creeps: Creep[];
  nextId: number;
  towersVersion: number;
  rng: { waves: RngState; combat: RngState; shop: RngState };
  pot: { gold: number; target: number };
  shop: { openUntil: number };
  pause: { votes: PlayerId[]; paused: boolean; budget: number };
  /** Winning team (showdown) when phase is 'won'/'lost'. */
  winner: number | null;
  /** Events produced by the last step (and intents applied since). */
  events: GameEvent[];
}
