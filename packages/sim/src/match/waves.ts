import { secondsToTicks } from '../core/time';
import { enemyDef, sendDef } from '../data/index';
import type { WaveDef, WaveModifierDef } from '../data/types';
import {
  baseWaveCount,
  creepArmor,
  creepHp,
  creepSpeed,
  interest,
  killBounty,
  waveBonus,
} from '../rules/formulas';
import { contextOf, data, laneOwner, nextId, nextOpponent, playersInOrder, rngOf } from './context';
import { recomputeTowers } from './towers';
import type { MatchState, SpawnEntry } from './types';

export const STANDARD_WAVES = 40;
/** "The House" has this much more HP than a regular boss of its wave. */
const FINAL_BOSS_HP = 1.25;

/** The schedule entry for a wave. Past wave 40 the 31–39 patterns repeat, with bosses every 10. */
export function waveDef(n: number): WaveDef {
  const schedule = data.waves.schedule;
  if (n <= schedule.length) return schedule[n - 1]!;
  if (n % 10 === 0)
    return { wave: n, mix: { boss: 1, brute: 3, shield: 3 }, tags: ['boss'], modifiers: 2 };
  const base = schedule[30 + ((n - 41) % 9)]!;
  return { ...base, wave: n, modifiers: 2 };
}

export const isBossWave = (n: number): boolean => (waveDef(n).tags ?? []).includes('boss');

export function modifierDef(id: string): WaveModifierDef {
  return data.waves.modifiers.find((m) => m.id === id)!;
}

function modifierProduct(
  ids: string[],
  key: 'countMult' | 'speedMult' | 'armorMult' | 'bountyMult' | 'waveBonusMult',
): number {
  return ids.reduce((acc, id) => acc * (modifierDef(id)[key] ?? 1), 1);
}

/** Creep counts per enemy type for a wave (deterministic, before modifiers). */
export function waveComposition(n: number, countMult = 1): { type: string; count: number }[] {
  const def = waveDef(n);
  const base = baseWaveCount(data, n) * countMult;
  const entries = Object.entries(def.mix);
  const normal = entries.filter(([id]) => !enemyDef(id).boss);
  const total = normal.reduce((s, [, w]) => s + w, 0);
  const out: { type: string; count: number }[] = [];
  for (const [id, w] of entries) {
    const e = enemyDef(id);
    const count = e.boss ? 1 : Math.max(1, Math.round((base * w * e.count) / total));
    out.push({ type: id, count });
  }
  return out;
}

export interface WavePreview {
  n: number;
  name?: string;
  tags: string[];
  composition: { type: string; count: number }[];
  modifiers: number;
}

export function wavePreview(n: number): WavePreview {
  const def = waveDef(n);
  return {
    n,
    ...(def.name ? { name: def.name } : {}),
    tags: def.tags ?? [],
    composition: waveComposition(n),
    modifiers: def.modifiers ?? 0,
  };
}

function waveSeconds(n: number): number {
  const t = data.waves.timing;
  return isBossWave(n) ? t.bossWaveSeconds : t.waveSeconds;
}

function spawnSeconds(n: number): number {
  const t = data.waves.timing;
  return t.spawnSecondsMin + (t.spawnSecondsMax - t.spawnSecondsMin) * Math.min(1, (n - 1) / 39);
}

/** Showdown sudden death: +10% HP per wave (compounding) after wave 25. */
function suddenDeath(state: MatchState, n: number): number {
  if (state.settings.mode !== 'showdown') return 1;
  const sd = data.rules.showdown;
  return n > sd.suddenDeathWave ? (1 + sd.suddenDeathHpGrowth) ** (n - sd.suddenDeathWave) : 1;
}

/**
 * Starts the next wave: rolls modifiers, pays wave bonus and interest (or
 * Showdown income), opens the shop on schedule and queues every spawn.
 */
