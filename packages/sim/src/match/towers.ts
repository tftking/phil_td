import { TICK_RATE } from '../core/time';
import { towerDef } from '../data/index';
import type { TowerDef } from '../data/types';
import { tileKey } from '../map/geometry';
import { contextOf, data } from './context';
import type { MatchState, Tower } from './types';

/** Rough single-target DPS of a def at a power, used to pick what a Jester copies. */
export function referenceDps(def: TowerDef, power: number): number {
  if (def.beam) return def.beam.maxDps * power;
  return def.damage * def.attacksPerSecond * power * (def.targets ?? 1);
}

/** The def a tower actually fights as (a Jester fights as whatever it copies). */
export function effectiveDef(t: Tower): TowerDef | null {
  if (t.def !== 'jester') return towerDef(t.def);
  return t.copyOf ? towerDef(t.copyOf) : null;
}

/**
 * Refreshes every tower's derived stats: Jester copies, Crown auras, level,
 * hot tiles, research and wave modifiers. Called whenever any input changes.
 */
export function recomputeTowers(state: MatchState): void {
  const { layout } = contextOf(state);
  const rules = data.rules;
  const byTile = new Map(state.towers.map((t) => [tileKey(t.x, t.y), t]));
  const fog = state.wave.modifiers
    .map((id) => data.waves.modifiers.find((m) => m.id === id)?.towerRangeDelta ?? 0)
    .reduce((a, b) => a + b, 0);

  // Jesters copy the strongest adjacent non-Jester tower.
  for (const t of state.towers) {
    if (t.def !== 'jester') continue;
    let best: Tower | null = null;
    let bestDps = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = byTile.get(tileKey(t.x + dx, t.y + dy));
        if (!n || n === t || n.def === 'jester') continue;
        const dps = referenceDps(towerDef(n.def), n.power);
        if (dps > bestDps) {
          bestDps = dps;
          best = n;
        }
      }
    }
    t.copyOf = best ? best.def : null;
    if (best) {
      t.suit = best.suit;
      t.pure = best.pure;
    }
  }

  // Crown auras (non-stacking: the best aura in range applies).
  for (const t of state.towers) t.aura = 0;
  for (const c of state.towers) {
    const def = effectiveDef(c);
    if (!def?.aura) continue;
    for (const t of state.towers) {
      if (t === c) continue;
      if (Math.hypot(t.x - c.x, t.y - c.y) <= def.aura.radius) {
        t.aura = Math.max(t.aura, def.aura.damageBonus);
      }
    }
  }

  for (const t of state.towers) {
    const def = effectiveDef(t);
    const owner = state.players[t.owner]!;
    if (!def) {
      t.dmg = 0;
      t.range = 0;
      t.period = 0;
      continue;
    }
    const copyMult = t.def === 'jester' ? (towerDef('jester').copy?.powerMultiplier ?? 1) : 1;
    const hot = layout.hot.get(tileKey(t.x, t.y));
    const levelDmg = 1 + rules.towers.damagePerLevel * (t.level - 1);
    const levelRange = 1 + rules.towers.rangePerLevel * (t.level - 1);
    const hotDmg = hot?.bonus === 'damage' ? hot.amount : 0;
    const hotRange = hot?.bonus === 'range' ? hot.amount : 0;
    // A Jester fights at the copied tower's power × its multiplier.
    const source = t.def === 'jester' ? copiedPower(state, t) : t.power;
    const mult = source * copyMult * levelDmg * (1 + t.aura) * (1 + hotDmg);

    t.dmg = def.beam ? mult : def.damage * mult;
    t.range = Math.max(1, def.range * (levelRange + hotRange) + fog);
    t.minRange = def.minRange ?? 0;
    t.period = def.beam ? 1 : Math.max(1, Math.round(TICK_RATE / def.attacksPerSecond));
    t.hitsAir = def.hitsAir;

    const lvl = owner.research[t.suit];
    const suitDef = rules.suits[t.suit]!;
    const amount = (suitDef.base + suitDef.perLevel * lvl) * (t.pure ? 2 : 1);
    t.pierce = t.suit === 0 ? amount : 0;
    t.crit = t.suit === 1 ? Math.min(0.9, amount) : 0;
    t.greed =
      t.suit === 2 ? Math.min((suitDef.max ?? Infinity) * (t.pure ? 2 : 1), Math.round(amount)) : 0;
    t.slow = t.suit === 3 ? Math.min(0.7, amount) : 0;
  }
  state.towersVersion++;
}

function copiedPower(state: MatchState, jester: Tower): number {
  let best = 0;
  for (const t of state.towers) {
    if (t === jester || t.def === 'jester' || t.def !== jester.copyOf) continue;
    if (Math.abs(t.x - jester.x) <= 1 && Math.abs(t.y - jester.y) <= 1)
      best = Math.max(best, t.power);
  }
  return best;
}
