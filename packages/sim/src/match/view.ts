import type { Card } from '../cards/card';
import { deckCounts, type DeckCounts } from '../cards/deck';
import { GAME_DATA } from '../data/index';
import { contextOf, playersInOrder } from './context';
import { evaluatePlayerHand, redrawCost, sellValue, upgradeCost } from './intents';
import { type WavePreview, wavePreview } from './waves';
import type {
  Blueprint,
  GameEvent,
  MatchState,
  Phase,
  PlayerId,
  PlayerStats,
  Tower,
} from './types';

/**
 * What a client sees. Hidden information (deck order, other players' hands,
 * what a Showdown raise contains) never appears here.
 */
export interface PublicPlayer {
  id: PlayerId;
  name: string;
  team: number;
  lane: number;
  gold: number;
  lives: number;
  busted: boolean;
  research: number[];
  researching: { suit: number; doneAt: number } | null;
  income: number;
  /** Showdown: gold raised against this player for the next wave (Bluff: gold only). */
  incoming: number;
  holdingHand: boolean;
  bench: number;
  /** Only in detailed snapshots (every couple of seconds). */
  stats?: PlayerStats;
}

export type PublicTower = Pick<
  Tower,
  | 'id'
  | 'owner'
  | 'def'
  | 'x'
  | 'y'
  | 'zone'
  | 'level'
  | 'category'
  | 'power'
  | 'suit'
  | 'pure'
  | 'targeting'
  | 'copyOf'
  | 'dmg'
  | 'range'
  | 'minRange'
  | 'period'
  | 'hitsAir'
  | 'pierce'
  | 'crit'
  | 'greed'
  | 'slow'
  | 'aura'
  | 'damageDealt'
  | 'kills'
  | 'invested'
> & { upgradeCost: number; sellValue: number };

export interface PrivateView {
  gold: number;
  hand: {
    cards: Card[];
    redrawsUsed: number;
    category: number;
    scoring: number[];
    used: number[];
    nextRedrawCost: number;
  } | null;
  blueprints: Blueprint[];
  benchSlots: number;
  freeRedraws: number;
  deck: DeckCounts;
  /** Every card you own (sorted), for Card Shop choices. Order is not revealed.
   * Only in detailed snapshots. */
  deckCards?: Card[];
  shopOffers: string[] | null;
  shopBought: string[];
  slipIncoming: Card | null;
  riverCards: number;
  canSlip: boolean;
}

export interface Snapshot {
  tick: number;
  phase: Phase;
  wave: {
    n: number;
    nextAt: number;
    modifiers: string[];
    final: boolean;
    spawnsLeft: number;
    /** Only in detailed snapshots; undefined means "unchanged". */
    next?: WavePreview | null;
  };
  lives: number;
  pot: { gold: number; target: number };
  shopOpenUntil: number;
  pause: { paused: boolean; votes: PlayerId[]; budget: number };
  winner: number | null;
  /** Sent every few snapshots; undefined means "unchanged". */
  players?: PublicPlayer[];
  towersVersion: number;
  /** Full tower list: present when the client has none (first snapshot, resync). */
  towers?: PublicTower[];
  /** Tower changes since the client's last snapshot (the server sends this instead of `towers`). */
  towerDelta?: { changed: PublicTower[]; removed: number[] };
  /** Packed creeps, see packCreeps. */
  creeps: Uint8Array;
  you?: PrivateView;
}

export const CREEP_TYPES = GAME_DATA.enemies.map((e) => e.id);
const BYTES_PER_CREEP = 9;

/**
 * Packs creeps into 9 bytes each: id u16, type u8, path u8, dist u16 (1/64
 * tile), hp u8 (fraction of max), flags u8 (1 slowed, 2 shielded, 4 boss,
 * 8 flying). ~2.7 KB for 300 creeps.
 */
