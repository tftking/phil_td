import type { DifficultyDef, EnemyDef, GameData } from '../data/types';

/**
 * Per-wave numbers from docs/MECHANICS.md §5 and §7. Pure functions of the
 * data so balance tools can chart them without running a match.
 */
export function creepHp(
  data: GameData,
  wave: number,
  enemy: EnemyDef,
  diff: DifficultyDef,
): number {
  const f = data.waves.formulas;
  return Math.round(f.baseHp * f.hpGrowth ** (wave - 1) * enemy.hp * diff.hpMult);
}

export function creepArmor(data: GameData, wave: number, enemy: EnemyDef): number {
  return Math.floor(wave / data.waves.formulas.armorEveryWaves) * enemy.armor;
}

export function creepSpeed(data: GameData, enemy: EnemyDef): number {
  return data.waves.formulas.baseSpeedTilesPerSecond * enemy.speed;
}

export function killBounty(data: GameData, wave: number, diff: DifficultyDef): number {
  const f = data.waves.formulas;
  return Math.round((f.bountyBase + Math.floor(wave / f.bountyEveryWaves)) * diff.bountyMult);
}

/** Creeps in a wave before each enemy type's count multiplier. */
export function baseWaveCount(data: GameData, wave: number): number {
  const f = data.waves.formulas;
  return f.baseCount + Math.floor(wave / 2) * f.countPerTwoWaves;
}

export function waveBonus(data: GameData, wave: number): number {
  const e = data.rules.economy;
  return e.waveBonusBase + e.waveBonusPerWave * wave;
}

export function interest(data: GameData, bankedGold: number): number {
  const e = data.rules.economy;
  return Math.min(e.interestCap, Math.floor(bankedGold * e.interestRate));
}

/** Damage after armor: a flat reduction, but never below minDamageFraction of the hit. */
export function applyArmor(data: GameData, damage: number, armor: number, pierce = 0): number {
  const effective = Math.max(0, armor - pierce);
  return Math.max(damage - effective, damage * data.waves.formulas.minDamageFraction);
}

/** Starting lives for a match. */
export function startingLives(diff: DifficultyDef, players: number): number {
  return diff.lives + diff.livesPerPlayer * players;
}