export function startWave(state: MatchState): void {
  const { diff, map } = contextOf(state);
  const n = ++state.wave.n;
  const def = waveDef(n);
  const rng = rngOf(state, 'waves');

  // Modifiers.
  const pool = data.waves.modifiers.map((m) => m.id);
  const mods: string[] = [];
  for (let i = 0; i < (def.modifiers ?? 0) && pool.length; i++) {
    mods.push(pool.splice(rng.int(pool.length), 1)[0]!);
  }
  state.wave.modifiers = mods;
  recomputeTowers(state);

  // Payouts.
  const bonus = Math.round(waveBonus(data, n) * modifierProduct(mods, 'waveBonusMult'));
  for (const p of playersInOrder(state)) {
    if (p.busted) continue;
    const extra = state.settings.mode === 'coop' ? interest(data, p.gold) : p.income;
    p.gold += bonus + extra;
    p.stats.goldEarned += bonus + extra;
  }

  // Spawns: the same composition in every active lane, in a shuffled order.
  const countMult = modifierProduct(mods, 'countMult');
  const hpMult = (def.hpMult ?? 1) * (map.hpMult ?? 1) * suddenDeath(state, n);
  const bountyMult = (def.bountyMult ?? 1) * modifierProduct(mods, 'bountyMult');
  const speedMult = modifierProduct(mods, 'speedMult');
  const armorMult = modifierProduct(mods, 'armorMult');
  const finalBoss = (def.tags ?? []).includes('final');

  const order: string[] = [];
  for (const { type, count } of waveComposition(n, countMult)) {
    if (!enemyDef(type).boss) for (let i = 0; i < count; i++) order.push(type);
  }
  rng.shuffle(order);
  const bosses = waveComposition(n).filter((c) => enemyDef(c.type).boss);

  const start = state.tick;
  const window = secondsToTicks(spawnSeconds(n));
  const make = (
    type: string,
    at: number,
    lane: number,
    extraHp = 1,
    sender: string | null = null,
  ): SpawnEntry => {
    const e = enemyDef(type);
    return {
      at,
      lane,
      type,
      hp: Math.max(1, Math.round(creepHp(data, n, e, diff) * hpMult * extraHp)),
      armor: creepArmor(data, n, e) * armorMult,
      speed: creepSpeed(data, e) * speedMult,
      bounty: Math.round(killBounty(data, n, diff) * bountyMult * (e.boss ? 10 : 1)),
      sender,
      boss: !!e.boss,
    };
  };

  const spawns: SpawnEntry[] = [];
  for (const p of playersInOrder(state)) {
    if (p.busted) continue;
    order.forEach((type, i) => {
      spawns.push(make(type, start + Math.floor((i * window) / Math.max(1, order.length)), p.lane));
    });
    for (const b of bosses) {
      spawns.push(make(b.type, start + window, p.lane, finalBoss ? FINAL_BOSS_HP : 1));
    }
  }

  // Showdown raises land in their target's lane, spread over the window.
  if (state.settings.mode === 'showdown') {
    for (const p of playersInOrder(state)) {
      for (const r of p.raises) {
        let target = state.players[r.target];
        if (!target || target.busted) target = nextOpponent(state, p.id) ?? undefined;
        if (!target) continue;
        const send = sendDef(r.send)!;
        const units = send.count * r.count;
        for (let i = 0; i < units; i++) {
          const at = start + Math.floor(((i + 0.5) * window) / units);
          const sd = data.rules.showdown;
          const entry = make(send.enemy, at, target.lane, (send.hpMult ?? 1) * sd.sendHpMult, p.id);
          entry.bounty = Math.round(entry.bounty * sd.sendBountyMult);
          spawns.push(entry);
        }
      }
      p.raises = [];
    }
  }

  spawns.sort((a, b) => a.at - b.at || a.lane - b.lane);
  state.wave.spawns = spawns;

  const last = !state.settings.endless && state.settings.mode === 'coop' && n >= STANDARD_WAVES;
  state.wave.final = last;
  state.wave.nextAt = last ? Number.MAX_SAFE_INTEGER : start + secondsToTicks(waveSeconds(n));
  state.phase = 'playing';

  state.events.push({
    kind: 'waveStart',
    wave: n,
    modifiers: mods,
    boss: isBossWave(n),
    ...(def.name ? { name: def.name } : {}),
  });

  maybeOpenShop(state);
}

function maybeOpenShop(state: MatchState): void {
  const shop = data.rules.shop;
  const n = state.wave.n;
  if (n <= 1 || (n - 1) % shop.everyWaves !== 0) return;
  const rng = rngOf(state, 'shop');
  const open = secondsToTicks(shop.openSeconds);
  state.shop.openUntil = state.tick + open;
  for (const p of playersInOrder(state)) {
    if (p.busted) continue;
    const pool = shop.items
      .map((i) => i.id)
      .filter((id) => {
        if (id === 'joker') return countJokers(p) < data.rules.cards.maxJokers;
        if (id === 'bench_slot') return p.benchSlots < data.rules.cards.maxBenchSlots;
        return true;
      });
    const offers: string[] = [];
    while (offers.length < shop.offers && pool.length)
      offers.push(pool.splice(rng.int(pool.length), 1)[0]!);
    p.shopOffers = offers;
    p.shopBought = [];
  }
  // Solo: the shop pauses the wave timer.
  if (state.settings.players.length === 1 && !state.wave.final) state.wave.nextAt += open;
  state.events.push({ kind: 'shopOpen', until: state.shop.openUntil });
}

export function countJokers(p: MatchState['players'][string]): number {
  const all = [...p.deck.draw, ...p.deck.discard, ...(p.hand?.cards ?? [])];
  return all.filter((c) => c === 52).length;
}

/** Spawns every queued creep whose time has come. */
export function processSpawns(state: MatchState): void {
  const { layout } = contextOf(state);
  const q = state.wave.spawns;
  let i = 0;
  while (i < q.length && q[i]!.at <= state.tick) {
    const s = q[i]!;
    i++;
    const owner = laneOwner(state, s.lane);
    if (owner.busted) continue;
    const e = enemyDef(s.type);
    const lane = layout.lanes[s.lane]!;
    const path = e.flying ? lane.air : lane.ground;
    const [x, y] = path.points[0]!;
    const id = nextId(state);
    state.creeps.push({
      id,
      type: s.type,
      lane: s.lane,
      zone: s.lane,
      path: path.key,
      dist: 0,
      x,
      y,
      hp: s.hp,
      maxHp: s.hp,
      armor: s.armor,
      speed: s.speed,
      shield: e.shield ? s.hp * e.shield : 0,
      slow: 0,
      slowUntil: 0,
      regen: e.regenPerSecond ?? 0,
      bounty: s.bounty,
      leak: e.leak,
      flying: !!e.flying,
      boss: s.boss,
      wave: state.wave.n,
      sender: s.sender,
      lastHitBy: 0,
    });
    state.events.push({ kind: 'spawn', creep: id, boss: s.boss });
  }
  if (i > 0) q.splice(0, i);
}
