import { TICK_RATE, secondsToTicks } from '../core/time';
import { enemyDef } from '../data/index';
import { pointAtDistance } from '../map/geometry';
import { applyArmor, creepHp } from '../rules/formulas';
import { contextOf, data, laneOwner, nextId, rngOf } from './context';
import { effectiveDef } from './towers';
import type { Creep, MatchState, Tower } from './types';

const DT = 1 / TICK_RATE;

/** Moves creeps, applies regen and slow expiry, hands lane leaks to the center, and processes leaks. */
export function moveCreeps(state: MatchState): void {
  const { layout } = contextOf(state);
  const coop = state.settings.mode === 'coop';
  const keep: Creep[] = [];
  for (const c of state.creeps) {
    if (c.regen > 0 && c.hp > 0) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * c.regen * DT);
    if (c.slow > 0 && state.tick >= c.slowUntil) c.slow = 0;
    c.dist += c.speed * (1 - c.slow) * DT;

    let path = layout.paths.get(c.path)!;
    if (c.dist >= path.length) {
      const lane = layout.lanes[c.lane]!;
      if (coop && c.zone >= 0 && lane.center) {
        c.dist -= path.length;
        c.zone = -1;
        c.path = lane.center.key;
        path = lane.center;
      } else {
        leak(state, c);
        continue;
      }
    }
    const [x, y] = pointAtDistance(path, c.dist);
    c.x = x;
    c.y = y;
    keep.push(c);
  }
  state.creeps = keep;
}

function leak(state: MatchState, c: Creep): void {
  const owner = laneOwner(state, c.lane);
  owner.stats.leaks += c.leak;
  if (c.sender) state.players[c.sender]!.stats.leaksCaused += c.leak;
  if (state.settings.mode === 'coop') {
    state.lives = Math.max(0, state.lives - c.leak);
  } else {
    owner.lives = Math.max(0, owner.lives - c.leak);
  }
  state.events.push({ kind: 'leak', creep: c.id, lives: c.leak, lane: c.lane });
}

/** Distance to the vault, for "first"/"last" targeting. */
function remaining(state: MatchState, c: Creep): number {
  const { layout } = contextOf(state);
  const path = layout.paths.get(c.path)!;
  let rest = path.length - c.dist;
  if (c.zone >= 0) rest += layout.lanes[c.lane]!.center?.length ?? 0;
  return rest;
}

function inRange(t: Tower, c: Creep): boolean {
  if (c.flying && !t.hitsAir) return false;
  const d = Math.hypot(c.x - t.x, c.y - t.y);
  return d <= t.range && d >= t.minRange;
}

function pickTargets(state: MatchState, t: Tower, pool: Creep[], n: number): Creep[] {
  const candidates = pool.filter((c) => c.hp > 0 && inRange(t, c));
  if (candidates.length === 0) return [];
  const rest = new Map<number, number>();
  const r = (c: Creep): number => {
    let v = rest.get(c.id);
    if (v === undefined) rest.set(c.id, (v = remaining(state, c)));
    return v;
  };
  const byFirst = (a: Creep, b: Creep): number => r(a) - r(b) || a.id - b.id;
  const sorters: Record<string, (a: Creep, b: Creep) => number> = {
    first: byFirst,
    last: (a, b) => r(b) - r(a) || a.id - b.id,
    strongest: (a, b) => b.hp - a.hp || byFirst(a, b),
    weakest: (a, b) => a.hp - b.hp || byFirst(a, b),
    closest: (a, b) =>
      Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y) || byFirst(a, b),
    flying: (a, b) => Number(b.flying) - Number(a.flying) || byFirst(a, b),
  };
  candidates.sort(sorters[t.targeting] ?? byFirst);
  return candidates.slice(0, n);
}

/** Deals one hit. Returns the damage actually dealt. */
function hit(state: MatchState, t: Tower, c: Creep, raw: number, crit: boolean): number {
  let dmg = crit ? raw * (data.rules.suits[1]!.critMultiplier ?? 2) : raw;
  const def = effectiveDef(t);
  if (c.boss && def?.bossDamageBonus) dmg *= 1 + def.bossDamageBonus;
  if (c.shield > 0 && !crit) {
    const absorbed = Math.min(c.shield, dmg);
    c.shield -= absorbed;
    dmg -= absorbed;
    if (dmg <= 0) return 0;
  }
  dmg = applyArmor(data, dmg, c.armor, t.pierce);
  const dealt = Math.min(dmg, Math.max(0, c.hp));
  c.hp -= dmg;
  c.lastHitBy = t.id;
  t.damageDealt += dealt;
  state.players[t.owner]!.stats.damage += dealt;
  if (t.slow > 0 && (t.slow >= c.slow || state.tick >= c.slowUntil)) {
    c.slow = c.boss ? t.slow / 2 : t.slow;
    c.slowUntil = state.tick + secondsToTicks(data.rules.suits[3]!.durationSeconds ?? 1.5);
  }
  return dealt;
}