export function packCreeps(state: MatchState): Uint8Array {
  const { pathKeys } = contextOf(state);
  const buf = new Uint8Array(state.creeps.length * BYTES_PER_CREEP);
  const view = new DataView(buf.buffer);
  state.creeps.forEach((c, i) => {
    const o = i * BYTES_PER_CREEP;
    view.setUint16(o, c.id & 0xffff);
    buf[o + 2] = CREEP_TYPES.indexOf(c.type);
    buf[o + 3] = pathKeys.indexOf(c.path);
    view.setUint16(o + 4, Math.min(0xffff, Math.round(c.dist * 64)));
    buf[o + 6] = Math.max(1, Math.round((Math.max(0, c.hp) / c.maxHp) * 255));
    buf[o + 7] =
      (c.slow > 0 ? 1 : 0) | (c.shield > 0 ? 2 : 0) | (c.boss ? 4 : 0) | (c.flying ? 8 : 0);
    buf[o + 8] = 0;
  });
  return buf;
}

export interface UnpackedCreep {
  id: number;
  type: string;
  path: string;
  dist: number;
  hp: number;
  slowed: boolean;
  shielded: boolean;
  boss: boolean;
  flying: boolean;
}

export function unpackCreeps(buf: Uint8Array, pathKeys: string[]): UnpackedCreep[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: UnpackedCreep[] = [];
  for (let o = 0; o + BYTES_PER_CREEP <= buf.length; o += BYTES_PER_CREEP) {
    const flags = buf[o + 7]!;
    out.push({
      id: view.getUint16(o),
      type: CREEP_TYPES[buf[o + 2]!]!,
      path: pathKeys[buf[o + 3]!]!,
      dist: view.getUint16(o + 4) / 64,
      hp: buf[o + 6]! / 255,
      slowed: (flags & 1) !== 0,
      shielded: (flags & 2) !== 0,
      boss: (flags & 4) !== 0,
      flying: (flags & 8) !== 0,
    });
  }
  return out;
}

export function publicTowers(state: MatchState): PublicTower[] {
  return state.towers.map((t) => ({
    id: t.id,
    owner: t.owner,
    def: t.def,
    x: t.x,
    y: t.y,
    zone: t.zone,
    level: t.level,
    category: t.category,
    power: t.power,
    suit: t.suit,
    pure: t.pure,
    targeting: t.targeting,
    copyOf: t.copyOf,
    dmg: t.dmg,
    range: t.range,
    minRange: t.minRange,
    period: t.period,
    hitsAir: t.hitsAir,
    pierce: t.pierce,
    crit: t.crit,
    greed: t.greed,
    slow: t.slow,
    aura: t.aura,
    damageDealt: Math.round(t.damageDealt),
    kills: t.kills,
    invested: t.invested,
    upgradeCost: upgradeCost(t),
    sellValue: sellValue(state, t),
  }));
}

export function privateView(state: MatchState, id: PlayerId, detail = true): PrivateView {
  const p = state.players[id]!;
  let hand: PrivateView['hand'] = null;
  if (p.hand) {
    const ev = evaluatePlayerHand(p.hand.cards);
    hand = {
      cards: p.hand.cards,
      redrawsUsed: p.hand.redrawsUsed,
      category: ev.category,
      scoring: ev.scoring.map((i) => ev.used[i]!),
      used: ev.used,
      nextRedrawCost: redrawCost(p),
    };
  }
  return {
    gold: p.gold,
    hand,
    blueprints: p.blueprints,
    benchSlots: p.benchSlots,
    freeRedraws: p.freeRedraws,
    deck: deckCounts(p.deck),
    ...(detail ? { deckCards: [...p.deck.draw, ...p.deck.discard].sort((a, b) => a - b) } : {}),
    shopOffers: state.tick < state.shop.openUntil ? p.shopOffers : null,
    shopBought: p.shopBought,
    slipIncoming: p.slipIncoming,
    riverCards: p.riverCards,
    canSlip: state.settings.mode === 'coop' && p.slipWave !== state.wave.n && !!p.hand,
  };
}