/** Runs every tower's attack for this tick. */
export function runTowers(state: MatchState): void {
  if (state.creeps.length === 0) {
    for (const t of state.towers) if (t.cooldown > 0) t.cooldown--;
    return;
  }
  const zones = new Map<number, Creep[]>();
  for (const c of state.creeps) {
    let list = zones.get(c.zone);
    if (!list) zones.set(c.zone, (list = []));
    list.push(c);
  }
  const combat = rngOf(state, 'combat');

  for (const t of state.towers) {
    const def = effectiveDef(t);
    if (!def || t.period === 0) continue;
    const pool = zones.get(t.zone);

    if (def.beam) {
      runBeam(state, t, pool ?? [], def.beam);
      continue;
    }
    if (t.cooldown > 0) t.cooldown--;
    if (t.cooldown > 0 || !pool) continue;

    const primary = pickTargets(state, t, pool, def.targets ?? 1);
    if (primary.length === 0) continue;
    t.cooldown = t.period;
    const crit = t.crit > 0 && combat.chance(t.crit);
    const hitIds: number[] = [];

    if (def.chain) {
      let current = primary[0]!;
      let dmg = t.dmg;
      const done = new Set<number>();
      for (let b = 0; b <= def.chain.bounces; b++) {
        hit(state, t, current, dmg, crit);
        done.add(current.id);
        hitIds.push(current.id);
        dmg *= 1 - def.chain.falloff;
        let next: Creep | null = null;
        let best = def.chain.radius;
        for (const c of pool) {
          if (done.has(c.id) || c.hp <= 0 || (c.flying && !t.hitsAir)) continue;
          const d = Math.hypot(c.x - current.x, c.y - current.y);
          if (d <= best) {
            best = d;
            next = c;
          }
        }
        if (!next) break;
        current = next;
      }
    } else if (def.splash) {
      const center = primary[0]!;
      for (const c of pool) {
        if (c.hp <= 0 || (c.flying && !t.hitsAir)) continue;
        if (Math.hypot(c.x - center.x, c.y - center.y) <= def.splash) {
          hit(state, t, c, t.dmg, crit);
          hitIds.push(c.id);
        }
      }
    } else {
      for (const c of primary) {
        hit(state, t, c, t.dmg, crit);
        hitIds.push(c.id);
      }
    }
    state.events.push({ kind: 'attack', tower: t.id, targets: hitIds, crit });
  }
}

function runBeam(
  state: MatchState,
  t: Tower,
  pool: Creep[],
  beam: { minDps: number; maxDps: number; rampSeconds: number },
): void {
  let target = pool.find((c) => c.id === t.beamTarget && c.hp > 0 && inRange(t, c));
  if (!target) {
    target = pickTargets(state, t, pool, 1)[0];
    t.beamTarget = target?.id ?? 0;
    t.beamTicks = 0;
    if (!target) return;
  }
  const ramp = Math.min(1, t.beamTicks / secondsToTicks(beam.rampSeconds));
  const dps = (beam.minDps + (beam.maxDps - beam.minDps) * ramp) * t.dmg;
  hit(state, t, target, dps * DT, false);
  t.beamTicks++;
  if (t.beamTicks % 5 === 1)
    state.events.push({ kind: 'beam', tower: t.id, target: target.id, dps });
}

/** Removes dead creeps, pays bounties, and splits Splitters. */
export function processDeaths(state: MatchState): void {
  if (!state.creeps.some((c) => c.hp <= 0)) return;
  const { diff } = contextOf(state);
  const towersById = new Map(state.towers.map((t) => [t.id, t]));
  const alive: Creep[] = [];
  const born: Creep[] = [];
  for (const c of state.creeps) {
    if (c.hp > 0) {
      alive.push(c);
      continue;
    }
    const killer = towersById.get(c.lastHitBy);
    const player = killer ? state.players[killer.owner]! : laneOwner(state, c.lane);
    const bounty = c.bounty + (killer?.greed ?? 0);
    player.gold += bounty;
    player.stats.goldEarned += bounty;
    player.stats.kills++;
    if (killer) killer.kills++;
    state.events.push({ kind: 'death', creep: c.id, x: c.x, y: c.y, bounty, to: player.id });

    const split = enemyDef(c.type).splitInto;
    if (split) {
      const child = enemyDef(split.enemy);
      const ids: number[] = [];
      for (let i = 0; i < split.count; i++) {
        const hp = creepHp(data, c.wave, child, diff);
        const id = nextId(state);
        ids.push(id);
        born.push({
          ...c,
          id,
          type: child.id,
          dist: Math.max(0, c.dist - i * 0.3),
          hp,
          maxHp: hp,
          armor: 0,
          speed: c.speed * (child.speed / enemyDef(c.type).speed),
          shield: 0,
          regen: 0,
          bounty: Math.max(1, Math.round(c.bounty / 3)),
          leak: child.leak,
          flying: false,
          boss: false,
          lastHitBy: 0,
        });
      }
      state.events.push({ kind: 'split', creep: c.id, into: ids });
    }
  }
  state.creeps = alive.concat(born);
}