/**
 * Builds the snapshot for one player (or a spectator, with `id` null).
 * Towers are included only when they changed since `knownTowersVersion`.
 * Slow-changing parts (stats, next-wave preview, deck list) are included
 * only when `detail` is set; clients keep the last copy.
 */
export function buildSnapshot(
  state: MatchState,
  id: PlayerId | null,
  knownTowersVersion = -1,
  detail = true,
  withPlayers = true,
): Snapshot {
  const incoming = new Map<PlayerId, number>();
  for (const p of playersInOrder(state)) {
    for (const r of p.raises) {
      const send = GAME_DATA.sends.find((s) => s.id === r.send)!;
      incoming.set(r.target, (incoming.get(r.target) ?? 0) + send.cost * r.count);
    }
  }
  const snap: Snapshot = {
    tick: state.tick,
    phase: state.phase,
    wave: {
      n: state.wave.n,
      nextAt: state.wave.nextAt,
      modifiers: state.wave.modifiers,
      final: state.wave.final,
      spawnsLeft: state.wave.spawns.length,
      ...(detail ? { next: state.wave.final ? null : wavePreview(state.wave.n + 1) } : {}),
    },
    lives: state.lives,
    pot: { ...state.pot },
    shopOpenUntil: state.shop.openUntil,
    pause: { ...state.pause, votes: [...state.pause.votes] },
    winner: state.winner,
    ...(withPlayers || detail ? { players: publicPlayers(state, incoming, detail) } : {}),
    towersVersion: state.towersVersion,
    creeps: packCreeps(state),
  };
  if (knownTowersVersion !== state.towersVersion) snap.towers = publicTowers(state);
  if (id && state.players[id]) snap.you = privateView(state, id, detail);
  return snap;
}

function publicPlayers(
  state: MatchState,
  incoming: Map<PlayerId, number>,
  detail: boolean,
): PublicPlayer[] {
  return playersInOrder(state).map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    lane: p.lane,
    gold: p.gold,
    lives: p.lives,
    busted: p.busted,
    research: [...p.research],
    researching: p.researching,
    income: p.income,
    incoming: incoming.get(p.id) ?? 0,
    holdingHand: !!p.hand,
    bench: p.blueprints.length,
    ...(detail ? { stats: p.stats } : {}),
  }));
}

/** Filters events for one viewer (a reshuffle is only news to its owner). */
export function eventsFor(events: GameEvent[], id: PlayerId | null): GameEvent[] {
  return events.filter((e) => e.kind !== 'reshuffle' || e.player === id);
}

/**
 * Turns a snapshot's full tower list into a delta against what this client
 * already has. `cache` (tower id → serialized tower) is per client and is
 * updated in place.
 */
export function deltaTowers(snap: Snapshot, cache: Map<number, string>, full: boolean): void {
  if (!snap.towers) return;
  if (full) {
    cache.clear();
    for (const t of snap.towers) cache.set(t.id, JSON.stringify(t));
    return;
  }
  const changed: PublicTower[] = [];
  const seen = new Set<number>();
  for (const t of snap.towers) {
    seen.add(t.id);
    const key = JSON.stringify(t);
    if (cache.get(t.id) !== key) {
      changed.push(t);
      cache.set(t.id, key);
    }
  }
  const removed = [...cache.keys()].filter((id) => !seen.has(id));
  for (const id of removed) cache.delete(id);
  delete snap.towers;
  snap.towerDelta = { changed, removed };
}

/** Client side: applies a snapshot's towers or tower delta to the current list. */
export function applyTowers(current: PublicTower[], snap: Snapshot): PublicTower[] {
  if (snap.towers) return snap.towers;
  if (!snap.towerDelta) return current;
  const { changed, removed } = snap.towerDelta;
  const byId = new Map(current.map((t) => [t.id, t]));
  for (const id of removed) byId.delete(id);
  for (const t of changed) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
